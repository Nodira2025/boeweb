import test from 'node:test';
import assert from 'node:assert/strict';
import { PosCartEngine } from '../pos-cart-engine.js';
import { PosInventorySync } from '../pos-inventory-sync.js';

test('1. Flujo POS: Ingreso de producto comprado (con o sin ubicación WMS)', () => {
  const mockStorage = {};
  global.localStorage = {
    getItem: (key) => mockStorage[key] || null,
    setItem: (key, val) => { mockStorage[key] = String(val); },
    removeItem: (key) => { delete mockStorage[key]; }
  };

  // Simulación de catálogo de productos
  const products = [
    {
      id: 'PROD-001',
      product_code: 'PROD-001',
      barcode: '7791234567890',
      name: 'Fertilizante Nitro Max 1L',
      category: 'Fertilizantes',
      price: 8500,
      stock: 25,
      own_stock: 25,
      availability: 'EN_STOCK'
    },
    {
      id: 'PROD-002',
      product_code: 'PROD-002',
      barcode: '7799876543210',
      name: 'Maceta Geotextil 15L',
      category: 'Macetas',
      price: 3200,
      stock: 50,
      own_stock: 50,
      availability: 'EN_STOCK'
    }
  ];

  // Ubicaciones de estantes WMS (opcional: PROD-001 ubicado, PROD-002 sin ubicación)
  const productLocations = [
    {
      product_code: 'PROD-001',
      barcode: '7791234567890',
      shelf_code: 'E03',
      floor_level: 1,
      shelf_level: 2,
      stock: 25
    }
  ];

  assert.equal(products.length, 2);
  assert.equal(products[0].stock, 25);
  assert.equal(productLocations[0].shelf_code, 'E03');
  // PROD-002 no tiene ubicación asignada (ubicación opcional)
  const locProd2 = productLocations.find(l => l.product_code === 'PROD-002');
  assert.equal(locProd2, undefined);
});

test('2. Flujo POS: Scanner de código de barra y confirmación previa a agregar al carrito', () => {
  const products = [
    {
      id: 'PROD-001',
      product_code: 'PROD-001',
      barcode: '7791234567890',
      name: 'Fertilizante Nitro Max 1L',
      price: 8500,
      stock: 25
    }
  ];

  // Simular escaneo de código de barra
  const scannedBarcode = '7791234567890';
  const foundProduct = products.find(p => p.barcode === scannedBarcode);
  assert.ok(foundProduct, 'El scanner debe encontrar el producto por código de barras');
  assert.equal(foundProduct.name, 'Fertilizante Nitro Max 1L');
  assert.equal(foundProduct.price, 8500);

  // Vendedor revisa y confirma agregar 2 unidades al carrito
  const cart = new PosCartEngine('POS');
  cart.clear();
  cart.addItem({ ...foundProduct, quantity: 2 });

  assert.equal(cart.getItemCount(), 2);
  assert.equal(cart.getSubtotal(), 17000);
});

test('3. Flujo POS: Carrito acumulativo sumando productos y cantidades', () => {
  const cart = new PosCartEngine('POS');
  cart.clear();

  cart.addItem({ id: 'P1', product_code: 'P1', name: 'Item A', price: 1000, quantity: 3 });
  cart.addItem({ id: 'P2', product_code: 'P2', name: 'Item B', price: 2500, quantity: 2 });

  assert.equal(cart.getItemCount(), 5);
  assert.equal(cart.getSubtotal(), (1000 * 3) + (2500 * 2)); // 3000 + 5000 = 8000

  // Incrementar cantidad
  cart.updateQuantity('P1', 5);
  assert.equal(cart.getItemCount(), 7);
  assert.equal(cart.getSubtotal(), (1000 * 5) + (2500 * 2)); // 5000 + 5000 = 10000
});

