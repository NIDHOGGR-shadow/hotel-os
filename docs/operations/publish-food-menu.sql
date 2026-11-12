-- Initial editable menu, authorized for the production-first property build.
-- Price benchmarks: Lagos Continental's published in-room dining price menu.
-- Generic item names are our own labels; descriptions, hours and tax policies are
-- not copied. These are HOTEL's initial configured prices, not a claim of current
-- competitor prices or a sale/stock record. Existing menu rows are preserved.
insert into public.menu_items(property_id,name,price_minor,category,description,tracks_ingredients,active)
select '9b94682e-0d57-4030-8e3e-a6c61f025ae7',v.name,v.price_minor,v.category,'',false,true
from (values
  ('Nigerian breakfast',2400000::bigint,'Breakfast'),
  ('American breakfast',2400000::bigint,'Breakfast'),
  ('French toast',600000::bigint,'Breakfast'),
  ('Roast chicken with jollof',3800000::bigint,'Mains'),
  ('Tomato pasta',2200000::bigint,'Mains'),
  ('Grilled fish',3600000::bigint,'Mains'),
  ('Beef steak',4000000::bigint,'Mains'),
  ('Nigerian pepper soup',1600000::bigint,'Local favourites'),
  ('Suya platter',2800000::bigint,'Local favourites'),
  ('Local soup and swallow',2800000::bigint,'Local favourites'),
  ('Cheesecake',750000::bigint,'Desserts'),
  ('Chocolate brownie',1100000::bigint,'Desserts')
) as v(name,price_minor,category)
where not exists(select 1 from public.menu_items i where i.property_id='9b94682e-0d57-4030-8e3e-a6c61f025ae7' and lower(i.name)=lower(v.name))
returning name,price_minor,category;
