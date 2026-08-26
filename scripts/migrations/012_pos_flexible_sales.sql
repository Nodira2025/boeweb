-- ===========================================================================
-- BÔ GROW CLUB / PLATAFORMA SAAS — MIGRACIÓN 012: POS FLEXIBLE SALES V3
-- ===========================================================================
-- Extiende el checkout operativo existente sin reemplazar su libro contable.
-- QUICK_ENTRY no inventa stock; los backorders crean fulfillments y las ofertas
-- externas se cotizan exclusivamente desde el catálogo central del tenant.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Líneas flexibles y seguimiento de entrega.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sale_items_v2 ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE public.sale_items_v2
  ADD COLUMN IF NOT EXISTS line_type TEXT NOT NULL DEFAULT 'OWN_STOCK',
  ADD COLUMN IF NOT EXISTS fulfillment_status TEXT NOT NULL DEFAULT 'DELIVERED',
  ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS source_name TEXT;
ALTER TABLE public.sale_items_v2
  DROP CONSTRAINT IF EXISTS sale_items_v2_line_type_check,
  DROP CONSTRAINT IF EXISTS sale_items_v2_fulfillment_status_check;
ALTER TABLE public.sale_items_v2
  ADD CONSTRAINT sale_items_v2_line_type_check CHECK (
    line_type IN ('OWN_STOCK', 'OWN_BACKORDER', 'B2B_BACKORDER', 'LOCAL_STORE_BACKORDER', 'QUICK_ENTRY')
  ),
  ADD CONSTRAINT sale_items_v2_fulfillment_status_check CHECK (
    fulfillment_status IN ('DELIVERED', 'PENDING', 'ORDERED', 'IN_TRANSIT', 'READY_FOR_PICKUP', 'FULFILLED', 'CANCELLED')
  );

CREATE TABLE IF NOT EXISTS public.sale_fulfillments_v2 (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL,
  sale_item_id UUID NOT NULL,
  line_type TEXT NOT NULL CHECK (line_type IN ('OWN_BACKORDER', 'B2B_BACKORDER', 'LOCAL_STORE_BACKORDER')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'ORDERED', 'IN_TRANSIT', 'READY_FOR_PICKUP', 'FULFILLED', 'CANCELLED')
  ),
  expected_delivery_date DATE,
  source_name TEXT,
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 1000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  fulfilled_at TIMESTAMPTZ,
  fulfilled_by UUID,
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, sale_item_id),
  CONSTRAINT sale_fulfillments_v2_sale_fk
    FOREIGN KEY (tenant_id, sale_id) REFERENCES public.sales_v2(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT sale_fulfillments_v2_item_fk
    FOREIGN KEY (tenant_id, sale_item_id) REFERENCES public.sale_items_v2(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT sale_fulfillments_v2_actor_fk
    FOREIGN KEY (tenant_id, fulfilled_by) REFERENCES public.tenant_users(tenant_id, user_id) ON DELETE RESTRICT,
  CHECK ((status = 'FULFILLED' AND fulfilled_at IS NOT NULL AND fulfilled_by IS NOT NULL)
    OR status <> 'FULFILLED')
);
CREATE INDEX IF NOT EXISTS sale_fulfillments_v2_status_idx
  ON public.sale_fulfillments_v2 (tenant_id, status, expected_delivery_date, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Catálogo externo central y tenant-scoped.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.external_catalog_sources_v2 (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('B2B_SUPPLIER', 'LOCAL_STORE')),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 255),
  contact_info TEXT CHECK (contact_info IS NULL OR length(contact_info) <= 500),
  estimated_days INTEGER NOT NULL DEFAULT 2 CHECK (estimated_days BETWEEN 0 AND 365),
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, source_type, name)
);

CREATE TABLE IF NOT EXISTS public.external_catalog_offers_v2 (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL,
  external_sku TEXT NOT NULL CHECK (length(btrim(external_sku)) BETWEEN 1 AND 120),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 255),
  category TEXT CHECK (category IS NULL OR length(category) <= 120),
  cost_price NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  retail_price NUMERIC(18,2) NOT NULL CHECK (retail_price > 0),
  available_units NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (available_units >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, source_id, external_sku),
  CONSTRAINT external_catalog_offers_source_fk
    FOREIGN KEY (tenant_id, source_id)
    REFERENCES public.external_catalog_sources_v2(tenant_id, id)
    ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS external_catalog_sources_identity_uidx
  ON public.external_catalog_sources_v2 (tenant_id, source_type, name);
CREATE INDEX IF NOT EXISTS external_catalog_offers_search_idx
  ON public.external_catalog_offers_v2 (tenant_id, active, external_sku, name);

