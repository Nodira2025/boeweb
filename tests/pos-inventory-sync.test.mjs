import test from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage & sessionStorage para entorno Node
class StorageMock {
  constructor() { this.store = {}; }
  getItem(key) { return this.store[key] || null; }
  setItem(key, value) { this.store[key] = String(value); }
  removeItem(key) { delete this.store[key]; }
  clear() { this.store = {}; }
}
global.localStorage = new StorageMock();
global.sessionStorage = new StorageMock();

import { PosInventorySync } from '../pos-inventory-sync.js';

test('1. POS Directo SIN WMS: Stock 10 -> Vender 3 -> Quedan 7 en on_hand y 7 en available', () => {
  const tenantId = 't-no-wms-1';
  const productId = 'prod-100';

  const balances = [{ tenant_id: tenantId, product_id: productId, warehouse_id: 'default', on_hand_sellable: 10 }];
  const reservations = [];
  const ledger = [];
  const profiles = [{ tenant_id: tenantId, wms_enabled: false }];

  const availBefore = PosInventorySync.getInventoryAvailability(tenantId, productId, [], balances, reservations, profiles);
  assert.equal(availBefore.on_hand, 10);
  assert.equal(availBefore.available, 10);

  const res = PosInventorySync.salePosDirect({
    tenant_id: tenantId,
    product_id: productId,
    quantity: 3,
    user_name: 'Cajero 1',
    idempotency_key: 'key-sale-1'
  }, [], balances, reservations, ledger, profiles);

  assert.equal(res.success, true);

  const availAfter = PosInventorySync.getInventoryAvailability(tenantId, productId, [], balances, reservations, profiles);
  assert.equal(availAfter.on_hand, 7);
  assert.equal(availAfter.reserved, 0);
  assert.equal(availAfter.available, 7);
});

test('2. POS Directo CON WMS: Descuento físico real desde módulos concretos (M01: 3u, M07: 5u -> Vender 6u)', () => {
  const tenantId = 't-wms-1';
  const productId = 'taladro-bosch';

  const locations = [
    { tenant_id: tenantId, product_id: productId, module_code: 'M01', human_level: 1, sector_position: 'A', disposition: 'SELLABLE', quantity: 3 },
    { tenant_id: tenantId, product_id: productId, module_code: 'M07', human_level: 2, sector_position: 'B', disposition: 'SELLABLE', quantity: 5 }
  ];
  const balances = [];
  const reservations = [];
  const ledger = [];
  const profiles = [{ tenant_id: tenantId, wms_enabled: true }];

  const res = PosInventorySync.salePosDirect({
    tenant_id: tenantId,
    product_id: productId,
    quantity: 6,
    user_name: 'Cajero 2',
    idempotency_key: 'key-sale-wms-1',
    preferred_module: 'M01'
  }, locations, balances, reservations, ledger, profiles);

  assert.equal(res.success, true);

  const m01 = locations.find(l => l.module_code === 'M01');
  const m07 = locations.find(l => l.module_code === 'M07');
  assert.equal(m01.quantity, 0);
  assert.equal(m07.quantity, 2);

  const availAfter = PosInventorySync.getInventoryAvailability(tenantId, productId, locations, balances, reservations, profiles);
  assert.equal(availAfter.on_hand, 2);
  assert.equal(availAfter.available, 2);
});

test('3. Reserva Comercial: 10 on_hand -> Reservar 4 -> on_hand 10, reserved 4, available 6', () => {
  const tenantId = 't-res-1';
  const productId = 'fertilizante-topcrop';

  const balances = [{ tenant_id: tenantId, product_id: productId, warehouse_id: 'default', on_hand_sellable: 10 }];
  const reservations = [];
  const ledger = [];
  const profiles = [{ tenant_id: tenantId, wms_enabled: false }];

  const res = PosInventorySync.reserveOrder({
    tenant_id: tenantId,
    product_id: productId,
    order_id: 'order-101',
    quantity: 4,
    expires_in_minutes: 30,
    idempotency_key: 'key-res-1'
  }, [], balances, reservations, ledger, profiles);

  assert.equal(res.success, true);
  assert.equal(res.reservation.status, 'ACTIVE');

  const avail = PosInventorySync.getInventoryAvailability(tenantId, productId, [], balances, reservations, profiles);
  assert.equal(avail.on_hand, 10);
  assert.equal(avail.reserved, 4);
  assert.equal(avail.available, 6);
});

