-- ============================================================================
-- BÔ GROW CLUB / PLATAFORMA SAAS — FASE 9: AI MIGRATION CENTER DDL ESTRICTO
-- ============================================================================

-- 1. JOBS DE MIGRACIÓN (MIGRATION JOBS)
CREATE TABLE IF NOT EXISTS public.migration_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('CATALOG_INTERNAL', 'CATALOG_B2B', 'INITIAL_STOCK', 'PRICE_LIST')),
  status VARCHAR(50) NOT NULL DEFAULT 'UPLOADED' CHECK (status IN (
    'UPLOADED', 'PROCESSING', 'READY_FOR_MAPPING', 'READY_FOR_REVIEW', 
    'HAS_ERRORS', 'APPROVED', 'IMPORTING', 'COMPLETED', 'FAILED', 'ROLLED_BACK'
  )),
  created_by VARCHAR(255) NOT NULL,
  vertical_code VARCHAR(50) NOT NULL DEFAULT 'growshop',
  total_rows INT DEFAULT 0,
  valid_rows INT DEFAULT 0,
  warning_rows INT DEFAULT 0,
  error_rows INT DEFAULT 0,
  version_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. FUENTES DE DATOS SUBIDAS (MIGRATION SOURCES)
CREATE TABLE IF NOT EXISTS public.migration_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.migration_jobs(id) ON DELETE CASCADE,
  source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('FILE_CSV', 'FILE_XLSX', 'FILE_PDF', 'FILE_IMAGE', 'URL', 'JSON')),
  filename VARCHAR(255),
  original_url TEXT,
  mime_type VARCHAR(100),
  storage_path TEXT NOT NULL,
  checksum VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. FILAS DE STAGING E INTERPRETACIONALES (MIGRATION ROWS)
CREATE TABLE IF NOT EXISTS public.migration_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.migration_jobs(id) ON DELETE CASCADE,
  row_number INT NOT NULL,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_status VARCHAR(50) DEFAULT 'VALID' CHECK (validation_status IN ('VALID', 'WARNING', 'ERROR', 'DUPLICATE')),
  confidence NUMERIC(3,2) DEFAULT 1.00 CHECK (confidence >= 0.00 AND confidence <= 1.00),
  action VARCHAR(50) DEFAULT 'CREATE' CHECK (action IN ('CREATE', 'UPDATE', 'IGNORE')),
  matched_product_id VARCHAR(255),
  error_messages JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PLANTILLAS Y MAPEOS DE COLUMNA (MIGRATION MAPPINGS)
CREATE TABLE IF NOT EXISTS public.migration_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.migration_jobs(id) ON DELETE CASCADE,
  source_column VARCHAR(255) NOT NULL,
  target_column VARCHAR(255) NOT NULL,
  transformation_rule VARCHAR(100) DEFAULT 'NONE',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. HISTORIAL DE VERSIONES Y SNAPSHOTS DE ROLLBACK (MIGRATION VERSIONS)
CREATE TABLE IF NOT EXISTS public.migration_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.migration_jobs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  snapshot_before JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshot_after JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. LEDGER DE ACCIONES GRANULARES PARA ROLLBACK CONCURRENTE (MIGRATION ACTIONS)
CREATE TABLE IF NOT EXISTS public.migration_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.migration_jobs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('PRODUCT', 'SUPPLIER_PRODUCT', 'INVENTORY_LOCATION')),
  entity_id VARCHAR(255) NOT NULL,
  action VARCHAR(50) NOT NULL CHECK (action IN ('CREATE', 'UPDATE')),
  before_data JSONB,
  after_data JSONB NOT NULL,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. HABILITACIÓN DE ROW LEVEL SECURITY (RLS ESTRICTO POR TENANT)
ALTER TABLE public.migration_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "RLS migration_jobs_isolation" ON public.migration_jobs
  FOR ALL USING (
    public.is_superadmin() OR
    tenant_id IN (
      SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.role IN ('ADMIN', 'SUPERADMIN') AND tu.active = true
    )
  );

CREATE POLICY "RLS migration_sources_isolation" ON public.migration_sources
  FOR ALL USING (
    public.is_superadmin() OR
    job_id IN (
      SELECT j.id FROM public.migration_jobs j 
      JOIN public.tenant_users tu ON tu.tenant_id = j.tenant_id 
      WHERE tu.user_id = auth.uid() AND tu.role IN ('ADMIN', 'SUPERADMIN') AND tu.active = true
    )
  );

CREATE POLICY "RLS migration_rows_isolation" ON public.migration_rows
  FOR ALL USING (
    public.is_superadmin() OR
    job_id IN (
      SELECT j.id FROM public.migration_jobs j 
      JOIN public.tenant_users tu ON tu.tenant_id = j.tenant_id 
      WHERE tu.user_id = auth.uid() AND tu.role IN ('ADMIN', 'SUPERADMIN') AND tu.active = true
    )
  );

CREATE POLICY "RLS migration_mappings_isolation" ON public.migration_mappings
  FOR ALL USING (
    public.is_superadmin() OR
    job_id IN (
      SELECT j.id FROM public.migration_jobs j 
      JOIN public.tenant_users tu ON tu.tenant_id = j.tenant_id 
      WHERE tu.user_id = auth.uid() AND tu.role IN ('ADMIN', 'SUPERADMIN') AND tu.active = true
    )
  );

CREATE POLICY "RLS migration_versions_isolation" ON public.migration_versions
  FOR ALL USING (
    public.is_superadmin() OR
    tenant_id IN (
      SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.role IN ('ADMIN', 'SUPERADMIN') AND tu.active = true
    )
  );

CREATE POLICY "RLS migration_actions_isolation" ON public.migration_actions
  FOR ALL USING (
    public.is_superadmin() OR
    tenant_id IN (
      SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.role IN ('ADMIN', 'SUPERADMIN') AND tu.active = true
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.migration_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.migration_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.migration_rows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.migration_mappings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.migration_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.migration_actions TO authenticated;
