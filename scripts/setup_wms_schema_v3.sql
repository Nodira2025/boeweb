-- =============================================================================
-- BÔ GROW CLUB — ESQUEMA PARALELO WMS (FASE 1 A FASE 5)
-- Arquitectura de localización, trazabilidad inmutable y auditoría física.
-- NO altera product_locations, supplier_products ni la capa de ventas commercial.
-- =============================================================================

BEGIN;

-- 1. Módulos Físicos con QR de Estantería
CREATE TABLE IF NOT EXISTS public.store_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL, -- Código de ubicación / QR (ej: 'PI-M04')
    sector_name TEXT NOT NULL DEFAULT 'Botánica', -- Ej: 'Electricidad', 'Botánica', 'Depósito'
    wall_code TEXT NOT NULL DEFAULT 'PI', -- 'PI', 'PT', 'PD', 'VF', 'DP'
    module_number SMALLINT NOT NULL DEFAULT 1 CHECK (module_number BETWEEN 1 AND 20),
    max_levels SMALLINT NOT NULL DEFAULT 5 CHECK (max_levels BETWEEN 1 AND 10),
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 2. Ubicación Física de Inventario (Multi-Ubicación: 1 Producto -> N Módulos)
CREATE TABLE IF NOT EXISTS public.inventory_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID NOT NULL REFERENCES public.store_modules(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    product_code TEXT NOT NULL,
    name TEXT NOT NULL,
    barcode TEXT,
    image_url TEXT,
    human_level SMALLINT NOT NULL DEFAULT 3 CHECK (human_level BETWEEN 1 AND 5), -- 1=abajo, 2=bajo, 3=media, 4=alto, 5=arriba
    sector_position TEXT NOT NULL DEFAULT 'C' CHECK (sector_position IN ('I', 'C', 'D')), -- 'I'=Izquierda, 'C'=Centro, 'D'=Derecha
    quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT inventory_locations_unique_pos UNIQUE (module_id, product_id, human_level, sector_position)
);

CREATE INDEX IF NOT EXISTS idx_inv_loc_product ON public.inventory_locations (product_id, product_code);
CREATE INDEX IF NOT EXISTS idx_inv_loc_module ON public.inventory_locations (module_id);

