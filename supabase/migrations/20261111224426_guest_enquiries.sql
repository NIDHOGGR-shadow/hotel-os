-- Website enquiries are pending requests, not room/table/event confirmations.
-- Existing in-stay guest_requests and their policies remain unchanged.
create table public.guest_enquiries (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  request_key uuid not null,
  reference text not null default ('HREQ-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,16))),
  kind text not null check (kind in ('general','dining','event','service')),
  topic text not null check (length(topic) between 1 and 120),
  guest_name text not null check (length(guest_name) between 2 and 100),
  guest_email text not null check (length(guest_email) <= 254 and guest_email = lower(btrim(guest_email))
    and guest_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  guest_phone text not null default '' check (guest_phone = '' or guest_phone ~ '^[+0-9 ()-]{7,25}$'),
  preferred_date date,
  preferred_time time without time zone,
  party_size integer check (party_size between 1 and 5000),
  detail text not null check (length(detail) between 5 and 2000),
  status text not null default 'open' check (status in ('open','in_progress','resolved','cancelled')),
  staff_note text not null default '' check (length(staff_note) <= 2000),
  submission_fingerprint text not null,
  handled_by uuid references auth.users(id) on delete set null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id,request_key),
  unique (property_id,reference)
);
create index guest_enquiries_property_created on public.guest_enquiries(property_id,created_at desc);
create index guest_enquiries_property_kind on public.guest_enquiries(property_id,kind,topic);
alter table public.guest_enquiries enable row level security;
revoke all on public.guest_enquiries from public,anon,authenticated;
grant select on public.guest_enquiries to authenticated;
grant select,insert on public.guest_enquiries to service_role;
create policy staff_view_guest_enquiries on public.guest_enquiries for select to authenticated using (
  public.has_staff_role(property_id,array['owner','manager','front_desk'])
  or (kind='dining' and public.has_staff_role(property_id,array['restaurant']))
  or (kind='service' and topic='room_service' and public.has_staff_role(property_id,array['restaurant']))
  or (kind='service' and topic in ('housekeeping','laundry')
      and public.has_staff_role(property_id,array['housekeeping']))
);

-- Short-lived opaque hashes only: no raw client IP or email in rate counters.
create table hotel_private.enquiry_rate_limits (
  property_id uuid not null references public.properties(id),
  scope text not null check (scope in ('ip','email')),
  subject_key text not null check (subject_key ~ '^[a-f0-9]{64}$'),
  bucket_start timestamptz not null,
  hits integer not null check (hits > 0),
  primary key(property_id,scope,subject_key)
);
alter table hotel_private.enquiry_rate_limits enable row level security;
revoke all on hotel_private.enquiry_rate_limits from public,anon,authenticated;
grant usage on schema hotel_private to service_role;
grant select,insert,update on hotel_private.enquiry_rate_limits to service_role;

-- Invoker function: only the trusted Vercel server role can call this intake.
create function public.hotel_submit_enquiry(
  p_property uuid,p_request_key uuid,p_payload jsonb,p_rate_key text,p_email_key text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_existing public.guest_enquiries%rowtype;
  v_record public.guest_enquiries%rowtype;
  v_kind text := p_payload->>'kind';
  v_topic text := p_payload->>'topic';
  v_date date := (p_payload->>'preferredDate')::date;
  v_time time := (p_payload->>'preferredTime')::time;
  v_party integer := (p_payload->>'partySize')::integer;
  v_timezone text;
  v_today date;
  v_fingerprint text := pg_catalog.md5(p_payload::text);
  v_bucket timestamptz := pg_catalog.date_trunc('hour',now());
  v_limit record;
  v_hits integer;
begin
  if p_property is null or p_request_key is null or p_payload is null
     or pg_catalog.jsonb_typeof(p_payload)<>'object'
     or p_rate_key is null or p_rate_key !~ '^[a-f0-9]{64}$'
     or p_email_key is null or p_email_key !~ '^[a-f0-9]{64}$'
     or v_kind is null or v_kind not in ('general','dining','event','service')
     or v_topic is null or length(v_topic) not between 1 and 120 then
    raise exception 'Invalid enquiry' using errcode='22023';
  end if;
  select timezone into v_timezone from public.properties where id=p_property;
  if not found then raise exception 'Property unavailable' using errcode='22023'; end if;
  v_today := (now() at time zone v_timezone)::date;
  if v_date is not null and (v_date<v_today or v_date>v_today+730) then
    raise exception 'Choose a date within the next two years' using errcode='22023';
  end if;
  if v_kind='dining' and (v_date is null or v_time is null or v_party is null or v_party>50) then
    raise exception 'Dining request needs a date, time and party size up to 50' using errcode='22023';
  end if;
  if v_kind='event' and (v_date is null or v_party is null) then
    raise exception 'Event request needs a date and party size' using errcode='22023';
  end if;
  if v_kind='dining' or (v_kind='service' and v_topic='room_service') then
    if not exists(select 1 from public.property_features where property_id=p_property
      and feature='restaurant' and enabled) then
      raise exception 'Dining enquiries are currently unavailable' using errcode='22023';
    end if;
  end if;
  if v_kind='service' and v_topic in ('housekeeping','laundry') then
    if not exists(select 1 from public.property_features where property_id=p_property
      and feature='housekeeping' and enabled) then
      raise exception 'This service is currently unavailable' using errcode='22023';
    end if;
  end if;

  -- Serialize retries before counting quota or creating a second record.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hotel:enquiry:'||p_property::text||':'||p_request_key::text,0));
  select * into v_existing from public.guest_enquiries
    where property_id=p_property and request_key=p_request_key;
  if found then
    if v_existing.submission_fingerprint<>v_fingerprint then
      raise exception 'Request details changed; start a new request' using errcode='22023';
    end if;
    return pg_catalog.jsonb_build_object('reference',v_existing.reference,'recorded',true,'status','received');
  end if;

  for v_limit in select * from (values ('ip',p_rate_key,40),('email',p_email_key,5))
    as limits(scope,subject_key,ceiling)
  loop
    insert into hotel_private.enquiry_rate_limits as quota(property_id,scope,subject_key,bucket_start,hits)
      values(p_property,v_limit.scope,v_limit.subject_key,v_bucket,1)
    on conflict(property_id,scope,subject_key)
      do update set
        hits=case when quota.bucket_start<excluded.bucket_start then 1 else quota.hits+1 end,
        bucket_start=case when quota.bucket_start<excluded.bucket_start then excluded.bucket_start else quota.bucket_start end
      where quota.bucket_start<excluded.bucket_start or quota.hits<v_limit.ceiling
    returning hits into v_hits;
    if not found then raise exception 'Too many enquiries' using errcode='P0001'; end if;
  end loop;

  insert into public.guest_enquiries(property_id,request_key,kind,topic,guest_name,
    guest_email,guest_phone,preferred_date,preferred_time,party_size,detail,submission_fingerprint)
  values(p_property,p_request_key,v_kind,v_topic,p_payload->>'guestName',p_payload->>'email',
    coalesce(p_payload->>'phone',''),v_date,v_time,v_party,p_payload->>'detail',v_fingerprint)
  returning * into v_record;
  return pg_catalog.jsonb_build_object('reference',v_record.reference,'recorded',true,'status','received');
end $$;
revoke all on function public.hotel_submit_enquiry(uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.hotel_submit_enquiry(uuid,uuid,jsonb,text,text) to service_role;

-- Staff can update only enquiries permitted by their current database role.
create function public.hotel_update_enquiry(
  p_property uuid,p_enquiry uuid,p_status text,p_note text,p_version integer
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := auth.uid();
  v_record public.guest_enquiries%rowtype;
begin
  if v_actor is null then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_status is null or p_status not in ('open','in_progress','resolved','cancelled')
     or p_note is null or length(p_note)>2000 or p_version is null or p_version<1 then
    raise exception 'Invalid enquiry update' using errcode='22023';
  end if;
  select * into v_record from public.guest_enquiries e
    where e.id=p_enquiry and e.property_id=p_property and (
      public.has_staff_role(e.property_id,array['owner','manager','front_desk'])
      or (e.kind='dining' and public.has_staff_role(e.property_id,array['restaurant']))
      or (e.kind='service' and e.topic='room_service' and public.has_staff_role(e.property_id,array['restaurant']))
      or (e.kind='service' and e.topic in ('housekeeping','laundry')
          and public.has_staff_role(e.property_id,array['housekeeping']))
    ) for update;
  if not found then raise exception 'Forbidden' using errcode='42501'; end if;
  if v_record.version<>p_version then
    raise exception 'This enquiry changed. Refresh before saving.' using errcode='40001';
  end if;
  if v_record.status=p_status and v_record.staff_note=p_note then return v_record.id; end if;
  update public.guest_enquiries set status=p_status,staff_note=p_note,handled_by=v_actor,
    updated_at=now(),version=version+1 where id=v_record.id;
  insert into public.audit_events(property_id,actor_user_id,action,entity_type,entity_id,details)
    values(p_property,v_actor,'guest_enquiry.updated','guest_enquiry',v_record.id,
      pg_catalog.jsonb_build_object('from',v_record.status,'to',p_status));
  return v_record.id;
end $$;
revoke all on function public.hotel_update_enquiry(uuid,uuid,text,text,integer) from public,anon;
grant execute on function public.hotel_update_enquiry(uuid,uuid,text,text,integer) to authenticated;
