import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import api from '../store-catalog.js';

test('private products stay out by category or metadata without hiding ordinary shop supplies', () => {
  for (const product of [{ category: ' reprocam ' }, { category: 'REPROCANN' },
    { metadata: { is_reprocam: true } }, { metadata: { is_reprocann: 'true' } }]) {
    assert.equal(api.isPrivateProduct(product), true);
  }
  assert.equal(api.isPrivateProduct({ category: 'Iluminación', metadata: { is_reprocam: false } }), false);
});

test('local register list rejects the private cash code and metadata', () => {
  assert.equal(api.isLocalRegister({ id: 'main', code: 'CAJA-PRINCIPAL' }), true);
  assert.equal(api.isLocalRegister({ id: 'rc', code: 'CAJA-REPROCAM' }), false);
  assert.equal(api.isLocalRegister({ id: 'renamed', code: 'OTRA', metadata: { is_reprocam: true } }), false);
  assert.equal(api.isLocalRegister(null), false);
});

test('readAllRows loads beyond the default 1000 and applies tenant on every page', async () => {
  const data = Array.from({ length: 2014 }, (_, id) => ({ id }));
  const ranges = [];
  const client = { from(view) {
    assert.equal(view, 'public_external_catalog_v2');
    return { select() { return this; }, eq(field, value) {
      assert.equal(field, 'tenant_id'); assert.equal(value, 'tenant-A'); return this;
    }, order(field) { assert.equal(field, 'id'); return this; }, async range(start, end) {
      ranges.push([start, end]); return { data: data.slice(start, end + 1) };
    } };
  } };
  assert.equal((await api.readAllRows(client, 'public_external_catalog_v2', '*', 'tenant-A')).length, 2014);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test('read errors are not disguised as a successful empty catalog', async () => {
  const client = { from() { return { select() { return this; }, eq() { return this; }, order() { return this; },
    async range() { return { error: new Error('offline') }; } }; } };
  await assert.rejects(api.readAllRows(client, 'view', '*', 'tenant'), /offline/);
});

test('supplier offers keep their canonical retail price and estimate, never own stock or checkout identity', () => {
  const offer = api.normalizeExternalProduct({ id: 'offer-1', external_sku: 'LED-1', name: 'Panel LED',
    price: 12300, available_units: 999, source_type: 'B2B_SUPPLIER', estimated_days: 5 });
  assert.equal(offer.price, 12300);
  assert.equal(offer.own_stock, 0);
  assert.equal(offer.available_quantity, 0);
  assert.equal(offer.inquiry_only, true);
  assert.equal(offer.product_id, undefined);
  assert.equal(offer.id, 'external:offer-1');
  assert.equal(offer.estimated_days, 5);
  const url = new URL(api.consultationUrl(offer, '+54 9 381 1234567'));
  assert.equal(url.hostname, 'wa.me');
  assert.equal(url.pathname, '/5493811234567');
  assert.match(url.searchParams.get('text'), /antes de pagar/);
  assert.equal(api.consultationUrl(offer, ''), '');
});

test('own backorders are not national supplier products', () => {
  const row = { id: 'local', sku: 'LOCAL', price: 100, track_stock: true, available_quantity: 0 };
  const own = api.normalizeOwnProduct(row, { allowBackorders: true });
  assert.equal(own.source_type, 'INTERNAL');
  assert.equal(own.allow_backorder, true);
  assert.equal(api.normalizeOwnProduct(row, { allowBackorders: false }).available, false);
});

test('published view is a safe projection and rejects private public orders without moving history', () => {
  const sql = fs.readFileSync('scripts/migrations/026_store_catalog_isolation.sql', 'utf8');
  assert.match(sql, /^BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /(?:UPDATE|DELETE FROM|INSERT INTO) public\.(?:inventory_balances|cash_movements|sales_v2)/i);
  assert.match(sql, /BEFORE INSERT OR UPDATE OF items ON public\.public_orders_v2/);
  const view = sql.split('CREATE OR REPLACE VIEW public.public_external_catalog_v2')[1].split('REVOKE')[0];
  assert.doesNotMatch(view, /cost_price|contact_info|supplier_phone/);
  assert.match(view, /source\.active = true/);
  assert.match(view, /catalog,source[^\n]+ = 'unified'/);
  assert.match(view, /is_private_catalog_product_v2/);
});

test('store removes dummy advisers and provides accessible PULSO credit', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const js = fs.readFileSync('index.js', 'utf8');
  assert.doesNotMatch(html + js, /team-showcase-section|team-cards-grid|5493510001111/);
  assert.match(html, /Desarrollado por PULSO/);
  assert.match(html, /alt="PULSO — Transformar procesos para crecer"/);
  assert.match(html, /detail-inquiry-link/);
  assert.match(js, /currentDetailProduct\.inquiry_only/);
  assert.match(js, /&& !product\.inquiry_only/);
});

test('cash summary and history cannot silently select a Reprocam session', () => {
  const js = fs.readFileSync('vendedor.js', 'utf8');
  assert.match(js, /filter\(window\.StoreCatalog\.isLocalRegister\)/);
  assert.match(js, /!registers\.some\(register => register\.id === selectedRegisterId\)/);
  assert.match(js, /in\('cash_sessions_v2\.register_id', registerIds\)/);
  assert.match(js, /filter\(product => !window\.StoreCatalog\.isPrivateProduct\(product\)\)/);
});

function vendorFunction(name) {
  const source = fs.readFileSync('vendedor.js', 'utf8');
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1);
  const next = /\n(?:async )?function [A-Za-z_$]/g;
  next.lastIndex = start + 1;
  return source.slice(start, next.exec(source)?.index ?? source.length);
}

