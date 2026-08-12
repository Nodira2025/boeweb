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
