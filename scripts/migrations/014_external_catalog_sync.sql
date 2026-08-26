-- ===========================================================================
-- BÔ GROW CLUB / PLATAFORMA SAAS — MIGRACIÓN 014: CATÁLOGO EXTERNO V2
-- ===========================================================================
-- Las altas y precios de costo quedan restringidos a administración. El POS
-- sólo recibe ofertas activas y el precio de venta autoritativo del servidor.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_external_catalog_source_v2(
  p_tenant_id UUID,
  p_source_type TEXT,
  p_name TEXT,
  p_contact_info TEXT DEFAULT NULL,
  p_estimated_days INTEGER DEFAULT 2,
  p_active BOOLEAN DEFAULT true,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_source_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_id UUID := p_source_id;
  v_type TEXT := upper(btrim(COALESCE(p_source_type, '')));
  v_name TEXT := btrim(COALESCE(p_name, ''));
  v_contact TEXT := NULLIF(btrim(COALESCE(p_contact_info, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.status = 'ACTIVE'
  ) OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo administracion puede modificar proveedores externos.';
  END IF;
  IF v_type NOT IN ('B2B_SUPPLIER', 'LOCAL_STORE') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Tipo de fuente externa invalido.';
  END IF;
  IF length(v_name) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El nombre debe tener entre 1 y 255 caracteres.';
  END IF;
  IF v_contact IS NOT NULL AND length(v_contact) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El contacto no puede superar 500 caracteres.';
  END IF;
  IF COALESCE(p_estimated_days, -1) NOT BETWEEN 0 AND 365 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Los dias estimados deben estar entre 0 y 365.';
  END IF;
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Los metadatos deben ser un objeto JSON.';
  END IF;
  IF octet_length(COALESCE(p_metadata, '{}'::jsonb)::text) > 16384 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Los metadatos superan el limite permitido.';
  END IF;
  IF p_source_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.external_catalog_sources_v2
    WHERE tenant_id = p_tenant_id AND id = p_source_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'La fuente externa no existe en este tenant.';
  END IF;
  IF p_source_id IS NULL THEN
    INSERT INTO public.external_catalog_sources_v2 (
      tenant_id, id, source_type, name, contact_info, estimated_days,
      active, metadata, updated_at
    ) VALUES (
      p_tenant_id, gen_random_uuid(), v_type, v_name, v_contact, p_estimated_days,
      COALESCE(p_active, true), COALESCE(p_metadata, '{}'::jsonb), clock_timestamp()
    )
    ON CONFLICT (tenant_id, source_type, name) DO UPDATE
    SET contact_info = EXCLUDED.contact_info,
        estimated_days = EXCLUDED.estimated_days,
        active = EXCLUDED.active,
        metadata = EXCLUDED.metadata,
        updated_at = clock_timestamp()
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.external_catalog_sources_v2 (
      tenant_id, id, source_type, name, contact_info, estimated_days,
      active, metadata, updated_at
    ) VALUES (
      p_tenant_id, p_source_id, v_type, v_name, v_contact, p_estimated_days,
      COALESCE(p_active, true), COALESCE(p_metadata, '{}'::jsonb), clock_timestamp()
    )
    ON CONFLICT (tenant_id, id) DO UPDATE
    SET source_type = EXCLUDED.source_type,
        name = EXCLUDED.name,
        contact_info = EXCLUDED.contact_info,
        estimated_days = EXCLUDED.estimated_days,
        active = EXCLUDED.active,
        metadata = EXCLUDED.metadata,
        updated_at = clock_timestamp()
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'id', v_id, 'name', v_name,
    'source_type', v_type, 'estimated_days', p_estimated_days
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_external_catalog_offer_v2(
  p_tenant_id UUID,
  p_source_id UUID,
  p_external_sku TEXT,
  p_name TEXT,
  p_category TEXT DEFAULT 'General',
  p_cost_price NUMERIC DEFAULT 0,
  p_retail_price NUMERIC DEFAULT 0,
  p_available_units NUMERIC DEFAULT 0,
  p_active BOOLEAN DEFAULT true,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_offer_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_id UUID;
  v_sku TEXT := btrim(COALESCE(p_external_sku, ''));
  v_name TEXT := btrim(COALESCE(p_name, ''));
  v_category TEXT := NULLIF(btrim(COALESCE(p_category, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.status = 'ACTIVE'
  ) OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo administracion puede modificar ofertas externas.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.external_catalog_sources_v2
    WHERE tenant_id = p_tenant_id AND id = p_source_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Proveedor externo no encontrado.';
  END IF;
  IF length(v_sku) NOT BETWEEN 1 AND 120 OR length(v_name) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SKU o nombre de oferta invalido.';
  END IF;
  IF v_category IS NOT NULL AND length(v_category) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La categoria no puede superar 120 caracteres.';
  END IF;
  IF COALESCE(p_cost_price, -1) < 0 OR COALESCE(p_retail_price, 0) <= 0
     OR COALESCE(p_available_units, -1) < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Precios o disponibilidad invalidos.';
  END IF;
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Los metadatos deben ser un objeto JSON.';
  END IF;
  IF octet_length(COALESCE(p_metadata, '{}'::jsonb)::text) > 16384 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Los metadatos superan el limite permitido.';
  END IF;

  IF p_offer_id IS NOT NULL THEN
    SELECT id INTO v_id
    FROM public.external_catalog_offers_v2
    WHERE tenant_id = p_tenant_id AND id = p_offer_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'La oferta externa no existe en este tenant.';
    END IF;
  END IF;

  IF p_offer_id IS NULL THEN
    INSERT INTO public.external_catalog_offers_v2 (
      tenant_id, id, source_id, external_sku, name, category, cost_price,
      retail_price, available_units, active, metadata, updated_at
    ) VALUES (
      p_tenant_id, gen_random_uuid(), p_source_id, v_sku, v_name, v_category,
      round(p_cost_price, 2), round(p_retail_price, 2), p_available_units,
      COALESCE(p_active, true), COALESCE(p_metadata, '{}'::jsonb), clock_timestamp()
    )
    ON CONFLICT (tenant_id, source_id, external_sku) DO UPDATE
    SET name = EXCLUDED.name,
        category = EXCLUDED.category,
        cost_price = EXCLUDED.cost_price,
        retail_price = EXCLUDED.retail_price,
        available_units = EXCLUDED.available_units,
        active = EXCLUDED.active,
        metadata = EXCLUDED.metadata,
        updated_at = clock_timestamp()
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.external_catalog_offers_v2 (
      tenant_id, id, source_id, external_sku, name, category, cost_price,
      retail_price, available_units, active, metadata, updated_at
    ) VALUES (
      p_tenant_id, p_offer_id, p_source_id, v_sku, v_name, v_category,
      round(p_cost_price, 2), round(p_retail_price, 2), p_available_units,
      COALESCE(p_active, true), COALESCE(p_metadata, '{}'::jsonb), clock_timestamp()
    )
    ON CONFLICT (tenant_id, id) DO UPDATE
    SET source_id = EXCLUDED.source_id,
        external_sku = EXCLUDED.external_sku,
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        cost_price = EXCLUDED.cost_price,
        retail_price = EXCLUDED.retail_price,
        available_units = EXCLUDED.available_units,
        active = EXCLUDED.active,
        metadata = EXCLUDED.metadata,
        updated_at = clock_timestamp()
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'id', v_id, 'source_id', p_source_id,
    'external_sku', v_sku, 'name', v_name, 'retail_price', round(p_retail_price, 2)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_external_catalog_offers_v2(
  p_tenant_id UUID,
  p_source_id UUID DEFAULT NULL,
  p_query TEXT DEFAULT NULL,
  p_active_only BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_query TEXT := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_can_view_cost BOOLEAN := false;
  v_active_only BOOLEAN := true;
  v_result JSONB := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.status = 'ACTIVE'
  ) OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['VENDEDOR', 'SUPERVISOR', 'ADMIN']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Acceso denegado al catalogo externo.';
  END IF;
  IF v_query IS NOT NULL AND length(v_query) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La busqueda no puede superar 120 caracteres.';
  END IF;
  v_can_view_cost := public.operational_has_tenant_role(
    p_tenant_id, ARRAY['SUPERVISOR', 'ADMIN']::TEXT[]
  );
  -- Un vendedor nunca puede reactivar ofertas ocultas manipulando el filtro.
  v_active_only := COALESCE(p_active_only, true) OR NOT v_can_view_cost;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'source_id', o.source_id,
      'source_name', s.name,
      'source_type', s.source_type,
      'source_contact_info', s.contact_info,
      'estimated_days', s.estimated_days,
      'external_sku', o.external_sku,
      'name', o.name,
      'category', o.category,
      'cost_price', CASE WHEN v_can_view_cost THEN o.cost_price ELSE NULL END,
      'retail_price', o.retail_price,
      'available_units', o.available_units,
      'active', o.active,
      'metadata', CASE WHEN v_can_view_cost THEN o.metadata ELSE jsonb_strip_nulls(jsonb_build_object(
        'image_url', o.metadata->'image_url',
        'barcode', o.metadata->'barcode',
        'brand', o.metadata->'brand',
        'presentation', o.metadata->'presentation'
      )) END,
      'updated_at', o.updated_at
    ) ORDER BY s.name, o.name, o.id
  ), '[]'::jsonb)
  INTO v_result
  FROM public.external_catalog_offers_v2 o
  JOIN public.external_catalog_sources_v2 s
    ON s.tenant_id = o.tenant_id AND s.id = o.source_id
  WHERE o.tenant_id = p_tenant_id
    AND (p_source_id IS NULL OR o.source_id = p_source_id)
    AND (NOT v_active_only OR (o.active AND s.active))
    AND (
      v_query IS NULL
      OR o.name ILIKE '%' || v_query || '%'
      OR o.external_sku ILIKE '%' || v_query || '%'
      OR s.name ILIKE '%' || v_query || '%'
    );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_external_catalog_source_v2(UUID, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, JSONB, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_external_catalog_offer_v2(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, JSONB, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_external_catalog_offers_v2(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_external_catalog_source_v2(UUID, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_external_catalog_offer_v2(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_external_catalog_offers_v2(UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;

INSERT INTO public.schema_migrations (version, name, checksum, backward_compatible, applied_by)
VALUES ('014', 'external_catalog_sync', 'sha256-external-catalog-sync-014-v2', true, 'migration-engine')
ON CONFLICT (version) DO NOTHING;

COMMIT;
