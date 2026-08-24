import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import operationalPackage from '../operational-api.js';

const migration004 = fs.readFileSync(path.resolve('scripts', 'migrations', '004_operational_core_and_config.sql'), 'utf8');
const migration005 = fs.readFileSync(path.resolve('scripts', 'migrations', '005_operational_lifecycle.sql'), 'utf8');
const migration006 = fs.readFileSync(path.resolve('scripts', 'migrations', '006_catalog_ingestion.sql'), 'utf8');

const ids = Object.freeze({
  tenant: '11111111-1111-4111-8111-111111111111',
  user: '22222222-2222-4222-8222-222222222222',
  product: '33333333-3333-4333-8333-333333333333',
  location: '44444444-4444-4444-8444-444444444444',
  draft: '55555555-5555-4555-8555-555555555555',
  order: '66666666-6666-4666-8666-666666666666',
  sale: '77777777-7777-4777-8777-777777777777',
  register: '88888888-8888-4888-8888-888888888888'
});

function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ');
}

function compact(source) {
  return withoutComments(source).replace(/\s+/g, ' ').trim().toLowerCase();
}

function sqlFunction(source, name) {
  const expression = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, 'i');
  const match = expression.exec(withoutComments(source));
  assert.ok(match, `falta public.${name}`);
  const tail = withoutComments(source).slice(match.index);
  const bodyStart = tail.indexOf('AS $$');
  assert.notEqual(bodyStart, -1, `${name} no usa cuerpo dollar-quoted`);
  const bodyEnd = tail.indexOf('$$;', bodyStart + 5);
  assert.notEqual(bodyEnd, -1, `${name} no cierra su cuerpo`);
  return tail.slice(0, bodyEnd + 3);
}

function assertMigrationEnvelope(source, version) {
  const normalized = compact(source);
  assert.match(normalized, /^begin\s*;/);
  assert.match(normalized, /commit\s*;$/);
  assert.match(normalized, new RegExp(`values\\s*\\(\\s*'${version}'`));
  assert.match(normalized, /on conflict\s*\(\s*version\s*\)\s*do\s+nothing/);
  assert.equal((withoutComments(source).match(/\$\$/g) || []).length % 2, 0, `${version} tiene dollar-quotes desbalanceados`);
}

test('005 y 006 son migraciones transaccionales, registrables y sin DDL destructivo', () => {
  assertMigrationEnvelope(migration005, '005');
  assertMigrationEnvelope(migration006, '006');
  for (const source of [migration005, migration006]) {
    const normalized = compact(source);
    assert.doesNotMatch(normalized, /\b(?:drop\s+table|truncate\s+table)\b/);
    assert.doesNotMatch(normalized, /\bcreate\s+table\s+(?!if\s+not\s+exists)/);
  }
});

