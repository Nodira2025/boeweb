BEGIN;

-- ---------------------------------------------------------------------------
-- Catálogo público mínimo. La tabla operativa conserva costos, actores y
-- metadata privada y deja de ser consultable por usuarios anónimos.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS catalog_products_public_read_v2 ON public.catalog_products;
REVOKE SELECT ON public.catalog_products FROM anon;

CREATE OR REPLACE VIEW public.public_catalog_products_v2
WITH (security_barrier = true)
AS
SELECT
  cp.tenant_id,
  cp.id,
  cp.sku,
  cp.barcode,
  cp.name,
  cp.description,
  cp.category,
  cp.price,
  cp.currency,
  NULLIF(COALESCE(cp.metadata->>'image_url', cp.metadata->>'image'), '') AS image_url,
  cp.track_stock,
  CASE
    WHEN cp.track_stock THEN COALESCE(sum(
      CASE
        WHEN il.active = true AND il.is_sellable = true
          THEN greatest(ib.on_hand - ib.reserved, 0)
        ELSE 0
      END
    ), 0)
    ELSE NULL
  END AS available_quantity
FROM public.catalog_products cp
LEFT JOIN public.inventory_balances_v2 ib
  ON ib.tenant_id = cp.tenant_id AND ib.product_id = cp.id
LEFT JOIN public.inventory_locations_v2 il
  ON il.tenant_id = ib.tenant_id AND il.id = ib.location_id
WHERE cp.active = true
  AND EXISTS (
    SELECT 1
    FROM public.tenant_app_config tac
    WHERE tac.tenant_id = cp.tenant_id AND tac.stage = 'published'
  )
GROUP BY
  cp.tenant_id, cp.id, cp.sku, cp.barcode, cp.name, cp.description,
  cp.category, cp.price, cp.currency, cp.metadata, cp.track_stock;

REVOKE ALL ON public.public_catalog_products_v2 FROM PUBLIC;
GRANT SELECT ON public.public_catalog_products_v2 TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Una venta web confirmada forma parte del mismo libro de ventas y pagos.
-- Los actores son obligatorios para POS y nulos únicamente para el canal web.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sales_v2
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'POS',
  ADD COLUMN IF NOT EXISTS source_order_id UUID,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.sales_v2 ALTER COLUMN cashier_user_id DROP NOT NULL;
ALTER TABLE public.sales_v2 ALTER COLUMN salesperson_user_id DROP NOT NULL;
ALTER TABLE public.sales_v2 DROP CONSTRAINT IF EXISTS sales_v2_channel_check;
ALTER TABLE public.sales_v2 ADD CONSTRAINT sales_v2_channel_check CHECK (
  (channel = 'POS' AND cashier_user_id IS NOT NULL AND salesperson_user_id IS NOT NULL AND source_order_id IS NULL)
  OR (channel = 'PUBLIC_ORDER' AND cashier_user_id IS NULL AND salesperson_user_id IS NULL AND source_order_id IS NOT NULL)
);
ALTER TABLE public.sales_v2 DROP CONSTRAINT IF EXISTS sales_v2_source_order_fk;
ALTER TABLE public.sales_v2 ADD CONSTRAINT sales_v2_source_order_fk
  FOREIGN KEY (tenant_id, source_order_id)
  REFERENCES public.public_orders_v2(tenant_id, id)
  ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS sales_v2_source_order_uidx
  ON public.sales_v2 (tenant_id, source_order_id)
  WHERE source_order_id IS NOT NULL;

ALTER TABLE public.public_orders_v2
  ADD COLUMN IF NOT EXISTS customer_id UUID,
  ADD COLUMN IF NOT EXISTS sale_id UUID;
ALTER TABLE public.public_orders_v2 DROP CONSTRAINT IF EXISTS public_orders_v2_customer_fk;
ALTER TABLE public.public_orders_v2 ADD CONSTRAINT public_orders_v2_customer_fk
  FOREIGN KEY (tenant_id, customer_id)
  REFERENCES public.customers(tenant_id, id)
  ON DELETE RESTRICT;
