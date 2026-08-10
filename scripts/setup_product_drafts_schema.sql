-- Migration SQL: Tablas y Políticas RLS para Carga Rápida de Productos y Borradores (Vendedores & Admin)
-- Copiá y pegá este código en el SQL Editor de tu panel de Supabase.

-- 1. Crear Tabla product_drafts para Borradores de Vendedores
CREATE TABLE IF NOT EXISTS public.product_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_url TEXT NOT NULL,
    image_path TEXT NOT NULL,
    stock INTEGER NOT NULL CHECK (stock >= 0),
    location TEXT,
    observations TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING_REVIEW', -- 'PENDING_REVIEW', 'APPROVED', 'REJECTED'
    seller_name TEXT DEFAULT 'Vendedor Local',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.b Extender instalaciones existentes sin borrar ningún borrador.
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS product_code TEXT;
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS presentation TEXT;
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS official_url TEXT;
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS market_reference_url TEXT;
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS market_average_price NUMERIC(14, 2);
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS sale_price NUMERIC(14, 2);
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS floor_level SMALLINT CHECK (floor_level BETWEEN 1 AND 3);
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS shelf_code TEXT;
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS shelf_level SMALLINT CHECK (shelf_level BETWEEN 1 AND 3);
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(4, 3);
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS ai_payload JSONB;
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS qr_payload TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS product_drafts_product_code_idx
ON public.product_drafts (product_code)
WHERE product_code IS NOT NULL;

-- 1.c Mapa físico: una ficha por estante, incluida su foto real.
CREATE TABLE IF NOT EXISTS public.store_shelves (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'Estante',
    zone_code TEXT NOT NULL DEFAULT 'A',
    floor_level SMALLINT NOT NULL DEFAULT 1 CHECK (floor_level BETWEEN 1 AND 3),
    x NUMERIC(6, 2) NOT NULL DEFAULT 10,
    y NUMERIC(6, 2) NOT NULL DEFAULT 10,
    width NUMERIC(6, 2) NOT NULL DEFAULT 16,
    height NUMERIC(6, 2) NOT NULL DEFAULT 12,
    photo_url TEXT,
    photo_path TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- La ubicación se asocia al producto, no a cada unidad consumible.
CREATE TABLE IF NOT EXISTS public.product_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id TEXT NOT NULL,
    product_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    image_url TEXT,
    barcode TEXT,
    floor_level SMALLINT NOT NULL DEFAULT 1 CHECK (floor_level BETWEEN 1 AND 3),
    shelf_code TEXT NOT NULL REFERENCES public.store_shelves(code),
    shelf_level SMALLINT NOT NULL DEFAULT 2 CHECK (shelf_level BETWEEN 1 AND 3),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    qr_payload TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Detalle humano de ubicación para el asistente móvil. Las columnas son opcionales
-- para mantener compatibilidad con instalaciones anteriores.
ALTER TABLE public.product_locations ADD COLUMN IF NOT EXISTS area_name TEXT;
ALTER TABLE public.product_locations ADD COLUMN IF NOT EXISTS wall_side TEXT;
ALTER TABLE public.product_locations ADD COLUMN IF NOT EXISTS shelf_position TEXT;
ALTER TABLE public.product_locations ADD COLUMN IF NOT EXISTS placement_photo_url TEXT;
ALTER TABLE public.product_locations ADD COLUMN IF NOT EXISTS placement_photo_path TEXT;
ALTER TABLE public.product_locations ADD COLUMN IF NOT EXISTS location_label TEXT;

CREATE INDEX IF NOT EXISTS product_locations_shelf_idx
ON public.product_locations (floor_level, shelf_code, shelf_level);
CREATE INDEX IF NOT EXISTS product_locations_barcode_idx
ON public.product_locations (barcode)
WHERE barcode IS NOT NULL;

INSERT INTO public.store_shelves (code, name, zone_code, floor_level, x, y, width, height) VALUES
('A-1', 'Vitrina principal', 'A', 1, 16, 12, 18, 14),
('A-2', 'Vitrina secundaria', 'A', 1, 16, 37, 18, 14),
('B-1', 'Pasillo botánico norte', 'B', 1, 43, 12, 18, 14),
('B-2', 'Pasillo botánico sur', 'B', 1, 65, 12, 18, 14),
('C-1', 'Módulo indoor superior', 'C', 1, 79, 32, 12, 16),
('C-2', 'Módulo indoor inferior', 'C', 1, 79, 53, 12, 16),
('D-1', 'Semillas y productos reservados', 'D', 1, 31, 76, 18, 14),
('D-2', 'Depósito de insumos', 'D', 1, 53, 76, 18, 14),
('E-1', 'Coffee Lounge 1', 'E', 1, 41, 36, 10, 26),
('E-2', 'Coffee Lounge 2', 'E', 1, 55, 36, 10, 26)
ON CONFLICT (code) DO NOTHING;

-- 2. Habilitar RLS en product_drafts
ALTER TABLE public.product_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_shelves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_locations ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para Anon Key
DROP POLICY IF EXISTS "Permitir inserción de borradores para vendedores (anon)" ON public.product_drafts;
CREATE POLICY "Permitir inserción de borradores para vendedores (anon)" 
ON public.product_drafts FOR INSERT 
WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir lectura de borradores (anon)" ON public.product_drafts;
CREATE POLICY "Permitir lectura de borradores (anon)" 
ON public.product_drafts FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Permitir actualización de borradores para admin (anon)" ON public.product_drafts;
CREATE POLICY "Permitir actualización de borradores para admin (anon)" 
ON public.product_drafts FOR UPDATE 
USING (true);

DROP POLICY IF EXISTS "Permitir lectura del mapa (anon)" ON public.store_shelves;
CREATE POLICY "Permitir lectura del mapa (anon)"
ON public.store_shelves FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir alta de estantes (anon)" ON public.store_shelves;
CREATE POLICY "Permitir alta de estantes (anon)"
ON public.store_shelves FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir actualización del mapa (anon)" ON public.store_shelves;
CREATE POLICY "Permitir actualización del mapa (anon)"
ON public.store_shelves FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir lectura de ubicaciones (anon)" ON public.product_locations;
CREATE POLICY "Permitir lectura de ubicaciones (anon)"
ON public.product_locations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir alta de ubicaciones (anon)" ON public.product_locations;
CREATE POLICY "Permitir alta de ubicaciones (anon)"
ON public.product_locations FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir actualización de ubicaciones (anon)" ON public.product_locations;
CREATE POLICY "Permitir actualización de ubicaciones (anon)"
ON public.product_locations FOR UPDATE USING (true) WITH CHECK (true);

-- 3. Crear Bucket de Storage 'product-images' si no existe
INSERT INTO storage.buckets (id, name, public) 
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de Storage RLS para Anon Key
DROP POLICY IF EXISTS "Permitir upload público en product-images" ON storage.objects;
CREATE POLICY "Permitir upload público en product-images" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Permitir lectura pública de product-images" ON storage.objects;
CREATE POLICY "Permitir lectura pública de product-images" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'product-images');
