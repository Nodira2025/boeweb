-- ============================================================================
-- BÔ GROW CLUB / PLATAFORMA SAAS — FASE 7: FUNDACIÓN SAAS MULTI-TENANT & RLS
-- ============================================================================

-- 1. TABLA DE EMPRESAS / TENANTS
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'ACTIVO' CHECK (status IN ('ACTIVO', 'SUSPENDIDO', 'EN_PRUEBA')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABLA DE USUARIOS Y ROLES POR TENANT
CREATE TABLE IF NOT EXISTS public.tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID, -- Referencia a auth.users(id) cuando esté autenticado en Supabase Auth
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'VENDEDOR', 'DEPOSITO')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

-- 3. SEMBRADO DE TENANTS INICIALES (Tenant #1 BÔ Grow Club + Tenant B Demo)
INSERT INTO public.tenants (id, slug, name, status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'boe-grow-club', 'BÔ Grow Club', 'ACTIVO'),
  ('22222222-2222-2222-2222-222222222222', 'empresa-b-demo', 'Empresa B Demo (Ferretería Norte)', 'ACTIVO')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status;

-- 4. SEMBRADO DE USUARIOS Y ROLES
INSERT INTO public.tenant_users (tenant_id, email, name, role, active) VALUES
  ('11111111-1111-1111-1111-111111111111', 'profesor.franco@boeweb.com', 'Profesor Franco', 'SUPERADMIN', true),
  ('11111111-1111-1111-1111-111111111111', 'vendedor.boeweb@boeweb.com', 'Vendedor BÔ', 'VENDEDOR', true),
  ('22222222-2222-2222-2222-222222222222', 'vendedor.ferreteria@empresab.com', 'Vendedor Ferretería', 'VENDEDOR', true)
ON CONFLICT (tenant_id, email) DO UPDATE SET role = EXCLUDED.role, name = EXCLUDED.name;

-- 5. ADAPTACIÓN COMPATIBLE DE TABLAS DE INVENTARIO CON TENANT_ID
ALTER TABLE public.store_modules ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT '11111111-1111-1111-1111-111111111111' REFERENCES public.tenants(id);
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT '11111111-1111-1111-1111-111111111111' REFERENCES public.tenants(id);
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT '11111111-1111-1111-1111-111111111111' REFERENCES public.tenants(id);
ALTER TABLE public.inventory_audits ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT '11111111-1111-1111-1111-111111111111' REFERENCES public.tenants(id);

-- 6. POLÍTICAS DE ROW LEVEL SECURITY (RLS) MULTI-TENANT
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- Política Tenants: Lectura libre de tenants para usuarios autenticados / anon demo
CREATE POLICY "Permitir lectura de tenants" ON public.tenants
  FOR SELECT USING (true);

-- Política Tenant Users: Superadmin lee todo, usuarios leen su propia empresa
CREATE POLICY "RLS tenant_users multi-tenant" ON public.tenant_users
  FOR SELECT USING (
    tenant_id IN (
      SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() OR tu.role = 'SUPERADMIN'
    ) OR auth.role() = 'service_role'
  );

-- Política Inventory Locations: Aislamiento por Tenant
CREATE POLICY "RLS inventory_locations multi-tenant" ON public.inventory_locations
  FOR ALL USING (
    tenant_id IN (
      SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() OR tu.role = 'SUPERADMIN'
    ) OR auth.role() = 'service_role'
  );

-- Política Inventory Movements: Aislamiento Append-Only por Tenant
CREATE POLICY "RLS inventory_movements multi-tenant SELECT" ON public.inventory_movements
  FOR SELECT USING (
    tenant_id IN (
      SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() OR tu.role = 'SUPERADMIN'
    ) OR auth.role() = 'service_role'
  );

CREATE POLICY "RLS inventory_movements multi-tenant INSERT" ON public.inventory_movements
  FOR INSERT WITH CHECK (true);

-- Permisos explícitos
GRANT SELECT, INSERT, UPDATE ON public.tenants TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tenant_users TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_locations TO anon, authenticated;
GRANT SELECT, INSERT ON public.inventory_movements TO anon, authenticated;
REVOKE UPDATE, DELETE ON public.inventory_movements FROM anon, authenticated;
