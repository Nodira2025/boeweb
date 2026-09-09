-- BÔ GROW CLUB — MIGRACIÓN 022: ENDURECIMIENTO DE REPROCAM
-- El flujo legacy aceptaba precio y forma de pago desde el navegador. Se deshabilita
-- para clientes autenticados: las ventas nuevas usan checkout_sale_v3, que toma precio,
-- stock, caja y pagos desde tablas autoritativas dentro de una única transacción.

BEGIN;

INSERT INTO public.cash_registers (
  tenant_id,
  code,
  name,
  location_id,
  currency,
  active,
  metadata
)
SELECT
  tenant.id,
  'CAJA-REPROCAM',
  'Caja Reprocam',
  default_location.id,
  'ARS',
  true,
  jsonb_build_object(
    'is_reprocam', true,
    'description', 'Caja dedicada para el catálogo Reprocam'
  )
FROM public.tenants tenant
JOIN LATERAL (
  SELECT location.id
  FROM public.inventory_locations_v2 location
  WHERE location.tenant_id = tenant.id
    AND location.is_default = true
    AND location.active = true
    AND location.is_sellable = true
  LIMIT 1
) default_location ON true
ON CONFLICT (tenant_id, code) DO UPDATE
SET active = true;

CREATE OR REPLACE FUNCTION public.record_reprocam_sale_v2(
  p_tenant_id UUID,
  p_product_id UUID,
  p_quantity NUMERIC,
  p_unit_price NUMERIC,
  p_payment_method TEXT DEFAULT 'CASH',
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '0A000',
    MESSAGE = 'El flujo legacy de Reprocam fue deshabilitado. Actualizá la aplicación para usar checkout_sale_v3.';
END;
$$;

REVOKE ALL ON FUNCTION public.record_reprocam_sale_v2(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_reprocam_sale_v2(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT)
TO service_role;

INSERT INTO public.schema_migrations (
  version,
  name,
  checksum,
  backward_compatible,
  applied_by
)
VALUES (
  '022',
  'reprocam_security_hardening',
  'sha256-reprocam-security-hardening-022-v1',
  false,
  'migration-engine'
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
