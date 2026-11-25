create table public.hotel_food_purchases (
 reference text primary key check(reference ~ '^food-[a-f0-9-]{36}$'),
 property_id uuid not null references public.properties(id),
 menu_item_id uuid not null,
 item_name text not null, quantity integer not null check(quantity between 1 and 20),
 unit_minor bigint not null check(unit_minor > 0), amount_minor bigint generated always as (unit_minor * quantity) stored,
 guest_email text not null, delivery_kind text not null check(delivery_kind in ('room','table')),
 delivery_label text not null check(length(delivery_label) between 1 and 40),
 created_at timestamptz not null default now(), paid_at timestamptz,
 foreign key(property_id,menu_item_id) references public.menu_items(property_id,id)
);
alter table public.hotel_food_purchases enable row level security;
revoke all on public.hotel_food_purchases from public,anon,authenticated;
grant select,insert,update on public.hotel_food_purchases to service_role;
create table public.hotel_receipt_redemptions (
 reference text primary key, property_id uuid not null references public.properties(id),
 staff_user_id uuid not null references auth.users(id), redeemed_at timestamptz not null default now()
);
alter table public.hotel_receipt_redemptions enable row level security;
revoke all on public.hotel_receipt_redemptions from public,anon,authenticated;
grant select,insert on public.hotel_receipt_redemptions to service_role;
