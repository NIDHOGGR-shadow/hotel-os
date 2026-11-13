-- Hotel OS, multi-image galleries for room categories and dishes.
-- No existing reservations, financial records or catalog images are deleted.
CREATE TABLE IF NOT EXISTS public.catalog_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('room-types','menu-items')),
  entity_id uuid NOT NULL,
  path text NOT NULL UNIQUE,
  caption text NOT NULL DEFAULT '' CHECK (length(caption) <= 120),
  position integer NOT NULL CHECK (position BETWEEN 1 AND 1000000),
  created_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS catalog_photos_entity_idx
  ON public.catalog_photos(property_id,kind,entity_id,position,created_at);

ALTER TABLE public.catalog_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Hotel staff can view catalog photos" ON public.catalog_photos;
CREATE POLICY "Hotel staff can view catalog photos" ON public.catalog_photos FOR SELECT TO authenticated
  USING (public.has_staff_role(property_id,ARRAY['owner','manager']));
REVOKE ALL ON public.catalog_photos FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.catalog_photos TO authenticated;

-- Fix ambiguity in the original policy: unqualified "name" in the subqueries
-- resolved to room_types.name / menu_items.name instead of storage.objects.name.
DROP POLICY IF EXISTS "Hotel media: authorized staff uploads" ON storage.objects;
CREATE POLICY "Hotel media: authorized staff uploads" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='hotel-media'
  AND CASE WHEN storage.objects.name ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(room-types|menu-items)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  THEN (
    public.has_staff_role(split_part(storage.objects.name,'/',1)::uuid,ARRAY['owner','manager'])
    AND (
      (split_part(storage.objects.name,'/',2)='room-types' AND EXISTS (
        SELECT 1 FROM public.room_types rt
        WHERE rt.property_id=split_part(storage.objects.name,'/',1)::uuid
          AND rt.id=split_part(storage.objects.name,'/',3)::uuid
      ))
      OR
      (split_part(storage.objects.name,'/',2)='menu-items' AND EXISTS (
        SELECT 1 FROM public.menu_items mi
        WHERE mi.property_id=split_part(storage.objects.name,'/',1)::uuid
          AND mi.id=split_part(storage.objects.name,'/',3)::uuid
      ))
    )
  ) ELSE false END
);

-- Storage cleanup requires both SELECT and DELETE under the user's own JWT.
-- Guests continue to view only approved photo URLs in the public catalog.
DROP POLICY IF EXISTS "Hotel media: staff photo metadata" ON storage.objects;
CREATE POLICY "Hotel media: staff photo metadata" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id='hotel-media'
  AND CASE WHEN storage.objects.name ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(room-types|menu-items)/'
  THEN public.has_staff_role(split_part(storage.objects.name,'/',1)::uuid,ARRAY['owner','manager'])
  ELSE false END
);
DROP POLICY IF EXISTS "Hotel media: staff photo removal" ON storage.objects;
CREATE POLICY "Hotel media: staff photo removal" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id='hotel-media'
  AND CASE WHEN storage.objects.name ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(room-types|menu-items)/'
  THEN public.has_staff_role(split_part(storage.objects.name,'/',1)::uuid,ARRAY['owner','manager'])
  ELSE false END
);

-- Preserve already uploaded cover photos when the referenced Storage object exists.
INSERT INTO public.catalog_photos(property_id,kind,entity_id,path,position,uploaded_by)
SELECT r.property_id,'room-types',r.id,r.image_path,1,NULL
FROM public.room_types r
WHERE r.image_path IS NOT NULL
  AND EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='hotel-media' AND o.name=r.image_path)
ON CONFLICT(path) DO NOTHING;
INSERT INTO public.catalog_photos(property_id,kind,entity_id,path,position,uploaded_by)
SELECT m.property_id,'menu-items',m.id,m.image_path,1,NULL
FROM public.menu_items m
WHERE m.image_path IS NOT NULL
  AND EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='hotel-media' AND o.name=m.image_path)
ON CONFLICT(path) DO NOTHING;

