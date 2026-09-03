-- BÔ GROW CLUB — MIGRACIÓN 019: REVISIÓN DE ARQUEO POR ADMINISTRADOR (SOLO TURNOS / DUEÑO)
-- Permite que un usuario con rol ADMIN o SUPERADMIN pueda validar y aprobar su propio
-- cierre de arqueo de caja (review_cash_closure_v2) cuando opera el turno en solitario,
-- manteniendo intacto el Principio de Cuatro Ojos obligatorio para vendedores y supervisores regulares.

BEGIN;

CREATE OR REPLACE FUNCTION public.review_cash_closure_v2(
  p_tenant_id UUID,
  p_closure_id UUID,
  p_decision TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_decision TEXT := CASE upper(COALESCE(btrim(p_decision), ''))
    WHEN 'APPROVE' THEN 'APPROVED'
    WHEN 'APPROVED' THEN 'APPROVED'
    WHEN 'REJECT' THEN 'REJECTED'
    WHEN 'REJECTED' THEN 'REJECTED'
    ELSE NULL
  END;
  v_closure public.cash_closures%ROWTYPE;
  v_before JSONB;
  v_is_admin BOOLEAN := false;
BEGIN
  IF v_actor IS NULL OR NOT public.operational_has_tenant_role(
    p_tenant_id, ARRAY['ADMIN', 'SUPERVISOR']::TEXT[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo ADMIN o SUPERVISOR puede revisar cierres.';
  END IF;
  IF v_decision IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Decision de revision invalida.';
  END IF;
  IF v_decision = 'REJECTED' AND NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El rechazo requiere motivo.';
  END IF;

  -- Comprobar si el actor es Administrador o Superadmin
  v_is_admin := (
    public.operational_has_tenant_role(p_tenant_id, ARRAY['ADMIN']::TEXT[])
    OR public.is_superadmin()
  );

  SELECT cc.* INTO v_closure
  FROM public.cash_closures cc
  WHERE cc.tenant_id = p_tenant_id AND cc.id = p_closure_id
  FOR UPDATE;
  IF v_closure.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Cierre inexistente o ajeno al tenant.';
  END IF;

  -- Regla Four-Eyes: Quien cerró la caja no puede revisar su propio cierre,
  -- A MENOS que sea ADMIN o SUPERADMIN (cobertura de turno de titular/dueño).
  IF v_closure.closed_by = v_actor AND NOT v_is_admin THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Quien cerro la caja no puede revisar su propio cierre.';
  END IF;

  IF v_closure.review_status <> 'PENDING_REVIEW' THEN
    IF v_closure.review_status = v_decision THEN
      RETURN jsonb_build_object(
        'closure_id', v_closure.id, 'review_status', v_closure.review_status,
        'reviewed_by', v_closure.reviewed_by, 'idempotent', true
      );
    END IF;
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'El cierre ya posee una revision diferente.';
  END IF;

  v_before := to_jsonb(v_closure);
  UPDATE public.cash_closures
  SET review_status = v_decision, reviewed_by = v_actor,
      reviewed_at = clock_timestamp(),
      review_reason = COALESCE(
        NULLIF(btrim(p_reason), ''),
        CASE WHEN v_closure.closed_by = v_actor THEN 'Auto-aprobado por Administrador titular' ELSE NULL END
      )
  WHERE tenant_id = p_tenant_id AND id = p_closure_id
  RETURNING * INTO v_closure;

  INSERT INTO public.operational_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    p_tenant_id, v_actor, 'CASH_CLOSURE_' || v_decision, 'CASH_CLOSURE', p_closure_id,
    v_before, to_jsonb(v_closure)
  );
  INSERT INTO public.outbox_events (
    tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key
  ) VALUES (
    p_tenant_id, 'CASH_CLOSURE', p_closure_id, 'CASH_CLOSURE_' || v_decision,
    jsonb_build_object('closure_id', p_closure_id, 'decision', v_decision, 'reviewed_by', v_actor, 'self_reviewed', v_closure.closed_by = v_actor),
    'cash-review:' || p_closure_id::text || ':' || v_decision
  );

  RETURN jsonb_build_object(
    'closure_id', v_closure.id, 'review_status', v_closure.review_status,
    'reviewed_by', v_closure.reviewed_by, 'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_cash_closure_v2(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_cash_closure_v2(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;

INSERT INTO public.schema_migrations (
  version,
  name,
  checksum,
  backward_compatible,
  applied_by
)
VALUES (
  '019',
  'admin_cash_self_review',
  'sha256-admin-cash-self-review-019-v1',
  true,
  'migration-engine'
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
