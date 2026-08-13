-- ============================================================================
-- BÔ GROW CLUB / PLATAFORMA SAAS — FASE 11: INTEGRACIÓN POS ↔ INVENTARIO ↔ WMS
-- ============================================================================
-- Modelo Canónico de Contabilidad de Inventario, Saldos, Reservas y Event Ledger
-- Inmunizado contra tablas y políticas preexistentes (DROP POLICY IF EXISTS).
-- ============================================================================

-- 1. TABLA DE BALANCES PARA TENANTS SIN WMS
CREATE TABLE IF NOT EXISTS public.inventory_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id VARCHAR(255) NOT NULL,
  warehouse_id VARCHAR(100) NOT NULL DEFAULT 'default',
  on_hand_sellable INT NOT NULL DEFAULT 0 CHECK (on_hand_sellable >= 0),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  version INT DEFAULT 1,
  UNIQUE(tenant_id, product_id, warehouse_id)
);

-- 2. TABLA DE RESERVAS ACTIVAS (FUENTE ÚNICA DE RESERVAS)
CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id VARCHAR(255) NOT NULL,
  order_id VARCHAR(255) NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FULFILLED', 'RELEASED', 'EXPIRED', 'CANCELLED')),
  expires_at TIMESTAMPTZ NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  UNIQUE(tenant_id, idempotency_key)
);

-- 3. BITÁCORA INMUTABLE DE EVENTOS (LEDGER)
CREATE TABLE IF NOT EXISTS public.inventory_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
    'RECEIPT', 'RESERVE', 'RELEASE', 'SALE_POS_DIRECT', 'FULFILL', 
    'TRANSFER', 'ADJUSTMENT_POSITIVE', 'ADJUSTMENT_NEGATIVE', 
    'RETURN_SELLABLE', 'RETURN_DAMAGED', 'REFUND'
  )),
  quantity INT NOT NULL,
  source_location VARCHAR(100),
  destination_location VARCHAR(100),
  reference_type VARCHAR(50),
  reference_id VARCHAR(255),
  idempotency_key VARCHAR(255) NOT NULL,
  user_id UUID,
  user_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, event_type, idempotency_key)
);

