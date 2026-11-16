-- Applied to dedicated Hotel OS Supabase project (Hotel) on 2026-11-16.
-- Browser UTMs are stored only after marketing consent and are attached by the
-- trusted checkout API to a server-generated Paystack checkout reference.
-- No guest PII or raw IP address is stored here.
create table if not exists public.hotel_booking_attribution (
  reference text primary key references public.hotel_checkout_sessions(reference) on delete cascade,
  property_id uuid not null references public.properties(id),
  source text check (source is null or length(source) <= 100),
  medium text check (medium is null or length(medium) <= 100),
  campaign text check (campaign is null or length(campaign) <= 160),
  campaign_id text check (campaign_id is null or length(campaign_id) <= 80),
  content text check (content is null or length(content) <= 160),
  term text check (term is null or length(term) <= 160),
  created_at timestamptz not null default now()
);
create index if not exists hotel_booking_attribution_property_period
  on public.hotel_booking_attribution(property_id,created_at);
create index if not exists hotel_booking_attribution_campaign
  on public.hotel_booking_attribution(campaign_id);
alter table public.hotel_booking_attribution enable row level security;
revoke all on public.hotel_booking_attribution from anon,authenticated;
grant select,insert,update on public.hotel_booking_attribution to service_role;
