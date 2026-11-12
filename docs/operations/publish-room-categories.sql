-- Owner-requested production catalogue, 12 November 2026.
-- Rates are kobo: Standard NGN 1,000; Deluxe 2,000; Special 3,000;
-- Presidential 4,000 per night. Identical rooms share a category and rate.
-- Preserve the existing room/category IDs and all reservation price snapshots.
begin;

update public.room_types
set name='Deluxe Room', nightly_rate_minor=200000
where property_id='9b94682e-0d57-4030-8e3e-a6c61f025ae7'
  and id='b279b9ad-106c-46dd-8423-fde2bc1fb61f'
  and name in ('Sample Deluxe Room','Deluxe Room');

insert into public.room_types(property_id,name,capacity,nightly_rate_minor,active)
values
  ('9b94682e-0d57-4030-8e3e-a6c61f025ae7','Standard Room',2,100000,true),
  ('9b94682e-0d57-4030-8e3e-a6c61f025ae7','Deluxe Room',2,200000,true),
  ('9b94682e-0d57-4030-8e3e-a6c61f025ae7','Special Room',2,300000,true),
  ('9b94682e-0d57-4030-8e3e-a6c61f025ae7','Presidential Room',2,400000,true)
on conflict(property_id,name) do update
set nightly_rate_minor=excluded.nightly_rate_minor;

update public.rooms
set room_number='201', floor_label=null
where property_id='9b94682e-0d57-4030-8e3e-a6c61f025ae7'
  and id='78fe59ec-a54f-4711-a3f2-352ceb452532'
  and room_number in ('SAMPLE-101','201');

insert into public.rooms(property_id,room_type_id,room_number,active,condition)
select rt.property_id,rt.id,units.room_number,true,'ready'
from (values
  ('Standard Room','101'),('Standard Room','102'),('Standard Room','103'),
  ('Standard Room','104'),('Standard Room','105'),
  ('Deluxe Room','201'),('Deluxe Room','202'),('Deluxe Room','203'),('Deluxe Room','204'),
  ('Special Room','301'),('Special Room','302'),('Special Room','303'),
  ('Presidential Room','401'),('Presidential Room','402')
) as units(category,room_number)
join public.room_types rt on rt.name=units.category
  and rt.property_id='9b94682e-0d57-4030-8e3e-a6c61f025ae7'
on conflict(property_id,room_number) do nothing;

commit;
