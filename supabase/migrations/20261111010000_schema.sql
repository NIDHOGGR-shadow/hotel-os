-- Hotel OS schema: create in a dedicated Supabase project only.
-- Must be followed by 20261111011000_operations.sql before accepting transactions.
create extension if not exists btree_gist;

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(trim(name)) between 2 and 140),
  currency text not null default 'NGN' check(currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Africa/Lagos',
  created_at timestamptz not null default now()
);

create table public.staff_memberships (
property_id uuid not null references public.properties(id) on delete cascade,
user_id uuid not null references auth.users(id) on delete cascade,
role text not null check(role in ('owner','manager','front_desk','restaurant','inventory','housekeeping','accountant')),
active boolean not null default true,created_at timestamptz not null default now(),
primary key(property_id,user_id)
);

create table public.property_features (
property_id uuid not null references public.properties(id) on delete cascade,
feature text not null check(feature in ('reservations','restaurant','inventory','housekeeping','messaging','reporting')),
enabled boolean not null default true,primary key(property_id,feature)
);

create table public.room_types (
id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),name text not null,capacity integer not null default 2 check(capacity between 1 and 30),
nightly_rate_minor bigint not null check(nightly_rate_minor>=0),active boolean not null default true,
unique(property_id,id),unique(property_id,name)
);

create table public.rooms (
id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),room_type_id uuid not null,room_number text not null,floor_label text,
active boolean not null default true,condition text not null default 'ready'
check(condition in ('ready','dirty','cleaning','maintenance')),
unique(property_id,id),unique(property_id,room_number),foreign key(property_id,room_type_id) references public.room_types(property_id,id)
);

create table public.guests (
id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),full_name text not null check(length(trim(full_name)) between 2 and 180),
email text,phone text,created_at timestamptz not null default now(),unique(property_id,id)
);

create table public.reservations (
id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),guest_id uuid not null,room_type_id uuid not null,room_id uuid,
check_in date not null,check_out date not null,status text not null default 'confirmed'
check(status in ('inquiry','confirmed','checked_in','checked_out','cancelled','no_show')),
nightly_rate_minor bigint not null check(nightly_rate_minor>=0),
total_minor bigint not null check(total_minor>=0),currency text not null default 'NGN',
request_key uuid not null,created_by uuid references auth.users(id),
created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
check(check_out>check_in),check(status not in ('confirmed','checked_in') or room_id is not null),
unique(property_id,id),unique(property_id,request_key),
foreign key(property_id,guest_id) references public.guests(property_id,id),foreign key(property_id,room_type_id) references public.room_types(property_id,id),foreign key(property_id,room_id) references public.rooms(property_id,id),
constraint no_overlapping_room_stays exclude using gist
(room_id with =,daterange(check_in,check_out,'[)') with &&)
where(status in ('confirmed','checked_in'))
);

create table public.folios (
id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),reservation_id uuid not null,created_at timestamptz not null default now(),
unique(property_id,id),unique(property_id,reservation_id),foreign key(property_id,reservation_id) references public.reservations(property_id,id)
);

create table public.folio_entries (
id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),folio_id uuid not null,kind text not null
check(kind in ('room_charge','restaurant_charge','adjustment','payment','refund','reversal')),
amount_minor bigint not null check(amount_minor>=0),description text not null,
source_id uuid,created_at timestamptz not null default now(),
unique(property_id,id),foreign key(property_id,folio_id) references public.folios(property_id,id)
);

create table public.restaurant_tables (
id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),label text not null,seats integer not null check(seats between 1 and 40),
active boolean not null default true,unique(property_id,id),unique(property_id,label)
);

create table public.menu_items (
id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),name text not null,price_minor bigint not null check(price_minor>=0),
tracks_ingredients boolean not null default false,active boolean not null default true,unique(property_id,id)
);

create table public.stock_items (
id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),sku text not null,name text not null,
unit text not null check(unit in ('piece','kg','g','l','ml','pack')),
reorder_level numeric(14,3) not null default 0 check(reorder_level>=0),
active boolean not null default true,unique(property_id,id),unique(property_id,sku)
);

create table public.recipe_ingredients (
property_id uuid not null references public.properties(id),
menu_item_id uuid not null,stock_item_id uuid not null,quantity_per_serving numeric(14,3) not null
check(quantity_per_serving>0),primary key(property_id,menu_item_id,stock_item_id),
foreign key(property_id,menu_item_id) references public.menu_items(property_id,id),foreign key(property_id,stock_item_id) references public.stock_items(property_id,id)
);

create table public.restaurant_orders (
id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),table_id uuid,folio_id uuid,
status text not null default 'open' check(status in ('open','finalized','void')),
request_key uuid not null,created_by uuid not null references auth.users(id),
created_at timestamptz not null default now(),finalized_at timestamptz,
unique(property_id,id),unique(property_id,request_key),
foreign key(property_id,table_id) references public.restaurant_tables(property_id,id),foreign key(property_id,folio_id) references public.folios(property_id,id)
);

