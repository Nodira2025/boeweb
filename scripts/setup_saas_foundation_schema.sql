-- ============================================================================
-- BÔ GROW CLUB / PLATAFORMA SAAS — FASE 7: SEGURIDAD MULTI-TENANT & RLS STRICT
-- ============================================================================

-- 1. TABLA DE PLATFORM ADMINS (SUPERADMINS GLOBALES A NIVEL PLATAFORMA)
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id UUID PRIMARY KEY, -- Referencia directa a auth.users(id)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- FUNCIÓN DE SEGURIDAD SERVER-SIDE STABLE (Definida como SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  );
$$;

-- 2. TABLA DE EMPRESAS / TENANTS
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'ACTIVO' CHECK (status IN ('ACTIVO', 'SUSPENDIDO', 'EN_PRUEBA')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLA DE USUARIOS Y ROLES POR TENANT
CREATE TABLE IF NOT EXISTS public.tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- UUID real emitido por Supabase Auth
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('ADMIN', 'SUPERVISOR', 'VENDEDOR', 'DEPOSITO')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

-- 4. SEMBRADO DE TENANTS INICIALES (Tenant #1 BÔ Grow Club + Tenant B Demo)
INSERT INTO public.tenants (id, slug, name, status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'boe-grow-club', 'BÔ Grow Club', 'ACTIVO'),
  ('22222222-2222-2222-2222-222222222222', 'empresa-b-demo', 'Empresa B Demo (Ferretería Norte)', 'ACTIVO')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status;

-- 5. POLÍTICAS DE ROW LEVEL SECURITY (RLS) ESTRICTAS CON ISOLATION REAL

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- Limpieza de políticas previas para evitar vulnerabilidad OR role = 'SUPERADMIN'
DROP POLICY IF EXISTS "RLS tenant_users multi-tenant" ON public.tenant_users;
DROP POLICY IF EXISTS "RLS inventory_locations multi-tenant" ON public.inventory_locations;
DROP POLICY IF EXISTS "RLS inventory_movements multi-tenant SELECT" ON public.inventory_movements;
DROP POLICY IF EXISTS "RLS inventory_movements multi-tenant INSERT" ON public.inventory_movements;

-- POLÍTICA TENANTS:
CREATE POLICY "RLS tenants_select" ON public.tenants
  FOR SELECT USING (
    public.is_superadmin() OR
    id IN (
      SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.active = true
    )
  );

-- POLÍTICA TENANT USERS:
CREATE POLICY "RLS tenant_users_select" ON public.tenant_users
  FOR SELECT USING (
    public.is_superadmin() OR
    (user_id = auth.uid() AND active = true) OR
    tenant_id IN (
      SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.active = true
    )
  );

-- POLÍTICA INVENTORY LOCATIONS: Aislamiento Estricto
CREATE POLICY "RLS inventory_locations_isolation" ON public.inventory_locations
  FOR ALL USING (
    public.is_superadmin() OR
    tenant_id IN (
      SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.active = true
    )
  );

-- POLÍTICA INVENTORY MOVEMENTS: Append-Only e Aislamiento Estricto
CREATE POLICY "RLS inventory_movements_select" ON public.inventory_movements
  FOR SELECT USING (
    public.is_superadmin() OR
    tenant_id IN (
      SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.active = true
    )
  );

CREATE POLICY "RLS inventory_movements_insert" ON public.inventory_movements
  FOR INSERT WITH CHECK (
    public.is_superadmin() OR
    tenant_id IN (
      SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.active = true
    )
  );

-- PERMISOS TABLAS: Denegar UPDATE y DELETE en historial inmutable
GRANT SELECT, INSERT ON public.inventory_movements TO anon, authenticated;
REVOKE UPDATE, DELETE ON public.inventory_movements FROM anon, authenticated;

-- 6. RPC RPC_MOVER_PRODUCTO CON VALIDACIÓN SERVER-SIDE DE TENANT
CREATE OR REPLACE FUNCTION public.rpc_mover_producto_saas(
  p_product_id VARCHAR,
  p_origin_module_code VARCHAR,
  p_origin_level INT,
  p_origin_sector VARCHAR,
  p_destination_module_code VARCHAR,
  p_destination_level INT,
  p_destination_sector VARCHAR,
  p_quantity INT,
  p_tenant_id UUID,
  p_user_name VARCHAR
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_available_qty INT;
  v_origin_loc_id UUID;
  v_dest_loc_id UUID;
BEGIN
  -- 1. Validar autenticación y permisos de Tenant SERVER-SIDE (Cero confianza en frontend)
  IF NOT (public.is_superadmin() OR EXISTS (
    SELECT 1 FROM public.tenant_users tu 
    WHERE tu.user_id = auth.uid() 
      AND tu.tenant_id = p_tenant_id 
      AND tu.active = true
  )) THEN
    RAISE EXCEPTION 'ACCESO DENEGADO: El usuario autenticado no posee permisos sobre el tenant %', p_tenant_id;
  END IF;

  -- 2. Validar cantidad a mover
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'La cantidad a mover debe ser mayor a cero.';
  END IF;

  -- 3. Lock Row y Validar Stock Disponible en Origen
  SELECT id, quantity INTO v_origin_loc_id, v_available_qty
  FROM public.inventory_locations
  WHERE module_code = p_origin_module_code
    AND product_id = p_product_id
    AND human_level = p_origin_level
    AND UPPER(sector_position) = UPPER(p_origin_sector)
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_origin_loc_id IS NULL OR v_available_qty < p_quantity THEN
    RAISE EXCEPTION 'Stock insuficiente en origen: disponible % u., solicitado % u.', COALESCE(v_available_qty, 0), p_quantity;
  END IF;

  -- 4. Decrementar Origen
  UPDATE public.inventory_locations
  SET quantity = quantity - p_quantity
  WHERE id = v_origin_loc_id;

  -- 5. Upsert en Destino
  INSERT INTO public.inventory_locations (
    tenant_id, module_code, product_id, human_level, sector_position, quantity
  ) VALUES (
    p_tenant_id, p_destination_module_code, p_product_id, p_destination_level, UPPER(p_destination_sector), p_quantity
  )
  ON CONFLICT (module_code, product_id, human_level, sector_position, tenant_id)
  DO UPDATE SET quantity = inventory_locations.quantity + EXCLUDED.quantity;

  -- 6. Insertar Registro Inmutable en Bitácora Movimientos
  INSERT INTO public.inventory_movements (
    tenant_id, movement_type, product_id, quantity, origin_module_code, destination_module_code, user_name, timestamp
  ) VALUES (
    p_tenant_id, 'TRANSFERENCIA', p_product_id, p_quantity, p_origin_module_code, p_destination_module_code, p_user_name, NOW()
  );

  RETURN json_build_object('success', true, 'message', 'Transferencia ejecutada correctamente.');
END;
$$;
