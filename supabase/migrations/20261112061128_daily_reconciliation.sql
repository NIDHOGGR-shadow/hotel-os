-- Read-only daily ledger. No day-close, transaction or stock balance is written.
-- SECURITY DEFINER is required to count live checkout holds without granting
-- staff direct access to checkout-session records. Authorization precedes reads.
create function public.hotel_daily_reconciliation(p_property uuid,p_day date)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_zone text;
  v_currency text;
  v_start timestamptz;
  v_end timestamptz;
  v_today date;
  v_result jsonb;
begin
  if auth.uid() is null or not public.has_staff_role(p_property,array['owner','manager']) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if p_day is null or not pg_catalog.isfinite(p_day) or p_day<date '2000-01-01' or p_day>date '2100-12-31' then
    raise exception 'Invalid report date' using errcode='22023';
  end if;
  if not exists(select 1 from public.property_features where property_id=p_property and feature='reporting' and enabled) then
    raise exception 'Reporting disabled' using errcode='42501';
  end if;
  select timezone,currency into v_zone,v_currency from public.properties where id=p_property;
  if not found then raise exception 'Property not found' using errcode='22023';end if;
  v_start:=p_day::timestamp at time zone v_zone;
  v_end:=(p_day+1)::timestamp at time zone v_zone;
  v_today:=(now() at time zone v_zone)::date;

  with stays as materialized (
    select r.id,r.room_id,r.check_in,r.check_out,r.status,r.nightly_rate_minor,r.currency,
      (r.status in ('confirmed','checked_in') or (r.status='checked_out' and p_day<v_today)) as booked,
      (r.status='payment_pending' and exists(
        select 1 from public.hotel_checkout_sessions c
        where c.property_id=p_property and c.reservation_id=r.id
          and c.status in ('pending','initialized') and c.expires_at>now()
      )) as held
    from public.reservations r
    where r.property_id=p_property and r.check_in<=p_day and r.check_out>=p_day
      and r.status in ('confirmed','checked_in','checked_out','payment_pending')
  ), room_state as (
    select r.id,r.room_number,t.name as category,r.condition,
      case
        when exists(select 1 from stays s where s.room_id=r.id and s.booked and s.check_out>p_day) then 'reserved'
        when exists(select 1 from stays s where s.room_id=r.id and s.held and s.check_out>p_day) then 'held'
        when not(r.active and t.active and t.nightly_rate_minor>0) then 'unpublished'
        else 'available'
      end as availability
    from public.rooms r join public.room_types t on t.property_id=r.property_id and t.id=r.room_type_id
    where r.property_id=p_property
  ), stock as (
    select i.id,i.sku,i.name,i.unit,i.reorder_level,i.active,
      coalesce(sum(m.quantity_delta) filter(where m.created_at<v_start),0) as opening,
      coalesce(sum(m.quantity_delta) filter(where m.created_at>=v_start and m.reason='receipt'),0) as received,
      -coalesce(sum(m.quantity_delta) filter(where m.created_at>=v_start and m.reason='sale' and m.quantity_delta<0),0) as food_used,
      -coalesce(sum(m.quantity_delta) filter(where m.created_at>=v_start and m.reason='waste' and m.quantity_delta<0),0) as waste,
      coalesce(sum(m.quantity_delta) filter(where m.created_at>=v_start and
        (m.reason not in ('receipt','sale','waste') or (m.reason in ('sale','waste') and m.quantity_delta>0))),0) as adjustments,
      coalesce(sum(m.quantity_delta),0) as closing,
      count(m.id) filter(where m.created_at>=v_start) as movements
    from public.stock_items i left join public.stock_movements m
      on m.property_id=i.property_id and m.stock_item_id=i.id and m.created_at<v_end
    where i.property_id=p_property
    group by i.id
  ), food as (
    select i.id,i.name,sum(l.quantity) as servings,sum(l.quantity*l.price_minor) as total_minor,
      count(distinct o.id) as orders
    from public.restaurant_orders o
    join public.restaurant_order_lines l on l.property_id=o.property_id and l.order_id=o.id
    join public.menu_items i on i.property_id=l.property_id and i.id=l.menu_item_id
    where o.property_id=p_property and o.status='finalized'
      and o.finalized_at>=v_start and o.finalized_at<v_end
    group by i.id
  ), payment as (
    select count(*) filter(where status in ('verified','refunded') and verified_at>=v_start and verified_at<v_end and currency=v_currency) as verified_count,
      coalesce(sum(amount_minor) filter(where status in ('verified','refunded') and verified_at>=v_start and verified_at<v_end and currency=v_currency),0) as receipts_minor,
      count(*) filter(where status in ('pending','failed') and created_at>=v_start and created_at<v_end) as unverified_count,
      count(*) filter(where status in ('verified','refunded') and verified_at>=v_start and verified_at<v_end and currency<>v_currency) as other_currency_count
    from public.payment_transactions where property_id=p_property
      and ((verified_at>=v_start and verified_at<v_end) or (created_at>=v_start and created_at<v_end))
  )
  select pg_catalog.jsonb_build_object(
    'day',p_day,'today',v_today,'timeZone',v_zone,'currency',v_currency,'generatedAt',now(),
    'rooms',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',id,'number',room_number,'category',category,'condition',condition,'status',availability
    ) order by room_number) from room_state),'[]'::jsonb),
    'roomSummary',pg_catalog.jsonb_build_object(
      'total',(select count(*) from room_state),
      'available',(select count(*) from room_state where availability='available'),
      'reserved',(select count(*) from room_state where availability='reserved'),
      'held',(select count(*) from room_state where availability='held'),
      'unpublished',(select count(*) from room_state where availability='unpublished'),
      'arrivals',(select count(*) from stays where booked and check_in=p_day),
      'departures',(select count(*) from stays where status in ('confirmed','checked_in','checked_out') and check_out=p_day),
      'nightlyChargesMinor',(select coalesce(sum(nightly_rate_minor),0) from stays where booked and check_out>p_day and currency=v_currency)
    ),
    'payments',(select pg_catalog.jsonb_build_object('receiptsMinor',receipts_minor,'verifiedCount',verified_count,
      'unverifiedCount',unverified_count,'otherCurrencyCount',other_currency_count) from payment),
    'food',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',id,'name',name,'servings',servings,'totalMinor',total_minor,'orders',orders
    ) order by name) from food),'[]'::jsonb),
    'foodSummary',pg_catalog.jsonb_build_object(
      'totalMinor',(select coalesce(sum(total_minor),0) from food),
      'finalizedOrders',(select count(*) from public.restaurant_orders where property_id=p_property and status='finalized' and finalized_at>=v_start and finalized_at<v_end),
      'openOrders',(select count(*) from public.restaurant_orders where property_id=p_property and status='open' and created_at<v_end),
      'menuItems',(select count(*) from public.menu_items where property_id=p_property and active)
    ),
    'stock',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',id,'sku',sku,'name',name,'unit',unit,'active',active,'opening',opening,'received',received,
      'foodUsed',food_used,'waste',waste,'adjustments',adjustments,'closing',closing,'movements',movements,
      'lowStock',closing<=reorder_level
    ) order by name) from stock),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.hotel_daily_reconciliation(uuid,date) from public,anon;
grant execute on function public.hotel_daily_reconciliation(uuid,date) to authenticated;

create index if not exists stock_movements_daily_ledger_idx on public.stock_movements(property_id,stock_item_id,created_at);
create index if not exists restaurant_orders_daily_finalized_idx on public.restaurant_orders(property_id,finalized_at) where status='finalized';
create index if not exists payment_transactions_daily_verified_idx on public.payment_transactions(property_id,verified_at);
create index if not exists payment_transactions_daily_created_idx on public.payment_transactions(property_id,created_at);