create table public.restaurant_order_lines (
id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),order_id uuid not null,menu_item_id uuid not null,
quantity numeric(12,3) not null check(quantity>0),price_minor bigint not null check(price_minor>=0),
unique(property_id,id),unique(property_id,order_id,menu_item_id),
foreign key(property_id,order_id) references public.restaurant_orders(property_id,id),foreign key(property_id,menu_item_id) references public.menu_items(property_id,id)
);

create table public.stock_movements (
id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),stock_item_id uuid not null,quantity_delta numeric(14,3) not null
check(quantity_delta<>0),reason text not null
check(reason in ('receipt','sale','waste','adjustment','return')),
source_type text,source_id uuid,request_key uuid,
created_by uuid references auth.users(id),created_at timestamptz not null default now(),
foreign key(property_id,stock_item_id) references public.stock_items(property_id,id),unique(property_id,request_key)
);

create table public.suppliers (
id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),name text not null,contact text,unique(property_id,id)
);

create table public.purchase_orders (
id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),supplier_id uuid not null,status text not null default 'draft'
check(status in ('draft','submitted','part_received','received','cancelled')),
created_at timestamptz not null default now(),unique(property_id,id),foreign key(property_id,supplier_id) references public.suppliers(property_id,id)
);

create table public.purchase_order_lines (
property_id uuid not null references public.properties(id),
purchase_order_id uuid not null,stock_item_id uuid not null,
quantity numeric(14,3) not null check(quantity>0),unit_cost_minor bigint not null check(unit_cost_minor>=0),
primary key(property_id,purchase_order_id,stock_item_id),
foreign key(property_id,purchase_order_id) references public.purchase_orders(property_id,id),foreign key(property_id,stock_item_id) references public.stock_items(property_id,id)
);

create table public.housekeeping_tasks (
id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),room_id uuid not null,
status text not null default 'pending' check(status in ('pending','in_progress','completed','cancelled')),
assignee_id uuid references auth.users(id),due_at timestamptz,
created_at timestamptz not null default now(),foreign key(property_id,room_id) references public.rooms(property_id,id)
);

create table public.guest_requests (
id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),reservation_id uuid,category text not null,detail text not null,
status text not null default 'open'
check(status in ('open','in_progress','resolved','cancelled')),
created_at timestamptz not null default now(),foreign key(property_id,reservation_id) references public.reservations(property_id,id)
);

create table public.payment_transactions (
id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),folio_id uuid not null,provider text not null,
provider_reference text not null,amount_minor bigint not null check(amount_minor>0),
currency text not null check(currency ~ '^[A-Z]{3}$'),
status text not null default 'pending' check(status in ('pending','verified','failed','refunded')),
verified_at timestamptz,created_at timestamptz not null default now(),
foreign key(property_id,folio_id) references public.folios(property_id,id),unique(provider,provider_reference)
);

create table public.notification_jobs (
id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),guest_id uuid,channel text not null
check(channel in ('email','sms','whatsapp')),template_key text not null,
status text not null default 'queued' check(status in ('queued','sent','failed','cancelled')),
scheduled_at timestamptz not null default now(),sent_at timestamptz,
foreign key(property_id,guest_id) references public.guests(property_id,id)
);

create table public.audit_events (
id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),actor_user_id uuid references auth.users(id),
action text not null,entity_type text not null,entity_id uuid,details jsonb not null default '{}'::jsonb,
created_at timestamptz not null default now()
);

create index staff_user_idx on public.staff_memberships(user_id) where active;
create index rooms_type_idx on public.rooms(property_id,room_type_id);
create index reservations_calendar_idx on public.reservations(property_id,check_in,check_out);
create index stock_movements_balance_idx on public.stock_movements(property_id,stock_item_id);
create index audit_events_property_time_idx on public.audit_events(property_id,created_at desc);
create unique index one_entry_per_external_source on public.folio_entries(property_id,kind,source_id) where source_id is not null;
create unique index one_stock_sale_per_order_item on public.stock_movements(property_id,stock_item_id,source_type,source_id)
  where source_type='restaurant_order' and source_id is not null;
-- Membership lookup runs as definer; every check binds to actual auth.uid().
create function public.has_staff_role(p_property uuid,p_roles text[] default null)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
 select 1 from public.staff_memberships m where m.property_id=p_property
 and m.user_id=auth.uid() and m.active
 and (p_roles is null or m.role=any(p_roles)));
$$;
revoke all on function public.has_staff_role(uuid,text[]) from public,anon;
grant execute on function public.has_staff_role(uuid,text[]) to authenticated;