ALTER TABLE public.public_orders_v2 DROP CONSTRAINT IF EXISTS public_orders_v2_sale_fk;
ALTER TABLE public.public_orders_v2 ADD CONSTRAINT public_orders_v2_sale_fk
  FOREIGN KEY (tenant_id, sale_id)
  REFERENCES public.sales_v2(tenant_id, id)
  ON DELETE RESTRICT;

-- Los subeventos agregan sufijos a la clave externa. Se amplía únicamente el
-- almacenamiento derivado; las RPC siguen acotando el input del llamador.
ALTER TABLE public.inventory_ledger_v2 DROP CONSTRAINT IF EXISTS inventory_ledger_v2_idempotency_key_check;
ALTER TABLE public.inventory_ledger_v2 ADD CONSTRAINT inventory_ledger_v2_idempotency_key_length_v3
  CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 512);
ALTER TABLE public.cash_movements_v2 DROP CONSTRAINT IF EXISTS cash_movements_v2_idempotency_key_check;
ALTER TABLE public.cash_movements_v2 ADD CONSTRAINT cash_movements_v2_idempotency_key_length_v3
  CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 512);
ALTER TABLE public.accounts_receivable_ledger DROP CONSTRAINT IF EXISTS accounts_receivable_ledger_idempotency_key_check;
ALTER TABLE public.accounts_receivable_ledger ADD CONSTRAINT accounts_receivable_ledger_idempotency_key_length_v3
  CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 512);
ALTER TABLE public.outbox_events DROP CONSTRAINT IF EXISTS outbox_events_idempotency_key_check;
ALTER TABLE public.outbox_events ADD CONSTRAINT outbox_events_idempotency_key_length_v3
  CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 512);
ALTER TABLE public.inventory_reservations_v2 DROP CONSTRAINT IF EXISTS inventory_reservations_v2_idempotency_key_check;
ALTER TABLE public.inventory_reservations_v2 ADD CONSTRAINT inventory_reservations_v2_idempotency_key_length_v3
  CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 512);

CREATE OR REPLACE FUNCTION public.validate_external_sale_payment_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_role TEXT := COALESCE(auth.role(), current_setting('request.jwt.claim.role', true));
BEGIN
  IF NEW.transaction_type = 'PAYMENT'
     AND NEW.method IN ('CARD', 'MERCADO_PAGO', 'QR')
     AND v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'El pago externo requiere confirmacion verificable del backend/proveedor.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_external_sale_payment_v2 ON public.sale_payments_v2;
CREATE TRIGGER validate_external_sale_payment_v2
BEFORE INSERT ON public.sale_payments_v2
FOR EACH ROW EXECUTE FUNCTION public.validate_external_sale_payment_v2();

CREATE OR REPLACE FUNCTION public.validate_cash_movement_currency_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_register_currency CHAR(3);
BEGIN
  SELECT cr.currency INTO v_register_currency
  FROM public.cash_sessions_v2 cs
  JOIN public.cash_registers cr
    ON cr.tenant_id = cs.tenant_id AND cr.id = cs.register_id
  WHERE cs.tenant_id = NEW.tenant_id AND cs.id = NEW.session_id;
  IF v_register_currency IS NULL OR v_register_currency <> NEW.currency THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'La moneda del movimiento no coincide con la moneda de la caja.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_cash_movement_currency_v2 ON public.cash_movements_v2;
CREATE TRIGGER validate_cash_movement_currency_v2
BEFORE INSERT ON public.cash_movements_v2
FOR EACH ROW EXECUTE FUNCTION public.validate_cash_movement_currency_v2();