test('ingreso de producto es un workflow central: borrador, ubicación, aprobación, catálogo y stock', () => {
  const table = compact(migration006);
  const submit = compact(sqlFunction(migration006, 'submit_catalog_product_draft_v2'));
  const locate = compact(sqlFunction(migration006, 'locate_catalog_product_draft_v2'));
  const approve = compact(sqlFunction(migration006, 'approve_catalog_product_draft_v2'));
  const reject = compact(sqlFunction(migration006, 'reject_catalog_product_draft_v2'));

  assert.match(table, /create table if not exists public\.catalog_product_drafts_v2/);
  assert.match(table, /unique\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)/);
  assert.match(table, /foreign key\s*\(\s*tenant_id\s*,\s*product_id\s*\)/);
  assert.match(table, /foreign key\s*\(\s*tenant_id\s*,\s*location_id\s*\)/);
  assert.match(table, /enable row level security/);
  assert.match(table, /for select to authenticated using\s*\(\s*public\.operational_is_tenant_member\(tenant_id\)\s*\)/);
  assert.match(table, /revoke all on table public\.catalog_product_drafts_v2 from anon, authenticated/);

  for (const body of [submit, locate, approve, reject]) {
    assert.match(body, /auth\.uid\(\)/);
    assert.match(body, /operational_has_tenant_role/);
    assert.match(body, /set search_path = public, pg_temp/);
    assert.match(body, /set row_security = off/);
  }
  assert.match(submit, /digest\s*\(/);
  assert.match(submit, /payload_hash/);
  assert.match(locate, /for update/);
  assert.match(approve, /for update/);
  assert.match(approve, /public\.upsert_catalog_product_v2\s*\(/);
  assert.match(approve, /public\.upsert_inventory_location_v2\s*\(/);
  assert.match(approve, /public\.receive_inventory_v2\s*\(/);
  assert.ok(approve.indexOf('upsert_catalog_product_v2') < approve.indexOf('receive_inventory_v2'));
  assert.ok(approve.indexOf('receive_inventory_v2') < approve.indexOf("set status = 'approved'"));
  assert.match(reject, /v_draft\.status = 'approved'/);
});

test('pedidos públicos sólo avanzan por transiciones legales y cancelar libera la reserva una vez', () => {
  const transition = compact(sqlFunction(migration005, 'transition_public_order_v2'));

  assert.match(transition, /auth\.uid\(\)/);
  assert.match(transition, /operational_has_tenant_role/);
  assert.match(transition, /from public\.public_orders_v2[\s\S]*for update/);
  assert.match(transition, /status = 'confirmed' and v_target = 'preparing'/);
  assert.match(transition, /status = 'preparing' and v_target = 'ready'/);
  assert.match(transition, /status = 'ready' and v_target = 'delivered'/);
  assert.match(transition, /status = 'pending_payment' and v_target = 'cancelled'/);
  assert.doesNotMatch(transition, /status = 'confirmed' and v_target = 'cancelled'/);
  assert.match(transition, /set reserved = reserved - v_reservation\.quantity/);
  assert.match(transition, /set status = 'cancelled'/);
  assert.match(transition, /event_type[\s\S]*'release'/);
  assert.match(transition, /v_existing_outbox/);
});

test('refund de pedido repone fulfillment o libera reserva y está ligado al evento único del proveedor', () => {
  const refund = compact(sqlFunction(migration005, 'restore_public_order_inventory_on_refund_v2'));
  const paymentEvents = compact(migration004.slice(
    migration004.toLowerCase().indexOf('create table if not exists public.public_order_payment_events_v2'),
    migration004.toLowerCase().indexOf('-- los ledgers y eventos financieros')
  ));
  const normalized005 = compact(migration005);

  assert.match(paymentEvents, /unique\s*\(\s*tenant_id\s*,\s*payment_provider\s*,\s*provider_payment_id\s*,\s*status\s*\)/);
  assert.match(normalized005, /create trigger public_order_refund_inventory_v2 after insert/);
  assert.match(refund, /new\.status <> 'refunded'/);
  assert.match(refund, /ir\.status in\s*\(\s*'active'\s*,\s*'fulfilled'\s*\)/);
  assert.match(refund, /set reserved = reserved - v_reservation\.quantity/);
  assert.match(refund, /set on_hand = on_hand \+ v_reservation\.quantity/);
  assert.match(refund, /set status = 'refunded'/);
  assert.match(refund, /'public-refund:' \|\| new\.provider_payment_id/);
});

test('anulación de venta es compensatoria y atómica para stock, efectivo y cuenta corriente', () => {
  const body = compact(sqlFunction(migration005, 'void_sale_v2'));
  const normalized005 = compact(migration005);

  assert.match(normalized005, /drop constraint if exists customer_accounts_balance_check/);
  assert.match(normalized005, /check\s*\(\s*balance <= credit_limit\s*\)/);
  assert.match(body, /array\s*\[\s*'admin'\s*,\s*'supervisor'\s*\]/);
  assert.match(body, /from public\.sales_v2[\s\S]*for update/);
  assert.match(body, /v_sale\.status <> 'confirmed'/);
  assert.match(body, /sp\.method not in\s*\(\s*'cash'\s*,\s*'account_credit'\s*\)/);
  assert.match(body, /set on_hand = on_hand \+ v_item\.quantity/);
  assert.match(body, /'void', v_item\.quantity/);
  assert.match(body, /set balance = balance - v_payment\.amount/);
  assert.match(body, /'reversal', 'out'/);
  assert.match(body, /insert into public\.accounts_receivable_ledger/);
  assert.match(body, /update public\.sales_v2 set status = 'voided'/);
  assert.match(body, /insert into public\.sale_events_v2/);
  assert.match(body, /insert into public\.operational_audit_log/);
  assert.match(body, /insert into public\.outbox_events/);
});

test('OperationalApi conserva paridad exacta de las RPC de ciclo de vida', async () => {
  const calls = [];
  const supabaseClient = {
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      return { data: { ok: true }, error: null };
    }
  };
  const authContext = { isVerified: true, tenantId: ids.tenant, userId: ids.user };

  await operationalPackage.submitCatalogProductDraft({
    supabaseClient,
    authContext,
    idempotencyKey: 'draft-submit-001',
    draft: { sku: 'SKU-1', name: 'Producto', sale_price: 100, stock_quantity: 2 }
  });
  await operationalPackage.locateCatalogProductDraft({
    supabaseClient,
    authContext,
    draftId: ids.draft,
    idempotencyKey: 'draft-locate-001',
    location: { code: 'TI-A-P1-N1-C', name: 'Tienda A' }
  });
  await operationalPackage.approveCatalogProductDraft({
    supabaseClient,
    authContext,
    draftId: ids.draft,
    overrides: {},
    idempotencyKey: 'draft-approve-001'
  });
  await operationalPackage.transitionPublicOrder({
    supabaseClient,
    authContext,
    orderId: ids.order,
    status: 'PREPARING',
    idempotencyKey: 'order-transition-001'
  });
  await operationalPackage.voidSale({
    supabaseClient,
    authContext,
    saleId: ids.sale,
    reason: 'Error de carga confirmado',
    idempotencyKey: 'sale-void-001',
    registerId: ids.register
  });

  assert.deepEqual(calls.map(call => call.name), [
    'submit_catalog_product_draft_v2',
    'locate_catalog_product_draft_v2',
    'approve_catalog_product_draft_v2',
    'transition_public_order_v2',
    'void_sale_v2'
  ]);
  assert.deepEqual(Object.keys(calls[0].parameters).sort(), ['p_draft', 'p_idempotency_key', 'p_tenant_id']);
  assert.deepEqual(Object.keys(calls[1].parameters).sort(), ['p_draft_id', 'p_idempotency_key', 'p_location', 'p_tenant_id']);
  assert.deepEqual(Object.keys(calls[2].parameters).sort(), ['p_draft_id', 'p_idempotency_key', 'p_overrides', 'p_tenant_id']);
  assert.deepEqual(Object.keys(calls[3].parameters).sort(), ['p_idempotency_key', 'p_new_status', 'p_notes', 'p_order_id', 'p_tenant_id']);
  assert.deepEqual(Object.keys(calls[4].parameters).sort(), ['p_idempotency_key', 'p_reason', 'p_register_id', 'p_sale_id', 'p_tenant_id']);
});

test('OperationalApi rechaza identidades, IDs y estados inventados antes de llamar a Supabase', async () => {
  const supabaseClient = { async rpc() { throw new Error('no debe invocarse'); } };
  const authContext = { isVerified: true, tenantId: ids.tenant, userId: ids.user };

  await assert.rejects(
    operationalPackage.transitionPublicOrder({
      supabaseClient,
      authContext,
      orderId: 'pedido-local',
      status: 'READY',
      idempotencyKey: 'invalid-order-001'
    }),
    error => error.code === 'INVALID_ORDER_TRANSITION'
  );
  await assert.rejects(
    operationalPackage.voidSale({
      supabaseClient,
      authContext: { ...authContext, isVerified: false },
      saleId: ids.sale,
      reason: 'Motivo suficiente',
      idempotencyKey: 'invalid-void-001'
    }),
    error => error.code === 'AUTH_REQUIRED'
  );
});
