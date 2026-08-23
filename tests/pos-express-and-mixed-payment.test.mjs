import test from 'node:test';
import assert from 'node:assert/strict';
import { PosCartEngine } from '../pos-cart-engine.js';
import { PosInventorySync } from '../pos-inventory-sync.js';

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

test('1. POS Cart Engine: Agregar ítem exprés fuera de catálogo preserva flags y availability', () => {
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
  assert.equal(draft.items[0].availability, 'EXPRESS_UNMAPPED');
  assert.equal(draft.items[0].is_express, true);
  assert.equal(draft.items[0].subtotal, 37000);
});

test('2. Venta POS con Ítem Exprés: No requiere stock previo y se registra con fulfillment_type EXPRESS_UNMAPPED', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';

  const locationsStore = [];
  const balancesStore = [];
  const reservationsStore = [];
  const ledgerStore = [];
  const salesStore = [];
  const saleItemsStore = [];
  const cashSessionsStore = [];
  const cashMovementsStore = [];

  const draft = {
    tenant_id: tenantId,
    cashier_user_id: 'usr-cajero',
    cashier_name_snapshot: 'Franco Cajero',
    salesperson_user_id: 'usr-vendedor',
    salesperson_name_snapshot: 'Raul Vendedor',
    payment_method: 'EFECTIVO',
    idempotency_key: 'test_sale_express_1',
    items: [
      {
        product_id: 'EXPRESS-999',
        name: 'Maceta Geotextil 15L (Recién bajada del camión)',
        price: 5000,
        quantity: 3,
        availability: 'EXPRESS_UNMAPPED',
        is_express: true
      }
    ],
    total: 15000
  };

  const res = PosInventorySync.processPersistentSale(
    draft, locationsStore, balancesStore, reservationsStore, ledgerStore, [],
    salesStore, saleItemsStore, cashSessionsStore, cashMovementsStore
  );

  assert.equal(res.success, true);
  assert.equal(salesStore.length, 1);
  assert.equal(salesStore[0].total, 15000);
  assert.equal(saleItemsStore.length, 1);
  assert.equal(saleItemsStore[0].fulfillment_type, 'EXPRESS_UNMAPPED');
  assert.equal(saleItemsStore[0].product_name_snapshot, 'Maceta Geotextil 15L (Recién bajada del camión)');

  // No debe generar entradas en ledger de inventario físico
  assert.equal(ledgerStore.length, 0);

  // Debe haber registrado el movimiento en caja
  assert.equal(cashMovementsStore.length, 1);
  assert.equal(cashMovementsStore[0].type, 'venta_efectivo');
  assert.equal(cashMovementsStore[0].amount, 15000);
});

test('3. Pago Mixto (MIXTO): Desglose exacto entre Efectivo y Transferencia Bancaria', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';

  const locationsStore = [];
  const balancesStore = [];
  const reservationsStore = [];
  const ledgerStore = [];
  const salesStore = [];
  const saleItemsStore = [];
  const cashSessionsStore = [];
  const cashMovementsStore = [];

  const draft = {
    tenant_id: tenantId,
    cashier_user_id: 'usr-cajero',
    cashier_name_snapshot: 'Franco Cajero',
    salesperson_user_id: 'usr-vendedor',
    salesperson_name_snapshot: 'Raul Vendedor',
    payment_method: 'MIXTO',
    payment_breakdown: {
      cash_amount: 6000,
      secondary_method: 'TRANSFERENCIA',
      secondary_amount: 14000
    },
    idempotency_key: 'test_sale_mixed_1',
    items: [
      {
        product_id: 'EXPRESS-ITEM-2',
        name: 'Fertilizante Orgánico Venta Libre',
        price: 20000,
        quantity: 1,
        availability: 'EXPRESS_UNMAPPED',
        is_express: true
      }
    ],
    total: 20000
  };

  const res = PosInventorySync.processPersistentSale(
    draft, locationsStore, balancesStore, reservationsStore, ledgerStore, [],
    salesStore, saleItemsStore, cashSessionsStore, cashMovementsStore
  );

  assert.equal(res.success, true);
  assert.equal(salesStore[0].payment_method, 'MIXTO');
  assert.deepEqual(salesStore[0].payment_breakdown, {
    cash_amount: 6000,
    secondary_method: 'TRANSFERENCIA',
    secondary_amount: 14000
  });

  // Deben haberse generado 2 movimientos de caja discriminados
  assert.equal(cashMovementsStore.length, 2);

  const cashMov = cashMovementsStore.find(m => m.type === 'venta_efectivo');
  assert.ok(cashMov);
  assert.equal(cashMov.amount, 6000);
  assert.equal(cashMov.payment_method, 'EFECTIVO');

  const transferMov = cashMovementsStore.find(m => m.type === 'venta_transferencia');
  assert.ok(transferMov);
  assert.equal(transferMov.amount, 14000);
  assert.equal(transferMov.payment_method, 'TRANSFERENCIA');
});