alter table public.properties enable row level security;
alter table public.staff_memberships enable row level security;
alter table public.property_features enable row level security;
alter table public.room_types enable row level security;
alter table public.rooms enable row level security;
alter table public.guests enable row level security;
alter table public.reservations enable row level security;
alter table public.folios enable row level security;
alter table public.folio_entries enable row level security;
alter table public.restaurant_tables enable row level security;
alter table public.menu_items enable row level security;
alter table public.stock_items enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.restaurant_orders enable row level security;
alter table public.restaurant_order_lines enable row level security;
alter table public.stock_movements enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.housekeeping_tasks enable row level security;
alter table public.guest_requests enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.notification_jobs enable row level security;
alter table public.audit_events enable row level security;
revoke all on public.properties,public.staff_memberships,public.property_features,public.room_types,public.rooms,public.guests,public.reservations,public.folios,public.folio_entries,public.restaurant_tables,public.menu_items,public.stock_items,public.recipe_ingredients,public.restaurant_orders,public.restaurant_order_lines,public.stock_movements,public.suppliers,public.purchase_orders,public.purchase_order_lines,public.housekeeping_tasks,public.guest_requests,public.payment_transactions,public.notification_jobs,public.audit_events from anon,authenticated;
grant select on public.properties,public.staff_memberships,public.property_features,public.room_types,public.rooms,public.guests,public.reservations,public.folios,public.folio_entries,public.restaurant_tables,public.menu_items,public.stock_items,public.recipe_ingredients,public.restaurant_orders,public.restaurant_order_lines,public.stock_movements,public.suppliers,public.purchase_orders,public.purchase_order_lines,public.housekeeping_tasks,public.guest_requests,public.payment_transactions,public.notification_jobs,public.audit_events to authenticated;

create policy staff_view_properties on public.properties for select to authenticated using (public.has_staff_role(id));
create policy staff_view_staff_memberships on public.staff_memberships for select to authenticated using (public.has_staff_role(property_id,array['owner','manager']) or user_id=auth.uid());
create policy staff_view_property_features on public.property_features for select to authenticated using (public.has_staff_role(property_id));
create policy staff_view_room_types on public.room_types for select to authenticated using (public.has_staff_role(property_id));
create policy staff_view_rooms on public.rooms for select to authenticated using (public.has_staff_role(property_id));
create policy staff_view_guests on public.guests for select to authenticated using (public.has_staff_role(property_id,array['owner','manager','front_desk','accountant']));
create policy staff_view_reservations on public.reservations for select to authenticated using (public.has_staff_role(property_id,array['owner','manager','front_desk','accountant','housekeeping']));
create policy staff_view_folios on public.folios for select to authenticated using (public.has_staff_role(property_id,array['owner','manager','front_desk','accountant','restaurant']));
create policy staff_view_folio_entries on public.folio_entries for select to authenticated using (public.has_staff_role(property_id,array['owner','manager','front_desk','accountant']));
create policy staff_view_restaurant_tables on public.restaurant_tables for select to authenticated using (public.has_staff_role(property_id));
create policy staff_view_menu_items on public.menu_items for select to authenticated using (public.has_staff_role(property_id));
create policy staff_view_stock_items on public.stock_items for select to authenticated using (public.has_staff_role(property_id,array['owner','manager','inventory','restaurant']));
create policy staff_view_recipe_ingredients on public.recipe_ingredients for select to authenticated using (public.has_staff_role(property_id,array['owner','manager','inventory','restaurant']));
create policy staff_view_restaurant_orders on public.restaurant_orders for select to authenticated using (public.has_staff_role(property_id,array['owner','manager','restaurant','accountant']));
create policy staff_view_restaurant_order_lines on public.restaurant_order_lines for select to authenticated using (public.has_staff_role(property_id,array['owner','manager','restaurant','accountant']));
create policy staff_view_stock_movements on public.stock_movements for select to authenticated using (public.has_staff_role(property_id,array['owner','manager','inventory','accountant','restaurant']));
create policy staff_view_suppliers on public.suppliers for select to authenticated using (public.has_staff_role(property_id,array['owner','manager','inventory']));
create policy staff_view_purchase_orders on public.purchase_orders for select to authenticated using (public.has_staff_role(property_id,array['owner','manager','inventory']));
create policy staff_view_purchase_order_lines on public.purchase_order_lines for select to authenticated using (public.has_staff_role(property_id,array['owner','manager','inventory']));
create policy staff_view_housekeeping_tasks on public.housekeeping_tasks for select to authenticated using (public.has_staff_role(property_id,array['owner','manager','front_desk','housekeeping']));
create policy staff_view_guest_requests on public.guest_requests for select to authenticated using (public.has_staff_role(property_id,array['owner','manager','front_desk','housekeeping']));
create policy staff_view_payment_transactions on public.payment_transactions for select to authenticated using (public.has_staff_role(property_id,array['owner','manager','accountant']));
create policy staff_view_notification_jobs on public.notification_jobs for select to authenticated using (public.has_staff_role(property_id,array['owner','manager','front_desk']));
create policy staff_view_audit_events on public.audit_events for select to authenticated using (public.has_staff_role(property_id,array['owner','manager']));

create view public.stock_balances with (security_invoker=true) as
 select i.property_id,i.id as stock_item_id,i.sku,i.name,i.unit,i.reorder_level,
 coalesce(sum(m.quantity_delta),0)::numeric(14,3) as on_hand,
 coalesce(sum(m.quantity_delta),0)<=i.reorder_level as low_stock
 from public.stock_items i left join public.stock_movements m
 on m.property_id=i.property_id and m.stock_item_id=i.id
 where i.active group by i.property_id,i.id,i.sku,i.name,i.unit,i.reorder_level;
grant select on public.stock_balances to authenticated;
