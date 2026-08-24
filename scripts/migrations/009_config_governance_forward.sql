BEGIN;

-- Forward-only hardening for installations that may already have registered
-- historical migrations. Brand and operational settings remain tenant-scoped,
-- while financial/inventory safety controls cannot be disabled from a client.

CREATE OR REPLACE FUNCTION public.config_contains_secret_key_v2(p_value JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key TEXT;
  v_child JSONB;
BEGIN
  IF p_value IS NULL THEN RETURN false; END IF;
  IF jsonb_typeof(p_value) = 'object' THEN
    FOR v_key, v_child IN SELECT key, value FROM jsonb_each(p_value)
    LOOP
      IF v_key ~* '(token|secret|password|passcode|private.?key|credential)'
         OR public.config_contains_secret_key_v2(v_child) THEN
        RETURN true;
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(p_value) = 'array' THEN
    FOR v_child IN SELECT value FROM jsonb_array_elements(p_value)
    LOOP
      IF public.config_contains_secret_key_v2(v_child) THEN RETURN true; END IF;
    END LOOP;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_tenant_app_config_governance_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_rules JSONB;
  v_inventory JSONB;
  v_cash JSONB;
  v_accounts JSONB;
BEGIN
  NEW.stage := lower(btrim(NEW.stage));
  IF NEW.stage NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Etapa de configuracion invalida.';
  END IF;
  IF jsonb_typeof(NEW.config_json) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La configuracion debe ser un objeto JSON.';
  END IF;
  IF public.config_contains_secret_key_v2(NEW.config_json) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La configuracion cliente no puede contener secretos.';
  END IF;

  v_rules := COALESCE(NEW.config_json->'rules', '{}'::jsonb);
  v_inventory := COALESCE(v_rules->'inventory', '{}'::jsonb)
    || jsonb_build_object('allowNegativeStock', false, 'requireLocationOnReceive', true);
  v_cash := COALESCE(v_rules->'cash', '{}'::jsonb)
    || jsonb_build_object('requireOpenShift', true, 'supervisorApprovalForDifference', true);
  v_accounts := COALESCE(v_rules->'currentAccount', '{}'::jsonb)
    || jsonb_build_object('requireCreditLimit', true, 'blockOverdue', true);
  v_rules := v_rules
    || jsonb_build_object('inventory', v_inventory, 'cash', v_cash, 'currentAccount', v_accounts);
  NEW.config_json := jsonb_set(NEW.config_json, '{rules}', v_rules, true)
    || jsonb_build_object('schemaVersion', 2);
  NEW.schema_version := GREATEST(NEW.schema_version, 2);
  NEW.updated_at := clock_timestamp();
  IF auth.uid() IS NOT NULL THEN NEW.updated_by := auth.uid(); END IF;
  IF NEW.stage = 'published' THEN
    NEW.published_at := COALESCE(NEW.published_at, clock_timestamp());
  ELSE
    NEW.published_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_app_config_governance_v2 ON public.tenant_app_config;
CREATE TRIGGER tenant_app_config_governance_v2
BEFORE INSERT OR UPDATE ON public.tenant_app_config
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_app_config_governance_v2();

CREATE OR REPLACE FUNCTION public.enforce_open_shift_for_pos_sale_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_requires_open BOOLEAN := true;
BEGIN
  -- Ventas web verificadas no tienen cajero. Todo checkout POS sí debe quedar
  -- asociado a un operador con turno abierto, incluso si no cobra efectivo.
  IF NEW.cashier_user_id IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(lower(tac.config_json #>> '{rules,cash,requireOpenShift}') = 'true', true)
  INTO v_requires_open
  FROM public.tenant_app_config tac
  WHERE tac.tenant_id = NEW.tenant_id AND tac.stage = 'published';
  v_requires_open := COALESCE(v_requires_open, true);
  IF v_requires_open AND NOT EXISTS (
    SELECT 1 FROM public.cash_sessions_v2 cs
    WHERE cs.tenant_id = NEW.tenant_id
      AND cs.opened_by = NEW.cashier_user_id
      AND cs.status = 'OPEN'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'El cajero debe tener una sesion de caja abierta para confirmar la venta.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_v2_require_open_shift ON public.sales_v2;
CREATE TRIGGER sales_v2_require_open_shift
BEFORE INSERT ON public.sales_v2
FOR EACH ROW EXECUTE FUNCTION public.enforce_open_shift_for_pos_sale_v2();

CREATE OR REPLACE FUNCTION public.enforce_current_account_rules_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_enabled BOOLEAN := true;
  v_block_overdue BOOLEAN := true;
  v_overdue NUMERIC(18,2) := 0;
BEGIN
  IF NEW.direction <> 'DEBIT' OR NEW.entry_type NOT IN ('CHARGE', 'DEBIT_NOTE') THEN RETURN NEW; END IF;
  SELECT
    COALESCE(lower(tac.config_json #>> '{rules,currentAccount,enabled}') = 'true', true),
    COALESCE(lower(tac.config_json #>> '{rules,currentAccount,blockOverdue}') = 'true', true)
  INTO v_enabled, v_block_overdue
  FROM public.tenant_app_config tac
  WHERE tac.tenant_id = NEW.tenant_id AND tac.stage = 'published';
  v_enabled := COALESCE(v_enabled, true);
  v_block_overdue := COALESCE(v_block_overdue, true);
  IF NOT v_enabled THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'La cuenta corriente esta deshabilitada para esta empresa.';
  END IF;
  IF v_block_overdue THEN
    SELECT GREATEST(
      COALESCE(sum(CASE WHEN ar.direction = 'DEBIT' AND ar.due_date < current_date THEN ar.amount ELSE 0 END), 0)
      - COALESCE(sum(CASE WHEN ar.direction = 'CREDIT' THEN ar.amount ELSE 0 END), 0),
      0
    ) INTO v_overdue
    FROM public.accounts_receivable_ledger ar
    WHERE ar.tenant_id = NEW.tenant_id AND ar.account_id = NEW.account_id;
    IF v_overdue > 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'La cuenta posee deuda vencida y no admite nuevos cargos.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_receivable_rules_v2 ON public.accounts_receivable_ledger;
CREATE TRIGGER accounts_receivable_rules_v2
BEFORE INSERT ON public.accounts_receivable_ledger
FOR EACH ROW EXECUTE FUNCTION public.enforce_current_account_rules_v2();

CREATE OR REPLACE FUNCTION public.annotate_cash_closure_tolerance_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_tolerance NUMERIC(18,2) := 0;
BEGIN
  SELECT COALESCE(NULLIF(tac.config_json #>> '{rules,cash,differenceTolerance}', '')::NUMERIC, 0)
  INTO v_tolerance
  FROM public.tenant_app_config tac
  WHERE tac.tenant_id = NEW.tenant_id AND tac.stage = 'published';
  v_tolerance := GREATEST(COALESCE(v_tolerance, 0), 0);
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
    'configured_difference_tolerance', v_tolerance,
    'difference_exceeds_tolerance', abs(NEW.difference) > v_tolerance,
    'supervisor_review_required', true
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cash_closures_tolerance_v2 ON public.cash_closures;
CREATE TRIGGER cash_closures_tolerance_v2
BEFORE INSERT ON public.cash_closures
FOR EACH ROW EXECUTE FUNCTION public.annotate_cash_closure_tolerance_v2();

REVOKE ALL ON FUNCTION public.config_contains_secret_key_v2(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_tenant_app_config_governance_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_open_shift_for_pos_sale_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_current_account_rules_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.annotate_cash_closure_tolerance_v2() FROM PUBLIC, anon, authenticated;

INSERT INTO public.schema_migrations (version, name, checksum, backward_compatible, applied_by)
VALUES ('009', 'config_governance_forward', 'sha256-config-governance-forward-009-v1', false, 'migration-engine')
ON CONFLICT (version) DO NOTHING;

COMMIT;
