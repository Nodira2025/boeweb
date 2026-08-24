import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import operationalPackage from '../operational-api.js';

const {
  OperationalApiError,
  buildCheckoutCommand,
  buildPayments,
  checkoutSale,
  normalizePaymentMethod,
  readOutbox,
  retryPending
} = operationalPackage;

const migrationPath = path.resolve('scripts', 'migrations', '004_operational_core_and_config.sql');
const tenantTables = [
  'tenant_app_config',
  'tenant_configurations',
  'catalog_products',
  'customers',
  'customer_accounts',
  'accounts_receivable_ledger',
  'inventory_locations_v2',
  'inventory_balances_v2',
  'inventory_ledger_v2',
  'sales_v2',
  'sale_items_v2',
  'sale_payments_v2',
  'cash_registers',
  'cash_sessions_v2',
  'cash_movements_v2',
  'cash_closures',
  'operational_audit_log',
  'outbox_events'
];

function readMigration() {
  assert.ok(fs.existsSync(migrationPath), `falta la migración ${migrationPath}`);
  return fs.readFileSync(migrationPath, 'utf8');
}

function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ');
}

function compact(source) {
  return withoutComments(source).replace(/\s+/g, ' ').trim().toLowerCase();
}

function findBalancedDefinition(source, marker) {
  const lower = source.toLowerCase();
  const start = lower.indexOf(marker.toLowerCase());
  assert.notEqual(start, -1, `no se encontró ${marker}`);
  const open = source.indexOf('(', start);
  assert.notEqual(open, -1, `${marker} no tiene definición de columnas`);

  let depth = 0;
  let quote = null;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    const previous = source[index - 1];
    if (quote) {
      if (char === quote && previous !== '\\') quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`la definición ${marker} no cierra sus paréntesis`);
}

function tableDefinition(source, tableName) {
  return findBalancedDefinition(source, `create table if not exists public.${tableName}`);
}

