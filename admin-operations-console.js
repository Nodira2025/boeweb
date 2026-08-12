/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — CONSOLA DE OPERACIONES ADMINISTRATIVAS (FASE 12)
   ==========================================================================
   Consola unificada para ADMIN y SUPERADMIN. Reutiliza 100% las APIs y esquemas
   certificados de Fases 8, 9, 10, 11A y 11B.
   ========================================================================== */

const ADMIN_ACTIVITY_LOG_STORE = [];

class AdminOperationsConsoleEngine {
  constructor() {
    this.activityLog = ADMIN_ACTIVITY_LOG_STORE;
  }

  // 1. Bitácora de Auditoría Administrativa Append-Only (`admin_activity_log`)
  logAdminActivity({ actor_id, actor_name, tenant_id, action, entity, entity_id = null, metadata = {} }) {
    const entry = {
      id: `act-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      actor_id,
      actor_name,
      tenant_id,
      action,
      entity,
      entity_id,
      metadata,
      timestamp: new Date().toISOString()
    };
    this.activityLog.push(entry);
    return entry;
  }

  getAdminActivityLogs(tenantId, limit = 50) {
    return this.activityLog
      .filter(l => l.tenant_id === tenantId)
      .slice(-limit)
      .reverse();
  }

  // 2. Dashboard KPIs & Resumen Operativo
  getAdminDashboardSummary(tenantId, salesStore = [], cashSessionsStore = [], cashMovementsStore = [], locationsStore = [], balancesStore = [], reservationsStore = [], tenantUsersStore = []) {
    const nowIso = new Date().toISOString();

    const tenantSales = salesStore.filter(s => s.tenant_id === tenantId);
    const todaySales = tenantSales.filter(s => s.created_at && s.created_at.substring(0, 10) === nowIso.substring(0, 10));

    const totalIncomeToday = todaySales.reduce((sum, s) => sum + Number(s.total || 0), 0);
    const operationsCountToday = todaySales.length;

    const openCashSession = cashSessionsStore.find(s => s.tenant_id === tenantId && s.status === 'OPEN');
    let expectedCash = 0;
    if (openCashSession && typeof PosInventorySync !== 'undefined') {
      const summary = PosInventorySync.getCashSessionSummary(openCashSession.id, tenantId, cashSessionsStore, cashMovementsStore);
      expectedCash = summary.expected_cash;
    }

    const activeReservations = reservationsStore.filter(r => r.tenant_id === tenantId && r.status === 'ACTIVE' && r.expires_at > nowIso);
    const activeUsers = (tenantUsersStore.length > 0 ? tenantUsersStore : (typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantUsers(tenantId) : [])).filter(u => u.active !== false);

    // Conteo de items con stock bajo (< 5 u.)
    let lowStockCount = 0;
    if (balancesStore.length > 0) {
      lowStockCount = balancesStore.filter(b => b.tenant_id === tenantId && Number(b.on_hand_sellable || 0) < 5).length;
    }

    return {
      today_income: totalIncomeToday,
      today_operations: operationsCountToday,
      expected_cash: expectedCash,
      has_open_cash: !!openCashSession,
      open_session_id: openCashSession ? openCashSession.id : null,
      active_reservations: activeReservations.length,
      active_users: activeUsers.length,
      low_stock_alerts: lowStockCount
    };
  }

  // 3. Matriz RBAC para Secciones Administrativas
  checkAdminAccess(role, sectionKey) {
    const roleUpper = (role || 'VENDEDOR').toUpperCase();
    if (roleUpper === 'SUPERADMIN') return true; // Acceso total

    const rbacMatrix = {
      dashboard: ['ADMIN', 'SUPERVISOR'],
      sales: ['ADMIN', 'SUPERVISOR'],
      returns: ['ADMIN', 'SUPERVISOR'],
      cash: ['ADMIN'],
      inventory: ['ADMIN', 'SUPERVISOR'],
      reservations: ['ADMIN', 'SUPERVISOR'],
      wms: ['ADMIN', 'SUPERVISOR', 'DEPOSITO'],
      audits: ['ADMIN', 'SUPERVISOR'],
      products: ['ADMIN', 'SUPERVISOR'],
      public_catalog: ['ADMIN'],
      suppliers: ['ADMIN'],
      migrations: ['ADMIN'],
      users: ['ADMIN'],
      company_profile: ['ADMIN'],
      business_config: ['ADMIN'],
      tenants_management: [] // Únicamente SUPERADMIN
    };

    const allowedRoles = rbacMatrix[sectionKey] || [];
    return allowedRoles.includes(roleUpper);
  }

  // 4. Buscador Global Admin
  globalAdminSearch(query, tenantId, productsStore = [], salesStore = [], usersStore = [], suppliersStore = []) {
    if (!query || query.trim().length < 2) return { products: [], sales: [], users: [], suppliers: [] };
    const q = query.toLowerCase().trim();

    const products = productsStore.filter(p => 
      (p.tenant_id === tenantId || !p.tenant_id) && 
      ((p.name || '').toLowerCase().includes(q) || (p.product_code || '').toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q))
    ).slice(0, 5);

    const sales = salesStore.filter(s => 
      s.tenant_id === tenantId && 
      ((s.id || '').toLowerCase().includes(q) || (s.idempotency_key || '').toLowerCase().includes(q) || (s.salesperson_name_snapshot || '').toLowerCase().includes(q))
    ).slice(0, 5);

    const users = (usersStore.length > 0 ? usersStore : (typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantUsers(tenantId) : [])).filter(u => 
      (u.name || '').toLowerCase().includes(q) || (u.role || '').toLowerCase().includes(q)
    ).slice(0, 5);

    const suppliers = suppliersStore.filter(sup => 
      (sup.name || sup.supplier_code || '').toLowerCase().includes(q)
    ).slice(0, 5);

    return { products, sales, users, suppliers };
  }
}

const AdminOperationsConsole = new AdminOperationsConsoleEngine();

if (typeof window !== 'undefined') {
  window.AdminOperationsConsole = AdminOperationsConsole;
  window.ADMIN_ACTIVITY_LOG_STORE = ADMIN_ACTIVITY_LOG_STORE;
}
if (typeof global !== 'undefined') {
  global.AdminOperationsConsole = AdminOperationsConsole;
  global.ADMIN_ACTIVITY_LOG_STORE = ADMIN_ACTIVITY_LOG_STORE;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AdminOperationsConsole, ADMIN_ACTIVITY_LOG_STORE };
}