-- ---------------------------------------------------------------------------
-- 3. Tickets en espera y secuencias documentales.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parked_pos_tickets_v2 (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ticket_number BIGINT GENERATED ALWAYS AS IDENTITY,
  cashier_user_id UUID NOT NULL,
  salesperson_user_id UUID NOT NULL,
  customer_id UUID,
  customer_name_snapshot TEXT CHECK (customer_name_snapshot IS NULL OR length(customer_name_snapshot) <= 255),
  status TEXT NOT NULL DEFAULT 'PARKED' CHECK (status IN ('PARKED', 'CONVERTED', 'CANCELLED', 'EXPIRED')),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 255),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp() + interval '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  converted_sale_id UUID,
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, ticket_number),
  UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT parked_pos_tickets_cashier_fk
    FOREIGN KEY (tenant_id, cashier_user_id) REFERENCES public.tenant_users(tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT parked_pos_tickets_salesperson_fk
    FOREIGN KEY (tenant_id, salesperson_user_id) REFERENCES public.tenant_users(tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT parked_pos_tickets_customer_fk
    FOREIGN KEY (tenant_id, customer_id) REFERENCES public.customers(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT parked_pos_tickets_sale_fk
    FOREIGN KEY (tenant_id, converted_sale_id) REFERENCES public.sales_v2(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS parked_pos_tickets_v2_status_idx
  ON public.parked_pos_tickets_v2 (tenant_id, status, expires_at, created_at DESC);
ALTER TABLE public.parked_pos_tickets_v2 ADD COLUMN IF NOT EXISTS document_number TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS parked_pos_tickets_v2_document_number_uidx
  ON public.parked_pos_tickets_v2 (tenant_id, document_number)
  WHERE document_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.document_sequences_v2 (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (
    doc_type IN ('CASH_VOUCHER_EXPENSE', 'CASH_VOUCHER_INCOME', 'CASH_CLOSURE', 'AR_PAYMENT_RECEIPT', 'POS_RECEIPT', 'PARKED_TICKET')
  ),
  prefix TEXT NOT NULL CHECK (length(btrim(prefix)) BETWEEN 1 AND 40),
  current_value BIGINT NOT NULL DEFAULT 0 CHECK (current_value >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, doc_type)
);
ALTER TABLE public.document_sequences_v2 DROP CONSTRAINT IF EXISTS document_sequences_v2_doc_type_check;
ALTER TABLE public.document_sequences_v2 ADD CONSTRAINT document_sequences_v2_doc_type_check CHECK (
  doc_type IN ('CASH_VOUCHER_EXPENSE', 'CASH_VOUCHER_INCOME', 'CASH_CLOSURE', 'AR_PAYMENT_RECEIPT', 'POS_RECEIPT', 'PARKED_TICKET')
);

ALTER TABLE public.cash_movements_v2
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS document_type TEXT;
ALTER TABLE public.cash_movements_v2 DROP CONSTRAINT IF EXISTS cash_movements_v2_document_type_check;
ALTER TABLE public.cash_movements_v2 ADD CONSTRAINT cash_movements_v2_document_type_check CHECK (
  document_type IS NULL OR document_type IN ('CASH_VOUCHER_EXPENSE', 'CASH_VOUCHER_INCOME')
);
CREATE UNIQUE INDEX IF NOT EXISTS cash_movements_v2_document_number_uidx
  ON public.cash_movements_v2 (tenant_id, document_number)
  WHERE document_number IS NOT NULL;

ALTER TABLE public.cash_closures ADD COLUMN IF NOT EXISTS document_number TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS cash_closures_document_number_uidx
  ON public.cash_closures (tenant_id, document_number)
  WHERE document_number IS NOT NULL;

ALTER TABLE public.accounts_receivable_ledger ADD COLUMN IF NOT EXISTS document_number TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_receivable_ledger_document_number_uidx
  ON public.accounts_receivable_ledger (tenant_id, document_number)
  WHERE document_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.allocate_document_number_v2(p_tenant_id UUID, p_doc_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_seq public.document_sequences_v2%ROWTYPE;
  v_type TEXT := upper(btrim(COALESCE(p_doc_type, '')));
  v_default_prefix TEXT;
BEGIN
  IF v_type NOT IN ('CASH_VOUCHER_EXPENSE', 'CASH_VOUCHER_INCOME', 'CASH_CLOSURE', 'AR_PAYMENT_RECEIPT', 'POS_RECEIPT', 'PARKED_TICKET') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Tipo documental invalido.';
  END IF;
  v_default_prefix := CASE v_type
    WHEN 'CASH_VOUCHER_EXPENSE' THEN 'VALE-EGRESO-'
    WHEN 'CASH_VOUCHER_INCOME' THEN 'REC-INGRESO-'
    WHEN 'CASH_CLOSURE' THEN 'CIERRE-CAJA-'
    WHEN 'AR_PAYMENT_RECEIPT' THEN 'REC-COBRO-'
    WHEN 'PARKED_TICKET' THEN 'ESPERA-'
    ELSE 'TICKET-'
  END;
  INSERT INTO public.document_sequences_v2 (tenant_id, doc_type, prefix, current_value)
  VALUES (p_tenant_id, v_type, v_default_prefix, 1)
  ON CONFLICT (tenant_id, doc_type) DO UPDATE
  SET current_value = public.document_sequences_v2.current_value + 1,
      updated_at = clock_timestamp()
  RETURNING * INTO v_seq;
  RETURN v_seq.prefix || to_char(clock_timestamp(), 'YYYYMMDD-') || lpad(v_seq.current_value::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.next_document_number_v2(p_tenant_id UUID, p_doc_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_type TEXT := upper(btrim(COALESCE(p_doc_type, '')));
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.status = 'ACTIVE'
  ) OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'VENDEDOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Membresia operativa requerida para numerar documentos.';
  END IF;
  IF v_type NOT IN ('CASH_VOUCHER_EXPENSE', 'CASH_VOUCHER_INCOME', 'CASH_CLOSURE', 'AR_PAYMENT_RECEIPT', 'POS_RECEIPT', 'PARKED_TICKET') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Tipo documental invalido.';
  END IF;
  RETURN public.allocate_document_number_v2(p_tenant_id, v_type);
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_cash_movement_document_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  -- La venta ya posee su comprobante POS. Sólo los movimientos manuales de
  -- caja reciben un vale independiente, evitando duplicar documentación.
  IF NEW.movement_type IN ('INCOME', 'EXPENSE', 'WITHDRAWAL', 'ADJUSTMENT')
     AND COALESCE(NEW.reference_type, '') <> 'AR_LEDGER' THEN
    NEW.document_type := CASE WHEN NEW.direction = 'OUT'
      THEN 'CASH_VOUCHER_EXPENSE' ELSE 'CASH_VOUCHER_INCOME' END;
    IF NEW.document_number IS NULL THEN
      NEW.document_number := public.allocate_document_number_v2(NEW.tenant_id, NEW.document_type);
    END IF;
  ELSE
    NEW.document_type := NULL;
    NEW.document_number := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cash_movements_assign_document_v2 ON public.cash_movements_v2;
CREATE TRIGGER cash_movements_assign_document_v2
BEFORE INSERT ON public.cash_movements_v2
FOR EACH ROW EXECUTE FUNCTION public.assign_cash_movement_document_v2();

CREATE OR REPLACE FUNCTION public.assign_cash_closure_document_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  IF NEW.document_number IS NULL THEN
    NEW.document_number := public.allocate_document_number_v2(NEW.tenant_id, 'CASH_CLOSURE');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cash_closures_assign_document_v2 ON public.cash_closures;
CREATE TRIGGER cash_closures_assign_document_v2
BEFORE INSERT ON public.cash_closures
FOR EACH ROW EXECUTE FUNCTION public.assign_cash_closure_document_v2();

CREATE OR REPLACE FUNCTION public.assign_ar_payment_document_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  IF NEW.entry_type = 'PAYMENT' AND NEW.document_number IS NULL THEN
    NEW.document_number := public.allocate_document_number_v2(NEW.tenant_id, 'AR_PAYMENT_RECEIPT');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ar_payments_assign_document_v2 ON public.accounts_receivable_ledger;
CREATE TRIGGER ar_payments_assign_document_v2
BEFORE INSERT ON public.accounts_receivable_ledger
FOR EACH ROW EXECUTE FUNCTION public.assign_ar_payment_document_v2();

-- Conserva el conteo físico junto al cierre. La versión anterior sólo recibía
-- el total, por lo que el desglose impreso podía quedar mutable en el navegador.
CREATE OR REPLACE FUNCTION public.submit_cash_closure_v3(
  p_tenant_id UUID,
  p_session_id UUID,
  p_counted NUMERIC,
  p_cash_breakdown JSONB DEFAULT '{}'::jsonb,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_session public.cash_sessions_v2%ROWTYPE;
  v_existing public.cash_closures%ROWTYPE;
  v_expected NUMERIC(18,2);
  v_closure public.cash_closures%ROWTYPE;
  v_breakdown JSONB := COALESCE(p_cash_breakdown, '{}'::jsonb);
  v_breakdown_total NUMERIC := 0;
  v_key TEXT;
  v_value JSONB;
  v_numeric NUMERIC;
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.status = 'ACTIVE'
  ) OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'VENDEDOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Rol operativo activo requerido para cerrar caja.';
  END IF;
  IF p_counted IS NULL OR p_counted < 0 OR round(p_counted, 2) <> p_counted THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Efectivo contado invalido.';
  END IF;
  IF p_notes IS NOT NULL AND length(btrim(p_notes)) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Las observaciones superan el limite permitido.';
  END IF;
  IF jsonb_typeof(v_breakdown) <> 'object' OR octet_length(v_breakdown::text) > 4096 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El desglose de efectivo es invalido.';
  END IF;

  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(v_breakdown)
  LOOP
    IF jsonb_typeof(v_value) <> 'number'
       OR (v_key <> 'coins' AND v_key !~ '^[1-9][0-9]{0,8}$') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El desglose contiene una denominacion invalida.';
    END IF;
    v_numeric := v_value::text::numeric;
    IF v_numeric < 0 OR v_numeric > 1000000000
       OR (v_key = 'coins' AND scale(v_numeric) > 2)
       OR (v_key <> 'coins' AND (scale(v_numeric) > 0 OR v_numeric > 100000)) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El desglose contiene una cantidad invalida.';
    END IF;
    v_breakdown_total := v_breakdown_total + CASE WHEN v_key = 'coins'
      THEN v_numeric ELSE v_key::numeric * v_numeric END;
  END LOOP;
  IF v_breakdown <> '{}'::jsonb AND round(v_breakdown_total, 2) <> p_counted THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El desglose de efectivo no coincide con el total contado.';
  END IF;

  -- Bloquear primero la sesión hace idempotente también el doble clic concurrente.
  SELECT cs.* INTO v_session
  FROM public.cash_sessions_v2 cs
  WHERE cs.tenant_id = p_tenant_id AND cs.id = p_session_id
  FOR UPDATE;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'La sesion de caja no existe.';
  END IF;
  IF v_session.opened_by <> v_actor AND NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo el cajero titular o un supervisor puede cerrar esta sesion.';
  END IF;

  SELECT cc.* INTO v_existing
  FROM public.cash_closures cc
  WHERE cc.tenant_id = p_tenant_id AND cc.session_id = p_session_id
  FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.counted_amount <> p_counted
       OR COALESCE(v_existing.metadata->'cash_breakdown', '{}'::jsonb) IS DISTINCT FROM v_breakdown THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'La sesion ya fue cerrada con otro conteo.';
    END IF;
    RETURN jsonb_build_object(
      'closure_id', v_existing.id, 'document_number', v_existing.document_number,
      'session_id', p_session_id, 'expected_amount', v_existing.expected_amount,
      'counted_amount', v_existing.counted_amount, 'cash_breakdown', v_breakdown,
      'difference', v_existing.difference, 'review_status', v_existing.review_status,
      'idempotent', true
    );
  END IF;
  IF v_session.status <> 'OPEN' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'La sesion no esta OPEN.';
  END IF;

  SELECT round(
    v_session.opening_amount + COALESCE(sum(CASE WHEN cm.direction = 'IN' THEN cm.amount ELSE -cm.amount END), 0),
    2
  ) INTO v_expected
  FROM public.cash_movements_v2 cm
  WHERE cm.tenant_id = p_tenant_id AND cm.session_id = p_session_id;
  IF v_expected < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'La caja derivada no puede quedar con efectivo negativo.';
  END IF;

  UPDATE public.cash_sessions_v2
  SET status = 'CLOSED', closed_by = v_actor, closed_at = clock_timestamp(),
      version = version + 1
  WHERE tenant_id = p_tenant_id AND id = p_session_id;

  INSERT INTO public.cash_closures (
    tenant_id, session_id, expected_amount, counted_amount, difference,
    review_status, closed_by, notes, metadata
  ) VALUES (
    p_tenant_id, p_session_id, v_expected, p_counted, round(p_counted - v_expected, 2),
    'PENDING_REVIEW', v_actor, NULLIF(btrim(p_notes), ''),
    jsonb_build_object('cash_breakdown', v_breakdown, 'closure_version', 3)
  ) RETURNING * INTO v_closure;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'CASH_CLOSURE_SUBMITTED', 'CASH_CLOSURE', v_closure.id,
    jsonb_build_object(
      'session_id', p_session_id, 'document_number', v_closure.document_number,
      'expected_amount', v_expected, 'counted_amount', p_counted,
      'cash_breakdown', v_breakdown, 'difference', v_closure.difference,
      'review_status', 'PENDING_REVIEW'
    )
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'CASH_CLOSURE', v_closure.id, 'CASH_CLOSURE_REVIEW_REQUIRED',
    jsonb_build_object(
      'closure_id', v_closure.id, 'document_number', v_closure.document_number,
      'session_id', p_session_id, 'difference', v_closure.difference
    ),
    'cash-closure:' || v_closure.id::text
  );

  RETURN jsonb_build_object(
    'closure_id', v_closure.id, 'document_number', v_closure.document_number,
    'session_id', p_session_id, 'expected_amount', v_expected,
    'counted_amount', p_counted, 'cash_breakdown', v_breakdown,
    'difference', v_closure.difference, 'review_status', v_closure.review_status,
    'idempotent', false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Checkout flexible autoritativo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.checkout_sale_v3(
  p_tenant_id UUID,
  p_idempotency_key TEXT,
  p_payload_hash TEXT,
  p_items JSONB,
  p_payments JSONB,
  p_cashier_user_id UUID,
  p_salesperson_user_id UUID,
  p_customer_id UUID DEFAULT NULL,
  p_register_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_due_date DATE DEFAULT NULL,
  p_adjustment JSONB DEFAULT '{}'::jsonb,
  p_parked_ticket_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_existing public.sales_v2%ROWTYPE;
  v_item JSONB;
  v_payment JSONB;
  v_product public.catalog_products%ROWTYPE;
  v_offer RECORD;
  v_balance public.inventory_balances_v2%ROWTYPE;
  v_account public.customer_accounts%ROWTYPE;
  v_parked public.parked_pos_tickets_v2%ROWTYPE;
  v_sale_id UUID := gen_random_uuid();
  v_sale_item_id UUID;
  v_sale_number BIGINT;
  v_document_number TEXT;
  v_location_id UUID;
  v_session_id UUID;
  v_payment_id UUID;
  v_qty NUMERIC(18,3);
  v_unit_price NUMERIC(18,2);
  v_tax_rate NUMERIC(7,4);
  v_line_subtotal NUMERIC(18,2);
  v_line_tax NUMERIC(18,2);
  v_subtotal NUMERIC(18,2) := 0;
  v_tax_total NUMERIC(18,2) := 0;
  v_total NUMERIC(18,2);
  v_payment_total NUMERIC(18,2) := 0;
  v_cc_total NUMERIC(18,2) := 0;
  v_payment_amount NUMERIC(18,2);
  v_payment_method TEXT;
  v_currency CHAR(3);
  v_item_currency CHAR(3);
  v_adjustment_type TEXT := upper(COALESCE(NULLIF(p_adjustment->>'type', ''), 'NONE'));
  v_adjustment_value NUMERIC(18,4) := COALESCE(NULLIF(p_adjustment->>'value', '')::numeric, 0);
  v_adjustment_amount NUMERIC(18,2) := 0;
  v_request_fingerprint TEXT;
  v_cashier_role TEXT;
  v_rules JSONB := '{}'::jsonb;
  v_app_config JSONB := '{}'::jsonb;
  v_allow_backorders BOOLEAN := true;
  v_current_account_enabled BOOLEAN := true;
  v_block_overdue BOOLEAN := true;
  v_overdue NUMERIC(18,2) := 0;
  v_allow_vendor_adjustments BOOLEAN := false;
  v_vendor_max_discount_percent NUMERIC := 0;
  v_vendor_max_discount_fixed NUMERIC := 0;
  v_line_type TEXT;
  v_source_type TEXT;
  v_source_id UUID;
  v_source_name TEXT;
  v_sku TEXT;
  v_name TEXT;
  v_fulfillment_status TEXT;
  v_expected_delivery_date DATE;
  v_index INTEGER := 0;
  v_receipt_items JSONB;
  v_receipt_payments JSONB;
  v_cash_tendered NUMERIC(18,2);
  v_cash_change NUMERIC(18,2);
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Autenticacion requerida.';
  END IF;
  IF p_cashier_user_id IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'El cajero debe coincidir con la identidad autenticada.';
  END IF;
  IF NOT public.operational_is_tenant_member(p_tenant_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'La identidad no es miembro activo del tenant.';
  END IF;
  SELECT upper(tu.role) INTO v_cashier_role
  FROM public.tenant_users tu
  JOIN public.tenants t ON t.id = tu.tenant_id AND t.status = 'ACTIVE'
  WHERE tu.tenant_id = p_tenant_id AND tu.user_id = p_cashier_user_id
    AND tu.active = true AND upper(tu.role) IN ('ADMIN', 'SUPERVISOR', 'VENDEDOR');
  IF v_cashier_role IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'El cajero no posee un rol operativo activo.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = p_tenant_id AND tu.user_id = p_salesperson_user_id
      AND tu.active = true AND upper(tu.role) IN ('ADMIN', 'SUPERVISOR', 'VENDEDOR')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'El vendedor atribuido no es un miembro operativo activo.';
  END IF;
  IF length(btrim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 255
     OR length(btrim(COALESCE(p_payload_hash, ''))) NOT BETWEEN 8 AND 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Idempotencia de venta invalida.';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0
     OR jsonb_typeof(p_payments) <> 'array' OR jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La venta requiere items y pagos.';
  END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.tenant_id = p_tenant_id AND c.id = p_customer_id AND c.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Cliente inexistente o inactivo.';
  END IF;

  v_request_fingerprint := encode(digest(convert_to(concat_ws('|',
    p_items::text, p_payments::text, p_customer_id::text, p_register_id::text,
    p_due_date::text, COALESCE(p_notes, ''), COALESCE(p_adjustment, '{}'::jsonb)::text,
    p_parked_ticket_id::text, p_cashier_user_id::text, p_salesperson_user_id::text), 'UTF8'), 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':sale:' || btrim(p_idempotency_key), 0));
  SELECT * INTO v_existing FROM public.sales_v2 s
  WHERE s.tenant_id = p_tenant_id AND s.idempotency_key = btrim(p_idempotency_key)
  FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.payload_hash <> p_payload_hash OR v_existing.request_fingerprint <> v_request_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Colision de idempotencia en venta.';
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', si.id, 'line_type', si.line_type, 'sku', si.product_sku_snapshot,
      'name', si.product_name_snapshot, 'quantity', si.quantity,
      'unit_price', si.unit_price, 'line_total', si.line_total,
      'fulfillment_status', si.fulfillment_status,
      'expected_delivery_date', si.expected_delivery_date, 'source_name', si.source_name
    ) ORDER BY si.created_at), '[]'::jsonb)
    INTO v_receipt_items FROM public.sale_items_v2 si
    WHERE si.tenant_id = p_tenant_id AND si.sale_id = v_existing.id;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'method', sp.method, 'amount', sp.amount, 'metadata', sp.metadata
    ) ORDER BY sp.created_at), '[]'::jsonb)
    INTO v_receipt_payments FROM public.sale_payments_v2 sp
    WHERE sp.tenant_id = p_tenant_id AND sp.sale_id = v_existing.id;
    RETURN jsonb_build_object(
      'sale_id', v_existing.id, 'sale_number', v_existing.sale_number,
      'document_number', v_existing.metadata->>'document_number',
      'currency', v_existing.currency, 'subtotal', v_existing.subtotal,
      'tax_amount', v_existing.tax_amount, 'adjustment_amount', v_existing.adjustment_amount,
      'total', v_existing.total, 'status', v_existing.status,
      'items', v_receipt_items, 'payments', v_receipt_payments, 'idempotent', true
    );
  END IF;

  IF p_parked_ticket_id IS NOT NULL THEN
    SELECT * INTO v_parked FROM public.parked_pos_tickets_v2 pt
    WHERE pt.tenant_id = p_tenant_id AND pt.id = p_parked_ticket_id FOR UPDATE;
    IF v_parked.id IS NULL OR v_parked.status <> 'PARKED' OR v_parked.expires_at <= clock_timestamp() THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'El ticket en espera no esta disponible.';
    END IF;
    IF v_parked.cashier_user_id <> v_caller_id AND v_cashier_role = 'VENDEDOR' THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'El vendedor solo puede recuperar sus propios tickets.';
    END IF;
  END IF;

  SELECT COALESCE(tac.config_json, '{}'::jsonb) INTO v_app_config
  FROM public.tenant_app_config tac
  WHERE tac.tenant_id = p_tenant_id AND tac.stage = 'published';
  v_app_config := COALESCE(v_app_config, '{}'::jsonb);
  v_rules := COALESCE(v_app_config->'rules', '{}'::jsonb);
  v_allow_backorders := lower(COALESCE(v_app_config #>> '{catalog,allowBackorders}', 'true')) = 'true';
  v_current_account_enabled := lower(COALESCE(v_rules #>> '{currentAccount,enabled}', 'true')) = 'true';
  v_block_overdue := lower(COALESCE(v_rules #>> '{currentAccount,blockOverdue}', 'true')) = 'true';
  v_allow_vendor_adjustments := lower(COALESCE(v_rules #>> '{sales,allowVendorAdjustments}', 'false')) = 'true';
  v_vendor_max_discount_percent := COALESCE(NULLIF(v_rules #>> '{sales,maxDiscountPercent}', '')::numeric, 0);
  v_vendor_max_discount_fixed := COALESCE(NULLIF(v_rules #>> '{sales,maxDiscountFixed}', '')::numeric, 0);

  -- Primera pasada: bloqueos, precios autoritativos y totales.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Cada item debe ser un objeto.';
    END IF;
    v_line_type := upper(COALESCE(NULLIF(v_item->>'line_type', ''), 'OWN_STOCK'));
    v_qty := NULLIF(v_item->>'quantity', '')::numeric;
    IF v_line_type NOT IN ('OWN_STOCK', 'OWN_BACKORDER', 'B2B_BACKORDER', 'LOCAL_STORE_BACKORDER', 'QUICK_ENTRY')
       OR v_qty IS NULL OR v_qty <= 0 OR v_qty > 999 OR scale(v_qty) > 3 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Tipo o cantidad de item invalida.';
    END IF;
    IF v_line_type IN ('OWN_BACKORDER', 'B2B_BACKORDER', 'LOCAL_STORE_BACKORDER') AND NOT v_allow_backorders THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'La venta por encargo esta deshabilitada para este tenant.';
    END IF;
    IF v_item ? 'metadata' AND jsonb_typeof(v_item->'metadata') <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Los metadatos del item deben ser un objeto JSON.';
    END IF;
    IF octet_length(COALESCE(v_item->'metadata', '{}'::jsonb)::text) > 16384 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Los metadatos del item superan el limite permitido.';
    END IF;
    IF v_line_type = 'OWN_BACKORDER' THEN
      BEGIN
        v_expected_delivery_date := NULLIF(v_item->>'expected_delivery_date', '')::date;
      EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Fecha estimada de entrega invalida.';
      END;
      IF v_expected_delivery_date IS NULL OR v_expected_delivery_date < current_date THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El encargo propio requiere una fecha estimada vigente.';
      END IF;
    END IF;
    v_product.id := NULL;
    v_source_id := NULL;
    IF v_line_type IN ('OWN_STOCK', 'OWN_BACKORDER') THEN
      SELECT cp.* INTO v_product FROM public.catalog_products cp
      WHERE cp.tenant_id = p_tenant_id AND cp.active = true
        AND ((v_item ? 'product_id' AND cp.id::text = v_item->>'product_id')
          OR cp.sku = COALESCE(NULLIF(v_item->>'sku', ''), NULLIF(v_item->>'product_id', '')))
      ORDER BY CASE WHEN cp.id::text = COALESCE(v_item->>'product_id', '') THEN 0 ELSE 1 END
      LIMIT 1 FOR UPDATE;
      IF v_product.id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Producto propio inexistente o inactivo.';
      END IF;
      v_unit_price := v_product.price;
      v_tax_rate := v_product.tax_rate;
      v_item_currency := v_product.currency;
      IF v_line_type = 'OWN_STOCK' AND v_product.track_stock THEN
        BEGIN
          v_location_id := NULLIF(v_item->>'location_id', '')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'location_id invalido.';
        END;
        IF v_location_id IS NULL THEN
          SELECT il.id INTO v_location_id FROM public.inventory_locations_v2 il
          WHERE il.tenant_id = p_tenant_id AND il.is_default = true
            AND il.active = true AND il.is_sellable = true;
        END IF;
        SELECT ib.* INTO v_balance FROM public.inventory_balances_v2 ib
        WHERE ib.tenant_id = p_tenant_id AND ib.product_id = v_product.id AND ib.location_id = v_location_id
        FOR UPDATE;
        IF v_location_id IS NULL OR v_balance.product_id IS NULL OR (v_balance.on_hand - v_balance.reserved) < v_qty THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Stock insuficiente en la ubicacion seleccionada.';
        END IF;
      END IF;
    ELSIF v_line_type IN ('B2B_BACKORDER', 'LOCAL_STORE_BACKORDER') THEN
      BEGIN
        v_source_id := NULLIF(v_item->>'source_id', '')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Oferta externa invalida.';
      END;
      SELECT o.id, o.external_sku, o.name, o.retail_price, o.available_units,
             s.id AS catalog_source_id, s.name AS source_name, s.source_type,
             CASE
               WHEN upper(btrim(COALESCE(o.metadata->>'currency', 'ARS'))) ~ '^[A-Z]{3}$'
                 THEN upper(btrim(COALESCE(o.metadata->>'currency', 'ARS')))::char(3)
               ELSE 'ARS'::char(3)
             END AS currency
      INTO v_offer
      FROM public.external_catalog_offers_v2 o
      JOIN public.external_catalog_sources_v2 s ON s.tenant_id = o.tenant_id AND s.id = o.source_id
      WHERE o.tenant_id = p_tenant_id AND o.id = v_source_id AND o.active = true AND s.active = true
      FOR UPDATE OF o;
      IF v_offer.id IS NULL
         OR (v_line_type = 'B2B_BACKORDER' AND v_offer.source_type <> 'B2B_SUPPLIER')
         OR (v_line_type = 'LOCAL_STORE_BACKORDER' AND v_offer.source_type <> 'LOCAL_STORE') THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Oferta externa inexistente, inactiva o de origen incorrecto.';
      END IF;
      v_unit_price := v_offer.retail_price;
      v_tax_rate := 0;
      v_item_currency := v_offer.currency;
    ELSE
      v_name := btrim(COALESCE(v_item->>'name', ''));
      v_unit_price := round(NULLIF(v_item->>'client_unit_price', '')::numeric, 2);
      v_tax_rate := 0;
      IF length(v_name) NOT BETWEEN 3 AND 255 OR v_unit_price IS NULL OR v_unit_price <= 0 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El item rapido requiere nombre y precio validos.';
      END IF;
      IF upper(COALESCE(NULLIF(v_item->>'currency', ''), 'ARS')) !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La moneda del item rapido es invalida.';
      END IF;
      v_item_currency := upper(COALESCE(NULLIF(v_item->>'currency', ''), 'ARS'))::char(3);
    END IF;
    IF v_currency IS NULL THEN v_currency := v_item_currency; END IF;
    IF v_item_currency <> v_currency THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'No se pueden mezclar monedas en una venta.';
    END IF;
    v_line_subtotal := round(v_qty * v_unit_price, 2);
    v_line_tax := round(v_line_subtotal * v_tax_rate / 100, 2);
    v_subtotal := v_subtotal + v_line_subtotal;
    v_tax_total := v_tax_total + v_line_tax;
  END LOOP;

  IF v_adjustment_type NOT IN ('NONE', 'DISCOUNT_PERCENT', 'DISCOUNT_FIXED', 'INCREASE_PERCENT', 'INCREASE_FIXED')
     OR v_adjustment_value < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Ajuste comercial invalido.';
  END IF;
  IF v_cashier_role = 'VENDEDOR' AND v_adjustment_type <> 'NONE' AND NOT v_allow_vendor_adjustments THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'El vendedor no tiene permiso para aplicar ajustes.';
  END IF;
  CASE v_adjustment_type
    WHEN 'NONE' THEN v_adjustment_value := 0; v_adjustment_amount := 0;
    WHEN 'DISCOUNT_PERCENT' THEN
      IF v_adjustment_value > 100 OR (v_cashier_role = 'VENDEDOR' AND v_adjustment_value > v_vendor_max_discount_percent) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Porcentaje de descuento fuera de regla.';
      END IF;
      v_adjustment_amount := -round(v_subtotal * v_adjustment_value / 100, 2);
    WHEN 'DISCOUNT_FIXED' THEN
      IF v_adjustment_value > v_subtotal OR (v_cashier_role = 'VENDEDOR' AND v_adjustment_value > v_vendor_max_discount_fixed) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Descuento fijo fuera de regla.';
      END IF;
      v_adjustment_amount := -round(v_adjustment_value, 2);
    WHEN 'INCREASE_PERCENT' THEN
      IF v_adjustment_value > 1000 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Recargo porcentual fuera de rango.';
      END IF;
      v_adjustment_amount := round(v_subtotal * v_adjustment_value / 100, 2);
    WHEN 'INCREASE_FIXED' THEN v_adjustment_amount := round(v_adjustment_value, 2);
  END CASE;
  v_total := round(v_subtotal + v_tax_total + v_adjustment_amount, 2);
  IF v_total <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El total de venta debe ser mayor a cero.';
  END IF;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    IF jsonb_typeof(v_payment) <> 'object'
       OR (v_payment ? 'metadata' AND jsonb_typeof(v_payment->'metadata') <> 'object') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Cada pago y sus metadatos deben ser objetos JSON.';
    END IF;
    IF octet_length(COALESCE(v_payment->'metadata', '{}'::jsonb)::text) > 16384 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Los metadatos del pago superan el limite permitido.';
    END IF;
    v_payment_method := CASE upper(COALESCE(v_payment->>'payment_method', v_payment->>'method', ''))
      WHEN 'EFECTIVO' THEN 'CASH' WHEN 'TRANSFERENCIA' THEN 'BANK_TRANSFER'
      WHEN 'TARJETA' THEN 'CARD' WHEN 'MERCADOPAGO' THEN 'MERCADO_PAGO'
      WHEN 'CUENTA_CORRIENTE' THEN 'ACCOUNT_CREDIT'
      ELSE upper(COALESCE(v_payment->>'payment_method', v_payment->>'method', '')) END;
    v_payment_amount := round(NULLIF(v_payment->>'amount', '')::numeric, 2);
    IF v_payment_method NOT IN ('CASH', 'BANK_TRANSFER', 'CARD', 'MERCADO_PAGO', 'QR', 'ACCOUNT_CREDIT', 'OTHER')
       OR v_payment_amount IS NULL OR v_payment_amount <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Medio o importe de pago invalido.';
    END IF;
    v_payment_total := v_payment_total + v_payment_amount;
    IF v_payment_method = 'CASH' THEN
      v_cash_tendered := NULLIF(v_payment #>> '{metadata,cash_tendered}', '')::numeric;
      IF v_cash_tendered IS NOT NULL AND (round(v_cash_tendered, 2) <> v_cash_tendered OR v_cash_tendered < v_payment_amount) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El efectivo recibido es invalido o insuficiente.';
      END IF;
    END IF;
    IF v_payment_method = 'ACCOUNT_CREDIT' THEN v_cc_total := v_cc_total + v_payment_amount; END IF;
  END LOOP;
  IF round(v_payment_total, 2) <> v_total THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La suma de pagos no coincide con el total autoritativo.';
  END IF;
  IF p_register_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Toda venta POS requiere una caja seleccionada.';
  END IF;
  SELECT cs.id INTO v_session_id FROM public.cash_sessions_v2 cs
  WHERE cs.tenant_id = p_tenant_id AND cs.register_id = p_register_id
    AND cs.status = 'OPEN' AND cs.opened_by = p_cashier_user_id FOR UPDATE;
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'No existe una sesion OPEN propia para esa caja.';
  END IF;
  IF v_cc_total > 0 THEN
    IF NOT v_current_account_enabled THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'La cuenta corriente esta deshabilitada para esta empresa.';
    END IF;
    IF p_customer_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Cuenta corriente requiere cliente.';
    END IF;
    SELECT ca.* INTO v_account FROM public.customer_accounts ca
    WHERE ca.tenant_id = p_tenant_id AND ca.customer_id = p_customer_id
      AND ca.currency = v_currency AND ca.status = 'ACTIVE' FOR UPDATE;
    IF v_account.id IS NULL OR v_account.balance + v_cc_total > v_account.credit_limit THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Cuenta inexistente, inactiva o sin limite disponible.';
    END IF;
    IF v_block_overdue THEN
      SELECT GREATEST(
        COALESCE(sum(CASE WHEN ar.direction = 'DEBIT' AND ar.due_date < current_date THEN ar.amount ELSE 0 END), 0)
        - COALESCE(sum(CASE WHEN ar.direction = 'CREDIT' THEN ar.amount ELSE 0 END), 0),
        0
      ) INTO v_overdue
      FROM public.accounts_receivable_ledger ar
      WHERE ar.tenant_id = p_tenant_id AND ar.account_id = v_account.id;
      IF v_overdue > 0 THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'La cuenta posee deuda vencida y no admite nuevos cargos.';
      END IF;
    END IF;
  END IF;

  v_document_number := public.next_document_number_v2(p_tenant_id, 'POS_RECEIPT');
  INSERT INTO public.sales_v2 (
    tenant_id, id, status, cashier_user_id, salesperson_user_id, customer_id,
    currency, subtotal, tax_amount, adjustment_type, adjustment_value,
    adjustment_amount, total, idempotency_key, payload_hash,
    request_fingerprint, notes, due_date, metadata
  ) VALUES (
    p_tenant_id, v_sale_id, 'CONFIRMED', p_cashier_user_id, p_salesperson_user_id, p_customer_id,
    v_currency, v_subtotal, v_tax_total, v_adjustment_type, v_adjustment_value,
    v_adjustment_amount, v_total, btrim(p_idempotency_key), p_payload_hash,
    v_request_fingerprint, NULLIF(btrim(p_notes), ''), p_due_date,
    jsonb_build_object('document_number', v_document_number, 'checkout_version', 3)
  ) RETURNING sale_number INTO v_sale_number;

  -- Segunda pasada: persistencia y movimientos.
  v_index := 0;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_index := v_index + 1;
    v_line_type := upper(COALESCE(NULLIF(v_item->>'line_type', ''), 'OWN_STOCK'));
    v_qty := (v_item->>'quantity')::numeric;
    v_location_id := NULL;
    v_source_type := NULL;
    v_source_id := NULL;
    v_source_name := NULL;
    v_product.id := NULL;
    IF v_line_type IN ('OWN_STOCK', 'OWN_BACKORDER') THEN
      SELECT cp.* INTO v_product FROM public.catalog_products cp
      WHERE cp.tenant_id = p_tenant_id AND cp.active = true
        AND ((v_item ? 'product_id' AND cp.id::text = v_item->>'product_id')
          OR cp.sku = COALESCE(NULLIF(v_item->>'sku', ''), NULLIF(v_item->>'product_id', '')))
      ORDER BY CASE WHEN cp.id::text = COALESCE(v_item->>'product_id', '') THEN 0 ELSE 1 END
      LIMIT 1 FOR UPDATE;
      v_unit_price := v_product.price;
      v_tax_rate := v_product.tax_rate;
      v_sku := v_product.sku;
      v_name := v_product.name;
      v_fulfillment_status := CASE WHEN v_line_type = 'OWN_STOCK' THEN 'DELIVERED' ELSE 'PENDING' END;
      IF v_line_type = 'OWN_STOCK' AND v_product.track_stock THEN
        v_location_id := NULLIF(v_item->>'location_id', '')::uuid;
        IF v_location_id IS NULL THEN
          SELECT il.id INTO v_location_id FROM public.inventory_locations_v2 il
          WHERE il.tenant_id = p_tenant_id AND il.is_default = true AND il.active = true AND il.is_sellable = true;
        END IF;
        UPDATE public.inventory_balances_v2
        SET on_hand = on_hand - v_qty, version = version + 1, updated_at = clock_timestamp()
        WHERE tenant_id = p_tenant_id AND product_id = v_product.id AND location_id = v_location_id
        RETURNING * INTO v_balance;
        INSERT INTO public.inventory_ledger_v2 (
          tenant_id, product_id, location_id, event_type, quantity_delta, reserved_delta,
          on_hand_after, reserved_after, reference_type, reference_id,
          idempotency_key, actor_user_id, metadata
        ) VALUES (
          p_tenant_id, v_product.id, v_location_id, 'SALE', -v_qty, 0,
          v_balance.on_hand, v_balance.reserved, 'SALE_V3', v_sale_id,
          p_idempotency_key || ':stock:' || v_index::text, p_cashier_user_id,
          jsonb_build_object('sale_number', v_sale_number)
        );
      END IF;
    ELSIF v_line_type IN ('B2B_BACKORDER', 'LOCAL_STORE_BACKORDER') THEN
      v_source_id := (v_item->>'source_id')::uuid;
      SELECT o.id, o.external_sku, o.name, o.retail_price, s.name AS source_name,
             s.source_type, s.estimated_days
      INTO v_offer FROM public.external_catalog_offers_v2 o
      JOIN public.external_catalog_sources_v2 s ON s.tenant_id = o.tenant_id AND s.id = o.source_id
      WHERE o.tenant_id = p_tenant_id AND o.id = v_source_id AND o.active = true AND s.active = true;
      v_unit_price := v_offer.retail_price;
      v_tax_rate := 0;
      v_sku := v_offer.external_sku;
      v_name := v_offer.name;
      v_source_type := v_offer.source_type;
      v_source_name := v_offer.source_name;
      v_fulfillment_status := 'PENDING';
    ELSE
      v_unit_price := round((v_item->>'client_unit_price')::numeric, 2);
      v_tax_rate := 0;
      v_name := btrim(v_item->>'name');
      v_sku := left(COALESCE(NULLIF(btrim(v_item->>'sku'), ''), 'QUICK-' || v_sale_number::text || '-' || v_index::text), 120);
      v_fulfillment_status := 'DELIVERED';
    END IF;
    v_line_subtotal := round(v_qty * v_unit_price, 2);
    v_line_tax := round(v_line_subtotal * v_tax_rate / 100, 2);
    IF v_line_type IN ('B2B_BACKORDER', 'LOCAL_STORE_BACKORDER') THEN
      v_expected_delivery_date := current_date + COALESCE(v_offer.estimated_days, 2);
    ELSIF v_line_type = 'OWN_BACKORDER' THEN
      v_expected_delivery_date := NULLIF(v_item->>'expected_delivery_date', '')::date;
    ELSE
      v_expected_delivery_date := NULL;
    END IF;
    INSERT INTO public.sale_items_v2 (
      tenant_id, sale_id, product_id, product_sku_snapshot, product_name_snapshot,
      quantity, unit_price, tax_rate, tax_amount, line_subtotal, line_total,
      location_id, line_type, fulfillment_status, expected_delivery_date,
      source_type, source_id, source_name, metadata
    ) VALUES (
      p_tenant_id, v_sale_id, v_product.id, v_sku, v_name,
      v_qty, v_unit_price, v_tax_rate, v_line_tax, v_line_subtotal, v_line_subtotal + v_line_tax,
      v_location_id, v_line_type, v_fulfillment_status, v_expected_delivery_date,
      v_source_type, v_source_id::text, v_source_name,
      COALESCE(v_item->'metadata', '{}'::jsonb) - 'cost_price' - 'price' - 'unit_price'
    ) RETURNING id INTO v_sale_item_id;
    IF v_fulfillment_status = 'PENDING' THEN
      INSERT INTO public.sale_fulfillments_v2 (
        tenant_id, sale_id, sale_item_id, line_type, expected_delivery_date,
        source_name, notes, metadata
      ) VALUES (
        p_tenant_id, v_sale_id, v_sale_item_id, v_line_type, v_expected_delivery_date,
        v_source_name, NULLIF(btrim(v_item->>'fulfillment_notes'), ''),
        jsonb_build_object('source_id', v_source_id, 'sku', v_sku)
      );
    ELSIF v_line_type = 'QUICK_ENTRY' THEN
      INSERT INTO public.catalog_product_drafts_v2 (
        tenant_id, status, sku, name, cost_price, sale_price, currency,
        stock_quantity, location_data, metadata, submitted_by,
        idempotency_key, payload_hash
      ) VALUES (
        p_tenant_id, 'PENDING_REVIEW', v_sku, v_name, NULL, v_unit_price, v_currency,
        0, '{}'::jsonb, jsonb_build_object('origin', 'QUICK_ENTRY', 'sale_id', v_sale_id, 'sale_item_id', v_sale_item_id),
        p_cashier_user_id, p_idempotency_key || ':quick:' || v_index::text,
        encode(digest(convert_to(v_item::text || ':' || v_sale_id::text, 'UTF8'), 'sha256'), 'hex')
      );
    END IF;
  END LOOP;

  v_index := 0;
  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    v_index := v_index + 1;
    v_payment_method := CASE upper(COALESCE(v_payment->>'payment_method', v_payment->>'method', ''))
      WHEN 'EFECTIVO' THEN 'CASH' WHEN 'TRANSFERENCIA' THEN 'BANK_TRANSFER'
      WHEN 'TARJETA' THEN 'CARD' WHEN 'MERCADOPAGO' THEN 'MERCADO_PAGO'
      WHEN 'CUENTA_CORRIENTE' THEN 'ACCOUNT_CREDIT'
      ELSE upper(COALESCE(v_payment->>'payment_method', v_payment->>'method', '')) END;
    v_payment_amount := round((v_payment->>'amount')::numeric, 2);
    v_cash_tendered := NULLIF(v_payment #>> '{metadata,cash_tendered}', '')::numeric;
    v_cash_change := CASE WHEN v_payment_method = 'CASH' AND v_cash_tendered IS NOT NULL
      THEN round(v_cash_tendered - v_payment_amount, 2) ELSE NULL END;
    INSERT INTO public.sale_payments_v2 (
      tenant_id, sale_id, transaction_type, method, amount, currency,
      status, cash_session_id, customer_account_id, provider_reference, metadata
    ) VALUES (
      p_tenant_id, v_sale_id, 'PAYMENT', v_payment_method, v_payment_amount, v_currency,
      'CAPTURED', v_session_id,
      CASE WHEN v_payment_method = 'ACCOUNT_CREDIT' THEN v_account.id END,
      NULLIF(v_payment->>'provider_reference', ''),
      (COALESCE(v_payment->'metadata', '{}'::jsonb) - 'cash_change' - 'cost_price')
        || CASE WHEN v_cash_change IS NULL THEN '{}'::jsonb
          ELSE jsonb_build_object('cash_tendered', v_cash_tendered, 'cash_change', v_cash_change) END
    ) RETURNING id INTO v_payment_id;
    IF v_payment_method = 'CASH' THEN
      INSERT INTO public.cash_movements_v2 (
        tenant_id, session_id, movement_type, direction, sale_id, amount, currency,
        payment_method, category, description, reference_type, reference_id,
        actor_user_id, idempotency_key, metadata
      ) VALUES (
        p_tenant_id, v_session_id, 'SALE', 'IN', v_sale_id, v_payment_amount, v_currency,
        'CASH', 'SALE', 'Cobro de venta ' || v_sale_number, 'SALE_V3', v_sale_id,
        p_cashier_user_id, p_idempotency_key || ':payment:' || v_index::text,
        jsonb_build_object('sale_payment_id', v_payment_id)
      );
    END IF;
  END LOOP;
  IF v_cc_total > 0 THEN
    UPDATE public.customer_accounts
    SET balance = balance + v_cc_total, version = version + 1, updated_at = clock_timestamp()
    WHERE tenant_id = p_tenant_id AND id = v_account.id RETURNING * INTO v_account;
    INSERT INTO public.accounts_receivable_ledger (
      tenant_id, account_id, customer_id, entry_type, direction, amount,
      balance_after, currency, sale_id, due_date, idempotency_key,
      actor_user_id, description, metadata
    ) VALUES (
      p_tenant_id, v_account.id, p_customer_id, 'CHARGE', 'DEBIT', v_cc_total,
      v_account.balance, v_currency, v_sale_id,
      COALESCE(p_due_date, current_date + v_account.payment_terms_days),
      p_idempotency_key || ':ar', p_cashier_user_id,
      'Cargo por venta ' || v_sale_number, '{}'::jsonb
    );
  END IF;
  IF p_parked_ticket_id IS NOT NULL THEN
    UPDATE public.parked_pos_tickets_v2
    SET status = 'CONVERTED', converted_sale_id = v_sale_id, updated_at = clock_timestamp()
    WHERE tenant_id = p_tenant_id AND id = p_parked_ticket_id AND status = 'PARKED';
  END IF;
  INSERT INTO public.sale_events_v2 (
    tenant_id, sale_id, event_type, actor_user_id, idempotency_key, metadata
  ) VALUES (
    p_tenant_id, v_sale_id, 'CREATED', p_cashier_user_id,
    p_idempotency_key || ':event:created',
    jsonb_build_object('sale_number', v_sale_number, 'total', v_total, 'checkout_version', 3)
  );
  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data, metadata
  ) VALUES (
    p_tenant_id, p_cashier_user_id, 'SALE_CHECKOUT_CONFIRMED', 'SALE_V3', v_sale_id,
    jsonb_build_object('sale_number', v_sale_number, 'document_number', v_document_number, 'total', v_total, 'status', 'CONFIRMED'),
    jsonb_build_object('salesperson_user_id', p_salesperson_user_id, 'payment_count', jsonb_array_length(p_payments))
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'SALE_V3', v_sale_id, 'SALE_CONFIRMED',
    jsonb_build_object('sale_id', v_sale_id, 'sale_number', v_sale_number, 'document_number', v_document_number, 'total', v_total, 'currency', v_currency),
    p_idempotency_key || ':outbox'
  );
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', si.id, 'line_type', si.line_type, 'sku', si.product_sku_snapshot,
    'name', si.product_name_snapshot, 'quantity', si.quantity,
    'unit_price', si.unit_price, 'line_total', si.line_total,
    'fulfillment_status', si.fulfillment_status,
    'expected_delivery_date', si.expected_delivery_date, 'source_name', si.source_name
  ) ORDER BY si.created_at), '[]'::jsonb)
  INTO v_receipt_items FROM public.sale_items_v2 si
  WHERE si.tenant_id = p_tenant_id AND si.sale_id = v_sale_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'method', sp.method, 'amount', sp.amount, 'metadata', sp.metadata
  ) ORDER BY sp.created_at), '[]'::jsonb)
  INTO v_receipt_payments FROM public.sale_payments_v2 sp
  WHERE sp.tenant_id = p_tenant_id AND sp.sale_id = v_sale_id;
  RETURN jsonb_build_object(
    'sale_id', v_sale_id, 'sale_number', v_sale_number,
    'document_number', v_document_number, 'currency', v_currency,
    'subtotal', v_subtotal, 'tax_amount', v_tax_total,
    'adjustment_amount', v_adjustment_amount, 'total', v_total,
    'status', 'CONFIRMED', 'items', v_receipt_items,
    'payments', v_receipt_payments, 'idempotent', false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Tickets en espera centralizados.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.park_pos_ticket_v2(
  p_tenant_id UUID,
  p_cashier_user_id UUID,
  p_salesperson_user_id UUID,
  p_payload JSONB,
  p_idempotency_key TEXT,
  p_customer_id UUID DEFAULT NULL,
  p_customer_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_ticket public.parked_pos_tickets_v2%ROWTYPE;
  v_hash TEXT;
  v_document_number TEXT;
  v_parked_enabled BOOLEAN := true;
BEGIN
  IF v_actor IS NULL OR p_cashier_user_id IS DISTINCT FROM v_actor
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.status = 'ACTIVE')
     OR NOT public.operational_has_tenant_role(p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'VENDEDOR']::TEXT[]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Identidad operativa requerida para pausar tickets.';
  END IF;
  SELECT COALESCE(
    lower(tac.config_json #>> '{rules,pos,parkedTicketsEnabled}') = 'true',
    true
  ) INTO v_parked_enabled
  FROM public.tenant_app_config tac
  WHERE tac.tenant_id = p_tenant_id AND tac.stage = 'published';
  IF NOT COALESCE(v_parked_enabled, true) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Los tickets en espera estan deshabilitados para esta empresa.';
  END IF;
  IF jsonb_typeof(p_payload) <> 'object' OR jsonb_typeof(p_payload->'items') <> 'array'
     OR jsonb_array_length(p_payload->'items') = 0
     OR jsonb_array_length(p_payload->'items') > 200
     OR octet_length(p_payload::text) > 262144
     OR length(btrim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Ticket en espera invalido.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = p_tenant_id AND tu.user_id = p_salesperson_user_id
      AND tu.active = true AND upper(tu.role) IN ('ADMIN', 'SUPERVISOR', 'VENDEDOR')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Vendedor atribuido invalido.';
  END IF;
  v_hash := encode(digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':park:' || btrim(p_idempotency_key), 0));
  SELECT * INTO v_ticket FROM public.parked_pos_tickets_v2 pt
  WHERE pt.tenant_id = p_tenant_id AND pt.idempotency_key = btrim(p_idempotency_key) FOR UPDATE;
  IF v_ticket.id IS NOT NULL THEN
    IF v_ticket.payload_hash <> v_hash THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Colision de idempotencia en ticket.';
    END IF;
    RETURN jsonb_build_object(
      'ticket_id', v_ticket.id, 'ticket_number', v_ticket.ticket_number,
      'document_number', v_ticket.document_number,
      'status', v_ticket.status, 'idempotent', true
    );
  END IF;
  v_document_number := public.next_document_number_v2(p_tenant_id, 'PARKED_TICKET');
  INSERT INTO public.parked_pos_tickets_v2 (
    tenant_id, cashier_user_id, salesperson_user_id, customer_id,
    customer_name_snapshot, payload, idempotency_key, payload_hash, document_number
  ) VALUES (
    p_tenant_id, p_cashier_user_id, p_salesperson_user_id, p_customer_id,
    NULLIF(btrim(p_customer_name), ''), p_payload, btrim(p_idempotency_key), v_hash,
    v_document_number
  ) RETURNING * INTO v_ticket;
  RETURN jsonb_build_object(
    'ticket_id', v_ticket.id, 'ticket_number', v_ticket.ticket_number,
    'document_number', v_ticket.document_number, 'status', v_ticket.status,
    'created_at', v_ticket.created_at, 'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_parked_pos_tickets_v2(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role TEXT;
  v_items JSONB;
BEGIN
  SELECT upper(tu.role) INTO v_role FROM public.tenant_users tu
  JOIN public.tenants t ON t.id = tu.tenant_id AND t.status = 'ACTIVE'
  WHERE tu.tenant_id = p_tenant_id AND tu.user_id = v_actor AND tu.active = true;
  IF v_actor IS NULL OR v_role NOT IN ('ADMIN', 'SUPERVISOR', 'VENDEDOR') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Membresia operativa requerida.';
  END IF;
  UPDATE public.parked_pos_tickets_v2
  SET status = 'EXPIRED', updated_at = clock_timestamp()
  WHERE tenant_id = p_tenant_id AND status = 'PARKED' AND expires_at <= clock_timestamp();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', pt.id, 'ticket_number', pt.ticket_number, 'document_number', pt.document_number,
    'cashier_user_id', pt.cashier_user_id, 'salesperson_user_id', pt.salesperson_user_id,
    'customer_id', pt.customer_id, 'customer_name', pt.customer_name_snapshot,
    'payload', pt.payload, 'expires_at', pt.expires_at, 'created_at', pt.created_at
  ) ORDER BY pt.created_at DESC), '[]'::jsonb)
  INTO v_items FROM public.parked_pos_tickets_v2 pt
  WHERE pt.tenant_id = p_tenant_id AND pt.status = 'PARKED'
    AND (v_role IN ('ADMIN', 'SUPERVISOR') OR pt.cashier_user_id = v_actor);
  RETURN v_items;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_pos_ticket_v2(p_tenant_id UUID, p_ticket_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role TEXT;
  v_ticket public.parked_pos_tickets_v2%ROWTYPE;
BEGIN
  SELECT upper(tu.role) INTO v_role FROM public.tenant_users tu
  JOIN public.tenants t ON t.id = tu.tenant_id AND t.status = 'ACTIVE'
  WHERE tu.tenant_id = p_tenant_id AND tu.user_id = v_actor AND tu.active = true;
  IF v_actor IS NULL OR v_role NOT IN ('ADMIN', 'SUPERVISOR', 'VENDEDOR') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Membresia operativa requerida.';
  END IF;
  SELECT * INTO v_ticket FROM public.parked_pos_tickets_v2 pt
  WHERE pt.tenant_id = p_tenant_id AND pt.id = p_ticket_id FOR UPDATE;
  IF v_ticket.id IS NULL OR v_ticket.status <> 'PARKED' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Ticket en espera no encontrado.';
  END IF;
  IF v_role = 'VENDEDOR' AND v_ticket.cashier_user_id <> v_actor THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo podes cancelar tus propios tickets.';
  END IF;
  UPDATE public.parked_pos_tickets_v2 SET status = 'CANCELLED', updated_at = clock_timestamp()
  WHERE tenant_id = p_tenant_id AND id = p_ticket_id;
  RETURN jsonb_build_object('ticket_id', p_ticket_id, 'status', 'CANCELLED');
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Resumen server-side para planilla de caja.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cash_session_sheet_v2(p_tenant_id UUID, p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_session public.cash_sessions_v2%ROWTYPE;
  v_closure public.cash_closures%ROWTYPE;
  v_cash_sales NUMERIC(18,2) := 0;
  v_other_income NUMERIC(18,2) := 0;
  v_expenses NUMERIC(18,2) := 0;
  v_withdrawals NUMERIC(18,2) := 0;
  v_transfer NUMERIC(18,2) := 0;
  v_card NUMERIC(18,2) := 0;
  v_mp NUMERIC(18,2) := 0;
  v_account NUMERIC(18,2) := 0;
  v_expected NUMERIC(18,2);
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'VENDEDOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Membresia operativa requerida.';
  END IF;
  SELECT * INTO v_session FROM public.cash_sessions_v2 cs
  WHERE cs.tenant_id = p_tenant_id AND cs.id = p_session_id;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Sesion de caja no encontrada.';
  END IF;
  IF v_session.opened_by <> v_actor AND NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No podes consultar la caja de otro usuario.';
  END IF;
  SELECT
    COALESCE(sum(cm.amount) FILTER (WHERE cm.movement_type = 'SALE' AND cm.direction = 'IN'), 0),
    COALESCE(sum(cm.amount) FILTER (WHERE cm.movement_type = 'INCOME' AND cm.direction = 'IN'), 0),
    COALESCE(sum(cm.amount) FILTER (WHERE cm.movement_type IN ('EXPENSE', 'REFUND') AND cm.direction = 'OUT'), 0),
    COALESCE(sum(cm.amount) FILTER (WHERE cm.movement_type = 'WITHDRAWAL' AND cm.direction = 'OUT'), 0)
  INTO v_cash_sales, v_other_income, v_expenses, v_withdrawals
  FROM public.cash_movements_v2 cm
  WHERE cm.tenant_id = p_tenant_id AND cm.session_id = p_session_id;
  SELECT
    COALESCE(sum(sp.amount) FILTER (WHERE sp.method = 'BANK_TRANSFER'), 0),
    COALESCE(sum(sp.amount) FILTER (WHERE sp.method = 'CARD'), 0),
    COALESCE(sum(sp.amount) FILTER (WHERE sp.method IN ('MERCADO_PAGO', 'QR')), 0),
    COALESCE(sum(sp.amount) FILTER (WHERE sp.method = 'ACCOUNT_CREDIT'), 0)
  INTO v_transfer, v_card, v_mp, v_account
  FROM public.sale_payments_v2 sp
  WHERE sp.tenant_id = p_tenant_id AND sp.cash_session_id = p_session_id
    AND sp.status = 'CAPTURED';
  SELECT * INTO v_closure FROM public.cash_closures cc
  WHERE cc.tenant_id = p_tenant_id AND cc.session_id = p_session_id;
  v_expected := round(v_session.opening_amount + v_cash_sales + v_other_income - v_expenses - v_withdrawals, 2);
  RETURN jsonb_build_object(
    'session_id', v_session.id, 'register_id', v_session.register_id,
    'status', v_session.status, 'opened_by', v_session.opened_by,
    'opened_at', v_session.opened_at, 'closed_at', v_session.closed_at,
    'opening_cash', v_session.opening_amount, 'cash_sales', v_cash_sales,
    'other_cash_income', v_other_income, 'expenses', v_expenses,
    'withdrawals', v_withdrawals, 'expected_cash', v_expected,
    'transfer_income', v_transfer, 'card_income', v_card,
    'mp_income', v_mp, 'account_credit_income', v_account,
    'closure_id', v_closure.id, 'counted_cash', v_closure.counted_amount,
    'closure_document_number', v_closure.document_number,
    'cash_breakdown', COALESCE(v_closure.metadata->'cash_breakdown', '{}'::jsonb),
    'difference', v_closure.difference, 'closure_notes', v_closure.notes,
    'review_status', v_closure.review_status
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS y privilegios cerrados.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sale_fulfillments_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_catalog_sources_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_catalog_offers_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parked_pos_tickets_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_sequences_v2 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sale_fulfillments_member_read_v2 ON public.sale_fulfillments_v2;
CREATE POLICY sale_fulfillments_member_read_v2 ON public.sale_fulfillments_v2
  FOR SELECT TO authenticated
  USING (public.operational_has_tenant_role(tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'VENDEDOR']::TEXT[]));
DROP POLICY IF EXISTS external_sources_member_read_v2 ON public.external_catalog_sources_v2;
CREATE POLICY external_sources_member_read_v2 ON public.external_catalog_sources_v2
  FOR SELECT TO authenticated
  USING (public.operational_has_tenant_role(tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'VENDEDOR']::TEXT[]));
DROP POLICY IF EXISTS external_offers_member_read_v2 ON public.external_catalog_offers_v2;
CREATE POLICY external_offers_member_read_v2 ON public.external_catalog_offers_v2
  FOR SELECT TO authenticated
  USING (public.operational_has_tenant_role(tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'VENDEDOR']::TEXT[]));
DROP POLICY IF EXISTS parked_tickets_member_read_v2 ON public.parked_pos_tickets_v2;
CREATE POLICY parked_tickets_member_read_v2 ON public.parked_pos_tickets_v2
  FOR SELECT TO authenticated
  USING (public.operational_has_tenant_role(tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'VENDEDOR']::TEXT[]));

REVOKE ALL ON public.sale_fulfillments_v2, public.external_catalog_sources_v2,
  public.external_catalog_offers_v2, public.parked_pos_tickets_v2,
  public.document_sequences_v2 FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sale_fulfillments_v2, public.external_catalog_sources_v2,
  public.external_catalog_offers_v2, public.parked_pos_tickets_v2,
  public.document_sequences_v2 TO service_role;
REVOKE ALL ON FUNCTION public.checkout_sale_v3(UUID, TEXT, TEXT, JSONB, JSONB, UUID, UUID, UUID, UUID, TEXT, DATE, JSONB, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.park_pos_ticket_v2(UUID, UUID, UUID, JSONB, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_parked_pos_tickets_v2(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_pos_ticket_v2(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_document_number_v2(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_cash_session_sheet_v2(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.allocate_document_number_v2(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_cash_movement_document_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_cash_closure_document_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_ar_payment_document_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_cash_closure_v3(UUID, UUID, NUMERIC, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_sale_v3(UUID, TEXT, TEXT, JSONB, JSONB, UUID, UUID, UUID, UUID, TEXT, DATE, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.park_pos_ticket_v2(UUID, UUID, UUID, JSONB, TEXT, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_parked_pos_tickets_v2(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_pos_ticket_v2(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_document_number_v2(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_cash_session_sheet_v2(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_cash_closure_v3(UUID, UUID, NUMERIC, JSONB, TEXT) TO authenticated, service_role;

INSERT INTO public.schema_migrations (version, name, checksum, backward_compatible, applied_by)
VALUES ('012', 'pos_flexible_sales', 'sha256-pos-flexible-sales-012-v2', true, 'migration-engine')
ON CONFLICT (version) DO NOTHING;

COMMIT;
