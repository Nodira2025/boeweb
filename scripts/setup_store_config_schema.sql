-- SQL Migration: Tablas para Configuración de Pasarelas de Pago y Registro de Pedidos en Supabase
-- Copiá y pegá este código en el SQL Editor de tu panel de Supabase.

-- 1. Tabla de Configuración de Tienda y Pasarelas de Pago
CREATE TABLE IF NOT EXISTS public.store_config (
    id TEXT PRIMARY KEY,
    config_json JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabla de Registro Consolidado de Pedidos Web
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    delivery_type TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL,
    items_json JSONB NOT NULL,
    status TEXT DEFAULT 'pendiente',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.store_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura y escritura pública de store_config" ON public.store_config FOR ALL USING (true);
CREATE POLICY "Permitir inserción pública de órdenes" ON public.orders FOR INSERT WITH CHECK (true);
