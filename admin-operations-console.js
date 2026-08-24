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

  // 1. Bitácora de Auditoría Administrativa Inmutable (`admin_activity_log`)
  logAdminActivity({ actor_id, actor_name, tenant_id, action, entity_type, entity_id = null, before_data = null, after_data = null, metadata = {}, correlation_id = null }) {
    const entry = {
      id: `act-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      tenant_id,
      actor_user_id: actor_id,
      actor_name_snapshot: actor_name,
      action,
      entity_type,
      entity_id,
      before_data,
      after_data,
      metadata,
      correlation_id: correlation_id || `corr-${Date.now()}`,
      created_at: new Date().toISOString()
    };

    Object.freeze(entry);
    this.activityLog.push(entry);
    return entry;
  }

  getAdminActivityLogs(tenantId, limit = 50) {
    return this.activityLog
      .filter(l => l.tenant_id === tenantId)
      .slice(-limit)
      .reverse();
  }

  // Intentar un INSERT, UPDATE o DELETE directo sobre admin_activity_log desde cliente es DENEGADO
  attemptDirectAuditInsert() {
    throw new Error('🔒 Operación denegada en Supabase: ERROR 42501 (permission denied for table admin_activity_log). Direct INSERT/UPDATE/DELETE is REVOKED for anon and authenticated.');
  }

  mutateActivityLogEntry() {
    throw new Error('🔒 Operación denegada: La bitácora admin_activity_log es inmutable (REVOKE UPDATE, DELETE).');
  }

  // 2. Gestión Segura de Usuarios & Prevención de Escalada de Roles (Invocación RPC rpc_manage_tenant_user_saas)
  async manageTenantUser({ requesterContext, targetTenantId, action, targetUserId, newRole, name }, tenantUsersStore = []) {
    // 1. Zero Trust Client Validation
    if (!requesterContext || !requesterContext.userId) {
      throw new Error('🔒 Acceso denegado: Usuario no autenticado.');
    }

    const isSuperadmin = requesterContext.isSuperadmin || requesterContext.role === 'SUPERADMIN';
    if (!isSuperadmin && requesterContext.tenantId !== targetTenantId) {
      throw new Error('🔒 Acceso denegado RLS Multi-Tenant: ADMIN de Tenant A no puede modificar usuarios de Tenant B.');
    }

    if (requesterContext.role !== 'ADMIN' && !isSuperadmin) {
      throw new Error('🔒 Acceso denegado: Únicamente el ADMIN o SUPERADMIN puede gestionar la nómina de usuarios.');
    }

    // 2. Prevención de Escalada a SUPERADMIN por parte de un ADMIN local
    if (newRole === 'SUPERADMIN' && !isSuperadmin) {
      throw new Error('🔒 Operación denegada: Un ADMIN local no puede otorgar ni promover a un usuario al rol SUPERADMIN.');
    }

    // 3. Invocación backend real. La función vuelve a validar JWT, tenant y rol;
    // requesterContext nunca se usa como autoridad en el servidor.
    if (typeof window !== 'undefined' && window.supabaseClient) {
      const { data: sessionData, error: sessionError } = await window.supabaseClient.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) {
        throw new Error('🔒 La sesión expiró. Volvé a iniciar sesión.');
      }
      const response = await fetch('/.netlify/functions/manage-tenant-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session.access_token}`
        },
        body: JSON.stringify({
          targetTenantId,
          action,
          targetUserId,
          newRole,
          name
        })
      });
      let result = {};
      try {
        result = await response.json();
      } catch (parseError) {
        console.warn('La gestión de usuarios devolvió una respuesta sin JSON:', parseError);
      }
      if (!response.ok) throw new Error(`🔒 ${result.error || `Error de gestión (${response.status})`}`);
      return result;
    }

    // Fallback de Simulación Síncrona para Entorno Node Test / Server Offline
    let targetUser = tenantUsersStore.find(u => u.id === targetUserId || u.user_id === targetUserId);
    const beforeData = targetUser ? { ...targetUser } : null;

    if (action === 'INVITE' || action === 'CREATE') {
      targetUser = {
        id: targetUserId || `usr-${Date.now()}`,
        user_id: targetUserId || `usr-${Date.now()}`,
        tenant_id: targetTenantId,
        name: name || 'Nuevo Usuario',
        role: newRole || 'VENDEDOR',
        active: true
      };
      tenantUsersStore.push(targetUser);
    } else if (targetUser) {
      if (action === 'SUSPEND') targetUser.active = false;
      if (action === 'ACTIVATE') targetUser.active = true;
      if (action === 'CHANGE_ROLE' && newRole) targetUser.role = newRole;
      if (name) targetUser.name = name;
    }

    const afterData = targetUser ? { ...targetUser } : null;

    this.logAdminActivity({
      actor_id: requesterContext.userId,
      actor_name: requesterContext.userName,
      tenant_id: targetTenantId,
      action: `USER_${action}`,
      entity_type: 'USER',
      entity_id: targetUserId,
      before_data: beforeData,
      after_data: afterData,
      metadata: { requested_role: newRole }
    });

    return { success: true, user: targetUser };
  }

  // 3. Dashboard KPIs & Resumen Operativo
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

  // 4. Matriz RBAC para Secciones Administrativas
  checkAdminAccess(role, sectionKey) {
    const roleUpper = (role || 'VENDEDOR').toUpperCase();
    if (roleUpper === 'SUPERADMIN') return true;

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
      tenants_management: []
    };

    const allowedRoles = rbacMatrix[sectionKey] || [];
    return allowedRoles.includes(roleUpper);
  }

  // 5. Buscador Global Admin
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
