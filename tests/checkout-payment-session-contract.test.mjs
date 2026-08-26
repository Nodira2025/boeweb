import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('scripts/migrations/017_checkout_payment_session_contract.sql', 'utf8');
const verifier = fs.readFileSync('scripts/verify_operational_v2_deployment.js', 'utf8');

test('017 corrige checkout_sale_v3 sin relajar el constraint de pagos', () => {
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /pg_get_functiondef\(v_target\)/);
  assert.match(migration, /'CAPTURED'', v_session_id,'/);
  assert.match(migration, /'CAPTURED'', CASE WHEN v_payment_method = ''CASH'' THEN v_session_id ELSE NULL END,'/);
  assert.match(migration, /checkout_sale_v3 no coincide con la versión esperada/);
  assert.doesNotMatch(migration, /DROP\s+CONSTRAINT|ALTER\s+TABLE\s+public\.sale_payments_v2/i);
  assert.match(migration, /CREATE EXTENSION IF NOT EXISTS pgcrypto/);
  assert.match(migration, /ALTER FUNCTION %s SET search_path/);
  assert.match(migration, /COMMIT;\s*$/);
});

test('017 conserva permisos cerrados y queda registrada en el verificador', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.checkout_sale_v3[\s\S]*FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.checkout_sale_v3[\s\S]*TO authenticated, service_role/);
  assert.match(migration, /VALUES\s*\(\s*'017',\s*'checkout_payment_session_contract'/);
  assert.match(verifier, /Array\.from\(\{ length: 18 \}/);
});
