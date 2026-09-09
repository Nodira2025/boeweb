-- BÔ GROW CLUB — MIGRACIÓN 023: ALCANCE DE LECTURA DE CAJA Y PAGOS
-- Un vendedor sólo puede leer su propio turno y los movimientos/pagos que le
-- corresponden como cajero. ADMIN y SUPERVISOR conservan lectura tenant-wide;
-- el SUPERADMIN de plataforma conserva el alcance global definido en 000.

BEGIN;

DO $migration$
BEGIN
  IF pg_catalog.to_regclass('public.cash_sessions_v2') IS NULL
     OR pg_catalog.to_regclass('public.cash_movements_v2') IS NULL
     OR pg_catalog.to_regclass('public.sale_payments_v2') IS NULL
     OR pg_catalog.to_regclass('public.sales_v2') IS NULL THEN
    RAISE EXCEPTION 'Faltan tablas operativas requeridas para endurecer la lectura de caja.';
  END IF;
END;
$migration$;

ALTER TABLE public.cash_sessions_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_payments_v2 ENABLE ROW LEVEL SECURITY;

-- 004 permitía a cualquier miembro activo del tenant leer todos los turnos.
DROP POLICY IF EXISTS cash_sessions_member_read_v2 ON public.cash_sessions_v2;
DROP POLICY IF EXISTS cash_sessions_scoped_read_v3 ON public.cash_sessions_v2;
CREATE POLICY cash_sessions_scoped_read_v3 ON public.cash_sessions_v2
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR public.operational_has_tenant_role(
      tenant_id,
      ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
    )
    OR (
      opened_by = (SELECT auth.uid())
      AND public.operational_has_tenant_role(
        tenant_id,
        ARRAY['VENDEDOR']::TEXT[]
      )
    )
  );

-- La pertenencia de un movimiento se hereda del turno, no de actor_user_id:
-- un manager puede registrar un ajuste en el turno de su titular y ese ajuste
-- debe seguir visible en la planilla del cajero responsable.
DROP POLICY IF EXISTS cash_movements_member_read_v2 ON public.cash_movements_v2;
DROP POLICY IF EXISTS cash_movements_scoped_read_v3 ON public.cash_movements_v2;
CREATE POLICY cash_movements_scoped_read_v3 ON public.cash_movements_v2
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR public.operational_has_tenant_role(
      tenant_id,
      ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
    )
    OR (
      public.operational_has_tenant_role(
        tenant_id,
        ARRAY['VENDEDOR']::TEXT[]
      )
      AND EXISTS (
        SELECT 1
        FROM public.cash_sessions_v2 cash_session
        WHERE cash_session.tenant_id = cash_movements_v2.tenant_id
          AND cash_session.id = cash_movements_v2.session_id
          AND cash_session.opened_by = (SELECT auth.uid())
      )
    )
  );

-- Desde 017, sólo CASH lleva cash_session_id. Para cubrir también tarjeta,
-- transferencia, Mercado Pago y crédito, el dueño del pago es el cajero de la
-- venta canónica asociada, siempre correlacionado por tenant_id.
DROP POLICY IF EXISTS sale_payments_member_read_v2 ON public.sale_payments_v2;
DROP POLICY IF EXISTS sale_payments_scoped_read_v3 ON public.sale_payments_v2;
CREATE POLICY sale_payments_scoped_read_v3 ON public.sale_payments_v2
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR public.operational_has_tenant_role(
      tenant_id,
      ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
    )
    OR (
      public.operational_has_tenant_role(
        tenant_id,
        ARRAY['VENDEDOR']::TEXT[]
      )
      AND EXISTS (
        SELECT 1
        FROM public.sales_v2 sale
        WHERE sale.tenant_id = sale_payments_v2.tenant_id
          AND sale.id = sale_payments_v2.sale_id
          AND sale.cashier_user_id = (SELECT auth.uid())
      )
    )
  );

INSERT INTO public.schema_migrations (
  version,
  name,
  checksum,
  backward_compatible,
  applied_by
)
VALUES (
  '023',
  'cash_read_scope_hardening',
  'sha256-cash-read-scope-hardening-023-v1',
  false,
  'migration-engine'
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
