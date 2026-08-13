-- ============================================================================
-- BÔ GROW CLUB / PLATAFORMA SAAS — MASTER SCHEMA DDL CONSOLIDADO (v1.0 COMERCIAL)
-- ============================================================================
-- Este script consolida todas las tablas, vistas, funciones RPC y políticas RLS 
-- necesarias para ejecutar la plataforma SaaS Multi-Tenant completa en Supabase.
-- Inmunizado contra tablas y políticas preexistentes (DROP POLICY IF EXISTS).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. BASE DE SEGURIDAD & SUPERADMINS GLOBALES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id UUID PRIMARY KEY, -- Referencia directa a auth.users(id)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Función de seguridad Server-Side (SECURITY DEFINER con search_path seguro)
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. TENANTS & MULTI-TENANT USERS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (status IN ('SETUP', 'ACTIVE', 'ACTIVO', 'SUSPENDED', 'SUSPENDIDO', 'ARCHIVED', 'EN_PRUEBA')),
  vertical_code VARCHAR(50) DEFAULT 'growshop',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- UUID real de auth.users
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('ADMIN', 'SUPERVISOR', 'VENDEDOR', 'DEPOSITO')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

-- Evita que las políticas consulten tenant_users desde la propia política y
-- entren en recursión infinita. SECURITY DEFINER evalúa la membresía sin RLS.
CREATE OR REPLACE FUNCTION public.is_tenant_member(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
SET row_security = off AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_users
    WHERE tenant_id = p_tenant_id
      AND user_id = auth.uid()
      AND active = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_tenant_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(UUID) TO authenticated;

-- Sembrado de Tenants Iniciales
INSERT INTO public.tenants (id, slug, name, status, vertical_code) VALUES
  ('11111111-1111-1111-1111-111111111111', 'boe-grow-club', 'BÔ Grow Club', 'ACTIVE', 'growshop'),
  ('22222222-2222-2222-2222-222222222222', 'empresa-b-demo', 'Empresa B Demo (Ferretería Norte)', 'ACTIVE', 'ferreteria')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, vertical_code = EXCLUDED.vertical_code;

-- ----------------------------------------------------------------------------
-- 3. RUBROS COMERCIALES & PROFILES WHITE-LABEL
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.business_verticals (
  code VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  attribute_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
  barcode_enrichment_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_prompt_context TEXT,
  category_suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN DEFAULT true,
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tenant_profiles (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  brand_name VARCHAR(255) NOT NULL,
  slogan VARCHAR(255),
  logo_url TEXT,
  favicon_url TEXT,
  primary_color VARCHAR(20) DEFAULT '#152D24',
  accent_color VARCHAR(20) DEFAULT '#C2A246',
  theme_mode VARCHAR(20) DEFAULT 'dark' CHECK (theme_mode IN ('dark', 'light', 'auto')),
  vertical_code VARCHAR(50) NOT NULL REFERENCES public.business_verticals(code) DEFAULT 'growshop',
  terminology JSONB NOT NULL DEFAULT '{"product_label":"Producto","vendor_label":"Vendedor","deposit_label":"Depósito"}'::jsonb,
  draft_branding JSONB DEFAULT '{}'::jsonb,
  published_branding JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sembrado de Rubros Comerciales
INSERT INTO public.business_verticals (code, name, description, attribute_schema, barcode_enrichment_config, ai_prompt_context, category_suggestions) VALUES
(
  'growshop',
  'Growshop & Botánica Premium',
  'Artículos de cultivo indoor, fertilizantes orgánicos, sustratos y parafernalia botánica.',
  '[
    {"key": "brand", "label": "Marca / Laboratorio", "type": "text", "required": true, "searchable": true, "barcode_priority": 10, "ai_enrichment": true},
    {"key": "presentation", "label": "Presentación / Volumen", "type": "text", "unit": "ml/L/kg", "required": true, "searchable": true, "barcode_priority": 9, "ai_enrichment": true},
    {"key": "npk_ratio", "label": "Relación N-P-K", "type": "text", "required": false, "searchable": true, "barcode_priority": 6, "ai_enrichment": true},
    {"key": "substrate_type", "label": "Tipo de Sustrato", "type": "select", "options": ["Turba/Inerte", "Lovert/Orgánico", "Coco", "Hydro"], "required": false, "searchable": true, "barcode_priority": 5, "ai_enrichment": true},
    {"key": "ph_range", "label": "Rango pH Óptimo", "type": "text", "required": false, "searchable": false, "barcode_priority": 3, "ai_enrichment": true}
  ]'::jsonb,
  '{"search_keywords": ["fertilizante", "grow", "sustrato", "maceta", "top crop", "klasmann", "mamboreta"], "priority_fields": ["brand", "presentation"]}'::jsonb,
  'Eres un experto agrónomo de Growshop. Identifica marca, volumen en L/ml/kg, valores NPK y fase de cultivo (vegetativo/floración).',
  '["Nutrición Vegetal", "Sustratos & Enmiendas", "Control de Plagas", "Iluminación Indoor", "Macetas & Riego"]'::jsonb
),
(
  'ferreteria',
  'Ferretería & Herramientas Industriales',
  'Herramientas eléctricas, bulonería, materiales de construcción, plomería y electricidad.',
  '[
    {"key": "brand", "label": "Marca", "type": "text", "required": true, "searchable": true, "barcode_priority": 10, "ai_enrichment": true},
    {"key": "model", "label": "Modelo / Código Fábrica", "type": "text", "required": true, "searchable": true, "barcode_priority": 9, "ai_enrichment": true},
    {"key": "power_watts", "label": "Potencia Motor", "type": "number", "unit": "W", "required": false, "searchable": true, "barcode_priority": 8, "ai_enrichment": true},
    {"key": "voltage", "label": "Voltaje Alimentación", "type": "select", "options": ["220V", "110V", "18V Batería", "20V Batería", "Manual"], "required": false, "searchable": true, "barcode_priority": 7, "ai_enrichment": true},
    {"key": "measurements_mm", "label": "Medida / Diámetro Mandril", "type": "text", "unit": "mm/pulgadas", "required": false, "searchable": true, "barcode_priority": 6, "ai_enrichment": true},
    {"key": "material", "label": "Material de Construcción", "type": "text", "required": false, "searchable": true, "barcode_priority": 4, "ai_enrichment": true}
  ]'::jsonb,
  '{"search_keywords": ["taladro", "amoladora", "bosch", "dewalt", "makita", "llave", "tornillo"], "priority_fields": ["brand", "model", "power_watts", "voltage"]}'::jsonb,
  'Eres un consultor técnico de ferretería industrial. Identifica marca, modelo exacto, potencia en Watts, voltaje (220V o batería) y medidas.',
  '["Herramientas Eléctricas", "Herramientas Manuales", "Bulonería & Fijaciones", "Electricidad & Iluminación", "Plomería & Agua"]'::jsonb
),
(
  'repuestos',
  'Autopartes & Repuestos Automotores',
  'Repuestos para motor, suspensión, frenos, transmisión y accesorios mecánicos.',
  '[
    {"key": "oem_code", "label": "Código OEM / Parte Original", "type": "text", "required": true, "searchable": true, "barcode_priority": 10, "ai_enrichment": true},
    {"key": "vehicle_make", "label": "Marca Vehículo", "type": "text", "required": true, "searchable": true, "barcode_priority": 9, "ai_enrichment": true},
    {"key": "compatible_models", "label": "Modelos Compatibles", "type": "text", "required": true, "searchable": true, "barcode_priority": 8, "ai_enrichment": true},
    {"key": "year_range", "label": "Rango de Años Compatible", "type": "text", "required": false, "searchable": true, "barcode_priority": 7, "ai_enrichment": true},
    {"key": "part_category", "label": "Sistema Mecánico", "type": "select", "options": ["Motor", "Frenos", "Suspensión/Dirección", "Transmisión", "Electricidad/Encendido"], "required": true, "searchable": true, "barcode_priority": 6, "ai_enrichment": true}
  ]'::jsonb,
  '{"search_keywords": ["filtro", "pastilla freno", "amortiguador", "bosch", "correa", "oem"], "priority_fields": ["oem_code", "vehicle_make", "compatible_models"]}'::jsonb,
  'Eres un especialista en catálogo técnico de autopartes. Extrae número de pieza OEM, marca del auto (Volkswagen, Ford, Fiat, etc.) y compatibilidad.',
  '["Filtros & Aceites", "Sistema de Frenos", "Suspensión & Amortiguadores", "Motor & Distribución", "Encendido & Baterías"]'::jsonb
),
(
  'indumentaria',
  'Indumentaria, Calzado & Moda',
  'Prendas de vestir, calzado urbano y deportivo, accesorios de moda.',
  '[
    {"key": "brand", "label": "Marca de Moda", "type": "text", "required": true, "searchable": true, "barcode_priority": 10, "ai_enrichment": true},
    {"key": "size", "label": "Talle / Medida", "type": "select", "options": ["XS", "S", "M", "L", "XL", "XXL", "38", "40", "42", "44"], "required": true, "searchable": true, "barcode_priority": 9, "ai_enrichment": true},
    {"key": "color", "label": "Color / Tono", "type": "text", "required": true, "searchable": true, "barcode_priority": 8, "ai_enrichment": true},
    {"key": "gender", "label": "Género / Línea", "type": "select", "options": ["Unisex", "Hombre", "Mujer", "Niños"], "required": false, "searchable": true, "barcode_priority": 6, "ai_enrichment": true},
    {"key": "season", "label": "Temporada / Colección", "type": "text", "required": false, "searchable": true, "barcode_priority": 4, "ai_enrichment": true}
  ]'::jsonb,
  '{"search_keywords": ["remera", "pantalón", "zapatillas", "campera", "nike", "adidas"], "priority_fields": ["brand", "size", "color"]}'::jsonb,
  'Eres un estilista y catalogador de moda. Extrae marca, talle exacto (S/M/L o número de calzado), color predominante y género.',
  '["Remeras & Musculosas", "Pantalones & Jeans", "Calzado Deportivo", "Calzado Urbano", "Accesorios & Abrigos"]'::jsonb
)
ON CONFLICT (code) DO UPDATE SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  attribute_schema = EXCLUDED.attribute_schema;

