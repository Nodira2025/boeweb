-- BÔ GROW CLUB — MIGRACIÓN 021: CORRECCIÓN DE MOVIMIENTOS DE CAJA EN VENTAS REPROCAM
-- Corrige la inserción en cash_movements_v2 dentro de record_reprocam_sale_v2 para
-- utilizar las columnas canónicas: description (en lugar de reason), movement_type ('SALE')
-- e idempotency_key obligatorio.

BEGIN;

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
      tenant_id, session_id, movement_type, direction, amount,
      description, reference_type, actor_user_id, idempotency_key, metadata
    ) VALUES (
      p_tenant_id, v_session_id, 'SALE', 'IN', v_subtotal,
      'Venta Reprocam: ' || v_prod.name || ' (' || p_quantity::text || ')',
      'SALE', v_actor, 'reprocam-sale-' || gen_random_uuid()::text,
      jsonb_build_object('product_id', p_product_id)
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

REVOKE ALL ON FUNCTION public.record_reprocam_sale_v2(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_reprocam_sale_v2(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated, service_role;

INSERT INTO public.schema_migrations (
  version,
  name,
  checksum,
  backward_compatible,
  applied_by
)
VALUES (
  '021',
  'fix_reprocam_cash_movements',
  'sha256-fix-reprocam-cash-movements-021-v1',
  true,
  'migration-engine'
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
