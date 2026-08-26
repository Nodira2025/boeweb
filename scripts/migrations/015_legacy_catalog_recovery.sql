-- ===========================================================================
-- BÔ GROW CLUB — MIGRACIÓN 015: RECUPERACIÓN DE CATÁLOGOS LEGACY
-- ===========================================================================
-- Recupera, sin borrar las fuentes históricas:
--   1. Stock físico local_store -> catálogo/inventario canónico.
--   2. Proveedores legacy -> catálogo externo tenant-scoped.
-- Las cantidades físicas anómalas quedan en revisión y nunca se copian a stock.
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.catalog_recovery_review_v2 (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  source_table TEXT NOT NULL CHECK (source_table IN ('products', 'supplier_products')),
  source_row_id TEXT NOT NULL CHECK (length(btrim(source_row_id)) BETWEEN 1 AND 255),
  issue_code TEXT NOT NULL CHECK (issue_code IN ('SUSPICIOUS_STOCK', 'INVALID_PRICE', 'SKU_CONFLICT')),
  product_name TEXT,
  reported_stock NUMERIC,
  reported_price NUMERIC,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RESOLVED', 'IGNORED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  PRIMARY KEY (id),
  UNIQUE (tenant_id, source_table, source_row_id, issue_code),
  CONSTRAINT catalog_recovery_review_resolver_fk
    FOREIGN KEY (tenant_id, resolved_by)
    REFERENCES public.tenant_users(tenant_id, user_id)
    ON DELETE RESTRICT
);

ALTER TABLE public.catalog_recovery_review_v2 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalog_recovery_review_admin_read_v2
  ON public.catalog_recovery_review_v2;
CREATE POLICY catalog_recovery_review_admin_read_v2
  ON public.catalog_recovery_review_v2
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin() OR public.operational_has_tenant_role(
      tenant_id,
      ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
    )
  );

REVOKE ALL ON public.catalog_recovery_review_v2 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.catalog_recovery_review_v2 TO authenticated, service_role;