function functionDefinition(source, functionName) {
  const expression = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\s*\\(`, 'i');
  const match = expression.exec(source);
  assert.ok(match, `no se encontró la función public.${functionName}`);
  const tail = source.slice(match.index);
  const delimiterMatch = /\bas\s+(\$[a-z0-9_]*\$)/i.exec(tail);
  assert.ok(delimiterMatch, `public.${functionName} debe usar un cuerpo dollar-quoted`);
  const delimiter = delimiterMatch[1];
  const bodyStart = delimiterMatch.index + delimiterMatch[0].length;
  const bodyEnd = tail.indexOf(delimiter, bodyStart);
  assert.notEqual(bodyEnd, -1, `public.${functionName} no cierra ${delimiter}`);
  return {
    definition: tail.slice(0, bodyEnd + delimiter.length),
    body: tail.slice(bodyStart, bodyEnd)
  };
}

function indexOfMatch(source, expression, label) {
  const match = expression.exec(source);
  assert.ok(match, `no se encontró ${label}`);
  return match.index;
}

function assertOrdered(source, entries) {
  let lastIndex = -1;
  for (const [label, expression] of entries) {
    const relative = indexOfMatch(source.slice(lastIndex + 1), expression, label);
    lastIndex += relative + 1;
  }
}

function assertLockedQuery(body, tableName) {
  const tableIndex = body.search(new RegExp(`\\bfrom\\s+public\\.${tableName}\\b`, 'i'));
  assert.notEqual(tableIndex, -1, `checkout debe consultar public.${tableName}`);
  const queryTail = body.slice(tableIndex, tableIndex + 1800);
  assert.match(queryTail, /\bfor\s+update\b/i, `la lectura de ${tableName} debe bloquear la fila`);
}

function assertCompositeTenantForeignKey(definition, childColumn, parentTable) {
  const normalized = compact(definition);
  const expression = new RegExp(
    `foreign\\s+key\\s*\\(\\s*tenant_id\\s*,\\s*${childColumn}\\s*\\)\\s*` +
    `references\\s+public\\.${parentTable}\\s*\\(\\s*tenant_id\\s*,\\s*id\\s*\\)`
  );
  assert.match(
    normalized,
    expression,
    `el vínculo ${childColumn} -> ${parentTable} debe incluir tenant_id para impedir cruces de tenant`
  );
}

test('004 es transaccional, registrable y reejecutable sin DDL destructivo', () => {
  const sql = readMigration();
  const normalized = compact(sql);

  assert.match(normalized, /^begin\s*;/);
  assert.match(normalized, /commit\s*;$/);
  assert.doesNotMatch(normalized, /\b(?:drop\s+table|truncate\s+table)\b/);
  assert.doesNotMatch(normalized, /\bcreate\s+table\s+(?!if\s+not\s+exists)/);
  assert.doesNotMatch(normalized, /\bcreate\s+(?:unique\s+)?index\s+(?!if\s+not\s+exists)/);

  for (const tableName of tenantTables) {
    assert.match(normalized, new RegExp(`create table if not exists public\\.${tableName}\\b`));
  }

  assert.match(normalized, /insert into public\.schema_migrations\b/);
  assert.match(normalized, /values\s*\(\s*'004'/);
  assert.match(normalized, /on conflict\s*\(\s*version\s*\)\s*do\s+(?:nothing|update)/);
});

test('el DDL crea padres antes que hijos y los FK críticos incluyen tenant_id', () => {
  const sql = readMigration();
  const normalized = compact(sql);

  assertOrdered(normalized, [
    ['catalog_products', /create table if not exists public\.catalog_products\b/],
    ['inventory_locations_v2', /create table if not exists public\.inventory_locations_v2\b/],
    ['inventory_balances_v2', /create table if not exists public\.inventory_balances_v2\b/],
    ['inventory_ledger_v2', /create table if not exists public\.inventory_ledger_v2\b/]
  ]);
  assertOrdered(normalized, [
    ['customers', /create table if not exists public\.customers\b/],
    ['customer_accounts', /create table if not exists public\.customer_accounts\b/],
    ['accounts_receivable_ledger', /create table if not exists public\.accounts_receivable_ledger\b/]
  ]);
  assertOrdered(normalized, [
    ['sales_v2 padre', /create table if not exists public\.sales_v2\b/],
    ['sale_items_v2 hijo', /create table if not exists public\.sale_items_v2\b/],
    ['sale_payments_v2 hijo', /create table if not exists public\.sale_payments_v2\b/]
  ]);
  assertOrdered(normalized, [
    ['cash_registers', /create table if not exists public\.cash_registers\b/],
    ['cash_sessions_v2', /create table if not exists public\.cash_sessions_v2\b/],
    ['cash_movements_v2', /create table if not exists public\.cash_movements_v2\b/],
    ['cash_closures', /create table if not exists public\.cash_closures\b/]
  ]);

  const sales = tableDefinition(sql, 'sales_v2');
  const products = tableDefinition(sql, 'catalog_products');
  const customers = tableDefinition(sql, 'customers');
  assert.match(compact(sales), /unique\s*\(\s*tenant_id\s*,\s*id\s*\)/);
  assert.match(compact(products), /unique\s*\(\s*tenant_id\s*,\s*id\s*\)/);
  assert.match(compact(customers), /unique\s*\(\s*tenant_id\s*,\s*id\s*\)/);

  assertCompositeTenantForeignKey(tableDefinition(sql, 'sale_items_v2'), 'sale_id', 'sales_v2');
  assertCompositeTenantForeignKey(tableDefinition(sql, 'sale_items_v2'), 'product_id', 'catalog_products');
  assertCompositeTenantForeignKey(tableDefinition(sql, 'sale_payments_v2'), 'sale_id', 'sales_v2');
  assertCompositeTenantForeignKey(tableDefinition(sql, 'customer_accounts'), 'customer_id', 'customers');
  assertCompositeTenantForeignKey(tableDefinition(sql, 'accounts_receivable_ledger'), 'customer_id', 'customers');
});

test('cada RPC se crea después de todas las tablas que referencia por %ROWTYPE o DML', () => {
  const sql = compact(readMigration());
  const cashTablesReady = indexOfMatch(sql, /create table if not exists public\.outbox_events\b/, 'última tabla usada por caja');
  const openCash = indexOfMatch(sql, /create or replace function public\.open_cash_session_v2\b/, 'RPC apertura');
  const manualMovement = indexOfMatch(sql, /create or replace function public\.record_cash_movement_v2\b/, 'RPC movimiento');
  const closeCash = indexOfMatch(sql, /create or replace function public\.submit_cash_closure_v2\b/, 'RPC cierre');
  const reviewCash = indexOfMatch(sql, /create or replace function public\.review_cash_closure_v2\b/, 'RPC supervisión');
  const salesReady = indexOfMatch(sql, /create table if not exists public\.accounts_receivable_ledger\b/, 'última tabla usada por checkout');
  const checkout = indexOfMatch(sql, /create or replace function public\.checkout_sale_v2\b/, 'RPC checkout');

  assert.ok(cashTablesReady < openCash);
  assert.ok(cashTablesReady < manualMovement);
  assert.ok(cashTablesReady < closeCash);
  assert.ok(cashTablesReady < reviewCash);
  assert.ok(salesReady < checkout);
});

test('tenant_app_config usa las mismas etapas minúsculas que el repositorio cliente', () => {
  const definition = compact(tableDefinition(readMigration(), 'tenant_app_config'));
  const checkout = compact(functionDefinition(readMigration(), 'checkout_sale_v2').body);

  assert.match(definition, /stage[^)]*'draft'[^)]*'published'/);
  assert.doesNotMatch(definition, /'DRAFT'|'PUBLISHED'/);
  assert.match(checkout, /tac\.stage\s*=\s*'published'/);
});

test('todas las tablas operativas son tenant-scoped, tienen RLS y políticas explícitas', () => {
  const sql = readMigration();
  const normalized = compact(sql);

  for (const tableName of tenantTables) {
    assert.match(compact(tableDefinition(sql, tableName)), /\btenant_id\s+uuid\s+not\s+null\b/, `${tableName} requiere tenant_id NOT NULL`);
    assert.match(normalized, new RegExp(`alter table public\\.${tableName} enable row level security`));
    assert.match(
      normalized,
      new RegExp(`create policy [^;]+ on public\\.${tableName}\\b`),
      `${tableName} requiere al menos una política RLS`
    );
  }
});

test('helpers RBAC y checkout validan auth.uid, membresía activa, roles y search_path seguro', () => {
  const sql = readMigration();
  const member = functionDefinition(sql, 'operational_is_tenant_member');
  const hasRole = functionDefinition(sql, 'operational_has_tenant_role');
  const checkout = functionDefinition(sql, 'checkout_sale_v2');

  assert.match(member.definition, /security\s+definer/i);
  assert.match(member.definition, /set\s+search_path\s*=\s*(?:public\s*,\s*)?pg_catalog|set\s+search_path\s*=\s*''/i);
  assert.match(member.body, /auth\.uid\s*\(\s*\)/i);
  assert.match(member.body, /public\.tenant_users/i);
  assert.match(member.body, /\bactive\s*=\s*true\b/i);

  assert.match(hasRole.definition, /security\s+definer/i);
  assert.match(hasRole.definition, /set\s+search_path\s*=/i);
  assert.match(hasRole.body, /public\.tenant_users/i);
  assert.match(hasRole.body, /\brole\b/i);
  assert.match(hasRole.body, /\bactive\s*=\s*true\b/i);

  assert.match(checkout.definition, /security\s+definer/i);
  assert.match(checkout.definition, /set\s+search_path\s*=/i);
  assert.match(checkout.body, /operational_is_tenant_member|operational_has_tenant_role/i);
  assert.match(checkout.body, /admin/i);
  assert.match(checkout.body, /supervisor/i);
  assert.match(checkout.body, /vendedor|seller|cashier/i);
});

test('privilegios separan RPC operativas autenticadas, configuración RLS y backend service_role', () => {
  const sql = compact(readMigration());

  assert.match(sql, /grant select on[^;]*public\.tenant_app_config[^;]*to authenticated/);
  assert.match(sql, /grant[^;]*\binsert\b[^;]*\bupdate\b[^;]*on[^;]*public\.tenant_app_config[^;]*to authenticated/);
  assert.doesNotMatch(sql, /grant[^;]*\bdelete\b[^;]*on[^;]*public\.tenant_app_config[^;]*to authenticated/);
  for (const rpc of [
    'checkout_sale_v2', 'open_cash_session_v2', 'record_cash_movement_v2',
    'submit_cash_closure_v2', 'review_cash_closure_v2'
  ]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${rpc}\\([^;]+ from (?:public|anon)`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${rpc}\\([^;]+ to authenticated`));
  }
  for (const rpc of ['create_public_order_v2', 'confirm_public_order_payment_v2']) {
    const revoke = new RegExp(`revoke all on function public\\.${rpc}\\([^;]+;`).exec(sql)?.[0] || '';
    assert.match(revoke, /\bfrom\s+public\b/);
    assert.match(revoke, /\banon\b/);
    assert.match(revoke, /\bauthenticated\b/);
    assert.match(sql, new RegExp(`grant execute on function public\\.${rpc}\\([^;]+ to service_role`));
  }
});

test('checkout separa cajero y vendedor, valida ambos contra el tenant y no confía un total del cliente', () => {
  const sql = readMigration();
  const checkout = functionDefinition(sql, 'checkout_sale_v2');
  const definition = compact(checkout.definition);
  const body = compact(checkout.body);

  for (const parameter of [
    'p_tenant_id', 'p_idempotency_key', 'p_payload_hash', 'p_items', 'p_payments',
    'p_adjustment', 'p_cashier_user_id', 'p_salesperson_user_id', 'p_customer_id', 'p_register_id',
    'p_notes', 'p_due_date'
  ]) {
    assert.match(definition, new RegExp(`\\b${parameter}\\b`));
  }
  assert.doesNotMatch(definition, /\bp_total\b/, 'el total debe calcularse con catálogo e ítems server-side');
  assert.match(body, /\bp_cashier_user_id\b/);
  assert.match(body, /\bp_salesperson_user_id\b/);
  assert.doesNotMatch(body, /p_cashier_user_id\s*(?:=|<>|is\s+(?:not\s+)?distinct\s+from)\s*p_salesperson_user_id/);
  assert.match(body, /insert into public\.sales_v2\s*\([^)]*cashier_user_id[^)]*salesperson_user_id/i);

  const tenantUserChecks = checkout.body.match(/public\.tenant_users/gi) || [];
  assert.ok(tenantUserChecks.length >= 2, 'cajero y vendedor deben validarse de forma independiente');
});

test('idempotencia compara payload_hash antes de cualquier mutación y rechaza reutilización divergente', () => {
  const sql = readMigration();
  const body = compact(functionDefinition(sql, 'checkout_sale_v2').body);
  const sales = compact(tableDefinition(sql, 'sales_v2'));

  assert.match(sales, /\bidempotency_key\s+text\s+not\s+null\b/);
  assert.match(sales, /\bpayload_hash\s+text\s+not\s+null\b/);
  assert.match(sales, /unique\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)/);

  const lookup = indexOfMatch(
    body,
    /from public\.sales_v2\b[^;]*tenant_id\s*=\s*p_tenant_id[^;]*idempotency_key\s*=\s*p_idempotency_key/,
    'lookup idempotente tenant-scoped'
  );
  const firstMutation = indexOfMatch(body, /\b(?:insert\s+into|update|delete\s+from)\s+public\./, 'primera mutación');
  assert.ok(lookup < firstMutation, 'la repetición debe resolverse antes de tocar stock, caja o venta');
  assert.match(body, /payload_hash\s+(?:<>|!=|is\s+distinct\s+from)\s*p_payload_hash|p_payload_hash\s+(?:<>|!=|is\s+distinct\s+from)\s+[a-z0-9_.]*payload_hash/);
  assert.match(body, /idempotent['"]?\s*,?\s*true|jsonb_build_object\s*\([^)]*'idempotent'\s*,\s*true/);
  assert.match(body, /insert into public\.sales_v2\s*\([^)]*idempotency_key[^)]*payload_hash/i);
});

test('ítems se recalculan contra catálogo activo y el stock se bloquea antes de descontar', () => {
  const bodyRaw = functionDefinition(readMigration(), 'checkout_sale_v2').body;
  const body = compact(bodyRaw);

  assert.match(body, /jsonb_array_elements\s*\(\s*p_items\s*\)/);
  assert.match(body, /jsonb_array_length\s*\(\s*p_items\s*\)\s*(?:=|<=)\s*0|p_items\s+is\s+null/);
  assert.match(body, /from public\.catalog_products\b/);
  assert.match(body, /tenant_id\s*=\s*p_tenant_id/);
  assert.match(body, /\bactive\s*=\s*true\b/);
  assert.match(body, /\b(?:v_qty|quantity)\b[^;]*(?:<=\s*0|>\s*0)/);
  assert.match(body, /\bprice\b[^;]*\*[^;]*\bquantity\b|\bquantity\b[^;]*\*[^;]*\bprice\b/);
  assertLockedQuery(bodyRaw, 'inventory_balances_v2');
  assert.match(body, /update public\.inventory_balances_v2\b/);
  assert.match(body, /on_hand[^;]*-[^;]*quantity|quantity[^;]*-[^;]*v_quantity/);
  assert.match(body, /stock insuficiente|insufficient stock/);
  assert.match(body, /insert into public\.inventory_ledger_v2\b/);
});

test('checkout inserta la cabecera sales_v2 antes de sale_items y conserva snapshots auditables', () => {
  const body = compact(functionDefinition(readMigration(), 'checkout_sale_v2').body);
  const saleIndex = indexOfMatch(body, /insert into public\.sales_v2\b/, 'INSERT sales_v2');
  const itemIndex = indexOfMatch(body, /insert into public\.sale_items_v2\b/, 'INSERT sale_items_v2');

  assert.ok(saleIndex < itemIndex, 'la venta padre debe existir antes de insertar sus ítems');
  assert.match(body.slice(saleIndex, itemIndex), /returning\s+id/);
  assert.match(body, /insert into public\.sale_items_v2\s*\([^)]*sale_id[^)]*product_id/i);
  assert.match(compact(tableDefinition(readMigration(), 'sale_items_v2')), /\b(?:product_name|name)_snapshot\b/);
  assert.match(compact(tableDefinition(readMigration(), 'sale_items_v2')), /\bunit_price\b/);
});

test('pagos mixtos se validan por suma exacta y se persiste una fila por componente', () => {
  const bodyRaw = functionDefinition(readMigration(), 'checkout_sale_v2').body;
  const body = compact(bodyRaw);
  const payments = compact(tableDefinition(readMigration(), 'sale_payments_v2'));

  assert.match(body, /jsonb_array_elements\s*\(\s*p_payments\s*\)/);
  assert.match(body, /jsonb_array_length\s*\(\s*p_payments\s*\)\s*(?:=|<=)\s*0|p_payments\s+is\s+null/);
  assert.match(body, /\b(?:payment_amount|v_payment_amount|amount)\b[^;]*(?:<=\s*0|>\s*0)/);
  assert.match(body, /\b(?:payment_total|payments_total|v_payment_total)\b/);
  assert.match(body, /(?:payment_total|payments_total|v_payment_total)[^;]*(?:<>|!=|is\s+distinct\s+from)[^;]*(?:sale_total|v_total|grand_total)|(?:sale_total|v_total|grand_total)[^;]*(?:<>|!=|is\s+distinct\s+from)[^;]*(?:payment_total|payments_total|v_payment_total)/);
  assert.match(body, /insert into public\.sale_payments_v2\b/);
  assert.match(payments, /\bmethod\b[^,)]*(?:check|not null)/);
  assert.match(payments, /\bamount\s+numeric\s*\([^)]*\)\s+not\s+null\b/);
  assert.match(payments, /check\s*\(\s*amount\s*>\s*0\s*\)/);
});

test('una porción en efectivo exige caja OPEN bloqueada y sólo esa porción genera movimiento físico', () => {
  const bodyRaw = functionDefinition(readMigration(), 'checkout_sale_v2').body;
  const body = compact(bodyRaw);
  const cashLookup = indexOfMatch(body, /from public\.cash_sessions_v2\b/, 'búsqueda de caja abierta');
  const saleInsert = indexOfMatch(body, /insert into public\.sales_v2\b/, 'creación de venta');

  assert.match(body, /efectivo|cash/);
  assert.match(body.slice(Math.max(0, cashLookup - 800), cashLookup + 1200), /\bstatus\s*=\s*'open'/);
  assert.match(body.slice(cashLookup, cashLookup + 1200), /\bopened_by\s*=\s*p_cashier_user_id\b/);
  assert.ok(cashLookup < saleInsert, 'la caja abierta debe comprobarse antes de crear la venta');
  assertLockedQuery(bodyRaw, 'cash_sessions_v2');
  assert.doesNotMatch(body, /insert into public\.cash_sessions_v2\b/, 'checkout no debe abrir una caja implícitamente');
  assert.match(body, /insert into public\.cash_movements_v2\b/);
  assert.match(body, /insert into public\.cash_movements_v2\s*\([^)]*session_id[^)]*sale_id[^)]*amount/i);
});

test('checkout consume el shape normalizado de rules.sales en vez de una rama pos inexistente', () => {
  const body = compact(functionDefinition(readMigration(), 'checkout_sale_v2').body);

  assert.match(body, /config_json\s*->\s*'rules'/);
  assert.match(body, /\{sales,maxdiscountpercent\}/);
});

test('cuenta corriente exige cliente/cuenta, bloquea saldo y contabiliza sólo su porción en AR', () => {
  const bodyRaw = functionDefinition(readMigration(), 'checkout_sale_v2').body;
  const body = compact(bodyRaw);

  assert.match(body, /cuenta_corriente|account_credit|store_credit|current_account/);
  assert.match(body, /p_customer_id\s+is\s+null/);
  assertLockedQuery(bodyRaw, 'customer_accounts');
  assert.match(body, /credit_limit/);
  assert.match(body, /outstanding|balance|saldo/);
  assert.match(body, /insert into public\.accounts_receivable_ledger\b/);
  assert.match(body, /insert into public\.accounts_receivable_ledger\s*\([^)]*(?:sale_id[^)]*amount|amount[^)]*sale_id)/i);
  assert.match(body, /update public\.customer_accounts\b/);
});

test('caja, cierres y trazabilidad preservan actor, supervisor, diferencia e historial append-only', () => {
  const sql = readMigration();
  const sessions = compact(tableDefinition(sql, 'cash_sessions_v2'));
  const closures = compact(tableDefinition(sql, 'cash_closures'));
  const audit = compact(tableDefinition(sql, 'operational_audit_log'));
  const outbox = compact(tableDefinition(sql, 'outbox_events'));
  const migration = compact(sql);

  assert.match(sessions, /\bstatus\b[^)]*open[^)]*closed/);
  assert.match(sessions, /\bopened_by\b/);
  assert.match(sessions, /\bclosed_by\b/);
  assert.match(closures, /\bexpected_(?:cash|amount)\b/);
  assert.match(closures, /\bcounted_(?:cash|amount)\b/);
  assert.match(closures, /\bdifference\b/);
  assert.match(closures, /\b(?:supervisor_user_id|reviewed_by|approved_by)\b/);
  assert.match(audit, /\bactor_user_id\b/);
  assert.match(audit, /\baction\b/);
  assert.match(audit, /\bentity_(?:type|table)\b/);
  assert.match(audit, /\b(?:before_data|old_data)\b/);
  assert.match(audit, /\b(?:after_data|new_data)\b/);
  assert.match(outbox, /\bevent_type\b/);
  assert.match(outbox, /\bpayload\s+jsonb\b/);
  assert.doesNotMatch(migration, /delete from public\.(?:sales_v2|sale_items_v2|sale_payments_v2|cash_movements_v2|accounts_receivable_ledger|operational_audit_log)\b/);
});

test('el modelo contempla anulación/devolución sin borrar la venta original', () => {
  const sql = readMigration();
  const sales = compact(tableDefinition(sql, 'sales_v2'));
  const payments = compact(tableDefinition(sql, 'sale_payments_v2'));
  const inventoryLedger = compact(tableDefinition(sql, 'inventory_ledger_v2'));
  const cashMovements = compact(tableDefinition(sql, 'cash_movements_v2'));

  assert.match(sales, /voided|cancelled|anulada/);
  assert.match(sales, /refunded|returned|devuelta/);
  assert.match(payments, /refunded|reversed|voided|reembolso|revers/);
  assert.match(inventoryLedger, /return|refund|void|devolu|anula/);
  assert.match(cashMovements, /refund|reversal|void|reembolso|revers|anula/);
});

test('restricciones de concurrencia impiden dos cajas abiertas y saldos duplicados', () => {
  const sql = compact(readMigration());

  assert.match(
    sql,
    /create unique index if not exists [^;]+ on public\.cash_sessions_v2\s*\([^)]*(?:tenant_id[^)]*register_id|register_id[^)]*tenant_id)[^)]*\)\s*where\s+status\s*=\s*'open'/
  );
  assert.match(
    compact(tableDefinition(readMigration(), 'inventory_balances_v2')),
    /unique\s*\(\s*tenant_id\s*,\s*product_id\s*,\s*location_id\s*\)/
  );
  assert.match(
    compact(tableDefinition(readMigration(), 'customer_accounts')),
    /unique\s*\(\s*tenant_id\s*,\s*customer_id\s*\)/
  );
});

test('checkout emite auditoría y outbox enlazadas a la venta para supervisión posterior', () => {
  const body = compact(functionDefinition(readMigration(), 'checkout_sale_v2').body);
  const saleInsert = indexOfMatch(body, /insert into public\.sales_v2\b/, 'venta');
  const auditInsert = indexOfMatch(body, /insert into public\.operational_audit_log\b/, 'auditoría');
  const outboxInsert = indexOfMatch(body, /insert into public\.outbox_events\b/, 'outbox');

  assert.ok(saleInsert < auditInsert);
  assert.ok(saleInsert < outboxInsert);
  assert.match(body, /insert into public\.operational_audit_log\s*\([^)]*(?:entity_id|record_id)/i);
  assert.match(body, /insert into public\.outbox_events\s*\([^)]*(?:aggregate_id|entity_id|record_id)/i);
});

const testIds = Object.freeze({
  tenant: '11111111-1111-4111-8111-111111111111',
  cashier: '22222222-2222-4222-8222-222222222222',
  salesperson: '33333333-3333-4333-8333-333333333333',
  customer: '44444444-4444-4444-8444-444444444444',
  register: '55555555-5555-4555-8555-555555555555'
});

function buildDraft(overrides = {}) {
  return {
    tenant_id: testIds.tenant,
    cashier_user_id: testIds.cashier,
    salesperson_user_id: testIds.salesperson,
    customer_id: testIds.customer,
    register_id: testIds.register,
    idempotency_key: 'checkout-regression-001',
    payment_method: 'MIXTO',
    payment_breakdown: {
      cash_amount: 4000,
      secondary_method: 'TRANSFERENCIA',
      secondary_amount: 6000
    },
    items: [{ product_id: 'SKU-001', quantity: 2, price: 5000 }],
    total: 10000,
    ...overrides
  };
}

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }
}

test('OperationalApi arma un pago mixto exacto y rechaza splits incompletos o desbalanceados', () => {
  assert.equal(normalizePaymentMethod('efectivo'), 'CASH');
  assert.equal(normalizePaymentMethod('Mercado Pago'), 'MERCADO_PAGO');
  assert.equal(normalizePaymentMethod('cuenta_corriente'), 'ACCOUNT_CREDIT');
  assert.deepEqual(buildPayments(buildDraft()), [
    { method: 'CASH', amount: 4000, metadata: {} },
    { method: 'BANK_TRANSFER', amount: 6000, metadata: {} }
  ]);

  assert.throws(
    () => buildPayments(buildDraft({ payment_breakdown: { cash_amount: 4000, secondary_method: 'TRANSFERENCIA', secondary_amount: 5000 } })),
    (error) => error instanceof OperationalApiError && error.code === 'PAYMENT_SPLIT_MISMATCH'
  );
  assert.throws(
    () => buildPayments(buildDraft({ payment_breakdown: { cash_amount: 0, secondary_method: 'TRANSFERENCIA', secondary_amount: 10000 } })),
    (error) => error instanceof OperationalApiError && error.code === 'INVALID_PAYMENT_SPLIT'
  );
});

test('OperationalApi preserva cajero y vendedor distintos y genera payload_hash determinista y sensible al contenido', async () => {
  const draftA = buildDraft();
  const draftSameMeaning = buildDraft({
    items: [{ price: 5000, quantity: 2, product_id: 'SKU-001' }]
  });
  const draftChanged = buildDraft({
    items: [{ product_id: 'SKU-001', quantity: 3, price: 5000 }],
    total: 15000,
    payment_breakdown: { cash_amount: 6000, secondary_method: 'TRANSFERENCIA', secondary_amount: 9000 }
  });

  const commandA = await buildCheckoutCommand(draftA);
  const commandSame = await buildCheckoutCommand(draftSameMeaning);
  const commandChanged = await buildCheckoutCommand(draftChanged);

  assert.equal(commandA.cashier_user_id, testIds.cashier);
  assert.equal(commandA.salesperson_user_id, testIds.salesperson);
  assert.notEqual(commandA.cashier_user_id, commandA.salesperson_user_id);
  assert.equal(commandA.payload_hash, commandSame.payload_hash);
  assert.notEqual(commandA.payload_hash, commandChanged.payload_hash);
  assert.match(commandA.payload_hash, /^(?:[a-f0-9]{64}|fnv1a-[a-f0-9]{8})$/);
});

test('cuenta corriente exige customer_id y nunca confunde customer_account_id con el cliente', async () => {
  const creditDraft = buildDraft({
    payment_method: 'CUENTA_CORRIENTE',
    payment_breakdown: null,
    customer_id: testIds.customer
  });
  const command = await buildCheckoutCommand(creditDraft);
  assert.deepEqual(command.payments, [{ method: 'ACCOUNT_CREDIT', amount: 10000, metadata: {} }]);
  assert.equal(command.customer_id, testIds.customer);

  await assert.rejects(
    buildCheckoutCommand(buildDraft({
      payment_method: 'CUENTA_CORRIENTE',
      payment_breakdown: null,
      customer_id: null,
      customer_account_id: '88888888-8888-4888-8888-888888888888'
    })),
    (error) => error instanceof OperationalApiError && error.code === 'CUSTOMER_REQUIRED_FOR_CREDIT'
  );
});

test('el comando conserva location_id para vincular la venta con la estantería correcta', async () => {
  const locationId = '99999999-9999-4999-8999-999999999999';
  const command = await buildCheckoutCommand(buildDraft({
    items: [{ product_id: 'SKU-001', location_id: locationId, quantity: 2, price: 5000 }]
  }));

  assert.equal(command.items[0].location_id, locationId);
  await assert.rejects(
    buildCheckoutCommand(buildDraft({
      items: [{ product_id: 'SKU-001', location_id: 'shelf-local-no-uuid', quantity: 2, price: 5000 }]
    })),
    (error) => error instanceof OperationalApiError && error.code === 'INVALID_LOCATION_ID'
  );
});

test('cliente y SQL mantienen paridad exacta de parámetros para checkout_sale_v2', () => {
  const apiSource = fs.readFileSync(path.resolve('operational-api.js'), 'utf8');
  const callMatch = /\.rpc\s*\(\s*['"]checkout_sale_v2['"]\s*,\s*\{([\s\S]*?)\}\s*\)/.exec(apiSource);
  assert.ok(callMatch, 'operational-api debe invocar checkout_sale_v2');
  const clientParameters = [...callMatch[1].matchAll(/\b(p_[a-z0-9_]+)\s*:/gi)].map((match) => match[1].toLowerCase());
  const sqlDefinition = compact(functionDefinition(readMigration(), 'checkout_sale_v2').definition);

  assert.ok(clientParameters.length > 0);
  for (const parameter of clientParameters) {
    assert.match(sqlDefinition, new RegExp(`\\b${parameter}\\b`), `la RPC SQL no acepta ${parameter} enviado por el cliente`);
  }
  const declaredParameters = [...sqlDefinition.matchAll(/\b(p_[a-z0-9_]+)\s+(?:uuid|text|jsonb|date|numeric|integer|boolean)\b/g)]
    .map((match) => match[1]);
  assert.deepEqual([...new Set(clientParameters)].sort(), [...new Set(declaredParameters)].sort());
});

test('checkoutSale impide suplantar tenant/cajero pero permite cerrar la venta atendida por otro vendedor', async () => {
  const calls = [];
  const supabaseClient = {
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      return { data: { sale_id: 'sale-1', status: 'COMPLETED' }, error: null };
    }
  };
  const authContext = { isVerified: true, tenantId: testIds.tenant, userId: testIds.cashier };
  const result = await checkoutSale({ supabaseClient, authContext, draft: buildDraft(), registerId: testIds.register });

  assert.equal(result.state, 'CONFIRMED');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'checkout_sale_v2');
  assert.equal(calls[0].parameters.p_cashier_user_id, testIds.cashier);
  assert.equal(calls[0].parameters.p_salesperson_user_id, testIds.salesperson);

  await assert.rejects(
    checkoutSale({
      supabaseClient,
      authContext,
      draft: buildDraft({ cashier_user_id: '66666666-6666-4666-8666-666666666666' })
    }),
    (error) => error instanceof OperationalApiError && error.code === 'IDENTITY_MISMATCH'
  );
  await assert.rejects(
    checkoutSale({
      supabaseClient,
      authContext,
      draft: buildDraft({ tenant_id: '77777777-7777-4777-8777-777777777777' })
    }),
    (error) => error instanceof OperationalApiError && error.code === 'IDENTITY_MISMATCH'
  );
});

test('outbox offline deduplica por idempotency_key y retry confirma sin duplicar la intención', async () => {
  const previousStorage = globalThis.localStorage;
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });

  const authContext = { isVerified: true, tenantId: testIds.tenant, userId: testIds.cashier };
  const failingClient = {
    async rpc() {
      return { data: null, error: { message: 'Failed to fetch', code: 'NETWORK' } };
    }
  };
  const successClient = {
    async rpc() {
      return { data: { sale_id: 'sale-retry-1', idempotent: false }, error: null };
    }
  };

  try {
    const first = await checkoutSale({ supabaseClient: failingClient, authContext, draft: buildDraft() });
    const second = await checkoutSale({ supabaseClient: failingClient, authContext, draft: buildDraft() });
    assert.equal(first.state, 'PENDING');
    assert.equal(second.state, 'PENDING');
    assert.equal(readOutbox(testIds.tenant, testIds.cashier).length, 1);

    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
    const retried = await retryPending({ supabaseClient: successClient, authContext });
    assert.equal(retried.length, 1);
    assert.equal(retried[0].state, 'SYNCED');
    const outbox = readOutbox(testIds.tenant, testIds.cashier);
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].state, 'SYNCED');
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else delete globalThis.navigator;
  }
});

test('outbox nunca sobrescribe una intención previa con la misma clave y payload_hash divergente', async () => {
  const previousStorage = globalThis.localStorage;
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  globalThis.localStorage = new MemoryStorage();
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });

  const authContext = { isVerified: true, tenantId: testIds.tenant, userId: testIds.cashier };
  const failingClient = {
    async rpc() {
      return { data: null, error: { message: 'Failed to fetch', code: 'NETWORK' } };
    }
  };

  try {
    await checkoutSale({ supabaseClient: failingClient, authContext, draft: buildDraft() });
    const original = readOutbox(testIds.tenant, testIds.cashier)[0];
    const divergentDraft = buildDraft({
      items: [{ product_id: 'SKU-001', quantity: 3, price: 5000 }],
      total: 15000,
      payment_breakdown: { cash_amount: 6000, secondary_method: 'TRANSFERENCIA', secondary_amount: 9000 }
    });

    try {
      await checkoutSale({ supabaseClient: failingClient, authContext, draft: divergentDraft });
    } catch (error) {
      assert.ok(error instanceof OperationalApiError);
    }

    const records = readOutbox(testIds.tenant, testIds.cashier);
    assert.equal(records.length, 1);
    assert.equal(records[0].payload_hash, original.payload_hash, 'debe preservarse la intención que fue encolada primero');
    assert.deepEqual(records[0].items, original.items);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else delete globalThis.navigator;
  }
});
