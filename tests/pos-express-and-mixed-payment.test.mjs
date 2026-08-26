import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PosCartEngine } from '../pos-cart-engine.js';
import operationalPackage from '../operational-api.js';

const { buildPayments } = operationalPackage;

// Mock localStorage for Node test environment
class StorageMock {
  constructor() { this.store = {}; }
  getItem(key) { return this.store[key] || null; }
  setItem(key, value) { this.store[key] = String(value); }
  removeItem(key) { delete this.store[key]; }
  clear() { this.store = {}; }
}
global.localStorage = new StorageMock();
global.sessionStorage = new StorageMock();

test('1. POS Cart Engine: acepta ítems de venta rápida/libre bajo contrato QUICK_ENTRY', () => {
  const cart = new PosCartEngine('POS');
  cart.clear();

  const ok = cart.addItem({
    id: 'EXPRESS-01',
    product_code: 'EXPRESS-01',
    name: 'Sustrato Klasmann 50L recién recibido',
    price: 18500,
    quantity: 2,
    availability: 'EXPRESS_UNMAPPED',
    is_express: true
  });

  assert.equal(ok, true);
  assert.equal(cart.getItemCount(), 2);
  assert.equal(cart.calculateTotal(), 37000);

  const draft = cart.createSaleDraft({
    tenantId: '11111111-1111-1111-1111-111111111111',
    cashierUser: { id: 'usr-1', name: 'Franco Cajero' },
    salespersonUser: { id: 'usr-2', name: 'Raul Vendedor' },
    paymentMethod: 'EFECTIVO'
  });

  assert.equal(draft.items.length, 1);
  assert.equal(draft.items[0].line_type, 'QUICK_ENTRY');
  assert.equal(draft.items[0].product_id, null);
  assert.equal(draft.items[0].unit_price, 18500);
});

test('2. La UI operativa no invoca el simulador local para confirmar ventas', () => {
  const vendorSource = fs.readFileSync(new URL('../vendedor.js', import.meta.url), 'utf8');
  assert.doesNotMatch(vendorSource, /PosInventorySync\.processPersistentSale\s*\(/);
  assert.match(vendorSource, /OperationalApi\.checkoutSale\s*\(/);
});

test('3. Pago Mixto (MIXTO): se divide exactamente antes del checkout autoritativo', () => {
  const draft = {
    payment_method: 'MIXTO',
    payment_breakdown: {
      cash_amount: 6000,
      secondary_method: 'TRANSFERENCIA',
      secondary_amount: 14000
    },
    total: 20000
  };
  assert.deepEqual(buildPayments(draft), [
    { method: 'CASH', amount: 6000, metadata: {} },
    { method: 'BANK_TRANSFER', amount: 14000, metadata: {} }
  ]);
});

test('4. Arqueo: sólo la asignación CASH integra el efectivo esperado', () => {
  const allocations = buildPayments({
    payment_method: 'MIXTO',
    payment_breakdown: { cash_amount: 5000, secondary_method: 'TRANSFERENCIA', secondary_amount: 15000 },
    total: 20000
  });
  const expectedCash = 10000
    + allocations.filter(payment => payment.method === 'CASH').reduce((sum, payment) => sum + payment.amount, 0)
    - 2000;
  assert.equal(expectedCash, 13000);
});

test('5. Un carrito POS admite tickets mixtos de inventario propio con ítem rápido sin tocar stock falso', () => {
  const cart = new PosCartEngine('POS');
  cart.clear();
  assert.equal(cart.addItem({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Timer Digital Zurich',
    price: 12000,
    quantity: 2,
    stock: 5,
    availability: 'EN_STOCK'
  }), true);
  assert.equal(cart.addItem({
    id: 'EXPRESS-SUST-80L',
    name: 'Sustrato Growmix 80L',
    price: 25000,
    quantity: 1,
    is_express: true,
    availability: 'EXPRESS_UNMAPPED'
  }), true);
  assert.equal(cart.getItemCount(), 3);
  assert.equal(cart.getTotal(), 49000);
  const items = cart.getItems();
  assert.equal(items[0].line_type, 'OWN_STOCK');
  assert.equal(items[1].line_type, 'QUICK_ENTRY');
});
