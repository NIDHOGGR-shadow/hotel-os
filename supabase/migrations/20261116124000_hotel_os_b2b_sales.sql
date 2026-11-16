-- Hotel OS owner-side B2B pipeline. Separate from guest properties and room bookings.
-- No public browser ever receives a service key or reads these records.
create table if not exists public.hotel_os_sales_leads (
  id uuid primary key default gen_random_uuid(),
  hotel_name text not null check (char_length(hotel_name) between 2 and 150),
  contact_name text not null check (char_length(contact_name) between 2 and 120),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 25),
  city text check (city is null or char_length(city) <= 120),
  room_count integer check (room_count is null or room_count between 1 and 10000),
  message text check (message is null or char_length(message) <= 1600),
  consent_at timestamptz not null,
  utm_source text check (utm_source is null or char_length(utm_source) <= 100),
  utm_medium text check (utm_medium is null or char_length(utm_medium) <= 100),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 160),
  campaign_id text check (campaign_id is null or campaign_id ~ '^[0-9]{5,30}$'),
  status text not null default 'new' check(status in ('new','contacted','qualified','demo','proposal','won','lost')),
  created_at timestamptz not null default now(),
  constraint lead_contact_exists check (email is not null or phone is not null)
);
create index if not exists hotel_os_sales_leads_created on public.hotel_os_sales_leads(created_at desc);
create index if not exists hotel_os_sales_leads_status on public.hotel_os_sales_leads(status);

create table if not exists public.hotel_os_sales_contracts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.hotel_os_sales_leads(id) on delete set null,
  hotel_name text not null check(char_length(hotel_name) between 2 and 150),
  status text not null default 'proposed' check(status in ('proposed','active','paused','cancelled','expired')),
  currency text not null default 'NGN' check(currency ~ '^[A-Z]{3}$'),
  recurring_monthly_minor bigint not null check(recurring_monthly_minor >= 0),
  signed_at timestamptz,
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  constraint contract_end_after_start check(ends_on is null or ends_on >= starts_on),
  constraint active_contract_signed check(status <> 'active' or signed_at is not null)
);
create index if not exists hotel_os_sales_contracts_status on public.hotel_os_sales_contracts(status,starts_on,ends_on);

alter table public.hotel_os_sales_leads enable row level security;
alter table public.hotel_os_sales_contracts enable row level security;
revoke all on public.hotel_os_sales_leads from public,anon,authenticated;
revoke all on public.hotel_os_sales_contracts from public,anon,authenticated;
grant select,insert,update on public.hotel_os_sales_leads to service_role;
grant select,insert,update on public.hotel_os_sales_contracts to service_role;
-- No policies: browser-facing anon/authenticated roles cannot access rows.
-- Contracted MRR is a signed active obligation, NOT cash receipts.
