-- Hotel OS authenticated mutation functions. Requires 20261111010000_schema.sql.
-- Every function authenticates using auth.uid() via has_staff_role.

create function public.create_hotel_property(p_name text,p_timezone text default 'Africa/Lagos') returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if length(trim(coalesce(p_name,''))) not between 2 and 140 then raise exception 'Invalid property name';end if;
 if p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'Invalid timezone';end if;
 insert into public.properties(name,timezone) values(trim(p_name),p_timezone) returning id into v_id;
 insert into public.staff_memberships(property_id,user_id,role) values(v_id,auth.uid(),'owner');
 insert into public.property_features(property_id,feature) values
 (v_id,'reservations'),(v_id,'restaurant'),(v_id,'inventory'),
 (v_id,'housekeeping'),(v_id,'messaging'),(v_id,'reporting');
 insert into public.audit_events(property_id,actor_user_id,action,entity_type,entity_id)
 values(v_id,auth.uid(),'property.created','property',v_id);
 return v_id;
end;
$$;
revoke all on function public.create_hotel_property(text,text) from public,anon;
grant execute on function public.create_hotel_property(text,text) to authenticated;

create function public.set_hotel_feature(p_property uuid,p_feature text,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.has_staff_role(p_property,array['owner']) then raise exception 'Forbidden' using errcode='42501';end if;
 update public.property_features set enabled=p_enabled where property_id=p_property and feature=p_feature;
 if not found then raise exception 'Unknown feature';end if;
 insert into public.audit_events(property_id,actor_user_id,action,entity_type,details)
 values(p_property,auth.uid(),'feature.changed','property_feature',jsonb_build_object('feature',p_feature,'enabled',p_enabled));
end;
$$;
revoke all on function public.set_hotel_feature(uuid,text,boolean) from public,anon;
grant execute on function public.set_hotel_feature(uuid,text,boolean) to authenticated;

create function public.add_hotel_staff(p_property uuid,p_user uuid,p_role text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.has_staff_role(p_property,array['owner']) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_role not in ('manager','front_desk','restaurant','inventory','housekeeping','accountant') then raise exception 'Invalid staff role';end if;
 insert into public.staff_memberships(property_id,user_id,role,active) values(p_property,p_user,p_role,true)
 on conflict(property_id,user_id) do update set role=excluded.role,active=true;
 insert into public.audit_events(property_id,actor_user_id,action,entity_type,entity_id,details)
 values(p_property,auth.uid(),'staff.access_granted','staff',p_user,jsonb_build_object('role',p_role));
end;
$$;
revoke all on function public.add_hotel_staff(uuid,uuid,text) from public,anon;
grant execute on function public.add_hotel_staff(uuid,uuid,text) to authenticated;

create function public.create_hotel_room_type(p_property uuid,p_name text,p_rate_minor bigint,p_capacity integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.has_staff_role(p_property,array['owner','manager']) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_rate_minor is null or p_rate_minor<0 or p_capacity not between 1 and 30 or length(trim(coalesce(p_name,''))) not between 2 and 100 then raise exception 'Invalid room type';end if;
 insert into public.room_types(property_id,name,nightly_rate_minor,capacity) values(p_property,trim(p_name),p_rate_minor,p_capacity) returning id into v_id;
 insert into public.audit_events(property_id,actor_user_id,action,entity_type,entity_id)
 values(p_property,auth.uid(),'room_type.created','room_type',v_id);
 return v_id;
end;
$$;
revoke all on function public.create_hotel_room_type(uuid,text,bigint,integer) from public,anon;
grant execute on function public.create_hotel_room_type(uuid,text,bigint,integer) to authenticated;

create function public.create_hotel_room(p_property uuid,p_room_type uuid,p_room_number text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.has_staff_role(p_property,array['owner','manager']) then raise exception 'Forbidden' using errcode='42501';end if;
 if length(trim(coalesce(p_room_number,''))) not between 1 and 30 then raise exception 'Invalid room number';end if;
 insert into public.rooms(property_id,room_type_id,room_number) values(p_property,p_room_type,trim(p_room_number)) returning id into v_id;
 insert into public.audit_events(property_id,actor_user_id,action,entity_type,entity_id)
 values(p_property,auth.uid(),'room.created','room',v_id);
 return v_id;
end;
$$;
revoke all on function public.create_hotel_room(uuid,uuid,text) from public,anon;
grant execute on function public.create_hotel_room(uuid,uuid,text) to authenticated;

create function public.create_hotel_guest(p_property uuid,p_name text,p_email text default null,p_phone text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.has_staff_role(p_property,array['owner','manager','front_desk']) then raise exception 'Forbidden' using errcode='42501';end if;
 if length(trim(coalesce(p_name,''))) not between 2 and 180 then raise exception 'Invalid guest name';end if;
 if p_email is not null and (length(p_email)>254 or position('@' in p_email)=0) then raise exception 'Invalid email';end if;
 if p_phone is not null and length(p_phone)>25 then raise exception 'Invalid phone';end if;
 insert into public.guests(property_id,full_name,email,phone) values(p_property,trim(p_name),nullif(trim(p_email),''),nullif(trim(p_phone),'')) returning id into v_id;
 insert into public.audit_events(property_id,actor_user_id,action,entity_type,entity_id)
 values(p_property,auth.uid(),'guest.created','guest',v_id);
 return v_id;
end;
$$;
revoke all on function public.create_hotel_guest(uuid,text,text,text) from public,anon;
grant execute on function public.create_hotel_guest(uuid,text,text,text) to authenticated;

create function public.create_room_reservation(p_property uuid,p_guest uuid,p_room_type uuid,p_check_in date,p_check_out date,p_request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_room uuid;v_rate bigint;v_currency text;v_folio uuid;v_days int;
begin
 if not public.has_staff_role(p_property,array['owner','manager','front_desk']) then raise exception 'Forbidden' using errcode='42501';end if;
 if not exists(select 1 from public.property_features where property_id=p_property and feature='reservations' and enabled) then raise exception 'Reservations disabled';end if;
 if p_request_key is null then raise exception 'Request key required';end if;
 if p_check_in is null or p_check_out is null or p_check_in<current_date or p_check_out<=p_check_in or p_check_out-p_check_in>365 then raise exception 'Invalid stay dates';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_property::text||':'||p_room_type::text,0));
 select id into v_id from public.reservations where property_id=p_property and request_key=p_request_key;
 if v_id is not null then return v_id;end if;
 if not exists(select 1 from public.guests where property_id=p_property and id=p_guest) then raise exception 'Guest not found';end if;
 select nightly_rate_minor into v_rate from public.room_types where property_id=p_property and id=p_room_type and active;
 if not found then raise exception 'Room type not found';end if;
 select id into v_room from public.rooms r where r.property_id=p_property and r.room_type_id=p_room_type
 and r.active and r.condition<>'maintenance'
 and not exists(select 1 from public.reservations x where x.property_id=p_property and x.room_id=r.id
 and x.status in ('confirmed','checked_in') and daterange(x.check_in,x.check_out,'[)') && daterange(p_check_in,p_check_out,'[)'))
 order by room_number limit 1;
 if v_room is null then raise exception 'No available room for these dates' using errcode='P0001';end if;
 select currency into v_currency from public.properties where id=p_property;
 v_days:=p_check_out-p_check_in;
 insert into public.reservations(property_id,guest_id,room_type_id,room_id,check_in,check_out,status,nightly_rate_minor,total_minor,currency,request_key,created_by)
 values(p_property,p_guest,p_room_type,v_room,p_check_in,p_check_out,'confirmed',v_rate,v_rate*v_days,v_currency,p_request_key,auth.uid())
 returning id into v_id;
 insert into public.folios(property_id,reservation_id) values(p_property,v_id) returning id into v_folio;
 insert into public.folio_entries(property_id,folio_id,kind,amount_minor,description,source_id)
 values(p_property,v_folio,'room_charge',v_rate*v_days,'Accommodation',v_id);
 insert into public.audit_events(property_id,actor_user_id,action,entity_type,entity_id)
 values(p_property,auth.uid(),'reservation.confirmed','reservation',v_id);
 return v_id;
end;
$$;
revoke all on function public.create_room_reservation(uuid,uuid,uuid,date,date,uuid) from public,anon;
grant execute on function public.create_room_reservation(uuid,uuid,uuid,date,date,uuid) to authenticated;

create function public.change_reservation_status(p_property uuid,p_reservation uuid,p_status text) returns void
language plpgsql security definer set search_path='' as $$
declare v_old text;v_room uuid;
begin
 if not public.has_staff_role(p_property,array['owner','manager','front_desk']) then raise exception 'Forbidden' using errcode='42501';end if;
 select status,room_id into v_old,v_room from public.reservations where property_id=p_property and id=p_reservation for update;
 if not found then raise exception 'Reservation not found';end if;
 if not ((v_old='confirmed' and p_status in ('checked_in','cancelled','no_show')) or (v_old='checked_in' and p_status='checked_out')) then raise exception 'Invalid status transition';end if;
 if p_status='checked_in' and not exists(select 1 from public.rooms where property_id=p_property and id=v_room and condition='ready') then raise exception 'Room is not ready';end if;
 update public.reservations set status=p_status,updated_at=now() where property_id=p_property and id=p_reservation;
 if p_status='checked_out' then update public.rooms set condition='dirty' where property_id=p_property and id=v_room;end if;
 insert into public.audit_events(property_id,actor_user_id,action,entity_type,entity_id,details)
 values(p_property,auth.uid(),'reservation.status_changed','reservation',p_reservation,jsonb_build_object('from',v_old,'to',p_status));
end;
$$;
revoke all on function public.change_reservation_status(uuid,uuid,text) from public,anon;
grant execute on function public.change_reservation_status(uuid,uuid,text) to authenticated;

create function public.set_room_nightly_rate(p_property uuid,p_room_type uuid,p_rate_minor bigint) returns void
language plpgsql security definer set search_path='' as $$
declare v_old bigint;
begin
 if not public.has_staff_role(p_property,array['owner','manager']) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_rate_minor is null or p_rate_minor<0 then raise exception 'Invalid rate';end if;
 select nightly_rate_minor into v_old from public.room_types where property_id=p_property and id=p_room_type for update;
 if not found then raise exception 'Room type not found';end if;
 update public.room_types set nightly_rate_minor=p_rate_minor where property_id=p_property and id=p_room_type;
 insert into public.audit_events(property_id,actor_user_id,action,entity_type,entity_id,details)
 values(p_property,auth.uid(),'room_type.rate_changed','room_type',p_room_type,jsonb_build_object('old_minor',v_old,'new_minor',p_rate_minor));
end;
$$;
revoke all on function public.set_room_nightly_rate(uuid,uuid,bigint) from public,anon;
grant execute on function public.set_room_nightly_rate(uuid,uuid,bigint) to authenticated;

create function public.create_hotel_stock_item(p_property uuid,p_sku text,p_name text,p_unit text,p_reorder_level numeric) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.has_staff_role(p_property,array['owner','manager','inventory']) then raise exception 'Forbidden' using errcode='42501';end if;
 if length(trim(coalesce(p_sku,''))) not between 1 and 120 or length(trim(coalesce(p_name,''))) not between 2 and 140 or p_unit not in ('piece','kg','g','l','ml','pack')
 or p_reorder_level is null or p_reorder_level<0 or p_reorder_level>100000000 or p_reorder_level<>round(p_reorder_level,3) then raise exception 'Invalid stock item';end if;
 insert into public.stock_items(property_id,sku,name,unit,reorder_level) values(p_property,trim(p_sku),trim(p_name),p_unit,p_reorder_level) returning id into v_id;
 insert into public.audit_events(property_id,actor_user_id,action,entity_type,entity_id) values(p_property,auth.uid(),'stock.item_created','stock_item',v_id);
 return v_id;
end;
$$;
revoke all on function public.create_hotel_stock_item(uuid,text,text,text,numeric) from public,anon;
grant execute on function public.create_hotel_stock_item(uuid,text,text,text,numeric) to authenticated;

create function public.record_stock_adjustment(p_property uuid,p_item uuid,p_delta numeric,p_reason text,p_request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_balance numeric;
begin
 if not public.has_staff_role(p_property,array['owner','manager','inventory']) then raise exception 'Forbidden' using errcode='42501';end if;
 if not exists(select 1 from public.property_features where property_id=p_property and feature='inventory' and enabled) then raise exception 'Inventory disabled';end if;
 if p_request_key is null or p_delta is null or p_delta=0 or abs(p_delta)>100000000 or p_delta<>round(p_delta,3)
 or p_reason not in ('receipt','waste','adjustment','return') then raise exception 'Invalid movement';end if;
 select id into v_id from public.stock_movements where property_id=p_property and request_key=p_request_key;
 if v_id is not null then return v_id;end if;
 perform 1 from public.stock_items where property_id=p_property and id=p_item and active for update;
 if not found then raise exception 'Stock item not found';end if;
 select coalesce(sum(quantity_delta),0) into v_balance from public.stock_movements where property_id=p_property and stock_item_id=p_item;
 if v_balance+p_delta<0 then raise exception 'Insufficient stock';end if;
 insert into public.stock_movements(property_id,stock_item_id,quantity_delta,reason,request_key,created_by)
 values(p_property,p_item,p_delta,p_reason,p_request_key,auth.uid()) returning id into v_id;
 insert into public.audit_events(property_id,actor_user_id,action,entity_type,entity_id,details)
 values(p_property,auth.uid(),'stock.movement_recorded','stock_item',p_item,jsonb_build_object('delta',p_delta,'reason',p_reason,'movement_id',v_id));
 return v_id;
end;
$$;
revoke all on function public.record_stock_adjustment(uuid,uuid,numeric,text,uuid) from public,anon;
grant execute on function public.record_stock_adjustment(uuid,uuid,numeric,text,uuid) to authenticated;

create function public.create_hotel_menu_item(p_property uuid,p_name text,p_price_minor bigint,p_tracks_ingredients boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.has_staff_role(p_property,array['owner','manager','restaurant']) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_price_minor is null or p_price_minor<0 or length(trim(coalesce(p_name,''))) not between 2 and 140 or p_tracks_ingredients is null then raise exception 'Invalid menu item';end if;
 insert into public.menu_items(property_id,name,price_minor,tracks_ingredients)
 values(p_property,trim(p_name),p_price_minor,p_tracks_ingredients) returning id into v_id;
 insert into public.audit_events(property_id,actor_user_id,action,entity_type,entity_id) values(p_property,auth.uid(),'menu.item_created','menu_item',v_id);
 return v_id;
end;
$$;
revoke all on function public.create_hotel_menu_item(uuid,text,bigint,boolean) from public,anon;
grant execute on function public.create_hotel_menu_item(uuid,text,bigint,boolean) to authenticated;

create function public.set_hotel_recipe_ingredient(p_property uuid,p_menu_item uuid,p_stock_item uuid,p_quantity numeric) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.has_staff_role(p_property,array['owner','manager','inventory','restaurant']) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_quantity is null or p_quantity<=0 or p_quantity>1000000 or p_quantity<>round(p_quantity,3) then raise exception 'Invalid recipe quantity';end if;
 if not exists(select 1 from public.menu_items where property_id=p_property and id=p_menu_item and tracks_ingredients) then raise exception 'Menu item does not use ingredients';end if;
 insert into public.recipe_ingredients(property_id,menu_item_id,stock_item_id,quantity_per_serving)
 values(p_property,p_menu_item,p_stock_item,p_quantity)
 on conflict(property_id,menu_item_id,stock_item_id) do update set quantity_per_serving=excluded.quantity_per_serving;
 insert into public.audit_events(property_id,actor_user_id,action,entity_type,entity_id,details)
 values(p_property,auth.uid(),'menu.recipe_updated','menu_item',p_menu_item,jsonb_build_object('stock_item',p_stock_item,'quantity_per_serving',p_quantity));
end;
$$;
revoke all on function public.set_hotel_recipe_ingredient(uuid,uuid,uuid,numeric) from public,anon;
grant execute on function public.set_hotel_recipe_ingredient(uuid,uuid,uuid,numeric) to authenticated;

create function public.create_hotel_restaurant_table(p_property uuid,p_label text,p_seats integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.has_staff_role(p_property,array['owner','manager','restaurant']) then raise exception 'Forbidden' using errcode='42501';end if;
 if length(trim(coalesce(p_label,''))) not between 1 and 70 or p_seats not between 1 and 40 then raise exception 'Invalid table';end if;
 insert into public.restaurant_tables(property_id,label,seats) values(p_property,trim(p_label),p_seats) returning id into v_id;
 insert into public.audit_events(property_id,actor_user_id,action,entity_type,entity_id) values(p_property,auth.uid(),'restaurant.table_created','restaurant_table',v_id);
 return v_id;
end;
$$;
revoke all on function public.create_hotel_restaurant_table(uuid,text,integer) from public,anon;
grant execute on function public.create_hotel_restaurant_table(uuid,text,integer) to authenticated;

create function public.open_restaurant_order(p_property uuid,p_table uuid,p_folio uuid,p_request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.has_staff_role(p_property,array['owner','manager','restaurant']) then raise exception 'Forbidden' using errcode='42501';end if;
 if not exists(select 1 from public.property_features where property_id=p_property and feature='restaurant' and enabled) then raise exception 'Restaurant disabled';end if;
 if p_request_key is null then raise exception 'Request key required';end if;
 if p_table is not null and not exists(select 1 from public.restaurant_tables where property_id=p_property and id=p_table and active) then raise exception 'Restaurant table not found';end if;
 if p_folio is not null and not exists(select 1 from public.folios f
 join public.reservations r on r.id=f.reservation_id and r.property_id=f.property_id
 where f.property_id=p_property and f.id=p_folio and r.status='checked_in') then raise exception 'Room-service folio is not checked in';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_property::text||':'||p_request_key::text,1));
 select id into v_id from public.restaurant_orders where property_id=p_property and request_key=p_request_key;
 if v_id is not null then return v_id;end if;
 insert into public.restaurant_orders(property_id,table_id,folio_id,request_key,created_by)
 values(p_property,p_table,p_folio,p_request_key,auth.uid()) returning id into v_id;
 return v_id;
end;
$$;
revoke all on function public.open_restaurant_order(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.open_restaurant_order(uuid,uuid,uuid,uuid) to authenticated;

create function public.add_restaurant_item(p_property uuid,p_order uuid,p_menu_item uuid,p_quantity numeric) returns void
language plpgsql security definer set search_path='' as $$
declare v_price bigint;
begin
 if not public.has_staff_role(p_property,array['owner','manager','restaurant']) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_quantity is null or p_quantity<=0 or p_quantity>1000 or p_quantity<>round(p_quantity,3) then raise exception 'Invalid quantity';end if;
 perform 1 from public.restaurant_orders where property_id=p_property and id=p_order and status='open' for update;
 if not found then raise exception 'Order is not open';end if;
 select price_minor into v_price from public.menu_items where property_id=p_property and id=p_menu_item and active;
 if not found then raise exception 'Menu item not found';end if;
 insert into public.restaurant_order_lines(property_id,order_id,menu_item_id,quantity,price_minor)
 values(p_property,p_order,p_menu_item,p_quantity,v_price)
 on conflict(property_id,order_id,menu_item_id) do update
 set quantity=public.restaurant_order_lines.quantity+excluded.quantity;
end;
$$;
revoke all on function public.add_restaurant_item(uuid,uuid,uuid,numeric) from public,anon;
grant execute on function public.add_restaurant_item(uuid,uuid,uuid,numeric) to authenticated;

create function public.finalize_restaurant_order(p_property uuid,p_order uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_order public.restaurant_orders%rowtype;v_total numeric;v_missing boolean;v_need record;v_balance numeric;
begin
 if not public.has_staff_role(p_property,array['owner','manager','restaurant']) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into v_order from public.restaurant_orders where property_id=p_property and id=p_order for update;
 if not found then raise exception 'Order not found';end if;
 if v_order.status='finalized' then return;end if;
 if v_order.status<>'open' then raise exception 'Cannot finalize this order';end if;
 select sum(quantity*price_minor) into v_total from public.restaurant_order_lines where property_id=p_property and order_id=p_order;
 if v_total is null then raise exception 'Order has no items';end if;
 if v_total<>trunc(v_total) or v_total>9223372036854775807 then raise exception 'Invalid order total';end if;
 select exists(select 1 from public.restaurant_order_lines l
 join public.menu_items i on i.id=l.menu_item_id and i.property_id=l.property_id
 where l.property_id=p_property and l.order_id=p_order and i.tracks_ingredients
 and not exists(select 1 from public.recipe_ingredients ri
 where ri.property_id=p_property and ri.menu_item_id=i.id)) into v_missing;
 if v_missing then raise exception 'Recipe missing for a stock-tracked item';end if;
 for v_need in
 select ri.stock_item_id,sum(ri.quantity_per_serving*l.quantity) as consumed
 from public.restaurant_order_lines l
 join public.menu_items i on i.id=l.menu_item_id and i.property_id=l.property_id and i.tracks_ingredients
 join public.recipe_ingredients ri on ri.property_id=l.property_id and ri.menu_item_id=i.id
 where l.property_id=p_property and l.order_id=p_order
 group by ri.stock_item_id order by ri.stock_item_id
 loop
 perform 1 from public.stock_items where property_id=p_property and id=v_need.stock_item_id and active for update;
 if not found then raise exception 'Required stock item unavailable';end if;
 select coalesce(sum(quantity_delta),0) into v_balance from public.stock_movements
 where property_id=p_property and stock_item_id=v_need.stock_item_id;
 if v_balance<v_need.consumed then raise exception 'Insufficient ingredient stock';end if;
 insert into public.stock_movements(property_id,stock_item_id,quantity_delta,reason,source_type,source_id,created_by)
 values(p_property,v_need.stock_item_id,-v_need.consumed,'sale','restaurant_order',p_order,auth.uid());
 end loop;
 if v_order.folio_id is not null then
 if not exists(select 1 from public.folios f join public.reservations r on r.id=f.reservation_id and r.property_id=f.property_id
 where f.property_id=p_property and f.id=v_order.folio_id and r.status='checked_in') then
 raise exception 'Room-service guest is no longer checked in';end if;
 insert into public.folio_entries(property_id,folio_id,kind,amount_minor,description,source_id)
 values(p_property,v_order.folio_id,'restaurant_charge',v_total,'Restaurant / room service',p_order);
 end if;
 update public.restaurant_orders set status='finalized',finalized_at=now() where id=p_order and property_id=p_property;
 insert into public.audit_events(property_id,actor_user_id,action,entity_type,entity_id,details)
 values(p_property,auth.uid(),'restaurant.order_finalized','restaurant_order',p_order,jsonb_build_object('total_minor',v_total));
end;
$$;
revoke all on function public.finalize_restaurant_order(uuid,uuid) from public,anon;
grant execute on function public.finalize_restaurant_order(uuid,uuid) to authenticated;

create function public.set_hotel_room_condition(p_property uuid,p_room uuid,p_condition text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.has_staff_role(p_property,array['owner','manager','front_desk','housekeeping']) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_condition not in ('ready','dirty','cleaning','maintenance') then raise exception 'Invalid room condition';end if;
 update public.rooms set condition=p_condition where property_id=p_property and id=p_room;
 if not found then raise exception 'Room not found';end if;
 insert into public.audit_events(property_id,actor_user_id,action,entity_type,entity_id,details)
 values(p_property,auth.uid(),'room.condition_changed','room',p_room,jsonb_build_object('condition',p_condition));
end;
$$;
revoke all on function public.set_hotel_room_condition(uuid,uuid,text) from public,anon;
grant execute on function public.set_hotel_room_condition(uuid,uuid,text) to authenticated;
