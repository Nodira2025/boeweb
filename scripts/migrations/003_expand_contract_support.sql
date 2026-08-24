-- MIGRACIÓN 003: SOPORTE PARA PATRÓN EXPAND / CONTRACT (COMPATIBILIDAD N-1)
-- Checksum: sha256-expand-contract-003
-- Backward Compatible: YES

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.sales') IS NOT NULL THEN
    ALTER TABLE public.sales
      ADD COLUMN IF NOT EXISTS build_version_snapshot VARCHAR(50) DEFAULT 'v1.0.0';
  END IF;
END;
$$;

INSERT INTO public.schema_migrations (version, name, checksum, backward_compatible, applied_by)
VALUES ('003', 'expand_contract_support', 'sha256-expand-contract-003', true, 'migration-engine')
ON CONFLICT (version) DO NOTHING;

COMMIT;
