import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('scripts/migrations/023_cash_read_scope_hardening.sql', 'utf8');

function compact(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function policyDefinition(policyName, tableName) {
  const expression = new RegExp(
    `create\\s+policy\\s+${policyName}\\s+on\\s+public\\.${tableName}([\\s\\S]*?);`,
    'i'
  );
  const match = expression.exec(migration);
  assert.ok(match, `falta la política ${policyName} sobre ${tableName}`);
  return compact(match[0]);
}

function assertManagerScope(policy) {
  assert.match(policy, /public\.is_superadmin\s*\(\s*\)/);
  assert.match(
    policy,
    /operational_has_tenant_role\s*\(\s*tenant_id\s*,\s*array\s*\[\s*'admin'\s*,\s*'supervisor'\s*\]::text\[\]\s*\)/
  );
  assert.doesNotMatch(policy, /array\s*\[[^\]]*'auditor'/);
}

test('023 es forward-only, transaccional y registra el cambio incompatible de permisos', () => {
  const sql = compact(migration);

  assert.match(sql, /^begin\s*;/);
  assert.match(sql, /commit\s*;$/);
  assert.doesNotMatch(sql, /\b(?:drop\s+table|truncate\s+table|delete\s+from|update\s+public\.)\b/);
  assert.match(sql, /values\s*\(\s*'023'\s*,\s*'cash_read_scope_hardening'/);
  assert.match(sql, /'sha256-cash-read-scope-hardening-023-v1'\s*,\s*false/);
  assert.match(sql, /on conflict\s*\(\s*version\s*\)\s*do\s+nothing/);
});

test('023 elimina las tres políticas member-wide y mantiene RLS habilitado', () => {
  const sql = compact(migration);
  const tables = ['cash_sessions_v2', 'cash_movements_v2', 'sale_payments_v2'];
  const legacyPolicies = [
    'cash_sessions_member_read_v2',
    'cash_movements_member_read_v2',
    'sale_payments_member_read_v2'
  ];

  for (const tableName of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${tableName} enable row level security`));
  }
  for (const policyName of legacyPolicies) {
    assert.match(sql, new RegExp(`drop policy if exists ${policyName} on public\\.`));
    assert.doesNotMatch(sql, new RegExp(`create policy ${policyName}\\b`));
  }
  assert.doesNotMatch(sql, /operational_is_tenant_member\s*\(/);
});

test('cash_sessions_v2 limita VENDEDOR a los turnos que abrió auth.uid', () => {
  const policy = policyDefinition('cash_sessions_scoped_read_v3', 'cash_sessions_v2');

  assertManagerScope(policy);
  assert.match(
    policy,
    /opened_by\s*=\s*\(\s*select auth\.uid\s*\(\s*\)\s*\)/
  );
  assert.match(
    policy,
    /operational_has_tenant_role\s*\(\s*tenant_id\s*,\s*array\s*\[\s*'vendedor'\s*\]::text\[\]\s*\)/
  );
});

test('cash_movements_v2 hereda el dueño de la sesión con correlación tenant-safe', () => {
  const policy = policyDefinition('cash_movements_scoped_read_v3', 'cash_movements_v2');

  assertManagerScope(policy);
  assert.match(policy, /from public\.cash_sessions_v2 cash_session/);
  assert.match(policy, /cash_session\.tenant_id\s*=\s*cash_movements_v2\.tenant_id/);
  assert.match(policy, /cash_session\.id\s*=\s*cash_movements_v2\.session_id/);
  assert.match(policy, /cash_session\.opened_by\s*=\s*\(\s*select auth\.uid\s*\(\s*\)\s*\)/);
  assert.match(policy, /array\s*\[\s*'vendedor'\s*\]::text\[\]/);
  assert.doesNotMatch(policy, /cash_movements_v2\.actor_user_id\s*=/);
});

test('sale_payments_v2 usa el cajero de la venta y cubre pagos sin cash_session_id', () => {
  const policy = policyDefinition('sale_payments_scoped_read_v3', 'sale_payments_v2');

  assertManagerScope(policy);
  assert.match(policy, /from public\.sales_v2 sale/);
  assert.match(policy, /sale\.tenant_id\s*=\s*sale_payments_v2\.tenant_id/);
  assert.match(policy, /sale\.id\s*=\s*sale_payments_v2\.sale_id/);
  assert.match(policy, /sale\.cashier_user_id\s*=\s*\(\s*select auth\.uid\s*\(\s*\)\s*\)/);
  assert.match(policy, /array\s*\[\s*'vendedor'\s*\]::text\[\]/);
  assert.doesNotMatch(policy, /cash_session_id\s*=\s*\(\s*select auth\.uid/);
});
