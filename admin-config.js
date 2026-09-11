// Initialize Supabase Client
const SUPABASE_URL = 'https://sxbhrgvizqylnfcqzhin.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4YmhyZ3ZpenF5bG5mY3F6aGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMjM1MzEsImV4cCI6MjA5Njg5OTUzMX0.UUOwXsHXKNCjlJKdxMUlAuCtNAnNWgAroBwMlWAdTag';

let supabaseClient = null;
if (window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Config state. Authorization is always derived from Supabase Auth + tenant membership.
let currentBrandLogoDataUrl = null;
let heroSlidesState = [];
let heroSliderActive = true;
let adminTenantContext = null;
let appConfigRepository = null;
let appConfigDirtyTrackingReady = false;
let adminConfigBusy = false;
const busyControls = new Map();
const DEFAULT_ADMIN_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_CONFIG_PAGES = Object.freeze({
  marca: {
    title: 'Marca e identidad',
    description: 'Personalizá la apariencia, los textos y la identidad comercial.'
  },
  sitio: {
    title: 'Contenido del sitio',
    description: 'Editá portada, servicios, contacto y pie. Los cambios se ven en la tienda al publicar.'
  },
  operacion: {
    title: 'Catálogo y reglas',
    description: 'Definí la exposición del catálogo y los límites operativos de la tienda.'
  },
  pagos: {
    title: 'Pagos y cobros',
    description: 'Administrá únicamente los datos públicos de cada medio de pago.'
  }
});

const DEFAULT_HERO_SLIDES = [
  {
    id: 'slide-default-1',
    type: 'image',
    media_url: 'assets/hero-banner1.jpg',
    title: 'Cultivo Premium & Equilibrio',
    subtitle: 'Asesoramiento experto, catálogo seleccionado y entrega rápida',
    target_url: '#catalog-section',
    cta_text: 'Ver Catálogo',
    duration_seconds: 5,
    overlay_enabled: true
  },
  {
    id: 'slide-default-2',
    type: 'video',
    media_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    title: 'Lanzamientos de Temporada',
    subtitle: 'Conocé las últimas novedades y promociones exclusivas',
    target_url: '#catalog-section',
    cta_text: 'Ver Novedades',
    duration_seconds: 8,
    overlay_enabled: true
  }
];

function setAdminAuthStatus(message, isError = false) {
  const status = document.getElementById('admin-auth-status');
  if (!status) return;
  status.textContent = message;
  status.style.color = isError ? '#F6F3E8' : '#C2A246';
}

function getAdminTenantId() {
  return adminTenantContext?.tenantId || window.AppConfig?.resolveTenantId?.() || DEFAULT_ADMIN_TENANT_ID;
}

function getLegacyPaymentStorageKeys() {
  const keys = [`boeweb:payment-config:${getAdminTenantId()}`];
  if (getAdminTenantId() === DEFAULT_ADMIN_TENANT_ID) keys.push('boeweb_payment_config');
  return keys;
}

function readLegacyPaymentConfig() {
  for (const key of getLegacyPaymentStorageKeys()) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const sanitized = window.AppConfig?.sanitizeClientConfig(parsed) || {};
      if (JSON.stringify(parsed) !== JSON.stringify(sanitized)) localStorage.removeItem(key);
      return sanitized;
    } catch (error) {
      localStorage.removeItem(key);
      console.warn('Se descartó una configuración local heredada inválida.', error);
    }
  }
  return {};
}

function clearLegacyPaymentConfig() {
  getLegacyPaymentStorageKeys().forEach(key => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('No se pudo retirar una configuración local heredada.', error);
    }
  });
}

async function authorizeAdminSession() {
  const checkButton = document.getElementById('admin-session-check');
  if (checkButton) checkButton.disabled = true;
  setAdminAuthStatus('Verificando identidad y membresía…');
  try {
    localStorage.removeItem('boeweb_admin_passcode');
  } catch (error) {
    console.warn('No se pudo limpiar la clave local heredada.', error);
  }

  try {
    if (!supabaseClient || !window.SaasAuth?.hydrateFromSupabase) {
      throw new Error('El servicio de autenticación no está disponible.');
    }

    const hydrated = await window.SaasAuth.hydrateFromSupabase(supabaseClient);
    const context = window.SaasAuth.getTenantContext();
    const hasAdminRole = hydrated && context.isVerified && ['ADMIN', 'SUPERADMIN'].includes(context.role);
    if (!hasAdminRole) {
      throw new Error('Necesitás una sesión verificada con rol ADMIN o SUPERADMIN.');
    }

    adminTenantContext = context;
    appConfigRepository = window.AppConfig?.createRepository({
      tenantId: context.tenantId,
      supabaseClient,
      requireRemoteWrites: true,
      requireRemoteReads: true
    }) || null;

    document.getElementById('admin-login-modal').hidden = true;
    document.getElementById('admin-login-modal').style.display = 'none';
    setAdminConfigBusy(true);
    document.getElementById('admin-dashboard-content').style.display = 'block';
    await loadCentralAdminConfig();
  } catch (error) {
    adminTenantContext = null;
    const gate = document.getElementById('admin-login-modal');
    const dashboard = document.getElementById('admin-dashboard-content');
    if (gate) {
      gate.hidden = false;
      gate.style.display = 'grid';
    }
    if (dashboard) dashboard.style.display = 'none';
    setAdminAuthStatus(error.message || 'No se pudo verificar la sesión.', true);
  } finally {
    setAdminConfigBusy(false);
    if (checkButton) checkButton.disabled = false;
  }
}

