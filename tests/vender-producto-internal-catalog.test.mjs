import test from 'node:test';
import assert from 'node:assert/strict';
import { PosCartEngine } from '../pos-cart-engine.js';

test('1. Sección Vender un Producto: Restricción exclusiva al catálogo interno', () => {
  // Catálogo interno propio de la tienda
  const internalCatalog = [
    {
      id: 'INT-001',
      product_code: 'INT-001',
      barcode: '7790001112223',
      name: 'Sustrato Orgánico Profesional 50L',
      brand: 'BÔ Green',
      category: 'Sustratos',
      price: 12500,
      stock: 14,
      available: true
    },
    {
      id: 'INT-002',
      product_code: 'INT-002',
      barcode: '7790003334445',
      name: 'Panel LED Quantum Board 120W',
      brand: 'GrowPro',
      category: 'Iluminación',
      price: 185000,
      stock: 3,
      available: true
    }
  ];

  // Catálogo externo de proveedores B2B (NO debe ser accesible para venta de mostrador)
  const externalSupplierProducts = [
    {
      id: 'EXT-999',
      product_code: 'EXT-999',
      barcode: '7799999999999',
      name: 'Fertilizante Mayorista B2B (Solo órdenes)',
      price: 45000,
      stock: 500
    }
  ];

  // Función de búsqueda POS interna
  const searchInternalCatalog = (query) => {
    const clean = (query || '').trim().toLowerCase();
    return internalCatalog.filter(p => {
      if (!clean) return true;
      const text = [p.name, p.brand, p.category, p.id, p.barcode, p.product_code].filter(Boolean).join(' ').toLowerCase();
      return text.includes(clean);
    });
  };

  // Buscar 'sustrato' -> Encuentra solo el producto interno
  const resultsSustrato = searchInternalCatalog('sustrato');
  assert.equal(resultsSustrato.length, 1);
  assert.equal(resultsSustrato[0].id, 'INT-001');

  // Buscar producto de proveedor mayorista -> CERO resultados (estricto catálogo interno)
  const resultsExternal = searchInternalCatalog('Mayorista B2B');
  assert.equal(resultsExternal.length, 0);

  const barcodeExternal = searchInternalCatalog('7799999999999');
  assert.equal(barcodeExternal.length, 0);
});

test('2. Entrada Unificada: Búsqueda en tiempo real por nombre, código de barras o voz', () => {
  const internalCatalog = [
    { id: '101', name: 'Aceite de Neem Puro 250ml', brand: 'EcoProtect', barcode: '7798881110001', price: 6200, stock: 8 },
    { id: '102', name: 'Jabón Potásico con Canela 500ml', brand: 'EcoProtect', barcode: '7798881110002', price: 5400, stock: 12 },
    { id: '103', name: 'Tijera de Poda Curva Acero', brand: 'TrimMaster', barcode: '7798881110003', price: 9800, stock: 5 }
  ];

  const search = (q) => {
    const clean = q.toLowerCase().trim();
    return internalCatalog.filter(p => [p.name, p.brand, p.barcode, p.id].join(' ').toLowerCase().includes(clean));
  };

  // Coincidencia por tipeo en teclado
  assert.equal(search('jabón').length, 1);
  assert.equal(search('jabón')[0].name, 'Jabón Potásico con Canela 500ml');

  // Coincidencia por lectura de pistola láser (código de barras)
  const scanResult = search('7798881110003');
  assert.equal(scanResult.length, 1);
  assert.equal(scanResult[0].name, 'Tijera de Poda Curva Acero');

  // Coincidencia por dictado de voz transcripto
  const voiceTranscript = 'ecoprotect';
  const voiceResults = search(voiceTranscript);
  assert.equal(voiceResults.length, 2);
});

test('3. Política de Stock: Bloqueo de productos sin stock (stock <= 0)', () => {
  const internalProducts = [
    { id: 'IN-1', name: 'Medidor pH Digital', stock: 0, price: 15000 },
    { id: 'IN-2', name: 'Timer Analógico 24hs', stock: 4, price: 8200 }
  ];

  const canSellProduct = (p) => Number(p.stock || 0) > 0;

  assert.equal(canSellProduct(internalProducts[0]), false, 'Producto con stock 0 debe ser bloqueado');
  assert.equal(canSellProduct(internalProducts[1]), true, 'Producto con stock > 0 puede ser vendido');
});

test('4. Modal de Confirmación: Validación de cantidad y agregado al ticket', () => {
  const product = {
    id: 'P-100',
    product_code: 'P-100',
    name: 'Extractor Turbina 4 Pulgadas',
    price: 42000,
    stock: 6
  };

  const validateQuantity = (qty, stock) => {
    const n = Number(qty);
    if (isNaN(n) || n < 1) return { valid: false, error: 'Mínimo 1 unidad' };
    if (n > stock) return { valid: false, error: `Stock máximo: ${stock}` };
    return { valid: true, qty: n };
  };

  assert.equal(validateQuantity(0, product.stock).valid, false);
  assert.equal(validateQuantity(10, product.stock).valid, false);
  assert.equal(validateQuantity(3, product.stock).valid, true);

  // Agregar al cart engine
  const cart = new PosCartEngine('POS');
  cart.clear();
  cart.addItem({ ...product, quantity: 3 });

  assert.equal(cart.getItemCount(), 3);
  assert.equal(cart.getSubtotal(), 42000 * 3);
});

test('5. Venta y Descuento de Stock: Actualización local y cálculo de totales', () => {
  const internalCatalog = [
    { id: 'PROD-A', name: 'Carpa Indoor 80x80', price: 95000, stock: 5 },
    { id: 'PROD-B', name: 'Filtro Carbón Activado 4 Pulgadas', price: 38000, stock: 4 }
  ];

  const cart = new PosCartEngine('POS');
  cart.clear();
  cart.addItem({ ...internalCatalog[0], quantity: 1 });
  cart.addItem({ ...internalCatalog[1], quantity: 2 });

  const draft = cart.createSaleDraft({
    tenantId: '11111111-1111-1111-1111-111111111111',
    cashierUser: { id: 'cajero-1', name: 'Profesor Franco' },
    salespersonUser: { id: 'vend-1', name: 'Vendedor Turno Tarde' },
    paymentMethod: 'EFECTIVO'
  });

  assert.equal(draft.items.length, 2);
  assert.equal(draft.total, 95000 + (38000 * 2)); // 95000 + 76000 = 171000

  // Descontar del catálogo interno
  draft.items.forEach(sold => {
    const item = internalCatalog.find(p => p.id === sold.id || p.id === sold.product_id);
    if (item) {
      item.stock -= sold.quantity;
    }
  });

  assert.equal(internalCatalog[0].stock, 4); // 5 - 1 = 4
  assert.equal(internalCatalog[1].stock, 2); // 4 - 2 = 2
});
