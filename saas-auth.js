/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — MOTOR DE AUTENTICACIÓN & TENANT CONTEXT
   ========================================================================== */

const SAAS_TENANTS = [
  { id: '11111111-1111-1111-1111-111111111111', slug: 'boe-grow-club', name: 'BÔ Grow Club', status: 'ACTIVO' },
  { id: '22222222-2222-2222-2222-222222222222', slug: 'empresa-b-demo', name: 'Empresa B Demo (Ferretería Norte)', status: 'ACTIVO' }
];

const SAAS_ROLES = {
  SUPERADMIN: { name: 'Superadministrador', permissions: ['*'] },
  ADMIN: { name: 'Administrador de Empresa', permissions: ['tenant.edit', 'wms.transfer', 'wms.audit', 'catalog.edit', 'sales.cash'] },
  SUPERVISOR: { name: 'Supervisor de Depósito', permissions: ['wms.transfer', 'wms.audit', 'wms.approve', 'catalog.view'] },
  VENDEDOR: { name: 'Vendedor', permissions: ['wms.transfer', 'wms.view', 'sales.cash'] },
  DEPOSITO: { name: 'Operador de Depósito', permissions: ['wms.transfer', 'wms.view'] }
};

const SAAS_STORAGE_KEYS = {
  TENANT_ID: 'boeweb_saas_active_tenant_id',
  USER_ROLE: 'boeweb_saas_user_role',
  USER_NAME: 'boeweb_saas_user_name',
  USER_EMAIL: 'boeweb_saas_user_email',
  LEGACY_VENDOR: 'boeweb_vendor_name'
};

class SaasAuthEngine {
  constructor() {
    const getSafeItem = (storage, key) => {
      try {
        return (typeof window !== 'undefined' || typeof global !== 'undefined') && storage ? storage.getItem(key) : null;
      } catch (e) {
        return null;
      }
    };

    const ls = typeof localStorage !== 'undefined' ? localStorage : null;
    const ss = typeof sessionStorage !== 'undefined' ? sessionStorage : null;

    this.activeTenantId = getSafeItem(ls, SAAS_STORAGE_KEYS.TENANT_ID) || '11111111-1111-1111-1111-111111111111';
    this.userName = getSafeItem(ls, SAAS_STORAGE_KEYS.USER_NAME) || 
                    getSafeItem(ls, SAAS_STORAGE_KEYS.LEGACY_VENDOR) || 
                    getSafeItem(ss, SAAS_STORAGE_KEYS.LEGACY_VENDOR) || 
                    'Vendedor BÔ';
    this.userEmail = getSafeItem(ls, SAAS_STORAGE_KEYS.USER_EMAIL) || 'vendedor@boeweb.com';
    this.userRole = getSafeItem(ls, SAAS_STORAGE_KEYS.USER_ROLE) || 'VENDEDOR'; // Rol sin privilegios por defecto
  }

  getTenantContext() {
    const tenant = SAAS_TENANTS.find(t => t.id === this.activeTenantId) || SAAS_TENANTS[0];
    const roleObj = SAAS_ROLES[this.userRole] || SAAS_ROLES.VENDEDOR;

    return {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      userId: `usr-${this.userName.toLowerCase().replace(/\s+/g, '-')}`,
      userName: this.userName,
      userEmail: this.userEmail,
      role: this.userRole,
      roleName: roleObj.name,
      permissions: roleObj.permissions,
      isSuperadmin: this.userRole === 'SUPERADMIN'
    };
  }

  hasPermission(permissionKey) {
    const ctx = this.getTenantContext();
    if (ctx.role === 'SUPERADMIN' || ctx.permissions.includes('*')) return true;
    return ctx.permissions.includes(permissionKey);
  }

  switchActiveTenant(newTenantId) {
    const ctx = this.getTenantContext();
    if (!ctx.isSuperadmin && newTenantId !== ctx.tenantId) {
      console.warn('🔒 Acceso denegado: Únicamente el Superadmin autenticado puede alternar entre empresas.');
      return false;
    }
    const tenant = SAAS_TENANTS.find(t => t.id === newTenantId || t.slug === newTenantId);
    if (!tenant) return false;

    this.activeTenantId = tenant.id;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SAAS_STORAGE_KEYS.TENANT_ID, tenant.id);
    }
    console.log(`[SaaS Context] Cambio de tenant activo a: ${tenant.name} (${tenant.id})`);
    
    if (typeof window !== 'undefined' && typeof window.renderWmsModulesGrid === 'function') {
      window.renderWmsModulesGrid();
    }
    if (typeof window !== 'undefined' && typeof window.updateSaasHeaderUI === 'function') {
      window.updateSaasHeaderUI();
    }
    return true;
  }

  loginAsUser(name, email, role, tenantId) {
    this.userName = name;
    this.userEmail = email;
    this.userRole = role;
    if (tenantId) this.activeTenantId = tenantId;

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SAAS_STORAGE_KEYS.USER_NAME, name);
      localStorage.setItem(SAAS_STORAGE_KEYS.USER_EMAIL, email);
      localStorage.setItem(SAAS_STORAGE_KEYS.USER_ROLE, role);
      localStorage.setItem(SAAS_STORAGE_KEYS.TENANT_ID, this.activeTenantId);
      localStorage.setItem(SAAS_STORAGE_KEYS.LEGACY_VENDOR, name);
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SAAS_STORAGE_KEYS.LEGACY_VENDOR, name);
    }

    if (typeof window !== 'undefined' && typeof window.updateSaasHeaderUI === 'function') {
      window.updateSaasHeaderUI();
    }
    return this.getTenantContext();
  }

  logout() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SAAS_STORAGE_KEYS.USER_NAME);
      localStorage.removeItem(SAAS_STORAGE_KEYS.USER_EMAIL);
      localStorage.removeItem(SAAS_STORAGE_KEYS.USER_ROLE);
      localStorage.removeItem(SAAS_STORAGE_KEYS.LEGACY_VENDOR);
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(SAAS_STORAGE_KEYS.LEGACY_VENDOR);
    }
    
    this.activeTenantId = '11111111-1111-1111-1111-111111111111';
    this.userName = 'Vendedor BÔ';
    this.userEmail = 'vendedor@boeweb.com';
    this.userRole = 'VENDEDOR';
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
