-- ============================================================================
-- BÔ GROW CLUB / PLATAFORMA SAAS — FASE 8: BUSINESS PROFILES & VERTICALS DDL
-- ============================================================================

-- 1. TABLA DE RUBROS / VERTICALES COMERCIALES (FUENTE ÚNICA DE VERDAD EN POSTGRESQL)
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

-- 2. TABLA DE PERFILES DE EMPRESA / TENANT PROFILES (CON BORRADOR & PUBLICACIÓN)
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

-- 3. SEMBRADO DE RUBROS COMERCIALES CON ESQUEMA ESTRUCTURADO DE ATRIBUTOS (JSONB)
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
  attribute_schema = EXCLUDED.attribute_schema,
  barcode_enrichment_config = EXCLUDED.barcode_enrichment_config,
  ai_prompt_context = EXCLUDED.ai_prompt_context,
  category_suggestions = EXCLUDED.category_suggestions;

-- 4. SEMBRADO DE PERFILES DE TENANT INICIALES
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
ON CONFLICT (tenant_id) DO UPDATE SET
  brand_name = EXCLUDED.brand_name,
  primary_color = EXCLUDED.primary_color,
  accent_color = EXCLUDED.accent_color,
  vertical_code = EXCLUDED.vertical_code,
  terminology = EXCLUDED.terminology;

-- 5. POLÍTICAS RLS DE SEGURIDAD
ALTER TABLE public.business_verticals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_profiles ENABLE ROW LEVEL SECURITY;

-- business_verticals: Lectura libre; Modificación exclusiva por SUPERADMIN
CREATE POLICY "RLS business_verticals_select" ON public.business_verticals
  FOR SELECT USING (true);

CREATE POLICY "RLS business_verticals_write" ON public.business_verticals
  FOR ALL USING (public.is_superadmin());

-- tenant_profiles: Lectura para miembros del tenant o superadmin; Modificación para ADMIN o SUPERADMIN
CREATE POLICY "RLS tenant_profiles_select" ON public.tenant_profiles
  FOR SELECT USING (
    public.is_superadmin() OR
    tenant_id IN (
      SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.active = true
    )
  );

CREATE POLICY "RLS tenant_profiles_write" ON public.tenant_profiles
  FOR ALL USING (
    public.is_superadmin() OR
    tenant_id IN (
      SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() AND tu.role IN ('ADMIN', 'SUPERADMIN') AND tu.active = true
    )
  );

GRANT SELECT ON public.business_verticals TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tenant_profiles TO anon, authenticated;
