-- Hotel OS public room checkout; apply after the base schema and operations migrations.
-- This migration is not applied by pushing to GitHub. Apply it in the dedicated Hotel OS Supabase project.
-- Online checkout remains disabled until HOTEL_PROPERTY_ID and the required server credentials are configured.
alter table public.reservations drop constraint if exists reservations_status_check;
alter table public.reservations add constraint reservations_status_check
  check (status in ('inquiry','payment_pending','confirmed','checked_in','checked_out','cancelled','no_show'));
alter table public.reservations drop constraint if exists no_overlapping_room_stays;
alter table public.reservations add constraint no_overlapping_room_stays
  exclude using gist (room_id with =, daterange(check_in,check_out,'[)') with &&)
  where (status in ('payment_pending','confirmed','checked_in'));

create table if not exists public.hotel_checkout_sessions (
  reference text primary key check(reference ~ '^[A-Za-z0-9.=-]{1,120}$'),
  property_id uuid not null references public.properties(id),
  reservation_id uuid not null unique references public.reservations(id),
  amount_minor bigint not null check(amount_minor > 0),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending'
    check(status in ('pending','initialized','verified','failed','expired','manual_review')),
  expires_at timestamptz not null default (now() + interval '60 minutes'),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists hotel_checkout_pending_expiration on public.hotel_checkout_sessions(expires_at)
  where status in ('pending','initialized');
alter table public.hotel_checkout_sessions enable row level security;
revoke all on table public.hotel_checkout_sessions from anon,authenticated;

-- Catalog exposes only actively offered room categories with prices and actual available room counts.
-- It never returns guest details or room numbers.
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
revoke all on function public.hotel_public_availability(uuid,date,date,integer) from public,anon,authenticated;
grant execute on function public.hotel_public_availability(uuid,date,date,integer) to service_role;

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

  -- Release only expired unpaid reservations. A late payment is never silently assigned a room.
  update public.reservations r set status='cancelled',updated_at=now()
   from public.hotel_checkout_sessions s
   where s.reservation_id=r.id and s.status in ('pending','initialized')
     and s.expires_at<now() and r.status='payment_pending';
  update public.hotel_checkout_sessions s set status='expired'
    where s.status in ('pending','initialized') and s.expires_at<now();

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
revoke all on function public.hotel_create_checkout(uuid,uuid,date,date,integer,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.hotel_create_checkout(uuid,uuid,date,date,integer,text,text,text,text)
  to service_role;

create or replace function public.hotel_abort_checkout(p_reference text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_res uuid;
begin
  update public.hotel_checkout_sessions set status='failed'
   where reference=p_reference and status='pending' returning reservation_id into v_res;
  if v_res is null then return false;end if;
  update public.reservations set status='cancelled',updated_at=now()
   where id=v_res and status='payment_pending';
  return true;
end $$;
revoke all on function public.hotel_abort_checkout(text) from public,anon,authenticated;
grant execute on function public.hotel_abort_checkout(text) to service_role;

-- Called exclusively AFTER the server independently verifies the Paystack transaction,
-- amount, reference, currency, and live/test environment.
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
revoke all on function public.hotel_complete_checkout(text,bigint,text) from public,anon,authenticated;
grant execute on function public.hotel_complete_checkout(text,bigint,text) to service_role;