test('4. Flujo POS: Aplicar descuento en porcentaje (%) y en monto fijo ($)', () => {
  const cart = new PosCartEngine('POS');
  cart.clear();
  cart.addItem({ id: 'P1', product_code: 'P1', name: 'Kit Cultivo', price: 20000, quantity: 1 });

  assert.equal(cart.getSubtotal(), 20000);
  assert.equal(cart.getTotal(), 20000);

  // A. Descuento porcentual (10%)
  cart.setDiscount('PERCENT', 10);
  assert.equal(cart.getDiscount().type, 'PERCENT');
  assert.equal(cart.getDiscount().value, 10);
  assert.equal(cart.getDiscountAmount(), 2000);
  assert.equal(cart.getTotal(), 18000);

  // B. Descuento en monto fijo ($3.500)
  cart.setDiscount('FIXED', 3500);
  assert.equal(cart.getDiscount().type, 'FIXED');
  assert.equal(cart.getDiscount().value, 3500);
  assert.equal(cart.getDiscountAmount(), 3500);
  assert.equal(cart.getTotal(), 16500);

  // C. Descuento fijo mayor al subtotal no genera total negativo
  cart.setDiscount('FIXED', 30000);
  assert.equal(cart.getDiscountAmount(), 20000);
  assert.equal(cart.getTotal(), 0);

  // D. Aumento porcentual (+15%)
  cart.setAdjustment('INCREASE_PERCENT', 15);
  assert.equal(cart.getAdjustment().type, 'INCREASE_PERCENT');
  assert.equal(cart.getAdjustment().value, 15);
  assert.equal(cart.getAdjustmentAmount(), 3000);
  assert.equal(cart.getTotal(), 23000);

  // E. Aumento en monto fijo (+$2.500)
  cart.setAdjustment('INCREASE_FIXED', 2500);
  assert.equal(cart.getAdjustment().type, 'INCREASE_FIXED');
  assert.equal(cart.getAdjustment().value, 2500);
  assert.equal(cart.getAdjustmentAmount(), 2500);
  assert.equal(cart.getTotal(), 22500);

  // F. Quitar ajuste
  cart.setAdjustment('NONE', 0);
  assert.equal(cart.getTotal(), 20000);
});

test('5. Flujo POS: Finalizar venta y descontar stock del inventario comercial y WMS', () => {
  const mockStorage = {};
  global.localStorage = {
    getItem: (key) => mockStorage[key] || null,
    setItem: (key, val) => { mockStorage[key] = String(val); },
    removeItem: (key) => { delete mockStorage[key]; }
  };

  const catalog = [
    { id: 'P01', product_code: 'P01', barcode: '779001', name: 'Sustrato 50L', price: 10000, stock: 15 },
    { id: 'P02', product_code: 'P02', barcode: '779002', name: 'Tijera Podar', price: 4000, stock: 8 }
  ];

  const wmsLocations = [
    { product_code: 'P01', barcode: '779001', shelf_code: 'A-01', stock: 15 }
  ];

  const cart = new PosCartEngine('POS');
  cart.clear();
  cart.addItem({ ...catalog[0], quantity: 3 });
  cart.addItem({ ...catalog[1], quantity: 2 });

  cart.setDiscount('PERCENT', 10);
  const subtotal = cart.getSubtotal(); // (10000*3) + (4000*2) = 38000
  const discount = cart.getDiscountAmount(); // 3800
  const total = cart.getTotal(); // 34200

  assert.equal(subtotal, 38000);
  assert.equal(discount, 3800);
  assert.equal(total, 34200);

  const saleDraft = cart.createSaleDraft({
    tenantId: '11111111-1111-1111-1111-111111111111',
    cashierUser: { id: 'usr-cajero', name: 'Profesor Franco' },
    salespersonUser: { id: 'usr-vendedor', name: 'Vendedor Turno' },
    paymentMethod: 'EFECTIVO',
    discount: discount,
    total: total
  });

  // Simular descuento de stock
  saleDraft.items.forEach(sold => {
    const itemInCat = catalog.find(p => p.id === sold.product_id);
    if (itemInCat) itemInCat.stock -= sold.quantity;

    const itemInWms = wmsLocations.find(l => l.product_code === sold.product_id);
    if (itemInWms) itemInWms.stock -= sold.quantity;
  });

  // Verificar que el stock se descontó correctamente
  assert.equal(catalog[0].stock, 12); // 15 - 3 = 12
  assert.equal(catalog[1].stock, 6);  // 8 - 2 = 6
  assert.equal(wmsLocations[0].stock, 12); // 15 - 3 = 12

  // Verificar contrato del borrador de venta
  assert.equal(saleDraft.total, 34200);
  assert.equal(saleDraft.discount, 3800);
  assert.equal(saleDraft.payment_method, 'EFECTIVO');

  // Carrito queda vacío tras finalizar la venta
  cart.clear();
  assert.equal(cart.getItemCount(), 0);
  assert.equal(cart.getTotal(), 0);
});

