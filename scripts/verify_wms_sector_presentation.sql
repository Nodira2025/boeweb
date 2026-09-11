-- Transactional smoke test: all test rows and audit entries are rolled back.
BEGIN;
DO $$
DECLARE
  v_tenant UUID;
  v_actor UUID;
  v_row JSONB;
  v_revision INTEGER;
  v_photo_a TEXT;
  v_photo_b TEXT;
BEGIN
  SELECT tenant_id, user_id INTO v_tenant, v_actor FROM public.tenant_users
  WHERE active AND upper(role) IN ('ADMIN','SUPERVISOR') ORDER BY tenant_id, user_id LIMIT 1;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Se necesita un editor existente para esta prueba.'; END IF;
  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  SELECT COALESCE(MAX(revision),0) INTO v_revision FROM public.wms_sectors_v2 WHERE tenant_id=v_tenant AND code='S1';
  v_row := public.update_wms_sector_v2(v_tenant,'S1','Prueba transaccional','No se conserva',9,v_revision);
  IF (v_row->>'revision')::int <> v_revision+1 THEN RAISE EXCEPTION 'Revisión incorrecta'; END IF;
  BEGIN
    PERFORM public.update_wms_sector_v2(v_tenant,'S1','Conflicto','',1,v_revision);
    RAISE EXCEPTION 'Falta control de concurrencia';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.update_wms_sector_v2(v_tenant,'S1','Foto inválida','',1,v_revision+1,'replace','otro-tenant/S1/foto.jpg');
    RAISE EXCEPTION 'Se aceptó foto de otra tienda';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  v_photo_a := v_tenant::text || '/S1/' || gen_random_uuid()::text || '.jpg';
  v_photo_b := v_tenant::text || '/S1/' || gen_random_uuid()::text || '.jpg';
  -- Metadata fixtures only, inside this rollback. No storage files are uploaded.
  INSERT INTO storage.objects(bucket_id,name) VALUES('wms-sector-images',v_photo_a),('wms-sector-images',v_photo_b);
  v_row := public.update_wms_sector_v2(v_tenant,'S1','Foto A','',1,v_revision+1,'replace',v_photo_a);
  v_row := public.update_wms_sector_v2(v_tenant,'S1','Foto B','',1,v_revision+2,'replace',v_photo_b);
  v_row := public.update_wms_sector_v2(v_tenant,'S1','Restaurar A','',1,v_revision+3,'restore');
  IF v_row->>'photo_path' <> v_photo_a THEN RAISE EXCEPTION 'No se restauró la foto anterior'; END IF;
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  BEGIN
    PERFORM public.update_wms_sector_v2(v_tenant,'S1','Sin permisos','',1,v_revision+4);
    RAISE EXCEPTION 'Se permitió una edición sin pertenecer a la tienda';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
ROLLBACK;
SELECT 'Guardado, revisión, fotos y permisos: OK; prueba revertida' AS result;
