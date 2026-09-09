-- BÔ GROW CLUB — MIGRACIÓN 024: PAGOS ASOCIADOS AL TURNO OPERATIVO
-- cash_session_id conserva su semántica física y sólo se completa para CASH.
-- operational_session_id identifica el turno en el que se registró cualquier
-- medio de pago, permitiendo conciliar efectivo, transferencias, tarjetas,
-- Mercado Pago, QR y cuenta corriente en una misma planilla.

BEGIN;

DO $migration$
BEGIN
  IF pg_catalog.to_regclass('public.sale_payments_v2') IS NULL
     OR pg_catalog.to_regclass('public.cash_sessions_v2') IS NULL
     OR pg_catalog.to_regclass('public.sales_v2') IS NULL THEN
    RAISE EXCEPTION 'Faltan tablas operativas requeridas para vincular pagos y turnos.';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.checkout_sale_v3(uuid,text,text,jsonb,jsonb,uuid,uuid,uuid,uuid,text,date,jsonb,uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Falta checkout_sale_v3; aplique primero la migración 012.';
  END IF;
END;
$migration$;

ALTER TABLE public.sale_payments_v2
  ADD COLUMN IF NOT EXISTS operational_session_id UUID;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint constraint_row
    WHERE constraint_row.conrelid = 'public.sale_payments_v2'::regclass
      AND constraint_row.conname = 'sale_payments_v2_operational_session_fk'
  ) THEN
    ALTER TABLE public.sale_payments_v2
      ADD CONSTRAINT sale_payments_v2_operational_session_fk
      FOREIGN KEY (tenant_id, operational_session_id)
      REFERENCES public.cash_sessions_v2(tenant_id, id)
      ON DELETE RESTRICT;
  END IF;
END;
$migration$;

CREATE INDEX IF NOT EXISTS sale_payments_v2_operational_session_idx
  ON public.sale_payments_v2 (tenant_id, operational_session_id, created_at)
  WHERE operational_session_id IS NOT NULL;

-- La tabla es append-only durante la operación normal. Esta migración necesita
-- completar una nueva referencia derivada en filas históricas; se suspende sólo
-- el trigger que impide UPDATE y se lo restaura dentro de la misma transacción.
-- Si cualquier sentencia falla, PostgreSQL revierte también este cambio de estado.
ALTER TABLE public.sale_payments_v2
  DISABLE TRIGGER sale_payments_v2_append_only_v2;

-- El vínculo físico existente es inequívoco para pagos y devoluciones CASH.
UPDATE public.sale_payments_v2
SET operational_session_id = cash_session_id
WHERE operational_session_id IS NULL
  AND cash_session_id IS NOT NULL;

-- Backfill conservador para pagos digitales históricos: sólo se asigna cuando
-- existe exactamente un turno del cajero que contiene el instante del pago.
-- Las filas ambiguas quedan NULL para revisión, nunca se adivina una caja.
WITH session_matches AS (
  SELECT
    payment.tenant_id,
    payment.id AS payment_id,
    (pg_catalog.array_agg(session_row.id ORDER BY session_row.opened_at DESC))[1] AS session_id,
    pg_catalog.count(*) AS match_count
  FROM public.sale_payments_v2 payment
  JOIN public.sales_v2 sale
    ON sale.tenant_id = payment.tenant_id
   AND sale.id = payment.sale_id
  JOIN public.cash_sessions_v2 session_row
    ON session_row.tenant_id = sale.tenant_id
   AND session_row.opened_by = sale.cashier_user_id
   AND payment.created_at >= session_row.opened_at
   AND payment.created_at <= COALESCE(session_row.closed_at, 'infinity'::timestamptz)
  WHERE payment.operational_session_id IS NULL
    AND payment.transaction_type = 'PAYMENT'
    AND sale.cashier_user_id IS NOT NULL
  GROUP BY payment.tenant_id, payment.id
)
UPDATE public.sale_payments_v2 payment
SET operational_session_id = session_matches.session_id
FROM session_matches
WHERE payment.tenant_id = session_matches.tenant_id
  AND payment.id = session_matches.payment_id
  AND session_matches.match_count = 1;

-- Las anulaciones/reintegros se resuelven después del backfill de cobros para
-- que también puedan heredar turnos digitales recuperados en el paso anterior.
UPDATE public.sale_payments_v2 reversal
SET operational_session_id = original.operational_session_id
FROM public.sale_payments_v2 original
WHERE reversal.operational_session_id IS NULL
  AND reversal.tenant_id = original.tenant_id
  AND reversal.transaction_type IN ('VOID', 'REFUND')
  AND reversal.metadata->>'original_payment_id' = original.id::text
  AND original.operational_session_id IS NOT NULL;

ALTER TABLE public.sale_payments_v2
  ENABLE TRIGGER sale_payments_v2_append_only_v2;

