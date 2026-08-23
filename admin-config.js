// Initialize Supabase Client
const SUPABASE_URL = 'https://sxbhrgvizqylnfcqzhin.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4YmhyZ3ZpenF5bG5mY3F6aGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMjM1MzEsImV4cCI6MjA5Njg5OTUzMX0.UUOwXsHXKNCjlJKdxMUlAuCtNAnNWgAroBwMlWAdTag';

let supabaseClient = null;
if (window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Config State
let currentPasscode = localStorage.getItem('boeweb_admin_passcode') || 'boeweb2026';
let currentBrandLogoDataUrl = null;

function checkAdminPasscode() {
  const inputPass = document.getElementById('admin-passcode-input').value.trim();
  const errorMsg = document.getElementById('admin-login-error');

  if (inputPass === currentPasscode) {
    document.getElementById('admin-login-modal').style.display = 'none';
    document.getElementById('admin-dashboard-content').style.display = 'block';
    loadAdminConfig();
    loadBrandConfig();
  } else {
    errorMsg.style.display = 'block';
  }
}

async function loadAdminConfig() {
  let config = JSON.parse(localStorage.getItem('boeweb_payment_config')) || {};

  // Try fetching config from Supabase store_config if available
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('store_config').select('*').eq('id', 'main_config').single();
      if (!error && data) {
        config = data.config_json || config;
      }
    } catch (e) {
      console.warn('Using local config fallback:', e);
    }
  }

  // Populate UI inputs
  document.getElementById('mp-active-toggle').checked = config.mpActive !== false;
  document.getElementById('mp-access-token').value = config.mpAccessToken || '';
  document.getElementById('mp-public-key').value = config.mpPublicKey || '';

  document.getElementById('bank-active-toggle').checked = config.bankActive !== false;
  document.getElementById('bank-name').value = config.bankName || 'Banco Galicia';
  document.getElementById('bank-holder').value = config.bankHolder || 'BO GROWCLUB S.A.';
  document.getElementById('bank-cbu').value = config.bankCbu || '0000003100012345678901';
  document.getElementById('bank-alias').value = config.bankAlias || 'BO.GROWCLUB.MP';
}

async function loadBrandConfig() {
  let brand = null;
  try {
    brand = JSON.parse(localStorage.getItem('boeweb_tenant_profile_published') || 'null');
  } catch (_) {}

  if (!brand && typeof TENANT_PROFILES_CACHE !== 'undefined') {
    brand = TENANT_PROFILES_CACHE['11111111-1111-1111-1111-111111111111'];
  }

  // Fallback defaults
  const bName = brand?.brand_name || 'BÔ Grow Club';
  const bSlogan = brand?.slogan || 'Espacio Zen para Cultivo Premium';
  const bVertical = brand?.vertical_code || 'growshop';
  const bPrimary = brand?.primary_color || '#152D24';
  const bAccent = brand?.accent_color || '#C2A246';
  const bLogo = brand?.logo_url || 'assets/logo.jpg';
  const bTermProduct = brand?.terminology?.product || 'Producto Botánico';
  const bTermVendor = brand?.terminology?.vendor || 'Asesor de Cultivo';
  const bTermWarehouse = brand?.terminology?.warehouse || 'Depósito Principal';
  const bWhatsapp = brand?.whatsapp_phone || '+5493816123456';
  const bInstagram = brand?.instagram_url || '@bogrowclub';
  const bAddress = brand?.address || 'Estudio de Cultivo Privado, Tucumán';

  // Set values to DOM
  const nameEl = document.getElementById('brand-name-input');
  if (nameEl) nameEl.value = bName;

  const sloganEl = document.getElementById('brand-slogan-input');
  if (sloganEl) sloganEl.value = bSlogan;

  const verticalEl = document.getElementById('brand-vertical-select');
  if (verticalEl) verticalEl.value = bVertical;

  const primColorEl = document.getElementById('brand-primary-color');
  const primHexEl = document.getElementById('brand-primary-color-hex');
  if (primColorEl) primColorEl.value = bPrimary;
  if (primHexEl) primHexEl.value = bPrimary;

  const accColorEl = document.getElementById('brand-accent-color');
  const accHexEl = document.getElementById('brand-accent-color-hex');
  if (accColorEl) accColorEl.value = bAccent;
  if (accHexEl) accHexEl.value = bAccent;

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

  updateBrandLivePreview();
}