-- 3. Historial Inmutable de Movimientos (Append-Only)
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movement_type TEXT NOT NULL CHECK (movement_type IN ('INGRESO', 'TRANSFERENCIA', 'RETIRO', 'AJUSTE_AUDITORIA')),
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    origin_module_id UUID REFERENCES public.store_modules(id),
    origin_module_code TEXT,
    origin_level SMALLINT,
    origin_sector TEXT,
    destination_module_id UUID REFERENCES public.store_modules(id),
    destination_module_code TEXT,
    destination_level SMALLINT,
    destination_sector TEXT,
    user_name TEXT NOT NULL DEFAULT 'Vendedor Local',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_inv_mov_product ON public.inventory_movements (product_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_created ON public.inventory_movements (created_at DESC);

-- 4. Cabecera de Auditorías Físicas
CREATE TABLE IF NOT EXISTS public.inventory_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID NOT NULL REFERENCES public.store_modules(id),
    module_code TEXT NOT NULL,
    auditor_user TEXT NOT NULL DEFAULT 'Vendedor Local',
    status TEXT NOT NULL DEFAULT 'CORRECTO' CHECK (status IN ('CORRECTO', 'PENDIENTE_APROBACION', 'APROBADO', 'RECHAZADO')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 5. Detalle de Items Auditados por Módulo
CREATE TABLE IF NOT EXISTS public.inventory_audit_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id UUID NOT NULL REFERENCES public.inventory_audits(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    product_code TEXT NOT NULL,
    product_name TEXT NOT NULL,
    expected_qty INT NOT NULL CHECK (expected_qty >= 0),
    found_qty INT NOT NULL CHECK (found_qty >= 0),
    difference INT NOT NULL, -- found_qty - expected_qty
    human_level SMALLINT NOT NULL DEFAULT 3,
    sector_position TEXT NOT NULL DEFAULT 'C',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 6. Sembrado de Módulos de Muestra Coherentes con el Local
INSERT INTO public.store_modules (code, sector_name, wall_code, module_number, max_levels, description) VALUES
('PI-M01', 'Fertilizantes y Nutrición', 'PI', 1, 5, 'Pared Izquierda - Módulo 1 (Fertilizantes orgánicos)'),
('PI-M02', 'Nutrición Vegetal', 'PI', 2, 5, 'Pared Izquierda - Módulo 2 (Bioestimulantes)'),
('PI-M03', 'Sustratos y Enmiendas', 'PI', 3, 5, 'Pared Izquierda - Módulo 3 (Sustratos Klasmann/Grow)'),
('PI-M04', 'Módulo Principal Botánico', 'PI', 4, 5, 'Pared Izquierda - Módulo 4 (Control de plagas y preventivos)'),
('PT-M01', 'Luz e Iluminación Indoor', 'PT', 1, 5, 'Pared Trasera - Módulo 1 (Paneles LED y Kits)'),
('PT-M02', 'Ventilación y Clima', 'PT', 2, 5, 'Pared Trasera - Módulo 2 (Extractores y filtros)'),
('PD-M01', 'Macetas y Riego', 'PD', 1, 5, 'Pared Derecha - Módulo 1 (Macetas geotextiles)'),
('PD-M02', 'Accesorios de Cultivo', 'PD', 2, 5, 'Pared Derecha - Módulo 2 (Tijeras y medidores)'),
('DEP-M01', 'Depósito Insumos Pesados', 'DP', 1, 5, 'Depósito - Módulo 1 (Sustratos 50L en pallets)'),
('DEP-M02', 'Depósito Reserva General', 'DP', 2, 5, 'Depósito - Módulo 2 (Reserva de seguridad)')
ON CONFLICT (code) DO UPDATE SET active = true;

-- 7. Habilitar RLS en Tablas WMS
ALTER TABLE public.store_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_audit_items ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS Permisivas para Operación Local de Vendedores (anon & authenticated)
DROP POLICY IF EXISTS "WMS leer módulos" ON public.store_modules;
CREATE POLICY "WMS leer módulos" ON public.store_modules FOR SELECT USING (true);
DROP POLICY IF EXISTS "WMS admin módulos" ON public.store_modules;
CREATE POLICY "WMS admin módulos" ON public.store_modules FOR ALL USING (true);

DROP POLICY IF EXISTS "WMS leer ubicaciones" ON public.inventory_locations;
CREATE POLICY "WMS leer ubicaciones" ON public.inventory_locations FOR SELECT USING (true);
DROP POLICY IF EXISTS "WMS escribir ubicaciones" ON public.inventory_locations;
CREATE POLICY "WMS escribir ubicaciones" ON public.inventory_locations FOR ALL USING (true);

DROP POLICY IF EXISTS "WMS leer movimientos" ON public.inventory_movements;
CREATE POLICY "WMS leer movimientos" ON public.inventory_movements FOR SELECT USING (true);
DROP POLICY IF EXISTS "WMS registrar movimientos" ON public.inventory_movements;
CREATE POLICY "WMS registrar movimientos" ON public.inventory_movements FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "WMS leer auditorías" ON public.inventory_audits;
CREATE POLICY "WMS leer auditorías" ON public.inventory_audits FOR SELECT USING (true);
DROP POLICY IF EXISTS "WMS escribir auditorías" ON public.inventory_audits;
CREATE POLICY "WMS escribir auditorías" ON public.inventory_audits FOR ALL USING (true);

DROP POLICY IF EXISTS "WMS leer audit items" ON public.inventory_audit_items;
CREATE POLICY "WMS leer audit items" ON public.inventory_audit_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "WMS escribir audit items" ON public.inventory_audit_items;
CREATE POLICY "WMS escribir audit items" ON public.inventory_audit_items FOR ALL USING (true);

GRANT ALL ON public.store_modules TO anon, authenticated;
GRANT ALL ON public.inventory_locations TO anon, authenticated;
GRANT ALL ON public.inventory_movements TO anon, authenticated;
GRANT ALL ON public.inventory_audits TO anon, authenticated;
GRANT ALL ON public.inventory_audit_items TO anon, authenticated;

-- 8. Función Transaccional RPC: rpc_mover_producto
CREATE OR REPLACE FUNCTION public.rpc_mover_producto(
    p_product_id TEXT,
    p_origin_module_code TEXT,
    p_origin_level SMALLINT,
    p_origin_sector TEXT,
    p_destination_module_code TEXT,
    p_destination_level SMALLINT,
    p_destination_sector TEXT,
    p_quantity INT,
    p_user_name TEXT DEFAULT 'Vendedor Local'
) RETURNS JSONB AS $$
DECLARE
    v_origin_module RECORD;
    v_dest_module RECORD;
    v_origin_loc RECORD;
    v_product_name TEXT;
    v_product_code TEXT;
    v_barcode TEXT;
    v_image_url TEXT;
BEGIN
    -- Validaciones de Entrada
    IF p_quantity <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'La cantidad debe ser mayor a cero.');
    END IF;

    IF p_origin_module_code = p_destination_module_code 
       AND p_origin_level = p_destination_level 
       AND p_origin_sector = p_destination_sector THEN
        RETURN jsonb_build_object('success', false, 'error', 'El módulo y posición de origen y destino no pueden ser idénticos.');
    END IF;

    -- Buscar Módulo Origen
    SELECT * INTO v_origin_module FROM public.store_modules WHERE code = p_origin_module_code AND active = true;
    IF v_origin_module IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El módulo origen no existe o está inactivo.');
    END IF;

    -- Buscar Módulo Destino
    SELECT * INTO v_dest_module FROM public.store_modules WHERE code = p_destination_module_code AND active = true;
    IF v_dest_module IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El módulo destino no existe o está inactivo.');
    END IF;

    -- Bloquear y Obtener Fila de Ubicación Origen (FOR UPDATE para Concurrencia)
    SELECT * INTO v_origin_loc FROM public.inventory_locations
    WHERE module_id = v_origin_module.id
      AND product_id = p_product_id
      AND human_level = p_origin_level
      AND sector_position = p_origin_sector
    FOR UPDATE;

    IF v_origin_loc IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No existe el producto en el módulo y posición origen especificados.');
    END IF;

    IF v_origin_loc.quantity < p_quantity THEN
        RETURN jsonb_build_object('success', false, 'error', format('Stock insuficiente en origen. Disponible: %s unidades.', v_origin_loc.quantity));
    END IF;

    v_product_name := v_origin_loc.name;
    v_product_code := v_origin_loc.product_code;
    v_barcode := v_origin_loc.barcode;
    v_image_url := v_origin_loc.image_url;

    -- Descontar Origen
    UPDATE public.inventory_locations
    SET quantity = quantity - p_quantity,
        updated_at = timezone('utc', now())
    WHERE id = v_origin_loc.id;

    -- Eliminar registro origen si quedó en 0 para mantener limpio el inventario
    DELETE FROM public.inventory_locations WHERE id = v_origin_loc.id AND quantity = 0;

    -- Incrementar / Insertar Destino (ON CONFLICT maneja concurrencia de destino)
    INSERT INTO public.inventory_locations (
        module_id, product_id, product_code, name, barcode, image_url, human_level, sector_position, quantity
    ) VALUES (
        v_dest_module.id, p_product_id, v_product_code, v_product_name, v_barcode, v_image_url, p_destination_level, p_destination_sector, p_quantity
    )
    ON CONFLICT (module_id, product_id, human_level, sector_position)
    DO UPDATE SET 
        quantity = public.inventory_locations.quantity + p_quantity,
        updated_at = timezone('utc', now());

    -- Registrar Movimiento Inmutable (Append-Only)
    INSERT INTO public.inventory_movements (
        movement_type, product_id, product_name, quantity,
        origin_module_id, origin_module_code, origin_level, origin_sector,
        destination_module_id, destination_module_code, destination_level, destination_sector,
        user_name
    ) VALUES (
        'TRANSFERENCIA', p_product_id, v_product_name, p_quantity,
        v_origin_module.id, p_origin_module_code, p_origin_level, p_origin_sector,
        v_dest_module.id, p_destination_module_code, p_destination_level, p_destination_sector,
        p_user_name
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', format('Movidos %s unidades de %s desde %s a %s', p_quantity, v_product_name, p_origin_module_code, p_destination_module_code)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;
NOTIFY pgrst, 'reload schema';
