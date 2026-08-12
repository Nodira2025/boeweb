/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — GESTOR WHITE-LABEL & TEMAS DINÁMICOS
   ========================================================================== */

const TENANT_PROFILES_CACHE = {
  '11111111-1111-1111-1111-111111111111': {
    tenant_id: '11111111-1111-1111-1111-111111111111',
    brand_name: 'BÔ Grow Club',
    slogan: 'Espacio Zen para Cultivo Premium',
    logo_url: 'assets/logo.jpg',
    primary_color: '#152D24',
    accent_color: '#C2A246',
    theme_mode: 'dark',
    vertical_code: 'growshop',
    terminology: { product_label: 'Producto Botánico', vendor_label: 'Asesor de Cultivo', deposit_label: 'Depósito Principal' },
    published_branding: { brand_name: 'BÔ Grow Club', primary_color: '#152D24', accent_color: '#C2A246', vertical_code: 'growshop' },
    draft_branding: {}
  },
  '22222222-2222-2222-2222-222222222222': {
    tenant_id: '22222222-2222-2222-2222-222222222222',
    brand_name: 'Empresa B Demo (Ferretería Norte)',
    slogan: 'Soluciones Industriales y Herramientas',
    logo_url: 'assets/logo.jpg',
    primary_color: '#0052CC',
    accent_color: '#FF9800',
    theme_mode: 'light',
    vertical_code: 'ferreteria',
    terminology: { product_label: 'Artículo de Ferretería', vendor_label: 'Cajero', deposit_label: 'Almacén Central' },
    published_branding: { brand_name: 'Empresa B Demo (Ferretería Norte)', primary_color: '#0052CC', accent_color: '#FF9800', vertical_code: 'ferreteria' },
    draft_branding: {}
  }
};

class TenantThemeManager {
  getProfile(tenantId) {
    return TENANT_PROFILES_CACHE[tenantId] || TENANT_PROFILES_CACHE['11111111-1111-1111-1111-111111111111'];
  }

  applyTenantTheme(tenantId) {
    if (typeof document === 'undefined') return;
    const profile = this.getProfile(tenantId);
    const root = document.documentElement;

    // Inyectar variables CSS de marca White-Label
    root.style.setProperty('--color-brand-primary', profile.primary_color);
    root.style.setProperty('--color-brand-accent', profile.accent_color);
    root.style.setProperty('--vendor-forest', profile.primary_color);
    root.style.setProperty('--vendor-gold', profile.accent_color);

    // Actualizar nombre de la marca en logos y textos
    const brandElements = document.querySelectorAll('.saas-brand-name-display');
    brandElements.forEach(el => { el.textContent = profile.brand_name; });

    // Aplicar terminología personalizada por tenant
    const term = profile.terminology || {};
    const prodLabels = document.querySelectorAll('.saas-term-product');
    prodLabels.forEach(el => { el.textContent = term.product_label || 'Producto'; });

    console.log(`[TenantTheme] Tema White-Label aplicado para ${profile.brand_name} (${profile.vertical_code}): Color ${profile.primary_color}`);
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
