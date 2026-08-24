-- MIGRACIÓN 001: BASELINE INICIAL DE ESQUEMA SAAS MULTI-TENANT
-- Checksum: sha256-baseline-001
-- Backward Compatible: YES

BEGIN;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(100) NOT NULL,
  backward_compatible BOOLEAN NOT NULL DEFAULT true,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  applied_by VARCHAR(255) NOT NULL DEFAULT 'system'
);

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schema_migrations_superadmin_read_v2 ON public.schema_migrations;
CREATE POLICY schema_migrations_superadmin_read_v2 ON public.schema_migrations
  FOR SELECT TO authenticated
  USING (public.is_superadmin());

DROP POLICY IF EXISTS schema_migrations_service_v2 ON public.schema_migrations;
CREATE POLICY schema_migrations_service_v2 ON public.schema_migrations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.schema_migrations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.schema_migrations TO authenticated;
GRANT ALL ON public.schema_migrations TO service_role;

INSERT INTO public.schema_migrations (version, name, checksum, backward_compatible, applied_by)
VALUES ('001', 'initial_schema_baseline', 'sha256-baseline-001', true, 'migration-engine')
ON CONFLICT (version) DO NOTHING;

COMMIT;