async function handleAdminSessionLogin(event) {
  event.preventDefault();
  const emailInput = document.getElementById('admin-session-email');
  const passwordInput = document.getElementById('admin-session-password');
  const submitButton = document.getElementById('admin-session-login');
  if (!emailInput || !passwordInput || !event.currentTarget.reportValidity()) return;

  if (submitButton) submitButton.disabled = true;
  setAdminAuthStatus('Iniciando sesión segura…');
  try {
    if (!supabaseClient || !window.SaasAuth?.signInWithSupabase) {
      throw new Error('El servicio de autenticación no está disponible.');
    }
    const result = await window.SaasAuth.signInWithSupabase(
      supabaseClient,
      emailInput.value.trim(),
      passwordInput.value
    );
    if (!result.success) throw new Error(result.error || 'No se pudo iniciar sesión.');
    passwordInput.value = '';
    await authorizeAdminSession();
  } catch (error) {
    passwordInput.value = '';
    setAdminAuthStatus(error.message || 'No se pudo iniciar sesión.', true);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function loadCentralAdminConfig() {
  // All sections edit the same publication; capture draft and published baselines before enabling saves.
  const repository = window.AppConfig.createRepository({
    tenantId: getAdminTenantId(), supabaseClient, requireRemoteWrites: true, requireRemoteReads: true
  });
  const published = await repository.loadPublished();
  await repository.loadDraft();
  appConfigRepository = repository;
  window.boeAdminConfigEditing = true;
  await Promise.all([loadAdminConfig(published), loadBrandConfig(published)]);
}

async function loadAdminConfig(config = null) {
  let payments = window.AppConfig?.DEFAULT_CONFIG.payments;
  try {
    if (!appConfigRepository || !window.AppConfig) throw new Error('AppConfig no está disponible.');
    const publishedConfig = config || await appConfigRepository.loadPublished();
    payments = publishedConfig.payments;
    if (!config && publishedConfig.revision === 0) {
      const legacy = readLegacyPaymentConfig();
      if (Object.keys(legacy).length) {
        payments = window.AppConfig.normalizeConfig(legacy, { tenantId: getAdminTenantId() }).payments;
      }
    }
  } catch (error) {
    console.warn('No se pudo cargar la configuración pública de pagos; se usan valores seguros.', error);
  }

  // Populate UI inputs
  document.getElementById('mp-active-toggle').checked = payments.mercadoPago.enabled;
  document.getElementById('mp-public-key').value = payments.mercadoPago.publicKey;
  document.getElementById('bank-active-toggle').checked = payments.bankTransfer.enabled;
  document.getElementById('bank-name').value = payments.bankTransfer.bankName;
  document.getElementById('bank-holder').value = payments.bankTransfer.accountHolder;
  document.getElementById('bank-cbu').value = payments.bankTransfer.cbu;
  document.getElementById('bank-alias').value = payments.bankTransfer.alias;
}

async function loadBrandConfig(managedConfig = null) {
  let brand = null;
  try {
    brand = JSON.parse(localStorage.getItem('boeweb_tenant_profile_published') || 'null');
  } catch (_) {}

  if (!brand && typeof TENANT_PROFILES_CACHE !== 'undefined') {
    brand = TENANT_PROFILES_CACHE[getAdminTenantId()];
  }

  if (appConfigRepository) {
    try {
      managedConfig = managedConfig || await appConfigRepository.loadPublished();
      brand = appConfigToLegacyBrand(managedConfig);
    } catch (error) {
      console.warn('No se pudo cargar la configuración versionada; se mantiene el perfil compatible.', error);
    }
  }

  // Fallback defaults
  const bName = brand?.brand_name || 'BÔ Grow Club';
  const bSlogan = brand?.slogan || 'Espacio Zen para Cultivo Premium';
  const bVertical = brand?.vertical_code || 'growshop';
  const bPrimary = brand?.primary_color || '#152D24';
  const bAccent = brand?.accent_color || '#C2A246';
  const bTextColor = brand?.text_color || '#152D24';
  const bActionColor = brand?.action_color || '#2E7D32';
  const bFontFamily = brand?.font_family || "'Outfit', sans-serif";
  const bFontHeadings = brand?.font_headings || "'Playfair Display', serif";
  const bLogo = brand?.logo_url || 'assets/logo.jpg';
  const bTermProduct = brand?.terminology?.product || 'Producto Botánico';
  const bTermVendor = brand?.terminology?.vendor || 'Asesor de Cultivo';
  const bTermWarehouse = brand?.terminology?.warehouse || 'Depósito Principal';
  const bWhatsapp = brand?.whatsapp_phone || '';
  const bInstagram = brand?.instagram_url || '';
  const bAddress = brand?.address || '';

  // Set values to DOM
  const nameEl = document.getElementById('brand-name-input');
  if (nameEl) nameEl.value = bName;

  const sloganEl = document.getElementById('brand-slogan-input');
  if (sloganEl) sloganEl.value = bSlogan;

  const verticalEl = document.getElementById('brand-vertical-select');
  if (verticalEl) verticalEl.value = bVertical;

  const fontFamEl = document.getElementById('brand-font-family');
  if (fontFamEl) fontFamEl.value = bFontFamily;

  const fontHeadEl = document.getElementById('brand-font-headings');
  if (fontHeadEl) fontHeadEl.value = bFontHeadings;

  const primColorEl = document.getElementById('brand-primary-color');
  const primHexEl = document.getElementById('brand-primary-color-hex');
  if (primColorEl) primColorEl.value = bPrimary;
  if (primHexEl) primHexEl.value = bPrimary;

  const accColorEl = document.getElementById('brand-accent-color');
  const accHexEl = document.getElementById('brand-accent-color-hex');
  if (accColorEl) accColorEl.value = bAccent;
  if (accHexEl) accHexEl.value = bAccent;

  const textColEl = document.getElementById('brand-text-color');
  const textHexEl = document.getElementById('brand-text-color-hex');
  if (textColEl) textColEl.value = bTextColor;
  if (textHexEl) textHexEl.value = bTextColor;

  const actColEl = document.getElementById('brand-action-color');
  const actHexEl = document.getElementById('brand-action-color-hex');
  if (actColEl) actColEl.value = bActionColor;
  if (actHexEl) actHexEl.value = bActionColor;

  const termProdEl = document.getElementById('brand-term-product');
  if (termProdEl) termProdEl.value = bTermProduct;

  const termVendEl = document.getElementById('brand-term-vendor');
  if (termVendEl) termVendEl.value = bTermVendor;

  const termWhEl = document.getElementById('brand-term-warehouse');
  if (termWhEl) termWhEl.value = bTermWarehouse;

  const waEl = document.getElementById('brand-whatsapp-input');
  if (waEl) waEl.value = bWhatsapp;

  const igEl = document.getElementById('brand-instagram-input');
  if (igEl) igEl.value = bInstagram;

  const addrEl = document.getElementById('brand-address-input');
  if (addrEl) addrEl.value = bAddress;

  const logoImgEl = document.getElementById('brand-logo-preview-img');
  if (logoImgEl) logoImgEl.src = bLogo;

  currentBrandLogoDataUrl = bLogo;

  // Load hero slides & state
  try {
    if (managedConfig && brand?.hero_slides && Array.isArray(brand.hero_slides)) {
      heroSlidesState = brand.hero_slides;
    } else {
      const savedSlides = localStorage.getItem('boeweb_hero_slides');
      heroSlidesState = savedSlides ? JSON.parse(savedSlides)
        : (Array.isArray(brand?.hero_slides) ? brand.hero_slides : [...DEFAULT_HERO_SLIDES]);
    }
  } catch (_) {
    heroSlidesState = [...DEFAULT_HERO_SLIDES];
  }

  heroSliderActive = managedConfig
    ? managedConfig.brand.hero.enabled
    : brand?.hero_slider_active !== false;
  const toggleSlider = document.getElementById('hero-slider-active-toggle');
  if (toggleSlider) toggleSlider.checked = heroSliderActive;

  renderHeroSlidesManager();
  loadSiteContentControls(managedConfig || window.AppConfig.normalizeConfig());
  updateBrandLivePreview();
  loadFutureAppConfigControls(managedConfig || window.AppConfig?.normalizeConfig(brand || {}, { tenantId: getAdminTenantId() }));
}

function applyBrandColorPreset(primaryColor, accentColor, verticalCode, sampleName = '', sampleSlogan = '', textColor = '#152D24', actionColor = '#2E7D32', fontFamily = "'Outfit', sans-serif", fontHeadings = "'Playfair Display', serif") {
  const primColorEl = document.getElementById('brand-primary-color');
  const primHexEl = document.getElementById('brand-primary-color-hex');
  if (primColorEl) primColorEl.value = primaryColor;
  if (primHexEl) primHexEl.value = primaryColor;

  const accColorEl = document.getElementById('brand-accent-color');
  const accHexEl = document.getElementById('brand-accent-color-hex');
  if (accColorEl) accColorEl.value = accentColor;
  if (accHexEl) accHexEl.value = accentColor;

  const textColEl = document.getElementById('brand-text-color');
  const textHexEl = document.getElementById('brand-text-color-hex');
  if (textColEl) textColEl.value = textColor;
  if (textHexEl) textHexEl.value = textColor;

  const actColEl = document.getElementById('brand-action-color');
  const actHexEl = document.getElementById('brand-action-color-hex');
  if (actColEl) actColEl.value = actionColor;
  if (actHexEl) actHexEl.value = actionColor;

  const fontFamEl = document.getElementById('brand-font-family');
  if (fontFamEl && fontFamily) fontFamEl.value = fontFamily;

  const fontHeadEl = document.getElementById('brand-font-headings');
  if (fontHeadEl && fontHeadings) fontHeadEl.value = fontHeadings;

  const verticalEl = document.getElementById('brand-vertical-select');
  if (verticalEl && verticalCode) {
    verticalEl.value = verticalCode;
    handleBrandVerticalChange(verticalCode);
  }

  if (sampleName) {
    const nameEl = document.getElementById('brand-name-input');
    if (nameEl) nameEl.value = sampleName;
  }

  if (sampleSlogan) {
    const sloganEl = document.getElementById('brand-slogan-input');
    if (sloganEl) sloganEl.value = sampleSlogan;
  }

  updateBrandLivePreview();
}

function updateBrandColorInputs(type) {
  const map = {
    primary: ['brand-primary-color', 'brand-primary-color-hex'],
    accent: ['brand-accent-color', 'brand-accent-color-hex'],
    text: ['brand-text-color', 'brand-text-color-hex'],
    action: ['brand-action-color', 'brand-action-color-hex']
  };
  const ids = map[type];
  if (ids) {
    const picker = document.getElementById(ids[0]);
    const hex = document.getElementById(ids[1]);
    if (picker && hex) hex.value = picker.value.toUpperCase();
  }
  updateBrandLivePreview();
}

function updateBrandColorPickers(type) {
  const map = {
    primary: ['brand-primary-color', 'brand-primary-color-hex'],
    accent: ['brand-accent-color', 'brand-accent-color-hex'],
    text: ['brand-text-color', 'brand-text-color-hex'],
    action: ['brand-action-color', 'brand-action-color-hex']
  };
  const ids = map[type];
  if (ids) {
    const picker = document.getElementById(ids[0]);
    const hex = document.getElementById(ids[1]);
    if (picker && hex && /^#[0-9A-F]{6}$/i.test(hex.value.trim())) {
      picker.value = hex.value.trim();
    }
  }
  updateBrandLivePreview();
}

function handleBrandVerticalChange(verticalCode) {
  const verticalMap = {
    growshop: { product: 'Producto Botánico', vendor: 'Asesor de Cultivo', warehouse: 'Depósito Principal' },
    ferreteria: { product: 'Artículo de Ferretería', vendor: 'Cajero / Mostrador', warehouse: 'Almacén Central' },
    repuestos: { product: 'Repuesto / Pieza', vendor: 'Asesor de Mostrador', warehouse: 'Depósito Autopartes' },
    indumentaria: { product: 'Prenda / Artículo', vendor: 'Asesor de Moda', warehouse: 'Depósito de Stock' }
  };

  const defaults = verticalMap[verticalCode] || verticalMap.growshop;
  const termProd = document.getElementById('brand-term-product');
  const termVend = document.getElementById('brand-term-vendor');
  const termWh = document.getElementById('brand-term-warehouse');

  if (termProd) termProd.value = defaults.product;
  if (termVend) termVend.value = defaults.vendor;
  if (termWh) termWh.value = defaults.warehouse;

  updateBrandLivePreview();
}

function handleBrandLogoFileSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
  if (!allowedTypes.has(file.type) || file.size > 2_000_000) {
    event.target.value = '';
    updateAppConfigStatus('El logo debe ser PNG, JPG o WebP y pesar como máximo 2 MB.', true);
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    currentBrandLogoDataUrl = e.target.result;
    const previewImg = document.getElementById('brand-logo-preview-img');
    const thumbImg = document.getElementById('preview-logo-thumb');
    if (previewImg) previewImg.src = currentBrandLogoDataUrl;
    if (thumbImg) thumbImg.src = currentBrandLogoDataUrl;
    updateAppConfigStatus('Cambios sin guardar');
  };
  reader.onerror = () => updateAppConfigStatus('No se pudo leer el archivo de logo.', true);
  reader.readAsDataURL(file);
}

function toggleHeroSliderActive(checked) {
  heroSliderActive = checked;
  updateBrandLivePreview();
}

function addHeroSlide(type = 'image') {
  if (heroSlidesState.length >= 8) {
    updateAppConfigStatus('La portada admite hasta ocho banners o videos.', true);
    return;
  }
  const isVideo = type === 'video';
  const newSlide = {
    id: 'slide-' + Date.now(),
    type: type,
    media_url: isVideo ? '' : 'assets/logo.jpg',
    title: isVideo ? 'Nuevo Video Promocional' : 'Nuevo Banner de Ofertas',
    subtitle: 'Texto descriptivo o promoción destacada',
    target_url: '#catalog-section',
    cta_text: 'Ver',
    duration_seconds: isVideo ? 8 : 5,
    overlay_enabled: true
  };
  heroSlidesState.push(newSlide);
  renderHeroSlidesManager();
  updateBrandLivePreview();
}

function removeHeroSlide(index) {
  if (index >= 0 && index < heroSlidesState.length) {
    heroSlidesState.splice(index, 1);
    renderHeroSlidesManager();
    updateBrandLivePreview();
  }
}

function moveHeroSlide(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= heroSlidesState.length) return;
  const temp = heroSlidesState[index];
  heroSlidesState[index] = heroSlidesState[targetIndex];
  heroSlidesState[targetIndex] = temp;
  renderHeroSlidesManager();
  updateBrandLivePreview();
}

