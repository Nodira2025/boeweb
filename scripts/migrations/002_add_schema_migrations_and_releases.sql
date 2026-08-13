-- MIGRACIÓN 002: TABLA DE HISTORIAL DE RELEASES Y AUDITORÍA DE DEPLOYS
-- Checksum: sha256-releases-002
-- Backward Compatible: YES

CREATE TABLE IF NOT EXISTS public.release_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment VARCHAR(50) NOT NULL DEFAULT 'LOCAL',
  app_version VARCHAR(50) NOT NULL,
  git_commit VARCHAR(100) NOT NULL,
  git_tag VARCHAR(100) NOT NULL,
  schema_version VARCHAR(50) NOT NULL,
  deployed_by VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'HEALTHY' CHECK (status IN ('DEPLOYING', 'VERIFYING', 'HEALTHY', 'DEGRADED', 'ROLLED_BACK', 'FAILED')),
  deployed_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.schema_migrations (version, name, checksum, backward_compatible, applied_by)
VALUES ('002', 'add_schema_migrations_and_releases', 'sha256-releases-002', true, 'migration-engine')
ON CONFLICT (version) DO NOTHING;
