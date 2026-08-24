import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(
  path.resolve('scripts', 'migrations', '008_wms_inventory_security.sql'),
  'utf8'
);

function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ');
}

function compact(source) {
  return withoutComments(source).replace(/\s+/g, ' ').trim().toLowerCase();
}

function sqlFunction(name) {
  const source = withoutComments(migration);
  const marker = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, 'i');
  const match = marker.exec(source);
  assert.ok(match, `falta public.${name}`);
  const tail = source.slice(match.index);
  const bodyStart = tail.indexOf('AS $$');
  const bodyEnd = tail.indexOf('$$;', bodyStart + 5);
  assert.notEqual(bodyStart, -1, `${name} no usa cuerpo dollar-quoted`);
  assert.notEqual(bodyEnd, -1, `${name} no cierra su cuerpo`);
  return compact(tail.slice(0, bodyEnd + 3));
}

test('008 es una migración transaccional, aditiva y contract-breaking registrada', () => {
  const sql = compact(migration);
  assert.match(sql, /^begin\s*;/);
  assert.match(sql, /commit\s*;$/);
  assert.match(sql, /values\s*\(\s*'008'\s*,\s*'wms_inventory_security'/);
  assert.match(sql, /'sha256-wms-inventory-security-008-v2'\s*,\s*false/);
  assert.match(sql, /length\(btrim\(coalesce\(p_idempotency_key, ''\)\)\) not between 8 and 160/);
  assert.match(sql, /on conflict\s*\(\s*version\s*\)\s*do\s+nothing/);
  assert.doesNotMatch(sql, /\b(?:drop\s+table|truncate\s+table)\b/);
  assert.equal((withoutComments(migration).match(/\$\$/g) || []).length % 2, 0);
});

test('la ubicación default queda obligatoriamente activa y vendible', () => {
  const sql = compact(migration);
  assert.match(sql, /inventory_locations_v2_default_sellable_check/);
  assert.match(sql, /check\s*\(\s*not is_default or\s*\(\s*active and is_sellable\s*\)\s*\)/);
});

test('transfer_inventory_v2 conserva la firma del frontend y autoriza roles WMS', () => {
  const body = sqlFunction('transfer_inventory_v2');
  assert.match(body, /p_tenant_id uuid, p_product_id uuid, p_origin_location_id uuid, p_destination_location_id uuid, p_quantity numeric, p_notes text, p_idempotency_key text/);
  assert.match(body, /array\s*\[\s*'admin'\s*,\s*'supervisor'\s*,\s*'deposito'\s*\]::text\[\]/);
  assert.doesNotMatch(body, /array\s*\[[^\]]*'vendedor'/);
  assert.match(body, /security definer/);
  assert.match(body, /set row_security = off/);
});

test('la transferencia es idempotente, detecta colisiones y bloquea en orden determinista', () => {
  const body = sqlFunction('transfer_inventory_v2');
  assert.match(body, /digest\s*\(/);
  assert.match(body, /pg_advisory_xact_lock/);
  assert.match(body, /from public\.inventory_transfers_v2/);
  assert.match(body, /v_existing\.payload_hash <> v_payload_hash/);
  assert.match(body, /order by location\.id for update/);
  assert.match(body, /order by balance\.location_id for update/);
  assert.match(body, /v_origin\.available < p_quantity/);
  assert.match(body, /set on_hand = on_hand - p_quantity/);
  assert.match(body, /set on_hand = on_hand \+ p_quantity/);
});

test('cada transferencia deja cabecera, doble ledger, auditoría y outbox', () => {
  const body = sqlFunction('transfer_inventory_v2');
  assert.match(body, /insert into public\.inventory_transfers_v2/);
  assert.match(body, /'transfer_out'\s*,\s*-p_quantity/);
  assert.match(body, /'transfer_in'\s*,\s*p_quantity/);
  assert.match(body, /'inventory-transfer:' \|\| p_idempotency_key \|\| ':out'/);
  assert.match(body, /'inventory-transfer:' \|\| p_idempotency_key \|\| ':in'/);
  assert.match(body, /insert into public\.operational_audit_log/);
  assert.match(body, /'inventory_transferred'/);
  assert.match(body, /insert into public\.outbox_events/);
});

test('el conteo físico es una foto idempotente y no modifica stock', () => {
  const body = sqlFunction('submit_inventory_count_v2');
  assert.match(body, /p_tenant_id uuid, p_product_id uuid, p_location_id uuid, p_counted_quantity numeric, p_notes text, p_idempotency_key text/);
  assert.match(body, /array\s*\[\s*'admin'\s*,\s*'supervisor'\s*,\s*'deposito'\s*\]::text\[\]/);
  assert.match(body, /pg_advisory_xact_lock/);
  assert.match(body, /v_existing\.payload_hash <> v_payload_hash/);
  assert.match(body, /for update/);
  assert.match(body, /expected_on_hand, expected_reserved/);
  assert.match(body, /'pending_review'/);
  assert.doesNotMatch(body, /set on_hand\s*=/);
  assert.match(body, /insert into public\.operational_audit_log/);
  assert.match(body, /insert into public\.outbox_events/);
});

test('la revisión exige supervisor distinto y rechaza snapshots obsoletos', () => {
  const body = sqlFunction('review_inventory_count_v2');
  assert.match(body, /p_tenant_id uuid, p_count_id uuid, p_decision text, p_reason text, p_idempotency_key text/);
  assert.match(body, /array\s*\[\s*'admin'\s*,\s*'supervisor'\s*\]::text\[\]/);
  assert.doesNotMatch(body, /array\s*\[[^\]]*'deposito'/);
  assert.match(body, /v_count\.submitted_by = v_actor/);
  assert.match(body, /quien presenta el conteo no puede revisar su propio conteo/);
  assert.match(body, /v_balance\.on_hand <> v_count\.expected_on_hand/);
  assert.match(body, /v_balance\.reserved <> v_count\.expected_reserved/);
  assert.match(body, /errcode = '40001'/);
  assert.match(body, /v_count\.counted_quantity < v_balance\.reserved/);
});

test('sólo una aprobación explícita genera ajuste compensatorio auditable', () => {
  const body = sqlFunction('review_inventory_count_v2');
  assert.match(body, /if v_decision = 'approved' then/);
  assert.match(body, /set on_hand = v_count\.counted_quantity/);
  assert.match(body, /'adjustment_positive'/);
  assert.match(body, /'adjustment_negative'/);
  assert.match(body, /'inventory_count_v2'/);
  assert.match(body, /insert into public\.inventory_count_reviews_v2/);
  assert.match(body, /insert into public\.operational_audit_log/);
  assert.match(body, /insert into public\.outbox_events/);
});

test('conteos, revisiones y transferencias son append-only, tenant-scoped y sin escritura directa', () => {
  const sql = compact(migration);
  for (const table of ['inventory_transfers_v2', 'inventory_counts_v2', 'inventory_count_reviews_v2']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`${table}_append_only_v2`));
  }
  assert.match(sql, /before update or delete on public\.inventory_transfers_v2/);
  assert.match(sql, /before update or delete on public\.inventory_counts_v2/);
  assert.match(sql, /before update or delete on public\.inventory_count_reviews_v2/);
  assert.match(sql, /revoke all on public\.inventory_transfers_v2, public\.inventory_counts_v2, public\.inventory_count_reviews_v2 from anon, authenticated/);
  assert.match(sql, /grant select on public\.inventory_transfers_v2, public\.inventory_counts_v2, public\.inventory_count_reviews_v2 to authenticated/);
  assert.match(sql, /operational_is_tenant_member\(tenant_id\)/);
});

