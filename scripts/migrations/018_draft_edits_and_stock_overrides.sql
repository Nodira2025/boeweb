-- BÔ GROW CLUB — MIGRACIÓN 018: EDICIÓN DE BORRADORES Y OVERRIDE DE CANTIDAD
-- Permite que vendedores y supervisores actualicen datos/stock de borradores en cualquier
-- momento (PENDING_LOCATION / PENDING_REVIEW) y que la aprobación soporte override de cantidad.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_catalog_product_draft_v2(
  p_tenant_id UUID,
  p_draft_id UUID,
  p_updates JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $func$
DECLARE
  v_actor UUID := auth.uid();
  v_draft public.catalog_product_drafts_v2%ROWTYPE;
  v_name TEXT;
  v_category TEXT;
  v_price NUMERIC;
  v_cost NUMERIC;
  v_stock NUMERIC;
  v_metadata JSONB;
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'VENDEDOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Rol operativo activo requerido para actualizar borradores.';
  END IF;
  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Actualizacion de borrador invalida.';
  END IF;

  SELECT d.* INTO v_draft FROM public.catalog_product_drafts_v2 d
  WHERE d.tenant_id = p_tenant_id AND d.id = p_draft_id
  FOR UPDATE;

  IF v_draft.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Borrador inexistente o ajeno al tenant.';
  END IF;
  IF v_draft.status NOT IN ('PENDING_LOCATION', 'PENDING_REVIEW') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Solo se pueden actualizar borradores pendientes de ubicacion o revision.';
  END IF;

  v_name := COALESCE(NULLIF(btrim(p_updates->>'name'), ''), v_draft.name);
  v_category := COALESCE(NULLIF(btrim(p_updates->>'category'), ''), v_draft.category);
  v_price := COALESCE(NULLIF(p_updates->>'sale_price', '')::NUMERIC, NULLIF(p_updates->>'price', '')::NUMERIC, v_draft.sale_price);
  v_cost := COALESCE(NULLIF(p_updates->>'cost_price', '')::NUMERIC, v_draft.cost_price, 0);
  v_stock := COALESCE(
    NULLIF(p_updates->>'stock_quantity', '')::NUMERIC,
    NULLIF(p_updates->>'stock', '')::NUMERIC,
    NULLIF(p_updates->>'initial_quantity', '')::NUMERIC,
    v_draft.stock_quantity
  );

  IF v_stock < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La cantidad de stock no puede ser negativa.';
  END IF;

  v_metadata := v_draft.metadata || COALESCE(p_updates->'metadata', '{}'::jsonb);

  UPDATE public.catalog_product_drafts_v2
  SET name = v_name,
      category = v_category,
      sale_price = v_price,
      cost_price = v_cost,
      stock_quantity = v_stock,
      metadata = v_metadata,
      updated_at = clock_timestamp()
  WHERE tenant_id = p_tenant_id AND id = p_draft_id
  RETURNING * INTO v_draft;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'CATALOG_PRODUCT_DRAFT_UPDATED', 'CATALOG_PRODUCT_DRAFT_V2',
    p_draft_id, jsonb_build_object(
      'name', v_name, 'category', v_category, 'sale_price', v_price,
      'cost_price', v_cost, 'stock_quantity', v_stock
    )
  );

  RETURN jsonb_build_object(
    'draft_id', v_draft.id,
    'status', v_draft.status,
    'stock_quantity', v_draft.stock_quantity,
    'name', v_draft.name,
    'sale_price', v_draft.sale_price,
    'category', v_draft.category
  );
END;
$func$;

