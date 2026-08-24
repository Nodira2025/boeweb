import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PosCartEngine } from '../pos-cart-engine.js';

const migration = fs.readFileSync(path.resolve('scripts', 'migrations', '007_security_accounting_contract.sql'), 'utf8');
const storefront = fs.readFileSync(path.resolve('index.js'), 'utf8');
const healthCron = fs.readFileSync(path.resolve('netlify', 'functions', 'health-check-cron.mjs'), 'utf8');

function compact(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function functionBody(name) {
  const source = migration.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const marker = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, 'i');
  const match = marker.exec(source);
  assert.ok(match, `falta public.${name}`);
  const tail = source.slice(match.index);
  const start = tail.indexOf('AS $$');
  const end = tail.indexOf('$$;', start + 5);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return compact(tail.slice(0, end + 3));
}

test('007 es contract-breaking, transaccional y registrable', () => {
  const sql = compact(migration);
  assert.match(sql, /^begin\s*;/);
  assert.match(sql, /commit\s*;$/);
  assert.match(sql, /values\s*\(\s*'007'\s*,\s*'security_accounting_contract'/);
  assert.match(sql, /'sha256-security-accounting-contract-007-v1'\s*,\s*false/);
  assert.equal((migration.match(/\$\$/g) || []).length % 2, 0);
});

test('anon sólo recibe una vista pública sanitizada y publicada por tenant', () => {
  const sql = compact(migration);
  const viewStart = sql.indexOf('create or replace view public.public_catalog_products_v2');
  const viewEnd = sql.indexOf('revoke all on public.public_catalog_products_v2', viewStart);
  const view = sql.slice(viewStart, viewEnd);

  assert.match(sql, /drop policy if exists catalog_products_public_read_v2/);
  assert.match(sql, /revoke select on public\.catalog_products from anon/);
  assert.match(view, /where cp\.active = true/);
  assert.match(view, /tac\.stage = 'published'/);
  assert.match(view, /available_quantity/);
  assert.doesNotMatch(view, /cost_price/);
  assert.doesNotMatch(view, /created_by|updated_by/);
  assert.match(sql, /grant select on public\.public_catalog_products_v2 to anon, authenticated, service_role/);
});

test('pagos externos de POS requieren service_role y caja exige la misma moneda', () => {
  const external = functionBody('validate_external_sale_payment_v2');
  const currency = functionBody('validate_cash_movement_currency_v2');

  assert.match(external, /new\.method in\s*\(\s*'card'\s*,\s*'mercado_pago'\s*,\s*'qr'\s*\)/);
  assert.match(external, /v_role is distinct from 'service_role'/);
  assert.match(currency, /join public\.cash_registers/);
  assert.match(currency, /v_register_currency <> new\.currency/);
  assert.match(compact(migration), /before insert on public\.sale_payments_v2/);
  assert.match(compact(migration), /before insert on public\.cash_movements_v2/);
});

test('pago web aprobado crea cliente, venta, items, pago y enlaces auditables', () => {
  const body = functionBody('record_public_order_accounting_v2');
  const sql = compact(migration);

  assert.match(sql, /add column if not exists channel text not null default 'pos'/);
  assert.match(sql, /channel = 'public_order'/);
  assert.match(sql, /foreign key\s*\(\s*tenant_id\s*,\s*source_order_id\s*\)/);
  assert.match(sql, /add column if not exists customer_id uuid/);
  assert.match(sql, /add column if not exists sale_id uuid/);
  assert.match(body, /new\.status not in\s*\(\s*'approved'\s*,\s*'refunded'\s*\)/);
  assert.match(body, /insert into public\.customers/);
  assert.match(body, /insert into public\.sales_v2/);
  assert.match(body, /'public_order', v_order\.id/);
  assert.match(body, /update public\.public_orders_v2 set customer_id = v_customer\.id, sale_id = v_sale\.id/);
  assert.match(body, /insert into public\.sale_items_v2/);
  assert.match(body, /insert into public\.sale_payments_v2/);
  assert.match(body, /'verified_by_backend', true/);
  assert.match(body, /insert into public\.sale_events_v2/);
  assert.match(body, /insert into public\.operational_audit_log/);
  assert.match(body, /insert into public\.outbox_events/);
});

test('refund web genera asiento compensatorio y la venta queda REFUNDED', () => {
  const body = functionBody('record_public_order_accounting_v2');
  assert.match(body, /'refund', v_original_payment\.method/);
  assert.match(body, /update public\.sales_v2 set status = 'refunded'/);
  assert.match(body, /'refunded', null, 'reintegro web confirmado por proveedor'/);
  assert.match(body, /public_order_sale_refunded/);
});

test('reservas vencidas se liberan con lock, ledger e idempotencia', () => {
  const body = functionBody('expire_public_order_reservations_v2');
  assert.match(body, /v_role is distinct from 'service_role'/);
  assert.match(body, /ir\.status = 'active'/);
  assert.match(body, /po\.status = 'pending_payment'/);
  assert.match(body, /for update of ir skip locked/);
  assert.match(body, /set reserved = reserved - v_reservation\.quantity/);
  assert.match(body, /set status = 'expired'/);
  assert.match(body, /'release', 0, -v_reservation\.quantity/);
  assert.match(body, /on conflict\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\) do nothing/);
  assert.match(healthCron, /\.rpc\(\s*['"]expire_public_order_reservations_v2['"]/);
  assert.match(healthCron, /expired_reservations:\s*Number\(expirationResult\?\.expired_reservations/);
});

test('storefront consume la vista canónica y descarta carritos que ya no tienen stock', () => {
  const loadStart = storefront.indexOf('async function loadCatalog()');
  const loadEnd = storefront.indexOf('// Expose loadCatalog globally', loadStart);
  const authoritativePath = storefront.slice(loadStart, loadEnd);

  assert.match(authoritativePath, /\.from\('public_catalog_products_v2'\)/);
  assert.match(authoritativePath, /\.eq\('tenant_id', tenantId\)/);
  assert.match(authoritativePath, /cart = cart\.filter/);
  assert.match(authoritativePath, /localStorage\.setItem\('boeweb_cart'/);
  assert.match(authoritativePath, /handleUrlProductDeepLink\(\);/);
  assert.doesNotMatch(authoritativePath, /supplier_products|products\.json|boeweb_internal_catalog/);
});

test('el carrito POS conserva dos estanterías del mismo SKU como líneas distintas', () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
  try {
    const cart = new PosCartEngine('POS');
    const productId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const firstLocation = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const secondLocation = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    assert.equal(cart.addItem({
      id: productId,
      product_code: 'SKU-UNO',
      cart_key: `${productId}::${firstLocation}`,
      location_id: firstLocation,
      name: 'Producto uno',
      price: 100,
      stock: 2,
      quantity: 2
    }), true);
    assert.equal(cart.addItem({
      id: productId,
      product_code: 'SKU-UNO',
      cart_key: `${productId}::${secondLocation}`,
      location_id: secondLocation,
      name: 'Producto uno',
      price: 100,
      stock: 3,
      quantity: 3
    }), true);

    const draft = cart.createSaleDraft({
      tenantId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      cashierUser: { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', name: 'Caja' },
      salespersonUser: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', name: 'Venta' }
    });
    assert.equal(draft.items.length, 2);
    assert.deepEqual(draft.items.map(item => item.product_id), [productId, productId]);
    assert.deepEqual(draft.items.map(item => item.location_id), [firstLocation, secondLocation]);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
