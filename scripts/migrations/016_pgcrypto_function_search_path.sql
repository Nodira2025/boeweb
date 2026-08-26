-- BÔ GROW CLUB — MIGRACIÓN 016: PGCRYPTO EN FUNCIONES OPERATIVAS
-- Supabase instala pgcrypto normalmente en `extensions`. Las funciones
-- SECURITY DEFINER usan un search_path cerrado, por lo que un digest()
-- sin calificar no se resuelve si sólo se incluyeron public y pg_temp.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $migration$
DECLARE
  v_pgcrypto_schema TEXT;
  v_signature TEXT;
  v_target REGPROCEDURE;
  v_search_path TEXT;
  v_targets CONSTANT TEXT[] := ARRAY[
    'public.create_public_order_v2(uuid,text,jsonb,jsonb,jsonb,text,text)',
    'public.checkout_sale_v2(uuid,text,text,jsonb,jsonb,uuid,uuid,uuid,uuid,text,date,jsonb)',
    'public.submit_catalog_product_draft_v2(uuid,text,jsonb)',
    'public.record_public_order_accounting_v2()',
    'public.transfer_inventory_v2(uuid,uuid,uuid,uuid,numeric,text,text)',
    'public.submit_inventory_count_v2(uuid,uuid,uuid,numeric,text,text)',
    'public.review_inventory_count_v2(uuid,uuid,text,text,text)',
    'public.checkout_sale_v3(uuid,text,text,jsonb,jsonb,uuid,uuid,uuid,uuid,text,date,jsonb,uuid)',
    'public.park_pos_ticket_v2(uuid,uuid,uuid,jsonb,text,uuid,text)'
  ];
BEGIN
  SELECT ns.nspname
  INTO v_pgcrypto_schema
  FROM pg_catalog.pg_extension ext
  JOIN pg_catalog.pg_namespace ns
    ON ns.oid = ext.extnamespace
  WHERE ext.extname = 'pgcrypto';

  IF v_pgcrypto_schema IS NULL THEN
    RAISE EXCEPTION 'La extensión pgcrypto no está disponible.';
  END IF;

  v_search_path := CASE
    WHEN v_pgcrypto_schema = 'public' THEN 'pg_catalog, public, pg_temp'
    ELSE pg_catalog.format('pg_catalog, public, %I, pg_temp', v_pgcrypto_schema)
  END;

  FOREACH v_signature IN ARRAY v_targets LOOP
    v_target := pg_catalog.to_regprocedure(v_signature);
    IF v_target IS NULL THEN
      RAISE EXCEPTION 'No existe la función operativa requerida: %', v_signature;
    END IF;

    EXECUTE pg_catalog.format(
      'ALTER FUNCTION %s SET search_path = %s',
      v_target,
      v_search_path
    );
  END LOOP;
END;
$migration$;

INSERT INTO public.schema_migrations (
  version,
  name,
  checksum,
  backward_compatible,
  applied_by
)
VALUES (
  '016',
  'pgcrypto_function_search_path',
  'sha256-pgcrypto-function-search-path-016-v1',
  true,
  'migration-engine'
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
