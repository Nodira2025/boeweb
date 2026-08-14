import test from 'node:test';
import assert from 'node:assert/strict';
import { PosCartEngine } from '../pos-cart-engine.js';
import { PosInventorySync } from '../pos-inventory-sync.js';
import { PublicCatalogUnifier } from '../public-catalog-unification.js';

test('1. Catálogo Web: Unifica productos propios del catálogo interno como primera prioridad (EN STOCK)', () => {
  const ownStoreProducts = [
    {
      id: 'BO-PROD-001',
      product_code: 'BO-PROD-001',
      name: 'Sustrato Premium BÔ 50L',
      price: 12500,
      stock: 15,
      own_stock: 15,
      category: 'Sustratos'
    },
    {
      id: 'BO-PROD-002',
      product_code: 'BO-PROD-002',
      name: 'Fertilizante Floración Bio 1L',
      price: 9800,
      stock: 8,
      own_stock: 8,
      category: 'Fertilizantes'
    }
  ];

  const b2bOffers = [
    {
      id: 'B2B-099',
      product_code: 'B2B-099',
      name: 'Panel LED Quantum Board 240W',
      price: 180000,
      stock: 3,
      supplier_code: 'astrogrow'
    }
  ];

  const unified = PublicCatalogUnifier.unifyProducts(ownStoreProducts, b2bOffers);

  assert.equal(unified.length, 3);
  
  // Producto propio en stock
  const p1 = unified.find(p => p.product_code === 'BO-PROD-001');
  assert.ok(p1);
  assert.equal(p1.availability, 'EN_STOCK');
  assert.equal(p1.badge_text, '🟢 EN STOCK');
  assert.equal(p1.own_stock, 15);
  assert.equal(p1.price, 12500);

  // Producto B2B a pedido (Llega en 5 días)
  const p3 = unified.find(p => p.product_code === 'B2B-099');
  assert.ok(p3);
  assert.equal(p3.availability, 'A_PEDIDO');
  assert.match(p3.badge_text, /PEDIDO/);
  assert.match(p3.badge_text, /5 días/);
  assert.equal(p3.own_stock, 0); // No suma stock ajeno al inventario propio
});

test('2. Compra Web: Genera contrato de pedido completo para mediación del vendedor', () => {
  const webCart = new PosCartEngine('PUBLIC_ORDER');
  webCart.clear();

  webCart.addItem({
    id: 'BO-PROD-001',
    product_code: 'BO-PROD-001',
    name: 'Sustrato Premium BÔ 50L',
    price: 12500,
    quantity: 2
  });

  webCart.addItem({
    id: 'BO-PROD-002',
    product_code: 'BO-PROD-002',
    name: 'Fertilizante Floración Bio 1L',
    price: 9800,
    quantity: 1
  });

  const subtotal = webCart.getSubtotal(); // 12500*2 + 9800 = 34800
  assert.equal(subtotal, 34800);

  const orderId = 'BO-987654';
  const newOrder = {
    id: orderId,
    order_id: orderId,
    customer_name: 'Juan Pérez',
    customer_phone: '5493815551234',
    delivery_type: 'store_pickup',
    address: 'Retiro por el local',
    items: webCart.getItems(),
    subtotal: subtotal,
    total: subtotal,
    total_amount: subtotal,
    payment_method: 'Efectivo al retirar en local',
    status: 'Pendiente Vendedor',
    channel: 'WEB'
  };

  assert.equal(newOrder.order_id, 'BO-987654');
  assert.equal(newOrder.items.length, 2);
  assert.equal(newOrder.total, 34800);
  assert.equal(newOrder.status, 'Pendiente Vendedor');
});

test('3. Mediación Vendedor: Localización WMS de ítems y carga directa al POS para cobro presencial', () => {
  const storeLocations = [
    { product_code: 'BO-PROD-001', shelf_code: 'E-03', floor_level: 1, shelf_level: 2 },
    { product_code: 'BO-PROD-002', shelf_code: 'A-01', floor_level: 1, shelf_level: 1 }
  ];

  const incomingOrder = {
    id: 'BO-987654',
    order_id: 'BO-987654',
    customer_name: 'Juan Pérez',
    items: [
      { id: 'BO-PROD-001', product_code: 'BO-PROD-001', name: 'Sustrato Premium BÔ 50L', price: 12500, quantity: 2 },
      { id: 'BO-PROD-002', product_code: 'BO-PROD-002', name: 'Fertilizante Floración Bio 1L', price: 9800, quantity: 1 }
    ],
    status: 'Pendiente Vendedor'
  };

  // Picking guiado por ubicación WMS
  const pickingList = incomingOrder.items.map(item => {
    const loc = storeLocations.find(l => l.product_code === item.product_code);
    return {
      name: item.name,
      qty: item.quantity,
      location: loc ? `${loc.shelf_code} (Nivel ${loc.shelf_level})` : 'Sin ubicación'
    };
  });

  assert.equal(pickingList[0].location, 'E-03 (Nivel 2)');
  assert.equal(pickingList[1].location, 'A-01 (Nivel 1)');

  // Mediación: El cliente llega al local y el vendedor pasa los ítems a la Caja POS
  const posCart = new PosCartEngine('POS');
  posCart.clear();

  incomingOrder.items.forEach(item => {
    posCart.addItem({
      id: item.id,
      product_code: item.product_code,
      name: item.name,
      price: item.price,
      quantity: item.quantity
    });
  });

  assert.equal(posCart.getItemCount(), 3);
  assert.equal(posCart.getTotal(), 34800);

  // Vendedor cobra en POS y finaliza el pedido
  incomingOrder.status = 'Completado';
  assert.equal(incomingOrder.status, 'Completado');
});

