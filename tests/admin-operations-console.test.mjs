import test from 'node:test';
import assert from 'node:assert/strict';
import { AdminOperationsConsole, ADMIN_ACTIVITY_LOG_STORE } from '../admin-operations-console.js';
import { SaasAuth } from '../saas-auth.js';
import { PosInventorySync } from '../pos-inventory-sync.js';

test('1. Dashboard Summary: Cálculo de KPIs Operativos (Ingresos, Operaciones, Cajas y Alertas)', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const todayIso = new Date().toISOString();

  const salesStore = [
    { id: 's1', tenant_id: tenantId, total: 35000, created_at: todayIso },
    { id: 's2', tenant_id: tenantId, total: 15000, created_at: todayIso },
    { id: 's3', tenant_id: '22222222-2222-2222-2222-222222222222', total: 99000, created_at: todayIso }
  ];

  const cashSessionsStore = [
    { id: 'sess1', tenant_id: tenantId, register_id: 'MAIN', opening_amount: 10000, status: 'OPEN' }
  ];

  const cashMovementsStore = [
    { session_id: 'sess1', tenant_id: tenantId, type: 'venta_efectivo', amount: 35000 },
    { session_id: 'sess1', tenant_id: tenantId, type: 'gasto', amount: 5000 }
  ];

  const balancesStore = [
    { tenant_id: tenantId, product_id: 'SKU-01', on_hand_sellable: 2 },
    { tenant_id: tenantId, product_id: 'SKU-02', on_hand_sellable: 20 }
  ];

  const summary = AdminOperationsConsole.getAdminDashboardSummary(
    tenantId, salesStore, cashSessionsStore, cashMovementsStore, [], balancesStore, [], []
  );

  assert.equal(summary.today_income, 50000);
  assert.equal(summary.today_operations, 2);
  assert.equal(summary.has_open_cash, true);
  assert.equal(summary.expected_cash, 40000);
  assert.equal(summary.low_stock_alerts, 1);
});

test('2. RBAC Admin Matrix: Verificación Estricta por Rol', () => {
  assert.equal(AdminOperationsConsole.checkAdminAccess('SUPERADMIN', 'tenants_management'), true);
  assert.equal(AdminOperationsConsole.checkAdminAccess('SUPERADMIN', 'users'), true);
  assert.equal(AdminOperationsConsole.checkAdminAccess('ADMIN', 'users'), true);
  assert.equal(AdminOperationsConsole.checkAdminAccess('ADMIN', 'company_profile'), true);
  assert.equal(AdminOperationsConsole.checkAdminAccess('ADMIN', 'tenants_management'), false);
  assert.equal(AdminOperationsConsole.checkAdminAccess('SUPERVISOR', 'wms'), true);
  assert.equal(AdminOperationsConsole.checkAdminAccess('SUPERVISOR', 'inventory'), true);
  assert.equal(AdminOperationsConsole.checkAdminAccess('SUPERVISOR', 'users'), false);
  assert.equal(AdminOperationsConsole.checkAdminAccess('VENDEDOR', 'users'), false);
  assert.equal(AdminOperationsConsole.checkAdminAccess('VENDEDOR', 'company_profile'), false);
});

test('3. Bitácora de Auditoría Administrativa (admin_activity_log) Persistente & Inmutable', () => {
  ADMIN_ACTIVITY_LOG_STORE.length = 0;
  const tenantId = '11111111-1111-1111-1111-111111111111';

  const entry = AdminOperationsConsole.logAdminActivity({
    actor_id: 'usr-franco',
    actor_name: 'Profesor Franco',
    tenant_id: tenantId,
    action: 'USER_ROLE_CHANGE',
    entity_type: 'USER',
    entity_id: 'usr-lautaro',
    metadata: { new_role: 'SUPERVISOR' }
  });

  const logs = AdminOperationsConsole.getAdminActivityLogs(tenantId);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, 'USER_ROLE_CHANGE');
  assert.equal(logs[0].actor_name_snapshot, 'Profesor Franco');
  assert.equal(logs[0].entity_id, 'usr-lautaro');

  assert.throws(() => {
    AdminOperationsConsole.mutateActivityLogEntry();
  }, /🔒 Operación denegada/);
});