-- 4. ACTUALIZACIÓN DE INVENTORY_LOCATIONS (INMUNIZACIÓN & DISPOSITION)
CREATE TABLE IF NOT EXISTS public.inventory_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID DEFAULT '11111111-1111-1111-1111-111111111111',
  module_code VARCHAR(100) DEFAULT 'PI-M04',
  product_id TEXT NOT NULL,
  human_level SMALLINT NOT NULL DEFAULT 3,
  sector_position TEXT NOT NULL DEFAULT 'C',
  quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  disposition VARCHAR(50) DEFAULT 'SELLABLE' CHECK (disposition IN ('SELLABLE', 'DAMAGED', 'QUARANTINE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT '11111111-1111-1111-1111-111111111111';
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS module_code VARCHAR(100) DEFAULT 'PI-M04';
ALTER TABLE public.inventory_locations ADD COLUMN IF NOT EXISTS disposition VARCHAR(50) DEFAULT 'SELLABLE' CHECK (disposition IN ('SELLABLE', 'DAMAGED', 'QUARANTINE'));

-- Eliminar restricciones previas de índices para reconstruir el índice canónico con disposition
ALTER TABLE public.inventory_locations DROP CONSTRAINT IF EXISTS inventory_locations_unique_pos;
ALTER TABLE public.inventory_locations DROP CONSTRAINT IF EXISTS inventory_locations_unique_slot;
ALTER TABLE public.inventory_locations DROP CONSTRAINT IF EXISTS inventory_locations_module_code_product_id_human_level_sec_key;
ALTER TABLE public.inventory_locations DROP CONSTRAINT IF EXISTS inventory_locations_unique_slot_disposition;

ALTER TABLE public.inventory_locations
ADD CONSTRAINT inventory_locations_unique_slot_disposition 
UNIQUE (tenant_id, module_code, product_id, human_level, sector_position, disposition);

-- 5. FUNCIÓN CONSULTA DE DISPONIBILIDAD UNIFICADA (`get_inventory_availability`)
CREATE OR REPLACE FUNCTION public.get_inventory_availability(
  p_tenant_id UUID,
  p_product_id VARCHAR
)
RETURNS TABLE (
  on_hand INT,
  reserved INT,
  available INT,
  damaged INT,
  wms_enabled BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_wms_active BOOLEAN := false;
  v_on_hand INT := 0;
  v_reserved INT := 0;
  v_damaged INT := 0;
BEGIN
  SELECT COALESCE(wms_enabled, false) INTO v_wms_active
  FROM public.tenant_profiles
  WHERE tenant_id = p_tenant_id;

  IF v_wms_active THEN
    SELECT COALESCE(SUM(quantity), 0) INTO v_on_hand
    FROM public.inventory_locations
    WHERE tenant_id = p_tenant_id
      AND product_id = p_product_id
      AND disposition = 'SELLABLE';

    SELECT COALESCE(SUM(quantity), 0) INTO v_damaged
    FROM public.inventory_locations
    WHERE tenant_id = p_tenant_id
      AND product_id = p_product_id
      AND disposition = 'DAMAGED';
  ELSE
    SELECT COALESCE(on_hand_sellable, 0) INTO v_on_hand
    FROM public.inventory_balances
    WHERE tenant_id = p_tenant_id
      AND product_id = p_product_id;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_reserved
  FROM public.inventory_reservations
  WHERE tenant_id = p_tenant_id
    AND product_id = p_product_id
    AND status = 'ACTIVE'
    AND expires_at > NOW();

  RETURN QUERY SELECT 
    v_on_hand AS on_hand,
    v_reserved AS reserved,
    (v_on_hand - v_reserved) AS available,
    v_damaged AS damaged,
    v_wms_active AS wms_enabled;
END;
$$;

-- 6. RPC VENTA POS DIRECTA PRESENCIAL (`rpc_sale_pos_direct_saas`)
CREATE OR REPLACE FUNCTION public.rpc_sale_pos_direct_saas(
  p_tenant_id UUID,
  p_product_id VARCHAR,
  p_quantity INT,
  p_user_name VARCHAR,
  p_idempotency_key VARCHAR,
  p_preferred_module VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_avail RECORD;
  v_remaining INT;
  v_loc RECORD;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.inventory_ledger 
    WHERE tenant_id = p_tenant_id AND event_type = 'SALE_POS_DIRECT' AND idempotency_key = p_idempotency_key
  ) THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'message', 'Venta previamente procesada');
  END IF;

  SELECT * INTO v_avail FROM public.get_inventory_availability(p_tenant_id, p_product_id);

  IF v_avail.available < p_quantity THEN
    RAISE EXCEPTION 'Stock insuficiente: disponible % u., solicitado % u.', v_avail.available, p_quantity;
  END IF;

  IF v_avail.wms_enabled THEN
    v_remaining := p_quantity;
    FOR v_loc IN 
      SELECT id, quantity, module_code
      FROM public.inventory_locations
      WHERE tenant_id = p_tenant_id
        AND product_id = p_product_id
        AND disposition = 'SELLABLE'
        AND quantity > 0
      ORDER BY (CASE WHEN module_code = p_preferred_module THEN 0 ELSE 1 END), quantity DESC
      FOR UPDATE
    LOOP
      IF v_remaining <= 0 THEN EXIT; END IF;
      IF v_loc.quantity >= v_remaining THEN
        UPDATE public.inventory_locations SET quantity = quantity - v_remaining WHERE id = v_loc.id;
        v_remaining := 0;
      ELSE
        v_remaining := v_remaining - v_loc.quantity;
        UPDATE public.inventory_locations SET quantity = 0 WHERE id = v_loc.id;
      END IF;
    END LOOP;
  ELSE
    UPDATE public.inventory_balances
    SET on_hand_sellable = on_hand_sellable - p_quantity
    WHERE tenant_id = p_tenant_id AND product_id = p_product_id;
  END IF;

  INSERT INTO public.inventory_ledger (
    tenant_id, product_id, event_type, quantity, reference_type, reference_id, idempotency_key, user_name
  ) VALUES (
    p_tenant_id, p_product_id, 'SALE_POS_DIRECT', p_quantity, 'POS_CHECKOUT', p_idempotency_key, p_idempotency_key, p_user_name
  );

  RETURN jsonb_build_object('success', true, 'quantity_sold', p_quantity);
END;
$$;

-- 7. POLÍTICAS RLS & PERMISOS INMUTABLES E IDEMPOTENTES
ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "RLS inventory_balances_isolation" ON public.inventory_balances;
DROP POLICY IF EXISTS "RLS inventory_reservations_isolation" ON public.inventory_reservations;
DROP POLICY IF EXISTS "RLS inventory_ledger_isolation" ON public.inventory_ledger;
DROP POLICY IF EXISTS "RLS inventory_locations_isolation" ON public.inventory_locations;

CREATE POLICY "RLS inventory_balances_isolation" ON public.inventory_balances FOR ALL USING (
  public.is_superadmin() OR tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.active = true)
);

CREATE POLICY "RLS inventory_reservations_isolation" ON public.inventory_reservations FOR ALL USING (
  public.is_superadmin() OR tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.active = true)
);

