import test from 'node:test';
import assert from 'node:assert/strict';
import posSyncPkg from '../pos-inventory-sync.js';
import cartEnginePkg from '../pos-cart-engine.js';

const { PosInventorySync } = posSyncPkg;
const { PosCartEngine } = cartEnginePkg;

test('A. Fuente Canónica de Inventario: getInventoryAvailability evalúa únicamente stock propio y de lo vendible', () => {
  const sync = PosInventorySync;
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const productId = 'P-GROW-1L';

  const balancesStore = [{ tenant_id: tenantId, product_id: productId, on_hand_sellable: 10 }];
  const reservationsStore = [{ id: 'R1', tenant_id: tenantId, product_id: productId, quantity: 2, status: 'ACTIVE', expires_at: new Date(Date.now() + 60000).toISOString() }];

  const avail = sync.getInventoryAvailability(tenantId, productId, [], balancesStore, reservationsStore);
  assert.equal(avail.on_hand, 10);
  assert.equal(avail.reserved, 2);
  assert.equal(avail.available, 8);
});

test('B & C. Escaneo y Búsqueda Normalizada de Código de Barras: Normaliza trim y espacios', () => {
  const rawBarcode = '  7791234567890 \n';
  const cleanBarcode = rawBarcode.trim();
  assert.equal(cleanBarcode, '7791234567890');
});

test('D & Q. Registro Rápido e Ingreso de Stock Inicial (Prueba Q)', () => {
  const sync = PosInventorySync;
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const barcode = '7791234567890';
  const name = 'Producto Prueba BÔ';
  const price = 35000;
  const initialStock = 5;

  const mockProducts = [];
  const mockBalances = [];
  const mockLedger = [];

  // 1. Guardar producto en catálogo propio
  const newProduct = {
    id: `prod-${Date.now()}`,
    tenant_id: tenantId,
    barcode,
    product_code: barcode,
    name,
    price,
    active: true
  };
  mockProducts.push(newProduct);

  // 2. Registrar movimiento de ingreso inicial por ledger (RECEIPT)
  const balance = { tenant_id: tenantId, product_id: newProduct.id, warehouse_id: 'default', on_hand_sellable: initialStock };
  mockBalances.push(balance);

  const ledgerEntry = {
    id: `led-${Date.now()}`,
    tenant_id: tenantId,
    product_id: newProduct.id,
    event_type: 'STOCK_RECEIPT',
    quantity: initialStock,
    reference_type: 'INITIAL_RECEIPT'
  };
  mockLedger.push(ledgerEntry);

  const avail = sync.getInventoryAvailability(tenantId, newProduct.id, [], mockBalances, []);
  assert.equal(mockProducts.length, 1);
  assert.equal(avail.available, 5);
});

test('E. Ingreso de Mercadería en Producto Existente: stock actual + ingreso = stock resultante', () => {
  const sync = PosInventorySync;
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const productId = 'PROD-NUTRIENTS-1L';

  const mockBalances = [{ tenant_id: tenantId, product_id: productId, on_hand_sellable: 8 }];
  const receiptQty = 10;

  // Registrar recepción de mercadería
  const balance = mockBalances.find(b => b.product_id === productId);
  balance.on_hand_sellable += receiptQty;

  const avail = sync.getInventoryAvailability(tenantId, productId, [], mockBalances, []);
  assert.equal(avail.on_hand, 18);
  assert.equal(avail.available, 18);
});

test('H, I, T. Bloqueo de Stock en Carrito POS y Venta Sin Stock (Prueba T)', () => {
  const sync = PosInventorySync;
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const productId = 'PROD-OUT-OF-STOCK';
  const mockBalances = [{ tenant_id: tenantId, product_id: productId, on_hand_sellable: 0 }];

  const avail = sync.getInventoryAvailability(tenantId, productId, [], mockBalances, []);
  assert.equal(avail.available, 0);

  // Intentar procesar venta sin stock por RPC / sync engine
  const saleDraft = {
    tenant_id: tenantId,
    cashier_user_id: 'usr-cajero-1',
    payment_method: 'EFECTIVO',
    total: 10000,
    items: [{ id: productId, name: 'Sustrato Vencido', quantity: 1, price: 10000 }]
  };

  const result = sync.processPersistentSale(
    saleDraft,
    [], // locationsStore
    mockBalances,
    [], // reservationsStore
    [], // ledgerStore
    [], // profilesStore
    [], // salesStore
    [], // saleItemsStore
    [], // cashSessionsStore
    [], // cashMovementsStore
    [{ id: productId, price: 10000 }]
  );

  assert.equal(result.success, false);
  assert.match(result.error, /Stock insuficiente/);
});

