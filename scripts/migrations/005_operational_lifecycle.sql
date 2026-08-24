BEGIN;

-- Extiende el nucleo v2 con comandos de ciclo de vida. Todas las mutaciones
-- sensibles pasan por funciones SECURITY DEFINER con autorizacion de tenant.

-- Permite conservar un crédito a favor si la cuenta ya fue cobrada antes de
-- anular la venta que originó la deuda. El límite continúa restringiendo sólo
-- el saldo deudor positivo.
ALTER TABLE public.customer_accounts
  DROP CONSTRAINT IF EXISTS customer_accounts_balance_check;
ALTER TABLE public.customer_accounts
  ADD CONSTRAINT customer_accounts_balance_check CHECK (balance <= credit_limit);

CREATE OR REPLACE FUNCTION public.upsert_inventory_location_v2(
  p_tenant_id UUID,
  p_code TEXT,
  p_name TEXT,
  p_location_type TEXT DEFAULT 'SHELF',
  p_is_sellable BOOLEAN DEFAULT true,
  p_is_default BOOLEAN DEFAULT false,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_location_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_location public.inventory_locations_v2%ROWTYPE;
  v_before JSONB;
  v_code TEXT := upper(btrim(COALESCE(p_code, '')));
  v_type TEXT := upper(btrim(COALESCE(p_location_type, 'SHELF')));
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo ADMIN o SUPERVISOR puede mantener ubicaciones.';
  END IF;
  IF length(v_code) NOT BETWEEN 1 AND 120
     OR length(btrim(COALESCE(p_name, ''))) NOT BETWEEN 1 AND 255
     OR v_type NOT IN ('WAREHOUSE', 'STORE', 'SHELF', 'BIN', 'QUARANTINE', 'DAMAGED')
     OR p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Datos de ubicacion invalidos.';
  END IF;

  SELECT il.* INTO v_location
  FROM public.inventory_locations_v2 il
  WHERE il.tenant_id = p_tenant_id
    AND ((p_location_id IS NOT NULL AND il.id = p_location_id) OR il.code = v_code)
  ORDER BY CASE WHEN il.id = p_location_id THEN 0 ELSE 1 END
  LIMIT 1
  FOR UPDATE;

  IF v_location.id IS NOT NULL AND p_location_id IS NOT NULL AND v_location.id <> p_location_id THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'El codigo pertenece a otra ubicacion.';
  END IF;

  IF p_is_default THEN
    UPDATE public.inventory_locations_v2
    SET is_default = false, updated_at = clock_timestamp()
    WHERE tenant_id = p_tenant_id
      AND is_default = true
      AND (v_location.id IS NULL OR id <> v_location.id);
  END IF;

  IF v_location.id IS NULL THEN
    INSERT INTO public.inventory_locations_v2 (
      tenant_id, id, code, name, location_type, is_sellable, is_default,
      active, metadata
    ) VALUES (
      p_tenant_id, COALESCE(p_location_id, gen_random_uuid()), v_code,
      btrim(p_name), v_type, p_is_sellable, p_is_default, true, p_metadata
    ) RETURNING * INTO v_location;
    v_before := NULL;
  ELSE
    v_before := to_jsonb(v_location);
    UPDATE public.inventory_locations_v2
    SET code = v_code,
        name = btrim(p_name),
        location_type = v_type,
        is_sellable = p_is_sellable,
        is_default = p_is_default,
        active = true,
        metadata = p_metadata,
        updated_at = clock_timestamp()
    WHERE tenant_id = p_tenant_id AND id = v_location.id
    RETURNING * INTO v_location;
  END IF;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'INVENTORY_LOCATION_UPSERTED', 'INVENTORY_LOCATION_V2',
    v_location.id, v_before, to_jsonb(v_location)
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'INVENTORY_LOCATION_V2', v_location.id, 'INVENTORY_LOCATION_UPSERTED',
    jsonb_build_object('location_id', v_location.id, 'code', v_location.code),
    'location-upsert:' || v_location.id::text || ':' || extract(epoch FROM clock_timestamp())::text
  );

  RETURN jsonb_build_object(
    'location_id', v_location.id,
    'code', v_location.code,
    'name', v_location.name,
    'location_type', v_location.location_type,
    'is_sellable', v_location.is_sellable,
    'is_default', v_location.is_default,
    'active', v_location.active
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_catalog_product_v2(
  p_tenant_id UUID,
  p_product_id UUID,
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
  v_product public.catalog_products%ROWTYPE;
  v_before JSONB;
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo ADMIN o SUPERVISOR puede archivar productos.';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Indique un motivo de archivo valido.';
  END IF;

  SELECT cp.* INTO v_product
  FROM public.catalog_products cp
  WHERE cp.tenant_id = p_tenant_id AND cp.id = p_product_id
  FOR UPDATE;
  IF v_product.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Producto inexistente o ajeno al tenant.';
  END IF;
  IF NOT v_product.active THEN
    RETURN jsonb_build_object('product_id', v_product.id, 'active', false, 'idempotent', true);
  END IF;

  v_before := to_jsonb(v_product);
  UPDATE public.catalog_products
  SET active = false, updated_by = v_actor, updated_at = clock_timestamp()
  WHERE tenant_id = p_tenant_id AND id = p_product_id
  RETURNING * INTO v_product;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data, metadata
  ) VALUES (
    p_tenant_id, v_actor, 'CATALOG_PRODUCT_ARCHIVED', 'CATALOG_PRODUCT', v_product.id,
    v_before, to_jsonb(v_product), jsonb_build_object('reason', btrim(p_reason))
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'CATALOG_PRODUCT', v_product.id, 'CATALOG_PRODUCT_ARCHIVED',
    jsonb_build_object('product_id', v_product.id, 'sku', v_product.sku, 'reason', btrim(p_reason)),
    'catalog-archive:' || v_product.id::text
  );
  RETURN jsonb_build_object('product_id', v_product.id, 'active', false, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_public_order_v2(
  p_tenant_id UUID,
  p_order_id UUID,
  p_new_status TEXT,
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
  v_order public.public_orders_v2%ROWTYPE;
  v_reservation public.inventory_reservations_v2%ROWTYPE;
  v_balance public.inventory_balances_v2%ROWTYPE;
  v_target TEXT := upper(btrim(COALESCE(p_new_status, '')));
  v_existing_outbox public.outbox_events%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'VENDEDOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Rol operativo activo requerido para gestionar pedidos.';
  END IF;
  IF v_target NOT IN ('PREPARING', 'READY', 'DELIVERED', 'CANCELLED')
     OR length(btrim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Transicion o idempotency key invalidas.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':order-transition:' || p_idempotency_key, 0));
  SELECT oe.* INTO v_existing_outbox
  FROM public.outbox_events oe
  WHERE oe.tenant_id = p_tenant_id AND oe.idempotency_key = p_idempotency_key || ':outbox';
  IF v_existing_outbox.id IS NOT NULL THEN
    IF v_existing_outbox.aggregate_id <> p_order_id
       OR v_existing_outbox.event_type <> 'PUBLIC_ORDER_' || v_target THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Colision de idempotencia en transicion de pedido.';
    END IF;
    SELECT po.* INTO v_order FROM public.public_orders_v2 po
    WHERE po.tenant_id = p_tenant_id AND po.id = p_order_id;
    RETURN jsonb_build_object('order_id', p_order_id, 'status', v_order.status, 'idempotent', true);
  END IF;

  SELECT po.* INTO v_order
  FROM public.public_orders_v2 po
  WHERE po.tenant_id = p_tenant_id AND po.id = p_order_id
  FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Pedido inexistente o ajeno al tenant.';
  END IF;
  IF v_order.status = v_target THEN
    RETURN jsonb_build_object('order_id', v_order.id, 'status', v_order.status, 'idempotent', true);
  END IF;
  IF NOT (
    (v_order.status = 'CONFIRMED' AND v_target = 'PREPARING')
    OR (v_order.status = 'PREPARING' AND v_target = 'READY')
    OR (v_order.status = 'READY' AND v_target = 'DELIVERED')
    OR (v_order.status = 'PENDING_PAYMENT' AND v_target = 'CANCELLED')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = format(
      'Transicion de pedido no permitida: %s -> %s.', v_order.status, v_target
    );
  END IF;

  IF v_target = 'CANCELLED' THEN
    FOR v_reservation IN
      SELECT ir.* FROM public.inventory_reservations_v2 ir
      WHERE ir.tenant_id = p_tenant_id AND ir.order_id = p_order_id AND ir.status = 'ACTIVE'
      FOR UPDATE
    LOOP
      SELECT ib.* INTO v_balance
      FROM public.inventory_balances_v2 ib
      WHERE ib.tenant_id = p_tenant_id
        AND ib.product_id = v_reservation.product_id
        AND ib.location_id = v_reservation.location_id
      FOR UPDATE;
      IF v_balance.product_id IS NULL OR v_balance.reserved < v_reservation.quantity THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Reserva inconsistente al cancelar el pedido.';
      END IF;
      UPDATE public.inventory_balances_v2
      SET reserved = reserved - v_reservation.quantity,
          version = version + 1,
          updated_at = clock_timestamp()
      WHERE tenant_id = p_tenant_id
        AND product_id = v_reservation.product_id
        AND location_id = v_reservation.location_id
      RETURNING * INTO v_balance;
      UPDATE public.inventory_reservations_v2
      SET status = 'CANCELLED', released_at = clock_timestamp()
      WHERE tenant_id = p_tenant_id AND id = v_reservation.id;
      INSERT INTO public.inventory_ledger_v2 (
        tenant_id, product_id, location_id, event_type, quantity_delta, reserved_delta,
        on_hand_after, reserved_after, reference_type, reference_id,
        idempotency_key, actor_user_id, metadata
      ) VALUES (
        p_tenant_id, v_reservation.product_id, v_reservation.location_id,
        'RELEASE', 0, -v_reservation.quantity, v_balance.on_hand, v_balance.reserved,
        'PUBLIC_ORDER_V2', p_order_id,
        p_idempotency_key || ':release:' || v_reservation.id::text,
        v_actor, jsonb_build_object('reason', 'OPERATOR_CANCELLED')
      );
    END LOOP;
  END IF;

  UPDATE public.public_orders_v2
  SET status = v_target,
      payment_status = CASE WHEN v_target = 'CANCELLED' THEN 'CANCELLED' ELSE payment_status END,
      notes = CASE WHEN NULLIF(btrim(COALESCE(p_notes, '')), '') IS NULL THEN notes
        ELSE concat_ws(E'\n', notes, '[' || clock_timestamp()::text || '] ' || btrim(p_notes)) END,
      updated_at = clock_timestamp()
  WHERE tenant_id = p_tenant_id AND id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data, metadata
  ) VALUES (
    p_tenant_id, v_actor, 'PUBLIC_ORDER_' || v_target, 'PUBLIC_ORDER_V2', p_order_id,
    jsonb_build_object('status', v_target, 'payment_status', v_order.payment_status),
    jsonb_build_object('notes', NULLIF(btrim(COALESCE(p_notes, '')), ''))
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'PUBLIC_ORDER_V2', p_order_id, 'PUBLIC_ORDER_' || v_target,
    jsonb_build_object('order_id', p_order_id, 'order_number', v_order.order_number, 'status', v_target),
    p_idempotency_key || ':outbox'
  );
  RETURN jsonb_build_object('order_id', p_order_id, 'status', v_target, 'idempotent', false);
END;
$$;

-- Una devolucion confirmada por el proveedor de pago repone stock exactamente
-- una vez. La unicidad del evento de pago evita duplicados de webhook.
ALTER TABLE public.inventory_reservations_v2
  DROP CONSTRAINT IF EXISTS inventory_reservations_v2_status_check;
ALTER TABLE public.inventory_reservations_v2
  ADD CONSTRAINT inventory_reservations_v2_status_check
  CHECK (status IN ('ACTIVE', 'FULFILLED', 'RELEASED', 'EXPIRED', 'CANCELLED', 'REFUNDED'));

CREATE OR REPLACE FUNCTION public.restore_public_order_inventory_on_refund_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_reservation public.inventory_reservations_v2%ROWTYPE;
  v_balance public.inventory_balances_v2%ROWTYPE;
BEGIN
  IF NEW.status <> 'REFUNDED' THEN
    RETURN NEW;
  END IF;

  FOR v_reservation IN
    SELECT ir.* FROM public.inventory_reservations_v2 ir
    WHERE ir.tenant_id = NEW.tenant_id AND ir.order_id = NEW.order_id
      AND ir.status IN ('ACTIVE', 'FULFILLED')
    FOR UPDATE
  LOOP
    SELECT ib.* INTO v_balance
    FROM public.inventory_balances_v2 ib
    WHERE ib.tenant_id = v_reservation.tenant_id
      AND ib.product_id = v_reservation.product_id
      AND ib.location_id = v_reservation.location_id
    FOR UPDATE;
    IF v_balance.product_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Balance inexistente al procesar devolucion publica.';
    END IF;

    IF v_reservation.status = 'ACTIVE' THEN
      IF v_balance.reserved < v_reservation.quantity THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Reserva inconsistente al procesar devolucion publica.';
      END IF;
      UPDATE public.inventory_balances_v2
      SET reserved = reserved - v_reservation.quantity,
          version = version + 1,
          updated_at = clock_timestamp()
      WHERE tenant_id = v_reservation.tenant_id
        AND product_id = v_reservation.product_id
        AND location_id = v_reservation.location_id
      RETURNING * INTO v_balance;
    ELSE
      UPDATE public.inventory_balances_v2
      SET on_hand = on_hand + v_reservation.quantity,
          version = version + 1,
          updated_at = clock_timestamp()
      WHERE tenant_id = v_reservation.tenant_id
        AND product_id = v_reservation.product_id
        AND location_id = v_reservation.location_id
      RETURNING * INTO v_balance;
    END IF;

    UPDATE public.inventory_reservations_v2
    SET status = 'REFUNDED', released_at = clock_timestamp()
    WHERE tenant_id = v_reservation.tenant_id AND id = v_reservation.id;
    INSERT INTO public.inventory_ledger_v2 (
      tenant_id, product_id, location_id, event_type, quantity_delta, reserved_delta,
      on_hand_after, reserved_after, reference_type, reference_id, idempotency_key, metadata
    ) VALUES (
      v_reservation.tenant_id, v_reservation.product_id, v_reservation.location_id,
      CASE WHEN v_reservation.status = 'FULFILLED' THEN 'REFUND' ELSE 'RELEASE' END,
      CASE WHEN v_reservation.status = 'FULFILLED' THEN v_reservation.quantity ELSE 0 END,
      CASE WHEN v_reservation.status = 'ACTIVE' THEN -v_reservation.quantity ELSE 0 END,
      v_balance.on_hand, v_balance.reserved, 'PUBLIC_ORDER_V2', NEW.order_id,
      'public-refund:' || NEW.provider_payment_id || ':' || v_reservation.id::text,
      jsonb_build_object('payment_event_id', NEW.id)
    );
  END LOOP;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    NEW.tenant_id, NULL, 'PUBLIC_ORDER_INVENTORY_REFUNDED', 'PUBLIC_ORDER_V2', NEW.order_id,
    jsonb_build_object('payment_event_id', NEW.id, 'provider_payment_id', NEW.provider_payment_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS public_order_refund_inventory_v2 ON public.public_order_payment_events_v2;
CREATE TRIGGER public_order_refund_inventory_v2
AFTER INSERT ON public.public_order_payment_events_v2
FOR EACH ROW EXECUTE FUNCTION public.restore_public_order_inventory_on_refund_v2();

-- Anulacion completa y atomica para pagos internos (efectivo y cuenta corriente).
-- Los pagos externos se rechazan: primero deben devolverse en su proveedor.
CREATE OR REPLACE FUNCTION public.void_sale_v2(
  p_tenant_id UUID,
  p_sale_id UUID,
  p_reason TEXT,
  p_idempotency_key TEXT,
  p_register_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_sale public.sales_v2%ROWTYPE;
  v_event public.sale_events_v2%ROWTYPE;
  v_item public.sale_items_v2%ROWTYPE;
  v_payment public.sale_payments_v2%ROWTYPE;
  v_balance public.inventory_balances_v2%ROWTYPE;
  v_account public.customer_accounts%ROWTYPE;
  v_session_id UUID;
  v_refund_payment_id UUID;
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo ADMIN o SUPERVISOR puede anular ventas.';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 5 AND 1000
     OR length(btrim(COALESCE(p_idempotency_key, ''))) NOT BETWEEN 8 AND 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Motivo o idempotency key invalidos.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':void-sale:' || p_idempotency_key, 0));

  SELECT se.* INTO v_event
  FROM public.sale_events_v2 se
  WHERE se.tenant_id = p_tenant_id AND se.idempotency_key = p_idempotency_key;
  IF v_event.id IS NOT NULL THEN
    IF v_event.sale_id <> p_sale_id OR v_event.event_type <> 'VOIDED' THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Colision de idempotencia en anulacion.';
    END IF;
    SELECT s.* INTO v_sale FROM public.sales_v2 s
    WHERE s.tenant_id = p_tenant_id AND s.id = p_sale_id;
    RETURN jsonb_build_object('sale_id', p_sale_id, 'status', v_sale.status, 'idempotent', true);
  END IF;

  SELECT s.* INTO v_sale
  FROM public.sales_v2 s
  WHERE s.tenant_id = p_tenant_id AND s.id = p_sale_id
  FOR UPDATE;
  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Venta inexistente o ajena al tenant.';
  END IF;
  IF v_sale.status <> 'CONFIRMED' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Solo puede anularse una venta CONFIRMED.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.sale_payments_v2 sp
    WHERE sp.tenant_id = p_tenant_id AND sp.sale_id = p_sale_id
      AND sp.transaction_type = 'PAYMENT'
      AND sp.method NOT IN ('CASH', 'ACCOUNT_CREDIT')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'La venta contiene pagos externos; confirme primero su devolucion en el proveedor.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sale_payments_v2 sp
    WHERE sp.tenant_id = p_tenant_id AND sp.sale_id = p_sale_id
      AND sp.transaction_type = 'PAYMENT' AND sp.method = 'CASH'
  ) THEN
    IF p_register_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La anulacion con efectivo requiere una caja abierta.';
    END IF;
    SELECT cs.id INTO v_session_id
    FROM public.cash_sessions_v2 cs
    WHERE cs.tenant_id = p_tenant_id AND cs.register_id = p_register_id AND cs.status = 'OPEN'
    FOR UPDATE;
    IF v_session_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'No existe una caja OPEN para devolver efectivo.';
    END IF;
  END IF;

  FOR v_item IN
    SELECT si.* FROM public.sale_items_v2 si
    WHERE si.tenant_id = p_tenant_id AND si.sale_id = p_sale_id
    ORDER BY si.id
  LOOP
    IF v_item.location_id IS NOT NULL THEN
      SELECT ib.* INTO v_balance
      FROM public.inventory_balances_v2 ib
      WHERE ib.tenant_id = p_tenant_id
        AND ib.product_id = v_item.product_id
        AND ib.location_id = v_item.location_id
      FOR UPDATE;
      IF v_balance.product_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'No existe el balance original para reponer la venta.';
      END IF;
      UPDATE public.inventory_balances_v2
      SET on_hand = on_hand + v_item.quantity,
          version = version + 1,
          updated_at = clock_timestamp()
      WHERE tenant_id = p_tenant_id
        AND product_id = v_item.product_id
        AND location_id = v_item.location_id
      RETURNING * INTO v_balance;
      INSERT INTO public.inventory_ledger_v2 (
        tenant_id, product_id, location_id, event_type, quantity_delta, reserved_delta,
        on_hand_after, reserved_after, reference_type, reference_id,
        idempotency_key, actor_user_id, metadata
      ) VALUES (
        p_tenant_id, v_item.product_id, v_item.location_id, 'VOID', v_item.quantity, 0,
        v_balance.on_hand, v_balance.reserved, 'SALE_V2', p_sale_id,
        p_idempotency_key || ':stock:' || v_item.id::text, v_actor,
        jsonb_build_object('sale_item_id', v_item.id, 'reason', btrim(p_reason))
      );
    END IF;
  END LOOP;

  FOR v_payment IN
    SELECT sp.* FROM public.sale_payments_v2 sp
    WHERE sp.tenant_id = p_tenant_id AND sp.sale_id = p_sale_id
      AND sp.transaction_type = 'PAYMENT'
    ORDER BY sp.id
  LOOP
    IF v_payment.method = 'ACCOUNT_CREDIT' THEN
      SELECT ca.* INTO v_account
      FROM public.customer_accounts ca
      WHERE ca.tenant_id = p_tenant_id AND ca.id = v_payment.customer_account_id
      FOR UPDATE;
      IF v_account.id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Cuenta corriente de la venta inexistente.';
      END IF;
      UPDATE public.customer_accounts
      SET balance = balance - v_payment.amount,
          version = version + 1,
          updated_at = clock_timestamp()
      WHERE tenant_id = p_tenant_id AND id = v_account.id
      RETURNING * INTO v_account;
    END IF;

    INSERT INTO public.sale_payments_v2 (
      tenant_id, sale_id, transaction_type, method, amount, currency, status,
      cash_session_id, customer_account_id, metadata
    ) VALUES (
      p_tenant_id, p_sale_id, 'VOID', v_payment.method, v_payment.amount, v_payment.currency,
      'CAPTURED', CASE WHEN v_payment.method = 'CASH' THEN v_session_id ELSE NULL END,
      v_payment.customer_account_id,
      jsonb_build_object('original_payment_id', v_payment.id, 'reason', btrim(p_reason))
    ) RETURNING id INTO v_refund_payment_id;

    IF v_payment.method = 'CASH' THEN
      INSERT INTO public.cash_movements_v2 (
        tenant_id, session_id, movement_type, direction, sale_id, amount, currency,
        payment_method, category, description, reference_type, reference_id,
        actor_user_id, idempotency_key, metadata
      ) VALUES (
        p_tenant_id, v_session_id, 'REVERSAL', 'OUT', p_sale_id, v_payment.amount,
        v_payment.currency, 'CASH', 'SALE_VOID', 'Devolucion por anulacion de venta ' || v_sale.sale_number,
        'SALE_V2', p_sale_id, v_actor,
        p_idempotency_key || ':cash:' || v_payment.id::text,
        jsonb_build_object('void_payment_id', v_refund_payment_id)
      );
    ELSE
      INSERT INTO public.accounts_receivable_ledger (
        tenant_id, account_id, customer_id, entry_type, direction, amount,
        balance_after, currency, sale_id, payment_id, idempotency_key,
        actor_user_id, description, metadata
      ) VALUES (
        p_tenant_id, v_account.id, v_sale.customer_id, 'VOID', 'CREDIT', v_payment.amount,
        v_account.balance, v_payment.currency, p_sale_id, v_refund_payment_id,
        p_idempotency_key || ':ar:' || v_payment.id::text,
        v_actor, 'Nota de credito por anulacion de venta ' || v_sale.sale_number,
        jsonb_build_object('original_payment_id', v_payment.id)
      );
    END IF;
  END LOOP;

  UPDATE public.sales_v2 SET status = 'VOIDED'
  WHERE tenant_id = p_tenant_id AND id = p_sale_id
  RETURNING * INTO v_sale;
  INSERT INTO public.sale_events_v2 (
    tenant_id, sale_id, event_type, actor_user_id, reason, idempotency_key, metadata
  ) VALUES (
    p_tenant_id, p_sale_id, 'VOIDED', v_actor, btrim(p_reason), p_idempotency_key,
    jsonb_build_object('register_id', p_register_id)
  );
  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data, metadata
  ) VALUES (
    p_tenant_id, v_actor, 'SALE_VOIDED', 'SALE_V2', p_sale_id,
    jsonb_build_object('status', 'VOIDED', 'sale_number', v_sale.sale_number, 'total', v_sale.total),
    jsonb_build_object('reason', btrim(p_reason))
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'SALE_V2', p_sale_id, 'SALE_VOIDED',
    jsonb_build_object('sale_id', p_sale_id, 'sale_number', v_sale.sale_number, 'total', v_sale.total),
    p_idempotency_key || ':outbox'
  );
  RETURN jsonb_build_object('sale_id', p_sale_id, 'status', 'VOIDED', 'idempotent', false);