-- Compatibilidad controlada con la ficha enriquecida histórica. La consulta
-- dinámica permite que 015 siga siendo instalable cuando product_drafts no
-- existe, sin perder barcode/ubicación donde sí está disponible.
CREATE OR REPLACE FUNCTION public._legacy_product_draft_json_v2(p_product_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_result JSONB := '{}'::jsonb;
BEGIN
  IF to_regclass('public.product_drafts') IS NULL
     OR NULLIF(btrim(COALESCE(p_product_code, '')), '') IS NULL THEN
    RETURN v_result;
  END IF;

  EXECUTE $query$
    SELECT to_jsonb(draft)
    FROM public.product_drafts draft
    WHERE draft.status = 'APPROVED'
      AND draft.product_code = $1
    ORDER BY draft.updated_at DESC NULLS LAST,
      draft.created_at DESC NULLS LAST,
      draft.id DESC
    LIMIT 1
  $query$
  INTO v_result
  USING p_product_code;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public._legacy_product_draft_json_v2(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE UNIQUE INDEX IF NOT EXISTS external_catalog_sources_legacy_identity_uidx
  ON public.external_catalog_sources_v2 (
    tenant_id,
    source_type,
    (metadata->>'legacy_supplier_id')
  )
  WHERE metadata->>'migration_source' = '015_legacy_catalog_recovery'
    AND NULLIF(metadata->>'legacy_supplier_id', '') IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Función privada: recupera productos físicos históricos una sola vez.
-- El stock sólo se abre si está dentro del límite seguro configurado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._recover_legacy_local_catalog_v2(
  p_tenant_id UUID,
  p_max_safe_stock NUMERIC DEFAULT 100000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_default_location_id UUID;
  v_catalog_count INTEGER := 0;
  v_balance_count INTEGER := 0;
  v_review_count INTEGER := 0;
BEGIN
  IF to_regclass('public.products') IS NULL
     OR to_regclass('public.supplier_products') IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'LEGACY_TABLES_NOT_PRESENT',
      'catalog_products', 0,
      'inventory_balances', 0,
      'pending_review', 0
    );
  END IF;

  IF p_max_safe_stock IS NULL OR p_max_safe_stock <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El límite de stock seguro debe ser positivo.';
  END IF;

  SELECT il.id
  INTO v_default_location_id
  FROM public.inventory_locations_v2 il
  WHERE il.tenant_id = p_tenant_id
    AND il.active = true
    AND il.is_sellable = true
    AND il.is_default = true
  LIMIT 1;

  IF v_default_location_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'No existe una ubicación default activa y vendible para recuperar stock.';
  END IF;

  INSERT INTO public.catalog_recovery_review_v2 (
    tenant_id, source_table, source_row_id, issue_code, product_name,
    reported_stock, reported_price, metadata, last_seen_at
  )
  SELECT
    p_tenant_id,
    'supplier_products',
    sp.id::text,
    'SUSPICIOUS_STOCK',
    left(COALESCE(NULLIF(btrim(sp.name), ''), NULLIF(btrim(p.name), ''), 'Producto heredado'), 255),
    sp.stock,
    sp.price,
    jsonb_build_object(
      'supplier_id', sp.supplier_id,
      'supplier_product_id', sp.supplier_product_id,
      'mapped_product_id', sp.mapped_product_id,
      'safe_stock_imported', 0,
      'max_safe_stock', p_max_safe_stock
    ),
    clock_timestamp()
  FROM public.supplier_products sp
  LEFT JOIN public.products p
    ON p.id = COALESCE(NULLIF(btrim(sp.mapped_product_id), ''), NULLIF(btrim(sp.supplier_product_id), ''))
  WHERE sp.supplier_id = 'local_store'
    AND (COALESCE(sp.stock, 0) < 0 OR COALESCE(sp.stock, 0) > p_max_safe_stock)
  ON CONFLICT (tenant_id, source_table, source_row_id, issue_code) DO UPDATE
  SET product_name = EXCLUDED.product_name,
      reported_stock = EXCLUDED.reported_stock,
      reported_price = EXCLUDED.reported_price,
      metadata = EXCLUDED.metadata,
      last_seen_at = clock_timestamp();

  INSERT INTO public.catalog_recovery_review_v2 (
    tenant_id, source_table, source_row_id, issue_code, product_name,
    reported_stock, reported_price, metadata, last_seen_at
  )
  SELECT
    p_tenant_id,
    'supplier_products',
    supplier.id::text,
    'SKU_CONFLICT',
    left(COALESCE(NULLIF(btrim(product.name), ''), NULLIF(btrim(supplier.name), ''), 'Producto heredado'), 255),
    supplier.stock,
    supplier.price,
    jsonb_build_object(
      'sku', conflict.sku,
      'existing_catalog_product_id', conflict.id,
      'resolution', 'No se importó stock ni se sobrescribió el producto canónico existente.'
    ),
    clock_timestamp()
  FROM public.supplier_products supplier
  LEFT JOIN public.products product
    ON product.id = COALESCE(NULLIF(btrim(supplier.mapped_product_id), ''), NULLIF(btrim(supplier.supplier_product_id), ''))
  JOIN public.catalog_products conflict
    ON conflict.tenant_id = p_tenant_id
   AND conflict.sku = left(COALESCE(
     NULLIF(btrim(supplier.mapped_product_id), ''),
     NULLIF(btrim(supplier.supplier_product_id), ''),
     'LEGACY-LOCAL-' || supplier.id::text
   ), 120)
   AND COALESCE(conflict.metadata->>'migration_source', '') <> '015_legacy_catalog_recovery'
  WHERE supplier.supplier_id = 'local_store'
  ON CONFLICT (tenant_id, source_table, source_row_id, issue_code) DO UPDATE
  SET product_name = EXCLUDED.product_name,
      reported_stock = EXCLUDED.reported_stock,
      reported_price = EXCLUDED.reported_price,
      metadata = EXCLUDED.metadata,
      last_seen_at = clock_timestamp();

  INSERT INTO public.catalog_recovery_review_v2 (
    tenant_id, source_table, source_row_id, issue_code, product_name,
    reported_stock, reported_price, metadata, last_seen_at
  )
  SELECT
    p_tenant_id,
    'supplier_products',
    sp.id::text,
    'INVALID_PRICE',
    left(COALESCE(NULLIF(btrim(sp.name), ''), NULLIF(btrim(p.name), ''), 'Producto heredado'), 255),
    sp.stock,
    sp.price,
    jsonb_build_object(
      'supplier_id', sp.supplier_id,
      'supplier_product_id', sp.supplier_product_id,
      'mapped_product_id', sp.mapped_product_id
    ),
    clock_timestamp()
  FROM public.supplier_products sp
  LEFT JOIN public.products p
    ON p.id = COALESCE(NULLIF(btrim(sp.mapped_product_id), ''), NULLIF(btrim(sp.supplier_product_id), ''))
  WHERE sp.supplier_id = 'local_store'
    AND COALESCE(sp.price, 0) <= 0
  ON CONFLICT (tenant_id, source_table, source_row_id, issue_code) DO UPDATE
  SET product_name = EXCLUDED.product_name,
      reported_stock = EXCLUDED.reported_stock,
      reported_price = EXCLUDED.reported_price,
      metadata = EXCLUDED.metadata,
      last_seen_at = clock_timestamp();

  WITH legacy_local AS (
    SELECT DISTINCT ON (legacy.sku)
      legacy.*
    FROM (
      SELECT
        sp.id::text AS source_row_id,
        left(COALESCE(
          NULLIF(btrim(sp.mapped_product_id), ''),
          NULLIF(btrim(sp.supplier_product_id), ''),
          'LEGACY-LOCAL-' || sp.id::text
        ), 120) AS sku,
        left(COALESCE(
          NULLIF(btrim(draft.details->>'barcode'), ''),
          NULLIF(btrim(to_jsonb(sp)->>'barcode'), ''),
          NULLIF(btrim(to_jsonb(p)->>'barcode'), ''),
          CASE
            WHEN COALESCE(NULLIF(btrim(sp.mapped_product_id), ''), NULLIF(btrim(sp.supplier_product_id), ''))
              ~ '^[0-9]{8,14}$'
              THEN COALESCE(NULLIF(btrim(sp.mapped_product_id), ''), NULLIF(btrim(sp.supplier_product_id), ''))
            ELSE NULL
          END
        ), 120) AS barcode,
        left(COALESCE(NULLIF(btrim(p.name), ''), NULLIF(btrim(sp.name), ''), NULLIF(btrim(draft.details->>'name'), ''), 'Producto heredado'), 255) AS name,
        COALESCE(NULLIF(btrim(p.description), ''), NULLIF(btrim(draft.details->>'description'), ''), '') AS description,
        left(COALESCE(NULLIF(btrim(p.category), ''), NULLIF(btrim(draft.details->>'category'), ''), 'Otros'), 120) AS category,
        round(greatest(COALESCE(sp.price, 0), 0)::numeric, 2) AS price,
        CASE
          WHEN COALESCE(sp.stock, 0) BETWEEN 0 AND p_max_safe_stock
            THEN round(COALESCE(sp.stock, 0)::numeric, 3)
          ELSE 0::numeric
        END AS safe_stock,
        COALESCE(sp.stock, 0)::numeric AS reported_stock,
        COALESCE(NULLIF(btrim(p.image), ''), NULLIF(btrim(sp.image), ''), NULLIF(btrim(draft.details->>'image_url'), ''), '') AS image_url,
        COALESCE(NULLIF(btrim(sp.mapped_product_id), ''), NULLIF(btrim(sp.supplier_product_id), '')) AS legacy_product_id,
        NULLIF(btrim(draft.details->>'brand'), '') AS brand,
        NULLIF(btrim(draft.details->>'presentation'), '') AS presentation,
        NULLIF(btrim(draft.details->>'shelf_code'), '') AS shelf_code,
        NULLIF(btrim(draft.details->>'location'), '') AS legacy_location,
        draft.details->'floor_level' AS floor_level,
        draft.details->'shelf_level' AS shelf_level,
        sp.updated_at
      FROM public.supplier_products sp
      LEFT JOIN public.products p
        ON p.id = COALESCE(NULLIF(btrim(sp.mapped_product_id), ''), NULLIF(btrim(sp.supplier_product_id), ''))
      CROSS JOIN LATERAL (
        SELECT public._legacy_product_draft_json_v2(COALESCE(
          NULLIF(btrim(sp.mapped_product_id), ''),
          NULLIF(btrim(sp.supplier_product_id), '')
        )) AS details
      ) draft
      WHERE sp.supplier_id = 'local_store'
    ) legacy
    ORDER BY legacy.sku, legacy.updated_at DESC NULLS LAST, legacy.source_row_id DESC
  )
  INSERT INTO public.catalog_products (
    tenant_id, id, sku, barcode, name, description, category, price,
    currency, active, track_stock, metadata, created_by, updated_by
  )
  SELECT
    p_tenant_id,
    gen_random_uuid(),
    ll.sku,
    ll.barcode,
    ll.name,
    NULLIF(ll.description, ''),
    ll.category,
    ll.price,
    'ARS',
    ll.price > 0
      AND ll.reported_stock >= 0
      AND ll.reported_stock <= p_max_safe_stock,
    true,
    jsonb_strip_nulls(jsonb_build_object(
      'image_url', NULLIF(ll.image_url, ''),
      'legacy_product_id', NULLIF(ll.legacy_product_id, ''),
      'legacy_local_supplier_row_id', ll.source_row_id,
      'migration_source', '015_legacy_catalog_recovery',
      'legacy_reported_stock', ll.reported_stock,
      'stock_review_required', ll.reported_stock < 0 OR ll.reported_stock > p_max_safe_stock,
      'brand', ll.brand,
      'presentation', ll.presentation,
      'shelf_code', ll.shelf_code,
      'legacy_location', ll.legacy_location,
      'floor_level', ll.floor_level,
      'shelf_level', ll.shelf_level
    )),
    NULL,
    NULL
  FROM legacy_local ll
  ON CONFLICT (tenant_id, sku) DO NOTHING;

  WITH legacy_local AS (
    SELECT DISTINCT ON (legacy.sku)
      legacy.*
    FROM (
      SELECT
        sp.id::text AS source_row_id,
        left(COALESCE(
          NULLIF(btrim(sp.mapped_product_id), ''),
          NULLIF(btrim(sp.supplier_product_id), ''),
          'LEGACY-LOCAL-' || sp.id::text
        ), 120) AS sku,
        CASE
          WHEN COALESCE(sp.stock, 0) BETWEEN 0 AND p_max_safe_stock
            THEN round(COALESCE(sp.stock, 0)::numeric, 3)
          ELSE 0::numeric
        END AS safe_stock,
        sp.updated_at
      FROM public.supplier_products sp
      WHERE sp.supplier_id = 'local_store'
    ) legacy
    ORDER BY legacy.sku, legacy.updated_at DESC NULLS LAST, legacy.source_row_id DESC
  ), inserted_balances AS (
    INSERT INTO public.inventory_balances_v2 (
      tenant_id, product_id, location_id, on_hand, reserved, version, updated_at
    )
    SELECT
      p_tenant_id,
      cp.id,
      v_default_location_id,
      ll.safe_stock,
      0,
      1,
      clock_timestamp()
    FROM legacy_local ll
    JOIN public.catalog_products cp
      ON cp.tenant_id = p_tenant_id
     AND cp.sku = ll.sku
     AND cp.metadata->>'legacy_local_supplier_row_id' = ll.source_row_id
    WHERE ll.safe_stock > 0
    ON CONFLICT (tenant_id, product_id, location_id) DO NOTHING
    RETURNING tenant_id, product_id, location_id, on_hand, reserved
  )
  INSERT INTO public.inventory_ledger_v2 (
    tenant_id, id, product_id, location_id, event_type, quantity_delta,
    reserved_delta, on_hand_after, reserved_after, reference_type,
    idempotency_key, actor_user_id, metadata
  )
  SELECT
    ib.tenant_id,
    gen_random_uuid(),
    ib.product_id,
    ib.location_id,
    'OPENING',
    ib.on_hand,
    0,
    ib.on_hand,
    ib.reserved,
    'LEGACY_CATALOG_RECOVERY',
    'legacy-local-opening:' || (cp.metadata->>'legacy_local_supplier_row_id'),
    NULL,
    jsonb_build_object(
      'migration', '015_legacy_catalog_recovery',
      'legacy_supplier_row_id', cp.metadata->>'legacy_local_supplier_row_id'
    )
  FROM inserted_balances ib
  JOIN public.catalog_products cp
    ON cp.tenant_id = ib.tenant_id AND cp.id = ib.product_id
  ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;

  SELECT count(*)::integer
  INTO v_catalog_count
  FROM public.catalog_products cp
  WHERE cp.tenant_id = p_tenant_id
    AND cp.metadata->>'migration_source' = '015_legacy_catalog_recovery';

  SELECT count(*)::integer
  INTO v_balance_count
  FROM public.inventory_balances_v2 ib
  JOIN public.catalog_products cp
    ON cp.tenant_id = ib.tenant_id AND cp.id = ib.product_id
  WHERE ib.tenant_id = p_tenant_id
    AND cp.metadata->>'migration_source' = '015_legacy_catalog_recovery';

  SELECT count(*)::integer
  INTO v_review_count
  FROM public.catalog_recovery_review_v2 rr
  WHERE rr.tenant_id = p_tenant_id AND rr.status = 'PENDING';

  RETURN jsonb_build_object(
    'ok', true,
    'skipped', false,
    'catalog_products', v_catalog_count,
    'inventory_balances', v_balance_count,
    'pending_review', v_review_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public._recover_legacy_local_catalog_v2(UUID, NUMERIC)
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Función privada: sincronización set-based de todo el B2B legacy.
-- El precio histórico es la lista pública; costo mayorista = 70 %.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._sync_legacy_b2b_catalog_v2(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_source_count INTEGER := 0;
  v_offer_count INTEGER := 0;
  v_active_offer_count INTEGER := 0;
  v_review_count INTEGER := 0;
BEGIN
  IF to_regclass('public.products') IS NULL
     OR to_regclass('public.suppliers') IS NULL
     OR to_regclass('public.supplier_products') IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'LEGACY_TABLES_NOT_PRESENT',
      'sources', 0,
      'offers', 0,
      'active_offers', 0,
      'pending_review', 0
    );
  END IF;

  INSERT INTO public.catalog_recovery_review_v2 (
    tenant_id, source_table, source_row_id, issue_code, product_name,
    reported_stock, reported_price, metadata, last_seen_at
  )
  SELECT
    p_tenant_id,
    'supplier_products',
    sp.id::text,
    'INVALID_PRICE',
    left(COALESCE(NULLIF(btrim(sp.name), ''), NULLIF(btrim(p.name), ''), 'Oferta heredada'), 255),
    sp.stock,
    sp.price,
    jsonb_build_object(
      'supplier_id', sp.supplier_id,
      'supplier_product_id', sp.supplier_product_id,
      'mapped_product_id', sp.mapped_product_id
    ),
    clock_timestamp()
  FROM public.supplier_products sp
  LEFT JOIN public.products p
    ON p.id = COALESCE(NULLIF(btrim(sp.mapped_product_id), ''), NULLIF(btrim(sp.supplier_product_id), ''))
  WHERE sp.supplier_id <> 'local_store'
    AND COALESCE(sp.price, 0) <= 0
  ON CONFLICT (tenant_id, source_table, source_row_id, issue_code) DO UPDATE
  SET product_name = EXCLUDED.product_name,
      reported_stock = EXCLUDED.reported_stock,
      reported_price = EXCLUDED.reported_price,
      metadata = EXCLUDED.metadata,
      last_seen_at = clock_timestamp();

  UPDATE public.external_catalog_sources_v2 source
  SET name = left(COALESCE(NULLIF(btrim(supplier.name), ''), supplier.id), 255),
      estimated_days = 5,
      active = true,
      metadata = (source.metadata - 'legacy_missing' - 'legacy_missing_detected_at')
        || jsonb_build_object(
          'legacy_supplier_id', supplier.id,
          'migration_source', '015_legacy_catalog_recovery'
        ),
      updated_at = clock_timestamp()
  FROM public.suppliers supplier
  WHERE source.tenant_id = p_tenant_id
    AND source.source_type = 'B2B_SUPPLIER'
    AND source.metadata->>'migration_source' = '015_legacy_catalog_recovery'
    AND source.metadata->>'legacy_supplier_id' = supplier.id
    AND supplier.id <> 'local_store'
    AND (
      source.name IS DISTINCT FROM left(COALESCE(NULLIF(btrim(supplier.name), ''), supplier.id), 255)
      OR source.estimated_days IS DISTINCT FROM 5
      OR source.active IS DISTINCT FROM true
      OR source.metadata ? 'legacy_missing'
    );

  INSERT INTO public.external_catalog_sources_v2 (
    tenant_id, id, source_type, name, contact_info, estimated_days,
    active, metadata, updated_at
  )
  SELECT
    p_tenant_id,
    gen_random_uuid(),
    'B2B_SUPPLIER',
    left(COALESCE(NULLIF(btrim(s.name), ''), s.id), 255),
    NULL,
    5,
    true,
    jsonb_build_object(
      'legacy_supplier_id', s.id,
      'migration_source', '015_legacy_catalog_recovery'
    ),
    clock_timestamp()
  FROM public.suppliers s
  WHERE s.id <> 'local_store'
    AND EXISTS (
      SELECT 1 FROM public.supplier_products sp
      WHERE sp.supplier_id = s.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.external_catalog_sources_v2 existing_source
      WHERE existing_source.tenant_id = p_tenant_id
        AND existing_source.source_type = 'B2B_SUPPLIER'
        AND existing_source.metadata->>'migration_source' = '015_legacy_catalog_recovery'
        AND existing_source.metadata->>'legacy_supplier_id' = s.id
    )
  ON CONFLICT (tenant_id, source_type, name) DO UPDATE
  SET metadata = public.external_catalog_sources_v2.metadata || EXCLUDED.metadata,
      updated_at = clock_timestamp()
  WHERE public.external_catalog_sources_v2.metadata IS DISTINCT FROM
    (public.external_catalog_sources_v2.metadata || EXCLUDED.metadata);

  UPDATE public.external_catalog_sources_v2 source
  SET active = false,
      updated_at = clock_timestamp(),
      metadata = source.metadata || jsonb_build_object(
        'legacy_missing', true,
        'legacy_missing_detected_at', clock_timestamp()
      )
  WHERE source.tenant_id = p_tenant_id
    AND source.source_type = 'B2B_SUPPLIER'
    AND source.metadata->>'migration_source' = '015_legacy_catalog_recovery'
    AND source.active = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.suppliers supplier
      WHERE supplier.id = source.metadata->>'legacy_supplier_id'
        AND supplier.id <> 'local_store'
        AND EXISTS (
          SELECT 1 FROM public.supplier_products product
          WHERE product.supplier_id = supplier.id
        )
    );

  WITH legacy_offers AS (
    SELECT DISTINCT ON (offer.supplier_id, offer.external_sku)
      offer.*
    FROM (
      SELECT
        sp.id::text AS source_row_id,
        sp.supplier_id,
        left(COALESCE(
          NULLIF(btrim(sp.supplier_product_id), ''),
          NULLIF(btrim(sp.mapped_product_id), ''),
          'LEGACY-B2B-' || sp.id::text
        ), 120) AS external_sku,
        left(COALESCE(NULLIF(btrim(sp.name), ''), NULLIF(btrim(p.name), ''), 'Oferta heredada'), 255) AS name,
        left(COALESCE(NULLIF(btrim(p.category), ''), 'General'), 120) AS category,
        round((sp.price * 0.70)::numeric, 2) AS cost_price,
        round(sp.price::numeric, 2) AS retail_price,
        round(greatest(COALESCE(sp.stock, 0), 0)::numeric, 3) AS available_units,
        COALESCE(sp.available, true) AS active,
        COALESCE(NULLIF(btrim(sp.image), ''), NULLIF(btrim(p.image), ''), '') AS image_url,
        COALESCE(NULLIF(btrim(sp.link), ''), '') AS source_link,
        sp.mapped_product_id,
        sp.updated_at
      FROM public.supplier_products sp
      LEFT JOIN public.products p
        ON p.id = COALESCE(NULLIF(btrim(sp.mapped_product_id), ''), NULLIF(btrim(sp.supplier_product_id), ''))
      WHERE sp.supplier_id <> 'local_store'
        AND COALESCE(sp.price, 0) > 0
    ) offer
    ORDER BY offer.supplier_id, offer.external_sku,
      offer.updated_at DESC NULLS LAST, offer.source_row_id DESC
  )
  INSERT INTO public.external_catalog_offers_v2 (
    tenant_id, id, source_id, external_sku, name, category, cost_price,
    retail_price, available_units, active, metadata, updated_at
  )
  SELECT
    p_tenant_id,
    gen_random_uuid(),
    source.id,
    lo.external_sku,
    lo.name,
    lo.category,
    lo.cost_price,
    lo.retail_price,
    lo.available_units,
    lo.active,
    jsonb_strip_nulls(jsonb_build_object(
      'image_url', NULLIF(lo.image_url, ''),
      'source_link', NULLIF(lo.source_link, ''),
      'legacy_supplier_id', lo.supplier_id,
      'legacy_supplier_product_row_id', lo.source_row_id,
      'legacy_mapped_product_id', NULLIF(lo.mapped_product_id, ''),
      'wholesale_factor', 0.70,
      'migration_source', '015_legacy_catalog_recovery'
    )),
    clock_timestamp()
  FROM legacy_offers lo
  JOIN public.external_catalog_sources_v2 source
    ON source.tenant_id = p_tenant_id
   AND source.source_type = 'B2B_SUPPLIER'
   AND source.metadata->>'legacy_supplier_id' = lo.supplier_id
  ON CONFLICT (tenant_id, source_id, external_sku) DO UPDATE
  SET name = EXCLUDED.name,
      category = EXCLUDED.category,
      cost_price = EXCLUDED.cost_price,
      retail_price = EXCLUDED.retail_price,
      available_units = EXCLUDED.available_units,
      active = EXCLUDED.active,
      metadata = (public.external_catalog_offers_v2.metadata
        - 'legacy_missing' - 'legacy_missing_detected_at') || EXCLUDED.metadata,
      updated_at = clock_timestamp()
  WHERE public.external_catalog_offers_v2.name IS DISTINCT FROM EXCLUDED.name
     OR public.external_catalog_offers_v2.category IS DISTINCT FROM EXCLUDED.category
     OR public.external_catalog_offers_v2.cost_price IS DISTINCT FROM EXCLUDED.cost_price
     OR public.external_catalog_offers_v2.retail_price IS DISTINCT FROM EXCLUDED.retail_price
     OR public.external_catalog_offers_v2.available_units IS DISTINCT FROM EXCLUDED.available_units
     OR public.external_catalog_offers_v2.active IS DISTINCT FROM EXCLUDED.active
     OR public.external_catalog_offers_v2.metadata IS DISTINCT FROM
       ((public.external_catalog_offers_v2.metadata
         - 'legacy_missing' - 'legacy_missing_detected_at') || EXCLUDED.metadata);

  -- Si una fila legacy desapareció o cambió de identidad, la oferta importada
  -- deja de venderse. Se conserva para auditoría y nunca se elimina historial.
  UPDATE public.external_catalog_offers_v2 offer
  SET active = false,
      updated_at = clock_timestamp(),
      metadata = offer.metadata || jsonb_build_object(
        'legacy_missing', true,
        'legacy_missing_detected_at', clock_timestamp()
      )
  WHERE offer.tenant_id = p_tenant_id
    AND offer.metadata->>'migration_source' = '015_legacy_catalog_recovery'
    AND offer.active = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.supplier_products legacy
      WHERE legacy.supplier_id <> 'local_store'
        AND legacy.supplier_id = offer.metadata->>'legacy_supplier_id'
        AND legacy.id::text = offer.metadata->>'legacy_supplier_product_row_id'
        AND left(COALESCE(
          NULLIF(btrim(legacy.supplier_product_id), ''),
          NULLIF(btrim(legacy.mapped_product_id), ''),
          'LEGACY-B2B-' || legacy.id::text
        ), 120) = offer.external_sku
        AND COALESCE(legacy.price, 0) > 0
    );

  SELECT count(*)::integer
  INTO v_source_count
  FROM public.external_catalog_sources_v2 source
  WHERE source.tenant_id = p_tenant_id
    AND source.source_type = 'B2B_SUPPLIER'
    AND source.metadata->>'migration_source' = '015_legacy_catalog_recovery';

  SELECT count(*)::integer,
         count(*) FILTER (WHERE offer.active)::integer
  INTO v_offer_count, v_active_offer_count
  FROM public.external_catalog_offers_v2 offer
  WHERE offer.tenant_id = p_tenant_id
    AND offer.metadata->>'migration_source' = '015_legacy_catalog_recovery';

  SELECT count(*)::integer
  INTO v_review_count
  FROM public.catalog_recovery_review_v2 review
  WHERE review.tenant_id = p_tenant_id AND review.status = 'PENDING';

  RETURN jsonb_build_object(
    'ok', true,
    'skipped', false,
    'sources', v_source_count,
    'offers', v_offer_count,
    'active_offers', v_active_offer_count,
    'pending_review', v_review_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public._sync_legacy_b2b_catalog_v2(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC administrativas públicas: una llamada, sin miles de requests cliente.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recover_legacy_local_catalog_v2(
  p_tenant_id UUID,
  p_max_safe_stock NUMERIC DEFAULT 100000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  IF p_tenant_id <> '11111111-1111-1111-1111-111111111111'::uuid
     OR auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants tenant
    WHERE tenant.id = p_tenant_id AND tenant.status = 'ACTIVE'
  ) OR NOT (
    public.is_superadmin()
    OR public.operational_has_tenant_role(
      p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sólo administración puede recuperar el catálogo físico.';
  END IF;
  RETURN public._recover_legacy_local_catalog_v2(p_tenant_id, p_max_safe_stock);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_legacy_b2b_catalog_v2(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  IF p_tenant_id <> '11111111-1111-1111-1111-111111111111'::uuid
     OR auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants tenant
    WHERE tenant.id = p_tenant_id AND tenant.status = 'ACTIVE'
  ) OR NOT (
    public.is_superadmin()
    OR public.operational_has_tenant_role(
      p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sólo administración puede sincronizar el catálogo B2B.';
  END IF;
  RETURN public._sync_legacy_b2b_catalog_v2(p_tenant_id);
END;
$$;

-- Recuperación operativa completa para la UI: restaura el catálogo físico y
-- sincroniza proveedores en una sola llamada. Si todavía no existe una
-- ubicación default, el B2B se recupera igual y el bloque local queda marcado.
CREATE OR REPLACE FUNCTION public.recover_legacy_catalogs_v2(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_local JSONB;
  v_external JSONB;
BEGIN
  IF p_tenant_id <> '11111111-1111-1111-1111-111111111111'::uuid
     OR auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants tenant
    WHERE tenant.id = p_tenant_id AND tenant.status = 'ACTIVE'
  ) OR NOT (
    public.is_superadmin()
    OR public.operational_has_tenant_role(
      p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sólo administración puede recuperar los catálogos.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_locations_v2 location
    WHERE location.tenant_id = p_tenant_id
      AND location.active = true
      AND location.is_sellable = true
      AND location.is_default = true
  ) THEN
    v_local := public._recover_legacy_local_catalog_v2(p_tenant_id, 100000);
  ELSE
    v_local := jsonb_build_object(
      'ok', false,
      'skipped', true,
      'reason', 'DEFAULT_LOCATION_REQUIRED',
      'catalog_products', 0,
      'inventory_balances', 0,
      'pending_review', 0
    );
  END IF;

  v_external := public._sync_legacy_b2b_catalog_v2(p_tenant_id);
  RETURN jsonb_build_object(
    'ok', COALESCE((v_external->>'ok')::boolean, false),
    'local', v_local,
    'external', v_external,
    'catalog_products', COALESCE((v_local->>'catalog_products')::integer, 0),
    'inventory_balances', COALESCE((v_local->>'inventory_balances')::integer, 0),
    'sources', COALESCE((v_external->>'sources')::integer, 0),
    'offers', COALESCE((v_external->>'offers')::integer, 0),
    'pending_review', greatest(
      COALESCE((v_local->>'pending_review')::integer, 0),
      COALESCE((v_external->>'pending_review')::integer, 0)
    )
  );
END;
$$;

-- Búsqueda acotada para el POS. Evita descargar/renderizar las más de ocho
-- mil ofertas en cada apertura, pero permite encontrar cualquier SKU o nombre.
CREATE OR REPLACE FUNCTION public.search_external_catalog_offers_v2(
  p_tenant_id UUID,
  p_query TEXT DEFAULT NULL,
  p_source_type TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 120
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_query TEXT := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_source_type TEXT := NULLIF(upper(btrim(COALESCE(p_source_type, ''))), '');
  v_limit INTEGER := COALESCE(p_limit, 120);
  v_can_view_cost BOOLEAN := false;
  v_result JSONB := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants tenant
    WHERE tenant.id = p_tenant_id AND tenant.status = 'ACTIVE'
  ) OR NOT (
    public.is_superadmin()
    OR public.operational_has_tenant_role(
      p_tenant_id, ARRAY['VENDEDOR', 'SUPERVISOR', 'ADMIN']::TEXT[]
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Acceso denegado al catálogo externo.';
  END IF;
  IF v_query IS NOT NULL AND length(v_query) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La búsqueda no puede superar 120 caracteres.';
  END IF;
  IF v_source_type IS NOT NULL AND v_source_type NOT IN ('B2B_SUPPLIER', 'LOCAL_STORE') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El origen solicitado no es válido.';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El límite debe estar entre 1 y 200.';
  END IF;

  v_can_view_cost := public.is_superadmin() OR public.operational_has_tenant_role(
    p_tenant_id, ARRAY['SUPERVISOR', 'ADMIN']::TEXT[]
  );

  SELECT COALESCE(
    jsonb_agg(result.payload ORDER BY result.source_name, result.offer_name, result.offer_id),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT
      source.name AS source_name,
      offer.name AS offer_name,
      offer.id AS offer_id,
      jsonb_build_object(
        'id', offer.id,
        'source_id', offer.source_id,
        'source_name', source.name,
        'source_type', source.source_type,
        'source_contact_info', source.contact_info,
        'source_phone', regexp_replace(
          split_part(COALESCE(source.contact_info, ''), '·', 1),
          '[^0-9]', '', 'g'
        ),
        'source_address', COALESCE(
          NULLIF(btrim(source.metadata->>'address'), ''),
          NULLIF(btrim(split_part(COALESCE(source.contact_info, ''), '·', 2)), '')
        ),
        'estimated_days', source.estimated_days,
        'external_sku', offer.external_sku,
        'name', offer.name,
        'category', offer.category,
        'cost_price', CASE WHEN v_can_view_cost THEN offer.cost_price ELSE NULL END,
        'retail_price', offer.retail_price,
        'available_units', offer.available_units,
        'active', offer.active,
        'metadata', CASE WHEN v_can_view_cost THEN offer.metadata ELSE jsonb_strip_nulls(jsonb_build_object(
          'image_url', offer.metadata->'image_url',
          'barcode', offer.metadata->'barcode',
          'brand', offer.metadata->'brand',
          'presentation', offer.metadata->'presentation'
        )) END,
        'updated_at', offer.updated_at
      ) AS payload
    FROM public.external_catalog_offers_v2 offer
    JOIN public.external_catalog_sources_v2 source
      ON source.tenant_id = offer.tenant_id AND source.id = offer.source_id
    WHERE offer.tenant_id = p_tenant_id
      AND offer.active = true
      AND source.active = true
      AND (v_source_type IS NULL OR source.source_type = v_source_type)
      AND (
        v_query IS NULL
        OR offer.name ILIKE '%' || v_query || '%'
        OR offer.external_sku ILIKE '%' || v_query || '%'
        OR source.name ILIKE '%' || v_query || '%'
        OR COALESCE(offer.metadata->>'barcode', '') ILIKE '%' || v_query || '%'
        OR COALESCE(offer.metadata->>'brand', '') ILIKE '%' || v_query || '%'
        OR COALESCE(offer.metadata->>'presentation', '') ILIKE '%' || v_query || '%'
      )
    ORDER BY source.name, offer.name, offer.id
    LIMIT v_limit
  ) result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.recover_legacy_local_catalog_v2(UUID, NUMERIC)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_legacy_b2b_catalog_v2(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recover_legacy_catalogs_v2(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_external_catalog_offers_v2(UUID, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_legacy_local_catalog_v2(UUID, NUMERIC)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_legacy_b2b_catalog_v2(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.recover_legacy_catalogs_v2(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_external_catalog_offers_v2(UUID, TEXT, TEXT, INTEGER)
  TO authenticated;

-- La información histórica pertenece al tenant original de BÔ. El bloque es
-- seguro en instalaciones limpias: si no existen tablas legacy, ambas rutinas
-- retornan un resumen "skipped" sin intentar resolverlas.
DO $$
DECLARE
  v_tenant_id CONSTANT UUID := '11111111-1111-1111-1111-111111111111';
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tenants tenant
    WHERE tenant.id = v_tenant_id AND tenant.status = 'ACTIVE'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.inventory_locations_v2 location
      WHERE location.tenant_id = v_tenant_id
        AND location.active = true
        AND location.is_sellable = true
        AND location.is_default = true
    ) THEN
      PERFORM public._recover_legacy_local_catalog_v2(v_tenant_id, 100000);
    END IF;
    PERFORM public._sync_legacy_b2b_catalog_v2(v_tenant_id);
  END IF;
END;
$$;

INSERT INTO public.schema_migrations (
  version, name, checksum, backward_compatible, applied_by
)
VALUES (
  '015',
  'legacy_catalog_recovery',
  'sha256-legacy-catalog-recovery-015-v1',
  true,
  'migration-engine'
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