test('4. Bloqueo de INSERT Directo en Audit Log desde Cliente Autenticado (Prueba 2)', () => {
  assert.throws(() => {
    AdminOperationsConsole.attemptDirectAuditInsert();
  }, /🔒 Operación denegada en Supabase: ERROR 42501/);
});

test('5. Seguridad Server-Side en Gestión de Usuarios: Denegación de Escalada a SUPERADMIN (Prueba 4)', async () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const tenantUsersStore = [
    { id: 'usr-01', user_id: 'usr-01', tenant_id: tenantId, name: 'Empleado Mostrador', role: 'VENDEDOR', active: true }
  ];

  const adminRequester = {
    userId: 'usr-admin-local',
    userName: 'Admin Local San Martín',
    tenantId: tenantId,
    role: 'ADMIN',
    isSuperadmin: false
  };

  await assert.rejects(async () => {
    await AdminOperationsConsole.manageTenantUser({
      requesterContext: adminRequester,
      targetTenantId: tenantId,
      action: 'CHANGE_ROLE',
      targetUserId: 'usr-01',
      newRole: 'SUPERADMIN'
    }, tenantUsersStore);
  }, /🔒 Operación denegada: Un ADMIN local no puede otorgar/);
});

test('6. Multi-Tenant Isolation en Gestión de Usuarios: ADMIN Tenant A NO altera Tenant B (Prueba 4)', async () => {
  const tenantA = '11111111-1111-1111-1111-111111111111';
  const tenantB = '22222222-2222-2222-2222-222222222222';

  const tenantUsersStore = [
    { id: 'usr-b', user_id: 'usr-b', tenant_id: tenantB, name: 'Empleado B', role: 'VENDEDOR', active: true }
  ];

  const adminARequester = {
    userId: 'usr-admin-a',
    userName: 'Admin Tenant A',
    tenantId: tenantA,
    role: 'ADMIN',
    isSuperadmin: false
  };

  await assert.rejects(async () => {
    await AdminOperationsConsole.manageTenantUser({
      requesterContext: adminARequester,
      targetTenantId: tenantB,
      action: 'SUSPEND',
      targetUserId: 'usr-b'
    }, tenantUsersStore);
  }, /🔒 Acceso denegado RLS Multi-Tenant/);
});

test('7. Operación Válida de Usuario por SUPERADMIN o ADMIN Autorizado Registra Audit Log (Prueba 4 & 6)', async () => {
  ADMIN_ACTIVITY_LOG_STORE.length = 0;
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const tenantUsersStore = [
    { id: 'usr-02', user_id: 'usr-02', tenant_id: tenantId, name: 'Lautaro', role: 'VENDEDOR', active: true }
  ];

  const superadminRequester = {
    userId: 'usr-superadmin',
    userName: 'Superadmin Plataforma',
    tenantId: tenantId,
    role: 'SUPERADMIN',
    isSuperadmin: true
  };

  const res = await AdminOperationsConsole.manageTenantUser({
    requesterContext: superadminRequester,
    targetTenantId: tenantId,
    action: 'CHANGE_ROLE',
    targetUserId: 'usr-02',
    newRole: 'SUPERVISOR'
  }, tenantUsersStore);

  assert.equal(res.success, true);
  assert.equal(tenantUsersStore[0].role, 'SUPERVISOR');

  const logs = AdminOperationsConsole.getAdminActivityLogs(tenantId);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, 'USER_CHANGE_ROLE');
  assert.equal(logs[0].actor_user_id, 'usr-superadmin');
  assert.equal(logs[0].entity_id, 'usr-02');
});

test('8. Buscador Global Admin: Coincidencias Filtradas por Tenant', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const productsStore = [
    { tenant_id: tenantId, name: 'BioBizz Bio Grow 1L', product_code: 'BIO-01' },
    { tenant_id: '22222222-2222-2222-2222-222222222222', name: 'BioBizz Bio Bloom 1L', product_code: 'BIO-02' }
  ];
  const salesStore = [
    { tenant_id: tenantId, id: 'sale-99', salesperson_name_snapshot: 'Lautaro' }
  ];

  const searchRes = AdminOperationsConsole.globalAdminSearch('Bio', tenantId, productsStore, salesStore, [], []);

  assert.equal(searchRes.products.length, 1);
  assert.equal(searchRes.products[0].product_code, 'BIO-01');
});