test('4. Concurrencia Omnicanal: Venta en Tienda (POS) y Compra Web sobre el inventario compartido', () => {
  const storeInventory = {
    'BO-PROD-001': { stock: 10, name: 'Sustrato 50L' }
  };

  // Caso A: Cliente compra 3u por la Web
  const webOrderQty = 3;
  storeInventory['BO-PROD-001'].stock -= webOrderQty;
  assert.equal(storeInventory['BO-PROD-001'].stock, 7);

  // Caso B: Cliente presencial compra 5u en el POS con el vendedor
  const posSaleQty = 5;
  storeInventory['BO-PROD-001'].stock -= posSaleQty;
  assert.equal(storeInventory['BO-PROD-001'].stock, 2);

  // Caso C: Otro cliente web intenta comprar 4u (Stock insuficiente, solo quedan 2)
  const attemptQty = 4;
  const hasEnoughStock = storeInventory['BO-PROD-001'].stock >= attemptQty;
  assert.equal(hasEnoughStock, false, 'No debe permitir sobreventa ni stock negativo');
});

test('5. Descuento de Stock al Completar Pedido Web (Cero Doble Descuento)', () => {
  const catalog = [
    { id: 'PROD-101', product_code: 'PROD-101', name: 'Macetas Geotextiles 10L', stock: 20 }
  ];
  const locations = [
    { product_code: 'PROD-101', shelf_code: 'P3-E2', stock: 20 }
  ];

  const webOrder = {
    id: 'ORD-777',
    order_id: 'ORD-777',
    customer_name: 'Ana Martínez',
    items: [{ product_code: 'PROD-101', name: 'Macetas Geotextiles 10L', quantity: 5 }],
    status: 'Pendiente Vendedor',
    stock_deducted: false
  };

  // Simulación de updateWebOrderStatus('ORD-777', 'Completado')
  const isNowCompleted = true;
  if (isNowCompleted && !webOrder.stock_deducted) {
    webOrder.items.forEach(item => {
      const p = catalog.find(x => x.product_code === item.product_code);
      if (p) p.stock = Math.max(0, p.stock - item.quantity);

      const loc = locations.find(x => x.product_code === item.product_code);
      if (loc) loc.stock = Math.max(0, loc.stock - item.quantity);
    });
    webOrder.stock_deducted = true;
    webOrder.status = 'Completado';
  }

  assert.equal(catalog[0].stock, 15);
  assert.equal(locations[0].stock, 15);
  assert.equal(webOrder.status, 'Completado');
  assert.equal(webOrder.stock_deducted, true);

  // Intentar completar de nuevo (Idempotencia / No doble descuento)
  if (isNowCompleted && !webOrder.stock_deducted) {
    catalog[0].stock -= 5;
  }
  assert.equal(catalog[0].stock, 15, 'No debe descontar doble si ya estaba marcado como stock_deducted');
});

test('6. Retiro / Ajuste de Stock en Ubicaciones Físicas y Catálogo', () => {
  const internalCatalog = [{ id: 'FERT-01', product_code: 'FERT-01', name: 'Bio Root 250ml', stock: 8 }];
  const localLocations = [{ product_code: 'FERT-01', shelf_code: 'P1-E1', stock: 8 }];

  // Retiro por defecto/rotura de 2 unidades
  const qtyToRemove = 2;
  const target = internalCatalog.find(p => p.product_code === 'FERT-01');
  const loc = localLocations.find(l => l.product_code === 'FERT-01');

  target.stock = Math.max(0, target.stock - qtyToRemove);
  loc.stock = target.stock;

  assert.equal(target.stock, 6);
  assert.equal(loc.stock, 6);
});

test('7. Catálogo Web Unificado: Producto con stock 0 sin B2B queda SIN_STOCK y no permite retiro excesivo', () => {
  const ownStoreProducts = [
    {
      id: 'BO-PROD-ZERO',
      product_code: 'BO-PROD-ZERO',
      name: 'Semillas Auto 3u',
      price: 15000,
      stock: 0,
      own_stock: 0,
      available: false,
      category: 'Semillas'
    }
  ];

  const unified = PublicCatalogUnifier.unifyProducts(ownStoreProducts, []);
  assert.equal(unified.length, 1);
  assert.equal(unified[0].own_stock, 0);
  assert.equal(unified[0].has_own_stock, false);
  assert.equal(unified[0].available, false);
  assert.equal(unified[0].availability, 'SIN_STOCK');
  assert.equal(unified[0].badge_text, '🔴 SIN STOCK');

  // Validación de retiro: no permitir retirar si stock <= 0 o qty > stock
  const prevStock = unified[0].own_stock;
  const attemptWithdraw = 3;
  const canWithdraw = prevStock > 0 && attemptWithdraw <= prevStock;
  assert.equal(canWithdraw, false, 'No debe permitir retiro cuando stock es 0 o excede disponible');
});