function applyBrandColorPreset(primaryColor, accentColor, verticalCode, sampleName = '', sampleSlogan = '') {
  const primColorEl = document.getElementById('brand-primary-color');
  const primHexEl = document.getElementById('brand-primary-color-hex');
  if (primColorEl) primColorEl.value = primaryColor;
  if (primHexEl) primHexEl.value = primaryColor;

  const accColorEl = document.getElementById('brand-accent-color');
  const accHexEl = document.getElementById('brand-accent-color-hex');
  if (accColorEl) accColorEl.value = accentColor;
  if (accHexEl) accHexEl.value = accentColor;

  const verticalEl = document.getElementById('brand-vertical-select');
  if (verticalEl && verticalCode) {
    verticalEl.value = verticalCode;
    handleBrandVerticalChange(verticalCode);
  }

  if (sampleName) {
    const nameEl = document.getElementById('brand-name-input');
    if (nameEl && (!nameEl.value || nameEl.value === 'BÔ Grow Club')) nameEl.value = sampleName;
  }

  if (sampleSlogan) {
    const sloganEl = document.getElementById('brand-slogan-input');
    if (sloganEl && (!sloganEl.value || sloganEl.value === 'Espacio Zen para Cultivo Premium')) sloganEl.value = sampleSlogan;
  }

  updateBrandLivePreview();
}

function updateBrandColorInputs(type) {
  if (type === 'primary') {
    const picker = document.getElementById('brand-primary-color');
    const hex = document.getElementById('brand-primary-color-hex');
    if (picker && hex) hex.value = picker.value.toUpperCase();
  } else {
    const picker = document.getElementById('brand-accent-color');
    const hex = document.getElementById('brand-accent-color-hex');
    if (picker && hex) hex.value = picker.value.toUpperCase();
  }
  updateBrandLivePreview();
}

