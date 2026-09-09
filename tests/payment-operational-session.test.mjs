import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('scripts/migrations/024_payment_operational_session.sql', 'utf8');

function compact(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

test('024 agrega un vínculo tenant-safe entre todo pago y su turno operativo', () => {
  const sql = compact(migration);
  assert.match(sql, /^begin\s*;/);
  assert.match(sql, /alter table public\.sale_payments_v2 add column if not exists operational_session_id uuid/);
  assert.match(sql, /foreign key \(tenant_id, operational_session_id\) references public\.cash_sessions_v2\(tenant_id, id\)/);
  assert.match(sql, /sale_payments_v2_operational_session_idx/);
  assert.match(sql, /values \( '024', 'payment_operational_session'/);
  assert.match(sql, /commit\s*;$/);
});

test('el backfill sólo asigna pagos digitales cuando existe un único turno compatible', () => {
  const sql = compact(migration);
  assert.match(sql, /payment\.created_at >= session_row\.opened_at/);
  assert.match(sql, /payment\.created_at <= coalesce\(session_row\.closed_at, 'infinity'::timestamptz\)/);
  assert.match(sql, /session_matches\.match_count = 1/);
  assert.doesNotMatch(sql, /order by session_row\.opened_at[^;]*limit 1/);
});

test('checkout v3 persiste v_session_id sin relajar cash_session_id para pagos digitales', () => {
  const sql = compact(migration);
  assert.match(sql, /status, cash_session_id, operational_session_id, customer_account_id/);
  assert.match(sql, /case when v_payment_method = 'cash' then v_session_id else null end, v_session_id/);
  assert.match(sql, /checkout_sale_v3 no coincide con la versión 017 esperada/);
  assert.doesNotMatch(sql, /drop constraint[^;]*sale_payments_v2_session/);
});

test('anulaciones y reintegros heredan la sesión del pago original', () => {
  const sql = compact(migration);
  assert.match(sql, /new\.transaction_type in \('void', 'refund'\)/);
  assert.match(sql, /new\.metadata->>'original_payment_id'/);
  assert.match(sql, /original\.operational_session_id/);
  assert.match(sql, /before insert or update of cash_session_id, operational_session_id, metadata/);
});

test('la planilla usa operational_session_id y calcula netos por método', () => {
  const sql = compact(migration);
  assert.match(sql, /payment\.operational_session_id = p_session_id/);
  assert.match(sql, /payment\.transaction_type = 'payment' and payment\.status = 'captured' then payment\.amount/);
  assert.match(sql, /payment\.transaction_type in \('void', 'refund'\)[^;]*then -payment\.amount/);
  assert.match(sql, /payment\.method = 'bank_transfer'/);
  assert.match(sql, /payment\.method = 'card'/);
  assert.match(sql, /payment\.method in \('mercado_pago', 'qr'\)/);
  assert.match(sql, /payment\.method = 'account_credit'/);
  assert.doesNotMatch(sql, /sp\.cash_session_id = p_session_id/);
});
