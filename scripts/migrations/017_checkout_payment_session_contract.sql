-- BÔ GROW CLUB — MIGRACIÓN 017: SESIÓN DE CAJA SÓLO PARA EFECTIVO
-- checkout_sale_v3 exigía correctamente un turno abierto para toda venta POS,
-- pero vinculaba esa sesión también a transferencias y otros pagos digitales.
-- sale_payments_v2 exige que cash_session_id sea NULL salvo para CASH, por lo
-- que una transferencia era rechazada de forma atómica por el constraint.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $migration$
DECLARE
  v_signature CONSTANT TEXT := 'public.checkout_sale_v3(uuid,text,text,jsonb,jsonb,uuid,uuid,uuid,uuid,text,date,jsonb,uuid)';
  v_buggy_fragment CONSTANT TEXT := '''CAPTURED'', v_session_id,';
  v_fixed_fragment CONSTANT TEXT := '''CAPTURED'', CASE WHEN v_payment_method = ''CASH'' THEN v_session_id ELSE NULL END,';
  v_target REGPROCEDURE;
  v_definition TEXT;
  v_pgcrypto_schema TEXT;
  v_search_path TEXT;
BEGIN
  v_target := pg_catalog.to_regprocedure(v_signature);
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'No existe la función operativa requerida: %', v_signature;
  END IF;

  SELECT pg_catalog.pg_get_functiondef(v_target)
  INTO v_definition;

  IF pg_catalog.strpos(v_definition, v_fixed_fragment) > 0 THEN
    NULL;
  ELSIF pg_catalog.strpos(v_definition, v_buggy_fragment) > 0 THEN
    v_definition := pg_catalog.replace(v_definition, v_buggy_fragment, v_fixed_fragment);
    IF pg_catalog.strpos(v_definition, v_buggy_fragment) > 0
       OR pg_catalog.strpos(v_definition, v_fixed_fragment) = 0 THEN
      RAISE EXCEPTION 'No se pudo construir de forma inequívoca el contrato corregido de pagos.';
    END IF;
    EXECUTE v_definition;
  ELSE
    RAISE EXCEPTION 'checkout_sale_v3 no coincide con la versión esperada; se aborta sin alterar la función.';
  END IF;

  v_target := pg_catalog.to_regprocedure(v_signature);
  SELECT pg_catalog.pg_get_functiondef(v_target)
  INTO v_definition;
  IF pg_catalog.strpos(v_definition, v_fixed_fragment) = 0
     OR pg_catalog.strpos(v_definition, v_buggy_fragment) > 0 THEN
    RAISE EXCEPTION 'checkout_sale_v3 no conservó el contrato de sesión de caja corregido.';
  END IF;

  SELECT ns.nspname
  INTO v_pgcrypto_schema
  FROM pg_catalog.pg_extension ext
  JOIN pg_catalog.pg_namespace ns ON ns.oid = ext.extnamespace
  WHERE ext.extname = 'pgcrypto';
  IF v_pgcrypto_schema IS NULL THEN
    RAISE EXCEPTION 'La extensión pgcrypto no está disponible.';
  END IF;

  v_search_path := CASE
    WHEN v_pgcrypto_schema = 'public' THEN 'pg_catalog, public, pg_temp'
    ELSE pg_catalog.format('pg_catalog, public, %I, pg_temp', v_pgcrypto_schema)
  END;
  EXECUTE pg_catalog.format(
    'ALTER FUNCTION %s SET search_path = %s',
    v_target,
    v_search_path
  );
END;
$migration$;

REVOKE ALL ON FUNCTION public.checkout_sale_v3(
  UUID, TEXT, TEXT, JSONB, JSONB, UUID, UUID, UUID, UUID, TEXT, DATE, JSONB, UUID
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_sale_v3(
  UUID, TEXT, TEXT, JSONB, JSONB, UUID, UUID, UUID, UUID, TEXT, DATE, JSONB, UUID
) TO authenticated, service_role;

INSERT INTO public.schema_migrations (
  version,
  name,
  checksum,
  backward_compatible,
  applied_by
)
VALUES (
  '017',
  'checkout_payment_session_contract',
  'sha256-checkout-payment-session-contract-017-v1',
  true,
  'migration-engine'
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
