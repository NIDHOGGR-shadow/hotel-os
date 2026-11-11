-- Apply after the Hotel OS base schema migration.
-- This table holds verified Paystack payments independently of room bookings.
-- Do NOT mark a hotel reservation confirmed until it is linked server-side.
create table if not exists public.paystack_verified_charges (
  reference text primary key check (reference ~ '^[A-Za-z0-9.=-]{1,120}$'),
  paystack_transaction_id text not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  environment text not null check (environment in ('test','live')),
  paid_at timestamptz,
  received_at timestamptz not null default now()
);
alter table public.paystack_verified_charges enable row level security;
revoke all on table public.paystack_verified_charges from anon, authenticated;
-- No RLS policies: only the Supabase service role may insert and query payment records.
