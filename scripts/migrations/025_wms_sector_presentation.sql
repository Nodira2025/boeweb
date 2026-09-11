-- Presentation only: does not change inventory locations, balances or quantities.
BEGIN;

CREATE TABLE public.wms_sectors_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  code TEXT NOT NULL CHECK (code ~ '^S[1-6]$'),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 240),
  sort_order INTEGER NOT NULL CHECK (sort_order BETWEEN 1 AND 999),
  photo_path TEXT,
  previous_photo_path TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, code),
  CHECK (photo_path IS NULL OR photo_path LIKE tenant_id::text || '/' || code || '/%'),
  CHECK (previous_photo_path IS NULL OR previous_photo_path LIKE tenant_id::text || '/' || code || '/%')
);

ALTER TABLE public.wms_sectors_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wms_sectors_v2 FROM anon, authenticated;
GRANT SELECT ON public.wms_sectors_v2 TO authenticated;
GRANT ALL ON public.wms_sectors_v2 TO service_role;
CREATE POLICY wms_sectors_read ON public.wms_sectors_v2 FOR SELECT TO authenticated
USING (public.operational_has_tenant_role(tenant_id, ARRAY['ADMIN','SUPERVISOR','VENDEDOR','CAJERO','DEPOSITO']::TEXT[]));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('wms-sector-images', 'wms-sector-images', false, 2097152, ARRAY['image/jpeg','image/png','image/webp']);

-- A private bucket; only the same store's staff can read its reference photos.
CREATE POLICY wms_sector_images_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'wms-sector-images' AND EXISTS (
  SELECT 1 FROM public.tenants t WHERE t.id::text = (storage.foldername(name))[1]
  AND public.operational_has_tenant_role(t.id, ARRAY['ADMIN','SUPERVISOR','VENDEDOR','CAJERO','DEPOSITO']::TEXT[])
));
CREATE POLICY wms_sector_images_upload ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'wms-sector-images'
  AND name ~ '^[0-9a-f-]{36}/S[1-6]/[0-9a-f-]{36}\.(jpg|png|webp)$'
  AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id::text = (storage.foldername(name))[1]
    AND public.operational_has_tenant_role(t.id, ARRAY['ADMIN','SUPERVISOR']::TEXT[]))
);
-- No overwrite/delete policy: previous photos remain recoverable.

CREATE FUNCTION public.update_wms_sector_v2(
  p_tenant_id UUID, p_code TEXT, p_name TEXT, p_description TEXT,
  p_sort_order INTEGER, p_expected_revision INTEGER,
  p_photo_action TEXT DEFAULT 'keep', p_photo_path TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp SET row_security = off
AS $$
DECLARE
  v_before public.wms_sectors_v2%ROWTYPE;
  v_after public.wms_sectors_v2%ROWTYPE;
  v_photo TEXT;
  v_previous TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN','SUPERVISOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo administración o supervisión puede editar sectores.';
  END IF;
  IF p_code IS NULL OR p_code !~ '^S[1-6]$'
    OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 80
    OR p_description IS NULL OR length(p_description) > 240
    OR p_sort_order IS NULL OR p_sort_order NOT BETWEEN 1 AND 999
    OR p_expected_revision IS NULL OR p_expected_revision < 0
    OR p_photo_action IS NULL OR p_photo_action NOT IN ('keep','replace','restore','reset') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Los datos del sector no son válidos.';
  END IF;
  -- Lock also covers first publication, when a row does not exist yet.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':wms-sector:' || p_code, 0));
  SELECT * INTO v_before FROM public.wms_sectors_v2 WHERE tenant_id = p_tenant_id AND code = p_code FOR UPDATE;
  IF COALESCE(v_before.revision, 0) <> p_expected_revision THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Otra persona actualizó este sector. Recargá los datos antes de guardar.';
  END IF;
  v_photo := v_before.photo_path;
  v_previous := v_before.previous_photo_path;
  IF p_photo_action = 'replace' THEN
    IF p_photo_path IS NULL OR p_photo_path NOT LIKE p_tenant_id::text || '/' || p_code || '/%'
      OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'wms-sector-images' AND name = p_photo_path) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Primero debe subirse una imagen válida para este sector.';
    END IF;
    v_previous := v_photo;
    v_photo := p_photo_path;
  ELSIF p_photo_action = 'restore' THEN
    IF v_previous IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'No hay una foto anterior para recuperar.';
    END IF;
    v_photo := v_previous;
    v_previous := v_before.photo_path;
  ELSIF p_photo_action = 'reset' THEN
    v_previous := COALESCE(v_photo, v_previous);
    v_photo := NULL;
  END IF;
  INSERT INTO public.wms_sectors_v2 (tenant_id, code, name, description, sort_order,
    photo_path, previous_photo_path, revision, updated_by)
  VALUES (p_tenant_id, p_code, btrim(p_name), btrim(p_description), p_sort_order,
    v_photo, v_previous, 1, auth.uid())
  ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name,
    description = EXCLUDED.description, sort_order = EXCLUDED.sort_order,
    photo_path = EXCLUDED.photo_path, previous_photo_path = EXCLUDED.previous_photo_path,
    revision = wms_sectors_v2.revision + 1, updated_by = auth.uid(), updated_at = clock_timestamp()
  RETURNING * INTO v_after;
  INSERT INTO public.operational_audit_log (tenant_id, actor_user_id, action, entity_type,
    entity_id, before_data, after_data)
  VALUES (p_tenant_id, auth.uid(), 'WMS_SECTOR_UPDATED', 'WMS_SECTOR_V2', v_after.id,
    CASE WHEN v_before.id IS NULL THEN NULL ELSE to_jsonb(v_before) END, to_jsonb(v_after));
  RETURN to_jsonb(v_after);
END;
$$;
REVOKE ALL ON FUNCTION public.update_wms_sector_v2(UUID,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_wms_sector_v2(UUID,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT) TO authenticated;

INSERT INTO public.schema_migrations (version, name, checksum, backward_compatible, applied_by)
VALUES ('025', 'wms_sector_presentation', 'sha256-wms-sector-presentation-025-v1', true, 'migration-engine');
COMMIT;
