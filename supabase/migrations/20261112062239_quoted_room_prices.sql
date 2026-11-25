-- Compare the displayed quote before creating any guest, reservation or hold.
-- Hold the category rate stable until the existing allocation transaction ends.
create function public.hotel_create_quoted_checkout(
  p_property uuid,p_room_type uuid,p_check_in date,p_check_out date,p_guests integer,
  p_name text,p_email text,p_phone text,p_reference text,p_quoted_rate_minor bigint
) returns table(reference text,amount_minor bigint,currency text)
language plpgsql security definer set search_path=''
as $$
declare v_rate bigint;
begin
  if p_quoted_rate_minor is null or p_quoted_rate_minor<=0 then
    raise exception 'Room price changed' using errcode='P0001';
  end if;
  select t.nightly_rate_minor into v_rate
  from public.room_types t
  where t.property_id=p_property and t.id=p_room_type and t.active
  for share of t;
  if not found or v_rate<>p_quoted_rate_minor then
    raise exception 'Room price changed' using errcode='P0001';
  end if;
  return query select * from public.hotel_create_checkout(
    p_property,p_room_type,p_check_in,p_check_out,p_guests,p_name,p_email,p_phone,p_reference
  );
end;
$$;
revoke all on function public.hotel_create_quoted_checkout(uuid,uuid,date,date,integer,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.hotel_create_quoted_checkout(uuid,uuid,date,date,integer,text,text,text,text,bigint) to service_role;