CREATE OR REPLACE FUNCTION public.validate_sale_item_location_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  IF NEW.location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations_v2 il
    WHERE il.tenant_id = NEW.tenant_id
      AND il.id = NEW.location_id
      AND il.active = true
      AND il.is_sellable = true
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'La venta apunta a una ubicacion inactiva o no vendible.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_sale_item_location_v2 ON public.sale_items_v2;
CREATE TRIGGER validate_sale_item_location_v2
BEFORE INSERT ON public.sale_items_v2
FOR EACH ROW EXECUTE FUNCTION public.validate_sale_item_location_v2();

CREATE OR REPLACE FUNCTION public.record_public_order_accounting_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_role TEXT := COALESCE(auth.role(), current_setting('request.jwt.claim.role', true));
  v_order public.public_orders_v2%ROWTYPE;
  v_sale public.sales_v2%ROWTYPE;
  v_original_payment public.sale_payments_v2%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_item JSONB;
  v_product public.catalog_products%ROWTYPE;
  v_location_id UUID;
  v_line_total NUMERIC(18,2);
  v_method TEXT;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'La contabilizacion web requiere service_role.';
  END IF;
  IF NEW.status NOT IN ('APPROVED', 'REFUNDED') THEN
    RETURN NEW;
  END IF;

  SELECT po.* INTO v_order
  FROM public.public_orders_v2 po
  WHERE po.tenant_id = NEW.tenant_id AND po.id = NEW.order_id
  FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Pedido web inexistente al contabilizar.';
  END IF;

  SELECT s.* INTO v_sale
  FROM public.sales_v2 s
  WHERE s.tenant_id = NEW.tenant_id AND s.source_order_id = NEW.order_id
  FOR UPDATE;

  IF NEW.status = 'APPROVED' THEN
    IF v_sale.id IS NOT NULL THEN
      RETURN NEW;
    END IF;
    IF NEW.amount IS NULL OR round(NEW.amount, 2) <> v_order.total THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'El pago web no coincide con el total del pedido.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(
      v_order.tenant_id::text || ':web-customer:' || lower(COALESCE(v_order.customer_email, v_order.customer_phone, v_order.id::text)),
      0
    ));
    SELECT c.* INTO v_customer
    FROM public.customers c
    WHERE c.tenant_id = v_order.tenant_id
      AND c.status = 'ACTIVE'
      AND (
        (v_order.customer_email IS NOT NULL AND lower(c.email) = lower(v_order.customer_email))
        OR (v_order.customer_phone IS NOT NULL AND c.phone = v_order.customer_phone)
      )
    ORDER BY c.created_at
    LIMIT 1
    FOR UPDATE;
    IF v_customer.id IS NULL THEN
      INSERT INTO public.customers (
        tenant_id, display_name, email, phone, status, metadata, created_by
      ) VALUES (
        v_order.tenant_id, v_order.customer_name, v_order.customer_email,
        v_order.customer_phone, 'ACTIVE',
        jsonb_build_object('source', 'PUBLIC_ORDER', 'first_order_id', v_order.id), NULL
      ) RETURNING * INTO v_customer;
    END IF;

    INSERT INTO public.sales_v2 (
      tenant_id, status, cashier_user_id, salesperson_user_id, customer_id,
      currency, subtotal, tax_amount, adjustment_type, adjustment_value,
      adjustment_amount, total, idempotency_key, payload_hash,
      request_fingerprint, notes, channel, source_order_id, metadata
    ) VALUES (
      v_order.tenant_id, 'CONFIRMED', NULL, NULL, v_customer.id,
      v_order.currency, v_order.subtotal, 0,
      CASE WHEN v_order.discount > 0 THEN 'DISCOUNT_FIXED' ELSE 'NONE' END,
      v_order.discount, -v_order.discount, v_order.total,
      'web-sale:' || v_order.id::text,
      encode(digest(convert_to('web-sale:' || v_order.id::text || ':' || NEW.provider_payment_id, 'UTF8'), 'sha256'), 'hex'),
      v_order.request_fingerprint, v_order.notes, 'PUBLIC_ORDER', v_order.id,
      jsonb_build_object(
        'order_number', v_order.order_number,
        'customer_name', v_order.customer_name,
        'customer_email', v_order.customer_email,
        'customer_phone', v_order.customer_phone,
        'delivery_type', v_order.delivery_type
      )
    ) RETURNING * INTO v_sale;

    UPDATE public.public_orders_v2
    SET customer_id = v_customer.id,
        sale_id = v_sale.id,
        provider_reference = NEW.provider_payment_id,
        updated_at = clock_timestamp()
    WHERE tenant_id = v_order.tenant_id AND id = v_order.id;

    FOR v_item IN SELECT value FROM jsonb_array_elements(v_order.items)
    LOOP
      SELECT cp.* INTO v_product
      FROM public.catalog_products cp
      WHERE cp.tenant_id = v_order.tenant_id AND cp.id = (v_item->>'product_id')::UUID;
      IF v_product.id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Producto web inexistente al contabilizar.';
      END IF;
      SELECT ir.location_id INTO v_location_id
      FROM public.inventory_reservations_v2 ir
      WHERE ir.tenant_id = v_order.tenant_id
        AND ir.order_id = v_order.id
        AND ir.product_id = v_product.id
        AND ir.status IN ('FULFILLED', 'REFUNDED')
      ORDER BY ir.created_at
      LIMIT 1;
      v_line_total := round((v_item->>'line_total')::NUMERIC, 2);
      INSERT INTO public.sale_items_v2 (
        tenant_id, sale_id, product_id, product_sku_snapshot, product_name_snapshot,
        quantity, unit_price, tax_rate, tax_amount, line_subtotal, line_total,
        location_id, metadata
      ) VALUES (
        v_order.tenant_id, v_sale.id, v_product.id,
        COALESCE(v_item->>'sku', v_product.sku), COALESCE(v_item->>'name', v_product.name),
        (v_item->>'quantity')::NUMERIC, (v_item->>'unit_price')::NUMERIC,
        0, 0, v_line_total, v_line_total, v_location_id,
        jsonb_build_object('public_order_id', v_order.id)
      );
    END LOOP;

    v_method := CASE upper(COALESCE(NEW.payment_provider, ''))
      WHEN 'MERCADO_PAGO' THEN 'MERCADO_PAGO'
      ELSE 'OTHER'
    END;
    INSERT INTO public.sale_payments_v2 (
      tenant_id, sale_id, transaction_type, method, amount, currency, status,
      provider_reference, metadata
    ) VALUES (
      v_order.tenant_id, v_sale.id, 'PAYMENT', v_method, NEW.amount,
      v_order.currency, 'CAPTURED', NEW.provider_payment_id,
      jsonb_build_object('verified_by_backend', true, 'payment_event_id', NEW.id)
    );
    INSERT INTO public.sale_events_v2 (
      tenant_id, sale_id, event_type, actor_user_id, reason, idempotency_key, metadata
    ) VALUES (
      v_order.tenant_id, v_sale.id, 'CREATED', NULL, 'Pago web aprobado',
      'web-sale-created:' || v_order.id::text,
      jsonb_build_object('payment_event_id', NEW.id)
    );
    INSERT INTO public.operational_audit_log (
      tenant_id, actor_user_id, action, entity_type, entity_id, after_data
    ) VALUES (
      v_order.tenant_id, NULL, 'PUBLIC_ORDER_SALE_RECORDED', 'SALE_V2', v_sale.id,
      jsonb_build_object('order_id', v_order.id, 'sale_number', v_sale.sale_number, 'total', v_sale.total)
    );
    INSERT INTO public.outbox_events (
      tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
    ) VALUES (
      v_order.tenant_id, 'SALE_V2', v_sale.id, 'PUBLIC_ORDER_SALE_RECORDED',
      jsonb_build_object('order_id', v_order.id, 'sale_id', v_sale.id, 'total', v_sale.total),
      'web-sale:' || v_order.id::text || ':outbox'
    );
    RETURN NEW;
  END IF;

  IF v_sale.id IS NULL OR v_sale.status = 'REFUNDED' THEN
    RETURN NEW;
  END IF;
  SELECT sp.* INTO v_original_payment
  FROM public.sale_payments_v2 sp
  WHERE sp.tenant_id = v_sale.tenant_id
    AND sp.sale_id = v_sale.id
    AND sp.transaction_type = 'PAYMENT'
  ORDER BY sp.created_at
  LIMIT 1;
  IF v_original_payment.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'La venta web no posee su pago original.';
  END IF;
  -- El contrato actual sólo permite reintegros completos. Un importe parcial no
  -- puede cerrar la venta porque rompería la conciliación de caja e inventario.
  IF NEW.amount IS NOT NULL
     AND NEW.amount > 0
     AND round(NEW.amount, 2) <> round(v_original_payment.amount, 2) THEN
    RAISE EXCEPTION USING ERRCODE = '0A000', MESSAGE = 'El reintegro parcial aun no esta soportado; use el importe total del pago original.';
  END IF;
  INSERT INTO public.sale_payments_v2 (
    tenant_id, sale_id, transaction_type, method, amount, currency, status,
    provider_reference, metadata
  ) VALUES (
    v_sale.tenant_id, v_sale.id, 'REFUND', v_original_payment.method,
    COALESCE(NULLIF(NEW.amount, 0), v_original_payment.amount), v_original_payment.currency,
    'REFUNDED', NEW.provider_payment_id || ':refund',
    jsonb_build_object('verified_by_backend', true, 'original_payment_id', v_original_payment.id, 'payment_event_id', NEW.id)
  );
  UPDATE public.sales_v2 SET status = 'REFUNDED'
  WHERE tenant_id = v_sale.tenant_id AND id = v_sale.id;
  INSERT INTO public.sale_events_v2 (
    tenant_id, sale_id, event_type, actor_user_id, reason, idempotency_key, metadata
  ) VALUES (
    v_sale.tenant_id, v_sale.id, 'REFUNDED', NULL, 'Reintegro web confirmado por proveedor',
    'web-sale-refund:' || NEW.id::text,
    jsonb_build_object('payment_event_id', NEW.id)
  );
  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    v_sale.tenant_id, NULL, 'PUBLIC_ORDER_SALE_REFUNDED', 'SALE_V2', v_sale.id,
    jsonb_build_object('order_id', v_order.id, 'status', 'REFUNDED', 'payment_event_id', NEW.id)
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    v_sale.tenant_id, 'SALE_V2', v_sale.id, 'PUBLIC_ORDER_SALE_REFUNDED',
    jsonb_build_object('order_id', v_order.id, 'sale_id', v_sale.id),
    'web-sale-refund:' || NEW.id::text || ':outbox'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS public_order_accounting_v2 ON public.public_order_payment_events_v2;