function updateBrandColorPickers(type) {
  if (type === 'primary') {
    const picker = document.getElementById('brand-primary-color');
    const hex = document.getElementById('brand-primary-color-hex');
    if (picker && hex && /^#[0-9A-F]{6}$/i.test(hex.value.trim())) {
      picker.value = hex.value.trim();
    }
  } else {
    const picker = document.getElementById('brand-accent-color');
    const hex = document.getElementById('brand-accent-color-hex');
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

  const reader = new FileReader();
  reader.onload = (e) => {
    currentBrandLogoDataUrl = e.target.result;
    const previewImg = document.getElementById('brand-logo-preview-img');
    const thumbImg = document.getElementById('preview-logo-thumb');
    if (previewImg) previewImg.src = currentBrandLogoDataUrl;
    if (thumbImg) thumbImg.src = currentBrandLogoDataUrl;
  };
  reader.readAsDataURL(file);
}

function updateBrandLivePreview() {
  const name = document.getElementById('brand-name-input')?.value.trim() || 'BÔ Grow Club';
  const slogan = document.getElementById('brand-slogan-input')?.value.trim() || 'Espacio Zen para Cultivo Premium';
  const primaryColor = document.getElementById('brand-primary-color')?.value || '#152D24';
  const accentColor = document.getElementById('brand-accent-color')?.value || '#C2A246';
  const termProduct = document.getElementById('brand-term-product')?.value.trim() || 'Producto Botánico';
  const whatsapp = document.getElementById('brand-whatsapp-input')?.value.trim() || '+5493816123456';

  const previewBar = document.getElementById('preview-header-bar');
  const previewName = document.getElementById('preview-brand-name');
  const previewSlogan = document.getElementById('preview-brand-slogan');
  const previewBtn = document.getElementById('preview-sample-btn');
  const previewBadge = document.getElementById('preview-term-product-badge');
  const previewThumb = document.getElementById('preview-logo-thumb');
  const previewWhatsappText = document.getElementById('preview-whatsapp-text');

  if (previewBar) previewBar.style.background = primaryColor;
  if (previewName) previewName.textContent = name;
  if (previewSlogan) previewSlogan.textContent = slogan;
  if (previewBadge) previewBadge.textContent = termProduct;
  if (previewBtn) {
    previewBtn.style.background = accentColor;
    previewBtn.style.color = primaryColor;
  }
  if (previewThumb && currentBrandLogoDataUrl) {
    previewThumb.src = currentBrandLogoDataUrl;
  }
  if (previewWhatsappText) {
    previewWhatsappText.textContent = `💬 WhatsApp: ${whatsapp}`;
  }
}

async function saveAdminConfig() {
  const newPasscode = document.getElementById('admin-new-passcode').value.trim();
  if (newPasscode !== '') {
    currentPasscode = newPasscode;
    localStorage.setItem('boeweb_admin_passcode', newPasscode);
  }

  // 1. Payment Gateway Configuration
  const paymentConfig = {
    mpActive: document.getElementById('mp-active-toggle').checked,
    mpAccessToken: document.getElementById('mp-access-token').value.trim(),
    mpPublicKey: document.getElementById('mp-public-key').value.trim(),

    bankActive: document.getElementById('bank-active-toggle').checked,
    bankName: document.getElementById('bank-name').value.trim(),
    bankHolder: document.getElementById('bank-holder').value.trim(),
    bankCbu: document.getElementById('bank-cbu').value.trim(),
    bankAlias: document.getElementById('bank-alias').value.trim(),

    updatedAt: new Date().toISOString()
  };

  localStorage.setItem('boeweb_payment_config', JSON.stringify(paymentConfig));

  // 2. Brand Identity & Business Profile Configuration
  const brandProfile = {
    tenant_id: '11111111-1111-1111-1111-111111111111',
    brand_name: document.getElementById('brand-name-input')?.value.trim() || 'BÔ Grow Club',
    slogan: document.getElementById('brand-slogan-input')?.value.trim() || '',
    vertical_code: document.getElementById('brand-vertical-select')?.value || 'growshop',
    primary_color: document.getElementById('brand-primary-color')?.value || '#152D24',
    accent_color: document.getElementById('brand-accent-color')?.value || '#C2A246',
    logo_url: currentBrandLogoDataUrl || 'assets/logo.jpg',
    favicon_url: 'assets/favicon.ico',
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

  localStorage.setItem('boeweb_tenant_profile_published', JSON.stringify(brandProfile));
  localStorage.setItem('boeweb_tenant_profile_draft', JSON.stringify(brandProfile));

  if (typeof TENANT_PROFILES_CACHE !== 'undefined') {
    TENANT_PROFILES_CACHE['11111111-1111-1111-1111-111111111111'] = brandProfile;
  }

  // Apply immediately to current document
  if (typeof window.applyBrandIdentity === 'function') {
    window.applyBrandIdentity();
  }

  // Sync to Supabase if available
  if (supabaseClient) {
    try {
      await supabaseClient.from('store_config').upsert({
        id: 'main_config',
        config_json: paymentConfig,
        updated_at: new Date().toISOString()
      });
    } catch (e) {
      console.warn('Could not sync to Supabase store_config table:', e);
    }

    try {
      await supabaseClient.from('tenant_profiles').upsert({
        tenant_id: brandProfile.tenant_id,
        brand_name: brandProfile.brand_name,
        slogan: brandProfile.slogan,
        vertical_code: brandProfile.vertical_code,
        primary_color: brandProfile.primary_color,
        accent_color: brandProfile.accent_color,
        logo_url: brandProfile.logo_url,
        terminology: brandProfile.terminology,
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id' });
    } catch (e) {
      console.warn('Could not sync to Supabase tenant_profiles table:', e);
    }
  }

  const saveMsg = document.getElementById('admin-save-msg');
  if (saveMsg) {
    saveMsg.style.display = 'block';
    setTimeout(() => { saveMsg.style.display = 'none'; }, 3500);
  }
}

async function testCurrentMpToken() {
  const tokenInput = document.getElementById('mp-access-token');
  const statusEl = document.getElementById('mp-test-status');
  if (!tokenInput || !statusEl) return;

  const token = tokenInput.value.trim();
  if (!token) {
    statusEl.style.display = 'block';
    statusEl.style.color = '#ff6b6b';
    statusEl.textContent = '⚠️ Por favor pegá el Access Token antes de probar.';
    return;
  }

  statusEl.style.display = 'block';
  statusEl.style.color = 'var(--color-accent-gold)';
  statusEl.textContent = '⏳ Conectando con Mercado Pago...';

  if (typeof window.testMercadoPagoCredentials !== 'function') {
    statusEl.style.color = '#ff6b6b';
    statusEl.textContent = '⚠️ Módulo de checkout no cargado.';
    return;
  }

  const res = await window.testMercadoPagoCredentials(token);
  if (res.ok) {
    statusEl.style.color = '#25D366';
    statusEl.textContent = '✅ ¡Conexión exitosa! El Access Token es válido y está listo para recibir pagos.';
  } else {
    statusEl.style.color = '#ff6b6b';
    statusEl.textContent = `❌ Error en Mercado Pago: ${res.error || 'Token inválido o no autorizado'}`;
  }
}

// Global Exposure
window.checkAdminPasscode = checkAdminPasscode;
window.loadAdminConfig = loadAdminConfig;
window.loadBrandConfig = loadBrandConfig;
window.saveAdminConfig = saveAdminConfig;
window.testCurrentMpToken = testCurrentMpToken;
window.updateBrandLivePreview = updateBrandLivePreview;
window.updateBrandColorInputs = updateBrandColorInputs;
window.updateBrandColorPickers = updateBrandColorPickers;
window.handleBrandVerticalChange = handleBrandVerticalChange;
window.handleBrandLogoFileSelect = handleBrandLogoFileSelect;
window.applyBrandColorPreset = applyBrandColorPreset;