function updateHeroSlide(index, field, value) {
  if (heroSlidesState[index]) {
    heroSlidesState[index][field] = value;
    updateBrandLivePreview();
  }
}

function handleHeroSlideFileUpload(index, event) {
  const file = event.target.files?.[0];
  if (!file || !heroSlidesState[index]) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 500_000) {
    event.target.value = '';
    updateAppConfigStatus('Usá una imagen PNG, JPG o WebP de hasta 500 KB, o pegá una URL HTTPS.', true);
    return;
  }
  const slideId = heroSlidesState[index].id;

  const reader = new FileReader();
  reader.onload = (e) => {
    const target = heroSlidesState.find(slide => slide.id === slideId);
    if (!target) return;
    target.media_url = e.target.result;
    renderHeroSlidesManager();
    updateBrandLivePreview();
  };
  reader.onerror = () => updateAppConfigStatus('No se pudo leer la imagen. El banner anterior se conserva.', true);
  reader.readAsDataURL(file);
}

function escapeAdminHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function loadSiteContentControls(config) {
  const container = document.getElementById('site-content-fields');
  if (!container) return;
  const fields = window.AppConfig.SITE_CONTENT_FIELDS;
  container.innerHTML = [...new Set(fields.map(field => field.group))].map(group => `
    <fieldset class="app-config-panel"><legend>${escapeAdminHtml(group)}</legend><div class="site-content-grid">
      ${fields.filter(field => field.group === group).map(field => `<div class="app-config-field">
        <label for="site-${field.key}">${escapeAdminHtml(field.label)}</label>
        <textarea id="site-${field.key}" maxlength="${field.maxLength}" rows="${field.maxLength > 180 ? 3 : 2}"></textarea>
      </div>`).join('')}
    </div></fieldset>`).join('');
  fields.forEach(field => { document.getElementById(`site-${field.key}`).value = config.brand.content[field.key]; });
  setControlValue('site-home-enabled', config.brand.content.homeEnabled, 'checked');
  setControlValue('site-contact-enabled', config.brand.content.contactEnabled, 'checked');
  setControlValue('brand-facebook-input', config.brand.texts.facebookUrl);
  setControlValue('brand-maps-input', config.brand.texts.mapsUrl);
  updateSiteContentPreview();
}