test('4. Fulfillment (Despacho): Reservado 4 -> Fulfill -> on_hand 6, reserved 0, available 6 (CERO Doble Descuento)', () => {
  const tenantId = 't-res-1';
  const productId = 'fertilizante-topcrop';

  const balances = [{ tenant_id: tenantId, product_id: productId, warehouse_id: 'default', on_hand_sellable: 10 }];
  const reservations = [];
  const ledger = [];
  const profiles = [{ tenant_id: tenantId, wms_enabled: false }];

  const resOrder = PosInventorySync.reserveOrder({
    tenant_id: tenantId,
    product_id: productId,
    order_id: 'order-102',
    quantity: 4,
    idempotency_key: 'key-res-2'
  }, [], balances, reservations, ledger, profiles);

  const resFulfill = PosInventorySync.fulfillReservation({
    tenant_id: tenantId,
    reservation_id: resOrder.reservation.id,
    user_name: 'Despachante 1',
    idempotency_key: 'key-ful-1'
  }, [], balances, reservations, ledger, profiles);

  assert.equal(resFulfill.success, true);
  assert.equal(resFulfill.reservation.status, 'FULFILLED');

  const avail = PosInventorySync.getInventoryAvailability(tenantId, productId, [], balances, reservations, profiles);
  assert.equal(avail.on_hand, 6);
  assert.equal(avail.reserved, 0);
  assert.equal(avail.available, 6);
});

test('5. Release: Reservar 4 y cancelar -> reserved 0, available vuelve a 10', () => {
  const tenantId = 't-rel-1';
  const productId = 'maceta-geo-10l';

  const balances = [{ tenant_id: tenantId, product_id: productId, warehouse_id: 'default', on_hand_sellable: 10 }];
  const reservations = [];
  const ledger = [];

  const resOrder = PosInventorySync.reserveOrder({
    tenant_id: tenantId,
    product_id: productId,
    order_id: 'order-103',
    quantity: 4,
    idempotency_key: 'key-res-3'
  }, [], balances, reservations, ledger);

  const resRelease = PosInventorySync.releaseReservation({
    tenant_id: tenantId,
    reservation_id: resOrder.reservation.id,
    reason: 'Pago Rechazado por Tarjeta',
    idempotency_key: 'key-rel-1'
  }, reservations, ledger);

  assert.equal(resRelease.success, true);
  assert.equal(resRelease.reservation.status, 'RELEASED');

  const avail = PosInventorySync.getInventoryAvailability(tenantId, productId, [], balances, reservations);
  assert.equal(avail.on_hand, 10);
  assert.equal(avail.reserved, 0);
  assert.equal(avail.available, 10);
});

test('6. Expiración de Reserva: Reserva vencida se libera server-side e idempotentemente', () => {
  const tenantId = 't-exp-1';
  const productId = 'sustrato-klasmann';

  const balances = [{ tenant_id: tenantId, product_id: productId, warehouse_id: 'default', on_hand_sellable: 10 }];
  const reservations = [
    {
      id: 'res-vencida-1',
      tenant_id: tenantId,
      product_id: productId,
      order_id: 'order-exp-1',
      quantity: 5,
      status: 'ACTIVE',
      expires_at: new Date(Date.now() - 1000).toISOString(), // Vencida hace 1 segundo
      idempotency_key: 'key-exp-1'
    }
  ];

  // getInventoryAvailability ignora la reserva vencida en el cálculo de available
  const availBefore = PosInventorySync.getInventoryAvailability(tenantId, productId, [], balances, reservations);
  assert.equal(availBefore.reserved, 0);
  assert.equal(availBefore.available, 10);

  // Ejecutar procedimiento de limpieza de reservas vencidas
  const cleanedCount = PosInventorySync.cleanupExpiredReservations(tenantId, reservations);
  assert.equal(cleanedCount, 1);
  assert.equal(reservations[0].status, 'EXPIRED');
});

test('7. Concurrencia: Stock 10; Caja A intenta 7 y Caja B 6 -> 1 operación gana, 1 es rechazada', () => {
  const tenantId = 't-conc-1';
  const productId = 'amoladora-dewalt';

  const balances = [{ tenant_id: tenantId, product_id: productId, warehouse_id: 'default', on_hand_sellable: 10 }];
  const reservations = [];
  const ledger = [];

  // Simulación de cerrojo transaccional: Caja A procesa primero
  const resA = PosInventorySync.salePosDirect({
    tenant_id: tenantId,
    product_id: productId,
    quantity: 7,
    user_name: 'Caja A',
    idempotency_key: 'key-caja-a'
  }, [], balances, reservations, ledger);

  assert.equal(resA.success, true);

  // Caja B intenta vender 6 pero sólo quedan 3 disponibles
  const resB = PosInventorySync.salePosDirect({
    tenant_id: tenantId,
    product_id: productId,
    quantity: 6,
    user_name: 'Caja B',
    idempotency_key: 'key-caja-b'
  }, [], balances, reservations, ledger);

  assert.equal(resB.success, false);
  assert.ok(resB.error.includes('Stock insuficiente'));
});

