-- BÔ GROW CLUB — MIGRACIÓN 020: CATÁLOGO REPROCAM Y CAJA DEDICADA
-- Registra la terminal CAJA-REPROCAM y funciones de alta rápida y venta para productos
-- pesables a granel (gramos con 3 decimales) y fraccionados por unidad.

BEGIN;

-- 1. Registrar Terminal CAJA-REPROCAM si no existe
INSERT INTO public.cash_registers (
  tenant_id,
  code,
  name,
  location_id,
  currency,
  active,
  metadata
)
SELECT
  t.id,
  'CAJA-REPROCAM',
  'Caja Reprocam',
  (SELECT l.id FROM public.inventory_locations_v2 l WHERE l.tenant_id = t.id AND l.is_default = true LIMIT 1),
  'ARS',
  true,
  jsonb_build_object('is_reprocam', true, 'description', 'Caja registradora dedicada para productos medicinales y fraccionados Reprocam')
FROM public.tenants t
WHERE t.id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (tenant_id, code) DO UPDATE SET active = true;

-- 2. Función RPC para alta rápida de producto Reprocam
CREATE OR REPLACE FUNCTION public.upsert_reprocam_product_v2(
  p_tenant_id UUID,
  p_name TEXT,
  p_price NUMERIC,
  p_stock NUMERIC,
  p_unit TEXT DEFAULT 'g',
  p_product_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_unit TEXT := CASE lower(COALESCE(btrim(p_unit), 'g')) WHEN 'u' THEN 'u' WHEN 'unidad' THEN 'u' ELSE 'g' END;
  v_product_id UUID;
  v_sku TEXT;
  v_clean_name TEXT := btrim(COALESCE(p_name, ''));
  v_loc_id UUID;
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'VENDEDOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Rol operativo activo requerido para gestionar Reprocam.';
  END IF;

  IF length(v_clean_name) < 2 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El nombre del producto debe tener al menos 2 caracteres.';
  END IF;
  IF p_price IS NULL OR p_price < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El precio debe ser mayor o igual a cero.';
  END IF;
  IF p_stock IS NULL OR p_stock < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La cantidad de stock no puede ser negativa.';
  END IF;

  SELECT l.id INTO v_loc_id
  FROM public.inventory_locations_v2 l
  WHERE l.tenant_id = p_tenant_id AND l.is_default = true
  LIMIT 1;

  IF p_product_id IS NOT NULL THEN
    -- Actualización de producto existente
    UPDATE public.catalog_products
    SET name = v_clean_name,
        price = round(p_price, 2),
        metadata = metadata || jsonb_build_object(
          'is_reprocam', true,
          'reprocam_unit', v_unit,
          'reprocam_stock', round(p_stock, 3)
        ),
        updated_at = clock_timestamp(),
        updated_by = v_actor
    WHERE tenant_id = p_tenant_id AND id = p_product_id
    RETURNING id INTO v_product_id;
  ELSE
    -- Nuevo producto Reprocam
    v_sku := 'REP-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    INSERT INTO public.catalog_products (
      tenant_id,
      sku,
      name,
      category,
      price,
      currency,
      track_stock,
      metadata,
      created_by
    ) VALUES (
      p_tenant_id,
      v_sku,
      v_clean_name,
      'REPROCAM',
      round(p_price, 2),
      'ARS',
      true,
      jsonb_build_object(
        'is_reprocam', true,
        'reprocam_unit', v_unit,
        'reprocam_stock', round(p_stock, 3)
      ),
      v_actor
    )
    RETURNING id INTO v_product_id;
  END IF;

  -- Ajustar balance de inventario físico
  IF v_loc_id IS NOT NULL THEN
    INSERT INTO public.inventory_balances_v2 (
      tenant_id, product_id, location_id, on_hand, reserved, version
    ) VALUES (
      p_tenant_id, v_product_id, v_loc_id, round(p_stock, 3), 0, 1
    )
    ON CONFLICT (tenant_id, product_id, location_id)
    DO UPDATE SET on_hand = round(p_stock, 3), updated_at = clock_timestamp();
  END IF;

  RETURN jsonb_build_object(
    'product_id', v_product_id,
    'name', v_clean_name,
    'price', round(p_price, 2),
    'stock', round(p_stock, 3),
    'unit', v_unit,
    'success', true
  );
END;
$$;

