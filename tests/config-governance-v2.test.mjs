import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../scripts/migrations/009_config_governance_forward.sql', import.meta.url), 'utf8');
const appConfig = fs.readFileSync(new URL('../app-config.js', import.meta.url), 'utf8');
const adminHtml = fs.readFileSync(new URL('../admin-config.html', import.meta.url), 'utf8');

test('009 es forward-only, transaccional y queda registrada', () => {
  assert.match(sql, /^BEGIN;/);
  assert.match(sql, /VALUES \('009', 'config_governance_forward'/);
  assert.match(sql, /COMMIT;\s*$/);
});

test('la configuración central rechaza secretos y fija actor, revisión y publicación', () => {
  assert.match(sql, /config_contains_secret_key_v2/);
  assert.match(sql, /NEW\.updated_by := auth\.uid\(\)/);
  assert.match(sql, /NEW\.published_at := COALESCE/);
  assert.match(sql, /schemaVersion', 2/);
});

test('stock negativo, ubicación, caja, supervisor y crédito son invariantes', () => {
  for (const token of ['allowNegativeStock', 'requireLocationOnReceive', 'requireOpenShift', 'supervisorApprovalForDifference', 'requireCreditLimit', 'blockOverdue']) {
    assert.match(sql, new RegExp(token));
  }
  assert.match(appConfig, /allowNegativeStock:\s*false/);
  assert.match(adminHtml, /id="app-rule-negative-stock"[^>]*disabled/);
  assert.match(adminHtml, /id="app-rule-open-shift"[^>]*disabled/);
  assert.match(adminHtml, /id="app-rule-credit-limit"[^>]*disabled/);
});

test('toda venta POS requiere turno del cajero y no afecta ventas web verificadas', () => {
  assert.match(sql, /IF NEW\.cashier_user_id IS NULL THEN RETURN NEW/);
  assert.match(sql, /cs\.opened_by = NEW\.cashier_user_id/);
  assert.match(sql, /sales_v2_require_open_shift/);
});

test('cuenta corriente respeta habilitación y deuda vencida', () => {
  assert.match(sql, /accounts_receivable_rules_v2/);
  assert.match(sql, /La cuenta corriente esta deshabilitada/);
  assert.match(sql, /ar\.due_date < current_date/);
  assert.match(sql, /La cuenta posee deuda vencida/);
});

test('todo cierre conserva revisión y anota tolerancia para el supervisor', () => {
  assert.match(sql, /cash_closures_tolerance_v2/);
  assert.match(sql, /difference_exceeds_tolerance/);
  assert.match(sql, /supervisor_review_required', true/);
});