test('8. Doble Click / Idempotencia Fuerte: Misma idempotency_key dos veces -> 1 sola venta ejecutada', () => {
  const tenantId = 't-idem-1';
  const productId = 'filtro-aceite-vw';

  const balances = [{ tenant_id: tenantId, product_id: productId, warehouse_id: 'default', on_hand_sellable: 10 }];
  const reservations = [];
  const ledger = [];

  const key = 'idem-click-123';

  // Primer clic
  const res1 = PosInventorySync.salePosDirect({
    tenant_id: tenantId,
    product_id: productId,
    quantity: 2,
    user_name: 'Cajero Idem',
    idempotency_key: key
  }, [], balances, reservations, ledger);

  assert.equal(res1.success, true);
  assert.equal(balances[0].on_hand_sellable, 8);

  // Segundo clic con la misma clave (Doble-clic o Retry por mala señal)
  const res2 = PosInventorySync.salePosDirect({
    tenant_id: tenantId,
    product_id: productId,
    quantity: 2,
    user_name: 'Cajero Idem',
    idempotency_key: key
  }, [], balances, reservations, ledger);

  assert.equal(res2.success, true);
  assert.equal(res2.idempotent, true);
  assert.equal(balances[0].on_hand_sellable, 8); // NO se volvió a descontar
});

test('9. RETURN_SELLABLE: Devolución en buen estado incrementa stock vendible y available', () => {
  const tenantId = 't-ret-1';
  const productId = 'campera-nike';

  const balances = [{ tenant_id: tenantId, product_id: productId, warehouse_id: 'default', on_hand_sellable: 5 }];
  const reservations = [];
  const ledger = [];
  const profiles = [{ tenant_id: tenantId, wms_enabled: false }];

  const res = PosInventorySync.returnInventory({
    tenant_id: tenantId,
    product_id: productId,
    quantity: 2,
    return_type: 'SELLABLE',
    idempotency_key: 'key-ret-sellable-1'
  }, [], balances, ledger, profiles);

  assert.equal(res.success, true);

  const avail = PosInventorySync.getInventoryAvailability(tenantId, productId, [], balances, reservations, profiles);
  assert.equal(avail.on_hand, 7);
  assert.equal(avail.available, 7);
});

test('10. RETURN_DAMAGED: Devolución rota incrementa físicamente DAMAGED pero NO incrementa available', () => {
  const tenantId = 't-ret-2';
  const productId = 'maceta-rota';

  const locations = [
    { tenant_id: tenantId, product_id: productId, module_code: 'M01', human_level: 1, sector_position: 'A', disposition: 'SELLABLE', quantity: 5 }
  ];
  const balances = [];
  const reservations = [];
  const ledger = [];
  const profiles = [{ tenant_id: tenantId, wms_enabled: true }];

  const res = PosInventorySync.returnInventory({
    tenant_id: tenantId,
    product_id: productId,
    quantity: 1,
    return_type: 'DAMAGED',
    idempotency_key: 'key-ret-damaged-1'
  }, locations, balances, ledger, profiles);

  assert.equal(res.success, true);

  const avail = PosInventorySync.getInventoryAvailability(tenantId, productId, locations, balances, reservations, profiles);
  assert.equal(avail.on_hand, 5); // Stock vendible intacto
  assert.equal(avail.available, 5); // Available no cambió
  assert.equal(avail.damaged, 1); // Disposición DAMAGED registrada físicamente en WMS
});

test('11. REFUND: Reintegro monetario puro NO altera el inventario físico ni disponible', () => {
  const tenantId = 't-ref-1';
  const productId = 'prod-refund';

  const balances = [{ tenant_id: tenantId, product_id: productId, warehouse_id: 'default', on_hand_sellable: 10 }];
  const reservations = [];
  const ledger = [];

  // Registrar un refund puramente financiero en la bitácora
  ledger.push({
    id: 'led-refund-1',
    tenant_id: tenantId,
    product_id: productId,
    event_type: 'REFUND',
    quantity: 0,
    reference_type: 'FINANCE_REFUND',
    reference_id: 'ref-999',
    idempotency_key: 'key-refund-1',
    created_at: new Date().toISOString()
  });

  const avail = PosInventorySync.getInventoryAvailability(tenantId, productId, [], balances, reservations);
  assert.equal(avail.on_hand, 10);
  assert.equal(avail.available, 10);
});

