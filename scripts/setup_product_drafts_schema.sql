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

-- 2. Habilitar RLS en product_drafts
ALTER TABLE public.product_drafts ENABLE ROW LEVEL SECURITY;

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