test('la bandeja del supervisor deriva el estado sin reescribir el conteo', () => {
  const sql = compact(migration);
  const viewStart = sql.indexOf('create or replace view public.inventory_count_status_v2');
  const viewEnd = sql.indexOf('drop policy if exists inventory_transfers_member_read_v2', viewStart);
  const view = sql.slice(viewStart, viewEnd);
  assert.ok(viewStart >= 0);
  assert.ok(viewEnd > viewStart);
  assert.match(view, /with\s*\(\s*security_barrier = true\s*\)/);
  assert.match(view, /left join public\.inventory_count_reviews_v2/);
  assert.match(view, /coalesce\s*\(\s*review\.decision\s*,\s*'pending_review'\s*\) as review_status/);
  assert.match(view, /operational_is_tenant_member\(inventory_count\.tenant_id\)/);
  assert.match(sql, /revoke all on public\.inventory_count_status_v2 from public, anon/);
  assert.match(sql, /grant select on public\.inventory_count_status_v2 to authenticated, service_role/);
});

test('un JWT de usuario no puede declarar tarjeta, MP o QR como cobro de cuenta corriente', () => {
  const guard = sqlFunction('validate_external_ar_payment_v2');
  const sql = compact(migration);
  assert.match(guard, /new\.entry_type = 'payment'/);
  assert.match(guard, /v_method in\s*\(\s*'card'\s*,\s*'mercado_pago'\s*,\s*'qr'\s*\)/);
  assert.match(guard, /v_request_role is distinct from 'service_role'/);
  assert.match(sql, /before insert on public\.accounts_receivable_ledger/);
  assert.match(sql, /revoke all on function public\.validate_external_ar_payment_v2\(\) from public, anon, authenticated/);
});

test('las RPC WMS quedan cerradas a anon y disponibles sólo para sesión autenticada', () => {
  const sql = compact(migration);
  assert.match(sql, /revoke all on function public\.transfer_inventory_v2\(uuid, uuid, uuid, uuid, numeric, text, text\) from public, anon/);
  assert.match(sql, /revoke all on function public\.submit_inventory_count_v2\(uuid, uuid, uuid, numeric, text, text\) from public, anon/);
  assert.match(sql, /revoke all on function public\.review_inventory_count_v2\(uuid, uuid, text, text, text\) from public, anon/);
  assert.match(sql, /grant execute on function public\.transfer_inventory_v2\(uuid, uuid, uuid, uuid, numeric, text, text\) to authenticated/);
  assert.match(sql, /grant execute on function public\.submit_inventory_count_v2\(uuid, uuid, uuid, numeric, text, text\) to authenticated/);
  assert.match(sql, /grant execute on function public\.review_inventory_count_v2\(uuid, uuid, text, text, text\) to authenticated/);
});