function collectSiteContent() {
  return {
    ...Object.fromEntries(window.AppConfig.SITE_CONTENT_FIELDS.map(field => [field.key,
      document.getElementById(`site-${field.key}`)?.value ?? field.defaultValue])),
    homeEnabled: document.getElementById('site-home-enabled')?.checked ?? true,
    contactEnabled: document.getElementById('site-contact-enabled')?.checked ?? true
  };
}

function updateSiteContentPreview() {
  const content = collectSiteContent();
  document.querySelectorAll('[data-site-preview]').forEach(element => {
    element.textContent = content[element.getAttribute('data-site-preview')] || '';
  });
}

function validateAdminHero() {
  for (const [index, slide] of heroSlidesState.entries()) {
    if (window.AppConfig.getHeroMedia(slide).kind === 'invalid') {
      throw new Error(`Banner ${index + 1}: ingresá una imagen, un enlace de YouTube o un video directo .mp4/.webm.`);
    }
  }
}

function renderHeroSlidesManager() {
  const container = document.getElementById('hero-slides-container');
  if (!container) return;

  if (heroSlidesState.length === 0) {
    container.innerHTML = `
      <div style="background: rgba(0,0,0,0.25); border: 2px dashed rgba(195,155,75,0.4); border-radius: 12px; padding: 20px; text-align: center; color: rgba(247,246,242,0.7);">
        <p style="margin: 0 0 8px 0; font-size: 0.9rem;">No hay banners configurados aún.</p>
        <small>Hacé clic en los botones de abajo para agregar imágenes o videos al carrusel.</small>
      </div>
    `;
    return;
  }

  container.innerHTML = heroSlidesState.map((source, idx) => {
    const slide = { ...source };
    ['media_url', 'title', 'subtitle', 'target_url', 'cta_text'].forEach(key => { slide[key] = escapeAdminHtml(source[key]); });
    const isVideo = slide.type === 'video';
    return `
      <div class="hero-slide-editor-card" style="background: rgba(15, 30, 24, 0.85); border: 1.5px solid rgba(195, 155, 75, 0.3); border-radius: 12px; padding: 16px; position: relative;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(195, 155, 75, 0.2); padding-bottom: 8px; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="background: ${isVideo ? '#0288D1' : '#E65100'}; color: #fff; padding: 2px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 800;">
              ${isVideo ? '🎬 VIDEO' : '🖼️ IMAGEN'}
            </span>
            <strong style="color: #ffd54f; font-size: 0.88rem;">Slide #${idx + 1}</strong>
          </div>
          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn btn-secondary" onclick="moveHeroSlide(${idx}, -1)" ${idx === 0 ? 'disabled' : ''} style="padding: 4px 8px; font-size: 0.75rem; border-color: rgba(195, 155, 75, 0.4);" title="Mover arriba">⬆️</button>
            <button type="button" class="btn btn-secondary" onclick="moveHeroSlide(${idx}, 1)" ${idx === heroSlidesState.length - 1 ? 'disabled' : ''} style="padding: 4px 8px; font-size: 0.75rem; border-color: rgba(195, 155, 75, 0.4);" title="Mover abajo">⬇️</button>
            <button type="button" class="btn btn-secondary" onclick="removeHeroSlide(${idx})" style="padding: 4px 8px; font-size: 0.75rem; border-color: #d32f2f; color: #ff5252;" title="Eliminar slide">🗑️</button>
          </div>
        </div>

        <div class="hero-editor-grid">
          <!-- Tipo y Archivo / URL -->
          <div>
            <label class="admin-label" style="font-size: 0.8rem; margin-bottom: 4px;">Tipo de Contenido:</label>
            <select aria-label="Banner ${idx + 1}: tipo" class="admin-input" style="font-weight: 700; margin-bottom: 10px;" onchange="updateHeroSlide(${idx}, 'type', this.value); renderHeroSlidesManager();">
              <option value="image" ${slide.type === 'image' ? 'selected' : ''}>🖼️ Imagen (PNG / JPG / WebP)</option>
              <option value="video" ${slide.type === 'video' ? 'selected' : ''}>🎬 Video (YouTube / MP4 / WebM)</option>
            </select>

            <label class="admin-label" style="font-size: 0.8rem; margin-bottom: 4px;">URL o Archivo Multimedia:</label>
            <input aria-label="Banner ${idx + 1}: recurso" type="text" class="admin-input" value="${slide.media_url || ''}" placeholder="${isVideo ? 'https://youtu.be/... o https://.../video.mp4' : 'URL HTTPS de la imagen'}" oninput="updateHeroSlide(${idx}, 'media_url', this.value)" style="margin-bottom: 8px;">
            
            ${!isVideo ? `
              <div style="display: flex; align-items: center; gap: 8px;">
                <input aria-label="Banner ${idx + 1}: subir imagen (máximo 500 KB)" type="file" accept="image/png,image/jpeg,image/webp" class="admin-input" style="padding: 6px; font-size: 0.75rem;" onchange="handleHeroSlideFileUpload(${idx}, event)">
              </div>
            ` : `
              <small style="color: rgba(247,246,242,0.6); font-size: 0.72rem; display: block; line-height: 1.3;">
                YouTube se reproduce con sus controles y no avanza automáticamente. MP4/WebM se muestran sin sonido. El video debe ser público y permitir inserción.
              </small>
            `}
          </div>

          <!-- Textos y CTA -->
          <div>
            <label class="admin-label" style="font-size: 0.8rem; margin-bottom: 4px;">Título del Banner (Opcional):</label>
            <input aria-label="Banner ${idx + 1}: título" type="text" maxlength="140" class="admin-input" value="${slide.title || ''}" placeholder="Ej: Gran Oferta de Temporada" oninput="updateHeroSlide(${idx}, 'title', this.value)" style="margin-bottom: 8px;">

            <label class="admin-label" style="font-size: 0.8rem; margin-bottom: 4px;">Subtítulo / Bajada:</label>
            <input aria-label="Banner ${idx + 1}: subtítulo" type="text" maxlength="240" class="admin-input" value="${slide.subtitle || ''}" placeholder="Ej: Hasta 30% OFF en productos seleccionados" oninput="updateHeroSlide(${idx}, 'subtitle', this.value)">
          </div>

          <!-- Redirección y Tiempo -->
          <div>
            <label class="admin-label" style="font-size: 0.8rem; margin-bottom: 4px;">Enlace de Destino al Tocar / Clic:</label>
            <input aria-label="Banner ${idx + 1}: destino" type="text" class="admin-input" value="${slide.target_url || ''}" placeholder="Ej: #catalog-section, link de WhatsApp o web" oninput="updateHeroSlide(${idx}, 'target_url', this.value)" style="margin-bottom: 8px;">

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div>
                <label class="admin-label" style="font-size: 0.8rem; margin-bottom: 4px;">Texto del Botón:</label>
                <input aria-label="Banner ${idx + 1}: botón" type="text" maxlength="60" class="admin-input" value="${slide.cta_text || 'Ver'}" placeholder="Ej: Ver" oninput="updateHeroSlide(${idx}, 'cta_text', this.value)">
              </div>
              <div>
                <label class="admin-label" style="font-size: 0.8rem; margin-bottom: 4px;">Tiempo en Foco (seg):</label>
                <input aria-label="Banner ${idx + 1}: duración" type="number" min="2" max="60" class="admin-input" value="${slide.duration_seconds || 5}" oninput="updateHeroSlide(${idx}, 'duration_seconds', parseInt(this.value) || 5)">
              </div>
            </div>
            <label class="app-config-toggle"><strong>Sombra detrás del texto</strong><input type="checkbox" ${source.overlay_enabled !== false ? 'checked' : ''} onchange="updateHeroSlide(${idx}, 'overlay_enabled', this.checked)"></label>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function updateBrandLivePreview() {
  if (appConfigDirtyTrackingReady && !adminConfigBusy) updateAppConfigStatus('Cambios sin guardar');
  const name = document.getElementById('brand-name-input')?.value.trim() || 'BÔ Grow Club';
  const slogan = document.getElementById('brand-slogan-input')?.value.trim() || 'Espacio Zen para Cultivo Premium';
  const primaryColor = document.getElementById('brand-primary-color')?.value || '#152D24';
  const accentColor = document.getElementById('brand-accent-color')?.value || '#C2A246';
  const textColor = document.getElementById('brand-text-color')?.value || '#152D24';
  const actionColor = document.getElementById('brand-action-color')?.value || '#2E7D32';
  const fontFamily = document.getElementById('brand-font-family')?.value || "'Outfit', sans-serif";
  const fontHeadings = document.getElementById('brand-font-headings')?.value || "'Playfair Display', serif";
  const termProduct = document.getElementById('brand-term-product')?.value.trim() || 'Producto Botánico';
  const whatsapp = document.getElementById('brand-whatsapp-input')?.value.trim() || '+5493816123456';

  const previewCanvas = document.getElementById('brand-preview-canvas');
  const previewBar = document.getElementById('preview-header-bar');
  const previewName = document.getElementById('preview-brand-name');
  const previewSlogan = document.getElementById('preview-brand-slogan');
  const previewBtn = document.getElementById('preview-sample-btn');
  const previewBadge = document.getElementById('preview-term-product-badge');
  const previewThumb = document.getElementById('preview-logo-thumb');
  const previewWhatsappText = document.getElementById('preview-whatsapp-text');
  const previewContactBox = document.getElementById('preview-contact-box');
  const previewSamplePrice = document.getElementById('preview-sample-price');

  if (previewCanvas) {
    previewCanvas.style.fontFamily = fontFamily;
  }
  if (previewBar) previewBar.style.background = primaryColor;
  if (previewName) {
    previewName.textContent = name;
    previewName.style.fontFamily = fontHeadings;
  }
  if (previewSlogan) previewSlogan.textContent = slogan;
  if (previewBadge) previewBadge.textContent = termProduct;
  if (previewBtn) {
    previewBtn.style.background = accentColor;
    previewBtn.style.color = window.AppConfig.getReadableForeground(accentColor);
  }
  if (previewSamplePrice) {
    previewSamplePrice.style.color = actionColor;
  }
  if (previewContactBox) {
    previewContactBox.style.borderColor = actionColor;
  }
  if (previewThumb && currentBrandLogoDataUrl) {
    previewThumb.src = currentBrandLogoDataUrl;
  }
  if (previewWhatsappText) {
    previewWhatsappText.textContent = `💬 WhatsApp: ${whatsapp}`;
  }

  // Update Hero Banner preview
  const bannerBox = document.getElementById('preview-hero-banner-box');
  const bannerImg = document.getElementById('preview-hero-banner-img');
  const bannerVideo = document.getElementById('preview-hero-banner-video');
  const bannerYoutube = document.getElementById('preview-hero-banner-youtube');
  const bannerTitle = document.getElementById('preview-hero-banner-title');
  const bannerSubtitle = document.getElementById('preview-hero-banner-subtitle');
  const bannerCta = document.getElementById('preview-hero-banner-cta');

  if (bannerBox) {
    if (!heroSliderActive || heroSlidesState.length === 0) {
      bannerBox.style.display = 'none';
      bannerYoutube?.removeAttribute('src');
      bannerVideo?.pause();
    } else {
      bannerBox.style.display = 'flex';
      const firstSlide = heroSlidesState[0];
      if (firstSlide) {
        if (bannerTitle) bannerTitle.textContent = firstSlide.title || name;
        if (bannerSubtitle) bannerSubtitle.textContent = firstSlide.subtitle || slogan;
        if (bannerCta) bannerCta.textContent = firstSlide.cta_text || 'Ver';

        const media = window.AppConfig.getHeroMedia(firstSlide);
        const overlay = document.getElementById('preview-hero-banner-overlay');
        if (overlay) overlay.style.display = media.kind === 'youtube' ? 'none' : 'flex';
        bannerBox.style.height = media.kind === 'youtube' ? '240px' : '150px';
        for (const [element, kind] of [[bannerImg, 'image'], [bannerVideo, 'video'], [bannerYoutube, 'youtube']]) {
          if (!element) continue;
          element.style.display = media.kind === kind ? 'block' : 'none';
          if (media.kind === kind) {
            if (element.getAttribute('src') !== media.src) element.src = media.src;
          } else {
            element.removeAttribute('src');
            if (kind === 'video') element.pause();
          }
        }
      }
    }
  }
  if (previewName) previewName.style.color = window.AppConfig.getReadableForeground(primaryColor);
  if (previewSlogan) previewSlogan.style.color = window.AppConfig.getReadableForeground(primaryColor);
}

function appConfigToLegacyBrand(config) {
  const normalized = window.AppConfig.normalizeConfig(config, { tenantId: getAdminTenantId() });
  const visuals = normalized.brand.visuals;
  const texts = normalized.brand.texts;
  const hero = normalized.brand.hero;
  return {
    tenant_id: normalized.tenantId,
    vertical_code: normalized.brand.verticalCode,
    brand_name: texts.name,
    slogan: texts.slogan,
    primary_color: visuals.primaryColor,
    accent_color: visuals.accentColor,
    text_color: visuals.textColor,
    action_color: visuals.actionColor,
    font_family: visuals.fontFamily,
    font_headings: visuals.headingFont,
    logo_url: visuals.logoUrl,
    favicon_url: visuals.faviconUrl,
    whatsapp_phone: texts.whatsapp,
    instagram_url: texts.instagram,
    address: texts.address,
    hero_slider_active: hero.enabled,
    hero_slides: hero.slides.map(slide => ({
      id: slide.id,
      type: slide.type,
      media_url: slide.mediaUrl,
      title: slide.title,
      subtitle: slide.subtitle,
      target_url: slide.targetUrl,
      cta_text: slide.ctaText,
      duration_seconds: slide.durationSeconds,
      overlay_enabled: slide.overlayEnabled
    })),
    terminology: {
      product: texts.productTerm,
      vendor: texts.vendorTerm,
      warehouse: texts.warehouseTerm
    }
  };
}

function collectLegacyBrandProfile() {
  return {
    tenant_id: getAdminTenantId(),
    brand_name: document.getElementById('brand-name-input')?.value.trim() || 'BÔ Grow Club',
    slogan: document.getElementById('brand-slogan-input')?.value.trim() || '',
    vertical_code: document.getElementById('brand-vertical-select')?.value || 'growshop',
    font_family: document.getElementById('brand-font-family')?.value || "'Outfit', sans-serif",
    font_headings: document.getElementById('brand-font-headings')?.value || "'Playfair Display', serif",
    primary_color: document.getElementById('brand-primary-color')?.value || '#152D24',
    accent_color: document.getElementById('brand-accent-color')?.value || '#C2A246',
    text_color: document.getElementById('brand-text-color')?.value || '#152D24',
    action_color: document.getElementById('brand-action-color')?.value || '#2E7D32',
    logo_url: currentBrandLogoDataUrl || 'assets/logo.jpg',
    favicon_url: 'assets/logo.jpg',
    hero_slider_active: heroSliderActive,
    hero_slides: heroSlidesState,
    whatsapp_phone: document.getElementById('brand-whatsapp-input')?.value.trim() || '',
    instagram_url: document.getElementById('brand-instagram-input')?.value.trim() || '',
    address: document.getElementById('brand-address-input')?.value.trim() || '',
    terminology: {
      product: document.getElementById('brand-term-product')?.value.trim() || 'Producto',
      vendor: document.getElementById('brand-term-vendor')?.value.trim() || 'Vendedor',
      warehouse: document.getElementById('brand-term-warehouse')?.value.trim() || 'Depósito'
    },
    published_at: new Date().toISOString()
  };
}

function collectFutureAppConfig(brandProfile = collectLegacyBrandProfile()) {
  validateAdminHero();
  return window.AppConfig.normalizeConfig({
    tenantId: getAdminTenantId(),
    brand: {
      verticalCode: brandProfile.vertical_code,
      visuals: {
        logoUrl: brandProfile.logo_url,
        faviconUrl: brandProfile.favicon_url,
        primaryColor: brandProfile.primary_color,
        accentColor: brandProfile.accent_color,
        textColor: brandProfile.text_color,
        actionColor: brandProfile.action_color,
        fontFamily: brandProfile.font_family,
        headingFont: brandProfile.font_headings
      },
      texts: {
        name: brandProfile.brand_name,
        slogan: brandProfile.slogan,
        productTerm: brandProfile.terminology.product,
        vendorTerm: brandProfile.terminology.vendor,
        warehouseTerm: brandProfile.terminology.warehouse,
        whatsapp: brandProfile.whatsapp_phone,
        instagram: brandProfile.instagram_url,
        address: brandProfile.address,
        facebookUrl: document.getElementById('brand-facebook-input')?.value.trim() || '',
        mapsUrl: document.getElementById('brand-maps-input')?.value.trim() || ''
      },
      content: collectSiteContent(),
      hero: {
        enabled: heroSliderActive,
        slides: heroSlidesState.map(slide => ({
          id: slide.id,
          type: slide.type,
          mediaUrl: slide.media_url,
          title: slide.title,
          subtitle: slide.subtitle,
          targetUrl: slide.target_url,
          ctaText: slide.cta_text,
          durationSeconds: slide.duration_seconds,
          overlayEnabled: slide.overlay_enabled !== false
        }))
      }
    },
    payments: {
      mercadoPago: {
        enabled: document.getElementById('mp-active-toggle')?.checked,
        publicKey: document.getElementById('mp-public-key')?.value.trim()
      },
      bankTransfer: {
        enabled: document.getElementById('bank-active-toggle')?.checked,
        bankName: document.getElementById('bank-name')?.value.trim(),
        accountHolder: document.getElementById('bank-holder')?.value.trim(),
        cbu: document.getElementById('bank-cbu')?.value.trim(),
        alias: document.getElementById('bank-alias')?.value.trim()
      }
    },
    catalog: {
      source: document.getElementById('app-catalog-source')?.value,
      visibility: document.getElementById('app-catalog-visibility')?.value,
      showOutOfStock: document.getElementById('app-catalog-show-out')?.checked,
      allowBackorders: document.getElementById('app-catalog-backorders')?.checked,
      currency: document.getElementById('app-catalog-currency')?.value.trim().toUpperCase(),
      lowStockThreshold: document.getElementById('app-catalog-low-stock')?.value
    },
    rules: {
      sales: {
        allowVendorAdjustments: document.getElementById('app-rule-vendor-adjustments')?.checked,
        maxDiscountPercent: document.getElementById('app-rule-max-discount')?.value,
        maxDiscountFixed: document.getElementById('app-rule-max-discount-fixed')?.value,
        requireCustomerForCredit: document.getElementById('app-rule-credit-customer')?.checked
      },
      inventory: {
        allowNegativeStock: false,
        requireLocationOnReceive: true
      },
      cash: {
        requireOpenShift: true,
        supervisorApprovalForDifference: true,
        differenceTolerance: document.getElementById('app-rule-cash-tolerance')?.value
      },
      currentAccount: {
        enabled: true,
        requireCreditLimit: true,
        blockOverdue: true
      },
      pos: {
        barcodeDirectAdd: document.getElementById('app-pos-barcode-direct')?.checked,
        billDenominations: String(document.getElementById('app-pos-bill-denominations')?.value || '')
          .split(/[,;\s]+/)
          .filter(Boolean)
          .map(value => Number(value)),
        parkedTicketsEnabled: document.getElementById('app-pos-parked-tickets')?.checked,
        printDuplicateReceipts: document.getElementById('app-pos-print-duplicates')?.checked
      }
    }
  }, { tenantId: getAdminTenantId() });
}

function setControlValue(id, value, property = 'value') {
  const control = document.getElementById(id);
  if (control) control[property] = value;
}

function loadFutureAppConfigControls(config) {
  if (!config || !window.AppConfig) return;
  const normalized = window.AppConfig.normalizeConfig(config, { tenantId: getAdminTenantId() });
  setControlValue('app-catalog-source', normalized.catalog.source);
  setControlValue('app-catalog-visibility', normalized.catalog.visibility);
  setControlValue('app-catalog-currency', normalized.catalog.currency);
  setControlValue('app-catalog-low-stock', normalized.catalog.lowStockThreshold);
  setControlValue('app-catalog-show-out', normalized.catalog.showOutOfStock, 'checked');
  setControlValue('app-catalog-backorders', normalized.catalog.allowBackorders, 'checked');
  setControlValue('app-rule-vendor-adjustments', normalized.rules.sales.allowVendorAdjustments, 'checked');
  setControlValue('app-rule-max-discount', normalized.rules.sales.maxDiscountPercent);
  setControlValue('app-rule-max-discount-fixed', normalized.rules.sales.maxDiscountFixed);
  setControlValue('app-rule-credit-customer', normalized.rules.sales.requireCustomerForCredit, 'checked');
  setControlValue('app-rule-negative-stock', normalized.rules.inventory.allowNegativeStock, 'checked');
  setControlValue('app-rule-require-location', normalized.rules.inventory.requireLocationOnReceive, 'checked');
  setControlValue('app-rule-open-shift', normalized.rules.cash.requireOpenShift, 'checked');
  setControlValue('app-rule-supervisor-difference', normalized.rules.cash.supervisorApprovalForDifference, 'checked');
  setControlValue('app-rule-cash-tolerance', normalized.rules.cash.differenceTolerance);
  setControlValue('app-rule-credit-limit', normalized.rules.currentAccount.requireCreditLimit, 'checked');
  setControlValue('app-rule-block-overdue', normalized.rules.currentAccount.blockOverdue, 'checked');
  setControlValue('app-pos-barcode-direct', normalized.rules.pos.barcodeDirectAdd, 'checked');
  setControlValue('app-pos-bill-denominations', normalized.rules.pos.billDenominations.join(', '));
  setControlValue('app-pos-parked-tickets', normalized.rules.pos.parkedTicketsEnabled, 'checked');
  setControlValue('app-pos-print-duplicates', normalized.rules.pos.printDuplicateReceipts, 'checked');
  updateAppConfigStatus(normalized.status === 'published' ? `Publicado · revisión ${normalized.revision}` : `Borrador · revisión ${normalized.revision}`);
  window.AppConfig.applyCssVariables(normalized);
  initializeAppConfigDirtyTracking();
}

function initializeAppConfigDirtyTracking() {
  if (appConfigDirtyTrackingReady) return;
  // Delegation includes payment fields and banner controls added after the initial render.
  const dashboard = document.getElementById('admin-dashboard-content');
  ['input', 'change'].forEach(eventName => {
    dashboard?.addEventListener(eventName, () => {
      if (!adminConfigBusy) updateAppConfigStatus('Cambios sin guardar');
    });
  });
  appConfigDirtyTrackingReady = true;
}

function updateAppConfigStatus(message, isError = false) {
  const stage = document.getElementById('app-config-stage-status');
  const detail = document.getElementById('app-config-message');
  const pageState = document.getElementById('admin-page-save-state');
  if (stage) stage.textContent = message;
  if (pageState) {
    pageState.textContent = message;
    pageState.dataset.state = isError ? 'error' : 'normal';
  }
  if (detail) {
    detail.textContent = message;
    detail.style.color = 'var(--theme-ink)';
  }
}

function setAdminConfigBusy(busy) {
  adminConfigBusy = busy;
  const dashboard = document.getElementById('admin-dashboard-content');
  dashboard?.setAttribute('aria-busy', String(busy));
  if (busy) {
    document.querySelectorAll('#admin-dashboard-content input, #admin-dashboard-content select, #admin-dashboard-content textarea, #admin-dashboard-content button').forEach(control => {
      busyControls.set(control, control.disabled);
      control.disabled = true;
    });
  } else {
    busyControls.forEach((disabled, control) => { control.disabled = disabled; });
    busyControls.clear();
  }
}

function handleConfigSaveError(error, fallback) {
  updateAppConfigStatus(error.code === 'CONFIG_CONFLICT'
    ? 'Hay cambios en otra sesión · guardado detenido' : (error.message || fallback), true);
  if (error.code === 'CONFIG_CONFLICT') {
    const conflict = document.getElementById('admin-config-conflict');
    if (conflict) {
      conflict.hidden = false;
      conflict.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

async function reloadCentralAdminConfig() {
  if (adminConfigBusy) return;
  setAdminConfigBusy(true);
  try {
    ensureAdministrativeContext();
    await loadCentralAdminConfig();
    document.getElementById('admin-config-conflict').hidden = true;
  } catch (error) {
    handleConfigSaveError(error, 'No se pudo cargar la publicación actual. Tus campos se conservan.');
  } finally {
    setAdminConfigBusy(false);
  }
}

function focusBrandConfig(controlId) {
  focusAdminConfigControl(controlId, 'marca');
}

function focusAdminConfigControl(controlId, pageName) {
  navigateAdminConfigPage(pageName, { scroll: false });
  const control = document.getElementById(controlId);
  if (!control) return;
  control.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (typeof control.focus === 'function') control.focus({ preventScroll: true });
}

function getRequestedAdminConfigPage() {
  const requested = String(window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
  return Object.hasOwn(ADMIN_CONFIG_PAGES, requested) ? requested : 'marca';
}

function navigateAdminConfigPage(pageName, options = {}) {
  const page = Object.hasOwn(ADMIN_CONFIG_PAGES, pageName) ? pageName : 'marca';
  const metadata = ADMIN_CONFIG_PAGES[page];
  document.querySelectorAll('[data-admin-page]').forEach(section => {
    section.hidden = section.dataset.adminPage !== page;
  });
  document.querySelectorAll('[data-admin-page-target]').forEach(button => {
    const current = button.dataset.adminPageTarget === page;
    if (current) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const title = document.getElementById('admin-page-title');
  const description = document.getElementById('admin-page-description');
  if (title) title.textContent = metadata.title;
  if (description) description.textContent = metadata.description;

  const nextHash = `#${page}`;
  if (window.location.hash !== nextHash) {
    const method = options.replace ? 'replaceState' : 'pushState';
    window.history[method](null, '', nextHash);
  }
  if (options.scroll !== false) {
    document.querySelector('.admin-page-header')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function initializeAdminConfigPages() {
  document.querySelectorAll('[data-admin-page-target]').forEach(button => {
    button.addEventListener('click', () => navigateAdminConfigPage(button.dataset.adminPageTarget));
  });
  window.addEventListener('hashchange', () => navigateAdminConfigPage(getRequestedAdminConfigPage(), { replace: true }));
  navigateAdminConfigPage(getRequestedAdminConfigPage(), { replace: true, scroll: false });
}

function ensureAdministrativeContext() {
  const context = window.SaasAuth?.getTenantContext?.();
  if (!adminTenantContext || !context?.isVerified || !['ADMIN', 'SUPERADMIN'].includes(context.role)
    || context.tenantId !== adminTenantContext.tenantId) {
    throw new Error('La sesión administrativa dejó de ser válida. Volvé a verificarla.');
  }
}

async function saveFutureAppConfigDraft() {
  if (adminConfigBusy) return;
  setAdminConfigBusy(true);
  try {
    ensureAdministrativeContext();
    if (!appConfigRepository) throw new Error('El repositorio de configuración no está disponible.');
    updateAppConfigStatus('Guardando borrador…');
    const result = await appConfigRepository.saveDraft(collectFutureAppConfig());
    loadFutureAppConfigControls(result.config);
    updateAppConfigStatus(`Borrador sincronizado · revisión ${result.config.revision}`);
  } catch (error) {
    handleConfigSaveError(error, 'No se pudo guardar el borrador.');
  } finally {
    setAdminConfigBusy(false);
  }
}

async function publishFutureAppConfig() {
  await saveAdminConfig();
}

async function saveAdminConfig() {
  if (adminConfigBusy) return;
  setAdminConfigBusy(true);
  try {
    ensureAdministrativeContext();
    if (!appConfigRepository) throw new Error('El repositorio de configuración no está disponible.');
    updateAppConfigStatus('Publicando configuración…');

    const brandProfile = collectLegacyBrandProfile();
    // One conditional write: a rejected publication must not alter the shared draft either.
    const publishResult = await appConfigRepository.publish(collectFutureAppConfig(brandProfile));
    const publishedConfig = publishResult.config;
    clearLegacyPaymentConfig();
    window.AppConfig.applyCssVariables(publishedConfig);
    window.dispatchEvent(new CustomEvent('boeweb_brand_updated', { detail: publishedConfig }));

    loadFutureAppConfigControls(publishedConfig);
    document.getElementById('admin-config-conflict').hidden = true;
    const cacheNotice = publishResult.cacheStored === false ? ' · Sin copia local: comprobá la conexión al volver a abrir' : '';
    updateAppConfigStatus(`Configuración publicada y sincronizada · revisión ${publishedConfig.revision}${cacheNotice}`);

    const saveMsg = document.getElementById('admin-save-msg');
    if (saveMsg) {
      saveMsg.style.display = 'block';
      setTimeout(() => { saveMsg.style.display = 'none'; }, 3500);
    }
  } catch (error) {
    handleConfigSaveError(error, 'No se pudo publicar la configuración.');
  } finally {
    setAdminConfigBusy(false);
  }
}

// Global Exposure
window.authorizeAdminSession = authorizeAdminSession;
window.handleAdminSessionLogin = handleAdminSessionLogin;
window.loadAdminConfig = loadAdminConfig;
window.loadBrandConfig = loadBrandConfig;
window.saveAdminConfig = saveAdminConfig;
window.reloadCentralAdminConfig = reloadCentralAdminConfig;
window.saveFutureAppConfigDraft = saveFutureAppConfigDraft;
window.publishFutureAppConfig = publishFutureAppConfig;
window.focusBrandConfig = focusBrandConfig;
window.focusAdminConfigControl = focusAdminConfigControl;
window.navigateAdminConfigPage = navigateAdminConfigPage;
window.updateSiteContentPreview = updateSiteContentPreview;
window.updateBrandLivePreview = updateBrandLivePreview;
window.updateBrandColorInputs = updateBrandColorInputs;
window.updateBrandColorPickers = updateBrandColorPickers;
window.handleBrandVerticalChange = handleBrandVerticalChange;
window.handleBrandLogoFileSelect = handleBrandLogoFileSelect;
window.applyBrandColorPreset = applyBrandColorPreset;

document.addEventListener('DOMContentLoaded', () => {
  initializeAdminConfigPages();
  authorizeAdminSession().catch(error => setAdminAuthStatus(error.message || 'No se pudo verificar la sesión.', true));
});