CREATE OR REPLACE FUNCTION public.approve_catalog_product_draft_v2(
  p_tenant_id UUID,
  p_draft_id UUID,
  p_overrides JSONB,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $func$
DECLARE
  v_actor UUID := auth.uid();
  v_draft public.catalog_product_drafts_v2%ROWTYPE;
  v_product JSONB;
  v_location JSONB;
  v_receipt JSONB;
  v_product_id UUID;
  v_location_id UUID;
  v_name TEXT;
  v_category TEXT;
  v_price NUMERIC;
  v_cost NUMERIC;
  v_stock NUMERIC;
  v_metadata JSONB;
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo ADMIN o SUPERVISOR puede aprobar productos.';
  END IF;
  IF p_overrides IS NULL OR jsonb_typeof(p_overrides) <> 'object'
     OR length(btrim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Aprobacion invalida.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':approve-draft:' || p_idempotency_key, 0));

  SELECT d.* INTO v_draft FROM public.catalog_product_drafts_v2 d
  WHERE d.tenant_id = p_tenant_id AND d.id = p_draft_id
  FOR UPDATE;
  IF v_draft.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Borrador inexistente o ajeno al tenant.';
  END IF;
  IF v_draft.status = 'APPROVED' THEN
    RETURN jsonb_build_object(
      'draft_id', v_draft.id, 'product_id', v_draft.product_id,
      'location_id', v_draft.location_id, 'status', v_draft.status, 'idempotent', true
    );
  END IF;
  IF v_draft.status <> 'PENDING_REVIEW' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'El borrador debe estar ubicado y pendiente de revision.';
  END IF;

  v_name := COALESCE(NULLIF(btrim(p_overrides->>'name'), ''), v_draft.name);
  v_category := COALESCE(NULLIF(btrim(p_overrides->>'category'), ''), v_draft.category);
  v_price := COALESCE(NULLIF(p_overrides->>'sale_price', '')::NUMERIC, v_draft.sale_price);
  v_cost := COALESCE(NULLIF(p_overrides->>'cost_price', '')::NUMERIC, v_draft.cost_price, 0);
  v_stock := COALESCE(
    NULLIF(p_overrides->>'stock_quantity', '')::NUMERIC,
    NULLIF(p_overrides->>'stock', '')::NUMERIC,
    NULLIF(p_overrides->>'initial_quantity', '')::NUMERIC,
    v_draft.stock_quantity
  );
  IF v_stock < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La cantidad de stock no puede ser negativa.';
  END IF;
  v_metadata := v_draft.metadata || COALESCE(p_overrides->'metadata', '{}'::jsonb) || jsonb_build_object(
    'barcode', v_draft.barcode,
    'description', v_draft.description,
    'category', v_category,
    'cost_price', v_cost,
    'brand', v_draft.brand,
    'presentation', v_draft.presentation,
    'image_url', v_draft.image_url
  );

  v_product := public.upsert_catalog_product_v2(
    p_tenant_id, v_draft.sku, v_name, v_price, v_draft.currency,
    true, v_metadata, NULL
  );
  v_product_id := (v_product->>'product_id')::UUID;

  IF NULLIF(btrim(v_draft.location_data->>'code'), '') IS NOT NULL THEN
    v_location := public.upsert_inventory_location_v2(
      p_tenant_id,
      v_draft.location_data->>'code',
      COALESCE(NULLIF(v_draft.location_data->>'name', ''), v_draft.location_data->>'code'),
      COALESCE(NULLIF(v_draft.location_data->>'location_type', ''), 'SHELF'),
      COALESCE(NULLIF(v_draft.location_data->>'is_sellable', '')::BOOLEAN, true),
      COALESCE(NULLIF(v_draft.location_data->>'is_default', '')::BOOLEAN, false),
      COALESCE(v_draft.location_data->'metadata', '{}'::jsonb),
      NULL
    );
    v_location_id := (v_location->>'location_id')::UUID;
  END IF;
  IF v_stock > 0 AND v_location_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'El stock inicial requiere una ubicacion central.';
  END IF;
  IF v_stock > 0 THEN
    v_receipt := public.receive_inventory_v2(
      p_tenant_id, v_product_id, v_location_id, v_stock,
      v_cost, p_idempotency_key || ':receipt'
    );
  END IF;

  UPDATE public.catalog_product_drafts_v2
  SET status = 'APPROVED', product_id = v_product_id, location_id = v_location_id,
      name = v_name, category = v_category, sale_price = v_price, cost_price = v_cost,
      stock_quantity = v_stock,
      reviewed_by = v_actor, reviewed_at = clock_timestamp(), updated_at = clock_timestamp()
  WHERE tenant_id = p_tenant_id AND id = p_draft_id
  RETURNING * INTO v_draft;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'CATALOG_PRODUCT_DRAFT_APPROVED', 'CATALOG_PRODUCT_DRAFT_V2', p_draft_id,
    jsonb_build_object('product_id', v_product_id, 'location_id', v_location_id, 'stock_quantity', v_draft.stock_quantity)
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'CATALOG_PRODUCT_DRAFT_V2', p_draft_id, 'CATALOG_PRODUCT_DRAFT_APPROVED',
    jsonb_build_object('draft_id', p_draft_id, 'product_id', v_product_id, 'location_id', v_location_id),
    p_idempotency_key || ':outbox'
  );
  RETURN jsonb_build_object(
    'draft_id', p_draft_id, 'product_id', v_product_id, 'location_id', v_location_id,
    'stock', COALESCE(v_receipt->'on_hand', to_jsonb(0)), 'status', 'APPROVED', 'idempotent', false
  );
END;
$func$;

REVOKE ALL ON FUNCTION public.update_catalog_product_draft_v2(UUID, UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_catalog_product_draft_v2(UUID, UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_catalog_product_draft_v2(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_catalog_product_draft_v2(UUID, UUID, JSONB, TEXT) TO authenticated;

INSERT INTO public.schema_migrations (
  version,
  name,
  checksum,
  backward_compatible,
  applied_by
)
VALUES (
  '018',
  'draft_edits_and_stock_overrides',
  'sha256-draft-edits-and-stock-overrides-018-v1',
  true,
  'migration-engine'
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
