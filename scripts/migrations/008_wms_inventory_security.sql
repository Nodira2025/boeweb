BEGIN;

-- ---------------------------------------------------------------------------
-- WMS v2: transferencias y conteos físicos con historial inmutable.
--
-- Esta migración es deliberadamente aditiva. Los comandos conservan las firmas
-- consumidas por el frontend y toda mutación de stock queda serializada en el
-- balance, el ledger, el audit log y el outbox dentro de la misma transacción.
-- ---------------------------------------------------------------------------

ALTER TABLE public.inventory_locations_v2
  DROP CONSTRAINT IF EXISTS inventory_locations_v2_default_sellable_check;
ALTER TABLE public.inventory_locations_v2
  ADD CONSTRAINT inventory_locations_v2_default_sellable_check
  CHECK (NOT is_default OR (active AND is_sellable));

CREATE TABLE IF NOT EXISTS public.inventory_transfers_v2 (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  origin_location_id UUID NOT NULL,
  destination_location_id UUID NOT NULL,
  quantity NUMERIC(18,3) NOT NULL CHECK (quantity > 0),
  origin_on_hand_after NUMERIC(18,3) NOT NULL CHECK (origin_on_hand_after >= 0),
  origin_reserved_after NUMERIC(18,3) NOT NULL
    CHECK (origin_reserved_after >= 0 AND origin_reserved_after <= origin_on_hand_after),
  destination_on_hand_after NUMERIC(18,3) NOT NULL CHECK (destination_on_hand_after >= 0),
  destination_reserved_after NUMERIC(18,3) NOT NULL
    CHECK (destination_reserved_after >= 0 AND destination_reserved_after <= destination_on_hand_after),
  notes TEXT,
  idempotency_key TEXT NOT NULL
    CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 160),
  payload_hash CHAR(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  transferred_by UUID NOT NULL,
  transferred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  CHECK (origin_location_id <> destination_location_id),
  CONSTRAINT inventory_transfers_v2_product_fk
    FOREIGN KEY (tenant_id, product_id)
    REFERENCES public.catalog_products(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_transfers_v2_origin_fk
    FOREIGN KEY (tenant_id, origin_location_id)
    REFERENCES public.inventory_locations_v2(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_transfers_v2_destination_fk
    FOREIGN KEY (tenant_id, destination_location_id)
    REFERENCES public.inventory_locations_v2(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_transfers_v2_actor_fk
    FOREIGN KEY (tenant_id, transferred_by)
    REFERENCES public.tenant_users(tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS inventory_transfers_v2_product_time_idx
  ON public.inventory_transfers_v2 (tenant_id, product_id, transferred_at DESC);
CREATE INDEX IF NOT EXISTS inventory_transfers_v2_origin_time_idx
  ON public.inventory_transfers_v2 (tenant_id, origin_location_id, transferred_at DESC);
CREATE INDEX IF NOT EXISTS inventory_transfers_v2_destination_time_idx
  ON public.inventory_transfers_v2 (tenant_id, destination_location_id, transferred_at DESC);

CREATE TABLE IF NOT EXISTS public.inventory_counts_v2 (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  location_id UUID NOT NULL,
  expected_on_hand NUMERIC(18,3) NOT NULL CHECK (expected_on_hand >= 0),
  expected_reserved NUMERIC(18,3) NOT NULL
    CHECK (expected_reserved >= 0 AND expected_reserved <= expected_on_hand),
  counted_quantity NUMERIC(18,3) NOT NULL CHECK (counted_quantity >= 0),
  difference NUMERIC(18,3) GENERATED ALWAYS AS (counted_quantity - expected_on_hand) STORED,
  notes TEXT,
  idempotency_key TEXT NOT NULL
    CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 160),
  payload_hash CHAR(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  submitted_by UUID NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT inventory_counts_v2_product_fk
    FOREIGN KEY (tenant_id, product_id)
    REFERENCES public.catalog_products(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_counts_v2_location_fk
    FOREIGN KEY (tenant_id, location_id)
    REFERENCES public.inventory_locations_v2(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_counts_v2_submitter_fk
    FOREIGN KEY (tenant_id, submitted_by)
    REFERENCES public.tenant_users(tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.inventory_count_reviews_v2 (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  count_id UUID NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED')),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 2 AND 2000),
  applied_quantity_delta NUMERIC(18,3) NOT NULL DEFAULT 0,
  on_hand_after NUMERIC(18,3),
  reserved_after NUMERIC(18,3),
  ledger_id UUID,
  idempotency_key TEXT NOT NULL
    CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 160),
  payload_hash CHAR(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  reviewed_by UUID NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, count_id),
  UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT inventory_count_reviews_v2_count_fk
    FOREIGN KEY (tenant_id, count_id)
    REFERENCES public.inventory_counts_v2(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_count_reviews_v2_ledger_fk
    FOREIGN KEY (tenant_id, ledger_id)
    REFERENCES public.inventory_ledger_v2(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_count_reviews_v2_reviewer_fk
    FOREIGN KEY (tenant_id, reviewed_by)
    REFERENCES public.tenant_users(tenant_id, user_id)
    ON DELETE RESTRICT,
  CHECK (
    (decision = 'APPROVED' AND on_hand_after IS NOT NULL AND reserved_after IS NOT NULL)
    OR
    (decision = 'REJECTED' AND applied_quantity_delta = 0
      AND on_hand_after IS NULL AND reserved_after IS NULL AND ledger_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS inventory_counts_v2_pending_idx
  ON public.inventory_counts_v2 (tenant_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS inventory_count_reviews_v2_reviewer_time_idx
  ON public.inventory_count_reviews_v2 (tenant_id, reviewed_by, reviewed_at DESC);

-- ---------------------------------------------------------------------------
-- Transferencia: bloquea ubicaciones y balances siempre por UUID ascendente.
-- Así dos movimientos inversos no toman los mismos recursos en orden opuesto.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_inventory_v2(
  p_tenant_id UUID,
  p_product_id UUID,
  p_origin_location_id UUID,
  p_destination_location_id UUID,
  p_quantity NUMERIC,
  p_notes TEXT,
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
  v_payload_hash TEXT := encode(digest(
    jsonb_build_object(
      'tenant_id', p_tenant_id,
      'product_id', p_product_id,
      'origin_location_id', p_origin_location_id,
      'destination_location_id', p_destination_location_id,
      'quantity', round(p_quantity, 3)::NUMERIC(18,3),
      'notes', NULLIF(btrim(p_notes), '')
    )::text,
    'sha256'
  ), 'hex');
  v_existing public.inventory_transfers_v2%ROWTYPE;
  v_origin public.inventory_balances_v2%ROWTYPE;
  v_destination public.inventory_balances_v2%ROWTYPE;
  v_transfer_id UUID := gen_random_uuid();
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'DEPOSITO']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Solo ADMIN, SUPERVISOR o DEPOSITO puede transferir inventario.';
  END IF;
  IF p_product_id IS NULL OR p_origin_location_id IS NULL OR p_destination_location_id IS NULL
     OR p_origin_location_id = p_destination_location_id
     OR p_quantity IS NULL OR p_quantity <= 0 OR round(p_quantity, 3) <> p_quantity
     OR length(btrim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Transferencia de inventario invalida.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':inventory-transfer:' || p_idempotency_key, 0)
  );

  SELECT transfer.* INTO v_existing
  FROM public.inventory_transfers_v2 transfer
  WHERE transfer.tenant_id = p_tenant_id
    AND transfer.idempotency_key = p_idempotency_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.payload_hash <> v_payload_hash THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'Colision de idempotencia en transferencia de inventario.';
    END IF;
    RETURN jsonb_build_object(
      'transfer_id', v_existing.id,
      'product_id', v_existing.product_id,
      'origin_location_id', v_existing.origin_location_id,
      'destination_location_id', v_existing.destination_location_id,
      'quantity', v_existing.quantity,
      'origin_on_hand', v_existing.origin_on_hand_after,
      'destination_on_hand', v_existing.destination_on_hand_after,
      'idempotent', true
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_products product
    WHERE product.tenant_id = p_tenant_id
      AND product.id = p_product_id
      AND product.active = true
      AND product.track_stock = true
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Producto inexistente, inactivo o sin control de stock.';
  END IF;

  PERFORM location.id
  FROM public.inventory_locations_v2 location
  WHERE location.tenant_id = p_tenant_id
    AND location.id IN (p_origin_location_id, p_destination_location_id)
  ORDER BY location.id
  FOR UPDATE;
  IF (
    SELECT count(*)
    FROM public.inventory_locations_v2 location
    WHERE location.tenant_id = p_tenant_id
      AND location.id IN (p_origin_location_id, p_destination_location_id)
  ) <> 2 OR EXISTS (
    SELECT 1
    FROM public.inventory_locations_v2 location
    WHERE location.tenant_id = p_tenant_id
      AND location.id IN (p_origin_location_id, p_destination_location_id)
      AND location.active = false
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Origen o destino inexistente o inactivo.';
  END IF;

  INSERT INTO public.inventory_balances_v2 (tenant_id, product_id, location_id)
  SELECT p_tenant_id, p_product_id, target.location_id
  FROM (
    VALUES (p_origin_location_id), (p_destination_location_id)
  ) AS target(location_id)
  ORDER BY target.location_id
  ON CONFLICT (tenant_id, product_id, location_id) DO NOTHING;

  PERFORM balance.location_id
  FROM public.inventory_balances_v2 balance
  WHERE balance.tenant_id = p_tenant_id
    AND balance.product_id = p_product_id
    AND balance.location_id IN (p_origin_location_id, p_destination_location_id)
  ORDER BY balance.location_id
  FOR UPDATE;

  SELECT balance.* INTO v_origin
  FROM public.inventory_balances_v2 balance
  WHERE balance.tenant_id = p_tenant_id
    AND balance.product_id = p_product_id
    AND balance.location_id = p_origin_location_id;
  SELECT balance.* INTO v_destination
  FROM public.inventory_balances_v2 balance
  WHERE balance.tenant_id = p_tenant_id
    AND balance.product_id = p_product_id
    AND balance.location_id = p_destination_location_id;

  IF v_origin.available < p_quantity THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Stock disponible insuficiente en la ubicacion de origen.';
  END IF;

  UPDATE public.inventory_balances_v2
  SET on_hand = on_hand - p_quantity,
      version = version + 1,
      updated_at = clock_timestamp()
  WHERE tenant_id = p_tenant_id
    AND product_id = p_product_id
    AND location_id = p_origin_location_id
  RETURNING * INTO v_origin;

  UPDATE public.inventory_balances_v2
  SET on_hand = on_hand + p_quantity,
      version = version + 1,
      updated_at = clock_timestamp()
  WHERE tenant_id = p_tenant_id
    AND product_id = p_product_id
    AND location_id = p_destination_location_id
  RETURNING * INTO v_destination;

  INSERT INTO public.inventory_transfers_v2 (
    tenant_id, id, product_id, origin_location_id, destination_location_id,
    quantity, origin_on_hand_after, origin_reserved_after,
    destination_on_hand_after, destination_reserved_after, notes,
    idempotency_key, payload_hash, transferred_by
  ) VALUES (
    p_tenant_id, v_transfer_id, p_product_id, p_origin_location_id,
    p_destination_location_id, p_quantity, v_origin.on_hand, v_origin.reserved,
    v_destination.on_hand, v_destination.reserved, NULLIF(btrim(p_notes), ''),
    p_idempotency_key, v_payload_hash, v_actor
  );

  INSERT INTO public.inventory_ledger_v2 (
    tenant_id, product_id, location_id, event_type, quantity_delta, reserved_delta,
    on_hand_after, reserved_after, reference_type, reference_id,
    idempotency_key, actor_user_id, metadata
  ) VALUES
  (
    p_tenant_id, p_product_id, p_origin_location_id, 'TRANSFER_OUT', -p_quantity, 0,
    v_origin.on_hand, v_origin.reserved, 'INVENTORY_TRANSFER_V2', v_transfer_id,
    'inventory-transfer:' || p_idempotency_key || ':out', v_actor,
    jsonb_build_object('destination_location_id', p_destination_location_id)
  ),
  (
    p_tenant_id, p_product_id, p_destination_location_id, 'TRANSFER_IN', p_quantity, 0,
    v_destination.on_hand, v_destination.reserved, 'INVENTORY_TRANSFER_V2', v_transfer_id,
    'inventory-transfer:' || p_idempotency_key || ':in', v_actor,
    jsonb_build_object('origin_location_id', p_origin_location_id)
  );

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'INVENTORY_TRANSFERRED', 'INVENTORY_TRANSFER_V2', v_transfer_id,
    jsonb_build_object(
      'origin_on_hand', v_origin.on_hand + p_quantity,
      'destination_on_hand', v_destination.on_hand - p_quantity
    ),
    jsonb_build_object(
      'product_id', p_product_id,
      'origin_location_id', p_origin_location_id,
      'destination_location_id', p_destination_location_id,
      'quantity', p_quantity,
      'origin_on_hand', v_origin.on_hand,
      'destination_on_hand', v_destination.on_hand
    )
  );

  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'INVENTORY_TRANSFER_V2', v_transfer_id, 'INVENTORY_TRANSFERRED',
    jsonb_build_object(
      'transfer_id', v_transfer_id,
      'product_id', p_product_id,
      'origin_location_id', p_origin_location_id,
      'destination_location_id', p_destination_location_id,
      'quantity', p_quantity,
      'origin_on_hand', v_origin.on_hand,
      'destination_on_hand', v_destination.on_hand
    ),
    'inventory-transfer:' || p_idempotency_key || ':outbox'
  );

  RETURN jsonb_build_object(
    'transfer_id', v_transfer_id,
    'product_id', p_product_id,
    'origin_location_id', p_origin_location_id,
    'destination_location_id', p_destination_location_id,
    'quantity', p_quantity,
    'origin_on_hand', v_origin.on_hand,
    'origin_available', v_origin.available,
    'destination_on_hand', v_destination.on_hand,
    'destination_available', v_destination.available,
    'idempotent', false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Conteo: captura una foto inmutable del balance. No corrige stock hasta que
-- otra persona con rol de supervisión lo revise explícitamente.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_inventory_count_v2(
  p_tenant_id UUID,
  p_product_id UUID,
  p_location_id UUID,
  p_counted_quantity NUMERIC,
  p_notes TEXT,
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
  v_payload_hash TEXT := encode(digest(
    jsonb_build_object(
      'tenant_id', p_tenant_id,
      'product_id', p_product_id,
      'location_id', p_location_id,
      'counted_quantity', round(p_counted_quantity, 3)::NUMERIC(18,3),
      'notes', NULLIF(btrim(p_notes), '')
    )::text,
    'sha256'
  ), 'hex');
  v_existing public.inventory_counts_v2%ROWTYPE;
  v_balance public.inventory_balances_v2%ROWTYPE;
  v_count_id UUID := gen_random_uuid();
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'DEPOSITO']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Solo ADMIN, SUPERVISOR o DEPOSITO puede presentar conteos.';
  END IF;
  IF p_product_id IS NULL OR p_location_id IS NULL
     OR p_counted_quantity IS NULL OR p_counted_quantity < 0
     OR round(p_counted_quantity, 3) <> p_counted_quantity
     OR length(btrim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Conteo de inventario invalido.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':inventory-count:' || p_idempotency_key, 0)
  );
  SELECT inventory_count.* INTO v_existing
  FROM public.inventory_counts_v2 inventory_count
  WHERE inventory_count.tenant_id = p_tenant_id
    AND inventory_count.idempotency_key = p_idempotency_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.payload_hash <> v_payload_hash THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'Colision de idempotencia en conteo de inventario.';
    END IF;
    RETURN jsonb_build_object(
      'count_id', v_existing.id,
      'product_id', v_existing.product_id,
      'location_id', v_existing.location_id,
      'expected_on_hand', v_existing.expected_on_hand,
      'expected_reserved', v_existing.expected_reserved,
      'counted_quantity', v_existing.counted_quantity,
      'difference', v_existing.difference,
      'review_status', 'PENDING_REVIEW',
      'idempotent', true
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_products product
    WHERE product.tenant_id = p_tenant_id
      AND product.id = p_product_id
      AND product.active = true
      AND product.track_stock = true
    FOR UPDATE
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations_v2 location
    WHERE location.tenant_id = p_tenant_id
      AND location.id = p_location_id
      AND location.active = true
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Producto o ubicacion invalidos para conteo.';
  END IF;

  INSERT INTO public.inventory_balances_v2 (tenant_id, product_id, location_id)
  VALUES (p_tenant_id, p_product_id, p_location_id)
  ON CONFLICT (tenant_id, product_id, location_id) DO NOTHING;
  SELECT balance.* INTO v_balance
  FROM public.inventory_balances_v2 balance
  WHERE balance.tenant_id = p_tenant_id
    AND balance.product_id = p_product_id
    AND balance.location_id = p_location_id
  FOR UPDATE;

  INSERT INTO public.inventory_counts_v2 (
    tenant_id, id, product_id, location_id, expected_on_hand, expected_reserved,
    counted_quantity, notes, idempotency_key, payload_hash, submitted_by
  ) VALUES (
    p_tenant_id, v_count_id, p_product_id, p_location_id,
    v_balance.on_hand, v_balance.reserved, p_counted_quantity,
    NULLIF(btrim(p_notes), ''), p_idempotency_key, v_payload_hash, v_actor
  ) RETURNING * INTO v_existing;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'INVENTORY_COUNT_SUBMITTED', 'INVENTORY_COUNT_V2', v_count_id,
    jsonb_build_object(
      'product_id', p_product_id,
      'location_id', p_location_id,
      'expected_on_hand', v_balance.on_hand,
      'expected_reserved', v_balance.reserved,
      'counted_quantity', p_counted_quantity,
      'difference', p_counted_quantity - v_balance.on_hand,
      'review_status', 'PENDING_REVIEW'
    )
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'INVENTORY_COUNT_V2', v_count_id, 'INVENTORY_COUNT_SUBMITTED',
    jsonb_build_object(
      'count_id', v_count_id,
      'product_id', p_product_id,
      'location_id', p_location_id,
      'expected_on_hand', v_balance.on_hand,
      'counted_quantity', p_counted_quantity,
      'difference', p_counted_quantity - v_balance.on_hand
    ),
    'inventory-count:' || p_idempotency_key || ':outbox'
  );

  RETURN jsonb_build_object(
    'count_id', v_count_id,
    'product_id', p_product_id,
    'location_id', p_location_id,
    'expected_on_hand', v_balance.on_hand,
    'expected_reserved', v_balance.reserved,
    'counted_quantity', p_counted_quantity,
    'difference', p_counted_quantity - v_balance.on_hand,
    'review_status', 'PENDING_REVIEW',
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.review_inventory_count_v2(
  p_tenant_id UUID,
  p_count_id UUID,
  p_decision TEXT,
  p_reason TEXT,
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
  v_decision TEXT := CASE upper(btrim(COALESCE(p_decision, '')))
    WHEN 'APPROVE' THEN 'APPROVED'
    WHEN 'APROBADO' THEN 'APPROVED'
    WHEN 'REJECT' THEN 'REJECTED'
    WHEN 'RECHAZADO' THEN 'REJECTED'
    ELSE upper(btrim(COALESCE(p_decision, '')))
  END;
  v_reason TEXT := btrim(COALESCE(p_reason, ''));
  v_payload_hash TEXT;
  v_count public.inventory_counts_v2%ROWTYPE;
  v_existing public.inventory_count_reviews_v2%ROWTYPE;
  v_balance public.inventory_balances_v2%ROWTYPE;
  v_review_id UUID := gen_random_uuid();
  v_ledger_id UUID;
  v_delta NUMERIC(18,3) := 0;
  v_event_type TEXT;
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Solo ADMIN o SUPERVISOR puede revisar conteos.';
  END IF;
  IF p_count_id IS NULL OR v_decision NOT IN ('APPROVED', 'REJECTED')
     OR length(v_reason) NOT BETWEEN 2 AND 2000
     OR length(btrim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Revision de conteo invalida.';
  END IF;

  v_payload_hash := encode(digest(
    jsonb_build_object(
      'tenant_id', p_tenant_id,
      'count_id', p_count_id,
      'decision', v_decision,
      'reason', v_reason
    )::text,
    'sha256'
  ), 'hex');

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':inventory-count-review-key:' || p_idempotency_key, 0)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':inventory-count-review:' || p_count_id::text, 0)
  );

  SELECT review.* INTO v_existing
  FROM public.inventory_count_reviews_v2 review
  WHERE review.tenant_id = p_tenant_id
    AND review.idempotency_key = p_idempotency_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.payload_hash <> v_payload_hash THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'Colision de idempotencia en revision de conteo.';
    END IF;
    RETURN jsonb_build_object(
      'review_id', v_existing.id,
      'count_id', v_existing.count_id,
      'decision', v_existing.decision,
      'applied_quantity_delta', v_existing.applied_quantity_delta,
      'on_hand', v_existing.on_hand_after,
      'idempotent', true
    );
  END IF;

  SELECT inventory_count.* INTO v_count
  FROM public.inventory_counts_v2 inventory_count
  WHERE inventory_count.tenant_id = p_tenant_id
    AND inventory_count.id = p_count_id
  FOR UPDATE;
  IF v_count.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Conteo inexistente.';
  END IF;
  IF v_count.submitted_by = v_actor THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Quien presenta el conteo no puede revisar su propio conteo.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.inventory_count_reviews_v2 review
    WHERE review.tenant_id = p_tenant_id AND review.count_id = p_count_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'El conteo ya fue revisado.';
  END IF;

  IF v_decision = 'APPROVED' THEN
    SELECT balance.* INTO v_balance
    FROM public.inventory_balances_v2 balance
    WHERE balance.tenant_id = p_tenant_id
      AND balance.product_id = v_count.product_id
      AND balance.location_id = v_count.location_id
    FOR UPDATE;
    IF v_balance.product_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Balance de inventario inexistente.';
    END IF;
    IF v_balance.on_hand <> v_count.expected_on_hand
       OR v_balance.reserved <> v_count.expected_reserved THEN
      RAISE EXCEPTION USING
        ERRCODE = '40001',
        MESSAGE = 'El balance cambio desde el conteo; se requiere un nuevo conteo.';
    END IF;
    IF v_count.counted_quantity < v_balance.reserved THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'El conteo aprobado no puede quedar por debajo del stock reservado.';
    END IF;

    v_delta := v_count.counted_quantity - v_balance.on_hand;
    IF v_delta <> 0 THEN
      UPDATE public.inventory_balances_v2
      SET on_hand = v_count.counted_quantity,
          version = version + 1,
          updated_at = clock_timestamp()
      WHERE tenant_id = p_tenant_id
        AND product_id = v_count.product_id
        AND location_id = v_count.location_id
      RETURNING * INTO v_balance;
      v_event_type := CASE
        WHEN v_delta > 0 THEN 'ADJUSTMENT_POSITIVE'
        ELSE 'ADJUSTMENT_NEGATIVE'
      END;
      INSERT INTO public.inventory_ledger_v2 (
        tenant_id, product_id, location_id, event_type, quantity_delta, reserved_delta,
        on_hand_after, reserved_after, reference_type, reference_id,
        idempotency_key, actor_user_id, metadata
      ) VALUES (
        p_tenant_id, v_count.product_id, v_count.location_id, v_event_type,
        v_delta, 0, v_balance.on_hand, v_balance.reserved,
        'INVENTORY_COUNT_V2', v_count.id,
        'inventory-count-review:' || p_idempotency_key || ':stock', v_actor,
        jsonb_build_object('review_id', v_review_id, 'reason', v_reason)
      ) RETURNING id INTO v_ledger_id;
    END IF;
  END IF;

  INSERT INTO public.inventory_count_reviews_v2 (
    tenant_id, id, count_id, decision, reason, applied_quantity_delta,
    on_hand_after, reserved_after, ledger_id, idempotency_key, payload_hash, reviewed_by
  ) VALUES (
    p_tenant_id, v_review_id, p_count_id, v_decision, v_reason, v_delta,
    CASE WHEN v_decision = 'APPROVED' THEN v_balance.on_hand ELSE NULL END,
    CASE WHEN v_decision = 'APPROVED' THEN v_balance.reserved ELSE NULL END,
    v_ledger_id, p_idempotency_key, v_payload_hash, v_actor
  ) RETURNING * INTO v_existing;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'INVENTORY_COUNT_' || v_decision,
    'INVENTORY_COUNT_REVIEW_V2', v_review_id,
    jsonb_build_object(
      'count_id', v_count.id,
      'expected_on_hand', v_count.expected_on_hand,
      'expected_reserved', v_count.expected_reserved,
      'counted_quantity', v_count.counted_quantity
    ),
    jsonb_build_object(
      'decision', v_decision,
      'reason', v_reason,
      'applied_quantity_delta', v_delta,
      'on_hand_after', CASE WHEN v_decision = 'APPROVED' THEN v_balance.on_hand ELSE NULL END
    )
  );

  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'INVENTORY_COUNT_V2', p_count_id, 'INVENTORY_COUNT_' || v_decision,
    jsonb_build_object(
      'count_id', p_count_id,
      'review_id', v_review_id,
      'decision', v_decision,
      'reason', v_reason,
      'applied_quantity_delta', v_delta,
      'on_hand_after', CASE WHEN v_decision = 'APPROVED' THEN v_balance.on_hand ELSE NULL END
    ),
    'inventory-count-review:' || p_idempotency_key || ':outbox'
  );

  RETURN jsonb_build_object(
    'review_id', v_review_id,
    'count_id', p_count_id,
    'decision', v_decision,
    'applied_quantity_delta', v_delta,
    'on_hand', CASE WHEN v_decision = 'APPROVED' THEN v_balance.on_hand ELSE NULL END,
    'idempotent', false
  );
END;
$$;

-- Pagos externos de cuenta corriente no se pueden autodeclarar desde un JWT de
-- usuario. El asiento sólo es admisible desde una integración backend verificada.
CREATE OR REPLACE FUNCTION public.validate_external_ar_payment_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_request_role TEXT := COALESCE(auth.role(), current_setting('request.jwt.claim.role', true));
  v_method TEXT := upper(COALESCE(NEW.metadata->>'method', ''));
BEGIN
  IF NEW.entry_type = 'PAYMENT'
     AND v_method IN ('CARD', 'MERCADO_PAGO', 'QR')
     AND v_request_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'El pago externo de cuenta corriente requiere confirmacion del backend.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_receivable_external_payment_guard_v2
  ON public.accounts_receivable_ledger;
CREATE TRIGGER accounts_receivable_external_payment_guard_v2
  BEFORE INSERT ON public.accounts_receivable_ledger
  FOR EACH ROW EXECUTE FUNCTION public.validate_external_ar_payment_v2();

-- Los hechos WMS son append-only. La aprobación no reescribe el conteo: agrega
-- una revisión y, si corresponde, un asiento compensatorio en el ledger.
DROP TRIGGER IF EXISTS inventory_transfers_v2_append_only_v2
  ON public.inventory_transfers_v2;
CREATE TRIGGER inventory_transfers_v2_append_only_v2
  BEFORE UPDATE OR DELETE ON public.inventory_transfers_v2
  FOR EACH ROW EXECUTE FUNCTION public.reject_operational_history_mutation_v2();
DROP TRIGGER IF EXISTS inventory_counts_v2_append_only_v2
  ON public.inventory_counts_v2;
CREATE TRIGGER inventory_counts_v2_append_only_v2
  BEFORE UPDATE OR DELETE ON public.inventory_counts_v2
  FOR EACH ROW EXECUTE FUNCTION public.reject_operational_history_mutation_v2();
DROP TRIGGER IF EXISTS inventory_count_reviews_v2_append_only_v2
  ON public.inventory_count_reviews_v2;
CREATE TRIGGER inventory_count_reviews_v2_append_only_v2
  BEFORE UPDATE OR DELETE ON public.inventory_count_reviews_v2
  FOR EACH ROW EXECUTE FUNCTION public.reject_operational_history_mutation_v2();

ALTER TABLE public.inventory_transfers_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_counts_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_reviews_v2 ENABLE ROW LEVEL SECURITY;

-- Read model para la bandeja de supervisión. El estado se deriva de eventos;
-- nunca se guarda como una columna mutable en el conteo original.
CREATE OR REPLACE VIEW public.inventory_count_status_v2
WITH (security_barrier = true)
AS
SELECT
  inventory_count.tenant_id,
  inventory_count.id AS count_id,
  inventory_count.product_id,
  inventory_count.location_id,
  inventory_count.expected_on_hand,
  inventory_count.expected_reserved,
  inventory_count.counted_quantity,
  inventory_count.difference,
  inventory_count.notes,
  inventory_count.submitted_by,
  inventory_count.submitted_at,
  COALESCE(review.decision, 'PENDING_REVIEW') AS review_status,
  review.id AS review_id,
  review.decision,
  review.reason AS review_reason,
  review.applied_quantity_delta,
  review.on_hand_after,
  review.reserved_after,
  review.reviewed_by,
  review.reviewed_at
FROM public.inventory_counts_v2 inventory_count
LEFT JOIN public.inventory_count_reviews_v2 review
  ON review.tenant_id = inventory_count.tenant_id
  AND review.count_id = inventory_count.id
WHERE public.operational_is_tenant_member(inventory_count.tenant_id)
  OR COALESCE(auth.role(), current_setting('request.jwt.claim.role', true)) = 'service_role';

DROP POLICY IF EXISTS inventory_transfers_member_read_v2 ON public.inventory_transfers_v2;
CREATE POLICY inventory_transfers_member_read_v2 ON public.inventory_transfers_v2
  FOR SELECT TO authenticated
  USING (public.operational_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS inventory_transfers_service_v2 ON public.inventory_transfers_v2;
CREATE POLICY inventory_transfers_service_v2 ON public.inventory_transfers_v2
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS inventory_counts_member_read_v2 ON public.inventory_counts_v2;
CREATE POLICY inventory_counts_member_read_v2 ON public.inventory_counts_v2
  FOR SELECT TO authenticated
  USING (public.operational_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS inventory_counts_service_v2 ON public.inventory_counts_v2;
CREATE POLICY inventory_counts_service_v2 ON public.inventory_counts_v2
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS inventory_count_reviews_member_read_v2 ON public.inventory_count_reviews_v2;
CREATE POLICY inventory_count_reviews_member_read_v2 ON public.inventory_count_reviews_v2
  FOR SELECT TO authenticated
  USING (public.operational_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS inventory_count_reviews_service_v2 ON public.inventory_count_reviews_v2;
CREATE POLICY inventory_count_reviews_service_v2 ON public.inventory_count_reviews_v2
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.inventory_transfers_v2, public.inventory_counts_v2,
  public.inventory_count_reviews_v2 FROM anon, authenticated;
REVOKE ALL ON public.inventory_count_status_v2 FROM PUBLIC, anon;
GRANT SELECT ON public.inventory_transfers_v2, public.inventory_counts_v2,
  public.inventory_count_reviews_v2 TO authenticated;
GRANT SELECT ON public.inventory_count_status_v2 TO authenticated, service_role;
GRANT ALL ON public.inventory_transfers_v2, public.inventory_counts_v2,
  public.inventory_count_reviews_v2 TO service_role;

REVOKE ALL ON FUNCTION public.transfer_inventory_v2(UUID, UUID, UUID, UUID, NUMERIC, TEXT, TEXT)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_inventory_count_v2(UUID, UUID, UUID, NUMERIC, TEXT, TEXT)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_inventory_count_v2(UUID, UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_inventory_v2(UUID, UUID, UUID, UUID, NUMERIC, TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_inventory_count_v2(UUID, UUID, UUID, NUMERIC, TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_inventory_count_v2(UUID, UUID, TEXT, TEXT, TEXT)
  TO authenticated;

REVOKE ALL ON FUNCTION public.validate_external_ar_payment_v2() FROM PUBLIC, anon, authenticated;

INSERT INTO public.schema_migrations (version, name, checksum, backward_compatible, applied_by)
VALUES ('008', 'wms_inventory_security', 'sha256-wms-inventory-security-008-v2', false, 'migration-engine')
ON CONFLICT (version) DO NOTHING;

COMMIT;
