-- Restricted first-owner claim: Supabase Auth must verify the approved email.
-- No owner email, password, bearer token, or API key is stored in this migration.
-- Invite rows are inserted separately by a trusted database administrator.
create schema if not exists hotel_private;
revoke all on schema hotel_private from public,anon,authenticated;

create table if not exists hotel_private.owner_invites (
  property_id uuid primary key references public.properties(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 254),
  claimed_by uuid references auth.users(id),
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint claim_timestamp_consistent check ((claimed_by is null) = (claimed_at is null))
);
revoke all on table hotel_private.owner_invites from public,anon,authenticated;

create or replace function public.hotel_claim_initial_owner(p_property uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_invitation hotel_private.owner_invites%rowtype;
begin
  if v_user is null or p_property is null then return false; end if;

  -- Serialize competing claims for the same HOTEL property.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hotel:first-owner:' || p_property::text,0)
  );

  select * into v_invitation
    from hotel_private.owner_invites
    where property_id = p_property and claimed_by is null
    for update;
  if not found then return false; end if;

  select lower(btrim(u.email)), u.email_confirmed_at
    into v_email, v_confirmed
    from auth.users u
    where u.id = v_user;
  if v_confirmed is null or v_email is distinct from v_invitation.email then
    return false;
  end if;

  -- Already initialized HOTEL properties cannot be claimed by another account.
  if exists(select 1 from public.staff_memberships m
    where m.property_id=p_property and m.role='owner') then
    return false;
  end if;

  insert into public.staff_memberships(property_id,user_id,role,active)
    values(p_property,v_user,'owner',true)
    on conflict(property_id,user_id) do nothing;
  if not found then return false; end if;

  update hotel_private.owner_invites
    set claimed_by=v_user, claimed_at=now()
    where property_id=p_property and claimed_by is null;

  insert into public.audit_events(
    property_id,actor_user_id,action,entity_type,entity_id,details
  ) values (
    p_property,v_user,'staff.initial_owner_claimed','staff_membership',v_user,
    pg_catalog.jsonb_build_object('method','confirmed_email_one_time')
  );

  return true;
end $$;

revoke all on function public.hotel_claim_initial_owner(uuid) from public,anon;
grant execute on function public.hotel_claim_initial_owner(uuid) to authenticated;