-- Sembrado de Perfiles de Tenant
INSERT INTO public.tenant_profiles (tenant_id, brand_name, slogan, logo_url, primary_color, accent_color, theme_mode, vertical_code, terminology, published_branding) VALUES
(
  '11111111-1111-1111-1111-111111111111',
  'BÔ Grow Club',
  'Espacio Zen para Cultivo Premium',
  'assets/logo.jpg',
  '#152D24',
  '#C2A246',
  'dark',
  'growshop',
  '{"product_label": "Producto Botánico", "vendor_label": "Asesor de Cultivo", "deposit_label": "Depósito Principal"}'::jsonb,
  '{"brand_name": "BÔ Grow Club", "primary_color": "#152D24", "accent_color": "#C2A246", "vertical_code": "growshop"}'::jsonb
),
(
  '22222222-2222-2222-2222-222222222222',
  'Empresa B Demo (Ferretería Norte)',
  'Soluciones Industriales y Herramientas',
  'assets/logo.jpg',
  '#0052CC',
  '#FF9800',
  'light',
  'ferreteria',
  '{"product_label": "Artículo de Ferretería", "vendor_label": "Cajero", "deposit_label": "Almacén Central"}'::jsonb,
  '{"brand_name": "Empresa B Demo (Ferretería Norte)", "primary_color": "#0052CC", "accent_color": "#FF9800", "vertical_code": "ferreteria"}'::jsonb
)
ON CONFLICT (tenant_id) DO UPDATE SET brand_name = EXCLUDED.brand_name;

