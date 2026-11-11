-- HOTEL staff access is invitation-only.
-- Apply AFTER 20261111015000_initial_owner_claim.sql.
-- This migration creates no accounts, grants no default staff access, and changes no payment settings.
create table if not exists hotel_private.staff_invites (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  email text not null,
  role text not null check(role in ('manager','front_desk','restaurant','inventory','housekeeping','accountant')),
  invited_by uuid not null references auth.users(id),
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  claimed_by uuid references auth.users(id),
  claimed_at timestamptz,
  unique(property_id,email),
  constraint valid_staff_invite_email check(
    email = lower(btrim(email))
    and length(email) between 3 and 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  constraint staff_invite_claim_timing check ((claimed_by is null) = (claimed_at is null))
);
revoke all on table hotel_private.staff_invites from public,anon,authenticated;

-- Only a signed-in HOTEL owner can authorize a pending staff email and role.
create or replace function public.hotel_invite_staff(
  p_property uuid, p_email text, p_role text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_id uuid;
begin
  if v_user is null or p_property is null
    or not public.has_staff_role(p_property,array['owner']) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or length(v_email) > 254 or
     p_role not in ('manager','front_desk','restaurant','inventory','housekeeping','accountant') then
    raise exception 'Invalid staff invitation' using errcode='22023';
  end if;

  insert into hotel_private.staff_invites(
    property_id,email,role,invited_by,invited_at,expires_at
  ) values (
    p_property,v_email,p_role,v_user,now(),now()+interval '7 days'
  )
  on conflict(property_id,email)
    do update set
      role=excluded.role,
      invited_by=excluded.invited_by,
      invited_at=now(),
      expires_at=now()+interval '7 days',
      claimed_by=null,
      claimed_at=null
  returning id into v_id;

  insert into public.audit_events(
    property_id,actor_user_id,action,entity_type,entity_id,details
  ) values(
    p_property,v_user,'staff.invited','staff_invite',v_id,
    pg_catalog.jsonb_build_object('role',p_role)
  );
  return v_id;
end $$;
revoke all on function public.hotel_invite_staff(uuid,text,text) from public,anon;
grant execute on function public.hotel_invite_staff(uuid,text,text) to authenticated;

-- The invited staff account can claim only its own confirmed email.
-- Invitation cannot grant ownership or alter an existing staff membership.
create or replace function public.hotel_claim_staff_invite(p_property uuid)
returns boolean
language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_invite hotel_private.staff_invites%rowtype;
begin
  if v_user is null or p_property is null then return false; end if;
  select lower(btrim(u.email)), u.email_confirmed_at
    into v_email,v_confirmed from auth.users u where u.id=v_user;
  if v_confirmed is null or v_email is null then return false; end if;

  -- Keep concurrent claims for a property and email strictly serialized.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hotel:staff:'||p_property::text||':'||v_email,0)
  );
  select * into v_invite
    from hotel_private.staff_invites i
    where i.property_id=p_property and i.email=v_email
      and i.claimed_by is null and i.expires_at>now()
    for update;
  if not found then return false; end if;
  if exists(select 1 from public.staff_memberships m
    where m.property_id=p_property and m.user_id=v_user) then
    return false;
  end if;

  insert into public.staff_memberships(property_id,user_id,role,active)
    values(p_property,v_user,v_invite.role,true)
    on conflict(property_id,user_id) do nothing;
  if not found then return false; end if;

  update hotel_private.staff_invites
    set claimed_by=v_user,claimed_at=now()
    where id=v_invite.id and claimed_by is null;

  insert into public.audit_events(
    property_id,actor_user_id,action,entity_type,entity_id,details
  ) values (
    p_property,v_user,'staff.invitation_accepted','staff_membership',v_user,
    pg_catalog.jsonb_build_object('role',v_invite.role)
  );
  return true;
end $$;
revoke all on function public.hotel_claim_staff_invite(uuid) from public,anon;
grant execute on function public.hotel_claim_staff_invite(uuid) to authenticated;
