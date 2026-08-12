-- ============================================================================
-- BÔ GROW CLUB / PLATAFORMA SAAS — FASE 10: TENANT ONBOARDING WIZARD DDL ESTRICTO
-- ============================================================================

-- 1. TABLA DE SESIONES Y ESTADO DE ONBOARDING (TENANT ONBOARDING SESSIONS)
CREATE TABLE IF NOT EXISTS public.tenant_onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  created_by VARCHAR(255) NOT NULL,
  step_current INT DEFAULT 1 CHECK (step_current >= 1 AND step_current <= 10),
  status VARCHAR(50) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'IN_PROGRESS', 'READY_TO_ACTIVATE', 'ACTIVE', 'CANCELLED')),
  company_data JSONB DEFAULT '{}'::jsonb,
  vertical_data JSONB DEFAULT '{}'::jsonb,
  identity_data JSONB DEFAULT '{}'::jsonb,
  catalog_data JSONB DEFAULT '{}'::jsonb,
  supplier_data JSONB DEFAULT '{}'::jsonb,
  stock_data JSONB DEFAULT '{}'::jsonb,
  users_data JSONB DEFAULT '{}'::jsonb,
  wms_data JSONB DEFAULT '{}'::jsonb,
  checklist_result JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  activated_at TIMESTAMPTZ
);

-- 2. HABILITACIÓN DE RLS (SOLO ACCESIBLE POR SUPERADMIN)
ALTER TABLE public.tenant_onboarding_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "RLS tenant_onboarding_sessions_superadmin_only" ON public.tenant_onboarding_sessions
  FOR ALL USING (
    public.is_superadmin()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_onboarding_sessions TO authenticated;

-- 3. FUNCION SERVER-SIDE: CHECK DE SLUG ÚNICO IDEMPOTENTE
CREATE OR REPLACE FUNCTION public.rpc_check_tenant_slug_available(p_slug VARCHAR)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM public.tenants WHERE slug = lower(trim(p_slug))
  );
END;
$$;

-- 4. FUNCION SERVER-SIDE: EJECUTAR CHECKLIST PRE-ACTIVACIÓN
CREATE OR REPLACE FUNCTION public.rpc_run_preactivation_checklist(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session RECORD;
  v_slug_ok BOOLEAN;
  v_vertical_ok BOOLEAN;
  v_admin_ok BOOLEAN;
  v_errors JSONB := '[]'::jsonb;
  v_is_valid BOOLEAN := true;
BEGIN
  -- Verificar privilegios SUPERADMIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Acceso denegado: Se requieren privilegios de SUPERADMIN';
  END IF;

  SELECT * INTO v_session FROM public.tenant_onboarding_sessions WHERE id = p_session_id;
  IF v_session IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'errors', jsonb_build_array('Sesión de onboarding no encontrada'));
  END IF;

  -- 1. Validar Slug Único
  v_slug_ok := public.rpc_check_tenant_slug_available(COALESCE(v_session.company_data->>'slug', ''));
  IF NOT v_slug_ok AND v_session.tenant_id IS NULL THEN
    v_is_valid := false;
    v_errors := v_errors || jsonb_build_array('El slug comercial ya se encuentra registrado por otro negocio');
  END IF;

  -- 2. Validar Business Vertical
  SELECT EXISTS (
    SELECT 1 FROM public.business_verticals WHERE code = (v_session.vertical_data->>'code')
  ) INTO v_vertical_ok;
  
  IF NOT v_vertical_ok THEN
    v_is_valid := false;
    v_errors := v_errors || jsonb_build_array('El rubro comercial seleccionado no existe en PostgreSQL');
  END IF;

  -- 3. Validar Admin Principal
  IF (v_session.users_data->>'admin_email') IS NULL OR (v_session.users_data->>'admin_email') = '' THEN
    v_is_valid := false;
    v_errors := v_errors || jsonb_build_array('Se debe definir un Administrador Principal para el Tenant');
  END IF;

  RETURN jsonb_build_object(
    'valid', v_is_valid,
    'errors', v_errors,
    'checked_at', NOW()
  );
END;
$$;

-- 5. FUNCION SERVER-SIDE: ACTIVACIÓN IDEMPOTENTE DEL TENANT (SETUP -> ACTIVE)
CREATE OR REPLACE FUNCTION public.rpc_activate_tenant_onboarding(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session RECORD;
  v_checklist JSONB;
  v_new_tenant_id UUID;
BEGIN
  -- Verificar privilegios SUPERADMIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Acceso denegado: Se requieren privilegios de SUPERADMIN';
  END IF;

  SELECT * INTO v_session FROM public.tenant_onboarding_sessions WHERE id = p_session_id;
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sesión no encontrada';
  END IF;

  IF v_session.status = 'ACTIVE' THEN
    RETURN jsonb_build_object('success', true, 'message', 'El tenant ya se encuentra activo (Idempotente)', 'tenant_id', v_session.tenant_id);
  END IF;

  -- Correr Checklist
  v_checklist := public.rpc_run_preactivation_checklist(p_session_id);
  IF NOT (v_checklist->>'valid')::boolean THEN
    RAISE EXCEPTION 'Checklist fallido: %', v_checklist->>'errors';
  END IF;

  -- Crear Tenant Real si no existe
  IF v_session.tenant_id IS NULL THEN
    INSERT INTO public.tenants (name, slug, status, vertical_code)
    VALUES (
      v_session.company_data->>'name',
      lower(trim(v_session.company_data->>'slug')),
      'ACTIVE',
      v_session.vertical_code->>'code'
    )
    RETURNING id INTO v_new_tenant_id;
  ELSE
    v_new_tenant_id := v_session.tenant_id;
    UPDATE public.tenants SET status = 'ACTIVE' WHERE id = v_new_tenant_id;
  END IF;

  -- Actualizar Sesión de Onboarding
  UPDATE public.tenant_onboarding_sessions
  SET tenant_id = v_new_tenant_id,
      status = 'ACTIVE',
      checklist_result = v_checklist,
      activated_at = NOW(),
      updated_at = NOW()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_new_tenant_id,
    'activated_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_check_tenant_slug_available(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_run_preactivation_checklist(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_activate_tenant_onboarding(UUID) TO authenticated;