-- ----------------------------------------------------------------------------
-- 4. AI MIGRATION CENTER & STAGING TABLES
-- ----------------------------------------------------------------------------
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

CREATE TABLE IF NOT EXISTS public.migration_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.migration_jobs(id) ON DELETE CASCADE,
  source_column VARCHAR(255) NOT NULL,
  target_column VARCHAR(255) NOT NULL,
  transformation_rule VARCHAR(100) DEFAULT 'NONE',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.migration_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.migration_jobs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  snapshot_before JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshot_after JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- ----------------------------------------------------------------------------
-- 5. ONBOARDING WIZARD SESSIONS
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 6. INTEGRACIÓN POS ↔ INVENTARIO ↔ WMS (FASE 11) & TABLAS WMS
-- ----------------------------------------------------------------------------
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

-- Garantizar existencia de inventory_locations y sus columnas multi-tenant
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

-- Inmunización: Garantizar que la columna tenant_id exista siempre si la tabla provenía de Fases 1-5
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

-- ----------------------------------------------------------------------------
-- 7. FUNCIONES SERVER-SIDE Y RPCS AUTORIZADAS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_check_tenant_slug_available(p_slug VARCHAR)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM public.tenants WHERE slug = lower(trim(p_slug))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_run_preactivation_checklist(p_session_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_session RECORD;
  v_slug_ok BOOLEAN;
  v_vertical_ok BOOLEAN;
  v_errors JSONB := '[]'::jsonb;
  v_is_valid BOOLEAN := true;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Acceso denegado: Se requieren privilegios de SUPERADMIN';
  END IF;

  SELECT * INTO v_session FROM public.tenant_onboarding_sessions WHERE id = p_session_id;
  IF v_session IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'errors', jsonb_build_array('Sesión de onboarding no encontrada'));
  END IF;

  v_slug_ok := public.rpc_check_tenant_slug_available(COALESCE(v_session.company_data->>'slug', ''));
  IF NOT v_slug_ok AND v_session.tenant_id IS NULL THEN
    v_is_valid := false;
    v_errors := v_errors || jsonb_build_array('El slug comercial ya se encuentra registrado por otro negocio');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.business_verticals WHERE code = (v_session.vertical_data->>'code')
  ) INTO v_vertical_ok;
  
  IF NOT v_vertical_ok THEN
    v_is_valid := false;
    v_errors := v_errors || jsonb_build_array('El rubro comercial seleccionado no existe en PostgreSQL');
  END IF;

  IF (v_session.users_data->>'admin_email') IS NULL OR (v_session.users_data->>'admin_email') = '' THEN
    v_is_valid := false;
    v_errors := v_errors || jsonb_build_array('Se debe definir un Administrador Principal para el Tenant');
  END IF;

  RETURN jsonb_build_object('valid', v_is_valid, 'errors', v_errors, 'checked_at', NOW());
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_activate_tenant_onboarding(p_session_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_session RECORD;
  v_checklist JSONB;
  v_new_tenant_id UUID;
BEGIN
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

  v_checklist := public.rpc_run_preactivation_checklist(p_session_id);
  IF NOT (v_checklist->>'valid')::boolean THEN
    RAISE EXCEPTION 'Checklist fallido: %', v_checklist->>'errors';
  END IF;

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

  UPDATE public.tenant_onboarding_sessions
  SET tenant_id = v_new_tenant_id,
      status = 'ACTIVE',
      checklist_result = v_checklist,
      activated_at = NOW(),
      updated_at = NOW()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true, 'tenant_id', v_new_tenant_id, 'activated_at', NOW());