test('4. Arqueo y Control de Caja: expected_cash suma solo la porción en efectivo del Pago Mixto', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';

  const cashSessionsStore = [
    {
      id: 'sess-open-1',
      tenant_id: tenantId,
      register_id: 'MAIN_REGISTER',
      opening_amount: 10000,
      status: 'OPEN'
    }
  ];

  const cashMovementsStore = [
    // Venta Mixta: 5.000 Efectivo + 15.000 MercadoPago
    { session_id: 'sess-open-1', tenant_id: tenantId, type: 'venta_efectivo', amount: 5000, payment_method: 'EFECTIVO' },
    { session_id: 'sess-open-1', tenant_id: tenantId, type: 'venta_mercadopago', amount: 15000, payment_method: 'MERCADOPAGO' },
    // Gasto de caja
    { session_id: 'sess-open-1', tenant_id: tenantId, type: 'gasto', amount: 2000 }
  ];

  const summary = PosInventorySync.getCashSessionSummary('sess-open-1', tenantId, cashSessionsStore, cashMovementsStore);

  // Apertura (10.000) + Efectivo (5.000) - Gasto (2.000) = 13.000
  assert.equal(summary.opening_amount, 10000);
  assert.equal(summary.sales_cash, 5000);
  assert.equal(summary.sales_transfer, 15000);
  assert.equal(summary.expected_cash, 13000);
  assert.equal(summary.total_volume, 20000);

  // Cerrar caja con $13.000 contados debe dar arqueo perfectamente balanceado (diferencia 0)
  const closeRes = PosInventorySync.closeCashSession({
    session_id: 'sess-open-1',
    tenant_id: tenantId,
    closed_by: 'Franco Cajero',
    closing_counted: 13000
  }, cashSessionsStore, cashMovementsStore);

  assert.equal(closeRes.success, true);
  assert.equal(closeRes.difference, 0);
  assert.equal(closeRes.balanced, true);
});

test('5. Venta Híbrida: Carrito con producto de catálogo y producto exprés en una sola transacción', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';

  const balancesStore = [
    { tenant_id: tenantId, product_id: 'SKU-TIMERR', warehouse_id: 'default', on_hand_sellable: 5 }
  ];
  const locationsStore = [];
  const reservationsStore = [];
  const ledgerStore = [];
  const profilesStore = [{ tenant_id: tenantId, wms_enabled: false }];
  const salesStore = [];
  const saleItemsStore = [];
  const cashSessionsStore = [];
  const cashMovementsStore = [];

  const draft = {
    tenant_id: tenantId,
    cashier_user_id: 'usr-cajero',
    cashier_name_snapshot: 'Franco Cajero',
    salesperson_user_id: 'usr-vendedor',
    salesperson_name_snapshot: 'Raul Vendedor',
    payment_method: 'EFECTIVO',
    idempotency_key: 'test_sale_hybrid_1',
    items: [
      // 1 producto de catálogo
      { product_id: 'SKU-TIMERR', name: 'Timer Digital Zurich', price: 12000, quantity: 2, availability: 'EN_STOCK' },
      // 1 producto exprés recién bajado del camión
      { product_id: 'EXPRESS-SUST-80L', name: 'Sustrato Growmix 80L', price: 25000, quantity: 1, availability: 'EXPRESS_UNMAPPED', is_express: true }
    ],
    total: 49000
  };

  const res = PosInventorySync.processPersistentSale(
    draft, locationsStore, balancesStore, reservationsStore, ledgerStore, profilesStore,
    salesStore, saleItemsStore, cashSessionsStore, cashMovementsStore
  );

  assert.equal(res.success, true);
  assert.equal(salesStore[0].total, 49000);
  assert.equal(saleItemsStore.length, 2);

  // El SKU de catálogo debe haberse descontado (5 - 2 = 3) y generado ledger
  const timerBal = balancesStore.find(b => b.product_id === 'SKU-TIMERR');
  assert.equal(timerBal.on_hand_sellable, 3);
  assert.equal(ledgerStore.length, 1);
  assert.equal(ledgerStore[0].product_id, 'SKU-TIMERR');
  assert.equal(ledgerStore[0].quantity, 2);

  // El ítem exprés no debe figurar en balances ni ledger físico
  assert.equal(balancesStore.some(b => b.product_id === 'EXPRESS-SUST-80L'), false);
});