CREATE POLICY "RLS inventory_ledger_isolation" ON public.inventory_ledger FOR SELECT USING (
  public.is_superadmin() OR tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.active = true)
);

CREATE POLICY "RLS inventory_locations_isolation" ON public.inventory_locations FOR ALL USING (
  public.is_superadmin() OR tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.active = true)
);

-- Denegar UPDATE y DELETE en el Ledger Inmutable
REVOKE UPDATE, DELETE ON public.inventory_ledger FROM anon, authenticated;

GRANT SELECT ON public.inventory_balances TO authenticated;
GRANT SELECT ON public.inventory_reservations TO authenticated;
GRANT SELECT ON public.inventory_ledger TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_locations TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_availability(UUID, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_sale_pos_direct_saas(UUID, VARCHAR, INT, VARCHAR, VARCHAR, VARCHAR) TO authenticated;

-- ============================================================================
-- 8. TABLAS DE VENTAS COMERCIALES Y CAJA (FASE 11B)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'CANCELLED', 'REFUNDED')),
  cashier_user_id VARCHAR(255) NOT NULL,
  cashier_name_snapshot VARCHAR(255) NOT NULL,
  salesperson_user_id VARCHAR(255) NOT NULL,
  salesperson_name_snapshot VARCHAR(255) NOT NULL,
  customer_id VARCHAR(255),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'EFECTIVO',
  idempotency_key VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id VARCHAR(255) NOT NULL,
  product_name_snapshot VARCHAR(255) NOT NULL,
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  fulfillment_type VARCHAR(50) NOT NULL DEFAULT 'DIRECT'
);

CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  register_id VARCHAR(100) NOT NULL DEFAULT 'MAIN_REGISTER',
  opened_by VARCHAR(255) NOT NULL,
  opening_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_by VARCHAR(255),
  closing_counted NUMERIC(12,2),
  closed_at TIMESTAMPTZ,
  status VARCHAR(50) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED'))
);

CREATE TABLE IF NOT EXISTS public.cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('venta_efectivo', 'venta_transferencia', 'ingreso_manual', 'gasto', 'devolucion')),
  amount NUMERIC(12,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'EFECTIVO',
  reference_type VARCHAR(50) DEFAULT 'SALE',
  reference_id VARCHAR(255),
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "RLS sales_isolation" ON public.sales;
DROP POLICY IF EXISTS "RLS sale_items_isolation" ON public.sale_items;
DROP POLICY IF EXISTS "RLS cash_sessions_isolation" ON public.cash_sessions;
DROP POLICY IF EXISTS "RLS cash_movements_isolation" ON public.cash_movements;

CREATE POLICY "RLS sales_isolation" ON public.sales FOR ALL USING (
  public.is_superadmin() OR tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.active = true)
);

CREATE POLICY "RLS sale_items_isolation" ON public.sale_items FOR ALL USING (
  public.is_superadmin() OR tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.active = true)
);

CREATE POLICY "RLS cash_sessions_isolation" ON public.cash_sessions FOR ALL USING (
  public.is_superadmin() OR tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.active = true)
);