END;
$$;

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

-- ----------------------------------------------------------------------------
-- 8. HABILITACIÓN DE ROW LEVEL SECURITY (RLS ESTRICTO E IDEMPOTENTE)
-- ----------------------------------------------------------------------------
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_verticals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;

-- Limpieza de políticas previas para ejecución 100% idempotente
DROP POLICY IF EXISTS "RLS tenants_select" ON public.tenants;
DROP POLICY IF EXISTS "RLS tenant_users_select" ON public.tenant_users;
DROP POLICY IF EXISTS "RLS business_verticals_select" ON public.business_verticals;
DROP POLICY IF EXISTS "RLS business_verticals_write" ON public.business_verticals;
DROP POLICY IF EXISTS "RLS tenant_profiles_select" ON public.tenant_profiles;
DROP POLICY IF EXISTS "RLS migration_jobs_isolation" ON public.migration_jobs;
DROP POLICY IF EXISTS "RLS tenant_onboarding_sessions_superadmin" ON public.tenant_onboarding_sessions;
DROP POLICY IF EXISTS "RLS inventory_balances_isolation" ON public.inventory_balances;
DROP POLICY IF EXISTS "RLS inventory_reservations_isolation" ON public.inventory_reservations;
DROP POLICY IF EXISTS "RLS inventory_ledger_isolation" ON public.inventory_ledger;
DROP POLICY IF EXISTS "RLS inventory_locations_isolation" ON public.inventory_locations;

CREATE POLICY "RLS tenants_select" ON public.tenants FOR SELECT USING (
  public.is_superadmin() OR public.is_tenant_member(id)
);

CREATE POLICY "RLS tenant_users_select" ON public.tenant_users FOR SELECT USING (
  public.is_superadmin() OR (user_id = auth.uid() AND active = true) OR public.is_tenant_member(tenant_id)
);

CREATE POLICY "RLS business_verticals_select" ON public.business_verticals FOR SELECT USING (true);
CREATE POLICY "RLS business_verticals_write" ON public.business_verticals FOR ALL USING (public.is_superadmin());

CREATE POLICY "RLS tenant_profiles_select" ON public.tenant_profiles FOR SELECT USING (
  public.is_superadmin() OR public.is_tenant_member(tenant_id)
);

CREATE POLICY "RLS migration_jobs_isolation" ON public.migration_jobs FOR ALL USING (
  public.is_superadmin() OR tenant_id IN (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.role IN ('ADMIN', 'SUPERADMIN') AND tu.active = true)
);

CREATE POLICY "RLS tenant_onboarding_sessions_superadmin" ON public.tenant_onboarding_sessions FOR ALL USING (public.is_superadmin());

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

-- Otorgar Permisos de Ejecución
GRANT SELECT ON public.business_verticals TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tenant_profiles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.migration_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_onboarding_sessions TO authenticated;
GRANT SELECT ON public.inventory_balances TO authenticated;
GRANT SELECT ON public.inventory_reservations TO authenticated;
GRANT SELECT ON public.inventory_ledger TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_locations TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_check_tenant_slug_available(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_run_preactivation_checklist(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_activate_tenant_onboarding(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_availability(UUID, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_sale_pos_direct_saas(UUID, VARCHAR, INT, VARCHAR, VARCHAR, VARCHAR) TO authenticated;