END;
$$;

DROP POLICY IF EXISTS public_orders_member_read_v2 ON public.public_orders_v2;
CREATE POLICY public_orders_member_read_v2 ON public.public_orders_v2
  FOR SELECT TO authenticated USING (public.operational_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS inventory_reservations_member_read_v2 ON public.inventory_reservations_v2;
CREATE POLICY inventory_reservations_member_read_v2 ON public.inventory_reservations_v2
  FOR SELECT TO authenticated USING (public.operational_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS public_order_payments_supervisor_read_v2 ON public.public_order_payment_events_v2;
CREATE POLICY public_order_payments_supervisor_read_v2 ON public.public_order_payment_events_v2
  FOR SELECT TO authenticated
  USING (public.operational_has_tenant_role(tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]));

GRANT SELECT ON public.public_orders_v2, public.inventory_reservations_v2 TO authenticated;
GRANT SELECT ON public.public_order_payment_events_v2 TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.catalog_products, public.customers,
  public.inventory_locations_v2 FROM authenticated;

REVOKE ALL ON FUNCTION public.upsert_inventory_location_v2(UUID, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, JSONB, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_catalog_product_v2(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transition_public_order_v2(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_sale_v2(UUID, UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_inventory_location_v2(UUID, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_catalog_product_v2(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_public_order_v2(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_sale_v2(UUID, UUID, TEXT, TEXT, UUID) TO authenticated;

INSERT INTO public.schema_migrations (version, name, checksum, backward_compatible, applied_by)
VALUES ('005', 'operational_lifecycle', 'sha256-operational-lifecycle-005-v1', false, 'migration-engine')
ON CONFLICT (version) DO NOTHING;

COMMIT;