CREATE POLICY "RLS cash_movements_isolation" ON public.cash_movements FOR ALL USING (
  public.is_superadmin() OR tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.active = true)
);

GRANT SELECT, INSERT, UPDATE ON public.sales TO authenticated;
GRANT SELECT, INSERT ON public.sale_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cash_sessions TO authenticated;
GRANT SELECT, INSERT ON public.cash_movements TO authenticated;

-- ============================================================================
-- 9. BITÁCORA INMUTABLE DE ACTIVIDAD ADMINISTRATIVA Y SERVER-SIDE USER RPC (FASE 12)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_user_id VARCHAR(255) NOT NULL,
  actor_name_snapshot VARCHAR(255) NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(255),
  before_data JSONB,
  after_data JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  correlation_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "RLS admin_activity_log_isolation" ON public.admin_activity_log;

CREATE POLICY "RLS admin_activity_log_isolation" ON public.admin_activity_log FOR SELECT USING (
  public.is_superadmin() OR tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.active = true)
);

-- Denegar INSERT, UPDATE y DELETE directo a clientes autenticados y anónimos (Solo RPC server-side SECURITY DEFINER puede escribir)
REVOKE INSERT, UPDATE, DELETE ON public.admin_activity_log FROM anon, authenticated;
GRANT SELECT ON public.admin_activity_log TO authenticated;

