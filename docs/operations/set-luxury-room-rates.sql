-- Owner requested NGN 400,000 upwards, retaining the original 1:2:3:4 ratio.
-- Explicit target values make reapplication safe; no compound multiplication.
-- Existing reservation and checkout-session amounts are not changed.
update public.room_types rt
set nightly_rate_minor=prices.rate_minor
from (values
  ('Standard Room',40000000::bigint),
  ('Deluxe Room',80000000::bigint),
  ('Special Room',120000000::bigint),
  ('Presidential Room',160000000::bigint)
) as prices(name,rate_minor)
where rt.property_id='9b94682e-0d57-4030-8e3e-a6c61f025ae7' and rt.name=prices.name
returning rt.id,rt.name,rt.nightly_rate_minor;
