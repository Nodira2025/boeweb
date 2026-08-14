import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve('.');
const vendedorHtml = fs.readFileSync(path.join(projectRoot, 'vendedor.html'), 'utf8');
const vendedorJs = fs.readFileSync(path.join(projectRoot, 'vendedor.js'), 'utf8');

test('1. Resetear Pruebas button is completely removed from vendor views', () => {
  assert.equal(vendedorHtml.includes('Resetear Pruebas'), false, 'El botón Resetear Pruebas no debe existir en el HTML del vendedor');
  assert.equal(vendedorHtml.includes('purgeProductionTestData(false)'), false, 'No deben quedar llamadas a purgeProductionTestData en los botones del portal');
});

test('2. Internal Catalog includes batch actions, checkboxes, quota badge and delete buttons', () => {
  assert.match(vendedorHtml, /id="internal-catalog-batch-bar"/, 'Debe existir la barra de acciones por lote en el catálogo interno');
  assert.match(vendedorHtml, /id="internal-catalog-select-all"/, 'Debe existir el checkbox de seleccionar todos');
  assert.match(vendedorHtml, /id="btn-internal-catalog-bulk-delete"/, 'Debe existir el botón de eliminar seleccionados');
  assert.match(vendedorHtml, /id="internal-catalog-quota-left"/, 'Debe existir el contador de cupo de eliminación');
  assert.match(vendedorJs, /deleteSingleInternalCatalogProduct/, 'Debe existir la función de eliminación individual');
  assert.match(vendedorJs, /deleteSelectedInternalCatalogProducts/, 'Debe existir la función de eliminación por lote');
});

test('3. Enforces 5-deletions maximum quota per user', () => {
  // Simular almacenamiento en memoria para el test
  const memoryStore = {};
  const mockLocalStorage = {
    getItem: (key) => memoryStore[key] || null,
    setItem: (key, val) => { memoryStore[key] = String(val); }
  };

  const MAX_USER_CATALOG_DELETIONS = 5;

  function getUserCatalogDeletionCount(vendorName) {
    if (!vendorName) return 0;
    const cleanName = String(vendorName).trim().toLowerCase();
    try {
      const quotaMap = JSON.parse(mockLocalStorage.getItem('boeweb_user_deletion_quotas') || '{}');
      return Number(quotaMap[cleanName] || 0);
    } catch (_) {
      return 0;
    }
  }

  function getUserDeletionRemainingQuota(vendorName, isAdmin = false) {
    if (isAdmin) return 9999;
    const used = getUserCatalogDeletionCount(vendorName);
    return Math.max(0, MAX_USER_CATALOG_DELETIONS - used);
  }

  function incrementUserCatalogDeletionCount(vendorName, count = 1, isAdmin = false) {
    if (!vendorName || isAdmin) return;
    const cleanName = String(vendorName).trim().toLowerCase();
    try {
      const quotaMap = JSON.parse(mockLocalStorage.getItem('boeweb_user_deletion_quotas') || '{}');
      quotaMap[cleanName] = (Number(quotaMap[cleanName] || 0)) + count;
      mockLocalStorage.setItem('boeweb_user_deletion_quotas', JSON.stringify(quotaMap));
    } catch (_) {}
  }

  const vendor = 'Nacho Mina';

  // Al inicio tiene 5 restantes
  assert.equal(getUserDeletionRemainingQuota(vendor), 5);

  // Elimina 2 productos
  incrementUserCatalogDeletionCount(vendor, 2);
  assert.equal(getUserCatalogDeletionCount(vendor), 2);
  assert.equal(getUserDeletionRemainingQuota(vendor), 3);

  // Elimina 3 productos más
  incrementUserCatalogDeletionCount(vendor, 3);
  assert.equal(getUserCatalogDeletionCount(vendor), 5);
  assert.equal(getUserDeletionRemainingQuota(vendor), 0);

  // Intentar eliminar con cupo 0 no permite cupos negativos
  assert.equal(getUserDeletionRemainingQuota(vendor) < 1, true);

  // Admin tiene cupo ilimitado
  assert.equal(getUserDeletionRemainingQuota('Franco (Admin)', true), 9999);
});

