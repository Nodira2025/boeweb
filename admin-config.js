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
let heroSlidesState = [];
let heroSliderActive = true;

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
  const bTextColor = brand?.text_color || '#152D24';
  const bActionColor = brand?.action_color || '#2E7D32';
  const bFontFamily = brand?.font_family || "'Outfit', sans-serif";
  const bFontHeadings = brand?.font_headings || "'Playfair Display', serif";
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
    const savedSlides = localStorage.getItem('boeweb_hero_slides');
    if (savedSlides) {
      heroSlidesState = JSON.parse(savedSlides);
    } else if (brand?.hero_slides && Array.isArray(brand.hero_slides)) {
      heroSlidesState = brand.hero_slides;
    } else {
      heroSlidesState = [...DEFAULT_HERO_SLIDES];
    }
  } catch (_) {
    heroSlidesState = [...DEFAULT_HERO_SLIDES];
  }

  heroSliderActive = brand?.hero_slider_active !== false;
  const toggleSlider = document.getElementById('hero-slider-active-toggle');
  if (toggleSlider) toggleSlider.checked = heroSliderActive;

  renderHeroSlidesManager();
  updateBrandLivePreview();
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

function toggleHeroSliderActive(checked) {
  heroSliderActive = checked;
  updateBrandLivePreview();
}

