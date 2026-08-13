-- Hotfix: elimina la recursión infinita de RLS en public.tenant_users.
-- Ejecutar una sola vez desde Supabase SQL Editor con un usuario propietario.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_tenant_member(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_users
    WHERE tenant_id = p_tenant_id
      AND user_id = auth.uid()
      AND active = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_tenant_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(UUID) TO authenticated;

DROP POLICY IF EXISTS "RLS tenant_users_select" ON public.tenant_users;

CREATE POLICY "RLS tenant_users_select"
ON public.tenant_users
FOR SELECT
TO authenticated
USING (
  public.is_superadmin()
  OR (user_id = auth.uid() AND active = true)
  OR public.is_tenant_member(tenant_id)
);

COMMIT;

