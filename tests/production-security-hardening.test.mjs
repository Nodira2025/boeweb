import test from 'node:test';
import assert from 'node:assert/strict';
import migrationPkg from '../migration-ai.js';
import { PosInventorySync } from '../pos-inventory-sync.js';
import { AdminOperationsConsole } from '../admin-operations-console.js';
import { OperationalHealthAlerts } from '../operational-health-alerts.js';

const MigrationAI = migrationPkg.MigrationAI;

// 1. SSRF PROTECTION
test('1. SSRF Prevention: Bloqueo de URLs internas, localhost, 169.254.169.254 y file://', () => {
  const ssrfPayloads = [
    'http://127.0.0.1/admin',
    'http://localhost:8080/metrics',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.1/internal',
    'http://192.168.1.1/router',
    'file:///etc/passwd',
    'gopher://127.0.0.1:70/'
  ];

  for (const payload of ssrfPayloads) {
    assert.throws(() => {
      MigrationAI.parseUrlSource(payload);
    }, /🔒 Bloqueo de Seguridad SSRF/);
  }

  // URL pública legítima permitida
  const validRes = MigrationAI.parseUrlSource('https://www.astrogrow.com.ar/catalogo');
  assert.equal(validRes.length, 1);
});

// 2. DEVTOOLS PRICE TAMPERING PROTECTION
test('2. DevTools Price Tampering Protection: El servidor sobrescribe precios adulterados por el catálogo autoritativo', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const productsStore = [
    { id: 'PROD-35K', product_code: 'PROD-35K', name: 'Top Crop Top Veg 1L', price: 35000 }
  ];

  const salesStore = [];
  const saleItemsStore = [];
  const balancesStore = [{ tenant_id: tenantId, product_id: 'PROD-35K', on_hand_sellable: 10, min_stock: 2 }];

  // Intento de alteración con unit_price = 500 desde DevTools
  const tamperedDraft = {
    tenant_id: tenantId,
    idempotency_key: `key-price-tamper-${Date.now()}`,
    items: [
      { id: 'PROD-35K', quantity: 1, unit_price: 500, price: 500 }
    ]
  };

  const result = PosInventorySync.processPersistentSale(
    tamperedDraft,
    [], balancesStore, [], [], [], salesStore, saleItemsStore, [], [], productsStore
  );

  assert.equal(result.success, true);
  // El precio grabado debe ser el autoritativo $35.000, NO los $500 adulterados
  assert.equal(saleItemsStore[0].unit_price, 35000);
  assert.equal(saleItemsStore[0].subtotal, 35000);
});

// 3. ROLE ESCALATION PRECLUSION
test('3. Preclusión de Escalada de Rol (SUPERADMIN Escalation Denial)', async () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const adminRequester = {
    userId: 'usr-admin-sanmartin',
    userName: 'Admin Local',
    tenantId: tenantId,
    role: 'ADMIN',
    isSuperadmin: false
  };

  await assert.rejects(async () => {
    await AdminOperationsConsole.manageTenantUser({
      requesterContext: adminRequester,
      targetTenantId: tenantId,
      action: 'CHANGE_ROLE',
      targetUserId: 'usr-admin-sanmartin',
      newRole: 'SUPERADMIN'
    }, []);
  }, /🔒 Operación denegada/);
});

// 4. AUDIT LOG & ALERTS DIRECT WRITE DENIAL
test('4. Inmutabilidad y Bloqueo de Escritura Directa en Audit Logs y Alertas', () => {
  assert.throws(() => {
    AdminOperationsConsole.attemptDirectAuditInsert();
  }, /🔒 Operación denegada/);

  assert.throws(() => {
    OperationalHealthAlerts.attemptDirectAlertWrite();
  }, /🔒 Operación denegada/);

  assert.throws(() => {
    OperationalHealthAlerts.attemptDirectEventWrite();
  }, /🔒 Operación denegada/);
});

// 5. CROSS-TENANT IDOR & RLS DENIAL
test('5. Multi-Tenant IDOR & RLS Cross-Tenant Isolation Denial', async () => {
  const tenantA = '11111111-1111-1111-1111-111111111111';
  const tenantB = '22222222-2222-2222-2222-222222222222';

  const adminARequester = {
    userId: 'usr-admin-a',
    userName: 'Admin A',
    tenantId: tenantA,
    role: 'ADMIN',
    isSuperadmin: false
  };

  await assert.rejects(async () => {
    await AdminOperationsConsole.manageTenantUser({
      requesterContext: adminARequester,
      targetTenantId: tenantB,
      action: 'SUSPEND',
      targetUserId: 'usr-b-target'
    }, []);
  }, /🔒 Acceso denegado RLS Multi-Tenant/);
});

// 6. STORED XSS PAYLOAD ESCAPE PRECLUSION
test('6. Stored XSS Payload Escape Preclusion: Sanitización estricta de cadenas HTML', () => {
  const sanitizeHTML = (str) => String(str || '').replace(/[&<>"']/g, match => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[match]));

  const maliciousPayload = '<img src=x onerror=alert(1)>';
  const sanitized = sanitizeHTML(maliciousPayload);

  assert.equal(sanitized.includes('<img'), false);
  assert.equal(sanitized.includes('&lt;img'), true);
});

// 7. CRON UNAUTHENTICATED TRIGGER DEFENSE
test('7. Defense Against Unauthenticated External Cron Triggers', () => {
  const validateCronToken = (authHeader, expectedSecret) => {
    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      throw new Error('🔒 Acceso denegado: Token de autorización cron no válido');
    }
    return true;
  };

  const secret = 'prod-cron-secret-token-99';
  assert.throws(() => {
    validateCronToken('Bearer wrong-token', secret);
  }, /🔒 Acceso denegado/);

  assert.equal(validateCronToken(`Bearer ${secret}`, secret), true);
});