-- checkout_sale_v3 ya bloquea y valida v_session_id. Se amplía únicamente la
-- inserción de sale_payments_v2 para persistir ese mismo turno en todo medio.
DO $migration$
DECLARE
  v_signature CONSTANT TEXT := 'public.checkout_sale_v3(uuid,text,text,jsonb,jsonb,uuid,uuid,uuid,uuid,text,date,jsonb,uuid)';
  v_target REGPROCEDURE;
  v_definition TEXT;
  v_old_payment_columns CONSTANT TEXT := $patch$status, cash_session_id, customer_account_id, provider_reference, metadata
    ) VALUES ($patch$;
  v_new_payment_columns CONSTANT TEXT := $patch$status, cash_session_id, operational_session_id, customer_account_id, provider_reference, metadata
    ) VALUES ($patch$;
  v_old_payment_values CONSTANT TEXT := $patch$'CAPTURED', CASE WHEN v_payment_method = 'CASH' THEN v_session_id ELSE NULL END,
      CASE WHEN v_payment_method = 'ACCOUNT_CREDIT' THEN v_account.id END,$patch$;
  v_new_payment_values CONSTANT TEXT := $patch$'CAPTURED', CASE WHEN v_payment_method = 'CASH' THEN v_session_id ELSE NULL END,
      v_session_id,
      CASE WHEN v_payment_method = 'ACCOUNT_CREDIT' THEN v_account.id END,$patch$;
BEGIN
  v_target := pg_catalog.to_regprocedure(v_signature);
  SELECT pg_catalog.pg_get_functiondef(v_target) INTO v_definition;

  IF pg_catalog.strpos(v_definition, v_new_payment_columns) > 0
     AND pg_catalog.strpos(v_definition, v_new_payment_values) > 0 THEN
    NULL;
  ELSIF pg_catalog.strpos(v_definition, v_old_payment_columns) > 0
        AND pg_catalog.strpos(v_definition, v_old_payment_values) > 0 THEN
    v_definition := pg_catalog.replace(v_definition, v_old_payment_columns, v_new_payment_columns);
    v_definition := pg_catalog.replace(v_definition, v_old_payment_values, v_new_payment_values);
    EXECUTE v_definition;
  ELSE
    RAISE EXCEPTION 'checkout_sale_v3 no coincide con la versión 017 esperada; se aborta sin modificarla.';
  END IF;

  v_target := pg_catalog.to_regprocedure(v_signature);
  SELECT pg_catalog.pg_get_functiondef(v_target) INTO v_definition;
  IF pg_catalog.strpos(v_definition, v_new_payment_columns) = 0
     OR pg_catalog.strpos(v_definition, v_new_payment_values) = 0 THEN
    RAISE EXCEPTION 'checkout_sale_v3 no conservó el vínculo operativo del pago.';
  END IF;
END;
$migration$;

-- Los eventos compensatorios creados por funciones de ciclo de vida heredan el
-- turno de su pago original. Las ventas web permanecen correctamente en NULL.
CREATE OR REPLACE FUNCTION public.assign_sale_payment_operational_session_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_original_payment_id UUID;
BEGIN
  IF NEW.operational_session_id IS NULL AND NEW.cash_session_id IS NOT NULL THEN
    NEW.operational_session_id := NEW.cash_session_id;
  END IF;

  IF NEW.operational_session_id IS NULL
     AND NEW.transaction_type IN ('VOID', 'REFUND')
     AND NULLIF(NEW.metadata->>'original_payment_id', '') IS NOT NULL THEN
    BEGIN
      v_original_payment_id := (NEW.metadata->>'original_payment_id')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'original_payment_id inválido en el evento compensatorio.';
    END;

    SELECT original.operational_session_id
    INTO NEW.operational_session_id
    FROM public.sale_payments_v2 original
    WHERE original.tenant_id = NEW.tenant_id
      AND original.id = v_original_payment_id;
  END IF;

  IF NEW.operational_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.cash_sessions_v2 session_row
    WHERE session_row.tenant_id = NEW.tenant_id
      AND session_row.id = NEW.operational_session_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'El turno operativo del pago no pertenece al tenant.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_sale_payment_operational_session_v2
  ON public.sale_payments_v2;
CREATE TRIGGER assign_sale_payment_operational_session_v2
BEFORE INSERT OR UPDATE OF cash_session_id, operational_session_id, metadata
ON public.sale_payments_v2
FOR EACH ROW EXECUTE FUNCTION public.assign_sale_payment_operational_session_v2();

REVOKE ALL ON FUNCTION public.assign_sale_payment_operational_session_v2()
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_cash_session_sheet_v2(
  p_tenant_id UUID,
  p_session_id UUID
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

  SELECT * INTO v_session
  FROM public.cash_sessions_v2 session_row
  WHERE session_row.tenant_id = p_tenant_id
    AND session_row.id = p_session_id;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Sesion de caja no encontrada.';
  END IF;
  IF v_session.opened_by <> v_actor AND NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No podes consultar la caja de otro usuario.';
  END IF;

  SELECT
    COALESCE(sum(movement.amount) FILTER (
      WHERE movement.movement_type = 'SALE' AND movement.direction = 'IN'
    ), 0),
    COALESCE(sum(movement.amount) FILTER (
      WHERE movement.movement_type = 'INCOME' AND movement.direction = 'IN'
    ), 0),
    COALESCE(sum(movement.amount) FILTER (
      WHERE movement.movement_type IN ('EXPENSE', 'REFUND') AND movement.direction = 'OUT'
    ), 0),
    COALESCE(sum(movement.amount) FILTER (
      WHERE movement.movement_type = 'WITHDRAWAL' AND movement.direction = 'OUT'
    ), 0)
  INTO v_cash_sales, v_other_income, v_expenses, v_withdrawals
  FROM public.cash_movements_v2 movement
  WHERE movement.tenant_id = p_tenant_id
    AND movement.session_id = p_session_id;

  SELECT
    COALESCE(sum(
      CASE
        WHEN payment.transaction_type = 'PAYMENT' AND payment.status = 'CAPTURED' THEN payment.amount
        WHEN payment.transaction_type IN ('VOID', 'REFUND')
          AND payment.status IN ('CAPTURED', 'REFUNDED', 'REVERSED') THEN -payment.amount
        ELSE 0
      END
    ) FILTER (WHERE payment.method = 'BANK_TRANSFER'), 0),
    COALESCE(sum(
      CASE
        WHEN payment.transaction_type = 'PAYMENT' AND payment.status = 'CAPTURED' THEN payment.amount
        WHEN payment.transaction_type IN ('VOID', 'REFUND')
          AND payment.status IN ('CAPTURED', 'REFUNDED', 'REVERSED') THEN -payment.amount
        ELSE 0
      END
    ) FILTER (WHERE payment.method = 'CARD'), 0),
    COALESCE(sum(
      CASE
        WHEN payment.transaction_type = 'PAYMENT' AND payment.status = 'CAPTURED' THEN payment.amount
        WHEN payment.transaction_type IN ('VOID', 'REFUND')
          AND payment.status IN ('CAPTURED', 'REFUNDED', 'REVERSED') THEN -payment.amount
        ELSE 0
      END
    ) FILTER (WHERE payment.method IN ('MERCADO_PAGO', 'QR')), 0),
    COALESCE(sum(
      CASE
        WHEN payment.transaction_type = 'PAYMENT' AND payment.status = 'CAPTURED' THEN payment.amount
        WHEN payment.transaction_type IN ('VOID', 'REFUND')
          AND payment.status IN ('CAPTURED', 'REFUNDED', 'REVERSED') THEN -payment.amount
        ELSE 0
      END
    ) FILTER (WHERE payment.method = 'ACCOUNT_CREDIT'), 0)
  INTO v_transfer, v_card, v_mp, v_account
  FROM public.sale_payments_v2 payment
  WHERE payment.tenant_id = p_tenant_id
    AND payment.operational_session_id = p_session_id;

  SELECT * INTO v_closure
  FROM public.cash_closures closure_row
  WHERE closure_row.tenant_id = p_tenant_id
    AND closure_row.session_id = p_session_id;

  v_expected := round(
    v_session.opening_amount + v_cash_sales + v_other_income - v_expenses - v_withdrawals,
    2
  );

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'register_id', v_session.register_id,
    'status', v_session.status,
    'opened_by', v_session.opened_by,
    'opened_at', v_session.opened_at,
    'closed_at', v_session.closed_at,
    'opening_cash', v_session.opening_amount,
    'cash_sales', v_cash_sales,
    'other_cash_income', v_other_income,
    'expenses', v_expenses,
    'withdrawals', v_withdrawals,
    'expected_cash', v_expected,
    'transfer_income', v_transfer,
    'card_income', v_card,
    'mp_income', v_mp,
    'account_credit_income', v_account,
    'closure_id', v_closure.id,
    'counted_cash', v_closure.counted_amount,
    'closure_document_number', v_closure.document_number,
    'cash_breakdown', COALESCE(v_closure.metadata->'cash_breakdown', '{}'::jsonb),
    'difference', v_closure.difference,
    'closure_notes', v_closure.notes,
    'review_status', v_closure.review_status,
    'payment_session_linkage_version', 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_cash_session_sheet_v2(UUID, UUID)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cash_session_sheet_v2(UUID, UUID)
TO authenticated, service_role;

INSERT INTO public.schema_migrations (
  version,
  name,
  checksum,
  backward_compatible,
  applied_by
)
VALUES (
  '024',
  'payment_operational_session',
  'sha256-payment-operational-session-024-v1',
  true,
  'migration-engine'
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