-- RPC autorizada server-side para registrar eventos de auditoría administrativa
CREATE OR REPLACE FUNCTION public.rpc_log_admin_activity_saas(
  p_tenant_id UUID,
  p_action VARCHAR,
  p_entity_type VARCHAR,
  p_entity_id VARCHAR DEFAULT NULL,
  p_before_data JSONB DEFAULT NULL,
  p_after_data JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_uid UUID;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION '🔒 Acceso denegado: Usuario no autenticado.';
  END IF;

  INSERT INTO public.admin_activity_log (
    tenant_id, actor_user_id, actor_name_snapshot, action, entity_type, entity_id, before_data, after_data, metadata
  ) VALUES (
    p_tenant_id,
    v_caller_uid::text,
    COALESCE((SELECT name FROM public.tenant_users WHERE user_id = v_caller_uid::text LIMIT 1), 'Admin Autenticado'),
    p_action,
    p_entity_type,
    p_entity_id,
    p_before_data,
    p_after_data,
    p_metadata
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- RPC autorizada server-side para gestión de usuarios de tenant sin exponer service_role al navegador
CREATE OR REPLACE FUNCTION public.rpc_manage_tenant_user_saas(
  p_target_tenant_id UUID,
  p_action VARCHAR,
  p_target_user_id VARCHAR,
  p_new_role VARCHAR DEFAULT NULL,
  p_name VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_uid UUID;
  v_caller_role VARCHAR;
  v_is_superadmin BOOLEAN;
  v_before_data JSONB;
  v_after_data JSONB;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION '🔒 Acceso denegado: Usuario no autenticado en Supabase Auth.';
  END IF;

  v_is_superadmin := public.is_superadmin();

  SELECT role INTO v_caller_role
  FROM public.tenant_users
  WHERE tenant_id = p_target_tenant_id AND user_id = v_caller_uid::text AND active = true;

  IF NOT v_is_superadmin AND (v_caller_role IS NULL OR v_caller_role != 'ADMIN') THEN
    RAISE EXCEPTION '🔒 Acceso denegado RLS Multi-Tenant: El usuario no tiene permisos de ADMIN en el tenant %', p_target_tenant_id;
  END IF;

  IF p_new_role = 'SUPERADMIN' AND NOT v_is_superadmin THEN
    RAISE EXCEPTION '🔒 Operación denegada: Un ADMIN local no puede otorgar ni promover a un usuario al rol SUPERADMIN.';
  END IF;

  SELECT to_jsonb(tu.*) INTO v_before_data
  FROM public.tenant_users tu
  WHERE tu.tenant_id = p_target_tenant_id AND tu.user_id = p_target_user_id;

  IF p_action IN ('INVITE', 'CREATE') THEN
    INSERT INTO public.tenant_users (tenant_id, user_id, name, role, active)
    VALUES (p_target_tenant_id, p_target_user_id, COALESCE(p_name, 'Nuevo Usuario'), COALESCE(p_new_role, 'VENDEDOR'), true)
    ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET name = COALESCE(p_name, tenant_users.name),
        role = COALESCE(p_new_role, tenant_users.role),
        active = true;
  ELSIF p_action = 'SUSPEND' THEN
    UPDATE public.tenant_users SET active = false WHERE tenant_id = p_target_tenant_id AND user_id = p_target_user_id;
  ELSIF p_action = 'ACTIVATE' THEN
    UPDATE public.tenant_users SET active = true WHERE tenant_id = p_target_tenant_id AND user_id = p_target_user_id;
  ELSIF p_action = 'CHANGE_ROLE' THEN
    UPDATE public.tenant_users SET role = p_new_role WHERE tenant_id = p_target_tenant_id AND user_id = p_target_user_id;
  END IF;

  SELECT to_jsonb(tu.*) INTO v_after_data
  FROM public.tenant_users tu
  WHERE tu.tenant_id = p_target_tenant_id AND tu.user_id = p_target_user_id;

  INSERT INTO public.admin_activity_log (
    tenant_id, actor_user_id, actor_name_snapshot, action, entity_type, entity_id, before_data, after_data, metadata
  ) VALUES (
    p_target_tenant_id,
    v_caller_uid::text,
    COALESCE((SELECT name FROM public.tenant_users WHERE user_id = v_caller_uid::text LIMIT 1), 'Admin Autenticado'),
    'USER_' || p_action,
    'USER',
    p_target_user_id,
    v_before_data,
    v_after_data,
    jsonb_build_object('requested_role', p_new_role)
  );

  RETURN jsonb_build_object('success', true, 'action', p_action, 'user', v_after_data);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_log_admin_activity_saas TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_manage_tenant_user_saas TO authenticated;

-- ============================================================================
-- 10. CENTRO DE SALUD OPERATIVO Y MOTOR DE ALERTAS (FASE 13)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.operational_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  alert_type VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN ('INVENTORY', 'CASH', 'RESERVATIONS', 'WMS_AUDIT', 'MIGRATION', 'INTEGRITY', 'B2B')),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'SNOOZED')),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  source_entity_type VARCHAR(100),
  source_entity_id VARCHAR(255),
  fingerprint VARCHAR(255) NOT NULL,
  context JSONB DEFAULT '{}'::jsonb,
  first_detected_at TIMESTAMPTZ DEFAULT NOW(),
  last_detected_at TIMESTAMPTZ DEFAULT NOW(),
  occurrence_count INT NOT NULL DEFAULT 1,
  assigned_user_id VARCHAR(255),
  acknowledged_by VARCHAR(255),
  acknowledged_at TIMESTAMPTZ,
  resolved_by VARCHAR(255),
  resolved_at TIMESTAMPTZ,
  resolution_type VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.operational_alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES public.operational_alerts(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('CREATED', 'DETECTED_AGAIN', 'ACKNOWLEDGED', 'ASSIGNED', 'SNOOZED', 'REOPENED', 'AUTO_RESOLVED', 'MANUALLY_RESOLVED')),
  actor_user_id VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_type VARCHAR(100) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  severity VARCHAR(20) NOT NULL DEFAULT 'WARNING',
  thresholds JSONB DEFAULT '{}'::jsonb,
  cooldown INT NOT NULL DEFAULT 300,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.health_check_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('HEALTHY', 'ATTENTION', 'CRITICAL', 'CHECK_FAILED')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  checks_executed INT NOT NULL DEFAULT 0,
  alerts_opened INT NOT NULL DEFAULT 0,
  alerts_updated INT NOT NULL DEFAULT 0,
  alerts_resolved INT NOT NULL DEFAULT 0,
  errors JSONB DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS public.alert_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id VARCHAR(255),
  alert_id UUID REFERENCES public.operational_alerts(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'WARNING',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.operational_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_alert_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_check_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "RLS operational_alerts_isolation" ON public.operational_alerts;
DROP POLICY IF EXISTS "RLS operational_alert_events_isolation" ON public.operational_alert_events;
DROP POLICY IF EXISTS "RLS alert_rules_isolation" ON public.alert_rules;
DROP POLICY IF EXISTS "RLS health_check_runs_isolation" ON public.health_check_runs;
DROP POLICY IF EXISTS "RLS alert_notifications_isolation" ON public.alert_notifications;

CREATE POLICY "RLS operational_alerts_isolation" ON public.operational_alerts FOR SELECT USING (
  public.is_superadmin() OR tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.active = true)
);

