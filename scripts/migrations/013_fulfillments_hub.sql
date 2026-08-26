-- ===========================================================================
-- BÔ GROW CLUB / PLATAFORMA SAAS — MIGRACIÓN 013: FULFILLMENTS HUB V2
-- ===========================================================================
-- Expone una bandeja tenant-scoped de encargos y una máquina de estados
-- explícita. Los ítems de venta permanecen inmutables: el estado vivo reside
-- únicamente en sale_fulfillments_v2 y cada transición queda auditada.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.list_sale_fulfillments_v2(
  p_tenant_id UUID,
  p_status_filter TEXT DEFAULT NULL,
  p_query TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_status TEXT := NULLIF(upper(btrim(COALESCE(p_status_filter, ''))), '');
  v_query TEXT := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_total BIGINT := 0;
  v_items JSONB := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.status = 'ACTIVE'
  ) OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['VENDEDOR', 'SUPERVISOR', 'ADMIN']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Acceso denegado al modulo de entregas.';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN (
    'PENDING', 'ORDERED', 'IN_TRANSIT', 'READY_FOR_PICKUP', 'FULFILLED', 'CANCELLED'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Filtro de estado invalido.';
  END IF;
  IF v_query IS NOT NULL AND length(v_query) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La busqueda no puede superar 120 caracteres.';
  END IF;

  SELECT count(*)
  INTO v_total
  FROM public.sale_fulfillments_v2 f
  JOIN public.sales_v2 s
    ON s.tenant_id = f.tenant_id AND s.id = f.sale_id
  JOIN public.sale_items_v2 si
    ON si.tenant_id = f.tenant_id AND si.id = f.sale_item_id
  LEFT JOIN public.customers c
    ON c.tenant_id = f.tenant_id AND c.id = s.customer_id
  WHERE f.tenant_id = p_tenant_id
    AND (v_status IS NULL OR f.status = v_status)
    AND (
      v_query IS NULL
      OR si.product_name_snapshot ILIKE '%' || v_query || '%'
      OR si.product_sku_snapshot ILIKE '%' || v_query || '%'
      OR s.sale_number::TEXT ILIKE '%' || v_query || '%'
      OR COALESCE(c.display_name, '') ILIKE '%' || v_query || '%'
      OR COALESCE(c.phone, '') ILIKE '%' || v_query || '%'
    );

  WITH page AS (
    SELECT
      f.*, s.sale_number, s.created_at AS sale_created_at, s.customer_id,
      c.display_name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
      si.product_id, si.product_name_snapshot, si.product_sku_snapshot,
      si.quantity, si.unit_price, si.line_total
    FROM public.sale_fulfillments_v2 f
    JOIN public.sales_v2 s
      ON s.tenant_id = f.tenant_id AND s.id = f.sale_id
    JOIN public.sale_items_v2 si
      ON si.tenant_id = f.tenant_id AND si.id = f.sale_item_id
    LEFT JOIN public.customers c
      ON c.tenant_id = f.tenant_id AND c.id = s.customer_id
    WHERE f.tenant_id = p_tenant_id
      AND (v_status IS NULL OR f.status = v_status)
      AND (
        v_query IS NULL
        OR si.product_name_snapshot ILIKE '%' || v_query || '%'
        OR si.product_sku_snapshot ILIKE '%' || v_query || '%'
        OR s.sale_number::TEXT ILIKE '%' || v_query || '%'
        OR COALESCE(c.display_name, '') ILIKE '%' || v_query || '%'
        OR COALESCE(c.phone, '') ILIKE '%' || v_query || '%'
      )
    ORDER BY
      CASE f.status
        WHEN 'READY_FOR_PICKUP' THEN 1
        WHEN 'IN_TRANSIT' THEN 2
        WHEN 'ORDERED' THEN 3
        WHEN 'PENDING' THEN 4
        WHEN 'FULFILLED' THEN 5
        ELSE 6
      END,
      f.created_at DESC,
      f.id
    LIMIT v_limit OFFSET v_offset
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'sale_id', sale_id,
      'sale_item_id', sale_item_id,
      'sale_number', sale_number,
      'sale_created_at', sale_created_at,
      'customer_id', customer_id,
      'customer_name', COALESCE(customer_name, 'Consumidor Final'),
      'customer_phone', COALESCE(customer_phone, ''),
      'customer_email', COALESCE(customer_email, ''),
      'product_id', product_id,
      'product_name', product_name_snapshot,
      'product_sku', product_sku_snapshot,
      'quantity', quantity,
      'unit_price', unit_price,
      'line_total', line_total,
      'line_type', line_type,
      'status', status,
      'expected_delivery_date', expected_delivery_date,
      'source_name', source_name,
      'notes', notes,
      'fulfilled_at', fulfilled_at,
      'created_at', created_at,
      'updated_at', updated_at
    ) ORDER BY
      CASE status
        WHEN 'READY_FOR_PICKUP' THEN 1
        WHEN 'IN_TRANSIT' THEN 2
        WHEN 'ORDERED' THEN 3
        WHEN 'PENDING' THEN 4
        WHEN 'FULFILLED' THEN 5
        ELSE 6
      END,
      created_at DESC,
      id
  ), '[]'::jsonb)
  INTO v_items
  FROM page;

  RETURN jsonb_build_object(
    'total_count', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'items', v_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_sale_fulfillment_v2(
  p_tenant_id UUID,
  p_fulfillment_id UUID,
  p_new_status TEXT,
  p_notes TEXT DEFAULT NULL,
  p_fulfilled_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_fulfillment public.sale_fulfillments_v2%ROWTYPE;
  v_status TEXT := upper(btrim(COALESCE(p_new_status, '')));
  v_notes TEXT := NULLIF(btrim(COALESCE(p_notes, '')), '');
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.status = 'ACTIVE'
  ) OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['VENDEDOR', 'SUPERVISOR', 'ADMIN']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Acceso denegado para actualizar entregas.';
  END IF;
  IF p_fulfilled_by IS NOT NULL AND p_fulfilled_by <> auth.uid() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No se puede atribuir la entrega a otro usuario.';
  END IF;
  IF v_status NOT IN ('PENDING', 'ORDERED', 'IN_TRANSIT', 'READY_FOR_PICKUP', 'FULFILLED', 'CANCELLED') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Estado de entrega invalido.';
  END IF;
  IF v_notes IS NOT NULL AND length(v_notes) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Las notas no pueden superar 1000 caracteres.';
  END IF;

  SELECT * INTO v_fulfillment
  FROM public.sale_fulfillments_v2
  WHERE tenant_id = p_tenant_id AND id = p_fulfillment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Entrega no encontrada.';
  END IF;

  IF v_fulfillment.status = v_status THEN
    RETURN jsonb_build_object(
      'ok', true,
      'id', p_fulfillment_id,
      'previous_status', v_fulfillment.status,
      'new_status', v_status,
      'updated_at', v_fulfillment.updated_at,
      'idempotent', true
    );
  END IF;
  IF NOT (
    (v_fulfillment.status = 'PENDING' AND v_status IN ('ORDERED', 'CANCELLED'))
    OR (v_fulfillment.status = 'ORDERED' AND v_status IN ('IN_TRANSIT', 'CANCELLED'))
    OR (v_fulfillment.status = 'IN_TRANSIT' AND v_status IN ('READY_FOR_PICKUP', 'CANCELLED'))
    OR (v_fulfillment.status = 'READY_FOR_PICKUP' AND v_status IN ('FULFILLED', 'CANCELLED'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Transicion de entrega no permitida.';
  END IF;

  UPDATE public.sale_fulfillments_v2
  SET status = v_status,
      notes = COALESCE(v_notes, notes),
      updated_at = v_now,
      fulfilled_at = CASE WHEN v_status = 'FULFILLED' THEN v_now ELSE NULL END,
      fulfilled_by = CASE WHEN v_status = 'FULFILLED' THEN auth.uid() ELSE NULL END
  WHERE tenant_id = p_tenant_id AND id = p_fulfillment_id;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data, metadata
  ) VALUES (
    p_tenant_id, auth.uid(), 'SALE_FULFILLMENT_STATUS_CHANGED', 'SALE_FULFILLMENT_V2', p_fulfillment_id,
    jsonb_build_object('status', v_fulfillment.status, 'notes', v_fulfillment.notes),
    jsonb_build_object('status', v_status, 'notes', COALESCE(v_notes, v_fulfillment.notes)),
    jsonb_build_object('sale_id', v_fulfillment.sale_id, 'sale_item_id', v_fulfillment.sale_item_id)
  );

  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'SALE_FULFILLMENT_V2', p_fulfillment_id, 'SALE_FULFILLMENT_STATUS_CHANGED',
    jsonb_build_object(
      'fulfillment_id', p_fulfillment_id,
      'sale_id', v_fulfillment.sale_id,
      'previous_status', v_fulfillment.status,
      'new_status', v_status
    ),
    'fulfillment:' || p_fulfillment_id::TEXT || ':' || v_status
  ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'id', p_fulfillment_id,
    'previous_status', v_fulfillment.status,
    'new_status', v_status,
    'updated_at', v_now,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_sale_fulfillments_v2(UUID, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_sale_fulfillment_v2(UUID, UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_sale_fulfillments_v2(UUID, TEXT, TEXT, INTEGER, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_sale_fulfillment_v2(UUID, UUID, TEXT, TEXT, UUID) TO authenticated, service_role;

INSERT INTO public.schema_migrations (version, name, checksum, backward_compatible, applied_by)
VALUES ('013', 'fulfillments_hub', 'sha256-fulfillments-hub-013-v2', true, 'migration-engine')
ON CONFLICT (version) DO NOTHING;

COMMIT;
