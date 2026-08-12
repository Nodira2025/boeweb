-- BÔ Grow Club · Compatibilidad de ingreso y ubicación de stock
-- Seguro para instalaciones existentes: no elimina tablas ni registros.

BEGIN;

-- 1. Completar product_drafts sin perder los borradores existentes.
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
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS floor_level SMALLINT;
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS shelf_code TEXT;
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS shelf_level SMALLINT;
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(4, 3);
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS ai_payload JSONB;
ALTER TABLE public.product_drafts ADD COLUMN IF NOT EXISTS qr_payload TEXT;

-- La foto es opcional cuando el producto fue identificado por código de barras.
ALTER TABLE public.product_drafts ALTER COLUMN image_url DROP NOT NULL;
ALTER TABLE public.product_drafts ALTER COLUMN image_path DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS product_drafts_product_code_idx
ON public.product_drafts (product_code)
WHERE product_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS product_drafts_barcode_idx
ON public.product_drafts (barcode)
WHERE barcode IS NOT NULL;

-- 2. Crear el mapa de estantes si esta instalación todavía no lo tiene.
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

INSERT INTO public.store_shelves
  (code, name, zone_code, floor_level, x, y, width, height)
VALUES
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

-- 3. Crear la tabla de ubicaciones compartida entre celulares y PC.
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
  area_name TEXT,
  wall_side TEXT,
  shelf_position TEXT,
  placement_photo_url TEXT,
  placement_photo_path TEXT,
  location_label TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS product_locations_shelf_idx
ON public.product_locations (floor_level, shelf_code, shelf_level);

CREATE INDEX IF NOT EXISTS product_locations_barcode_idx
ON public.product_locations (barcode)
WHERE barcode IS NOT NULL;

-- 4. Permisos mínimos que necesita el portal de vendedores.
ALTER TABLE public.product_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_shelves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "BÔ leer borradores" ON public.product_drafts;
CREATE POLICY "BÔ leer borradores"
ON public.product_drafts FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "BÔ insertar borradores" ON public.product_drafts;
CREATE POLICY "BÔ insertar borradores"
ON public.product_drafts FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "BÔ actualizar borradores" ON public.product_drafts;
CREATE POLICY "BÔ actualizar borradores"
ON public.product_drafts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "BÔ leer estantes" ON public.store_shelves;
CREATE POLICY "BÔ leer estantes"
ON public.store_shelves FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "BÔ guardar estantes" ON public.store_shelves;
CREATE POLICY "BÔ guardar estantes"
ON public.store_shelves FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "BÔ actualizar estantes" ON public.store_shelves;
CREATE POLICY "BÔ actualizar estantes"
ON public.store_shelves FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "BÔ leer ubicaciones" ON public.product_locations;
CREATE POLICY "BÔ leer ubicaciones"
ON public.product_locations FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "BÔ guardar ubicaciones" ON public.product_locations;
CREATE POLICY "BÔ guardar ubicaciones"
ON public.product_locations FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "BÔ actualizar ubicaciones" ON public.product_locations;
CREATE POLICY "BÔ actualizar ubicaciones"
ON public.product_locations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.product_drafts TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.store_shelves TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.product_locations TO anon, authenticated;

COMMIT;

-- Pedir a PostgREST que reconozca las tablas y columnas inmediatamente.
NOTIFY pgrst, 'reload schema';
