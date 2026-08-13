-- MIGRACIÓN 001: BASELINE INICIAL DE ESQUEMA SAAS MULTI-TENANT
-- Checksum: sha256-baseline-001
-- Backward Compatible: YES

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(100) NOT NULL,
  backward_compatible BOOLEAN NOT NULL DEFAULT true,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  applied_by VARCHAR(255) DEFAULT 'system'
);

INSERT INTO public.schema_migrations (version, name, checksum, backward_compatible, applied_by)
VALUES ('001', 'initial_schema_baseline', 'sha256-baseline-001', true, 'migration-engine')
ON CONFLICT (version) DO NOTHING;

-- ALTERED BYTE