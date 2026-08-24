-- MIGRACION 000: FUNDACION MINIMA SAAS MULTI-TENANT
-- Esta migracion precede a 001..004 y tambien normaliza instalaciones legacy.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(100) NOT NULL,
  backward_compatible BOOLEAN NOT NULL DEFAULT true,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  applied_by VARCHAR(255) NOT NULL DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  vertical_code VARCHAR(50) NOT NULL DEFAULT 'growshop',
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- CREATE TABLE IF NOT EXISTS no agrega columnas ausentes en una instalacion previa.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS vertical_code VARCHAR(50) NOT NULL DEFAULT 'growshop';

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_status_check;
UPDATE public.tenants
SET status = CASE upper(btrim(COALESCE(status, '')))
  WHEN '' THEN 'ACTIVE'
  WHEN 'ACTIVO' THEN 'ACTIVE'
  WHEN 'INACTIVE' THEN 'SUSPENDED'
  WHEN 'INACTIVO' THEN 'SUSPENDED'
  WHEN 'SUSPENDIDO' THEN 'SUSPENDED'
  WHEN 'EN_PRUEBA' THEN 'TRIAL'
  ELSE upper(btrim(status))
END;
UPDATE public.tenants
SET vertical_code = 'growshop'
WHERE NULLIF(btrim(vertical_code), '') IS NULL;
ALTER TABLE public.tenants
  ALTER COLUMN status SET DEFAULT 'ACTIVE',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN vertical_code SET DEFAULT 'growshop',
  ALTER COLUMN vertical_code SET NOT NULL;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_status_check
  CHECK (status IN ('SETUP', 'ACTIVE', 'SUSPENDED', 'TRIAL', 'ARCHIVED'));
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_vertical_code_check;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_vertical_code_check
  CHECK (length(btrim(vertical_code)) BETWEEN 1 AND 50);

CREATE TABLE IF NOT EXISTS public.tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, user_id)
);

ALTER TABLE public.tenant_users DROP CONSTRAINT IF EXISTS tenant_users_role_check;
UPDATE public.tenant_users
SET role = CASE upper(btrim(role))
  WHEN 'SUPERADMIN' THEN 'ADMIN'
  ELSE upper(btrim(role))
END;
UPDATE public.tenant_users SET active = true WHERE active IS NULL;
ALTER TABLE public.tenant_users
  ALTER COLUMN active SET DEFAULT true,
  ALTER COLUMN active SET NOT NULL;
ALTER TABLE public.tenant_users ADD CONSTRAINT tenant_users_role_check
  CHECK (role IN ('ADMIN', 'SUPERVISOR', 'VENDEDOR', 'DEPOSITO'));

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, pg_temp
SET row_security = off
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.platform_admins pa
      WHERE pa.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, pg_temp
SET row_security = off
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      WHERE tu.tenant_id = p_tenant_id
        AND tu.user_id = auth.uid()
        AND tu.active = true
    );
$$;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "RLS tenants_select" ON public.tenants;
DROP POLICY IF EXISTS tenants_member_select_v2 ON public.tenants;
CREATE POLICY tenants_member_select_v2 ON public.tenants
  FOR SELECT TO authenticated
  USING (public.is_superadmin() OR public.is_tenant_member(id));

DROP POLICY IF EXISTS "RLS tenant_users_select" ON public.tenant_users;
DROP POLICY IF EXISTS "RLS tenant_users multi-tenant" ON public.tenant_users;
DROP POLICY IF EXISTS tenant_users_member_select_v2 ON public.tenant_users;
CREATE POLICY tenant_users_member_select_v2 ON public.tenant_users
  FOR SELECT TO authenticated
  USING (public.is_superadmin() OR public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS platform_admins_self_select_v2 ON public.platform_admins;
CREATE POLICY platform_admins_self_select_v2 ON public.platform_admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS tenants_service_v2 ON public.tenants;
CREATE POLICY tenants_service_v2 ON public.tenants
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS tenant_users_service_v2 ON public.tenant_users;
CREATE POLICY tenant_users_service_v2 ON public.tenant_users
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS platform_admins_service_v2 ON public.platform_admins;
CREATE POLICY platform_admins_service_v2 ON public.platform_admins
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.tenants, public.tenant_users, public.platform_admins FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tenants, public.tenant_users, public.platform_admins TO authenticated;
GRANT ALL ON public.tenants, public.tenant_users, public.platform_admins TO service_role;

REVOKE ALL ON FUNCTION public.is_superadmin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_tenant_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin(), public.is_tenant_member(UUID)
  TO authenticated, service_role;

INSERT INTO public.schema_migrations (version, name, checksum, backward_compatible, applied_by)
VALUES ('000', 'saas_foundation', 'sha256-saas-foundation-000-v2', true, 'migration-engine')
ON CONFLICT (version) DO NOTHING;

COMMIT;
