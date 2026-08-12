/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — GESTOR WHITE-LABEL, TERMINOLOGÍA Y TEMAS
   ========================================================================== */

const DEFAULT_TERMINOLOGY = {
  product: 'Producto',
  products: 'Productos',
  vendor: 'Vendedor',
  warehouse: 'Depósito'
};

const TENANT_PROFILES_CACHE = {
  '11111111-1111-1111-1111-111111111111': {
    tenant_id: '11111111-1111-1111-1111-111111111111',
    brand_name: 'BÔ Grow Club',
    slogan: 'Espacio Zen para Cultivo Premium',
    logo_url: 'assets/logo.jpg',
    favicon_url: 'assets/favicon.ico',
    primary_color: '#152D24',
    accent_color: '#C2A246',
    theme_mode: 'dark',
    vertical_code: 'growshop',
    terminology: { product: 'Producto Botánico', products: 'Productos Botánicos', vendor: 'Asesor de Cultivo', warehouse: 'Depósito Principal' },
    published_branding: { brand_name: 'BÔ Grow Club', primary_color: '#152D24', accent_color: '#C2A246', vertical_code: 'growshop' },
    draft_branding: {}
  },
  '22222222-2222-2222-2222-222222222222': {
    tenant_id: '22222222-2222-2222-2222-222222222222',
    brand_name: 'Empresa B Demo (Ferretería Norte)',
    slogan: 'Soluciones Industriales y Herramientas',
    logo_url: 'assets/logo.jpg',
    favicon_url: 'assets/favicon.ico',
    primary_color: '#0052CC',
    accent_color: '#FF9800',
    theme_mode: 'light',
    vertical_code: 'ferreteria',
    terminology: { product: 'Artículo de Ferretería', products: 'Artículos de Ferretería', vendor: 'Cajero', warehouse: 'Almacén Central' },
    published_branding: { brand_name: 'Empresa B Demo (Ferretería Norte)', primary_color: '#0052CC', accent_color: '#FF9800', vertical_code: 'ferreteria' },
    draft_branding: {}
  }
};

class TenantThemeManager {
  getProfile(tenantId) {
    return TENANT_PROFILES_CACHE[tenantId] || TENANT_PROFILES_CACHE['11111111-1111-1111-1111-111111111111'];
  }

  // Helper centralizado de traducción conceptual y terminología (t('product'))
  t(key, tenantId, fallback = null) {
    const profile = this.getProfile(tenantId);
    const termMap = profile.terminology || {};
    return termMap[key] || fallback || DEFAULT_TERMINOLOGY[key] || key;
  }

  // Reset total para eliminar residuales del tenant anterior al alternar como Superadmin
  resetActiveTheme() {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.removeProperty('--color-brand-primary');
    root.style.removeProperty('--color-brand-accent');
    root.style.removeProperty('--vendor-forest');
    root.style.removeProperty('--vendor-gold');
  }

  applyTenantTheme(tenantId) {
    if (typeof document === 'undefined') return;
    this.resetActiveTheme(); // Limpieza total de residuales

    const profile = this.getProfile(tenantId);
    const root = document.documentElement;

    // Inyectar variables CSS de marca White-Label
    root.style.setProperty('--color-brand-primary', profile.primary_color);
    root.style.setProperty('--color-brand-accent', profile.accent_color);
    root.style.setProperty('--vendor-forest', profile.primary_color);
    root.style.setProperty('--vendor-gold', profile.accent_color);

    // Actualizar elementos de marca
    const brandElements = document.querySelectorAll('.saas-brand-name-display');
    brandElements.forEach(el => { el.textContent = profile.brand_name; });

    // Aplicar terminología personalizada por tenant
    const termProduct = this.t('product', tenantId);
    const termVendor = this.t('vendor', tenantId);
    const termWarehouse = this.t('warehouse', tenantId);

    document.querySelectorAll('.saas-term-product').forEach(el => { el.textContent = termProduct; });
    document.querySelectorAll('.saas-term-vendor').forEach(el => { el.textContent = termVendor; });
    document.querySelectorAll('.saas-term-warehouse').forEach(el => { el.textContent = termWarehouse; });

    console.log(`[TenantTheme] Tema e Identidad White-Label aplicados para ${profile.brand_name} (${profile.vertical_code}): Color ${profile.primary_color}`);
  }

  // Previsualización en Vivo de Borrador (Draft Preview)
  previewDraftTheme(draftData) {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    if (draftData.primary_color) root.style.setProperty('--vendor-forest', draftData.primary_color);
    if (draftData.accent_color) root.style.setProperty('--vendor-gold', draftData.accent_color);

    const previewNameEl = document.getElementById('tenant-preview-brand-name');
    if (previewNameEl && draftData.brand_name) {
      previewNameEl.textContent = draftData.brand_name;
    }
  }

  saveDraft(tenantId, draftData) {
    const profile = this.getProfile(tenantId);
    profile.draft_branding = { ...profile.draft_branding, ...draftData };
    return profile;
  }

  cancelDraft(tenantId) {
    const profile = this.getProfile(tenantId);
    profile.draft_branding = {};
    this.applyTenantTheme(tenantId);
    return profile;
  }

  publishBranding(tenantId) {
    const profile = this.getProfile(tenantId);
    if (profile.draft_branding && Object.keys(profile.draft_branding).length > 0) {
      profile.published_branding = { ...profile.draft_branding };
      profile.brand_name = profile.draft_branding.brand_name || profile.brand_name;
      profile.primary_color = profile.draft_branding.primary_color || profile.primary_color;
      profile.accent_color = profile.draft_branding.accent_color || profile.accent_color;
      profile.vertical_code = profile.draft_branding.vertical_code || profile.vertical_code;
      profile.draft_branding = {};
    }
    this.applyTenantTheme(tenantId);
    return profile;
  }
}

const TenantTheme = new TenantThemeManager();

if (typeof window !== 'undefined') {
  window.TenantTheme = TenantTheme;
  window.TENANT_PROFILES_CACHE = TENANT_PROFILES_CACHE;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TenantTheme, TENANT_PROFILES_CACHE };
}
