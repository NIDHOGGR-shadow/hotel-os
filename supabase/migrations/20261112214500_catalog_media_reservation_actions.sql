-- Hotel OS: audited reservation close-out and role-protected marketing images.
-- Additive changes; existing bookings, payments and staff roles remain intact.
ALTER TABLE public.room_types ADD COLUMN IF NOT EXISTS image_path text;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS image_path text;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('hotel-media','hotel-media',true,5242880,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Hotel media: authorized staff uploads" ON storage.objects;
CREATE POLICY "Hotel media: authorized staff uploads"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='hotel-media'
  AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(room-types|menu-items)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  AND public.has_staff_role((split_part(name,'/',1))::uuid,ARRAY['owner','manager'])
  AND (
    (split_part(name,'/',2)='room-types'
      AND EXISTS (SELECT 1 FROM public.room_types r
        WHERE r.property_id=split_part(name,'/',1)::uuid AND r.id=split_part(name,'/',3)::uuid))
    OR
    (split_part(name,'/',2)='menu-items'
      AND EXISTS (SELECT 1 FROM public.menu_items m
        WHERE m.property_id=split_part(name,'/',1)::uuid AND m.id=split_part(name,'/',3)::uuid))
  )
);

CREATE OR REPLACE FUNCTION public.hotel_set_catalog_image(p_property uuid,p_kind text,p_entity uuid,p_path text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_prefix text;
BEGIN
  IF NOT public.has_staff_role(p_property,ARRAY['owner','manager']) THEN
    RAISE EXCEPTION 'Forbidden' USING errcode='42501';
  END IF;
  IF p_property IS NULL OR p_entity IS NULL OR p_kind NOT IN ('room-types','menu-items') OR p_path IS NULL THEN
    RAISE EXCEPTION 'Invalid image reference' USING errcode='22023';
  END IF;
  v_prefix=p_property::text||'/'||p_kind||'/'||p_entity::text||'/';
  IF left(p_path,length(v_prefix))<>v_prefix
     OR substring(p_path from length(v_prefix)+1) !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}\.(jpg|jpeg|png|webp)$' THEN
    RAISE EXCEPTION 'Invalid image reference' USING errcode='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects s WHERE s.bucket_id='hotel-media' AND s.name=p_path) THEN
    RAISE EXCEPTION 'Image upload not found' USING errcode='22023';
  END IF;
  IF p_kind='room-types' THEN
    UPDATE public.room_types SET image_path=p_path WHERE property_id=p_property AND id=p_entity;
  ELSE
    UPDATE public.menu_items SET image_path=p_path WHERE property_id=p_property AND id=p_entity;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catalog item not found' USING errcode='22023'; END IF;
  INSERT INTO public.audit_events(property_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(p_property,auth.uid(),'catalog.photo_updated',CASE WHEN p_kind='room-types' THEN 'room_type' ELSE 'menu_item' END,
         p_entity,pg_catalog.jsonb_build_object('path',p_path));
  RETURN p_entity;
END;
$$;
REVOKE ALL ON FUNCTION public.hotel_set_catalog_image(uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hotel_set_catalog_image(uuid,text,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.hotel_close_reservation(p_property uuid,p_reservation uuid,p_status text,p_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_old text;v_arrival date;v_today date;v_timezone text;
BEGIN
  IF NOT public.has_staff_role(p_property,ARRAY['owner','manager','front_desk']) THEN
    RAISE EXCEPTION 'Forbidden' USING errcode='42501';
  END IF;
  IF p_status NOT IN ('cancelled','no_show') THEN
    RAISE EXCEPTION 'Invalid status transition' USING errcode='22023';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 10 OR length(p_note)>1000 THEN
    RAISE EXCEPTION 'Please record a reason (at least 10 characters)' USING errcode='22023';
  END IF;
  SELECT status,check_in INTO v_old,v_arrival
  FROM public.reservations
  WHERE property_id=p_property AND id=p_reservation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found' USING errcode='22023'; END IF;
  IF v_old<>'confirmed' THEN RAISE EXCEPTION 'Invalid status transition' USING errcode='22023'; END IF;
  SELECT timezone INTO v_timezone FROM public.properties WHERE id=p_property;
  v_today=(now() AT TIME ZONE coalesce(v_timezone,'Africa/Lagos'))::date;
  IF p_status='no_show' AND v_arrival>v_today THEN
    RAISE EXCEPTION 'Cannot mark no-show before check-in date' USING errcode='22023';
  END IF;
  UPDATE public.reservations
  SET status=p_status,updated_at=now()
  WHERE property_id=p_property AND id=p_reservation;
  INSERT INTO public.audit_events(property_id,actor_user_id,action,entity_type,entity_id,details)
  VALUES(p_property,auth.uid(),'reservation.closed','reservation',p_reservation,
   pg_catalog.jsonb_build_object('from',v_old,'to',p_status,'reason',btrim(p_note),'refund_automatic',false));
  RETURN p_reservation;
END;
$$;
REVOKE ALL ON FUNCTION public.hotel_close_reservation(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hotel_close_reservation(uuid,uuid,text,text) TO authenticated;