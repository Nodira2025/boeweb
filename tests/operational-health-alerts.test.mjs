import test from 'node:test';
import assert from 'node:assert/strict';
import { OperationalHealthAlerts, OPERATIONAL_ALERTS_STORE, OPERATIONAL_ALERT_EVENTS_STORE, ALERT_NOTIFICATIONS_STORE } from '../operational-health-alerts.js';
import { AdminOperationsConsole, ADMIN_ACTIVITY_LOG_STORE } from '../admin-operations-console.js';

test('1. Principio Arquitectónico: Generar una Alerta NUNCA modifica el inventario ni la contabilidad', () => {
  OPERATIONAL_ALERTS_STORE.length = 0;
  const tenantId = '11111111-1111-1111-1111-111111111111';

  const balancesStore = [
    { tenant_id: tenantId, product_id: 'SKU-LOW', on_hand_sellable: 2, min_stock: 5 }
  ];

  const result = OperationalHealthAlerts.runTenantHealthChecks(tenantId, { balancesStore });

  assert.equal(result.status, 'ATTENTION');
  assert.equal(result.open_alerts, 1);
  assert.equal(balancesStore[0].on_hand_sellable, 2);
});

test('2. Deduplicación por Fingerprint: 10 ejecuciones del detector generan 1 sola Alerta con occurrence_count = 10 (Prueba 7)', () => {
  OPERATIONAL_ALERTS_STORE.length = 0;
  OPERATIONAL_ALERT_EVENTS_STORE.length = 0;
  const tenantId = '11111111-1111-1111-1111-111111111111';

  const balancesStore = [
    { tenant_id: tenantId, product_id: 'SKU-OUT', on_hand_sellable: 0 }
  ];

  for (let i = 0; i < 10; i++) {
    OperationalHealthAlerts.runTenantHealthChecks(tenantId, { balancesStore });
  }

  const tenantAlerts = OPERATIONAL_ALERTS_STORE.filter(a => a.tenant_id === tenantId);
  assert.equal(tenantAlerts.length, 1);
  assert.equal(tenantAlerts[0].occurrence_count, 10);
  assert.equal(tenantAlerts[0].severity, 'CRITICAL');
});

test('3. Auto-Resolución: Cuando la condición desaparece, la alerta se resuelve automáticamente (AUTO_CONDITION_CLEARED) (Prueba 8)', () => {
  OPERATIONAL_ALERTS_STORE.length = 0;
  OPERATIONAL_ALERT_EVENTS_STORE.length = 0;
  const tenantId = '11111111-1111-1111-1111-111111111111';

  const balancesStore = [
    { tenant_id: tenantId, product_id: 'SKU-TEMP', on_hand_sellable: 1, min_stock: 5 }
  ];

  OperationalHealthAlerts.runTenantHealthChecks(tenantId, { balancesStore });
  assert.equal(OPERATIONAL_ALERTS_STORE[0].status, 'OPEN');

  balancesStore[0].on_hand_sellable = 20;

  const res2 = OperationalHealthAlerts.runTenantHealthChecks(tenantId, { balancesStore });
  assert.equal(res2.status, 'HEALTHY');
  assert.equal(OPERATIONAL_ALERTS_STORE[0].status, 'RESOLVED');
  assert.equal(OPERATIONAL_ALERTS_STORE[0].resolution_type, 'AUTO_CONDITION_CLEARED');

  const events = OPERATIONAL_ALERT_EVENTS_STORE.filter(e => e.alert_id === OPERATIONAL_ALERTS_STORE[0].id);
  assert.equal(events.some(e => e.event_type === 'AUTO_RESOLVED'), true);
});

test('4. Detección de Falla del Propio Motor: Si ocurre una excepción, el estado es CHECK_FAILED (No HEALTHY falso) (Prueba 9)', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';

  const corruptStore = {
    balancesStore: { filter: () => { throw new Error('Simulated database connection failure'); } }
  };

  const result = OperationalHealthAlerts.runTenantHealthChecks(tenantId, corruptStore);
  assert.equal(result.status, 'CHECK_FAILED');
  assert.equal(result.error.includes('Simulated database connection failure'), true);
});

test('5. Bloqueo de Escritura Directa en Alertas y Eventos desde Cliente (Pruebas 4 & 5)', () => {
  assert.throws(() => {
    OperationalHealthAlerts.attemptDirectAlertWrite();
  }, /🔒 Operación denegada en Supabase: ERROR 42501/);

  assert.throws(() => {
    OperationalHealthAlerts.attemptDirectEventWrite();
  }, /🔒 Operación denegada en Supabase: ERROR 42501/);
});

test('6. Detector de Integridad Transaccional: Venta sin ítems genera Alerta CRITICAL (Prueba 11)', () => {
  OPERATIONAL_ALERTS_STORE.length = 0;
  const tenantId = '11111111-1111-1111-1111-111111111111';

  const salesStore = [{ id: 'sale-broken-99', tenant_id: tenantId, total: 12000 }];
  const saleItemsStore = []; // Sin ítems grabados

  const result = OperationalHealthAlerts.runTenantHealthChecks(tenantId, { salesStore, saleItemsStore });
  assert.equal(result.status, 'CRITICAL');

  const alert = OPERATIONAL_ALERTS_STORE.find(a => a.alert_type === 'SALE_WITHOUT_ITEMS');
  assert.notEqual(alert, undefined);
  assert.equal(alert.severity, 'CRITICAL');
});

test('7. Notificaciones In-App Persistentes y Control de Lectura (Prueba 6)', () => {
  OPERATIONAL_ALERTS_STORE.length = 0;
  ALERT_NOTIFICATIONS_STORE.length = 0;
  const tenantId = '11111111-1111-1111-1111-111111111111';

  OperationalHealthAlerts.runTenantHealthChecks(tenantId, { balancesStore: [{ tenant_id: tenantId, product_id: 'PROD-NOTIF', on_hand_sellable: 0 }] });

  const unreadBefore = OperationalHealthAlerts.getUnreadNotifications(tenantId);
  assert.equal(unreadBefore.length, 1);
  assert.equal(unreadBefore[0].read, false);

  OperationalHealthAlerts.markNotificationAsRead(unreadBefore[0].id, tenantId);

  const unreadAfter = OperationalHealthAlerts.getUnreadNotifications(tenantId);
  assert.equal(unreadAfter.length, 0);
});

test('8. Multi-Tenant Isolation en Alertas y Notificaciones In-App (Prueba 13)', () => {
  OPERATIONAL_ALERTS_STORE.length = 0;
  ALERT_NOTIFICATIONS_STORE.length = 0;

  const tenantA = '11111111-1111-1111-1111-111111111111';
  const tenantB = '22222222-2222-2222-2222-222222222222';

  OperationalHealthAlerts.runTenantHealthChecks(tenantA, { balancesStore: [{ tenant_id: tenantA, product_id: 'PROD-A', on_hand_sellable: 0 }] });
  OperationalHealthAlerts.runTenantHealthChecks(tenantB, { balancesStore: [{ tenant_id: tenantB, product_id: 'PROD-B', on_hand_sellable: 0 }] });

  const notifsA = OperationalHealthAlerts.getUnreadNotifications(tenantA);
  const notifsB = OperationalHealthAlerts.getUnreadNotifications(tenantB);

  assert.equal(notifsA.length, 1);
  assert.equal(notifsA[0].title.includes('PROD-A'), true);

  assert.equal(notifsB.length, 1);
  assert.equal(notifsB[0].title.includes('PROD-B'), true);
});