CREATE OR REPLACE FUNCTION public.hotel_manage_catalog_photo(
 p_property uuid, p_kind text, p_entity uuid, p_action text,
 p_photo uuid DEFAULT NULL, p_path text DEFAULT NULL, p_caption text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_found boolean;
 v_count integer;
 v_last integer;
 v_target uuid;
 v_target_order integer;
 v_photo_order integer;
 v_stored_path text;
 v_cover_path text;
 v_new_cover text;
 v_caption text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_staff_role(p_property,ARRAY['owner','manager']) THEN
    RAISE EXCEPTION 'Forbidden' USING errcode='42501';
  END IF;
  IF p_kind NOT IN ('room-types','menu-items')
     OR p_action NOT IN ('add','cover','remove','caption','move_up','move_down')
     OR p_entity IS NULL THEN
    RAISE EXCEPTION 'Invalid gallery operation' USING errcode='22023';
  END IF;

  -- Serialize edits to the same entity so parallel uploads cannot exceed seven.
  IF p_kind='room-types' THEN
    SELECT true INTO v_found FROM public.room_types
    WHERE property_id=p_property AND id=p_entity FOR UPDATE;
  ELSE
    SELECT true INTO v_found FROM public.menu_items
    WHERE property_id=p_property AND id=p_entity FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catalog item not found' USING errcode='22023'; END IF;

  IF p_action='add' THEN
    IF p_path IS NULL OR p_path NOT LIKE (p_property::text||'/'||p_kind||'/'||p_entity::text||'/%')
       OR p_path !~ '^[-0-9a-f]{36}/(room-types|menu-items)/[-0-9a-f]{36}/[-0-9a-f]{36}\.(jpg|jpeg|png|webp)$' THEN
      RAISE EXCEPTION 'Invalid image reference' USING errcode='22023';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='hotel-media' AND name=p_path) THEN
      RAISE EXCEPTION 'Image upload not found' USING errcode='22023';
    END IF;
    SELECT id INTO v_target FROM public.catalog_photos WHERE path=p_path
      AND property_id=p_property AND kind=p_kind AND entity_id=p_entity;
    IF FOUND THEN RETURN v_target; END IF;
    SELECT count(*),coalesce(max(position),0) INTO v_count,v_last FROM public.catalog_photos
      WHERE property_id=p_property AND kind=p_kind AND entity_id=p_entity;
    IF v_count>=7 THEN RAISE EXCEPTION 'Photo limit reached (maximum seven)' USING errcode='22023'; END IF;
    v_caption=left(btrim(coalesce(p_caption,'')),120);
    INSERT INTO public.catalog_photos(property_id,kind,entity_id,path,caption,position,uploaded_by)
      VALUES(p_property,p_kind,p_entity,p_path,v_caption,v_last+1,auth.uid()) RETURNING id INTO v_target;
    IF v_count=0 THEN
      IF p_kind='room-types' THEN
        UPDATE public.room_types SET image_path=p_path WHERE property_id=p_property AND id=p_entity;
      ELSE
        UPDATE public.menu_items SET image_path=p_path WHERE property_id=p_property AND id=p_entity;
      END IF;
    END IF;
    INSERT INTO public.audit_events(property_id,actor_user_id,action,entity_type,entity_id,details)
      VALUES(p_property,auth.uid(),'catalog.photo_added',p_kind,p_entity,
        pg_catalog.jsonb_build_object('photo_id',v_target,'caption',v_caption));
    RETURN v_target;
  END IF;

  IF p_photo IS NULL THEN RAISE EXCEPTION 'Photo identifier required' USING errcode='22023'; END IF;
  SELECT path,position INTO v_stored_path,v_photo_order
    FROM public.catalog_photos
    WHERE id=p_photo AND property_id=p_property AND kind=p_kind AND entity_id=p_entity
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Photo not found' USING errcode='22023'; END IF;
  IF p_kind='room-types' THEN
    SELECT image_path INTO v_cover_path FROM public.room_types WHERE property_id=p_property AND id=p_entity;
  ELSE
    SELECT image_path INTO v_cover_path FROM public.menu_items WHERE property_id=p_property AND id=p_entity;
  END IF;

  IF p_action='caption' THEN
    IF p_caption IS NULL OR length(btrim(p_caption))>120 THEN
      RAISE EXCEPTION 'Invalid photo caption' USING errcode='22023';
    END IF;
    UPDATE public.catalog_photos SET caption=btrim(p_caption) WHERE id=p_photo;
  ELSIF p_action='cover' THEN
    IF p_kind='room-types' THEN
      UPDATE public.room_types SET image_path=v_stored_path WHERE property_id=p_property AND id=p_entity;
    ELSE
      UPDATE public.menu_items SET image_path=v_stored_path WHERE property_id=p_property AND id=p_entity;
    END IF;
  ELSIF p_action='remove' THEN
    DELETE FROM public.catalog_photos WHERE id=p_photo;
    IF v_cover_path=v_stored_path THEN
      SELECT path INTO v_new_cover FROM public.catalog_photos
        WHERE property_id=p_property AND kind=p_kind AND entity_id=p_entity
        ORDER BY position,created_at,id LIMIT 1;
      IF p_kind='room-types' THEN
        UPDATE public.room_types SET image_path=v_new_cover WHERE property_id=p_property AND id=p_entity;
      ELSE
        UPDATE public.menu_items SET image_path=v_new_cover WHERE property_id=p_property AND id=p_entity;
      END IF;
    END IF;
  ELSIF p_action IN ('move_up','move_down') THEN
    IF p_action='move_up' THEN
      SELECT id,position INTO v_target,v_target_order FROM public.catalog_photos
        WHERE property_id=p_property AND kind=p_kind AND entity_id=p_entity
          AND (position,created_at,id)<(v_photo_order,
            (SELECT created_at FROM public.catalog_photos WHERE id=p_photo),p_photo)
        ORDER BY position DESC,created_at DESC,id DESC LIMIT 1;
    ELSE
      SELECT id,position INTO v_target,v_target_order FROM public.catalog_photos
        WHERE property_id=p_property AND kind=p_kind AND entity_id=p_entity
          AND (position,created_at,id)>(v_photo_order,
            (SELECT created_at FROM public.catalog_photos WHERE id=p_photo),p_photo)
        ORDER BY position,created_at,id LIMIT 1;
    END IF;
    IF v_target IS NOT NULL THEN
      UPDATE public.catalog_photos SET position=
        CASE WHEN id=p_photo THEN v_target_order WHEN id=v_target THEN v_photo_order ELSE position END
        WHERE id IN (p_photo,v_target);
    END IF;
  END IF;
  INSERT INTO public.audit_events(property_id,actor_user_id,action,entity_type,entity_id,details)
    VALUES(p_property,auth.uid(),'catalog.photo_'||p_action,p_kind,p_entity,
      pg_catalog.jsonb_build_object('photo_id',p_photo));
  RETURN p_photo;
END;
$$;
REVOKE ALL ON FUNCTION public.hotel_manage_catalog_photo(uuid,text,uuid,text,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hotel_manage_catalog_photo(uuid,text,uuid,text,uuid,text,text) TO authenticated;
