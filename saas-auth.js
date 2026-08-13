/* BÔ Grow Club - contexto SaaS validado contra Supabase Auth. */

const SAAS_TENANTS = [
  { id: '11111111-1111-1111-1111-111111111111', slug: 'boe-grow-club', name: 'BÔ Grow Club', status: 'ACTIVO' },
  { id: '22222222-2222-2222-2222-222222222222', slug: 'empresa-b-demo', name: 'Empresa B Demo', status: 'ACTIVO' }
];

const SAAS_ROLES = {
  SUPERADMIN: { name: 'Superadministrador', permissions: ['*'] },
  ADMIN: { name: 'Administrador', permissions: ['tenant.edit', 'wms.transfer', 'wms.audit', 'catalog.edit', 'sales.cash'] },
  SUPERVISOR: { name: 'Supervisor', permissions: ['wms.transfer', 'wms.audit', 'wms.approve', 'catalog.view'] },
  VENDEDOR: { name: 'Vendedor', permissions: ['wms.transfer', 'wms.view', 'sales.cash'] },
  DEPOSITO: { name: 'Operador de deposito', permissions: ['wms.transfer', 'wms.view'] }
};

const SAAS_STORAGE_KEYS = {
  TENANT_ID: 'boeweb_saas_active_tenant_id',
  USER_ROLE: 'boeweb_saas_user_role',
  USER_NAME: 'boeweb_saas_user_name',
  USER_EMAIL: 'boeweb_saas_user_email',
  LEGACY_VENDOR: 'boeweb_vendor_name'
};

function getSafeStorageItem(storage, key) {
  try {
    return storage?.getItem(key) || null;
  } catch (error) {
    return null;
  }
}

class SaasAuthEngine {
  constructor() {
    const local = typeof localStorage !== 'undefined' ? localStorage : null;
    const session = typeof sessionStorage !== 'undefined' ? sessionStorage : null;

    this.activeTenantId = SAAS_TENANTS[0].id;
    this.userId = null;
    this.userName = getSafeStorageItem(local, SAAS_STORAGE_KEYS.LEGACY_VENDOR)
      || getSafeStorageItem(session, SAAS_STORAGE_KEYS.LEGACY_VENDOR)
      || 'Vendedor BÔ';
    this.userEmail = '';
    this.userRole = 'VENDEDOR';
    this.verifiedSession = false;
    this.tenantUsers = [];
  }

  getTenantContext() {
    const tenant = SAAS_TENANTS.find(item => item.id === this.activeTenantId) || SAAS_TENANTS[0];
    const role = SAAS_ROLES[this.userRole] || SAAS_ROLES.VENDEDOR;
    const isSuperadmin = this.verifiedSession && this.userRole === 'SUPERADMIN';

    return {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      userId: this.userId,
      userName: this.userName,
      userEmail: this.userEmail,
      role: this.userRole,
      roleName: role.name,
      permissions: this.verifiedSession ? role.permissions : [],
      isSuperadmin,
      isVerified: this.verifiedSession
    };
  }

  getTenantUsers(tenantId = this.activeTenantId) {
    return this.tenantUsers.filter(user => user.tenant_id === tenantId && user.active !== false);
  }

  hasPermission(permissionKey) {
    const context = this.getTenantContext();
    if (!context.isVerified) return false;
    if (context.isSuperadmin || context.permissions.includes('*')) return true;
    return context.permissions.includes(permissionKey);
  }

  async hydrateFromSupabase(client) {
    if (!client?.auth || typeof client.auth.getUser !== 'function') return false;

    try {
      const { data: authData, error: authError } = await client.auth.getUser();
      const authUser = authData?.user;
      if (authError || !authUser) {
        this.resetVerifiedContext();
        return false;
      }

      const { data: membership, error: membershipError } = await client
        .from('tenant_users')
        .select('tenant_id,user_id,email,name,role,active')
        .eq('user_id', authUser.id)
        .eq('active', true)
        .limit(1)
        .maybeSingle();

      if (membershipError || !membership) {
        this.resetVerifiedContext();
        return false;
      }

      this.activeTenantId = membership.tenant_id;
      this.userId = authUser.id;
      this.userName = membership.name || authUser.email || 'Usuario BÔ';
      this.userEmail = membership.email || authUser.email || '';
      this.userRole = SAAS_ROLES[membership.role] ? membership.role : 'VENDEDOR';
      this.verifiedSession = true;
      this.tenantUsers = [{ ...membership, id: membership.user_id }];
      return true;
    } catch (error) {
      console.error('No se pudo validar la sesion SaaS:', error);
      this.resetVerifiedContext();
      return false;
    }
  }

  switchActiveTenant(newTenantId) {
    const context = this.getTenantContext();
    if (!context.isVerified || !context.isSuperadmin || newTenantId === context.tenantId) {
      console.warn('Cambio de empresa denegado: falta una sesion verificada de superadministrador.');
      return false;
    }

    const tenant = SAAS_TENANTS.find(item => item.id === newTenantId || item.slug === newTenantId);
    if (!tenant) return false;
    this.activeTenantId = tenant.id;
    return true;
  }

  loginAsUser() {
    console.warn('Inicio SaaS local deshabilitado: la identidad debe provenir de Supabase Auth.');
    return false;
  }

  resetVerifiedContext() {
    this.activeTenantId = SAAS_TENANTS[0].id;
    this.userId = null;
    this.userEmail = '';
    this.userRole = 'VENDEDOR';
    this.verifiedSession = false;
    this.tenantUsers = [];
  }

  logout() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SAAS_STORAGE_KEYS.USER_NAME);
      localStorage.removeItem(SAAS_STORAGE_KEYS.USER_EMAIL);
      localStorage.removeItem(SAAS_STORAGE_KEYS.USER_ROLE);
      localStorage.removeItem(SAAS_STORAGE_KEYS.TENANT_ID);
    }
    this.resetVerifiedContext();
    this.userName = 'Vendedor BÔ';
  }
}

const SaasAuth = new SaasAuthEngine();

if (typeof window !== 'undefined') {
  window.SaasAuth = SaasAuth;
  window.SAAS_TENANTS = SAAS_TENANTS;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SaasAuth, SAAS_TENANTS, SAAS_ROLES };
}