-- 3. Función RPC para venta ágil en Caja Reprocam
CREATE OR REPLACE FUNCTION public.record_reprocam_sale_v2(
  p_tenant_id UUID,
  p_product_id UUID,
  p_quantity NUMERIC,
  p_unit_price NUMERIC,
  p_payment_method TEXT DEFAULT 'CASH',
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_prod public.catalog_products%ROWTYPE;
  v_loc_id UUID;
  v_register_id UUID;
  v_session_id UUID;
  v_subtotal NUMERIC(18,2);
  v_current_stock NUMERIC(18,3) := 0;
  v_new_stock NUMERIC(18,3);
  v_sale_id UUID;
  v_doc_number TEXT;
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR', 'VENDEDOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Rol operativo activo requerido para vender en Reprocam.';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La cantidad a vender debe ser mayor a cero.';
  END IF;

  -- 1. Verificar producto
  SELECT p.* INTO v_prod
  FROM public.catalog_products p
  WHERE p.tenant_id = p_tenant_id AND p.id = p_product_id
  FOR UPDATE;

  IF v_prod.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Producto Reprocam inexistente.';
  END IF;

  v_subtotal := round(p_quantity * COALESCE(p_unit_price, v_prod.price), 2);

  -- 2. Obtener caja registradora Reprocam
  SELECT r.id INTO v_register_id
  FROM public.cash_registers r
  WHERE r.tenant_id = p_tenant_id AND r.code = 'CAJA-REPROCAM'
  LIMIT 1;

  IF v_register_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Caja Reprocam no configurada en el sistema.';
  END IF;

  -- 3. Descontar stock
  SELECT l.id INTO v_loc_id
  FROM public.inventory_locations_v2 l
  WHERE l.tenant_id = p_tenant_id AND l.is_default = true
  LIMIT 1;

  IF v_loc_id IS NOT NULL THEN
    SELECT COALESCE(ib.on_hand, 0) INTO v_current_stock
    FROM public.inventory_balances_v2 ib
    WHERE ib.tenant_id = p_tenant_id AND ib.product_id = p_product_id AND ib.location_id = v_loc_id
    FOR UPDATE;

    IF v_current_stock < p_quantity THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Stock insuficiente en Reprocam. Disponible: ' || v_current_stock::text;
    END IF;

    v_new_stock := v_current_stock - round(p_quantity, 3);

    UPDATE public.inventory_balances_v2
    SET on_hand = v_new_stock, updated_at = clock_timestamp()
    WHERE tenant_id = p_tenant_id AND product_id = p_product_id AND location_id = v_loc_id;

    UPDATE public.catalog_products
    SET metadata = metadata || jsonb_build_object('reprocam_stock', v_new_stock),
        updated_at = clock_timestamp()
    WHERE tenant_id = p_tenant_id AND id = p_product_id;
  END IF;

  -- 4. Registrar movimiento en la sesión activa de Caja Reprocam si existe
  SELECT cs.id INTO v_session_id
  FROM public.cash_sessions_v2 cs
  WHERE cs.tenant_id = p_tenant_id AND cs.register_id = v_register_id AND cs.status = 'OPEN'
  ORDER BY cs.opened_at DESC
  LIMIT 1;

  IF v_session_id IS NOT NULL AND upper(COALESCE(p_payment_method, 'CASH')) = 'CASH' THEN
    INSERT INTO public.cash_movements_v2 (
      tenant_id, session_id, direction, amount, reason, reference_type, actor_user_id
    ) VALUES (
      p_tenant_id, v_session_id, 'IN', v_subtotal, 'Venta Reprocam: ' || v_prod.name || ' (' || p_quantity::text || ')', 'SALE', v_actor
    );
  END IF;

  -- 5. Auditoría
  v_doc_number := 'TKT-REP-' || to_char(clock_timestamp(), 'YYMMDDHH24MISS');

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'REPROCAM_SALE', 'CATALOG_PRODUCT', p_product_id,
    jsonb_build_object(
      'product_name', v_prod.name,
      'quantity', p_quantity,
      'unit_price', p_unit_price,
      'total', v_subtotal,
      'payment_method', p_payment_method,
      'stock_after', v_new_stock,
      'notes', p_notes
    )
  );

  RETURN jsonb_build_object(
    'document_number', v_doc_number,
    'product_id', p_product_id,
    'product_name', v_prod.name,
    'quantity', p_quantity,
    'total', v_subtotal,
    'stock_remaining', v_new_stock,
    'payment_method', p_payment_method,
    'success', true
  );
END;
$$;

-- Permisos
REVOKE ALL ON FUNCTION public.upsert_reprocam_product_v2(UUID, TEXT, NUMERIC, NUMERIC, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_reprocam_sale_v2(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_reprocam_product_v2(UUID, TEXT, NUMERIC, NUMERIC, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_reprocam_sale_v2(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated, service_role;

-- 4. Registrar migración
INSERT INTO public.schema_migrations (
  version,
  name,
  checksum,
  backward_compatible,
  applied_by
)
VALUES (
  '020',
  'reprocam_catalog_and_register',
  'sha256-reprocam-catalog-and-register-020-v1',
  true,
  'migration-engine'
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
