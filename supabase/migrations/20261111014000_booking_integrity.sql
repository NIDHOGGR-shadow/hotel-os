-- HOTEL booking integrity hardening. Apply AFTER 20261111013000_public_booking.sql.
-- This file is NOT automatically applied when pushed to GitHub. Review first.
-- Availability, staff allocation and new checkouts clear expired unpaid holds.
-- For cleanup without traffic, schedule hotel_expire_checkout_holds via an authenticated job.
-- Expiration locks checkout session first, matching hotel_complete_checkout lock order.
create or replace function public.hotel_expire_checkout_holds(
  p_property uuid default null, p_batch integer default 100
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_session record;v_processed integer:=0;
begin
  if p_batch is null or p_batch<1 or p_batch>500 then
    raise exception 'Invalid expiration batch size' using errcode='22023';
  end if;
  for v_session in
    select s.reference,s.reservation_id
    from public.hotel_checkout_sessions s
    where (p_property is null or s.property_id=p_property)
      and s.status in ('pending','initialized') and s.expires_at<=now()
    order by s.expires_at
    limit p_batch
    for update of s skip locked
  loop
    update public.reservations r set status='cancelled',updated_at=now()
      where r.id=v_session.reservation_id and r.status='payment_pending';
    update public.hotel_checkout_sessions s set status='expired'
      where s.reference=v_session.reference and s.status in ('pending','initialized');
    v_processed:=v_processed+1;
  end loop;
  return v_processed;
end $$;
revoke all on function public.hotel_expire_checkout_holds(uuid,integer) from public,anon,authenticated;
grant execute on function public.hotel_expire_checkout_holds(uuid,integer) to service_role;

create or replace function public.hotel_public_availability(
  p_property uuid,p_check_in date,p_check_out date,p_guests integer
) returns table(id uuid,name text,capacity integer,nightly_rate_minor bigint,available_rooms bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if p_check_in is null or p_check_out is null or p_check_in < current_date
    or p_check_out <= p_check_in or p_check_out > p_check_in+30
    or p_guests < 1 or p_guests > 30 then
    raise exception 'Invalid stay dates or guests' using errcode='22023';
  end if;
  perform public.hotel_expire_checkout_holds(p_property,100);
  return query
  select t.id,t.name,t.capacity,t.nightly_rate_minor,
    count(r.id)::bigint as available_rooms
  from public.room_types t
  left join public.rooms r on r.property_id=t.property_id
    and r.room_type_id=t.id and r.active=true and r.condition='ready'
    and not exists(
      select 1 from public.reservations b
      where b.room_id=r.id and b.status in ('payment_pending','confirmed','checked_in')
        and b.check_in < p_check_out and b.check_out > p_check_in
    )
  where t.property_id=p_property and t.active=true and t.nightly_rate_minor>0 and t.capacity>=p_guests
  group by t.id,t.name,t.capacity,t.nightly_rate_minor
  order by t.nightly_rate_minor,t.name;
end $$;

create or replace function public.hotel_create_checkout(
  p_property uuid,p_room_type uuid,p_check_in date,p_check_out date,
  p_guests integer,p_name text,p_email text,p_phone text,p_reference text
) returns table(reference text,amount_minor bigint,currency text)
language plpgsql security definer set search_path = '' as $$
declare
  v_rate bigint; v_capacity integer; v_currency text;
  v_room uuid;v_guest uuid;v_reservation uuid;v_amount bigint;
begin
  if p_property is null or p_room_type is null or p_check_in is null or p_check_out is null
    or p_check_in < current_date or p_check_out <= p_check_in
    or p_check_out > p_check_in + 30 or p_guests<1 or p_guests>8
    or p_name is null or length(btrim(p_name)) not between 2 and 140
    or p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or p_reference !~ '^hotel-[a-f0-9-]{36}$'
    or length(coalesce(p_phone,''))>25 then
    raise exception 'Invalid checkout input' using errcode='22023';
  end if;
  select p.currency into v_currency from public.properties p where p.id=p_property;
  if v_currency is distinct from 'NGN' then raise exception 'Unsupported property currency' using errcode='22023'; end if;
  select t.nightly_rate_minor,t.capacity into v_rate,v_capacity from public.room_types t
   where t.id=p_room_type and t.property_id=p_property and t.active=true;
  if v_rate is null or v_rate<=0 or p_guests>v_capacity then
    raise exception 'Room type unavailable' using errcode='22023';
  end if;

  -- Release expired unpaid holds using the same lock order as the payment webhook.
  perform public.hotel_expire_checkout_holds(p_property,250);

  select r.id into v_room from public.rooms r
   where r.property_id=p_property and r.room_type_id=p_room_type
     and r.active=true and r.condition='ready'
     and not exists(
      select 1 from public.reservations b
       where b.room_id=r.id and b.status in ('payment_pending','confirmed','checked_in')
         and b.check_in<p_check_out and b.check_out>p_check_in
     )
   order by r.room_number
   for update of r skip locked
   limit 1;
  if v_room is null then
    raise exception 'No available room for these dates' using errcode='P0001';
  end if;
  v_amount:=v_rate*(p_check_out-p_check_in);
  if v_amount<=0 or v_amount>100000000000 then
    raise exception 'Invalid room charge' using errcode='22023';
  end if;
  insert into public.guests(property_id,full_name,email,phone)
    values(p_property,btrim(p_name),lower(btrim(p_email)),nullif(btrim(coalesce(p_phone,'')),''))
    returning id into v_guest;
  insert into public.reservations(
    property_id,guest_id,room_type_id,room_id,check_in,check_out,status,
    nightly_rate_minor,total_minor,currency,request_key
  ) values(
    p_property,v_guest,p_room_type,v_room,p_check_in,p_check_out,'payment_pending',
    v_rate,v_amount,v_currency,gen_random_uuid()
  ) returning id into v_reservation;
  insert into public.hotel_checkout_sessions(reference,property_id,reservation_id,amount_minor,currency)
    values(p_reference,p_property,v_reservation,v_amount,v_currency);
  return query select p_reference,v_amount,v_currency;
end $$;

create or replace function public.create_room_reservation(p_property uuid,p_guest uuid,p_room_type uuid,p_check_in date,p_check_out date,p_request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_room uuid;v_rate bigint;v_currency text;v_folio uuid;v_days int;
begin
 if not public.has_staff_role(p_property,array['owner','manager','front_desk']) then raise exception 'Forbidden' using errcode='42501';end if;
 if not exists(select 1 from public.property_features where property_id=p_property and feature='reservations' and enabled) then raise exception 'Reservations disabled';end if;
 if p_request_key is null then raise exception 'Request key required';end if;
 if p_check_in is null or p_check_out is null or p_check_in<current_date or p_check_out<=p_check_in or p_check_out-p_check_in>365 then raise exception 'Invalid stay dates';end if;
 perform public.hotel_expire_checkout_holds(p_property,250);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_property::text||':'||p_room_type::text,0));
 select id into v_id from public.reservations where property_id=p_property and request_key=p_request_key;
 if v_id is not null then return v_id;end if;
 if not exists(select 1 from public.guests where property_id=p_property and id=p_guest) then raise exception 'Guest not found';end if;
 select nightly_rate_minor into v_rate from public.room_types where property_id=p_property and id=p_room_type and active;
 if not found then raise exception 'Room type not found';end if;
 select id into v_room from public.rooms r where r.property_id=p_property and r.room_type_id=p_room_type
 and r.active and r.condition='ready'
 and not exists(select 1 from public.reservations x where x.property_id=p_property and x.room_id=r.id
 and x.status in ('payment_pending','confirmed','checked_in') and daterange(x.check_in,x.check_out,'[)') && daterange(p_check_in,p_check_out,'[)'))
 order by r.room_number limit 1 for update of r skip locked;
 if v_room is null then raise exception 'No available room for these dates' using errcode='P0001';end if;
 select currency into v_currency from public.properties where id=p_property;
 v_days:=p_check_out-p_check_in;
 insert into public.reservations(property_id,guest_id,room_type_id,room_id,check_in,check_out,status,nightly_rate_minor,total_minor,currency,request_key,created_by)
 values(p_property,p_guest,p_room_type,v_room,p_check_in,p_check_out,'confirmed',v_rate,v_rate*v_days,v_currency,p_request_key,auth.uid())
 returning id into v_id;
 insert into public.folios(property_id,reservation_id) values(p_property,v_id) returning id into v_folio;
 insert into public.folio_entries(property_id,folio_id,kind,amount_minor,description,source_id)
 values(p_property,v_folio,'room_charge',v_rate*v_days,'Accommodation',v_id);
 insert into public.audit_events(property_id,actor_user_id,action,entity_type,entity_id)
 values(p_property,auth.uid(),'reservation.confirmed','reservation',v_id);
 return v_id;
end;
$$;

create or replace function public.hotel_complete_checkout(
  p_reference text,p_amount_minor bigint,p_currency text
) returns text language plpgsql security definer set search_path='' as $$
declare v_session public.hotel_checkout_sessions%rowtype; v_folio uuid;v_transaction uuid;
begin
  select * into v_session from public.hotel_checkout_sessions where reference=p_reference for update;
  if not found then return 'unknown';end if;
  if v_session.amount_minor<>p_amount_minor or v_session.currency<>p_currency then
    raise exception 'Payment amount does not match reservation' using errcode='22023';
  end if;
  if v_session.status='verified' then return 'confirmed';end if;
  if v_session.status in ('expired','failed','manual_review') or now()>v_session.expires_at then
    update public.hotel_checkout_sessions set status='manual_review' where reference=p_reference;
    -- A late verified payment must not leave a room blocked forever.
    update public.reservations set status='cancelled',updated_at=now()
      where id=v_session.reservation_id and status='payment_pending';
    return 'manual_review';
  end if;
  update public.reservations set status='confirmed',updated_at=now()
   where id=v_session.reservation_id and status='payment_pending';
  if not found then
    update public.hotel_checkout_sessions set status='manual_review' where reference=p_reference;
    return 'manual_review';
  end if;
  insert into public.folios(property_id,reservation_id)
   values(v_session.property_id,v_session.reservation_id)
   on conflict(property_id,reservation_id) do update set reservation_id=excluded.reservation_id
   returning id into v_folio;
  -- Charge and payment are distinct folio entries; source_id uniquely deduplicates retries.
  insert into public.folio_entries(property_id,folio_id,kind,amount_minor,description,source_id)
    values(v_session.property_id,v_folio,'room_charge',v_session.amount_minor,'Accommodation',v_session.reservation_id)
    on conflict do nothing;
  insert into public.payment_transactions(
    property_id,folio_id,provider,provider_reference,amount_minor,currency,status,verified_at
  ) values(v_session.property_id,v_folio,'paystack',p_reference,p_amount_minor,p_currency,'verified',now())
    on conflict(provider,provider_reference) do update set status='verified',
      verified_at=excluded.verified_at
    returning id into v_transaction;
  insert into public.folio_entries(property_id,folio_id,kind,amount_minor,description,source_id)
    values(v_session.property_id,v_folio,'payment',p_amount_minor,'Paystack room payment',v_transaction)
    on conflict do nothing;
  update public.hotel_checkout_sessions set status='verified',paid_at=now()
    where reference=p_reference;
  return 'confirmed';
end $$;
