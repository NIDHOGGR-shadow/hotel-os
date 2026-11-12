alter table public.menu_items add column category text not null default 'Mains' check(length(btrim(category)) between 1 and 60);
alter table public.menu_items add column description text not null default '' check(length(description)<=360);

create function public.hotel_save_menu_item(p_property uuid,p_item uuid,p_name text,p_price_minor bigint,p_category text,p_description text,p_tracks_ingredients boolean,p_active boolean)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_existing boolean;
begin
  if auth.uid() is null or not public.has_staff_role(p_property,array['owner','manager','restaurant']) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if p_item is null or p_name is null or length(btrim(p_name)) not between 2 and 140
    or p_price_minor is null or p_price_minor<=0 or p_price_minor>100000000000
    or p_category is null or length(btrim(p_category)) not between 1 and 60
    or length(coalesce(p_description,''))>360 or p_tracks_ingredients is null or p_active is null then
    raise exception 'Invalid menu item' using errcode='22023';
  end if;
  if not exists(select 1 from public.property_features where property_id=p_property and feature='restaurant' and enabled) then
    raise exception 'Restaurant disabled';
  end if;
  select exists(select 1 from public.menu_items where property_id=p_property and id=p_item) into v_existing;
  if v_existing then
    update public.menu_items set name=btrim(p_name),price_minor=p_price_minor,category=btrim(p_category),
      description=btrim(coalesce(p_description,'')),tracks_ingredients=p_tracks_ingredients,active=p_active
      where property_id=p_property and id=p_item;
  else
    insert into public.menu_items(id,property_id,name,price_minor,category,description,tracks_ingredients,active)
    values(p_item,p_property,btrim(p_name),p_price_minor,btrim(p_category),btrim(coalesce(p_description,'')),p_tracks_ingredients,p_active);
  end if;
  insert into public.audit_events(property_id,actor_user_id,action,entity_type,entity_id,details)
  values(p_property,auth.uid(),case when v_existing then 'menu.item_updated' else 'menu.item_created' end,'menu_item',p_item,
    pg_catalog.jsonb_build_object('price_minor',p_price_minor,'active',p_active));
  return p_item;
end;
$$;
revoke all on function public.hotel_save_menu_item(uuid,uuid,text,bigint,text,text,boolean,boolean) from public,anon;
grant execute on function public.hotel_save_menu_item(uuid,uuid,text,bigint,text,text,boolean,boolean) to authenticated;