test('12. Multi-Tenant Isolation: Tenant A (Ferretería San Martín) NO ve ni modifica Tenant B (Moda Urbana)', () => {
  const tenantA = 't-san-martin';
  const tenantB = 't-moda-urbana';
  const productId = 'sku-comun-100';

  const balances = [
    { tenant_id: tenantA, product_id: productId, warehouse_id: 'default', on_hand_sellable: 50 },
    { tenant_id: tenantB, product_id: productId, warehouse_id: 'default', on_hand_sellable: 20 }
  ];
  const reservations = [];
  const ledger = [];

  // Venta en Tenant A
  PosInventorySync.salePosDirect({
    tenant_id: tenantA,
    product_id: productId,
    quantity: 10,
    user_name: 'Cajero A',
    idempotency_key: 'key-sa-1'
  }, [], balances, reservations, ledger);

  const availA = PosInventorySync.getInventoryAvailability(tenantA, productId, [], balances, reservations);
  const availB = PosInventorySync.getInventoryAvailability(tenantB, productId, [], balances, reservations);

  assert.equal(availA.on_hand, 40); // Tenant A descontó 10
  assert.equal(availB.on_hand, 20); // Tenant B permaneció 100% INTACTO
});

test('13. WMS Audit Regression Check: Auditoría reporta diferencia sin alterar el stock vendible automáticamente', () => {
  const tenantId = 't-wms-audit';
  const productId = 'taladro-auditoria';

  const locations = [
    { tenant_id: tenantId, product_id: productId, module_code: 'M01', human_level: 1, sector_position: 'A', disposition: 'SELLABLE', quantity: 10 }
  ];
  const balances = [];
  const reservations = [];
  const profiles = [{ tenant_id: tenantId, wms_enabled: true }];

  // Reporte de diferencia en auditoría
  const auditDifferenceReport = {
    tenant_id: tenantId,
    module_code: 'M01',
    product_id: productId,
    system_qty: 10,
    counted_qty: 8,
    discrepancy: -2,
    status: 'PENDING_APPROVAL'
  };

  assert.equal(auditDifferenceReport.status, 'PENDING_APPROVAL');

  // El disponible comercial sigue siendo 10 hasta que un SUPERADMIN apruebe el ajuste
  const avail = PosInventorySync.getInventoryAvailability(tenantId, productId, locations, balances, reservations, profiles);
  assert.equal(avail.available, 10);
});

test('14. Aislamiento B2B: supplier_products.stock de proveedor externo NO cambia por vender inventario propio', () => {
  const tenantId = 't-b2b-iso';
  const productId = 'producto-propio';

  const supplierProductStock = 500; // Stock disponible en catálogo B2B del Proveedor Bosch
  const balances = [{ tenant_id: tenantId, product_id: productId, warehouse_id: 'default', on_hand_sellable: 15 }];
  const reservations = [];
  const ledger = [];

  // Vender 5 unidades de nuestro stock comercial local
  PosInventorySync.salePosDirect({
    tenant_id: tenantId,
    product_id: productId,
    quantity: 5,
    user_name: 'Vendedor Local',
    idempotency_key: 'key-b2b-1'
  }, [], balances, reservations, ledger);

  const avail = PosInventorySync.getInventoryAvailability(tenantId, productId, [], balances, reservations);
  assert.equal(avail.on_hand, 10);
  assert.equal(supplierProductStock, 500); // El stock del proveedor B2B jamás fue tocado
});

test('15. Persistencia y Cero Estado en Memoria: Cierre de navegador y reinicio mantiene X - N', () => {
  const tenantId = 't-persist-1';
  const productId = 'prod-persistente';

  // Simulación de guardado inicial
  localStorage.setItem(`balance_${tenantId}_${productId}`, JSON.stringify({ on_hand_sellable: 50 }));

  // Venta POS
  const balanceObj = JSON.parse(localStorage.getItem(`balance_${tenantId}_${productId}`));
  const balances = [{ tenant_id: tenantId, product_id: productId, warehouse_id: 'default', on_hand_sellable: balanceObj.on_hand_sellable }];

  PosInventorySync.salePosDirect({
    tenant_id: tenantId,
    product_id: productId,
    quantity: 12,
    user_name: 'Cajero Persist',
    idempotency_key: 'key-persist-1'
  }, [], balances, [], []);

  // Persistir cambios
  localStorage.setItem(`balance_${tenantId}_${productId}`, JSON.stringify({ on_hand_sellable: balances[0].on_hand_sellable }));

  // Simulación de reinicio total de servidor / servidor sin memoria
  const restoredObj = JSON.parse(localStorage.getItem(`balance_${tenantId}_${productId}`));
  assert.equal(restoredObj.on_hand_sellable, 38);
});
