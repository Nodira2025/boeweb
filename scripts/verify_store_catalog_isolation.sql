-- Diagnostic changes are invisible to other sessions and always rolled back.
BEGIN;
DO $$
DECLARE
  v_tenant UUID := '11111111-1111-1111-1111-111111111111';
  v_product UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.public_catalog_products_v2 visible
    JOIN public.catalog_products product ON product.tenant_id = visible.tenant_id AND product.id = visible.id
    WHERE public.is_private_catalog_product_v2(product.category, product.metadata)) THEN
    RAISE EXCEPTION 'A private product remains public';
  END IF;
  IF NOT has_table_privilege('anon', 'public.public_external_catalog_v2', 'SELECT') THEN
    RAISE EXCEPTION 'Anonymous public catalog read unavailable';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name = 'public_external_catalog_v2' AND column_name IN ('cost_price', 'contact_info', 'metadata')) THEN
    RAISE EXCEPTION 'Private supplier fields are exposed';
  END IF;
  SELECT id INTO v_product FROM public.catalog_products WHERE tenant_id = v_tenant
    AND public.is_private_catalog_product_v2(category, metadata) LIMIT 1;
  IF v_product IS NOT NULL THEN
    BEGIN
      INSERT INTO public.public_orders_v2(tenant_id, items)
      VALUES (v_tenant, jsonb_build_array(jsonb_build_object('product_id', v_product)));
      RAISE EXCEPTION 'Private public order was accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END IF;
  UPDATE public.tenant_app_config SET config_json = jsonb_set(config_json, '{catalog,source}', '"internal"')
  WHERE tenant_id = v_tenant AND stage = 'published';
  IF EXISTS (SELECT 1 FROM public.public_external_catalog_v2 WHERE tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Internal-only config still exposes external products';
  END IF;
  UPDATE public.tenant_app_config SET config_json = jsonb_set(config_json, '{catalog,visibility}', '"private"')
  WHERE tenant_id = v_tenant AND stage = 'published';
  IF EXISTS (SELECT 1 FROM public.public_catalog_products_v2 WHERE tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Private config still exposes shop products';
  END IF;
END;
$$;
SELECT 'Exclusión, permisos y configuración global: OK. Cambios de prueba revertidos.' AS result;
ROLLBACK;
