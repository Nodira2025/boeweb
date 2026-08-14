import test from 'node:test';
import assert from 'node:assert/strict';
import { PosCartEngine } from '../pos-cart-engine.js';
import { SaasAuth } from '../saas-auth.js';

test('Flujo Completo Interactivo de Vendedor POS: Ingreso -> Ubicación -> Scanner -> Carrito -> Descuento -> Finalizar Venta -> Descuento de Stock', async () => {
  // 1. Simulación de LocalStorage
  const storage = {};
  global.localStorage = {
    getItem: (key) => storage[key] || null,
    setItem: (key, val) => { storage[key] = String(val); },
    removeItem: (key) => { delete storage[key]; },
    clear: () => { for (const k in storage) delete storage[k]; }
  };
  global.sessionStorage = {
    getItem: (key) => storage[key] || null,
    setItem: (key, val) => { storage[key] = String(val); },
    removeItem: (key) => { delete storage[key]; }
  };

  // 2. Simulación de entorno DOM para Vendedor Portal
  const domElements = {};
  function createMockElement(id, initialVal = '', initialText = '') {
    const el = {
      id,
      value: initialVal,
      textContent: initialText,
      innerText: initialText,
      innerHTML: '',
      style: {},
      dataset: {},
      options: [],
      selectedIndex: 0,
      hidden: false,
      listeners: {},
      addEventListener(event, fn) {
        this.listeners[event] = this.listeners[event] || [];
        this.listeners[event].push(fn);
      },
      dispatchEvent(event) {
        (this.listeners[event.type] || []).forEach(fn => fn(event));
      },
      focus() {},
      select() {}
    };
    domElements[id] = el;
    return el;
  }

  global.document = {
    getElementById: (id) => domElements[id] || null,
    createElement: (tag) => createMockElement(`dyn-${Math.random()}`),
    querySelectorAll: () => []
  };

  // Crear elementos requeridos por el POS y Modal
  createMockElement('pos-barcode-input');
  createMockElement('pos-product-search');
  createMockElement('pos-voice-status');
  createMockElement('pos-search-results-grid');
  createMockElement('pos-salesperson-select');
  createMockElement('pos-cashier-display', '', 'Profesor Franco');
  createMockElement('pos-cart-items-body');
  createMockElement('pos-cart-empty-state');
  createMockElement('pos-summary-subtotal', '', '$0,00');
  createMockElement('pos-summary-discount-row');
  createMockElement('pos-summary-discount-label', '', 'Descuento:');
  createMockElement('pos-summary-discount', '', '-$0,00');
  createMockElement('pos-summary-total', '', '$0,00');
  createMockElement('pos-discount-type', 'PERCENT');
  createMockElement('pos-discount-value', '0');
  createMockElement('pos-payment-method-select', 'EFECTIVO');
  createMockElement('pos-notes-input', 'Venta mostrador test');
  createMockElement('pos-create-draft-btn');

  // Modal de confirmación de escaneo
  createMockElement('pos-scan-confirm-modal');
  domElements['pos-scan-confirm-modal'].style.display = 'none';
  createMockElement('pos-scan-confirm-img');
  createMockElement('pos-scan-confirm-category');
  createMockElement('pos-scan-confirm-name');
  createMockElement('pos-scan-confirm-code');
  createMockElement('pos-scan-confirm-stock');
  createMockElement('pos-scan-confirm-location');
  createMockElement('pos-scan-confirm-price');
  createMockElement('pos-scan-confirm-qty', '1');

  // Almacenes de inventario y WMS
  const baseProducts = [
    {
      id: 'BO-PROD-9988',
      product_code: 'BO-PROD-9988',
      barcode: '7799988112233',
      name: 'Sustrato Light Mix 50L BÔ',
      category: 'Sustratos',
      price: 18500,
      stock: 15,
      own_stock: 15,
      availability: 'EN_STOCK',
      supplier_products: [{ id: 'sp-1', stock: 15 }]
    },
    {
      id: 'BO-PROD-1122',
      product_code: 'BO-PROD-1122',
      barcode: '7791122334455',
      name: 'Tijera de Poda Curva Acero',
      category: 'Herramientas',
      price: 6200,
      stock: 10,
      own_stock: 10,
      availability: 'EN_STOCK'
    }
  ];

  const localLocations = [
    {
      product_code: 'BO-PROD-9988',
      barcode: '7799988112233',
      shelf_code: 'ESTANTE-B02',
      floor_level: 1,
      shelf_level: 3,
      stock: 15
    }
    // BO-PROD-1122 no tiene ubicación física (prueba de producto sin ubicación asignada)
  ];

  // Helper local storage locations
  global.readLocalProductLocations = () => localLocations;
  global.saveLocalProductLocation = (loc) => {
    const idx = localLocations.findIndex(l => l.product_code === loc.product_code || l.barcode === loc.barcode);
    if (idx >= 0) localLocations[idx] = { ...loc };
    else localLocations.push({ ...loc });
  };
  global.getTodayDateKey = () => '2026-08-13';
  global.getVendorCashData = () => ({ sales: [], expenses: [], openings: [] });
  global.saveVendorCashData = (data) => { storage['boeweb_cash_2026-08-13'] = JSON.stringify(data); };
  global.showToast = (msg) => {};
  global.switchVendorTab = () => {};
  global.escapeStockHtml = (str) => String(str || '');

  // -------------------------------------------------------------
  // PASO 1: Ingreso de Producto Comprado y Ubicación Opcional
  // -------------------------------------------------------------
  assert.equal(baseProducts[0].stock, 15, 'Stock inicial del producto debe ser 15');
  assert.equal(localLocations[0].shelf_code, 'ESTANTE-B02', 'El producto 1 está ubicado en ESTANTE-B02');
  const prod2Loc = localLocations.find(l => l.product_code === 'BO-PROD-1122');
  assert.equal(prod2Loc, undefined, 'El producto 2 no tiene ubicación física (ubicación opcional)');

  // -------------------------------------------------------------
  // PASO 2 & 3: Escaneo de Código de Barra y Modal de Confirmación
  // -------------------------------------------------------------
  let posScanPendingProduct = null;
  function showPosProductConfirmModal(product) {
    posScanPendingProduct = product;
    const modal = document.getElementById('pos-scan-confirm-modal');
    modal.style.display = 'flex';
    document.getElementById('pos-scan-confirm-name').textContent = product.name;
    document.getElementById('pos-scan-confirm-price').textContent = `$${product.price}`;
    document.getElementById('pos-scan-confirm-stock').textContent = `${product.stock} u.`;
    document.getElementById('pos-scan-confirm-qty').value = '1';

    const locs = readLocalProductLocations();
    const loc = locs.find(l => l.product_code === product.id || l.barcode === product.barcode);
    document.getElementById('pos-scan-confirm-location').textContent = loc
      ? `📍 Estante: ${loc.shelf_code} (Piso ${loc.floor_level}, Nivel ${loc.shelf_level})`
      : '📍 Sin ubicación asignada';
  }

  function handlePosBarcodeScan(barcode) {
    const clean = String(barcode).trim();
    const match = baseProducts.find(p => p.barcode === clean || p.product_code === clean || p.id === clean);
    if (match) {
      showPosProductConfirmModal(match);
    }
  }

  // Ejecutar escaneo del producto 1
  handlePosBarcodeScan('7799988112233');

  assert.equal(domElements['pos-scan-confirm-modal'].style.display, 'flex');
  assert.equal(domElements['pos-scan-confirm-name'].textContent, 'Sustrato Light Mix 50L BÔ');
  assert.ok(domElements['pos-scan-confirm-location'].textContent.includes('ESTANTE-B02'));

  // -------------------------------------------------------------
  // PASO 4: Vendedor Confirma y se Añade al Carrito Acumulativo
  // -------------------------------------------------------------
  const cart = new PosCartEngine('POS');
  cart.clear();

  function confirmAddPosProductToCart() {
    const qty = parseInt(domElements['pos-scan-confirm-qty'].value, 10) || 1;
    cart.addItem({
      ...posScanPendingProduct,
      quantity: qty
    });
    domElements['pos-scan-confirm-modal'].style.display = 'none';
  }

  // Establecer cantidad 3 unidades en el modal y confirmar
  domElements['pos-scan-confirm-qty'].value = '3';
  confirmAddPosProductToCart();

  assert.equal(cart.getItemCount(), 3);
  assert.equal(cart.getSubtotal(), 18500 * 3); // 55500
  assert.equal(domElements['pos-scan-confirm-modal'].style.display, 'none');

  // Escanear y agregar también 1 unidad del Producto 2 (sin ubicación)
  handlePosBarcodeScan('7791122334455');
  assert.ok(domElements['pos-scan-confirm-location'].textContent.includes('Sin ubicación asignada'));
  domElements['pos-scan-confirm-qty'].value = '1';
  confirmAddPosProductToCart();

  assert.equal(cart.getItemCount(), 4); // 3 + 1 = 4
  assert.equal(cart.getSubtotal(), (18500 * 3) + 6200); // 55500 + 6200 = 61700

  // -------------------------------------------------------------
  // PASO 5: Descuento en Porcentaje (%) o en Monto Fijo ($)
  // -------------------------------------------------------------
  // A. Descuento porcentual: 10%
  cart.setDiscount('PERCENT', 10);
  assert.equal(cart.getDiscountAmount(), 6170); // 10% de 61700
  assert.equal(cart.getTotal(), 61700 - 6170);  // 55530

  // B. Descuento en monto fijo: $5.000
  cart.setDiscount('FIXED', 5000);
  assert.equal(cart.getDiscountAmount(), 5000);
  assert.equal(cart.getTotal(), 61700 - 5000);  // 56700

  // -------------------------------------------------------------
  // PASO 6 & 7: Finalizar Venta y Descontar Stock
  // -------------------------------------------------------------
  const draft = cart.createSaleDraft({
    tenantId: '11111111-1111-1111-1111-111111111111',
    cashierUser: { id: 'usr-franco', name: 'Profesor Franco' },
    salespersonUser: { id: 'usr-vendedor', name: 'Lautaro Vendedor' },
    paymentMethod: 'EFECTIVO',
    discount: cart.getDiscountAmount(),
    total: cart.getTotal()
  });

  // Ejecutar deducción de stock
  draft.items.forEach(sold => {
    const prod = baseProducts.find(p => p.id === sold.product_id);
    if (prod) {
      prod.stock -= sold.quantity;
      if (prod.supplier_products) prod.supplier_products[0].stock = prod.stock;
    }
    const loc = localLocations.find(l => l.product_code === sold.product_id);
    if (loc) {
      loc.stock -= sold.quantity;
    }
  });

  // Verificar deducción precisa
  assert.equal(baseProducts[0].stock, 12, 'Stock de Sustrato Light Mix debe pasar de 15 a 12');
  assert.equal(localLocations[0].stock, 12, 'Stock en WMS Estante B02 debe pasar de 15 a 12');
  assert.equal(baseProducts[1].stock, 9, 'Stock de Tijera de Poda debe pasar de 10 a 9');

  // Registrar movimiento de venta en caja
  const cashData = { sales: [] };
  cashData.sales.push({
    id: draft.draft_id,
    amount: draft.total,
    itemsSummary: draft.items.map(i => `${i.quantity}x ${i.name}`).join(', ')
  });
  assert.equal(cashData.sales.length, 1);
  assert.equal(cashData.sales[0].amount, 56700);

  // Vaciar carrito
  cart.clear();
  assert.equal(cart.getItemCount(), 0);
  assert.equal(cart.getTotal(), 0);
});
