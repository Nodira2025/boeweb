import test from 'node:test';
import assert from 'node:assert/strict';
import { PosInventorySync } from '../pos-inventory-sync.js';
import { PosCartEngine } from '../pos-cart-engine.js';

test('1. Venta POS sin WMS: Crea Venta, Ítems, Movimiento de Caja y Descuenta Inventario', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const balancesStore = [{ tenant_id: tenantId, product_id: 'FER-01', warehouse_id: 'default', on_hand_sellable: 10 }];
  const locationsStore = [];
  const reservationsStore = [];
  const ledgerStore = [];
  const profilesStore = [{ tenant_id: tenantId, wms_enabled: false }];
  const salesStore = [];
  const saleItemsStore = [];
  const cashSessionsStore = [];
  const cashMovementsStore = [];

  const cart = new PosCartEngine('POS');
  cart.clear();
  cart.addItem({ id: 'FER-01', name: 'Amoladora Bosch', price: 25000, quantity: 2, availability: 'EN_STOCK' });

  const draft = cart.createSaleDraft({
    tenantId,
    cashierUser: { id: 'usr-franco', name: 'Profesor Franco' },
    salespersonUser: { id: 'usr-lautaro', name: 'Lautaro (Vendedor)' },
    paymentMethod: 'EFECTIVO',
    idempotency_key: 'key-sale-01'
  });

  const result = PosInventorySync.processPersistentSale(
    draft, locationsStore, balancesStore, reservationsStore, ledgerStore, profilesStore, salesStore, saleItemsStore, cashSessionsStore, cashMovementsStore
  );

  assert.equal(result.success, true);
  assert.equal(salesStore.length, 1);
  assert.equal(salesStore[0].total, 50000);
  assert.equal(salesStore[0].cashier_name_snapshot, 'Profesor Franco');
  assert.equal(salesStore[0].salesperson_name_snapshot, 'Lautaro (Vendedor)');
  assert.equal(saleItemsStore.length, 1);
  assert.equal(saleItemsStore[0].quantity, 2);

  // Verificar descuento de saldo
  assert.equal(balancesStore[0].on_hand_sellable, 8);

  // Verificar movimiento de caja
  assert.equal(cashMovementsStore.length, 1);
  assert.equal(cashMovementsStore[0].type, 'venta_efectivo');
  assert.equal(cashMovementsStore[0].amount, 50000);
  assert.equal(cashMovementsStore[0].reference_id, salesStore[0].id);

  // Verificar ledger
  assert.equal(ledgerStore.length, 1);
  assert.equal(ledgerStore[0].event_type, 'SALE_POS_DIRECT');
  assert.equal(ledgerStore[0].quantity, 2);
});

test('2. Venta POS con WMS: Descuenta Módulos Físicos Específicos y Registra Allocations', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const locationsStore = [
    { id: 'loc-01', tenant_id: tenantId, product_id: 'MAC-10L', module_code: 'M01', human_level: 1, sector_position: 'A', disposition: 'SELLABLE', quantity: 3 },
    { id: 'loc-02', tenant_id: tenantId, product_id: 'MAC-10L', module_code: 'M07', human_level: 2, sector_position: 'B', disposition: 'SELLABLE', quantity: 5 }
  ];
  const balancesStore = [];
  const reservationsStore = [];
  const ledgerStore = [];
  const profilesStore = [{ tenant_id: tenantId, wms_enabled: true }];
  const salesStore = [];
  const saleItemsStore = [];
  const cashSessionsStore = [];
  const cashMovementsStore = [];

  const draft = {
    tenant_id: tenantId,
    cashier_user_id: 'usr-franco',
    cashier_name_snapshot: 'Profesor Franco',
    salesperson_user_id: 'usr-lautaro',
    salesperson_name_snapshot: 'Lautaro',
    payment_method: 'TRANSFERENCIA',
    idempotency_key: 'wms-sale-key-01',
    items: [{ id: 'MAC-10L', product_id: 'MAC-10L', name: 'Maceta 10L', price: 4000, quantity: 6, availability: 'EN_STOCK' }],
    total: 24000
  };

  const result = PosInventorySync.processPersistentSale(
    draft, locationsStore, balancesStore, reservationsStore, ledgerStore, profilesStore, salesStore, saleItemsStore, cashSessionsStore, cashMovementsStore
  );

  assert.equal(result.success, true);
  assert.equal(result.wms_allocations.length, 2);
  const totalWmsQty = locationsStore.reduce((acc, loc) => acc + loc.quantity, 0);
  assert.equal(totalWmsQty, 2); // De 8 unidades iniciales en M01 (3u) y M07 (5u), al vender 6u restan 2u exactas

  assert.equal(cashMovementsStore[0].type, 'venta_transferencia');
  assert.equal(cashMovementsStore[0].amount, 24000);
});