CREATE TRIGGER public_order_accounting_v2
AFTER INSERT ON public.public_order_payment_events_v2
FOR EACH ROW EXECUTE FUNCTION public.record_public_order_accounting_v2();

-- ---------------------------------------------------------------------------
-- Expiración real e idempotente de reservas abandonadas; invocada por cron
-- server-side. Libera reserved sin tocar on_hand.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_public_order_reservations_v2(
  p_limit INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_role TEXT := COALESCE(auth.role(), current_setting('request.jwt.claim.role', true));
  v_reservation public.inventory_reservations_v2%ROWTYPE;
  v_balance public.inventory_balances_v2%ROWTYPE;
  v_expired INTEGER := 0;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'La expiracion de reservas requiere service_role.';
  END IF;
  IF p_limit NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Limite de expiracion invalido.';
  END IF;

  FOR v_reservation IN
    SELECT ir.*
    FROM public.inventory_reservations_v2 ir
    JOIN public.public_orders_v2 po
      ON po.tenant_id = ir.tenant_id AND po.id = ir.order_id
    WHERE ir.status = 'ACTIVE'
      AND ir.expires_at <= clock_timestamp()
      AND po.status = 'PENDING_PAYMENT'
    ORDER BY ir.expires_at, ir.id
    LIMIT p_limit
    FOR UPDATE OF ir SKIP LOCKED
  LOOP
    SELECT ib.* INTO v_balance
    FROM public.inventory_balances_v2 ib
    WHERE ib.tenant_id = v_reservation.tenant_id
      AND ib.product_id = v_reservation.product_id
      AND ib.location_id = v_reservation.location_id
    FOR UPDATE;
    IF v_balance.product_id IS NULL OR v_balance.reserved < v_reservation.quantity THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Reserva inconsistente al expirar.';
    END IF;
    UPDATE public.inventory_balances_v2
    SET reserved = reserved - v_reservation.quantity,
        version = version + 1,
        updated_at = clock_timestamp()
    WHERE tenant_id = v_reservation.tenant_id
      AND product_id = v_reservation.product_id
      AND location_id = v_reservation.location_id
    RETURNING * INTO v_balance;
    UPDATE public.inventory_reservations_v2
    SET status = 'EXPIRED', released_at = clock_timestamp()
    WHERE tenant_id = v_reservation.tenant_id AND id = v_reservation.id;
    INSERT INTO public.inventory_ledger_v2 (
      tenant_id, product_id, location_id, event_type, quantity_delta, reserved_delta,
      on_hand_after, reserved_after, reference_type, reference_id, idempotency_key, metadata
    ) VALUES (
      v_reservation.tenant_id, v_reservation.product_id, v_reservation.location_id,
      'RELEASE', 0, -v_reservation.quantity, v_balance.on_hand, v_balance.reserved,
      'PUBLIC_ORDER_V2', v_reservation.order_id,
      'reservation-expired:' || v_reservation.id::text,
      jsonb_build_object('reason', 'PAYMENT_TIMEOUT')
    );
    UPDATE public.public_orders_v2
    SET status = 'EXPIRED', payment_status = 'CANCELLED', updated_at = clock_timestamp()
    WHERE tenant_id = v_reservation.tenant_id
      AND id = v_reservation.order_id
      AND status = 'PENDING_PAYMENT';
    INSERT INTO public.outbox_events (
      tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
    ) VALUES (
      v_reservation.tenant_id, 'PUBLIC_ORDER_V2', v_reservation.order_id,
      'PUBLIC_ORDER_EXPIRED', jsonb_build_object('order_id', v_reservation.order_id),
      'public-order-expired:' || v_reservation.order_id::text || ':outbox'
    ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
    v_expired := v_expired + 1;
  END LOOP;
  RETURN jsonb_build_object('expired_reservations', v_expired);
END;
$$;

CREATE INDEX IF NOT EXISTS cash_movements_v2_session_created_idx
  ON public.cash_movements_v2 (tenant_id, session_id, created_at);
CREATE INDEX IF NOT EXISTS sale_items_v2_sale_idx
  ON public.sale_items_v2 (tenant_id, sale_id);
CREATE INDEX IF NOT EXISTS sale_payments_v2_sale_idx
  ON public.sale_payments_v2 (tenant_id, sale_id, created_at);
CREATE INDEX IF NOT EXISTS inventory_reservations_v2_order_status_idx
  ON public.inventory_reservations_v2 (tenant_id, order_id, status);

REVOKE ALL ON FUNCTION public.expire_public_order_reservations_v2(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_public_order_reservations_v2(INTEGER) TO service_role;
GRANT ALL ON public.public_catalog_products_v2 TO service_role;

INSERT INTO public.schema_migrations (version, name, checksum, backward_compatible, applied_by)
VALUES ('007', 'security_accounting_contract', 'sha256-security-accounting-contract-007-v1', false, 'migration-engine')
ON CONFLICT (version) DO NOTHING;

COMMIT;