function addHeroSlide(type = 'image') {
  const isVideo = type === 'video';
  const newSlide = {
    id: 'slide-' + Date.now(),
    type: type,
    media_url: isVideo ? 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' : 'assets/hero-banner1.jpg',
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

  const reader = new FileReader();
  reader.onload = (e) => {
    heroSlidesState[index].media_url = e.target.result;
    renderHeroSlidesManager();
    updateBrandLivePreview();
  };
  reader.readAsDataURL(file);
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

  container.innerHTML = heroSlidesState.map((slide, idx) => {
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

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px;">
          <!-- Tipo y Archivo / URL -->
          <div>
            <label class="admin-label" style="font-size: 0.8rem; margin-bottom: 4px;">Tipo de Contenido:</label>
            <select class="admin-input" style="font-weight: 700; margin-bottom: 10px;" onchange="updateHeroSlide(${idx}, 'type', this.value); renderHeroSlidesManager();">
              <option value="image" ${slide.type === 'image' ? 'selected' : ''}>🖼️ Imagen (PNG / JPG / WebP)</option>
              <option value="video" ${slide.type === 'video' ? 'selected' : ''}>🎬 Video (MP4 / WebM / Link directo)</option>
            </select>

            <label class="admin-label" style="font-size: 0.8rem; margin-bottom: 4px;">URL o Archivo Multimedia:</label>
            <input type="text" class="admin-input" value="${slide.media_url || ''}" placeholder="${isVideo ? 'Ej: https://.../video.mp4' : 'Ej: assets/hero-banner1.jpg o URL web'}" oninput="updateHeroSlide(${idx}, 'media_url', this.value)" style="margin-bottom: 8px;">
            
            ${!isVideo ? `
              <div style="display: flex; align-items: center; gap: 8px;">
                <input type="file" accept="image/*" class="admin-input" style="padding: 6px; font-size: 0.75rem;" onchange="handleHeroSlideFileUpload(${idx}, event)">
              </div>
            ` : `
              <small style="color: rgba(247,246,242,0.6); font-size: 0.72rem; display: block; line-height: 1.3;">
                💡 Los videos se reproducen en bucle y <strong>muteados por defecto</strong> para optimizar la experiencia en celular y web.
              </small>
            `}
          </div>

          <!-- Textos y CTA -->
          <div>
            <label class="admin-label" style="font-size: 0.8rem; margin-bottom: 4px;">Título del Banner (Opcional):</label>
            <input type="text" class="admin-input" value="${slide.title || ''}" placeholder="Ej: Gran Oferta de Temporada" oninput="updateHeroSlide(${idx}, 'title', this.value)" style="margin-bottom: 8px;">

            <label class="admin-label" style="font-size: 0.8rem; margin-bottom: 4px;">Subtítulo / Bajada:</label>
            <input type="text" class="admin-input" value="${slide.subtitle || ''}" placeholder="Ej: Hasta 30% OFF en productos seleccionados" oninput="updateHeroSlide(${idx}, 'subtitle', this.value)">
          </div>

          <!-- Redirección y Tiempo -->
          <div>
            <label class="admin-label" style="font-size: 0.8rem; margin-bottom: 4px;">Enlace de Destino al Tocar / Clic:</label>
            <input type="text" class="admin-input" value="${slide.target_url || ''}" placeholder="Ej: #catalog-section, link de WhatsApp o web" oninput="updateHeroSlide(${idx}, 'target_url', this.value)" style="margin-bottom: 8px;">

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div>
                <label class="admin-label" style="font-size: 0.8rem; margin-bottom: 4px;">Texto del Botón:</label>
                <input type="text" class="admin-input" value="${slide.cta_text || 'Ver'}" placeholder="Ej: Ver" oninput="updateHeroSlide(${idx}, 'cta_text', this.value)">
              </div>
              <div>
                <label class="admin-label" style="font-size: 0.8rem; margin-bottom: 4px;">Tiempo en Foco (seg):</label>
                <input type="number" min="2" max="60" class="admin-input" value="${slide.duration_seconds || 5}" oninput="updateHeroSlide(${idx}, 'duration_seconds', parseInt(this.value) || 5)">
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function updateBrandLivePreview() {
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
    previewBtn.style.color = textColor;
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
  const bannerTitle = document.getElementById('preview-hero-banner-title');
  const bannerSubtitle = document.getElementById('preview-hero-banner-subtitle');
  const bannerCta = document.getElementById('preview-hero-banner-cta');

  if (bannerBox) {
    if (!heroSliderActive || heroSlidesState.length === 0) {
      bannerBox.style.display = 'none';
    } else {
      bannerBox.style.display = 'flex';
      const firstSlide = heroSlidesState[0];
      if (firstSlide) {
        if (bannerTitle) bannerTitle.textContent = firstSlide.title || name;
        if (bannerSubtitle) bannerSubtitle.textContent = firstSlide.subtitle || slogan;
        if (bannerCta) bannerCta.textContent = firstSlide.cta_text || 'Ver';

        if (firstSlide.type === 'video') {
          if (bannerImg) bannerImg.style.display = 'none';
          if (bannerVideo) {
            bannerVideo.style.display = 'block';
            bannerVideo.src = firstSlide.media_url || '';
          }
        } else {
          if (bannerVideo) bannerVideo.style.display = 'none';
          if (bannerImg) {
            bannerImg.style.display = 'block';
            bannerImg.src = firstSlide.media_url || 'assets/hero-banner1.jpg';
          }
        }
      }
    }
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
    font_family: document.getElementById('brand-font-family')?.value || "'Outfit', sans-serif",
    font_headings: document.getElementById('brand-font-headings')?.value || "'Playfair Display', serif",
    primary_color: document.getElementById('brand-primary-color')?.value || '#152D24',
    accent_color: document.getElementById('brand-accent-color')?.value || '#C2A246',
    text_color: document.getElementById('brand-text-color')?.value || '#152D24',
    action_color: document.getElementById('brand-action-color')?.value || '#2E7D32',
    logo_url: currentBrandLogoDataUrl || 'assets/logo.jpg',
    favicon_url: 'assets/favicon.ico',
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

  localStorage.setItem('boeweb_hero_slides', JSON.stringify(heroSlidesState));
  localStorage.setItem('boeweb_tenant_profile_published', JSON.stringify(brandProfile));
  localStorage.setItem('boeweb_tenant_profile_draft', JSON.stringify(brandProfile));

  if (typeof TENANT_PROFILES_CACHE !== 'undefined') {
    TENANT_PROFILES_CACHE['11111111-1111-1111-1111-111111111111'] = brandProfile;
  }

  if (typeof TenantTheme !== 'undefined' && typeof TenantTheme.applyTenantTheme === 'function') {
    TenantTheme.applyTenantTheme('11111111-1111-1111-1111-111111111111');
  }

  // Apply immediately to current document and notify other components
  if (typeof window.applyBrandIdentity === 'function') {
    window.applyBrandIdentity();
  }

  window.dispatchEvent(new CustomEvent('boeweb_brand_updated', { detail: brandProfile }));
  try {
    window.dispatchEvent(new Event('storage'));
  } catch (_) {}

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