test('3. Idempotencia Doble Clic: Misma idempotency_key no duplica Venta ni Caja ni Stock', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const balancesStore = [{ tenant_id: tenantId, product_id: 'FER-01', warehouse_id: 'default', on_hand_sellable: 10 }];
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
    cashier_user_id: 'usr-franco',
    cashier_name_snapshot: 'Profesor Franco',
    salesperson_user_id: 'usr-lautaro',
    salesperson_name_snapshot: 'Lautaro',
    payment_method: 'EFECTIVO',
    idempotency_key: 'double-click-key-99',
    items: [{ id: 'FER-01', product_id: 'FER-01', name: 'Amoladora', price: 25000, quantity: 3, availability: 'EN_STOCK' }],
    total: 75000
  };

  const res1 = PosInventorySync.processPersistentSale(draft, locationsStore, balancesStore, reservationsStore, ledgerStore, profilesStore, salesStore, saleItemsStore, cashSessionsStore, cashMovementsStore);
  const res2 = PosInventorySync.processPersistentSale(draft, locationsStore, balancesStore, reservationsStore, ledgerStore, profilesStore, salesStore, saleItemsStore, cashSessionsStore, cashMovementsStore);

  assert.equal(res1.success, true);
  assert.equal(res2.idempotent, true);

  assert.equal(salesStore.length, 1);
  assert.equal(saleItemsStore.length, 1);
  assert.equal(cashMovementsStore.length, 1);
  assert.equal(balancesStore[0].on_hand_sellable, 7); // Descontó únicamente 3 unidades
});

test('4. Stock Insuficiente: Rechazo Limpio sin Crear Venta ni Movimientos', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const balancesStore = [{ tenant_id: tenantId, product_id: 'FER-01', warehouse_id: 'default', on_hand_sellable: 2 }];
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
    cashier_user_id: 'usr-franco',
    cashier_name_snapshot: 'Profesor Franco',
    salesperson_user_id: 'usr-lautaro',
    salesperson_name_snapshot: 'Lautaro',
    payment_method: 'EFECTIVO',
    idempotency_key: 'insufficient-stock-key',
    items: [{ id: 'FER-01', product_id: 'FER-01', name: 'Amoladora', price: 25000, quantity: 5, availability: 'EN_STOCK' }],
    total: 125000
  };

  const res = PosInventorySync.processPersistentSale(draft, locationsStore, balancesStore, reservationsStore, ledgerStore, profilesStore, salesStore, saleItemsStore, cashSessionsStore, cashMovementsStore);

  assert.equal(res.success, false);
  assert.ok(res.error.includes('Stock insuficiente'));

  assert.equal(salesStore.length, 0);
  assert.equal(cashMovementsStore.length, 0);
  assert.equal(balancesStore[0].on_hand_sellable, 2); // Quedó inalterado
});