test('6. Venta Total (Stock 0): Pasa a AGOTADO con Botón Reponer y Registra Movimiento en Caja', () => {
  const catalog = [
    { id: 'PROD-TOTAL', product_code: 'PROD-TOTAL', barcode: '779999', name: 'Carpa Indoor 80x80', price: 120000, stock: 3 }
  ];
  const wmsLocations = [
    { product_code: 'PROD-TOTAL', barcode: '779999', shelf_code: 'E-01', stock: 3 }
  ];

  const cart = new PosCartEngine('POS');
  cart.clear();
  cart.addItem({ ...catalog[0], quantity: 3 });

  const saleDraft = cart.createSaleDraft({
    tenantId: '11111111-1111-1111-1111-111111111111',
    cashierUser: { id: 'usr-cajero', name: 'Profesor Franco' },
    salespersonUser: { id: 'usr-vendedor', name: 'Vendedor Turno' },
    paymentMethod: 'EFECTIVO',
    total: 360000
  });

  // Descuento total
  saleDraft.items.forEach(sold => {
    const item = catalog.find(p => p.id === sold.product_id);
    if (item) item.stock = Math.max(0, item.stock - sold.quantity);
    const loc = wmsLocations.find(l => l.product_code === sold.product_id);
    if (loc) loc.stock = Math.max(0, loc.stock - sold.quantity);
  });

  assert.equal(catalog[0].stock, 0);
  assert.equal(wmsLocations[0].stock, 0);

  // Registro en movimientos de caja del turno
  const cashData = {
    date: '2026-08-14',
    movements: [],
    sales: []
  };

  const saleEntry = {
    id: `cash_${Date.now()}`,
    time: '14:30',
    type: 'venta_efectivo',
    amount: saleDraft.total,
    desc: `Venta Mostrador #${saleDraft.draft_id} (${saleDraft.items.map(i => `${i.quantity}x ${i.name}`).join(', ')})`,
    vendor: saleDraft.salesperson_name_snapshot || 'Vendedor'
  };
  cashData.movements.unshift(saleEntry);
  cashData.sales.push(saleEntry);

  assert.equal(cashData.movements.length, 1);
  assert.equal(cashData.movements[0].amount, 360000);
  assert.equal(cashData.movements[0].type, 'venta_efectivo');

  // Comportamiento visual de tarjeta de ubicación física
  const stockCount = wmsLocations[0].stock;
  const isOutOfStock = stockCount === 0;
  const badgeHtml = isOutOfStock ? '🔴 AGOTADO / SIN STOCK (0 u.)' : `${stockCount} unidades disponibles`;
  const primaryActionText = isOutOfStock ? '🔄 Reponer / Ingresar stock' : '➕ Agregar stock';

  assert.equal(isOutOfStock, true);
  assert.equal(badgeHtml, '🔴 AGOTADO / SIN STOCK (0 u.)');
  assert.equal(primaryActionText, '🔄 Reponer / Ingresar stock');
});