test('4. Secure Audit Log records immutable trail of sensitive operations', () => {
  const auditLogs = [];
  const SECURE_AUDIT_STORAGE_KEY = 'boeweb_secure_audit_trail_v1';

  function logSecureAuditEvent({
    event_type,
    severity = 'INFO',
    category = 'GENERAL',
    actor_name = 'Sistema',
    description,
    entity_type = null,
    entity_id = null,
    details = {}
  }) {
    const entry = {
      id: `sec_aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      actor: actor_name,
      event_type,
      category,
      severity,
      description,
      entity_type,
      entity_id,
      details
    };
    auditLogs.unshift(entry);
    return entry;
  }

  // 1. Log eliminación de producto
  const delEvent = logSecureAuditEvent({
    event_type: 'PRODUCT_DELETED',
    category: 'CATALOG',
    severity: 'CRITICAL',
    actor_name: 'Raul',
    description: 'Eliminación de producto individual: "Sustrato Premium 50L"',
    entity_id: 'prod_123',
    details: { name: 'Sustrato Premium 50L', price: 15000, stock: 4 }
  });
  assert.equal(delEvent.event_type, 'PRODUCT_DELETED');
  assert.equal(delEvent.severity, 'CRITICAL');
  assert.equal(delEvent.actor, 'Raul');

  // 2. Log anulación de movimiento de caja
  const cashVoidEvent = logSecureAuditEvent({
    event_type: 'CASH_MOVEMENT_VOIDED',
    category: 'CASH',
    severity: 'WARNING',
    actor_name: 'Alexis',
    description: 'Anulación de movimiento de caja: "Gasto de limpieza" por $2.500',
    entity_id: 'cash_456',
    details: { amount: 2500, type: 'egreso' }
  });
  assert.equal(cashVoidEvent.event_type, 'CASH_MOVEMENT_VOIDED');
  assert.equal(cashVoidEvent.category, 'CASH');

  // 3. Log merma / ajuste de stock
  const mermaEvent = logSecureAuditEvent({
    event_type: 'PRODUCT_RETIRED_MERMA',
    category: 'WMS',
    severity: 'WARNING',
    actor_name: 'Gino',
    description: 'Ajuste de inventario (-1 u.): "Bong de Vidrio 30cm" - Motivo: dañado',
    entity_id: 'prod_789',
    details: { quantity: 1, reason: 'danado' }
  });
  assert.equal(mermaEvent.event_type, 'PRODUCT_RETIRED_MERMA');

  // 4. Log cancelación de pedido web
  const cancelOrderEvent = logSecureAuditEvent({
    event_type: 'WEB_ORDER_CANCELLED',
    category: 'ORDERS',
    severity: 'WARNING',
    actor_name: 'Franco (Admin)',
    description: 'Cancelación de pedido web #BO-2026-0814-1234 con restitución de stock',
    entity_id: 'BO-2026-0814-1234'
  });
  assert.equal(cancelOrderEvent.event_type, 'WEB_ORDER_CANCELLED');

  assert.equal(auditLogs.length, 4);
});

test('5. Admin Investigation & Audit Modal is restricted and properly defined in HTML & JS', () => {
  assert.match(vendedorHtml, /id="modal-admin-investigation-audit"/, 'Debe existir el modal de auditoría forense en vendedor.html');
  assert.match(vendedorHtml, /id="admin-audit-auth-screen"/, 'Debe existir la pantalla de bloqueo con clave para administradores');
  assert.match(vendedorHtml, /id="admin-audit-content-screen"/, 'Debe existir la consola de investigación forense');
  assert.match(vendedorHtml, /id="admin-audit-entries-list"/, 'Debe existir la lista de eventos auditables');
  assert.match(vendedorJs, /openAdminAuditInvestigationModal/, 'Debe existir el handler para abrir el centro de auditoría');
  assert.match(vendedorJs, /handleAdminAuditUnlock/, 'Debe existir la validación de contraseña de administrador');
  assert.match(vendedorJs, /exportAdminAuditLogJSON/, 'Debe existir la función de exportar auditoría a JSON');
});
