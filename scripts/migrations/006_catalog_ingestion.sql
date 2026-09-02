BEGIN;

CREATE TABLE IF NOT EXISTS public.catalog_product_drafts_v2 (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'PENDING_LOCATION' CHECK (status IN (
    'PENDING_LOCATION', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'
  )),
  sku TEXT NOT NULL CHECK (length(btrim(sku)) BETWEEN 1 AND 120),
  barcode TEXT,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 255),
  description TEXT,
  brand TEXT,
  presentation TEXT,
  category TEXT,
  image_url TEXT,
  image_path TEXT,
  cost_price NUMERIC(18,2) CHECK (cost_price IS NULL OR cost_price >= 0),
  sale_price NUMERIC(18,2) NOT NULL CHECK (sale_price > 0),
  currency CHAR(3) NOT NULL DEFAULT 'ARS' CHECK (currency ~ '^[A-Z]{3}$'),
  stock_quantity NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  location_data JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(location_data) = 'object'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  product_id UUID,
  location_id UUID,
  submitted_by UUID NOT NULL,
  reviewed_by UUID,
  idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 255),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reviewed_at TIMESTAMPTZ,
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT catalog_product_drafts_v2_product_fk
    FOREIGN KEY (tenant_id, product_id)
    REFERENCES public.catalog_products(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT catalog_product_drafts_v2_location_fk
    FOREIGN KEY (tenant_id, location_id)
    REFERENCES public.inventory_locations_v2(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT catalog_product_drafts_v2_submitter_fk
    FOREIGN KEY (tenant_id, submitted_by)
    REFERENCES public.tenant_users(tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT catalog_product_drafts_v2_reviewer_fk
    FOREIGN KEY (tenant_id, reviewed_by)
    REFERENCES public.tenant_users(tenant_id, user_id)
    ON DELETE RESTRICT,
  CHECK (
    (status IN ('PENDING_LOCATION', 'PENDING_REVIEW') AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('APPROVED', 'REJECTED') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS catalog_product_drafts_v2_queue_idx
  ON public.catalog_product_drafts_v2 (tenant_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.submit_catalog_product_draft_v2(
  p_tenant_id UUID,
  p_idempotency_key TEXT,
  p_draft JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_existing public.catalog_product_drafts_v2%ROWTYPE;
  v_draft public.catalog_product_drafts_v2%ROWTYPE;
  v_hash TEXT;
  v_status TEXT;
  v_location JSONB := COALESCE(p_draft->'location', '{}'::jsonb);
  v_stock NUMERIC := COALESCE(NULLIF(p_draft->>'stock_quantity', '')::NUMERIC, 0);
  v_price NUMERIC := NULLIF(p_draft->>'sale_price', '')::NUMERIC;
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'VENDEDOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Rol operativo activo requerido para ingresar productos.';
  END IF;
  IF length(btrim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 255
     OR p_draft IS NULL OR jsonb_typeof(p_draft) <> 'object'
     OR length(btrim(COALESCE(p_draft->>'sku', ''))) NOT BETWEEN 1 AND 120
     OR length(btrim(COALESCE(p_draft->>'name', ''))) NOT BETWEEN 1 AND 255
     OR v_price IS NULL OR v_price <= 0 OR round(v_price, 2) <> v_price
     OR v_stock < 0 OR scale(v_stock) > 3
     OR jsonb_typeof(v_location) <> 'object'
     OR jsonb_typeof(COALESCE(p_draft->'metadata', '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Borrador de producto invalido.';
  END IF;
  v_hash := encode(digest(convert_to(p_draft::text, 'UTF8'), 'sha256'), 'hex');

  SELECT d.* INTO v_existing
  FROM public.catalog_product_drafts_v2 d
  WHERE d.tenant_id = p_tenant_id AND d.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.payload_hash <> v_hash THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Colision de idempotencia en ingreso de producto.';
    END IF;
    RETURN jsonb_build_object('draft_id', v_existing.id, 'status', v_existing.status, 'idempotent', true);
  END IF;

  v_status := CASE WHEN NULLIF(btrim(v_location->>'code'), '') IS NULL
    THEN 'PENDING_LOCATION' ELSE 'PENDING_REVIEW' END;
  INSERT INTO public.catalog_product_drafts_v2 (
    tenant_id, status, sku, barcode, name, description, brand, presentation,
    category, image_url, image_path, cost_price, sale_price, currency,
    stock_quantity, location_data, metadata, submitted_by,
    idempotency_key, payload_hash
  ) VALUES (
    p_tenant_id, v_status, btrim(p_draft->>'sku'), NULLIF(btrim(p_draft->>'barcode'), ''),
    btrim(p_draft->>'name'), NULLIF(btrim(p_draft->>'description'), ''),
    NULLIF(btrim(p_draft->>'brand'), ''), NULLIF(btrim(p_draft->>'presentation'), ''),
    NULLIF(btrim(p_draft->>'category'), ''), NULLIF(btrim(p_draft->>'image_url'), ''),
    NULLIF(btrim(p_draft->>'image_path'), ''),
    NULLIF(p_draft->>'cost_price', '')::NUMERIC, v_price,
    upper(COALESCE(NULLIF(btrim(p_draft->>'currency'), ''), 'ARS')),
    v_stock, v_location, COALESCE(p_draft->'metadata', '{}'::jsonb), v_actor,
    p_idempotency_key, v_hash
  ) RETURNING * INTO v_draft;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'CATALOG_PRODUCT_DRAFT_SUBMITTED', 'CATALOG_PRODUCT_DRAFT_V2',
    v_draft.id, jsonb_build_object('sku', v_draft.sku, 'status', v_draft.status, 'stock_quantity', v_draft.stock_quantity)
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'CATALOG_PRODUCT_DRAFT_V2', v_draft.id, 'CATALOG_PRODUCT_DRAFT_SUBMITTED',
    jsonb_build_object('draft_id', v_draft.id, 'sku', v_draft.sku, 'status', v_draft.status),
    p_idempotency_key || ':outbox'
  );
  RETURN jsonb_build_object('draft_id', v_draft.id, 'status', v_draft.status, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.locate_catalog_product_draft_v2(
  p_tenant_id UUID,
  p_draft_id UUID,
  p_location JSONB,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_draft public.catalog_product_drafts_v2%ROWTYPE;
  v_existing public.outbox_events%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'VENDEDOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Rol operativo activo requerido para ubicar productos.';
  END IF;
  IF p_location IS NULL OR jsonb_typeof(p_location) <> 'object'
     OR length(btrim(COALESCE(p_location->>'code', ''))) NOT BETWEEN 1 AND 120
     OR length(btrim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Ubicacion o idempotency key invalidas.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':locate-draft:' || p_idempotency_key, 0));
  SELECT oe.* INTO v_existing FROM public.outbox_events oe
  WHERE oe.tenant_id = p_tenant_id AND oe.idempotency_key = p_idempotency_key || ':outbox';
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.aggregate_id <> p_draft_id THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Colision de idempotencia al ubicar borrador.';
    END IF;
    SELECT d.* INTO v_draft FROM public.catalog_product_drafts_v2 d
    WHERE d.tenant_id = p_tenant_id AND d.id = p_draft_id;
    RETURN jsonb_build_object('draft_id', p_draft_id, 'status', v_draft.status, 'idempotent', true);
  END IF;

  SELECT d.* INTO v_draft FROM public.catalog_product_drafts_v2 d
  WHERE d.tenant_id = p_tenant_id AND d.id = p_draft_id
  FOR UPDATE;
  IF v_draft.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Borrador inexistente o ajeno al tenant.';
  END IF;
  IF v_draft.status NOT IN ('PENDING_LOCATION', 'PENDING_REVIEW') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'El borrador ya fue revisado.';
  END IF;
  UPDATE public.catalog_product_drafts_v2
  SET location_data = p_location, status = 'PENDING_REVIEW', updated_at = clock_timestamp()
  WHERE tenant_id = p_tenant_id AND id = p_draft_id
  RETURNING * INTO v_draft;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'CATALOG_PRODUCT_DRAFT_LOCATED', 'CATALOG_PRODUCT_DRAFT_V2',
    p_draft_id, jsonb_build_object('status', v_draft.status, 'location', p_location)
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'CATALOG_PRODUCT_DRAFT_V2', p_draft_id, 'CATALOG_PRODUCT_DRAFT_LOCATED',
    jsonb_build_object('draft_id', p_draft_id, 'status', v_draft.status, 'location', p_location),
    p_idempotency_key || ':outbox'
  );
  RETURN jsonb_build_object('draft_id', p_draft_id, 'status', v_draft.status, 'idempotent', false);
END;
$$;

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
AS $$
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
$$;

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
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.reject_catalog_product_draft_v2(
  p_tenant_id UUID,
  p_draft_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_draft public.catalog_product_drafts_v2%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo ADMIN o SUPERVISOR puede rechazar productos.';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Indique el motivo del rechazo.';
  END IF;
  SELECT d.* INTO v_draft FROM public.catalog_product_drafts_v2 d
  WHERE d.tenant_id = p_tenant_id AND d.id = p_draft_id
  FOR UPDATE;
  IF v_draft.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Borrador inexistente o ajeno al tenant.';
  END IF;
  IF v_draft.status = 'REJECTED' THEN
    RETURN jsonb_build_object('draft_id', p_draft_id, 'status', 'REJECTED', 'idempotent', true);
  END IF;
  IF v_draft.status = 'APPROVED' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'No se puede rechazar un producto ya aprobado.';
  END IF;
  UPDATE public.catalog_product_drafts_v2
  SET status = 'REJECTED', reviewed_by = v_actor, reviewed_at = clock_timestamp(), updated_at = clock_timestamp(),
      metadata = metadata || jsonb_build_object('rejection_reason', btrim(p_reason))
  WHERE tenant_id = p_tenant_id AND id = p_draft_id;
  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'CATALOG_PRODUCT_DRAFT_REJECTED', 'CATALOG_PRODUCT_DRAFT_V2', p_draft_id,
    jsonb_build_object('status', 'REJECTED', 'reason', btrim(p_reason))
  );
  RETURN jsonb_build_object('draft_id', p_draft_id, 'status', 'REJECTED', 'idempotent', false);
END;
$$;

ALTER TABLE public.catalog_product_drafts_v2 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalog_product_drafts_member_read_v2 ON public.catalog_product_drafts_v2;
CREATE POLICY catalog_product_drafts_member_read_v2 ON public.catalog_product_drafts_v2
  FOR SELECT TO authenticated USING (public.operational_is_tenant_member(tenant_id));

REVOKE ALL ON TABLE public.catalog_product_drafts_v2 FROM anon, authenticated;
GRANT SELECT ON public.catalog_product_drafts_v2 TO authenticated;
GRANT ALL ON public.catalog_product_drafts_v2 TO service_role;
REVOKE ALL ON FUNCTION public.submit_catalog_product_draft_v2(UUID, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.locate_catalog_product_draft_v2(UUID, UUID, JSONB, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_catalog_product_draft_v2(UUID, UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_catalog_product_draft_v2(UUID, UUID, JSONB, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_catalog_product_draft_v2(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_catalog_product_draft_v2(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.locate_catalog_product_draft_v2(UUID, UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_catalog_product_draft_v2(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_catalog_product_draft_v2(UUID, UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_catalog_product_draft_v2(UUID, UUID, TEXT) TO authenticated;

INSERT INTO public.schema_migrations (version, name, checksum, backward_compatible, applied_by)
VALUES ('006', 'catalog_ingestion', 'sha256-catalog-ingestion-006-v1', true, 'migration-engine')
ON CONFLICT (version) DO NOTHING;

COMMIT;