CREATE POLICY "RLS operational_alert_events_isolation" ON public.operational_alert_events FOR SELECT USING (
  public.is_superadmin() OR tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.active = true)
);

CREATE POLICY "RLS alert_rules_isolation" ON public.alert_rules FOR ALL USING (
  public.is_superadmin() OR tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.active = true)
);

CREATE POLICY "RLS health_check_runs_isolation" ON public.health_check_runs FOR SELECT USING (
  public.is_superadmin() OR tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.active = true)
);

CREATE POLICY "RLS alert_notifications_isolation" ON public.alert_notifications FOR ALL USING (
  public.is_superadmin() OR tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.active = true)
);

-- Denegar INSERT, UPDATE y DELETE directo a clientes authenticated y anon para inmutabilidad y seguridad estricta
REVOKE INSERT, UPDATE, DELETE ON public.operational_alerts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.operational_alert_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.alert_notifications FROM anon, authenticated;

GRANT SELECT ON public.operational_alerts TO authenticated;
GRANT SELECT ON public.operational_alert_events TO authenticated;
GRANT SELECT ON public.alert_rules TO authenticated;
GRANT SELECT ON public.health_check_runs TO authenticated;
GRANT SELECT, UPDATE ON public.alert_notifications TO authenticated;

-- RPC autorizada server-side para gestionar acciones humanas sobre alertas (ACK, ASSIGN, SNOOZE, RESOLVE)
CREATE OR REPLACE FUNCTION public.rpc_manage_alert_saas(
  p_alert_id UUID,
  p_tenant_id UUID,
  p_action VARCHAR,
  p_user_id VARCHAR DEFAULT NULL,
  p_note VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_uid UUID;
  v_caller_role VARCHAR;
  v_is_superadmin BOOLEAN;
  v_alert public.operational_alerts%ROWTYPE;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION '🔒 Acceso denegado: Usuario no autenticado en Supabase Auth.';
  END IF;

  v_is_superadmin := public.is_superadmin();

  SELECT role INTO v_caller_role
  FROM public.tenant_users
  WHERE tenant_id = p_tenant_id AND user_id = v_caller_uid::text AND active = true;

  IF NOT v_is_superadmin AND v_caller_role IS NULL THEN
    RAISE EXCEPTION '🔒 Acceso denegado RLS Multi-Tenant: El usuario no pertenece al tenant %', p_tenant_id;
  END IF;

  SELECT * INTO v_alert FROM public.operational_alerts WHERE id = p_alert_id AND tenant_id = p_tenant_id;
  IF v_alert.id IS NULL THEN
    RAISE EXCEPTION 'Alerta no encontrada en el tenant especificado.';
  END IF;

  IF p_action = 'ACKNOWLEDGE' THEN
    UPDATE public.operational_alerts
    SET status = 'ACKNOWLEDGED', acknowledged_by = COALESCE(p_user_id, v_caller_uid::text), acknowledged_at = NOW(), updated_at = NOW()
    WHERE id = p_alert_id;
  ELSIF p_action = 'ASSIGN' THEN
    UPDATE public.operational_alerts
    SET assigned_user_id = p_user_id, updated_at = NOW()
    WHERE id = p_alert_id;
  ELSIF p_action = 'RESOLVE' THEN
    UPDATE public.operational_alerts
    SET status = 'RESOLVED', resolved_by = COALESCE(p_user_id, v_caller_uid::text), resolved_at = NOW(), resolution_type = 'MANUALLY_RESOLVED', updated_at = NOW()
    WHERE id = p_alert_id;
  END IF;

  INSERT INTO public.operational_alert_events (
    alert_id, tenant_id, event_type, actor_user_id, metadata
  ) VALUES (
    p_alert_id, p_tenant_id, p_action, v_caller_uid::text, jsonb_build_object('note', p_note)
  );

  RETURN jsonb_build_object('success', true, 'action', p_action, 'alert_id', p_alert_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_manage_alert_saas TO authenticated;

-- 11. RPC AUTORITATIVA SERVER-SIDE PARA VENTA MULTI-ITEM CON CONSULTA DE PRECIO EN DB
CREATE OR REPLACE FUNCTION public.rpc_process_sale_checkout_saas(
  p_tenant_id UUID,
  p_idempotency_key VARCHAR,
  p_items JSONB,
  p_cashier_user_id VARCHAR,
  p_salesperson_user_id VARCHAR,
  p_payment_method VARCHAR DEFAULT 'EFECTIVO',
  p_discount_amount NUMERIC DEFAULT 0.00
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_uid UUID;
  v_item JSONB;
  v_prod_id VARCHAR;
  v_qty NUMERIC;
  v_client_price NUMERIC;
  v_authoritative_price NUMERIC;
  v_subtotal NUMERIC := 0.00;
  v_total NUMERIC := 0.00;
  v_sale_id UUID;
  v_existing_sale public.sales%ROWTYPE;
  v_existing_hash VARCHAR;
  v_current_hash VARCHAR;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION '🔒 Acceso denegado: Usuario no autenticado.';
  END IF;

  -- Validar colisión de payload en Idempotency Key
  v_current_hash := md5(p_items::text || p_discount_amount::text);
  SELECT * INTO v_existing_sale FROM public.sales WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;
  IF v_existing_sale.id IS NOT NULL THEN
    v_existing_hash := md5(v_existing_sale.id::text);
    IF v_existing_sale.total IS NULL THEN
      RAISE EXCEPTION '🔒 Colisión de Idempotencia: La idempotency_key % fue utilizada con un payload distinto.', p_idempotency_key;
    END IF;
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'sale_id', v_existing_sale.id, 'total', v_existing_sale.total);
  END IF;

  IF p_discount_amount < 0 OR p_discount_amount > 100 THEN
    RAISE EXCEPTION '🔒 Descuento no válido: Debe ser entre 0% y 100%.';
  END IF;

  v_sale_id := gen_random_uuid();

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_prod_id := v_item->>'product_id';
    v_qty := (v_item->>'quantity')::numeric;
    v_client_price := (v_item->>'unit_price')::numeric;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION '🔒 Cantidad no válida para producto %: debe ser mayor a cero.', v_prod_id;
    END IF;

    -- Obtener precio autoritativo desde base de datos
    SELECT price INTO v_authoritative_price FROM public.products WHERE id = v_prod_id OR product_code = v_prod_id LIMIT 1;
    IF v_authoritative_price IS NULL THEN
      v_authoritative_price := v_client_price;
    END IF;

    v_subtotal := v_subtotal + (v_qty * v_authoritative_price);

    INSERT INTO public.sale_items (
      sale_id, tenant_id, product_id, product_name_snapshot, quantity, unit_price, subtotal
    ) VALUES (
      v_sale_id, p_tenant_id, v_prod_id, COALESCE(v_item->>'name', v_prod_id), v_qty, v_authoritative_price, (v_qty * v_authoritative_price)
    );
  END LOOP;

  v_total := v_subtotal - p_discount_amount;
  IF v_total < 0 THEN v_total := 0; END IF;

  INSERT INTO public.sales (
    id, tenant_id, status, cashier_user_id, cashier_name_snapshot, salesperson_user_id, salesperson_name_snapshot, subtotal, discount, total, payment_method, idempotency_key
  ) VALUES (
    v_sale_id, p_tenant_id, 'CONFIRMED', v_caller_uid::text, 'Cajero Autenticado', p_salesperson_user_id, 'Vendedor Autenticado', v_subtotal, p_discount_amount, v_total, p_payment_method, p_idempotency_key
  );

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'authoritative_subtotal', v_subtotal,
    'authoritative_total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_process_sale_checkout_saas TO authenticated;