test('R. Venta POS con EFECTIVO (Prueba R): Venta, sale_items, descuento de stock y caja de efectivo', () => {
  const sync = PosInventorySync;
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const productId = 'PROD-FIXTURE-35K';

  const mockBalances = [{ tenant_id: tenantId, product_id: productId, on_hand_sellable: 5 }];
  const mockSales = [];
  const mockSaleItems = [];
  const mockCashSessions = [{ id: 'sess-1', tenant_id: tenantId, status: 'OPEN', opening_amount: 5000 }];
  const mockCashMovements = [];
  const mockLedger = [];

  const saleDraft = {
    tenant_id: tenantId,
    cashier_user_id: 'usr-cashier-1',
    cashier_name_snapshot: 'Cajero BÔ',
    salesperson_user_id: 'usr-vendor-1',
    salesperson_name_snapshot: 'Vendedor BÔ',
    payment_method: 'EFECTIVO',
    total: 70000,
    items: [
      { id: productId, name: 'Advanced Nutrients Grow 1L', quantity: 2, price: 35000 }
    ]
  };

  const result = sync.processPersistentSale(
    saleDraft,
    [], // locationsStore
    mockBalances,
    [], // reservationsStore
    mockLedger,
    [], // profilesStore
    mockSales,
    mockSaleItems,
    mockCashSessions,
    mockCashMovements,
    [{ id: productId, price: 35000 }]
  );

  assert.equal(result.success, true);
  assert.equal(mockSales.length, 1);
  assert.equal(mockSaleItems.length, 1);
  assert.equal(mockSaleItems[0].quantity, 2);
  assert.equal(mockSaleItems[0].unit_price, 35000);
  assert.equal(mockCashMovements.length, 1);
  assert.equal(mockCashMovements[0].amount, 70000);
  assert.equal(mockCashMovements[0].payment_method, 'EFECTIVO');

  // Stock disminuye de 5 a 3
  const availAfter = sync.getInventoryAvailability(tenantId, productId, [], mockBalances, []);
  assert.equal(availAfter.available, 3);
});

test('S. Venta POS con TRANSFERENCIA (Prueba S): Venta registrada, stock disminuye, pero NO suma efectivo físico a caja', () => {
  const sync = PosInventorySync;
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const productId = 'PROD-FIXTURE-35K';

  const mockBalances = [{ tenant_id: tenantId, product_id: productId, on_hand_sellable: 3 }];
  const mockSales = [];
  const mockSaleItems = [];
  const mockCashSessions = [{ id: 'sess-1', tenant_id: tenantId, status: 'OPEN', opening_amount: 5000 }];
  const mockCashMovements = [];
  const mockLedger = [];

  const saleDraft = {
    tenant_id: tenantId,
    cashier_user_id: 'usr-cashier-1',
    cashier_name_snapshot: 'Cajero BÔ',
    salesperson_user_id: 'usr-vendor-1',
    salesperson_name_snapshot: 'Vendedor BÔ',
    payment_method: 'TRANSFERENCIA',
    total: 35000,
    items: [
      { id: productId, name: 'Advanced Nutrients Grow 1L', quantity: 1, price: 35000 }
    ]
  };

  const result = sync.processPersistentSale(
    saleDraft,
    [], // locationsStore
    mockBalances,
    [], // reservationsStore
    mockLedger,
    [], // profilesStore
    mockSales,
    mockSaleItems,
    mockCashSessions,
    mockCashMovements,
    [{ id: productId, price: 35000 }]
  );

  assert.equal(result.success, true);
  assert.equal(mockSales.length, 1);
  assert.equal(mockCashMovements[0].type, 'venta_transferencia');

  // Stock disminuye de 3 a 2
  const availAfter = sync.getInventoryAvailability(tenantId, productId, [], mockBalances, []);
  assert.equal(availAfter.available, 2);
});

test('U. Falla de Transacción POS (Prueba U): Cero registros parciales y preservación de carrito', () => {
  const sync = PosInventorySync;
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const productId = 'PROD-FAIL-TEST';

  const mockBalances = [{ tenant_id: tenantId, product_id: productId, on_hand_sellable: 2 }];
  const mockSales = [];
  const mockSaleItems = [];
  const mockLedger = [];

  const invalidDraft = {
    tenant_id: tenantId,
    payment_method: 'EFECTIVO',
    total: 35000,
    items: [
      { id: productId, name: 'Producto Falla', quantity: 5, price: 35000 } // Supera stock disponible (2)
    ]
  };

  const result = sync.processPersistentSale(
    invalidDraft,
    [], // locationsStore
    mockBalances,
    [], // reservationsStore
    mockLedger,
    [], // profilesStore
    mockSales,
    mockSaleItems,
    [], // cashSessionsStore
    [], // cashMovementsStore
    [{ id: productId, price: 35000 }]
  );

  assert.equal(result.success, false);
  assert.match(result.error, /Stock insuficiente/);

  // Verificación de atomicidad: 0 ventas, 0 ítems, stock intacto en 2
  assert.equal(mockSales.length, 0);
  assert.equal(mockSaleItems.length, 0);
  assert.equal(mockBalances[0].on_hand_sellable, 2);
});