test('real register loader never restores a remembered private register, even for admin', async () => {
  const select = { value: 'private', innerHTML: '', disabled: false };
  const status = {};
  const context = { tenantId: 'tenant', userId: 'admin', isVerified: true, role: 'ADMIN' };
  const records = {
    cash_registers: [{ id: 'private', tenant_id: 'tenant', code: 'CAJA-REPROCAM', name: 'Privada' },
      { id: 'main', tenant_id: 'tenant', code: 'CAJA-PRINCIPAL', name: 'Local' }],
    cash_sessions_v2: [{ id: 'session-private', register_id: 'private', opened_by: 'admin' }]
  };
  const sandbox = vm.createContext({
    localCashRegisters: [], window: { StoreCatalog: api }, console,
    ensureVendorOperationalSession: async () => context,
    document: { getElementById: id => id === 'pos-register-select' ? select : status },
    canInspectTeamCashSessions: () => true, escapeStockHtml: value => value,
    supabaseClient: { from(table) { return { select() { return this; }, eq() { return this; }, order() { return this; },
      then(resolve) { resolve({ data: records[table] }); } }; } }
  });
  vm.runInContext(vendorFunction('loadPosRegisters'), sandbox);
  const registers = await sandbox.loadPosRegisters();
  assert.equal(registers.length, 1);
  assert.equal(select.value, 'main');
  assert.doesNotMatch(select.innerHTML, /private|Privada/);
});

test('real summary aborts before reading sessions if no valid local register is selected', async () => {
  const sandbox = vm.createContext({
    console, canonicalCashView: null,
    ensureVendorOperationalSession: async () => ({ tenantId: 'tenant', isVerified: true }),
    loadPosRegisters: async () => [{ id: 'main' }], loadCanonicalCashClosureHistory: async () => [],
    document: { getElementById: () => ({ value: 'private' }) },
    supabaseClient: { from() { assert.fail('An arbitrary cash session must never be queried'); } },
    getEmptyCashData: () => ({}), renderCashSectionUI() {}
  });
  vm.runInContext(vendorFunction('refreshCanonicalCashSection'), sandbox);
  const result = await sandbox.refreshCanonicalCashSection();
  assert.equal(result.noSession, true);
  assert.equal(result.closed, true);
});