test('5. Caja & Arqueo DB: Apertura, Ventas, Gastos y Arqueo Cierre con Diferencia Zero', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const cashSessionsStore = [];
  const cashMovementsStore = [];

  // 1. Abrir sesión con $10.000 iniciales
  const sessionRes = PosInventorySync.openCashSession({ tenant_id: tenantId, register_id: 'MAIN_REGISTER', opened_by: 'Profesor Franco', opening_amount: 10000 }, cashSessionsStore);
  const sessionId = sessionRes.session.id;

  // 2. Registrar movimientos
  cashMovementsStore.push({ session_id: sessionId, tenant_id: tenantId, type: 'venta_efectivo', amount: 35000, created_by: 'Lautaro' });
  cashMovementsStore.push({ session_id: sessionId, tenant_id: tenantId, type: 'venta_transferencia', amount: 20000, created_by: 'Lautaro' });
  cashMovementsStore.push({ session_id: sessionId, tenant_id: tenantId, type: 'gasto', amount: 5000, created_by: 'Profesor Franco' });

  // 3. Resumen autorritativo
  const summary = PosInventorySync.getCashSessionSummary(sessionId, tenantId, cashSessionsStore, cashMovementsStore);

  // Efectivo esperado: 10.000 (inicio) + 35.000 (venta ef) - 5.000 (gasto) = 40.000
  assert.equal(summary.opening_amount, 10000);
  assert.equal(summary.sales_cash, 35000);
  assert.equal(summary.sales_transfer, 20000);
  assert.equal(summary.expenses, 5000);
  assert.equal(summary.expected_cash, 40000);

  // 4. Cierre de caja con $40.000 contados (Diferencia $0,00)
  const closeRes = PosInventorySync.closeCashSession({ session_id: sessionId, tenant_id: tenantId, closed_by: 'Profesor Franco', closing_counted: 40000 }, cashSessionsStore, cashMovementsStore);

  assert.equal(closeRes.success, true);
  assert.equal(closeRes.difference, 0);
  assert.equal(closeRes.balanced, true);
  assert.equal(closeRes.session.status, 'CLOSED');
});

test('6. Multi-Tenant Isolation en Ventas y Caja DB', () => {
  const tenantA = '11111111-1111-1111-1111-111111111111';
  const tenantB = '22222222-2222-2222-2222-222222222222';
  const cashSessionsStore = [];
  const cashMovementsStore = [];

  PosInventorySync.openCashSession({ tenant_id: tenantA, register_id: 'MAIN', opened_by: 'Profesor Franco', opening_amount: 5000 }, cashSessionsStore);
  PosInventorySync.openCashSession({ tenant_id: tenantB, register_id: 'MAIN', opened_by: 'Admin B', opening_amount: 12000 }, cashSessionsStore);

  cashMovementsStore.push({ session_id: 'sA', tenant_id: tenantA, type: 'venta_efectivo', amount: 8000, created_by: 'Vendedor A' });
  cashMovementsStore.push({ session_id: 'sB', tenant_id: tenantB, type: 'venta_efectivo', amount: 50000, created_by: 'Vendedor B' });

  const summaryA = PosInventorySync.getCashSessionSummary(null, tenantA, cashSessionsStore, cashMovementsStore);
  const summaryB = PosInventorySync.getCashSessionSummary(null, tenantB, cashSessionsStore, cashMovementsStore);

  assert.equal(summaryA.sales_cash, 8000);
  assert.equal(summaryB.sales_cash, 50000);
});

test('7. Producto A PEDIDO: No Altera Inventario Propio ni WMS', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const balancesStore = [{ tenant_id: tenantId, product_id: 'SKU-PROPIO', warehouse_id: 'default', on_hand_sellable: 10 }];
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
    cashier_user_id: 'usr-franco',
    cashier_name_snapshot: 'Profesor Franco',
    salesperson_user_id: 'usr-lautaro',
    salesperson_name_snapshot: 'Lautaro',
    payment_method: 'TRANSFERENCIA',
    idempotency_key: 'b2b-only-sale-key',
    items: [{ id: 'B2B-VAPO', product_id: 'B2B-VAPO', name: 'Vaporizador Mighty+', price: 450000, quantity: 1, availability: 'A_PEDIDO' }],
    total: 450000
  };

  const result = PosInventorySync.processPersistentSale(draft, locationsStore, balancesStore, reservationsStore, ledgerStore, profilesStore, salesStore, saleItemsStore, cashSessionsStore, cashMovementsStore);

  assert.equal(result.success, true);
  assert.equal(salesStore.length, 1);
  assert.equal(saleItemsStore[0].fulfillment_type, 'B2B_BACKORDER');

  // Verificar que el inventario propio permaneció intacto
  assert.equal(balancesStore[0].on_hand_sellable, 10);
  assert.equal(ledgerStore.length, 0); // No generó evento SALE_POS_DIRECT en inventario propio
});
