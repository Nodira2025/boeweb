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
  // El inventario permanece 100% intacto en 2 u. (cero mutación automática)
  assert.equal(balancesStore[0].on_hand_sellable, 2);
});

test('2. Deduplicación por Fingerprint: 10 ejecuciones del detector generan 1 sola Alerta con occurrence_count = 10', () => {
  OPERATIONAL_ALERTS_STORE.length = 0;
  OPERATIONAL_ALERT_EVENTS_STORE.length = 0;
  const tenantId = '11111111-1111-1111-1111-111111111111';

  const balancesStore = [
    { tenant_id: tenantId, product_id: 'SKU-OUT', on_hand_sellable: 0 }
  ];

  // Ejecutar 10 veces seguidas el detector
  for (let i = 0; i < 10; i++) {
    OperationalHealthAlerts.runTenantHealthChecks(tenantId, { balancesStore });
  }

  const tenantAlerts = OPERATIONAL_ALERTS_STORE.filter(a => a.tenant_id === tenantId);
  assert.equal(tenantAlerts.length, 1); // 1 sola alerta
  assert.equal(tenantAlerts[0].occurrence_count, 10);
  assert.equal(tenantAlerts[0].severity, 'CRITICAL');
});

test('3. Auto-Resolución: Cuando la condición desaparece, la alerta se resuelve automáticamente (AUTO_CONDITION_CLEARED)', () => {
  OPERATIONAL_ALERTS_STORE.length = 0;
  OPERATIONAL_ALERT_EVENTS_STORE.length = 0;
  const tenantId = '11111111-1111-1111-1111-111111111111';

  const balancesStore = [
    { tenant_id: tenantId, product_id: 'SKU-TEMP', on_hand_sellable: 1, min_stock: 5 }
  ];

  // 1ra corrida: Levanta alerta LOW_STOCK
  OperationalHealthAlerts.runTenantHealthChecks(tenantId, { balancesStore });
  assert.equal(OPERATIONAL_ALERTS_STORE[0].status, 'OPEN');

  // Recepción de mercadería legítima: stock sube a 20 u.
  balancesStore[0].on_hand_sellable = 20;

  // 2da corrida: La condición desapareció -> Auto-Resolución
  const res2 = OperationalHealthAlerts.runTenantHealthChecks(tenantId, { balancesStore });
  assert.equal(res2.status, 'HEALTHY');
  assert.equal(OPERATIONAL_ALERTS_STORE[0].status, 'RESOLVED');
  assert.equal(OPERATIONAL_ALERTS_STORE[0].resolution_type, 'AUTO_CONDITION_CLEARED');

  const events = OPERATIONAL_ALERT_EVENTS_STORE.filter(e => e.alert_id === OPERATIONAL_ALERTS_STORE[0].id);
  assert.equal(events.some(e => e.event_type === 'AUTO_RESOLVED'), true);
});

test('4. Detección de Falla del Propio Motor: Si ocurre una excepción, el estado es CHECK_FAILED (No HEALTHY falso)', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';

  // Objeto corrupto que lanza error al iterar
  const corruptStore = {
    balancesStore: { filter: () => { throw new Error('Simulated database connection failure'); } }
  };

  const result = OperationalHealthAlerts.runTenantHealthChecks(tenantId, corruptStore);
  assert.equal(result.status, 'CHECK_FAILED');
  assert.equal(result.error.includes('Simulated database connection failure'), true);
});

test('5. Acciones Manuales de Alerta (ACK, Assign, Resolve) Integradas con Audit Log', () => {
  OPERATIONAL_ALERTS_STORE.length = 0;
  ADMIN_ACTIVITY_LOG_STORE.length = 0;
  const tenantId = '11111111-1111-1111-1111-111111111111';

  const balancesStore = [{ tenant_id: tenantId, product_id: 'SKU-TEST', on_hand_sellable: 0 }];
  OperationalHealthAlerts.runTenantHealthChecks(tenantId, { balancesStore });

  const alertId = OPERATIONAL_ALERTS_STORE[0].id;

  // Acknowledge
  const ackRes = OperationalHealthAlerts.acknowledgeAlert(alertId, tenantId, 'usr-admin-franco');
  assert.equal(ackRes.status, 'ACKNOWLEDGED');
  assert.equal(ackRes.acknowledged_by, 'usr-admin-franco');

  // Resolve Manually
  const resolveRes = OperationalHealthAlerts.resolveAlertManually(alertId, tenantId, 'usr-admin-franco', 'Revisado físicamente');
  assert.equal(resolveRes.status, 'RESOLVED');
  assert.equal(resolveRes.resolution_type, 'MANUALLY_RESOLVED');

  // Comprobar integración con admin_activity_log
  const auditLogs = AdminOperationsConsole.getAdminActivityLogs(tenantId);
  assert.equal(auditLogs.some(l => l.action === 'ALERT_MANUAL_RESOLVE'), true);
});

test('6. Multi-Tenant Isolation en Alertas y Notificaciones In-App', () => {
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
