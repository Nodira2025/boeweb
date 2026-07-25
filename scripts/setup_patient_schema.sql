-- SQL Migration: Tablas para Trámites de Pacientes y Especialistas en Supabase
-- Copiá y pegá este código en el SQL Editor de tu panel de Supabase.

-- 1. Tabla de Especialistas
CREATE TABLE IF NOT EXISTS public.specialists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    specialty TEXT NOT NULL,
    license_number TEXT,
    whatsapp TEXT,
    available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabla de Solicitudes de Pacientes
CREATE TABLE IF NOT EXISTS public.patient_intakes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    patient_name TEXT NOT NULL,
    dni TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    province TEXT NOT NULL,
    procedure_type TEXT NOT NULL,
    specialist_id TEXT,
    specialist_name TEXT,
    notes TEXT,
    status TEXT DEFAULT 'pendiente',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS y políticas públicas para inserción
ALTER TABLE public.patient_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.specialists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir inserción pública de pacientes" ON public.patient_intakes FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir lectura pública de especialistas" ON public.specialists FOR SELECT USING (true);

-- Insertar especialistas por defecto
INSERT INTO public.specialists (id, name, specialty, license_number, available) VALUES
('psiq-1', 'Dra. M. Psiquiatra Evaluadora', 'Psiquiatría & Salud Mental', 'MP-10492', true),
('med-1', 'Dr. J. Evaluador REPROCANN', 'Medicina General & Clínica', 'MP-8921', true),
('grow-1', 'Equipo de Cultivo BÔ', 'Asesoría Técnica y Dosificación', 'BO-GROW', true)
ON CONFLICT (id) DO NOTHING;
