/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — MOTOR DE ONBOARDING WIZARD MULTI-TENANT
   ========================================================================== */

const ONBOARDING_SESSIONS_CACHE = [];

class TenantOnboardingEngine {
  constructor() {
    this.activeSession = null;
  }

  // Inicializa o reanuda una sesión de onboarding
  initSession(createdBy = 'Profesor Franco', existingSessionId = null) {
    if (existingSessionId) {
      const found = ONBOARDING_SESSIONS_CACHE.find(s => s.id === existingSessionId);
      if (found) {
        this.activeSession = found;
        return this.activeSession;
      }
    }

    this.activeSession = {
      id: `onb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${Math.floor(Math.random()*10000)}`,
      tenant_id: null,
      created_by: createdBy,
      step_current: 1,
      status: 'DRAFT',
      company_data: { name: '', slug: '', email: '', country: 'Argentina', currency: 'ARS' },
      vertical_data: { code: 'growshop', name: 'Growshop' },
      identity_data: { brand_name: '', slogan: '', theme_color: '#152d24' },
      catalog_data: { mode: 'EMPTY', job_id: null },
      supplier_data: { suppliers: [] },
      stock_data: { mode: 'NONE' },
      users_data: { admin_email: '', admin_name: '', users: [] },
      wms_data: { enabled: false, warehouse_name: 'Depósito Principal' },
      checklist_result: { valid: false, errors: [] },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    ONBOARDING_SESSIONS_CACHE.push(this.activeSession);
    return this.activeSession;
  }

  // Guarda los datos del paso activo y avanza el cursor de forma persistente e idempotente
  saveStepData(stepNumber, data) {
    if (!this.activeSession) this.initSession();

    this.activeSession.step_current = Math.max(this.activeSession.step_current, stepNumber);
    this.activeSession.status = 'IN_PROGRESS';
    this.activeSession.updated_at = new Date().toISOString();

    switch (stepNumber) {
      case 1:
        this.activeSession.company_data = { ...this.activeSession.company_data, ...data };
        if (this.activeSession.company_data.name && !this.activeSession.company_data.slug) {
          this.activeSession.company_data.slug = this.activeSession.company_data.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
        }
        break;
      case 2:
        this.activeSession.vertical_data = { ...this.activeSession.vertical_data, ...data };
        break;
      case 3:
        this.activeSession.identity_data = { ...this.activeSession.identity_data, ...data };
        break;
      case 4:
        this.activeSession.catalog_data = { ...this.activeSession.catalog_data, ...data };
        break;
      case 5:
        this.activeSession.supplier_data = { ...this.activeSession.supplier_data, ...data };
        break;
      case 6:
        this.activeSession.stock_data = { ...this.activeSession.stock_data, ...data };
        break;
      case 7:
        this.activeSession.users_data = { ...this.activeSession.users_data, ...data };
        break;
      case 8:
        this.activeSession.wms_data = { ...this.activeSession.wms_data, ...data };
        break;
    }

    return this.activeSession;
  }

  // Validador de Checklist Pre-Activación (Server-side & Local)
  runPreactivationChecklist(existingTenants = []) {
    if (!this.activeSession) return { valid: false, errors: ['No existe sesión activa'] };

    const errors = [];
    const comp = this.activeSession.company_data;
    const vert = this.activeSession.vertical_data;
    const users = this.activeSession.users_data;
    const wms = this.activeSession.wms_data;

    // 1. Validar Slug Único (Ignorando si el tenant ya es el activo)
    if (!comp.slug) {
      errors.push('El slug del negocio es obligatorio.');
    } else {
      const slugExists = existingTenants.some(t => t.slug === comp.slug.toLowerCase().trim() && t.id !== this.activeSession.tenant_id);
      if (slugExists) {
        errors.push(`El slug comercial "${comp.slug}" ya está en uso por otra empresa.`);
      }
    }

    // 2. Validar Nombre Comercial
    if (!comp.name || comp.name.trim().length < 2) {
      errors.push('El nombre del negocio debe tener al menos 2 caracteres.');
    }

    // 3. Validar Business Vertical
    if (!vert.code) {
      errors.push('Debe seleccionarse un rubro comercial válido.');
    }

    // 4. Validar Admin Principal
    if (!users.admin_email || !users.admin_email.includes('@')) {
      errors.push('Se requiere un Email válido para el Administrador Principal.');
    }

    // 5. Validar Consistencia WMS
    if (wms.enabled && (!wms.warehouse_name || wms.warehouse_name.trim().length === 0)) {
      errors.push('Si la gestión WMS está habilitada, el nombre del depósito principal es obligatorio.');
    }

    const isValid = errors.length === 0;
    this.activeSession.checklist_result = {
      valid: isValid,
      errors,
      checked_at: new Date().toISOString()
    };

    if (isValid && this.activeSession.status !== 'ACTIVE') {
      this.activeSession.status = 'READY_TO_ACTIVATE';
    }

    return this.activeSession.checklist_result;
  }

  // Activación Idempotente (SETUP -> ACTIVE)
  activateTenant(existingTenants = []) {
    const checklist = this.runPreactivationChecklist(existingTenants);
    if (!checklist.valid) {
      return { success: false, errors: checklist.errors };
    }

    // Idempotencia: Verificar si el tenant ya existe por slug o tenant_id
    const existingTenant = existingTenants.find(t => (this.activeSession.tenant_id && t.id === this.activeSession.tenant_id) || (t.slug === this.activeSession.company_data.slug));

    if (existingTenant) {
      existingTenant.status = 'ACTIVE';
      this.activeSession.tenant_id = existingTenant.id;
      this.activeSession.status = 'ACTIVE';
      this.activeSession.activated_at = new Date().toISOString();
      return { success: true, tenant: existingTenant, session: this.activeSession, idempotency: true };
    }

    const newTenantId = this.activeSession.tenant_id || `t-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    const newTenant = {
      id: newTenantId,
      name: this.activeSession.company_data.name,
      slug: this.activeSession.company_data.slug,
      status: 'ACTIVE',
      vertical_code: this.activeSession.vertical_data.code,
      created_at: new Date().toISOString(),
      wms_enabled: this.activeSession.wms_data.enabled
    };

    existingTenants.push(newTenant);
    this.activeSession.tenant_id = newTenantId;
    this.activeSession.status = 'ACTIVE';
    this.activeSession.activated_at = new Date().toISOString();

    return {
      success: true,
      tenant: newTenant,
      session: this.activeSession
    };
  }

  // Suspensión y Reactivación de Tenants
  toggleTenantLifecycleStatus(tenantId, newStatus, existingTenants = []) {
    const target = existingTenants.find(t => t.id === tenantId);
    if (!target) return { success: false, error: 'Tenant no encontrado' };

    target.status = newStatus; // 'SETUP', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'
    return { success: true, tenant: target };
  }

  // Cancelación limpia de onboarding
  cancelSession() {
    if (!this.activeSession) return { success: false };
    this.activeSession.status = 'CANCELLED';
    this.activeSession.updated_at = new Date().toISOString();
    return { success: true, session: this.activeSession };
  }
}

const TenantOnboarding = new TenantOnboardingEngine();

if (typeof window !== 'undefined') {
  window.TenantOnboarding = TenantOnboarding;
  window.ONBOARDING_SESSIONS_CACHE = ONBOARDING_SESSIONS_CACHE;
}
if (typeof global !== 'undefined') {
  global.TenantOnboarding = TenantOnboarding;
  global.ONBOARDING_SESSIONS_CACHE = ONBOARDING_SESSIONS_CACHE;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TenantOnboarding, ONBOARDING_SESSIONS_CACHE };
}
