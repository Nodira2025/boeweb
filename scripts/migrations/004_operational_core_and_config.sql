-- MIGRACION 004: NUCLEO OPERACIONAL V2, CONFIGURACION VERSIONADA Y CHECKOUT ATOMICO
-- Backward Compatible: YES. Las tablas legacy permanecen intactas.
-- Dependencias deliberadas: public.tenants, public.tenant_users y auth.users.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- La FK compuesta contra tenant_users es la frontera de identidad del nuevo nucleo.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_users_tenant_user_v2_uidx
  ON public.tenant_users (tenant_id, user_id);

CREATE OR REPLACE FUNCTION public.operational_is_tenant_member(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      WHERE tu.tenant_id = p_tenant_id
        AND tu.user_id = auth.uid()
        AND tu.active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.operational_has_tenant_role(
  p_tenant_id UUID,
  p_roles TEXT[]
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      WHERE tu.tenant_id = p_tenant_id
        AND tu.user_id = auth.uid()
        AND tu.active = true
        AND upper(tu.role) = ANY (
          SELECT upper(role_name) FROM unnest(p_roles) AS role_name
        )
    );
$$;

REVOKE ALL ON FUNCTION public.operational_is_tenant_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operational_has_tenant_role(UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operational_is_tenant_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operational_has_tenant_role(UUID, TEXT[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- Configuracion actual compatible con app-config.js + historial inmutable.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_app_config (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('draft', 'published')),
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config_json) = 'object'),
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  published_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, stage),
  CONSTRAINT tenant_app_config_updater_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES public.tenant_users(tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.tenant_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('draft', 'published')),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  revision BIGINT NOT NULL CHECK (revision > 0),
  brand_config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(brand_config) = 'object'),
  catalog_config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(catalog_config) = 'object'),
  business_rules JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(business_rules) = 'object'),
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config_json) = 'object'),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  published_at TIMESTAMPTZ,
  UNIQUE (tenant_id, stage, revision),
  UNIQUE (tenant_id, id),
  CONSTRAINT tenant_configurations_creator_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES public.tenant_users(tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION public.version_tenant_app_config_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.revision <= OLD.revision THEN
    NEW.revision := OLD.revision + 1;
  END IF;
  NEW.updated_at := clock_timestamp();
  IF NEW.stage = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

/* BLOQUE DIFERIDO: las RPC publicas se declaran nuevamente luego del DDL.
-- ---------------------------------------------------------------------------
-- Pedidos publicos: precios server-side, reserva atomica e idempotencia.
-- Estas RPC se conceden exclusivamente a service_role (Netlify/backend).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_public_order_v2(
  p_tenant_id UUID,
  p_idempotency_key TEXT,
  p_items JSONB,
  p_customer JSONB,
  p_delivery JSONB,
  p_notes TEXT DEFAULT NULL,
  p_coupon_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_role TEXT := COALESCE(auth.role(), current_setting('request.jwt.claim.role', true));
  v_existing public.public_orders_v2%ROWTYPE;
  v_product public.catalog_products%ROWTYPE;
  v_balance public.inventory_balances_v2%ROWTYPE;
  v_item JSONB;
  v_normalized_items JSONB := '[]'::jsonb;
  v_seen UUID[] := ARRAY[]::UUID[];
  v_quantity NUMERIC(18,3);
  v_subtotal NUMERIC(18,2) := 0;
  v_discount NUMERIC(18,2) := 0;
  v_total NUMERIC(18,2);
  v_currency CHAR(3);
  v_location_id UUID;
  v_order_id UUID := gen_random_uuid();
  v_order_number TEXT;
  v_fingerprint TEXT;
  v_coupon JSONB;
  v_coupon_type TEXT;
  v_coupon_value NUMERIC;
  v_delivery_type TEXT := upper(COALESCE(NULLIF(btrim(p_delivery->>'type'), ''), 'PICKUP'));
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'create_public_order_v2 es exclusiva del backend service_role.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Tenant inexistente.';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Idempotency key invalida.';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La orden requiere items.';
  END IF;
  IF jsonb_typeof(p_customer) <> 'object' OR length(btrim(COALESCE(p_customer->>'name', ''))) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Datos de cliente invalidos.';
  END IF;
  IF jsonb_typeof(p_delivery) <> 'object' OR length(v_delivery_type) > 30 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Datos de entrega invalidos.';
  END IF;
  IF v_delivery_type <> 'PICKUP' AND NULLIF(btrim(p_delivery->>'address'), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La entrega requiere direccion.';
  END IF;

  v_fingerprint := encode(digest(convert_to(concat_ws('|',
    p_items::text, p_customer::text, p_delivery::text,
    COALESCE(p_notes, ''), COALESCE(upper(btrim(p_coupon_code)), '')
  ), 'UTF8'), 'sha256'), 'hex');

  SELECT po.* INTO v_existing
  FROM public.public_orders_v2 po
  WHERE po.tenant_id = p_tenant_id AND po.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.request_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Colision de idempotencia en la orden publica.';
    END IF;
    RETURN jsonb_build_object(
      'order_id', v_existing.id, 'order_number', v_existing.order_number,
      'subtotal', v_existing.subtotal, 'discount', v_existing.discount,
      'total', v_existing.total, 'currency', v_existing.currency,
      'items', v_existing.items, 'status', v_existing.status, 'idempotent', true
    );
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Cada item debe ser un objeto JSON.';
    END IF;
    v_quantity := NULLIF(v_item->>'quantity', '')::NUMERIC;
    IF v_quantity IS NULL OR v_quantity <= 0 OR scale(v_quantity) > 3 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Cantidad de item invalida.';
    END IF;

    SELECT cp.* INTO v_product
    FROM public.catalog_products cp
    WHERE cp.tenant_id = p_tenant_id AND cp.active = true
      AND (
        cp.id::text = COALESCE(v_item->>'product_id', '')
        OR cp.sku = COALESCE(NULLIF(v_item->>'sku', ''), NULLIF(v_item->>'product_id', ''))
      )
    ORDER BY CASE WHEN cp.id::text = COALESCE(v_item->>'product_id', '') THEN 0 ELSE 1 END
    LIMIT 1
    FOR UPDATE;
    IF v_product.id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Producto inexistente o inactivo.';
    END IF;
    IF v_product.id = ANY(v_seen) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'No repita el mismo producto; acumule su cantidad.';
    END IF;
    v_seen := array_append(v_seen, v_product.id);
    IF v_currency IS NULL THEN v_currency := v_product.currency; END IF;
    IF v_currency <> v_product.currency THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La orden no puede mezclar monedas.';
    END IF;
    v_subtotal := v_subtotal + round(v_product.price * v_quantity, 2);
    v_normalized_items := v_normalized_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id, 'sku', v_product.sku, 'name', v_product.name,
      'quantity', v_quantity, 'unit_price', v_product.price,
      'line_total', round(v_product.price * v_quantity, 2)
    ));
  END LOOP;

  IF NULLIF(btrim(p_coupon_code), '') IS NOT NULL THEN
    SELECT tac.config_json #> ARRAY['rules', 'ecommerce', 'coupons', upper(btrim(p_coupon_code))]
    INTO v_coupon
    FROM public.tenant_app_config tac
    WHERE tac.tenant_id = p_tenant_id AND tac.stage = 'published';
    IF v_coupon IS NULL OR jsonb_typeof(v_coupon) <> 'object'
       OR lower(COALESCE(v_coupon->>'active', 'false')) <> 'true' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Cupon inexistente o inactivo.';
    END IF;
    v_coupon_type := upper(COALESCE(v_coupon->>'type', ''));
    v_coupon_value := NULLIF(v_coupon->>'value', '')::NUMERIC;
    IF v_coupon_value IS NULL OR v_coupon_value < 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Regla de cupon invalida.';
    END IF;
    IF v_coupon_type = 'PERCENT' THEN
      IF v_coupon_value > 100 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Porcentaje de cupon invalido.';
      END IF;
      v_discount := round(v_subtotal * v_coupon_value / 100, 2);
    ELSIF v_coupon_type = 'FIXED' THEN
      v_discount := least(v_subtotal, round(v_coupon_value, 2));
    ELSE
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Tipo de cupon no admitido.';
    END IF;
  END IF;
  v_total := round(v_subtotal - v_discount, 2);
  IF v_total <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'La orden debe tener total positivo.';
  END IF;

  v_order_number := 'WEB-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || upper(substr(replace(v_order_id::text, '-', ''), 1, 8));
  INSERT INTO public.public_orders_v2 (
    tenant_id, id, order_number, customer_name, customer_email, customer_phone,
    delivery_type, delivery_address, notes, items, subtotal, discount, total,
    currency, status, payment_status, idempotency_key, request_fingerprint
  ) VALUES (
    p_tenant_id, v_order_id, v_order_number, btrim(p_customer->>'name'),
    NULLIF(btrim(p_customer->>'email'), ''), NULLIF(btrim(p_customer->>'phone'), ''),
    v_delivery_type, NULLIF(btrim(p_delivery->>'address'), ''), NULLIF(btrim(p_notes), ''),
    v_normalized_items, v_subtotal, v_discount, v_total, v_currency,
    'PENDING_PAYMENT', 'PENDING', p_idempotency_key, v_fingerprint
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_normalized_items)
  LOOP
    SELECT cp.* INTO v_product
    FROM public.catalog_products cp
    WHERE cp.tenant_id = p_tenant_id AND cp.id = (v_item->>'product_id')::UUID;
    IF v_product.track_stock THEN
      SELECT il.id INTO v_location_id
      FROM public.inventory_locations_v2 il
      WHERE il.tenant_id = p_tenant_id AND il.active = true
        AND il.is_sellable = true AND il.is_default = true;
      IF v_location_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'No hay ubicacion default vendible para reservar stock.';
      END IF;
      v_quantity := (v_item->>'quantity')::NUMERIC;
      SELECT ib.* INTO v_balance
      FROM public.inventory_balances_v2 ib
      WHERE ib.tenant_id = p_tenant_id AND ib.product_id = v_product.id AND ib.location_id = v_location_id
      FOR UPDATE;
      IF v_balance.product_id IS NULL OR v_balance.available < v_quantity THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = format('Stock insuficiente para SKU %s.', v_product.sku);
      END IF;
      UPDATE public.inventory_balances_v2
      SET reserved = reserved + v_quantity, version = version + 1, updated_at = clock_timestamp()
      WHERE tenant_id = p_tenant_id AND product_id = v_product.id AND location_id = v_location_id
      RETURNING * INTO v_balance;
      INSERT INTO public.inventory_reservations_v2 (
        tenant_id, order_id, product_id, location_id, quantity, status,
        expires_at, idempotency_key
      ) VALUES (
        p_tenant_id, v_order_id, v_product.id, v_location_id, v_quantity, 'ACTIVE',
        clock_timestamp() + interval '20 minutes',
        p_idempotency_key || ':reserve:' || v_product.id::text
      );
      INSERT INTO public.inventory_ledger_v2 (
        tenant_id, product_id, location_id, event_type, quantity_delta, reserved_delta,
        on_hand_after, reserved_after, reference_type, reference_id, idempotency_key, metadata
      ) VALUES (
        p_tenant_id, v_product.id, v_location_id, 'RESERVE', 0, v_quantity,
        v_balance.on_hand, v_balance.reserved, 'PUBLIC_ORDER_V2', v_order_id,
        p_idempotency_key || ':reserve-ledger:' || v_product.id::text,
        jsonb_build_object('order_number', v_order_number)
      );
    END IF;
  END LOOP;

  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'PUBLIC_ORDER_V2', v_order_id, 'PUBLIC_ORDER_CREATED',
    jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'total', v_total, 'currency', v_currency),
    p_idempotency_key || ':outbox'
  );

  RETURN jsonb_build_object(
    'order_id', v_order_id, 'order_number', v_order_number, 'subtotal', v_subtotal,
    'discount', v_discount, 'total', v_total, 'currency', v_currency,
    'items', v_normalized_items, 'status', 'PENDING_PAYMENT', 'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_public_order_payment_v2(
  p_order_id UUID,
  p_provider_payment_id TEXT,
  p_status TEXT,
  p_amount NUMERIC,
  p_raw JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_role TEXT := COALESCE(auth.role(), current_setting('request.jwt.claim.role', true));
  v_status TEXT := upper(COALESCE(btrim(p_status), ''));
  v_order public.public_orders_v2%ROWTYPE;
  v_event public.public_order_payment_events_v2%ROWTYPE;
  v_reservation public.inventory_reservations_v2%ROWTYPE;
  v_balance public.inventory_balances_v2%ROWTYPE;
  v_target_reservation_status TEXT;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'confirm_public_order_payment_v2 es exclusiva del backend service_role.';
  END IF;
  IF p_provider_payment_id IS NULL OR length(btrim(p_provider_payment_id)) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Provider payment id invalido.';
  END IF;
  IF v_status NOT IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Estado de pago invalido.';
  END IF;
  IF p_raw IS NULL OR jsonb_typeof(p_raw) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Payload de proveedor invalido.';
  END IF;

  SELECT po.* INTO v_order
  FROM public.public_orders_v2 po
  WHERE po.id = p_order_id
  FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Orden publica inexistente.';
  END IF;

  SELECT pe.* INTO v_event
  FROM public.public_order_payment_events_v2 pe
  WHERE pe.tenant_id = v_order.tenant_id
    AND pe.payment_provider = COALESCE(v_order.payment_provider, 'MERCADO_PAGO')
    AND pe.provider_payment_id = p_provider_payment_id
    AND pe.status = v_status;
  IF v_event.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'order_id', v_order.id, 'order_number', v_order.order_number,
      'status', v_order.status, 'payment_status', v_order.payment_status,
      'idempotent', true
    );
  END IF;

  IF v_status = 'APPROVED' THEN
    IF p_amount IS NULL OR round(p_amount, 2) <> v_order.total THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'El importe aprobado no coincide con el total autoritativo.';
    END IF;
    IF v_order.payment_status = 'APPROVED' THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'La orden ya fue aprobada por otro evento de pago.';
    END IF;
    IF v_order.status <> 'PENDING_PAYMENT' OR v_order.reservation_expires_at <= clock_timestamp() THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'La orden no posee una reserva vigente aprobable.';
    END IF;
    FOR v_reservation IN
      SELECT ir.* FROM public.inventory_reservations_v2 ir
      WHERE ir.tenant_id = v_order.tenant_id AND ir.order_id = v_order.id AND ir.status = 'ACTIVE'
      FOR UPDATE
    LOOP
      SELECT ib.* INTO v_balance
      FROM public.inventory_balances_v2 ib
      WHERE ib.tenant_id = v_reservation.tenant_id
        AND ib.product_id = v_reservation.product_id AND ib.location_id = v_reservation.location_id
      FOR UPDATE;
      IF v_balance.product_id IS NULL OR v_balance.reserved < v_reservation.quantity
         OR v_balance.on_hand < v_reservation.quantity THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Reserva de inventario inconsistente.';
      END IF;
      UPDATE public.inventory_balances_v2
      SET on_hand = on_hand - v_reservation.quantity,
          reserved = reserved - v_reservation.quantity,
          version = version + 1, updated_at = clock_timestamp()
      WHERE tenant_id = v_reservation.tenant_id
        AND product_id = v_reservation.product_id AND location_id = v_reservation.location_id
      RETURNING * INTO v_balance;
      UPDATE public.inventory_reservations_v2
      SET status = 'FULFILLED', fulfilled_at = clock_timestamp()
      WHERE tenant_id = v_reservation.tenant_id AND id = v_reservation.id;
      INSERT INTO public.inventory_ledger_v2 (
        tenant_id, product_id, location_id, event_type, quantity_delta, reserved_delta,
        on_hand_after, reserved_after, reference_type, reference_id, idempotency_key, metadata
      ) VALUES (
        v_reservation.tenant_id, v_reservation.product_id, v_reservation.location_id,
        'PUBLIC_ORDER_FULFILL', -v_reservation.quantity, -v_reservation.quantity,
        v_balance.on_hand, v_balance.reserved, 'PUBLIC_ORDER_V2', v_order.id,
        'public-payment:' || p_provider_payment_id || ':fulfill:' || v_reservation.id::text,
        jsonb_build_object('order_number', v_order.order_number)
      );
    END LOOP;
    UPDATE public.public_orders_v2
    SET status = 'CONFIRMED', payment_status = 'APPROVED',
        payment_provider = COALESCE(payment_provider, 'MERCADO_PAGO'), updated_at = clock_timestamp()
    WHERE tenant_id = v_order.tenant_id AND id = v_order.id
    RETURNING * INTO v_order;
  ELSIF v_status IN ('REJECTED', 'CANCELLED') THEN
    v_target_reservation_status := CASE WHEN v_status = 'CANCELLED' THEN 'CANCELLED' ELSE 'RELEASED' END;
    FOR v_reservation IN
      SELECT ir.* FROM public.inventory_reservations_v2 ir
      WHERE ir.tenant_id = v_order.tenant_id AND ir.order_id = v_order.id AND ir.status = 'ACTIVE'
      FOR UPDATE
    LOOP
      SELECT ib.* INTO v_balance
      FROM public.inventory_balances_v2 ib
      WHERE ib.tenant_id = v_reservation.tenant_id
        AND ib.product_id = v_reservation.product_id AND ib.location_id = v_reservation.location_id
      FOR UPDATE;
      IF v_balance.product_id IS NULL OR v_balance.reserved < v_reservation.quantity THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Reserva de inventario inconsistente al liberar.';
      END IF;
      UPDATE public.inventory_balances_v2
      SET reserved = reserved - v_reservation.quantity,
          version = version + 1, updated_at = clock_timestamp()
      WHERE tenant_id = v_reservation.tenant_id
        AND product_id = v_reservation.product_id AND location_id = v_reservation.location_id
      RETURNING * INTO v_balance;
      UPDATE public.inventory_reservations_v2
      SET status = v_target_reservation_status, released_at = clock_timestamp()
      WHERE tenant_id = v_reservation.tenant_id AND id = v_reservation.id;
      INSERT INTO public.inventory_ledger_v2 (
        tenant_id, product_id, location_id, event_type, quantity_delta, reserved_delta,
        on_hand_after, reserved_after, reference_type, reference_id, idempotency_key, metadata
      ) VALUES (
        v_reservation.tenant_id, v_reservation.product_id, v_reservation.location_id,
        'RELEASE', 0, -v_reservation.quantity, v_balance.on_hand, v_balance.reserved,
        'PUBLIC_ORDER_V2', v_order.id,
        'public-payment:' || p_provider_payment_id || ':release:' || v_reservation.id::text,
        jsonb_build_object('payment_status', v_status)
      );
    END LOOP;
    UPDATE public.public_orders_v2
    SET status = 'CANCELLED', payment_status = v_status,
        payment_provider = COALESCE(payment_provider, 'MERCADO_PAGO'), updated_at = clock_timestamp()
    WHERE tenant_id = v_order.tenant_id AND id = v_order.id
    RETURNING * INTO v_order;
  ELSIF v_status = 'REFUNDED' THEN
    UPDATE public.public_orders_v2
    SET status = 'CANCELLED', payment_status = 'REFUNDED', updated_at = clock_timestamp()
    WHERE tenant_id = v_order.tenant_id AND id = v_order.id
    RETURNING * INTO v_order;
  ELSE
    UPDATE public.public_orders_v2
    SET payment_status = 'PENDING', updated_at = clock_timestamp()
    WHERE tenant_id = v_order.tenant_id AND id = v_order.id
    RETURNING * INTO v_order;
  END IF;

  INSERT INTO public.public_order_payment_events_v2 (
    tenant_id, order_id, payment_provider, provider_payment_id, status, amount, raw_payload
  ) VALUES (
    v_order.tenant_id, v_order.id, COALESCE(v_order.payment_provider, 'MERCADO_PAGO'),
    p_provider_payment_id, v_status, p_amount, p_raw
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    v_order.tenant_id, 'PUBLIC_ORDER_V2', v_order.id, 'PUBLIC_ORDER_PAYMENT_' || v_status,
    jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'payment_status', v_status),
    'public-payment:' || p_provider_payment_id || ':' || v_status || ':outbox'
  );

  RETURN jsonb_build_object(
    'order_id', v_order.id, 'order_number', v_order.order_number,
    'status', v_order.status, 'payment_status', v_order.payment_status,
    'idempotent', false
  );
END;
$$;
*/

/* BLOQUE DIFERIDO: las RPC de caja se declaran nuevamente luego de todo el DDL.
-- ---------------------------------------------------------------------------
-- Operaciones de caja: apertura, movimientos manuales, cierre y supervision.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_cash_session_v2(
  p_tenant_id UUID,
  p_register_id UUID,
  p_opening_amount NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role TEXT;
  v_register public.cash_registers%ROWTYPE;
  v_session public.cash_sessions_v2%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'VENDEDOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Rol operativo activo requerido para abrir caja.';
  END IF;
  IF p_opening_amount IS NULL OR round(p_opening_amount, 2) <> p_opening_amount OR p_opening_amount < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Importe de apertura invalido.';
  END IF;

  SELECT cr.* INTO v_register
  FROM public.cash_registers cr
  WHERE cr.tenant_id = p_tenant_id AND cr.id = p_register_id AND cr.active = true
  FOR UPDATE;
  IF v_register.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Caja inexistente, inactiva o ajena al tenant.';
  END IF;

  SELECT cs.* INTO v_session
  FROM public.cash_sessions_v2 cs
  WHERE cs.tenant_id = p_tenant_id AND cs.register_id = p_register_id AND cs.status = 'OPEN'
  FOR UPDATE;
  IF v_session.id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'La caja ya posee una sesion OPEN.';
  END IF;

  INSERT INTO public.cash_sessions_v2 (
    tenant_id, register_id, status, opened_by, opening_amount
  ) VALUES (
    p_tenant_id, p_register_id, 'OPEN', v_actor, p_opening_amount
  ) RETURNING * INTO v_session;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'CASH_SESSION_OPENED', 'CASH_SESSION_V2', v_session.id,
    jsonb_build_object('register_id', p_register_id, 'opening_amount', p_opening_amount, 'status', 'OPEN')
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'CASH_SESSION_V2', v_session.id, 'CASH_SESSION_OPENED',
    jsonb_build_object('session_id', v_session.id, 'register_id', p_register_id),
    'cash-open:' || v_session.id::text
  );

  RETURN jsonb_build_object(
    'session_id', v_session.id, 'register_id', v_session.register_id,
    'status', v_session.status, 'opening_amount', v_session.opening_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_cash_movement_v2(
  p_tenant_id UUID,
  p_session_id UUID,
  p_type TEXT,
  p_amount NUMERIC,
  p_category TEXT,
  p_description TEXT,
  p_reference JSONB DEFAULT '{}'::jsonb
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
  v_type TEXT := upper(COALESCE(btrim(p_type), ''));
  v_direction TEXT;
  v_reference_id UUID;
  v_idempotency_key TEXT;
  v_movement_id UUID;
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'VENDEDOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Rol operativo activo requerido para registrar movimientos.';
  END IF;
  IF v_type NOT IN ('INCOME', 'EXPENSE', 'WITHDRAWAL', 'ADJUSTMENT') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Tipo de movimiento manual invalido.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR round(p_amount, 2) <> p_amount THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Importe de movimiento invalido.';
  END IF;
  IF p_description IS NULL OR length(btrim(p_description)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Descripcion de movimiento requerida.';
  END IF;
  IF p_reference IS NULL OR jsonb_typeof(p_reference) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La referencia debe ser un objeto JSON.';
  END IF;

  SELECT cs.* INTO v_session
  FROM public.cash_sessions_v2 cs
  WHERE cs.tenant_id = p_tenant_id AND cs.id = p_session_id AND cs.status = 'OPEN'
  FOR UPDATE;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'La sesion de caja no existe o no esta OPEN.';
  END IF;
  IF v_session.opened_by <> v_actor AND NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo el cajero titular o un supervisor puede operar esta sesion.';
  END IF;

  v_direction := CASE
    WHEN v_type = 'INCOME' THEN 'IN'
    WHEN v_type IN ('EXPENSE', 'WITHDRAWAL') THEN 'OUT'
    ELSE upper(COALESCE(p_reference->>'direction', ''))
  END;
  IF v_direction NOT IN ('IN', 'OUT') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ADJUSTMENT requiere direction IN u OUT.';
  END IF;
  BEGIN
    v_reference_id := NULLIF(p_reference->>'id', '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reference.id debe ser UUID.';
  END;
  v_idempotency_key := COALESCE(
    NULLIF(btrim(p_reference->>'idempotency_key'), ''),
    'cash-manual:' || gen_random_uuid()::text
  );

  INSERT INTO public.cash_movements_v2 (
    tenant_id, session_id, movement_type, direction, amount, currency,
    payment_method, category, description, reference_type, reference_id,
    actor_user_id, idempotency_key, metadata
  ) VALUES (
    p_tenant_id, p_session_id, v_type, v_direction, p_amount,
    (SELECT cr.currency FROM public.cash_registers cr
     WHERE cr.tenant_id = p_tenant_id AND cr.id = v_session.register_id),
    'CASH', NULLIF(btrim(p_category), ''), btrim(p_description),
    NULLIF(btrim(p_reference->>'type'), ''), v_reference_id,
    v_actor, v_idempotency_key, p_reference - 'idempotency_key'
  ) RETURNING id INTO v_movement_id;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'CASH_MOVEMENT_RECORDED', 'CASH_MOVEMENT_V2', v_movement_id,
    jsonb_build_object('session_id', p_session_id, 'type', v_type, 'direction', v_direction, 'amount', p_amount)
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'CASH_SESSION_V2', p_session_id, 'CASH_MOVEMENT_RECORDED',
    jsonb_build_object('movement_id', v_movement_id, 'type', v_type, 'direction', v_direction, 'amount', p_amount),
    v_idempotency_key || ':outbox'
  );

  RETURN jsonb_build_object(
    'movement_id', v_movement_id, 'session_id', p_session_id,
    'type', v_type, 'direction', v_direction, 'amount', p_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_cash_closure_v2(
  p_tenant_id UUID,
  p_session_id UUID,
  p_counted NUMERIC,
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
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'VENDEDOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Rol operativo activo requerido para cerrar caja.';
  END IF;
  IF p_counted IS NULL OR p_counted < 0 OR round(p_counted, 2) <> p_counted THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Efectivo contado invalido.';
  END IF;

  SELECT cc.* INTO v_existing
  FROM public.cash_closures cc
  WHERE cc.tenant_id = p_tenant_id AND cc.session_id = p_session_id
  FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.counted_amount <> p_counted THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'La sesion ya fue cerrada con otro conteo.';
    END IF;
    RETURN jsonb_build_object(
      'closure_id', v_existing.id, 'session_id', p_session_id,
      'expected_amount', v_existing.expected_amount, 'counted_amount', v_existing.counted_amount,
      'difference', v_existing.difference, 'review_status', v_existing.review_status,
      'idempotent', true
    );
  END IF;

  SELECT cs.* INTO v_session
  FROM public.cash_sessions_v2 cs
  WHERE cs.tenant_id = p_tenant_id AND cs.id = p_session_id AND cs.status = 'OPEN'
  FOR UPDATE;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'La sesion no existe o no esta OPEN.';
  END IF;
  IF v_session.opened_by <> v_actor AND NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo el cajero titular o un supervisor puede cerrar esta sesion.';
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
    review_status, closed_by, notes
  ) VALUES (
    p_tenant_id, p_session_id, v_expected, p_counted, round(p_counted - v_expected, 2),
    'PENDING_REVIEW', v_actor, NULLIF(btrim(p_notes), '')
  ) RETURNING * INTO v_closure;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'CASH_CLOSURE_SUBMITTED', 'CASH_CLOSURE', v_closure.id,
    jsonb_build_object(
      'session_id', p_session_id, 'expected_amount', v_expected,
      'counted_amount', p_counted, 'difference', v_closure.difference,
      'review_status', 'PENDING_REVIEW'
    )
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'CASH_CLOSURE', v_closure.id, 'CASH_CLOSURE_REVIEW_REQUIRED',
    jsonb_build_object('closure_id', v_closure.id, 'session_id', p_session_id, 'difference', v_closure.difference),
    'cash-closure:' || v_closure.id::text
  );

  RETURN jsonb_build_object(
    'closure_id', v_closure.id, 'session_id', p_session_id,
    'expected_amount', v_expected, 'counted_amount', p_counted,
    'difference', v_closure.difference, 'review_status', v_closure.review_status,
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.review_cash_closure_v2(
  p_tenant_id UUID,
  p_closure_id UUID,
  p_decision TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_decision TEXT := CASE upper(COALESCE(btrim(p_decision), ''))
    WHEN 'APPROVE' THEN 'APPROVED'
    WHEN 'APPROVED' THEN 'APPROVED'
    WHEN 'REJECT' THEN 'REJECTED'
    WHEN 'REJECTED' THEN 'REJECTED'
    ELSE NULL
  END;
  v_closure public.cash_closures%ROWTYPE;
  v_before JSONB;
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo ADMIN o SUPERVISOR puede revisar cierres.';
  END IF;
  IF v_decision IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Decision de revision invalida.';
  END IF;
  IF v_decision = 'REJECTED' AND NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El rechazo requiere motivo.';
  END IF;

  SELECT cc.* INTO v_closure
  FROM public.cash_closures cc
  WHERE cc.tenant_id = p_tenant_id AND cc.id = p_closure_id
  FOR UPDATE;
  IF v_closure.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Cierre inexistente o ajeno al tenant.';
  END IF;
  IF v_closure.closed_by = v_actor THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Quien cerro la caja no puede revisar su propio cierre.';
  END IF;
  IF v_closure.review_status <> 'PENDING_REVIEW' THEN
    IF v_closure.review_status = v_decision THEN
      RETURN jsonb_build_object(
        'closure_id', v_closure.id, 'review_status', v_closure.review_status,
        'reviewed_by', v_closure.reviewed_by, 'idempotent', true
      );
    END IF;
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'El cierre ya posee una revision diferente.';
  END IF;

  v_before := to_jsonb(v_closure);
  UPDATE public.cash_closures
  SET review_status = v_decision, reviewed_by = v_actor,
      reviewed_at = clock_timestamp(), review_reason = NULLIF(btrim(p_reason), '')
  WHERE tenant_id = p_tenant_id AND id = p_closure_id
  RETURNING * INTO v_closure;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'CASH_CLOSURE_' || v_decision, 'CASH_CLOSURE', p_closure_id,
    v_before, to_jsonb(v_closure)
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'CASH_CLOSURE', p_closure_id, 'CASH_CLOSURE_' || v_decision,
    jsonb_build_object('closure_id', p_closure_id, 'decision', v_decision, 'reviewed_by', v_actor),
    'cash-review:' || p_closure_id::text || ':' || v_decision
  );

  RETURN jsonb_build_object(
    'closure_id', v_closure.id, 'review_status', v_closure.review_status,
    'reviewed_by', v_closure.reviewed_by, 'idempotent', false
  );
END;
$$;
*/

CREATE OR REPLACE FUNCTION public.archive_tenant_app_config_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.tenant_configurations (
    tenant_id, stage, schema_version, revision,
    brand_config, catalog_config, business_rules, config_json,
    created_by, published_at
  ) VALUES (
    NEW.tenant_id, NEW.stage, NEW.schema_version, NEW.revision,
    COALESCE(NEW.config_json->'brand', '{}'::jsonb),
    COALESCE(NEW.config_json->'catalog', '{}'::jsonb),
    COALESCE(NEW.config_json->'rules', '{}'::jsonb),
    NEW.config_json, NEW.updated_by, NEW.published_at
  )
  ON CONFLICT (tenant_id, stage, revision) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_app_config_bump_revision_v2 ON public.tenant_app_config;
CREATE TRIGGER tenant_app_config_bump_revision_v2
BEFORE INSERT OR UPDATE ON public.tenant_app_config
FOR EACH ROW EXECUTE FUNCTION public.version_tenant_app_config_v2();

DROP TRIGGER IF EXISTS tenant_app_config_archive_v2 ON public.tenant_app_config;
CREATE TRIGGER tenant_app_config_archive_v2
AFTER INSERT OR UPDATE ON public.tenant_app_config
FOR EACH ROW EXECUTE FUNCTION public.archive_tenant_app_config_v2();

-- ---------------------------------------------------------------------------
-- Catalogo y clientes canonicos.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_products (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL CHECK (length(btrim(sku)) BETWEEN 1 AND 120),
  barcode TEXT,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 255),
  description TEXT,
  category TEXT,
  price NUMERIC(18,2) NOT NULL CHECK (price >= 0),
  cost_price NUMERIC(18,2) CHECK (cost_price IS NULL OR cost_price >= 0),
  tax_rate NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
  currency CHAR(3) NOT NULL DEFAULT 'ARS' CHECK (currency ~ '^[A-Z]{3}$'),
  active BOOLEAN NOT NULL DEFAULT true,
  track_stock BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, sku),
  CONSTRAINT catalog_products_creator_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES public.tenant_users(tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT catalog_products_updater_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES public.tenant_users(tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_products_tenant_barcode_uidx
  ON public.catalog_products (tenant_id, barcode)
  WHERE barcode IS NOT NULL AND btrim(barcode) <> '';

CREATE TABLE IF NOT EXISTS public.customers (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 255),
  legal_name TEXT,
  tax_id TEXT,
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  CONSTRAINT customers_creator_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES public.tenant_users(tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_tax_id_uidx
  ON public.customers (tenant_id, tax_id)
  WHERE tax_id IS NOT NULL AND btrim(tax_id) <> '';

CREATE TABLE IF NOT EXISTS public.customer_accounts (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'ARS' CHECK (currency ~ '^[A-Z]{3}$'),
  credit_limit NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  -- Un saldo negativo representa credito a favor del cliente (por ejemplo,
  -- una nota de credito posterior a un pago). El limite solo restringe deuda.
  balance NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (balance <= credit_limit),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  payment_terms_days INTEGER NOT NULL DEFAULT 30 CHECK (payment_terms_days BETWEEN 0 AND 3650),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, customer_id),
  UNIQUE (tenant_id, customer_id, currency),
  CONSTRAINT customer_accounts_customer_fk
    FOREIGN KEY (tenant_id, customer_id)
    REFERENCES public.customers(tenant_id, id)
    ON DELETE RESTRICT
);

-- ---------------------------------------------------------------------------
-- Ubicaciones, balances, reservas y ledger de inventario.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_locations_v2 (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  code TEXT NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 120),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 255),
  location_type TEXT NOT NULL DEFAULT 'STORE'
    CHECK (location_type IN ('WAREHOUSE', 'STORE', 'SHELF', 'BIN', 'QUARANTINE', 'DAMAGED')),
  parent_location_id UUID,
  is_sellable BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code),
  CONSTRAINT inventory_locations_v2_parent_fk
    FOREIGN KEY (tenant_id, parent_location_id)
    REFERENCES public.inventory_locations_v2(tenant_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_locations_v2_one_default_uidx
  ON public.inventory_locations_v2 (tenant_id)
  WHERE is_default = true AND active = true;

CREATE TABLE IF NOT EXISTS public.inventory_balances_v2 (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  location_id UUID NOT NULL,
  on_hand NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  reserved NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= on_hand),
  available NUMERIC(18,3) GENERATED ALWAYS AS (on_hand - reserved) STORED,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, product_id, location_id),
  UNIQUE (tenant_id, product_id, location_id),
  CONSTRAINT inventory_balances_v2_product_fk
    FOREIGN KEY (tenant_id, product_id)
    REFERENCES public.catalog_products(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_balances_v2_location_fk
    FOREIGN KEY (tenant_id, location_id)
    REFERENCES public.inventory_locations_v2(tenant_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.inventory_ledger_v2 (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  location_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'OPENING', 'RECEIPT', 'RESERVE', 'RELEASE', 'SALE', 'PUBLIC_ORDER_FULFILL',
    'RETURN_SELLABLE', 'RETURN_DAMAGED', 'TRANSFER_IN', 'TRANSFER_OUT',
    'ADJUSTMENT_POSITIVE', 'ADJUSTMENT_NEGATIVE', 'VOID', 'REFUND'
  )),
  quantity_delta NUMERIC(18,3) NOT NULL DEFAULT 0,
  reserved_delta NUMERIC(18,3) NOT NULL DEFAULT 0,
  on_hand_after NUMERIC(18,3) NOT NULL CHECK (on_hand_after >= 0),
  reserved_after NUMERIC(18,3) NOT NULL CHECK (reserved_after >= 0 AND reserved_after <= on_hand_after),
  reference_type TEXT NOT NULL,
  reference_id UUID,
  idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 255),
  actor_user_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  CHECK (quantity_delta <> 0 OR reserved_delta <> 0),
  CONSTRAINT inventory_ledger_v2_product_fk
    FOREIGN KEY (tenant_id, product_id)
    REFERENCES public.catalog_products(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_ledger_v2_location_fk
    FOREIGN KEY (tenant_id, location_id)
    REFERENCES public.inventory_locations_v2(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_ledger_v2_actor_fk
    FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.tenant_users(tenant_id, user_id)
    ON DELETE RESTRICT
);

-- ---------------------------------------------------------------------------
-- Cajas y sesiones. Se crean antes de pagos para sostener FKs compuestas.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cash_registers (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  code TEXT NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 100),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 255),
  location_id UUID,
  currency CHAR(3) NOT NULL DEFAULT 'ARS' CHECK (currency ~ '^[A-Z]{3}$'),
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code),
  CONSTRAINT cash_registers_location_fk
    FOREIGN KEY (tenant_id, location_id)
    REFERENCES public.inventory_locations_v2(tenant_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.cash_sessions_v2 (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  register_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  opened_by UUID NOT NULL,
  opening_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (opening_amount >= 0),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  closed_by UUID,
  closed_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  CONSTRAINT cash_sessions_v2_register_fk
    FOREIGN KEY (tenant_id, register_id)
    REFERENCES public.cash_registers(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT cash_sessions_v2_opened_by_fk
    FOREIGN KEY (tenant_id, opened_by)
    REFERENCES public.tenant_users(tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT cash_sessions_v2_closed_by_fk
    FOREIGN KEY (tenant_id, closed_by)
    REFERENCES public.tenant_users(tenant_id, user_id)
    ON DELETE RESTRICT,
  CHECK (
    (status = 'OPEN' AND closed_by IS NULL AND closed_at IS NULL)
    OR (status = 'CLOSED' AND closed_by IS NOT NULL AND closed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS cash_sessions_v2_one_open_register_uidx
  ON public.cash_sessions_v2 (tenant_id, register_id)
  WHERE status = 'OPEN';

-- ---------------------------------------------------------------------------
-- Ventas, items y pagos canonicos.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_v2 (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  sale_number BIGINT GENERATED BY DEFAULT AS IDENTITY,
  status TEXT NOT NULL DEFAULT 'CONFIRMED'
    CHECK (status IN ('CONFIRMED', 'VOID_REQUESTED', 'VOIDED', 'PARTIALLY_REFUNDED', 'REFUNDED')),
  cashier_user_id UUID NOT NULL,
  salesperson_user_id UUID NOT NULL,
  customer_id UUID,
  currency CHAR(3) NOT NULL DEFAULT 'ARS' CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal NUMERIC(18,2) NOT NULL CHECK (subtotal >= 0),
  tax_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  adjustment_type TEXT NOT NULL DEFAULT 'NONE' CHECK (adjustment_type IN (
    'NONE', 'DISCOUNT_PERCENT', 'DISCOUNT_FIXED', 'INCREASE_PERCENT', 'INCREASE_FIXED'
  )),
  adjustment_value NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (adjustment_value >= 0),
  adjustment_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  total NUMERIC(18,2) NOT NULL CHECK (total >= 0),
  idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 255),
  payload_hash TEXT NOT NULL CHECK (length(btrim(payload_hash)) BETWEEN 8 AND 255),
  request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint) = 64),
  notes TEXT,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, sale_number),
  UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT sales_v2_cashier_fk
    FOREIGN KEY (tenant_id, cashier_user_id)
    REFERENCES public.tenant_users(tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT sales_v2_salesperson_fk
    FOREIGN KEY (tenant_id, salesperson_user_id)
    REFERENCES public.tenant_users(tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT sales_v2_customer_fk
    FOREIGN KEY (tenant_id, customer_id)
    REFERENCES public.customers(tenant_id, id)
    ON DELETE RESTRICT,
  CHECK (total = round(subtotal + tax_amount + adjustment_amount, 2))
);

CREATE TABLE IF NOT EXISTS public.sale_items_v2 (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL,
  product_id UUID NOT NULL,
  product_sku_snapshot TEXT NOT NULL,
  product_name_snapshot TEXT NOT NULL,
  quantity NUMERIC(18,3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(18,2) NOT NULL CHECK (unit_price >= 0),
  tax_rate NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
  tax_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  line_subtotal NUMERIC(18,2) NOT NULL CHECK (line_subtotal >= 0),
  line_total NUMERIC(18,2) NOT NULL CHECK (line_total >= 0),
  location_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  CONSTRAINT sale_items_v2_sale_fk
    FOREIGN KEY (tenant_id, sale_id)
    REFERENCES public.sales_v2(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT sale_items_v2_product_fk
    FOREIGN KEY (tenant_id, product_id)
    REFERENCES public.catalog_products(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT sale_items_v2_location_fk
    FOREIGN KEY (tenant_id, location_id)
    REFERENCES public.inventory_locations_v2(tenant_id, id)
    ON DELETE RESTRICT,
  CHECK (line_subtotal = round(quantity * unit_price, 2)),
  CHECK (line_total = round(line_subtotal + tax_amount, 2))
);

CREATE TABLE IF NOT EXISTS public.sale_payments_v2 (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL,
  transaction_type TEXT NOT NULL DEFAULT 'PAYMENT' CHECK (transaction_type IN ('PAYMENT', 'REFUND', 'VOID')),
  method TEXT NOT NULL CHECK (method IN (
    'CASH', 'BANK_TRANSFER', 'CARD', 'MERCADO_PAGO', 'QR', 'ACCOUNT_CREDIT', 'OTHER'
  )),
  payment_method TEXT GENERATED ALWAYS AS (method) STORED,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'ARS' CHECK (currency ~ '^[A-Z]{3}$'),
  status TEXT NOT NULL DEFAULT 'CAPTURED'
    CHECK (status IN ('PENDING', 'CAPTURED', 'FAILED', 'REFUNDED', 'VOIDED', 'REVERSED')),
  cash_session_id UUID,
  customer_account_id UUID,
  provider_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  CONSTRAINT sale_payments_v2_sale_fk
    FOREIGN KEY (tenant_id, sale_id)
    REFERENCES public.sales_v2(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT sale_payments_v2_session_fk
    FOREIGN KEY (tenant_id, cash_session_id)
    REFERENCES public.cash_sessions_v2(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT sale_payments_v2_account_fk
    FOREIGN KEY (tenant_id, customer_account_id)
    REFERENCES public.customer_accounts(tenant_id, id)
    ON DELETE RESTRICT,
  CHECK (
    (method = 'ACCOUNT_CREDIT' AND customer_account_id IS NOT NULL)
    OR (method <> 'ACCOUNT_CREDIT' AND customer_account_id IS NULL)
  ),
  CHECK (
    (method = 'CASH' AND cash_session_id IS NOT NULL)
    OR (method <> 'CASH' AND cash_session_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS sale_payments_v2_provider_reference_uidx
  ON public.sale_payments_v2 (tenant_id, method, provider_reference)
  WHERE provider_reference IS NOT NULL AND btrim(provider_reference) <> '';

CREATE TABLE IF NOT EXISTS public.sale_events_v2 (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'CREATED', 'VOID_REQUESTED', 'VOIDED', 'REFUND_REQUESTED', 'PARTIALLY_REFUNDED', 'REFUNDED'
  )),
  actor_user_id UUID,
  reason TEXT,
  idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 255),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT sale_events_v2_sale_fk
    FOREIGN KEY (tenant_id, sale_id)
    REFERENCES public.sales_v2(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT sale_events_v2_actor_fk
    FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.tenant_users(tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.cash_movements_v2 (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'SALE', 'INCOME', 'EXPENSE', 'WITHDRAWAL', 'REFUND', 'ADJUSTMENT', 'REVERSAL'
  )),
  direction TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'ARS' CHECK (currency ~ '^[A-Z]{3}$'),
  payment_method TEXT NOT NULL DEFAULT 'CASH' CHECK (payment_method IN (
    'CASH', 'BANK_TRANSFER', 'CARD', 'MERCADO_PAGO', 'QR', 'OTHER'
  )),
  category TEXT,
  description TEXT NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 1000),
  sale_id UUID,
  reference_type TEXT,
  reference_id UUID,
  actor_user_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 255),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT cash_movements_v2_session_fk
    FOREIGN KEY (tenant_id, session_id)
    REFERENCES public.cash_sessions_v2(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT cash_movements_v2_actor_fk
    FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.tenant_users(tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT cash_movements_v2_sale_fk
    FOREIGN KEY (tenant_id, sale_id)
    REFERENCES public.sales_v2(tenant_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.cash_closures (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  expected_amount NUMERIC(18,2) NOT NULL CHECK (expected_amount >= 0),
  counted_amount NUMERIC(18,2) NOT NULL CHECK (counted_amount >= 0),
  difference NUMERIC(18,2) NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
    CHECK (review_status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED')),
  closed_by UUID NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_reason TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, session_id),
  CONSTRAINT cash_closures_session_fk
    FOREIGN KEY (tenant_id, session_id)
    REFERENCES public.cash_sessions_v2(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT cash_closures_closed_by_fk
    FOREIGN KEY (tenant_id, closed_by)
    REFERENCES public.tenant_users(tenant_id, user_id)
    ON DELETE RESTRICT,
  CONSTRAINT cash_closures_reviewed_by_fk
    FOREIGN KEY (tenant_id, reviewed_by)
    REFERENCES public.tenant_users(tenant_id, user_id)
    ON DELETE RESTRICT,
  CHECK (difference = round(counted_amount - expected_amount, 2)),
  CHECK (
    (review_status = 'PENDING_REVIEW' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (review_status IN ('APPROVED', 'REJECTED') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

-- ---------------------------------------------------------------------------
-- Cuentas por cobrar, auditoria y outbox.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounts_receivable_ledger (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'CHARGE', 'PAYMENT', 'CREDIT_NOTE', 'DEBIT_NOTE', 'VOID', 'REFUND', 'ADJUSTMENT'
  )),
  direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  balance_after NUMERIC(18,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'ARS' CHECK (currency ~ '^[A-Z]{3}$'),
  sale_id UUID,
  payment_id UUID,
  due_date DATE,
  idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 255),
  actor_user_id UUID,
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT ar_ledger_account_fk
    FOREIGN KEY (tenant_id, account_id)
    REFERENCES public.customer_accounts(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT ar_ledger_customer_fk
    FOREIGN KEY (tenant_id, customer_id)
    REFERENCES public.customers(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT ar_ledger_sale_fk
    FOREIGN KEY (tenant_id, sale_id)
    REFERENCES public.sales_v2(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT ar_ledger_payment_fk
    FOREIGN KEY (tenant_id, payment_id)
    REFERENCES public.sale_payments_v2(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT ar_ledger_actor_fk
    FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.tenant_users(tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.operational_audit_log (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  action TEXT NOT NULL CHECK (length(btrim(action)) BETWEEN 1 AND 120),
  entity_type TEXT NOT NULL CHECK (length(btrim(entity_type)) BETWEEN 1 AND 120),
  entity_id UUID,
  before_data JSONB,
  after_data JSONB,
  correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  CONSTRAINT operational_audit_actor_fk
    FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.tenant_users(tenant_id, user_id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.outbox_events (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  aggregate_type TEXT NOT NULL CHECK (length(btrim(aggregate_type)) BETWEEN 1 AND 120),
  aggregate_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (length(btrim(event_type)) BETWEEN 1 AND 160),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'DEAD_LETTER')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  published_at TIMESTAMPTZ,
  last_error TEXT,
  idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS outbox_events_pending_idx
  ON public.outbox_events (status, available_at, created_at)
  WHERE status IN ('PENDING', 'FAILED');

-- ---------------------------------------------------------------------------
-- Pedidos publicos y reservas de inventario para e-commerce / Mercado Pago.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.public_orders_v2 (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL,
  customer_name TEXT NOT NULL CHECK (length(btrim(customer_name)) BETWEEN 1 AND 255),
  customer_email TEXT,
  customer_phone TEXT,
  delivery_type TEXT NOT NULL,
  delivery_address TEXT,
  notes TEXT,
  items JSONB NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) > 0),
  subtotal NUMERIC(18,2) NOT NULL CHECK (subtotal >= 0),
  discount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (discount >= 0 AND discount <= subtotal),
  total NUMERIC(18,2) NOT NULL CHECK (total >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'ARS' CHECK (currency ~ '^[A-Z]{3}$'),
  status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT' CHECK (status IN (
    'PENDING_PAYMENT', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED', 'EXPIRED'
  )),
  payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN (
    'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED'
  )),
  payment_provider TEXT,
  provider_reference TEXT,
  provider_checkout_url TEXT,
  idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 255),
  request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint) = 64),
  reservation_expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp() + interval '20 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, order_number),
  UNIQUE (tenant_id, idempotency_key),
  CHECK (total = round(subtotal - discount, 2))
);

CREATE UNIQUE INDEX IF NOT EXISTS public_orders_v2_provider_reference_uidx
  ON public.public_orders_v2 (tenant_id, payment_provider, provider_reference)
  WHERE provider_reference IS NOT NULL AND btrim(provider_reference) <> '';

CREATE TABLE IF NOT EXISTS public.inventory_reservations_v2 (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  product_id UUID NOT NULL,
  location_id UUID NOT NULL,
  quantity NUMERIC(18,3) NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FULFILLED', 'RELEASED', 'EXPIRED', 'CANCELLED')),
  expires_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  released_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT inventory_reservations_v2_order_fk
    FOREIGN KEY (tenant_id, order_id)
    REFERENCES public.public_orders_v2(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_reservations_v2_product_fk
    FOREIGN KEY (tenant_id, product_id)
    REFERENCES public.catalog_products(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_reservations_v2_location_fk
    FOREIGN KEY (tenant_id, location_id)
    REFERENCES public.inventory_locations_v2(tenant_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.public_order_payment_events_v2 (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  payment_provider TEXT NOT NULL,
  provider_payment_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED')),
  amount NUMERIC(18,2) CHECK (amount IS NULL OR amount >= 0),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, payment_provider, provider_payment_id, status),
  CONSTRAINT public_order_payment_events_order_fk
    FOREIGN KEY (tenant_id, order_id)
    REFERENCES public.public_orders_v2(tenant_id, id)
    ON DELETE RESTRICT
);

-- Los ledgers y eventos financieros se corrigen mediante asientos compensatorios,
-- nunca reescribiendo o borrando historia.
CREATE OR REPLACE FUNCTION public.reject_operational_history_mutation_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = format('%I es append-only; registre un evento compensatorio.', TG_TABLE_NAME);
END;
$$;

DO $$
DECLARE
  table_name TEXT;
  trigger_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenant_configurations',
    'inventory_ledger_v2',
    'sale_items_v2',
    'sale_payments_v2',
    'sale_events_v2',
    'cash_movements_v2',
    'accounts_receivable_ledger',
    'operational_audit_log',
    'public_order_payment_events_v2'
  ] LOOP
    trigger_name := table_name || '_append_only_v2';
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.reject_operational_history_mutation_v2()',
      trigger_name,
      table_name
    );
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Checkout POS: una sola transaccion para venta, stock, pagos, CC, caja y audit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.checkout_sale_v2(
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
  p_adjustment JSONB DEFAULT '{}'::jsonb
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
  v_balance public.inventory_balances_v2%ROWTYPE;
  v_account public.customer_accounts%ROWTYPE;
  v_sale_id UUID := gen_random_uuid();
  v_sale_number BIGINT;
  v_location_id UUID;
  v_session_id UUID;
  v_payment_id UUID;
  v_qty NUMERIC(18,3);
  v_line_subtotal NUMERIC(18,2);
  v_line_tax NUMERIC(18,2);
  v_subtotal NUMERIC(18,2) := 0;
  v_tax_total NUMERIC(18,2) := 0;
  v_total NUMERIC(18,2);
  v_payment_total NUMERIC(18,2) := 0;
  v_cc_total NUMERIC(18,2) := 0;
  v_cash_payment_count INTEGER := 0;
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
  v_allow_vendor_adjustments BOOLEAN := false;
  v_vendor_max_discount_percent NUMERIC := 0;
  v_vendor_max_discount_fixed NUMERIC := 0;
  v_index INTEGER := 0;
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
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Tenant inexistente.';
  END IF;

  SELECT upper(tu.role)
  INTO v_cashier_role
  FROM public.tenant_users tu
  WHERE tu.tenant_id = p_tenant_id
    AND tu.user_id = p_cashier_user_id
    AND tu.active = true
    AND upper(tu.role) IN ('ADMIN', 'SUPERVISOR', 'VENDEDOR');
  IF v_cashier_role IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'El cajero no posee un rol operativo activo en el tenant.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = p_tenant_id
      AND tu.user_id = p_salesperson_user_id
      AND tu.active = true
      AND upper(tu.role) IN ('ADMIN', 'SUPERVISOR', 'VENDEDOR')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'El vendedor atribuido no es un miembro operativo activo del tenant.';
  END IF;

  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Idempotency key invalida.';
  END IF;
  IF p_payload_hash IS NULL OR length(btrim(p_payload_hash)) NOT BETWEEN 8 AND 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Payload hash invalido.';
  END IF;

  v_request_fingerprint := encode(digest(convert_to(
    concat_ws('|', p_items::text, p_payments::text, p_customer_id::text,
      p_register_id::text, p_due_date::text, COALESCE(p_notes, ''), COALESCE(p_adjustment, '{}'::jsonb)::text),
    'UTF8'), 'sha256'), 'hex');

  -- La deteccion de retry/colision ocurre antes de todo INSERT o UPDATE.
  SELECT * INTO v_existing
  FROM public.sales_v2 s
  WHERE s.tenant_id = p_tenant_id
    AND s.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.payload_hash <> p_payload_hash
       OR v_existing.request_fingerprint <> v_request_fingerprint THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'Colision de idempotencia: la clave ya fue usada con otro payload.';
    END IF;
    RETURN jsonb_build_object(
      'sale_id', v_existing.id,
      'sale_number', v_existing.sale_number,
      'total', v_existing.total,
      'status', v_existing.status,
      'idempotent', true
    );
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La venta requiere al menos un item.';
  END IF;
  IF jsonb_typeof(p_payments) <> 'array' OR jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La venta requiere al menos un pago.';
  END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.tenant_id = p_tenant_id AND c.id = p_customer_id AND c.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Cliente inexistente o inactivo para el tenant.';
  END IF;

  -- Precios autoritativos y reglas fiscales se leen del catalogo y quedan
  -- bloqueados en modo compartido hasta completar el checkout.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Cada item debe ser un objeto JSON.';
    END IF;
    v_qty := NULLIF(v_item->>'quantity', '')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 OR scale(v_qty) > 3 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Cantidad de item invalida.';
    END IF;

    SELECT cp.* INTO v_product
    FROM public.catalog_products cp
    WHERE cp.tenant_id = p_tenant_id
      AND cp.active = true
      AND (
        (v_item ? 'product_id' AND cp.id::text = v_item->>'product_id')
        OR cp.sku = COALESCE(NULLIF(v_item->>'sku', ''), NULLIF(v_item->>'product_id', ''))
      )
    ORDER BY CASE WHEN cp.id::text = COALESCE(v_item->>'product_id', '') THEN 0 ELSE 1 END
    LIMIT 1
    FOR UPDATE;
    IF v_product.id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Producto inexistente, inactivo o ajeno al tenant.';
    END IF;

    v_item_currency := v_product.currency;
    IF v_currency IS NULL THEN v_currency := v_item_currency; END IF;
    IF v_item_currency <> v_currency THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'No se pueden mezclar monedas en una venta.';
    END IF;
    v_line_subtotal := round(v_product.price * (v_item->>'quantity')::numeric, 2);
    v_line_tax := round(v_line_subtotal * v_product.tax_rate / 100, 2);
    v_subtotal := v_subtotal + v_line_subtotal;
    v_tax_total := v_tax_total + v_line_tax;
  END LOOP;

  SELECT COALESCE(tac.config_json->'rules', '{}'::jsonb)
  INTO v_rules
  FROM public.tenant_app_config tac
  WHERE tac.tenant_id = p_tenant_id AND tac.stage = 'published';
  v_rules := COALESCE(v_rules, '{}'::jsonb);
  v_allow_vendor_adjustments := lower(COALESCE(
    v_rules #>> '{sales,allowVendorAdjustments}',
    v_rules #>> '{pos,allow_vendor_adjustments}',
    'false'
  )) = 'true';
  v_vendor_max_discount_percent := COALESCE(
    NULLIF(v_rules #>> '{sales,maxDiscountPercent}', '')::numeric,
    NULLIF(v_rules #>> '{pos,max_discount_percent}', '')::numeric,
    0
  );
  v_vendor_max_discount_fixed := COALESCE(
    NULLIF(v_rules #>> '{sales,maxDiscountFixed}', '')::numeric,
    NULLIF(v_rules #>> '{pos,max_discount_fixed}', '')::numeric,
    0
  );

  IF v_adjustment_type NOT IN ('NONE', 'DISCOUNT_PERCENT', 'DISCOUNT_FIXED', 'INCREASE_PERCENT', 'INCREASE_FIXED')
     OR v_adjustment_value < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Ajuste comercial invalido.';
  END IF;
  IF v_cashier_role = 'VENDEDOR' AND v_adjustment_type <> 'NONE' AND NOT v_allow_vendor_adjustments THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'El vendedor no tiene permiso para aplicar ajustes.';
  END IF;

  CASE v_adjustment_type
    WHEN 'NONE' THEN
      v_adjustment_value := 0;
      v_adjustment_amount := 0;
    WHEN 'DISCOUNT_PERCENT' THEN
      IF v_adjustment_value > 100 OR
         (v_cashier_role = 'VENDEDOR' AND v_adjustment_value > v_vendor_max_discount_percent) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Porcentaje de descuento fuera de regla.';
      END IF;
      v_adjustment_amount := -round(v_subtotal * v_adjustment_value / 100, 2);
    WHEN 'DISCOUNT_FIXED' THEN
      IF v_adjustment_value > v_subtotal OR
         (v_cashier_role = 'VENDEDOR' AND v_adjustment_value > v_vendor_max_discount_fixed) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Descuento fijo fuera de regla.';
      END IF;
      v_adjustment_amount := -round(v_adjustment_value, 2);
    WHEN 'INCREASE_PERCENT' THEN
      IF v_adjustment_value > 1000 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Recargo porcentual fuera de rango.';
      END IF;
      v_adjustment_amount := round(v_subtotal * v_adjustment_value / 100, 2);
    WHEN 'INCREASE_FIXED' THEN
      v_adjustment_amount := round(v_adjustment_value, 2);
  END CASE;
  v_total := round(v_subtotal + v_tax_total + v_adjustment_amount, 2);
  IF v_total < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El total derivado no puede ser negativo.';
  END IF;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    IF jsonb_typeof(v_payment) <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Cada pago debe ser un objeto JSON.';
    END IF;
    v_payment_method := CASE upper(COALESCE(v_payment->>'payment_method', v_payment->>'method', ''))
      WHEN 'EFECTIVO' THEN 'CASH'
      WHEN 'TRANSFERENCIA' THEN 'BANK_TRANSFER'
      WHEN 'TARJETA' THEN 'CARD'
      WHEN 'MERCADOPAGO' THEN 'MERCADO_PAGO'
      WHEN 'CUENTA_CORRIENTE' THEN 'ACCOUNT_CREDIT'
      ELSE upper(COALESCE(v_payment->>'payment_method', v_payment->>'method', ''))
    END;
    v_payment_amount := round(NULLIF(v_payment->>'amount', '')::numeric, 2);
    IF v_payment_method NOT IN ('CASH', 'BANK_TRANSFER', 'CARD', 'MERCADO_PAGO', 'QR', 'ACCOUNT_CREDIT', 'OTHER')
       OR v_payment_amount IS NULL OR v_payment_amount <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Medio o importe de pago invalido.';
    END IF;
    v_payment_total := v_payment_total + v_payment_amount;
    IF v_payment_method = 'ACCOUNT_CREDIT' THEN
      v_cc_total := v_cc_total + v_payment_amount;
    ELSIF v_payment_method = 'CASH' THEN
      v_cash_payment_count := v_cash_payment_count + 1;
    END IF;
  END LOOP;
  IF v_payment_total <> v_total THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = format(
      'La suma de pagos (%s) debe coincidir con el total autoritativo (%s).', v_payment_total, v_total
    );
  END IF;

  IF v_cash_payment_count > 0 THEN
    IF p_register_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El pago CASH/EFECTIVO requiere una caja abierta.';
    END IF;
    SELECT cs.id INTO v_session_id
    FROM public.cash_sessions_v2 cs
    WHERE cs.tenant_id = p_tenant_id
      AND cs.register_id = p_register_id
      AND cs.status = 'OPEN'AND cs.opened_by = p_cashier_user_id
    FOR UPDATE;
    IF v_session_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'No existe una sesion de caja OPEN para el registro indicado.';
    END IF;
  END IF;

  IF v_cc_total > 0 THEN
    IF p_customer_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Cuenta corriente requiere un cliente identificado.';
    END IF;
    SELECT ca.* INTO v_account
    FROM public.customer_accounts ca
    WHERE ca.tenant_id = p_tenant_id
      AND ca.customer_id = p_customer_id
      AND ca.currency = v_currency
      AND ca.status = 'ACTIVE'
    FOR UPDATE;
    IF v_account.id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'El cliente no posee una cuenta corriente activa en esta moneda.';
    END IF;
    IF v_account.balance + v_cc_total > v_account.credit_limit THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'La venta supera el limite de credito disponible.';
    END IF;
  END IF;

  INSERT INTO public.sales_v2 (
    tenant_id, id, status, cashier_user_id, salesperson_user_id, customer_id,
    currency, subtotal, tax_amount, adjustment_type, adjustment_value,
    adjustment_amount, total, idempotency_key, payload_hash,
    request_fingerprint, notes, due_date
  ) VALUES (
    p_tenant_id, v_sale_id, 'CONFIRMED', p_cashier_user_id, p_salesperson_user_id, p_customer_id,
    v_currency, v_subtotal, v_tax_total, v_adjustment_type, v_adjustment_value,
    v_adjustment_amount, v_total, p_idempotency_key, p_payload_hash,
    v_request_fingerprint, NULLIF(btrim(p_notes), ''), p_due_date
  )
  RETURNING id, sale_number INTO v_sale_id, v_sale_number;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::numeric;
    SELECT cp.* INTO v_product
    FROM public.catalog_products cp
    WHERE cp.tenant_id = p_tenant_id
      AND cp.active = true
      AND (
        (v_item ? 'product_id' AND cp.id::text = v_item->>'product_id')
        OR cp.sku = COALESCE(NULLIF(v_item->>'sku', ''), NULLIF(v_item->>'product_id', ''))
      )
    ORDER BY CASE WHEN cp.id::text = COALESCE(v_item->>'product_id', '') THEN 0 ELSE 1 END
    LIMIT 1
    FOR UPDATE;
    v_line_subtotal := round(v_product.price * (v_item->>'quantity')::numeric, 2);
    v_line_tax := round(v_line_subtotal * v_product.tax_rate / 100, 2);
    v_location_id := NULL;

    IF v_product.track_stock THEN
      IF NULLIF(v_item->>'location_id', '') IS NOT NULL THEN
        BEGIN
          v_location_id := (v_item->>'location_id')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'location_id invalido.';
        END;
      ELSE
        SELECT il.id INTO v_location_id
        FROM public.inventory_locations_v2 il
        WHERE il.tenant_id = p_tenant_id
          AND il.is_default = true
          AND il.active = true
          AND il.is_sellable = true;
      END IF;
      IF v_location_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Producto con stock sin ubicacion vendible/default.';
      END IF;

      SELECT ib.* INTO v_balance
      FROM public.inventory_balances_v2 ib
      WHERE ib.tenant_id = p_tenant_id
        AND ib.product_id = v_product.id
        AND ib.location_id = v_location_id
      FOR UPDATE;
      IF v_balance.product_id IS NULL OR (v_balance.on_hand - v_balance.reserved) < v_qty THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = format(
          'Stock insuficiente para SKU %s.', v_product.sku
        );
      END IF;

      UPDATE public.inventory_balances_v2
      SET on_hand = on_hand - (v_item->>'quantity')::numeric,
          version = version + 1,
          updated_at = clock_timestamp()
      WHERE tenant_id = p_tenant_id
        AND product_id = v_product.id
        AND location_id = v_location_id
      RETURNING * INTO v_balance;

      INSERT INTO public.inventory_ledger_v2 (
        tenant_id, product_id, location_id, event_type,
        quantity_delta, reserved_delta, on_hand_after, reserved_after,
        reference_type, reference_id, idempotency_key, actor_user_id, metadata
      ) VALUES (
        p_tenant_id, v_product.id, v_location_id, 'SALE',
        -v_qty, 0, v_balance.on_hand, v_balance.reserved,
        'SALE_V2', v_sale_id, p_idempotency_key || ':stock:' || v_product.id::text || ':' || v_location_id::text,
        p_cashier_user_id, jsonb_build_object('sale_number', v_sale_number)
      );
    END IF;

    INSERT INTO public.sale_items_v2 (
      tenant_id, sale_id, product_id, product_sku_snapshot, product_name_snapshot,
      quantity, unit_price, tax_rate, tax_amount, line_subtotal, line_total,
      location_id, metadata
    ) VALUES (
      p_tenant_id, v_sale_id, v_product.id, v_product.sku, v_product.name,
      v_qty, v_product.price, v_product.tax_rate, v_line_tax,
      v_line_subtotal, v_line_subtotal + v_line_tax,
      v_location_id, (v_item - 'price' - 'unit_price')
    );
  END LOOP;

  v_index := 0;
  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    v_index := v_index + 1;
    v_payment_method := CASE upper(COALESCE(v_payment->>'payment_method', v_payment->>'method', ''))
      WHEN 'EFECTIVO' THEN 'CASH'
      WHEN 'TRANSFERENCIA' THEN 'BANK_TRANSFER'
      WHEN 'TARJETA' THEN 'CARD'
      WHEN 'MERCADOPAGO' THEN 'MERCADO_PAGO'
      WHEN 'CUENTA_CORRIENTE' THEN 'ACCOUNT_CREDIT'
      ELSE upper(COALESCE(v_payment->>'payment_method', v_payment->>'method', ''))
    END;
    v_payment_amount := round((v_payment->>'amount')::numeric, 2);

    INSERT INTO public.sale_payments_v2 (
      tenant_id, sale_id, transaction_type, method, amount, currency,
      status, cash_session_id, customer_account_id, provider_reference, metadata
    ) VALUES (
      p_tenant_id, v_sale_id, 'PAYMENT', v_payment_method, v_payment_amount, v_currency,
      'CAPTURED', CASE WHEN v_payment_method = 'CASH' THEN v_session_id ELSE NULL END,
      CASE WHEN v_payment_method = 'ACCOUNT_CREDIT' THEN v_account.id ELSE NULL END,
      NULLIF(v_payment->>'provider_reference', ''), v_payment - 'amount'
    ) RETURNING id INTO v_payment_id;

    IF v_payment_method = 'CASH' THEN
      INSERT INTO public.cash_movements_v2 (
        tenant_id, session_id, movement_type, direction, sale_id, amount, currency,
        payment_method, category, description, reference_type, reference_id,
        actor_user_id, idempotency_key, metadata
      ) VALUES (
        p_tenant_id, v_session_id, 'SALE', 'IN', v_sale_id, v_payment_amount, v_currency,
        v_payment_method, 'SALE', 'Cobro de venta ' || v_sale_number,
        'SALE_V2', v_sale_id, p_cashier_user_id,
        p_idempotency_key || ':payment:' || v_index::text,
        jsonb_build_object('sale_payment_id', v_payment_id)
      );
    END IF;
  END LOOP;

  IF v_cc_total > 0 THEN
    UPDATE public.customer_accounts
    SET balance = balance + v_cc_total,
        version = version + 1,
        updated_at = clock_timestamp()
    WHERE tenant_id = p_tenant_id AND id = v_account.id
    RETURNING * INTO v_account;

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

  INSERT INTO public.sale_events_v2 (
    tenant_id, sale_id, event_type, actor_user_id, idempotency_key, metadata
  ) VALUES (
    p_tenant_id, v_sale_id, 'CREATED', p_cashier_user_id, p_idempotency_key || ':event:created',
    jsonb_build_object('sale_number', v_sale_number, 'total', v_total)
  );

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data, metadata
  ) VALUES (
    p_tenant_id, p_cashier_user_id, 'SALE_CHECKOUT_CONFIRMED', 'SALE_V2', v_sale_id,
    jsonb_build_object('sale_number', v_sale_number, 'total', v_total, 'status', 'CONFIRMED'),
    jsonb_build_object('salesperson_user_id', p_salesperson_user_id, 'payment_count', jsonb_array_length(p_payments))
  );

  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'SALE_V2', v_sale_id, 'SALE_CONFIRMED',
    jsonb_build_object('sale_id', v_sale_id, 'sale_number', v_sale_number, 'total', v_total, 'currency', v_currency),
    p_idempotency_key || ':outbox'
  );

  RETURN jsonb_build_object(
    'sale_id', v_sale_id,
    'sale_number', v_sale_number,
    'total', v_total,
    'status', 'CONFIRMED',
    'idempotent', false
  );
EXCEPTION
  WHEN unique_violation THEN
    -- Una carrera con la misma idempotency key se resuelve leyendo el ganador.
    SELECT * INTO v_existing
    FROM public.sales_v2 s
    WHERE s.tenant_id = p_tenant_id AND s.idempotency_key = p_idempotency_key;
    IF v_existing.id IS NOT NULL
       AND v_existing.payload_hash = p_payload_hash
       AND v_existing.request_fingerprint = v_request_fingerprint THEN
      RETURN jsonb_build_object(
        'sale_id', v_existing.id,
        'sale_number', v_existing.sale_number,
        'total', v_existing.total,
        'status', v_existing.status,
        'idempotent', true
      );
    END IF;
    RAISE;
END;
$$;

-- RPC de e-commerce declaradas despues de todas sus tablas.
CREATE OR REPLACE FUNCTION public.create_public_order_v2(
  p_tenant_id UUID,
  p_idempotency_key TEXT,
  p_items JSONB,
  p_customer JSONB,
  p_delivery JSONB,
  p_notes TEXT DEFAULT NULL,
  p_coupon_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_role TEXT := COALESCE(auth.role(), current_setting('request.jwt.claim.role', true));
  v_existing public.public_orders_v2%ROWTYPE;
  v_product public.catalog_products%ROWTYPE;
  v_balance public.inventory_balances_v2%ROWTYPE;
  v_item JSONB;
  v_normalized_items JSONB := '[]'::jsonb;
  v_seen UUID[] := ARRAY[]::UUID[];
  v_quantity NUMERIC(18,3);
  v_subtotal NUMERIC(18,2) := 0;
  v_discount NUMERIC(18,2) := 0;
  v_total NUMERIC(18,2);
  v_currency CHAR(3);
  v_location_id UUID;
  v_order_id UUID := gen_random_uuid();
  v_order_number TEXT;
  v_fingerprint TEXT;
  v_coupon JSONB;
  v_coupon_type TEXT;
  v_coupon_value NUMERIC;
  v_delivery_type TEXT := upper(COALESCE(NULLIF(btrim(p_delivery->>'type'), ''), 'PICKUP'));
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'create_public_order_v2 es exclusiva del backend service_role.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Tenant inexistente.';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Idempotency key invalida.';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La orden requiere items.';
  END IF;
  IF jsonb_typeof(p_customer) <> 'object' OR length(btrim(COALESCE(p_customer->>'name', ''))) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Datos de cliente invalidos.';
  END IF;
  IF jsonb_typeof(p_delivery) <> 'object' OR length(v_delivery_type) > 30 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Datos de entrega invalidos.';
  END IF;
  IF v_delivery_type <> 'PICKUP' AND NULLIF(btrim(p_delivery->>'address'), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La entrega requiere direccion.';
  END IF;

  v_fingerprint := encode(digest(convert_to(concat_ws('|',
    p_items::text, p_customer::text, p_delivery::text,
    COALESCE(p_notes, ''), COALESCE(upper(btrim(p_coupon_code)), '')
  ), 'UTF8'), 'sha256'), 'hex');

  SELECT po.* INTO v_existing
  FROM public.public_orders_v2 po
  WHERE po.tenant_id = p_tenant_id AND po.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.request_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Colision de idempotencia en la orden publica.';
    END IF;
    RETURN jsonb_build_object(
      'order_id', v_existing.id, 'order_number', v_existing.order_number,
      'subtotal', v_existing.subtotal, 'discount', v_existing.discount,
      'total', v_existing.total, 'currency', v_existing.currency,
      'items', v_existing.items, 'status', v_existing.status, 'idempotent', true
    );
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Cada item debe ser un objeto JSON.';
    END IF;
    v_quantity := NULLIF(v_item->>'quantity', '')::NUMERIC;
    IF v_quantity IS NULL OR v_quantity <= 0 OR scale(v_quantity) > 3 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Cantidad de item invalida.';
    END IF;

    SELECT cp.* INTO v_product
    FROM public.catalog_products cp
    WHERE cp.tenant_id = p_tenant_id AND cp.active = true
      AND (
        cp.id::text = COALESCE(v_item->>'product_id', '')
        OR cp.sku = COALESCE(NULLIF(v_item->>'sku', ''), NULLIF(v_item->>'product_id', ''))
      )
    ORDER BY CASE WHEN cp.id::text = COALESCE(v_item->>'product_id', '') THEN 0 ELSE 1 END
    LIMIT 1
    FOR UPDATE;
    IF v_product.id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Producto inexistente o inactivo.';
    END IF;
    IF v_product.id = ANY(v_seen) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'No repita el mismo producto; acumule su cantidad.';
    END IF;
    v_seen := array_append(v_seen, v_product.id);
    IF v_currency IS NULL THEN v_currency := v_product.currency; END IF;
    IF v_currency <> v_product.currency THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La orden no puede mezclar monedas.';
    END IF;
    v_subtotal := v_subtotal + round(v_product.price * v_quantity, 2);
    v_normalized_items := v_normalized_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id, 'sku', v_product.sku, 'name', v_product.name,
      'quantity', v_quantity, 'unit_price', v_product.price,
      'line_total', round(v_product.price * v_quantity, 2)
    ));
  END LOOP;

  IF NULLIF(btrim(p_coupon_code), '') IS NOT NULL THEN
    SELECT tac.config_json #> ARRAY['rules', 'ecommerce', 'coupons', upper(btrim(p_coupon_code))]
    INTO v_coupon
    FROM public.tenant_app_config tac
    WHERE tac.tenant_id = p_tenant_id AND tac.stage = 'published';
    IF v_coupon IS NULL OR jsonb_typeof(v_coupon) <> 'object'
       OR lower(COALESCE(v_coupon->>'active', 'false')) <> 'true' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Cupon inexistente o inactivo.';
    END IF;
    v_coupon_type := upper(COALESCE(v_coupon->>'type', ''));
    v_coupon_value := NULLIF(v_coupon->>'value', '')::NUMERIC;
    IF v_coupon_value IS NULL OR v_coupon_value < 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Regla de cupon invalida.';
    END IF;
    IF v_coupon_type = 'PERCENT' THEN
      IF v_coupon_value > 100 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Porcentaje de cupon invalido.';
      END IF;
      v_discount := round(v_subtotal * v_coupon_value / 100, 2);
    ELSIF v_coupon_type = 'FIXED' THEN
      v_discount := least(v_subtotal, round(v_coupon_value, 2));
    ELSE
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Tipo de cupon no admitido.';
    END IF;
  END IF;
  v_total := round(v_subtotal - v_discount, 2);
  IF v_total <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'La orden debe tener total positivo.';
  END IF;

  v_order_number := 'WEB-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || upper(substr(replace(v_order_id::text, '-', ''), 1, 8));
  INSERT INTO public.public_orders_v2 (
    tenant_id, id, order_number, customer_name, customer_email, customer_phone,
    delivery_type, delivery_address, notes, items, subtotal, discount, total,
    currency, status, payment_status, idempotency_key, request_fingerprint
  ) VALUES (
    p_tenant_id, v_order_id, v_order_number, btrim(p_customer->>'name'),
    NULLIF(btrim(p_customer->>'email'), ''), NULLIF(btrim(p_customer->>'phone'), ''),
    v_delivery_type, NULLIF(btrim(p_delivery->>'address'), ''), NULLIF(btrim(p_notes), ''),
    v_normalized_items, v_subtotal, v_discount, v_total, v_currency,
    'PENDING_PAYMENT', 'PENDING', p_idempotency_key, v_fingerprint
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_normalized_items)
  LOOP
    SELECT cp.* INTO v_product
    FROM public.catalog_products cp
    WHERE cp.tenant_id = p_tenant_id AND cp.id = (v_item->>'product_id')::UUID;
    IF v_product.track_stock THEN
      SELECT il.id INTO v_location_id
      FROM public.inventory_locations_v2 il
      WHERE il.tenant_id = p_tenant_id AND il.active = true
        AND il.is_sellable = true AND il.is_default = true;
      IF v_location_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'No hay ubicacion default vendible para reservar stock.';
      END IF;
      v_quantity := (v_item->>'quantity')::NUMERIC;
      SELECT ib.* INTO v_balance
      FROM public.inventory_balances_v2 ib
      WHERE ib.tenant_id = p_tenant_id AND ib.product_id = v_product.id AND ib.location_id = v_location_id
      FOR UPDATE;
      IF v_balance.product_id IS NULL OR v_balance.available < v_quantity THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = format('Stock insuficiente para SKU %s.', v_product.sku);
      END IF;
      UPDATE public.inventory_balances_v2
      SET reserved = reserved + v_quantity, version = version + 1, updated_at = clock_timestamp()
      WHERE tenant_id = p_tenant_id AND product_id = v_product.id AND location_id = v_location_id
      RETURNING * INTO v_balance;
      INSERT INTO public.inventory_reservations_v2 (
        tenant_id, order_id, product_id, location_id, quantity, status,
        expires_at, idempotency_key
      ) VALUES (
        p_tenant_id, v_order_id, v_product.id, v_location_id, v_quantity, 'ACTIVE',
        clock_timestamp() + interval '20 minutes',
        p_idempotency_key || ':reserve:' || v_product.id::text
      );
      INSERT INTO public.inventory_ledger_v2 (
        tenant_id, product_id, location_id, event_type, quantity_delta, reserved_delta,
        on_hand_after, reserved_after, reference_type, reference_id, idempotency_key, metadata
      ) VALUES (
        p_tenant_id, v_product.id, v_location_id, 'RESERVE', 0, v_quantity,
        v_balance.on_hand, v_balance.reserved, 'PUBLIC_ORDER_V2', v_order_id,
        p_idempotency_key || ':reserve-ledger:' || v_product.id::text,
        jsonb_build_object('order_number', v_order_number)
      );
    END IF;
  END LOOP;

  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'PUBLIC_ORDER_V2', v_order_id, 'PUBLIC_ORDER_CREATED',
    jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'total', v_total, 'currency', v_currency),
    p_idempotency_key || ':outbox'
  );

  RETURN jsonb_build_object(
    'order_id', v_order_id, 'order_number', v_order_number, 'subtotal', v_subtotal,
    'discount', v_discount, 'total', v_total, 'currency', v_currency,
    'items', v_normalized_items, 'status', 'PENDING_PAYMENT', 'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_public_order_payment_v2(
  p_order_id UUID,
  p_provider_payment_id TEXT,
  p_status TEXT,
  p_amount NUMERIC,
  p_raw JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_role TEXT := COALESCE(auth.role(), current_setting('request.jwt.claim.role', true));
  v_status TEXT := upper(COALESCE(btrim(p_status), ''));
  v_order public.public_orders_v2%ROWTYPE;
  v_event public.public_order_payment_events_v2%ROWTYPE;
  v_reservation public.inventory_reservations_v2%ROWTYPE;
  v_balance public.inventory_balances_v2%ROWTYPE;
  v_target_reservation_status TEXT;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'confirm_public_order_payment_v2 es exclusiva del backend service_role.';
  END IF;
  IF p_provider_payment_id IS NULL OR length(btrim(p_provider_payment_id)) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Provider payment id invalido.';
  END IF;
  IF v_status NOT IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Estado de pago invalido.';
  END IF;
  IF p_raw IS NULL OR jsonb_typeof(p_raw) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Payload de proveedor invalido.';
  END IF;

  SELECT po.* INTO v_order
  FROM public.public_orders_v2 po
  WHERE po.id = p_order_id
  FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Orden publica inexistente.';
  END IF;

  SELECT pe.* INTO v_event
  FROM public.public_order_payment_events_v2 pe
  WHERE pe.tenant_id = v_order.tenant_id
    AND pe.payment_provider = COALESCE(v_order.payment_provider, 'MERCADO_PAGO')
    AND pe.provider_payment_id = p_provider_payment_id
    AND pe.status = v_status;
  IF v_event.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'order_id', v_order.id, 'order_number', v_order.order_number,
      'status', v_order.status, 'payment_status', v_order.payment_status,
      'idempotent', true
    );
  END IF;

  IF v_status = 'APPROVED' THEN
    IF p_amount IS NULL OR round(p_amount, 2) <> v_order.total THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'El importe aprobado no coincide con el total autoritativo.';
    END IF;
    IF v_order.payment_status = 'APPROVED' THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'La orden ya fue aprobada por otro evento de pago.';
    END IF;
    IF v_order.status <> 'PENDING_PAYMENT' OR v_order.reservation_expires_at <= clock_timestamp() THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'La orden no posee una reserva vigente aprobable.';
    END IF;
    FOR v_reservation IN
      SELECT ir.* FROM public.inventory_reservations_v2 ir
      WHERE ir.tenant_id = v_order.tenant_id AND ir.order_id = v_order.id AND ir.status = 'ACTIVE'
      FOR UPDATE
    LOOP
      SELECT ib.* INTO v_balance
      FROM public.inventory_balances_v2 ib
      WHERE ib.tenant_id = v_reservation.tenant_id
        AND ib.product_id = v_reservation.product_id AND ib.location_id = v_reservation.location_id
      FOR UPDATE;
      IF v_balance.product_id IS NULL OR v_balance.reserved < v_reservation.quantity
         OR v_balance.on_hand < v_reservation.quantity THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Reserva de inventario inconsistente.';
      END IF;
      UPDATE public.inventory_balances_v2
      SET on_hand = on_hand - v_reservation.quantity,
          reserved = reserved - v_reservation.quantity,
          version = version + 1, updated_at = clock_timestamp()
      WHERE tenant_id = v_reservation.tenant_id
        AND product_id = v_reservation.product_id AND location_id = v_reservation.location_id
      RETURNING * INTO v_balance;
      UPDATE public.inventory_reservations_v2
      SET status = 'FULFILLED', fulfilled_at = clock_timestamp()
      WHERE tenant_id = v_reservation.tenant_id AND id = v_reservation.id;
      INSERT INTO public.inventory_ledger_v2 (
        tenant_id, product_id, location_id, event_type, quantity_delta, reserved_delta,
        on_hand_after, reserved_after, reference_type, reference_id, idempotency_key, metadata
      ) VALUES (
        v_reservation.tenant_id, v_reservation.product_id, v_reservation.location_id,
        'PUBLIC_ORDER_FULFILL', -v_reservation.quantity, -v_reservation.quantity,
        v_balance.on_hand, v_balance.reserved, 'PUBLIC_ORDER_V2', v_order.id,
        'public-payment:' || p_provider_payment_id || ':fulfill:' || v_reservation.id::text,
        jsonb_build_object('order_number', v_order.order_number)
      );
    END LOOP;
    UPDATE public.public_orders_v2
    SET status = 'CONFIRMED', payment_status = 'APPROVED',
        payment_provider = COALESCE(payment_provider, 'MERCADO_PAGO'), updated_at = clock_timestamp()
    WHERE tenant_id = v_order.tenant_id AND id = v_order.id
    RETURNING * INTO v_order;
  ELSIF v_status IN ('REJECTED', 'CANCELLED') THEN
    v_target_reservation_status := CASE WHEN v_status = 'CANCELLED' THEN 'CANCELLED' ELSE 'RELEASED' END;
    FOR v_reservation IN
      SELECT ir.* FROM public.inventory_reservations_v2 ir
      WHERE ir.tenant_id = v_order.tenant_id AND ir.order_id = v_order.id AND ir.status = 'ACTIVE'
      FOR UPDATE
    LOOP
      SELECT ib.* INTO v_balance
      FROM public.inventory_balances_v2 ib
      WHERE ib.tenant_id = v_reservation.tenant_id
        AND ib.product_id = v_reservation.product_id AND ib.location_id = v_reservation.location_id
      FOR UPDATE;
      IF v_balance.product_id IS NULL OR v_balance.reserved < v_reservation.quantity THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Reserva de inventario inconsistente al liberar.';
      END IF;
      UPDATE public.inventory_balances_v2
      SET reserved = reserved - v_reservation.quantity,
          version = version + 1, updated_at = clock_timestamp()
      WHERE tenant_id = v_reservation.tenant_id
        AND product_id = v_reservation.product_id AND location_id = v_reservation.location_id
      RETURNING * INTO v_balance;
      UPDATE public.inventory_reservations_v2
      SET status = v_target_reservation_status, released_at = clock_timestamp()
      WHERE tenant_id = v_reservation.tenant_id AND id = v_reservation.id;
      INSERT INTO public.inventory_ledger_v2 (
        tenant_id, product_id, location_id, event_type, quantity_delta, reserved_delta,
        on_hand_after, reserved_after, reference_type, reference_id, idempotency_key, metadata
      ) VALUES (
        v_reservation.tenant_id, v_reservation.product_id, v_reservation.location_id,
        'RELEASE', 0, -v_reservation.quantity, v_balance.on_hand, v_balance.reserved,
        'PUBLIC_ORDER_V2', v_order.id,
        'public-payment:' || p_provider_payment_id || ':release:' || v_reservation.id::text,
        jsonb_build_object('payment_status', v_status)
      );
    END LOOP;
    UPDATE public.public_orders_v2
    SET status = 'CANCELLED', payment_status = v_status,
        payment_provider = COALESCE(payment_provider, 'MERCADO_PAGO'), updated_at = clock_timestamp()
    WHERE tenant_id = v_order.tenant_id AND id = v_order.id
    RETURNING * INTO v_order;
  ELSIF v_status = 'REFUNDED' THEN
    UPDATE public.public_orders_v2
    SET status = 'CANCELLED', payment_status = 'REFUNDED', updated_at = clock_timestamp()
    WHERE tenant_id = v_order.tenant_id AND id = v_order.id
    RETURNING * INTO v_order;
  ELSE
    UPDATE public.public_orders_v2
    SET payment_status = 'PENDING', updated_at = clock_timestamp()
    WHERE tenant_id = v_order.tenant_id AND id = v_order.id
    RETURNING * INTO v_order;
  END IF;

  INSERT INTO public.public_order_payment_events_v2 (
    tenant_id, order_id, payment_provider, provider_payment_id, status, amount, raw_payload
  ) VALUES (
    v_order.tenant_id, v_order.id, COALESCE(v_order.payment_provider, 'MERCADO_PAGO'),
    p_provider_payment_id, v_status, p_amount, p_raw
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    v_order.tenant_id, 'PUBLIC_ORDER_V2', v_order.id, 'PUBLIC_ORDER_PAYMENT_' || v_status,
    jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'payment_status', v_status),
    'public-payment:' || p_provider_payment_id || ':' || v_status || ':outbox'
  );

  RETURN jsonb_build_object(
    'order_id', v_order.id, 'order_number', v_order.order_number,
    'status', v_order.status, 'payment_status', v_order.payment_status,
    'idempotent', false
  );
END;
$$;

-- RPC de caja declaradas despues de todas sus tablas.
CREATE OR REPLACE FUNCTION public.open_cash_session_v2(
  p_tenant_id UUID,
  p_register_id UUID,
  p_opening_amount NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_register public.cash_registers%ROWTYPE;
  v_session public.cash_sessions_v2%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'VENDEDOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Rol operativo activo requerido para abrir caja.';
  END IF;
  IF p_opening_amount IS NULL OR round(p_opening_amount, 2) <> p_opening_amount OR p_opening_amount < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Importe de apertura invalido.';
  END IF;

  SELECT cr.* INTO v_register
  FROM public.cash_registers cr
  WHERE cr.tenant_id = p_tenant_id AND cr.id = p_register_id AND cr.active = true
  FOR UPDATE;
  IF v_register.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Caja inexistente, inactiva o ajena al tenant.';
  END IF;

  SELECT cs.* INTO v_session
  FROM public.cash_sessions_v2 cs
  WHERE cs.tenant_id = p_tenant_id AND cs.register_id = p_register_id AND cs.status = 'OPEN'
  FOR UPDATE;
  IF v_session.id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'La caja ya posee una sesion OPEN.';
  END IF;

  INSERT INTO public.cash_sessions_v2 (
    tenant_id, register_id, status, opened_by, opening_amount
  ) VALUES (
    p_tenant_id, p_register_id, 'OPEN', v_actor, p_opening_amount
  ) RETURNING * INTO v_session;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'CASH_SESSION_OPENED', 'CASH_SESSION_V2', v_session.id,
    jsonb_build_object('register_id', p_register_id, 'opening_amount', p_opening_amount, 'status', 'OPEN')
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'CASH_SESSION_V2', v_session.id, 'CASH_SESSION_OPENED',
    jsonb_build_object('session_id', v_session.id, 'register_id', p_register_id),
    'cash-open:' || v_session.id::text
  );

  RETURN jsonb_build_object(
    'session_id', v_session.id, 'register_id', v_session.register_id,
    'status', v_session.status, 'opening_amount', v_session.opening_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_cash_movement_v2(
  p_tenant_id UUID,
  p_session_id UUID,
  p_type TEXT,
  p_amount NUMERIC,
  p_category TEXT,
  p_description TEXT,
  p_reference JSONB DEFAULT '{}'::jsonb
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
  v_type TEXT := upper(COALESCE(btrim(p_type), ''));
  v_direction TEXT;
  v_reference_id UUID;
  v_idempotency_key TEXT;
  v_movement_id UUID;
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'VENDEDOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Rol operativo activo requerido para registrar movimientos.';
  END IF;
  IF v_type NOT IN ('INCOME', 'EXPENSE', 'WITHDRAWAL', 'ADJUSTMENT') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Tipo de movimiento manual invalido.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR round(p_amount, 2) <> p_amount THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Importe de movimiento invalido.';
  END IF;
  IF p_description IS NULL OR length(btrim(p_description)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Descripcion de movimiento requerida.';
  END IF;
  IF p_reference IS NULL OR jsonb_typeof(p_reference) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La referencia debe ser un objeto JSON.';
  END IF;

  SELECT cs.* INTO v_session
  FROM public.cash_sessions_v2 cs
  WHERE cs.tenant_id = p_tenant_id AND cs.id = p_session_id AND cs.status = 'OPEN'
  FOR UPDATE;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'La sesion de caja no existe o no esta OPEN.';
  END IF;
  IF v_session.opened_by <> v_actor AND NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo el cajero titular o un supervisor puede operar esta sesion.';
  END IF;

  v_direction := CASE
    WHEN v_type = 'INCOME' THEN 'IN'
    WHEN v_type IN ('EXPENSE', 'WITHDRAWAL') THEN 'OUT'
    ELSE upper(COALESCE(p_reference->>'direction', ''))
  END;
  IF v_direction NOT IN ('IN', 'OUT') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ADJUSTMENT requiere direction IN u OUT.';
  END IF;
  BEGIN
    v_reference_id := NULLIF(p_reference->>'id', '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reference.id debe ser UUID.';
  END;
  v_idempotency_key := COALESCE(
    NULLIF(btrim(p_reference->>'idempotency_key'), ''),
    'cash-manual:' || gen_random_uuid()::text
  );

  INSERT INTO public.cash_movements_v2 (
    tenant_id, session_id, movement_type, direction, amount, currency,
    payment_method, category, description, reference_type, reference_id,
    actor_user_id, idempotency_key, metadata
  ) VALUES (
    p_tenant_id, p_session_id, v_type, v_direction, p_amount,
    (SELECT cr.currency FROM public.cash_registers cr
     WHERE cr.tenant_id = p_tenant_id AND cr.id = v_session.register_id),
    'CASH', NULLIF(btrim(p_category), ''), btrim(p_description),
    NULLIF(btrim(p_reference->>'type'), ''), v_reference_id,
    v_actor, v_idempotency_key, p_reference - 'idempotency_key'
  ) RETURNING id INTO v_movement_id;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'CASH_MOVEMENT_RECORDED', 'CASH_MOVEMENT_V2', v_movement_id,
    jsonb_build_object('session_id', p_session_id, 'type', v_type, 'direction', v_direction, 'amount', p_amount)
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'CASH_SESSION_V2', p_session_id, 'CASH_MOVEMENT_RECORDED',
    jsonb_build_object('movement_id', v_movement_id, 'type', v_type, 'direction', v_direction, 'amount', p_amount),
    v_idempotency_key || ':outbox'
  );

  RETURN jsonb_build_object(
    'movement_id', v_movement_id, 'session_id', p_session_id,
    'type', v_type, 'direction', v_direction, 'amount', p_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_cash_closure_v2(
  p_tenant_id UUID,
  p_session_id UUID,
  p_counted NUMERIC,
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
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'VENDEDOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Rol operativo activo requerido para cerrar caja.';
  END IF;
  IF p_counted IS NULL OR p_counted < 0 OR round(p_counted, 2) <> p_counted THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Efectivo contado invalido.';
  END IF;

  SELECT cc.* INTO v_existing
  FROM public.cash_closures cc
  WHERE cc.tenant_id = p_tenant_id AND cc.session_id = p_session_id
  FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.counted_amount <> p_counted THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'La sesion ya fue cerrada con otro conteo.';
    END IF;
    RETURN jsonb_build_object(
      'closure_id', v_existing.id, 'session_id', p_session_id,
      'expected_amount', v_existing.expected_amount, 'counted_amount', v_existing.counted_amount,
      'difference', v_existing.difference, 'review_status', v_existing.review_status,
      'idempotent', true
    );
  END IF;

  SELECT cs.* INTO v_session
  FROM public.cash_sessions_v2 cs
  WHERE cs.tenant_id = p_tenant_id AND cs.id = p_session_id AND cs.status = 'OPEN'
  FOR UPDATE;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'La sesion no existe o no esta OPEN.';
  END IF;
  IF v_session.opened_by <> v_actor AND NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo el cajero titular o un supervisor puede cerrar esta sesion.';
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
    review_status, closed_by, notes
  ) VALUES (
    p_tenant_id, p_session_id, v_expected, p_counted, round(p_counted - v_expected, 2),
    'PENDING_REVIEW', v_actor, NULLIF(btrim(p_notes), '')
  ) RETURNING * INTO v_closure;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'CASH_CLOSURE_SUBMITTED', 'CASH_CLOSURE', v_closure.id,
    jsonb_build_object(
      'session_id', p_session_id, 'expected_amount', v_expected,
      'counted_amount', p_counted, 'difference', v_closure.difference,
      'review_status', 'PENDING_REVIEW'
    )
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'CASH_CLOSURE', v_closure.id, 'CASH_CLOSURE_REVIEW_REQUIRED',
    jsonb_build_object('closure_id', v_closure.id, 'session_id', p_session_id, 'difference', v_closure.difference),
    'cash-closure:' || v_closure.id::text
  );

  RETURN jsonb_build_object(
    'closure_id', v_closure.id, 'session_id', p_session_id,
    'expected_amount', v_expected, 'counted_amount', p_counted,
    'difference', v_closure.difference, 'review_status', v_closure.review_status,
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.review_cash_closure_v2(
  p_tenant_id UUID,
  p_closure_id UUID,
  p_decision TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_decision TEXT := CASE upper(COALESCE(btrim(p_decision), ''))
    WHEN 'APPROVE' THEN 'APPROVED'
    WHEN 'APPROVED' THEN 'APPROVED'
    WHEN 'REJECT' THEN 'REJECTED'
    WHEN 'REJECTED' THEN 'REJECTED'
    ELSE NULL
  END;
  v_closure public.cash_closures%ROWTYPE;
  v_before JSONB;
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo ADMIN o SUPERVISOR puede revisar cierres.';
  END IF;
  IF v_decision IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Decision de revision invalida.';
  END IF;
  IF v_decision = 'REJECTED' AND NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El rechazo requiere motivo.';
  END IF;

  SELECT cc.* INTO v_closure
  FROM public.cash_closures cc
  WHERE cc.tenant_id = p_tenant_id AND cc.id = p_closure_id
  FOR UPDATE;
  IF v_closure.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Cierre inexistente o ajeno al tenant.';
  END IF;
  IF v_closure.closed_by = v_actor THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Quien cerro la caja no puede revisar su propio cierre.';
  END IF;
  IF v_closure.review_status <> 'PENDING_REVIEW' THEN
    IF v_closure.review_status = v_decision THEN
      RETURN jsonb_build_object(
        'closure_id', v_closure.id, 'review_status', v_closure.review_status,
        'reviewed_by', v_closure.reviewed_by, 'idempotent', true
      );
    END IF;
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'El cierre ya posee una revision diferente.';
  END IF;

  v_before := to_jsonb(v_closure);
  UPDATE public.cash_closures
  SET review_status = v_decision, reviewed_by = v_actor,
      reviewed_at = clock_timestamp(), review_reason = NULLIF(btrim(p_reason), '')
  WHERE tenant_id = p_tenant_id AND id = p_closure_id
  RETURNING * INTO v_closure;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'CASH_CLOSURE_' || v_decision, 'CASH_CLOSURE', p_closure_id,
    v_before, to_jsonb(v_closure)
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'CASH_CLOSURE', p_closure_id, 'CASH_CLOSURE_' || v_decision,
    jsonb_build_object('closure_id', p_closure_id, 'decision', v_decision, 'reviewed_by', v_actor),
    'cash-review:' || p_closure_id::text || ':' || v_decision
  );

  RETURN jsonb_build_object(
    'closure_id', v_closure.id, 'review_status', v_closure.review_status,
    'reviewed_by', v_closure.reviewed_by, 'idempotent', false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Altas maestras, recepcion de stock y cobranza de cuenta corriente.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_catalog_product_v2(
  p_tenant_id UUID,
  p_sku TEXT,
  p_name TEXT,
  p_price NUMERIC,
  p_currency TEXT DEFAULT 'ARS',
  p_track_stock BOOLEAN DEFAULT true,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_product_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_product public.catalog_products%ROWTYPE;
  v_before JSONB;
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo ADMIN o SUPERVISOR puede mantener catalogo.';
  END IF;
  IF length(btrim(COALESCE(p_sku, ''))) NOT BETWEEN 1 AND 120
     OR length(btrim(COALESCE(p_name, ''))) NOT BETWEEN 1 AND 255
     OR p_price IS NULL OR p_price < 0 OR round(p_price, 2) <> p_price
     OR upper(COALESCE(p_currency, '')) !~ '^[A-Z]{3}$'
     OR p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Datos de producto invalidos.';
  END IF;

  SELECT cp.* INTO v_product
  FROM public.catalog_products cp
  WHERE cp.tenant_id = p_tenant_id
    AND ((p_product_id IS NOT NULL AND cp.id = p_product_id) OR cp.sku = btrim(p_sku))
  ORDER BY CASE WHEN cp.id = p_product_id THEN 0 ELSE 1 END
  LIMIT 1
  FOR UPDATE;

  IF v_product.id IS NULL THEN
    INSERT INTO public.catalog_products (
      tenant_id, id, sku, barcode, name, description, category, price, cost_price,
      currency, active, track_stock,
      metadata, created_by, updated_by
    ) VALUES (
      p_tenant_id, COALESCE(p_product_id, gen_random_uuid()), btrim(p_sku),
      NULLIF(btrim(p_metadata->>'barcode'), ''), btrim(p_name),
      NULLIF(btrim(p_metadata->>'description'), ''),
      NULLIF(btrim(p_metadata->>'category'), ''), p_price,
      CASE WHEN NULLIF(p_metadata->>'cost_price', '') IS NULL THEN NULL
        ELSE round((p_metadata->>'cost_price')::NUMERIC, 2) END,
      upper(p_currency), true, p_track_stock, p_metadata, v_actor, v_actor
    ) RETURNING * INTO v_product;
    v_before := NULL;
  ELSE
    IF p_product_id IS NOT NULL AND v_product.id <> p_product_id THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'El SKU pertenece a otro product_id.';
    END IF;
    v_before := to_jsonb(v_product);
    UPDATE public.catalog_products
    SET sku = btrim(p_sku),
        barcode = NULLIF(btrim(p_metadata->>'barcode'), ''),
        name = btrim(p_name),
        description = NULLIF(btrim(p_metadata->>'description'), ''),
        category = NULLIF(btrim(p_metadata->>'category'), ''),
        price = p_price,
        cost_price = CASE WHEN NULLIF(p_metadata->>'cost_price', '') IS NULL THEN cost_price
          ELSE round((p_metadata->>'cost_price')::NUMERIC, 2) END,
        currency = upper(p_currency), track_stock = p_track_stock,
        metadata = p_metadata, updated_by = v_actor, updated_at = clock_timestamp()
    WHERE tenant_id = p_tenant_id AND id = v_product.id
    RETURNING * INTO v_product;
  END IF;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'CATALOG_PRODUCT_UPSERTED', 'CATALOG_PRODUCT', v_product.id,
    v_before, to_jsonb(v_product)
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'CATALOG_PRODUCT', v_product.id, 'CATALOG_PRODUCT_UPSERTED',
    jsonb_build_object('product_id', v_product.id, 'sku', v_product.sku, 'price', v_product.price),
    'catalog-upsert:' || v_product.id::text || ':' || extract(epoch FROM clock_timestamp())::text
  );
  RETURN jsonb_build_object(
    'product_id', v_product.id, 'sku', v_product.sku, 'name', v_product.name,
    'price', v_product.price, 'currency', v_product.currency,
    'active', v_product.active, 'track_stock', v_product.track_stock
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_inventory_v2(
  p_tenant_id UUID,
  p_product_id UUID,
  p_location_id UUID,
  p_quantity NUMERIC,
  p_unit_cost NUMERIC,
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
  v_existing public.inventory_ledger_v2%ROWTYPE;
  v_product public.catalog_products%ROWTYPE;
  v_balance public.inventory_balances_v2%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo ADMIN o SUPERVISOR puede recibir inventario.';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR scale(p_quantity) > 3
     OR p_unit_cost IS NULL OR p_unit_cost < 0 OR round(p_unit_cost, 2) <> p_unit_cost
     OR length(btrim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Recepcion de inventario invalida.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':receive:' || p_idempotency_key, 0));

  SELECT il.* INTO v_existing
  FROM public.inventory_ledger_v2 il
  WHERE il.tenant_id = p_tenant_id AND il.idempotency_key = p_idempotency_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.event_type <> 'RECEIPT' OR v_existing.product_id <> p_product_id
       OR v_existing.location_id <> p_location_id OR v_existing.quantity_delta <> p_quantity
       OR COALESCE((v_existing.metadata->>'unit_cost')::NUMERIC, -1) <> p_unit_cost THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Colision de idempotencia en recepcion.';
    END IF;
    RETURN jsonb_build_object(
      'ledger_id', v_existing.id, 'product_id', p_product_id,
      'location_id', p_location_id, 'on_hand', v_existing.on_hand_after,
      'idempotent', true
    );
  END IF;

  SELECT cp.* INTO v_product
  FROM public.catalog_products cp
  WHERE cp.tenant_id = p_tenant_id AND cp.id = p_product_id AND cp.active = true
  FOR UPDATE;
  IF v_product.id IS NULL OR NOT v_product.track_stock THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Producto inexistente, inactivo o sin control de stock.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_locations_v2 il
    WHERE il.tenant_id = p_tenant_id AND il.id = p_location_id AND il.active = true
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Ubicacion inexistente o inactiva.';
  END IF;

  INSERT INTO public.inventory_balances_v2 (tenant_id, product_id, location_id)
  VALUES (p_tenant_id, p_product_id, p_location_id)
  ON CONFLICT (tenant_id, product_id, location_id) DO NOTHING;
  SELECT ib.* INTO v_balance
  FROM public.inventory_balances_v2 ib
  WHERE ib.tenant_id = p_tenant_id AND ib.product_id = p_product_id AND ib.location_id = p_location_id
  FOR UPDATE;
  UPDATE public.inventory_balances_v2
  SET on_hand = on_hand + p_quantity, version = version + 1, updated_at = clock_timestamp()
  WHERE tenant_id = p_tenant_id AND product_id = p_product_id AND location_id = p_location_id
  RETURNING * INTO v_balance;

  INSERT INTO public.inventory_ledger_v2 (
    tenant_id, product_id, location_id, event_type, quantity_delta, reserved_delta,
    on_hand_after, reserved_after, reference_type, idempotency_key, actor_user_id, metadata
  ) VALUES (
    p_tenant_id, p_product_id, p_location_id, 'RECEIPT', p_quantity, 0,
    v_balance.on_hand, v_balance.reserved, 'INVENTORY_RECEIPT',
    p_idempotency_key, v_actor, jsonb_build_object('unit_cost', p_unit_cost)
  ) RETURNING * INTO v_existing;
  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'INVENTORY_RECEIVED', 'INVENTORY_LEDGER_V2', v_existing.id,
    jsonb_build_object('product_id', p_product_id, 'location_id', p_location_id,
      'quantity', p_quantity, 'on_hand_after', v_balance.on_hand)
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'CATALOG_PRODUCT', p_product_id, 'INVENTORY_RECEIVED',
    jsonb_build_object('product_id', p_product_id, 'location_id', p_location_id,
      'quantity', p_quantity, 'on_hand_after', v_balance.on_hand),
    p_idempotency_key || ':outbox'
  );
  RETURN jsonb_build_object(
    'ledger_id', v_existing.id, 'product_id', p_product_id,
    'location_id', p_location_id, 'on_hand', v_balance.on_hand,
    'available', v_balance.available, 'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_customer_v2(
  p_tenant_id UUID,
  p_customer_id UUID,
  p_display_name TEXT,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_tax_id TEXT DEFAULT NULL,
  p_credit_limit NUMERIC DEFAULT 0,
  p_currency TEXT DEFAULT 'ARS',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role TEXT;
  v_customer public.customers%ROWTYPE;
  v_account public.customer_accounts%ROWTYPE;
  v_customer_id UUID := COALESCE(p_customer_id, gen_random_uuid());
  v_before JSONB;
BEGIN
  SELECT upper(tu.role) INTO v_role
  FROM public.tenant_users tu
  WHERE tu.tenant_id = p_tenant_id AND tu.user_id = v_actor AND tu.active = true
    AND upper(tu.role) IN ('ADMIN', 'SUPERVISOR', 'VENDEDOR');
  IF v_actor IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Rol operativo activo requerido para mantener clientes.';
  END IF;
  IF v_role = 'VENDEDOR' AND (p_customer_id IS NOT NULL OR COALESCE(p_credit_limit, 0) <> 0) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'VENDEDOR solo puede crear clientes generales sin limite de credito.';
  END IF;
  IF length(btrim(COALESCE(p_display_name, ''))) NOT BETWEEN 1 AND 255
     OR p_credit_limit IS NULL OR p_credit_limit < 0 OR round(p_credit_limit, 2) <> p_credit_limit
     OR upper(COALESCE(p_currency, '')) !~ '^[A-Z]{3}$'
     OR p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Datos de cliente invalidos.';
  END IF;

  SELECT c.* INTO v_customer
  FROM public.customers c
  WHERE c.tenant_id = p_tenant_id AND c.id = v_customer_id
  FOR UPDATE;
  v_before := CASE WHEN v_customer.id IS NULL THEN NULL ELSE to_jsonb(v_customer) END;
  IF v_customer.id IS NULL THEN
    INSERT INTO public.customers (
      tenant_id, id, display_name, email, phone, tax_id, status, metadata, created_by
    ) VALUES (
      p_tenant_id, v_customer_id, btrim(p_display_name), NULLIF(btrim(p_email), ''),
      NULLIF(btrim(p_phone), ''), NULLIF(btrim(p_tax_id), ''), 'ACTIVE', p_metadata, v_actor
    ) RETURNING * INTO v_customer;
  ELSE
    UPDATE public.customers
    SET display_name = btrim(p_display_name), email = NULLIF(btrim(p_email), ''),
        phone = NULLIF(btrim(p_phone), ''), tax_id = NULLIF(btrim(p_tax_id), ''),
        metadata = p_metadata, updated_at = clock_timestamp()
    WHERE tenant_id = p_tenant_id AND id = v_customer_id
    RETURNING * INTO v_customer;
  END IF;

  SELECT ca.* INTO v_account
  FROM public.customer_accounts ca
  WHERE ca.tenant_id = p_tenant_id AND ca.customer_id = v_customer_id
  FOR UPDATE;
  IF v_account.id IS NULL THEN
    INSERT INTO public.customer_accounts (tenant_id, customer_id, currency, credit_limit)
    VALUES (p_tenant_id, v_customer_id, upper(p_currency), p_credit_limit)
    RETURNING * INTO v_account;
  ELSE
    IF p_credit_limit < v_account.balance THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'El limite no puede quedar por debajo del saldo adeudado.';
    END IF;
    IF v_account.currency <> upper(p_currency) AND v_account.balance <> 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'No se puede cambiar moneda con saldo pendiente.';
    END IF;
    UPDATE public.customer_accounts
    SET currency = upper(p_currency), credit_limit = p_credit_limit,
        version = version + 1, updated_at = clock_timestamp()
    WHERE tenant_id = p_tenant_id AND id = v_account.id
    RETURNING * INTO v_account;
  END IF;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'CUSTOMER_UPSERTED', 'CUSTOMER', v_customer.id,
    v_before, to_jsonb(v_customer)
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'CUSTOMER', v_customer.id, 'CUSTOMER_UPSERTED',
    jsonb_build_object('customer_id', v_customer.id, 'account_id', v_account.id),
    'customer-upsert:' || v_customer.id::text || ':' || extract(epoch FROM clock_timestamp())::text
  );
  RETURN jsonb_build_object(
    'customer_id', v_customer.id, 'display_name', v_customer.display_name,
    'account_id', v_account.id, 'balance', v_account.balance,
    'credit_limit', v_account.credit_limit, 'currency', v_account.currency
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_customer_account_payment_v2(
  p_tenant_id UUID,
  p_customer_id UUID,
  p_amount NUMERIC,
  p_method TEXT,
  p_idempotency_key TEXT,
  p_register_id UUID DEFAULT NULL,
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
  v_method TEXT := CASE upper(COALESCE(btrim(p_method), ''))
    WHEN 'EFECTIVO' THEN 'CASH'
    WHEN 'TRANSFERENCIA' THEN 'BANK_TRANSFER'
    WHEN 'TARJETA' THEN 'CARD'
    WHEN 'MERCADOPAGO' THEN 'MERCADO_PAGO'
    ELSE upper(COALESCE(btrim(p_method), ''))
  END;
  v_account public.customer_accounts%ROWTYPE;
  v_existing public.accounts_receivable_ledger%ROWTYPE;
  v_session_id UUID;
  v_entry_id UUID;
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'VENDEDOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Rol operativo activo requerido para cobrar cuenta corriente.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR round(p_amount, 2) <> p_amount
     OR v_method NOT IN ('CASH', 'BANK_TRANSFER', 'CARD', 'MERCADO_PAGO', 'QR', 'OTHER')
     OR length(btrim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Cobranza de cuenta corriente invalida.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':ar-payment:' || p_idempotency_key, 0));

  SELECT ar.* INTO v_existing
  FROM public.accounts_receivable_ledger ar
  WHERE ar.tenant_id = p_tenant_id AND ar.idempotency_key = p_idempotency_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.customer_id <> p_customer_id OR v_existing.entry_type <> 'PAYMENT'
       OR v_existing.amount <> p_amount OR COALESCE(v_existing.metadata->>'method', '') <> v_method THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Colision de idempotencia en cobranza.';
    END IF;
    RETURN jsonb_build_object(
      'entry_id', v_existing.id, 'customer_id', p_customer_id,
      'amount', v_existing.amount, 'balance', v_existing.balance_after,
      'idempotent', true
    );
  END IF;

  SELECT ca.* INTO v_account
  FROM public.customer_accounts ca
  WHERE ca.tenant_id = p_tenant_id AND ca.customer_id = p_customer_id AND ca.status = 'ACTIVE'
  FOR UPDATE;
  IF v_account.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Cuenta corriente inexistente o inactiva.';
  END IF;
  IF p_amount > v_account.balance THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'La cobranza no puede superar el saldo pendiente.';
  END IF;

  IF v_method = 'CASH' THEN
    IF p_register_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Cobranza CASH requiere register_id.';
    END IF;
    SELECT cs.id INTO v_session_id
    FROM public.cash_sessions_v2 cs
    WHERE cs.tenant_id = p_tenant_id AND cs.register_id = p_register_id
      AND cs.status = 'OPEN' AND cs.opened_by = v_actor
    FOR UPDATE;
    IF v_session_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'No existe sesion OPEN propia para la cobranza CASH.';
    END IF;
  END IF;

  UPDATE public.customer_accounts
  SET balance = balance - p_amount, version = version + 1, updated_at = clock_timestamp()
  WHERE tenant_id = p_tenant_id AND id = v_account.id
  RETURNING * INTO v_account;
  INSERT INTO public.accounts_receivable_ledger (
    tenant_id, account_id, customer_id, entry_type, direction, amount,
    balance_after, currency, idempotency_key, actor_user_id, description, metadata
  ) VALUES (
    p_tenant_id, v_account.id, p_customer_id, 'PAYMENT', 'CREDIT', p_amount,
    v_account.balance, v_account.currency, p_idempotency_key, v_actor,
    COALESCE(NULLIF(btrim(p_notes), ''), 'Cobranza de cuenta corriente'),
    jsonb_build_object('method', v_method, 'register_id', p_register_id)
  ) RETURNING id INTO v_entry_id;

  IF v_method = 'CASH' THEN
    INSERT INTO public.cash_movements_v2 (
      tenant_id, session_id, movement_type, direction, amount, currency,
      payment_method, category, description, reference_type, reference_id,
      actor_user_id, idempotency_key, metadata
    ) VALUES (
      p_tenant_id, v_session_id, 'INCOME', 'IN', p_amount, v_account.currency,
      'CASH', 'ACCOUNT_RECEIVABLE', 'Cobranza de cuenta corriente',
      'AR_LEDGER', v_entry_id, v_actor, p_idempotency_key || ':cash',
      jsonb_build_object('customer_id', p_customer_id)
    );
  END IF;
  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'CUSTOMER_ACCOUNT_PAYMENT_RECORDED', 'AR_LEDGER', v_entry_id,
    jsonb_build_object('customer_id', p_customer_id, 'amount', p_amount,
      'method', v_method, 'balance_after', v_account.balance)
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'CUSTOMER_ACCOUNT', v_account.id, 'CUSTOMER_ACCOUNT_PAYMENT_RECORDED',
    jsonb_build_object('entry_id', v_entry_id, 'customer_id', p_customer_id,
      'amount', p_amount, 'balance_after', v_account.balance),
    p_idempotency_key || ':outbox'
  );
  RETURN jsonb_build_object(
    'entry_id', v_entry_id, 'account_id', v_account.id, 'customer_id', p_customer_id,
    'amount', p_amount, 'method', v_method, 'balance', v_account.balance,
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_inventory_v2(
  p_tenant_id UUID,
  p_product_id UUID,
  p_location_id UUID,
  p_quantity_delta NUMERIC,
  p_reason TEXT,
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
  v_role TEXT;
  v_reason TEXT := upper(COALESCE(btrim(p_reason), ''));
  v_existing public.inventory_ledger_v2%ROWTYPE;
  v_balance public.inventory_balances_v2%ROWTYPE;
  v_event_type TEXT;
BEGIN
  SELECT upper(tu.role) INTO v_role
  FROM public.tenant_users tu
  WHERE tu.tenant_id = p_tenant_id AND tu.user_id = v_actor AND tu.active = true
    AND upper(tu.role) IN ('ADMIN', 'SUPERVISOR', 'VENDEDOR');
  IF v_actor IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Rol operativo activo requerido para ajustar inventario.';
  END IF;
  IF p_quantity_delta IS NULL OR p_quantity_delta = 0 OR scale(p_quantity_delta) > 3
     OR length(v_reason) NOT BETWEEN 2 AND 120
     OR length(btrim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Ajuste de inventario invalido.';
  END IF;
  IF v_role = 'VENDEDOR' AND (
    p_quantity_delta > 0 OR v_reason NOT IN ('DAMAGE', 'SHRINKAGE', 'INTERNAL_USE')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'VENDEDOR solo puede registrar mermas por motivos permitidos.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':stock-adjust:' || p_idempotency_key, 0));

  SELECT il.* INTO v_existing
  FROM public.inventory_ledger_v2 il
  WHERE il.tenant_id = p_tenant_id AND il.idempotency_key = p_idempotency_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.product_id <> p_product_id OR v_existing.location_id <> p_location_id
       OR v_existing.quantity_delta <> p_quantity_delta
       OR COALESCE(v_existing.metadata->>'reason', '') <> v_reason THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Colision de idempotencia en ajuste de stock.';
    END IF;
    RETURN jsonb_build_object(
      'ledger_id', v_existing.id, 'product_id', p_product_id,
      'location_id', p_location_id, 'on_hand', v_existing.on_hand_after,
      'available', v_existing.on_hand_after - v_existing.reserved_after,
      'idempotent', true
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_products cp
    WHERE cp.tenant_id = p_tenant_id AND cp.id = p_product_id
      AND cp.active = true AND cp.track_stock = true
  ) OR NOT EXISTS (
    SELECT 1 FROM public.inventory_locations_v2 il
    WHERE il.tenant_id = p_tenant_id AND il.id = p_location_id AND il.active = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Producto o ubicacion invalidos para ajuste.';
  END IF;

  INSERT INTO public.inventory_balances_v2 (tenant_id, product_id, location_id)
  SELECT p_tenant_id, p_product_id, p_location_id
  WHERE p_quantity_delta > 0
  ON CONFLICT (tenant_id, product_id, location_id) DO NOTHING;
  SELECT ib.* INTO v_balance
  FROM public.inventory_balances_v2 ib
  WHERE ib.tenant_id = p_tenant_id AND ib.product_id = p_product_id AND ib.location_id = p_location_id
  FOR UPDATE;
  IF v_balance.product_id IS NULL OR v_balance.on_hand + p_quantity_delta < v_balance.reserved THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'El ajuste dejaria stock negativo o por debajo de reservas.';
  END IF;
  UPDATE public.inventory_balances_v2
  SET on_hand = on_hand + p_quantity_delta, version = version + 1, updated_at = clock_timestamp()
  WHERE tenant_id = p_tenant_id AND product_id = p_product_id AND location_id = p_location_id
  RETURNING * INTO v_balance;
  v_event_type := CASE WHEN p_quantity_delta > 0 THEN 'ADJUSTMENT_POSITIVE' ELSE 'ADJUSTMENT_NEGATIVE' END;
  INSERT INTO public.inventory_ledger_v2 (
    tenant_id, product_id, location_id, event_type, quantity_delta, reserved_delta,
    on_hand_after, reserved_after, reference_type, idempotency_key, actor_user_id, metadata
  ) VALUES (
    p_tenant_id, p_product_id, p_location_id, v_event_type, p_quantity_delta, 0,
    v_balance.on_hand, v_balance.reserved, 'INVENTORY_ADJUSTMENT', p_idempotency_key,
    v_actor, jsonb_build_object('reason', v_reason, 'notes', NULLIF(btrim(p_notes), ''))
  ) RETURNING * INTO v_existing;
  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'INVENTORY_ADJUSTED', 'INVENTORY_LEDGER_V2', v_existing.id,
    jsonb_build_object('product_id', p_product_id, 'location_id', p_location_id,
      'quantity_delta', p_quantity_delta, 'reason', v_reason, 'on_hand_after', v_balance.on_hand)
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'CATALOG_PRODUCT', p_product_id, 'INVENTORY_ADJUSTED',
    jsonb_build_object('location_id', p_location_id, 'quantity_delta', p_quantity_delta,
      'reason', v_reason, 'on_hand_after', v_balance.on_hand),
    p_idempotency_key || ':outbox'
  );
  RETURN jsonb_build_object(
    'ledger_id', v_existing.id, 'product_id', p_product_id, 'location_id', p_location_id,
    'on_hand', v_balance.on_hand, 'available', v_balance.available, 'idempotent', false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS: cada tabla tenant-scoped tiene una politica explicita.
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenant_app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_locations_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_balances_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_ledger_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_payments_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_events_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_receivable_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_orders_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservations_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_order_payment_events_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_app_config_public_read_v2 ON public.tenant_app_config;
CREATE POLICY tenant_app_config_public_read_v2 ON public.tenant_app_config
  FOR SELECT TO anon USING (stage = 'published');
DROP POLICY IF EXISTS tenant_app_config_member_read_v2 ON public.tenant_app_config;
CREATE POLICY tenant_app_config_member_read_v2 ON public.tenant_app_config
  FOR SELECT TO authenticated USING (public.operational_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS tenant_app_config_admin_write_v2 ON public.tenant_app_config;
CREATE POLICY tenant_app_config_admin_write_v2 ON public.tenant_app_config
  FOR ALL TO authenticated
  USING (public.operational_has_tenant_role(tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]))
  WITH CHECK (public.operational_has_tenant_role(tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]));

DROP POLICY IF EXISTS tenant_configurations_admin_read_v2 ON public.tenant_configurations;
CREATE POLICY tenant_configurations_admin_read_v2 ON public.tenant_configurations
  FOR SELECT TO authenticated
  USING (public.operational_has_tenant_role(tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]));

DROP POLICY IF EXISTS catalog_products_public_read_v2 ON public.catalog_products;
CREATE POLICY catalog_products_public_read_v2 ON public.catalog_products
  FOR SELECT TO anon USING (active = true);
DROP POLICY IF EXISTS catalog_products_member_read_v2 ON public.catalog_products;
CREATE POLICY catalog_products_member_read_v2 ON public.catalog_products
  FOR SELECT TO authenticated USING (public.operational_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS catalog_products_admin_write_v2 ON public.catalog_products;
CREATE POLICY catalog_products_admin_write_v2 ON public.catalog_products
  FOR ALL TO authenticated
  USING (public.operational_has_tenant_role(tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]))
  WITH CHECK (public.operational_has_tenant_role(tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]));

DROP POLICY IF EXISTS customers_member_read_v2 ON public.customers;
CREATE POLICY customers_member_read_v2 ON public.customers
  FOR SELECT TO authenticated USING (public.operational_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS customers_admin_write_v2 ON public.customers;
CREATE POLICY customers_admin_write_v2 ON public.customers
  FOR ALL TO authenticated
  USING (public.operational_has_tenant_role(tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]))
  WITH CHECK (public.operational_has_tenant_role(tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]));

DROP POLICY IF EXISTS customer_accounts_member_read_v2 ON public.customer_accounts;
CREATE POLICY customer_accounts_member_read_v2 ON public.customer_accounts
  FOR SELECT TO authenticated USING (public.operational_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS inventory_locations_member_read_v2 ON public.inventory_locations_v2;
CREATE POLICY inventory_locations_member_read_v2 ON public.inventory_locations_v2
  FOR SELECT TO authenticated USING (public.operational_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS inventory_locations_admin_write_v2 ON public.inventory_locations_v2;
CREATE POLICY inventory_locations_admin_write_v2 ON public.inventory_locations_v2
  FOR ALL TO authenticated
  USING (public.operational_has_tenant_role(tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]))
  WITH CHECK (public.operational_has_tenant_role(tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]));

DROP POLICY IF EXISTS inventory_balances_member_read_v2 ON public.inventory_balances_v2;
CREATE POLICY inventory_balances_member_read_v2 ON public.inventory_balances_v2
  FOR SELECT TO authenticated USING (public.operational_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS inventory_ledger_member_read_v2 ON public.inventory_ledger_v2;
CREATE POLICY inventory_ledger_member_read_v2 ON public.inventory_ledger_v2
  FOR SELECT TO authenticated USING (public.operational_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS cash_registers_member_read_v2 ON public.cash_registers;
CREATE POLICY cash_registers_member_read_v2 ON public.cash_registers
  FOR SELECT TO authenticated USING (public.operational_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS cash_registers_admin_write_v2 ON public.cash_registers;
CREATE POLICY cash_registers_admin_write_v2 ON public.cash_registers
  FOR ALL TO authenticated
  USING (public.operational_has_tenant_role(tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]))
  WITH CHECK (public.operational_has_tenant_role(tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]));

DROP POLICY IF EXISTS cash_sessions_member_read_v2 ON public.cash_sessions_v2;
CREATE POLICY cash_sessions_member_read_v2 ON public.cash_sessions_v2
  FOR SELECT TO authenticated USING (public.operational_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS sales_member_read_v2 ON public.sales_v2;
CREATE POLICY sales_member_read_v2 ON public.sales_v2
  FOR SELECT TO authenticated USING (public.operational_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS sale_items_member_read_v2 ON public.sale_items_v2;
CREATE POLICY sale_items_member_read_v2 ON public.sale_items_v2
  FOR SELECT TO authenticated USING (public.operational_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS sale_payments_member_read_v2 ON public.sale_payments_v2;
CREATE POLICY sale_payments_member_read_v2 ON public.sale_payments_v2
  FOR SELECT TO authenticated USING (public.operational_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS sale_events_member_read_v2 ON public.sale_events_v2;
CREATE POLICY sale_events_member_read_v2 ON public.sale_events_v2
  FOR SELECT TO authenticated USING (public.operational_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS cash_movements_member_read_v2 ON public.cash_movements_v2;
CREATE POLICY cash_movements_member_read_v2 ON public.cash_movements_v2
  FOR SELECT TO authenticated USING (public.operational_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS cash_closures_member_read_v2 ON public.cash_closures;
CREATE POLICY cash_closures_member_read_v2 ON public.cash_closures
  FOR SELECT TO authenticated USING (public.operational_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS ar_ledger_member_read_v2 ON public.accounts_receivable_ledger;
CREATE POLICY ar_ledger_member_read_v2 ON public.accounts_receivable_ledger
  FOR SELECT TO authenticated USING (public.operational_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS operational_audit_supervisor_read_v2 ON public.operational_audit_log;
CREATE POLICY operational_audit_supervisor_read_v2 ON public.operational_audit_log
  FOR SELECT TO authenticated
  USING (public.operational_has_tenant_role(tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]));
DROP POLICY IF EXISTS outbox_supervisor_read_v2 ON public.outbox_events;
CREATE POLICY outbox_supervisor_read_v2 ON public.outbox_events
  FOR SELECT TO authenticated
  USING (public.operational_has_tenant_role(tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]));

DROP POLICY IF EXISTS public_orders_service_v2 ON public.public_orders_v2;
CREATE POLICY public_orders_service_v2 ON public.public_orders_v2
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS inventory_reservations_service_v2 ON public.inventory_reservations_v2;
CREATE POLICY inventory_reservations_service_v2 ON public.inventory_reservations_v2
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS public_order_payments_service_v2 ON public.public_order_payment_events_v2;
CREATE POLICY public_order_payments_service_v2 ON public.public_order_payment_events_v2
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Privilegios: las mutaciones financieras pasan exclusivamente por RPC.
REVOKE ALL ON TABLE
  public.tenant_app_config, public.tenant_configurations, public.catalog_products,
  public.customers, public.customer_accounts, public.inventory_locations_v2,
  public.inventory_balances_v2, public.inventory_ledger_v2, public.cash_registers,
  public.cash_sessions_v2, public.sales_v2, public.sale_items_v2,
  public.sale_payments_v2, public.sale_events_v2, public.cash_movements_v2,
  public.cash_closures, public.accounts_receivable_ledger,
  public.operational_audit_log, public.outbox_events, public.public_orders_v2,
  public.inventory_reservations_v2, public.public_order_payment_events_v2
FROM anon, authenticated;

GRANT SELECT ON public.tenant_app_config, public.catalog_products TO anon;
GRANT SELECT ON
  public.tenant_app_config, public.tenant_configurations, public.catalog_products,
  public.customers, public.customer_accounts, public.inventory_locations_v2,
  public.inventory_balances_v2, public.inventory_ledger_v2, public.cash_registers,
  public.cash_sessions_v2, public.sales_v2, public.sale_items_v2,
  public.sale_payments_v2, public.sale_events_v2, public.cash_movements_v2,
  public.cash_closures, public.accounts_receivable_ledger,
  public.operational_audit_log, public.outbox_events
TO authenticated;
GRANT INSERT, UPDATE ON public.tenant_app_config, public.catalog_products,
  public.customers, public.inventory_locations_v2, public.cash_registers
TO authenticated;
GRANT ALL ON TABLE
  public.tenant_app_config, public.tenant_configurations, public.catalog_products,
  public.customers, public.customer_accounts, public.inventory_locations_v2,
  public.inventory_balances_v2, public.inventory_ledger_v2, public.cash_registers,
  public.cash_sessions_v2, public.sales_v2, public.sale_items_v2,
  public.sale_payments_v2, public.sale_events_v2, public.cash_movements_v2,
  public.cash_closures, public.accounts_receivable_ledger,
  public.operational_audit_log, public.outbox_events, public.public_orders_v2,
  public.inventory_reservations_v2, public.public_order_payment_events_v2
TO service_role;

REVOKE ALL ON FUNCTION public.checkout_sale_v2(UUID, TEXT, TEXT, JSONB, JSONB, UUID, UUID, UUID, UUID, TEXT, DATE, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.checkout_sale_v2(UUID, TEXT, TEXT, JSONB, JSONB, UUID, UUID, UUID, UUID, TEXT, DATE, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.open_cash_session_v2(UUID, UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_cash_movement_v2(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_cash_closure_v2(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_cash_closure_v2(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_cash_session_v2(UUID, UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_cash_movement_v2(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_cash_closure_v2(UUID, UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_cash_closure_v2(UUID, UUID, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.upsert_catalog_product_v2(UUID, TEXT, TEXT, NUMERIC, TEXT, BOOLEAN, JSONB, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.receive_inventory_v2(UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_customer_v2(UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_customer_account_payment_v2(UUID, UUID, NUMERIC, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.adjust_inventory_v2(UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_catalog_product_v2(UUID, TEXT, TEXT, NUMERIC, TEXT, BOOLEAN, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_inventory_v2(UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_customer_v2(UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_customer_account_payment_v2(UUID, UUID, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_v2(UUID, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.create_public_order_v2(UUID, TEXT, JSONB, JSONB, JSONB, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_public_order_payment_v2(UUID, TEXT, TEXT, NUMERIC, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_order_v2(UUID, TEXT, JSONB, JSONB, JSONB, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_public_order_payment_v2(UUID, TEXT, TEXT, NUMERIC, JSONB) TO service_role;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(100) NOT NULL,
  backward_compatible BOOLEAN NOT NULL DEFAULT true,
  applied_at TIMESTAMPTZ DEFAULT now(),
  applied_by VARCHAR(255) DEFAULT 'system'
);

INSERT INTO public.schema_migrations (version, name, checksum, backward_compatible, applied_by)
VALUES ('004', 'operational_core_and_config', 'sha256-operational-core-and-config-004-v1', true, 'migration-engine')
ON CONFLICT (version) DO NOTHING;

COMMIT;
