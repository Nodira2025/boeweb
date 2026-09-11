(function initAppConfig(globalScope) {
  'use strict';

  const CONFIG_SCHEMA_VERSION = 2;
  const STORAGE_PREFIX = `boeweb:app-config:v${CONFIG_SCHEMA_VERSION}`;
  const DEFAULT_TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const VALID_STAGES = new Set(['draft', 'published']);
  const SAFE_FONT_FAMILIES = new Set([
    "'Outfit', sans-serif",
    "'Montserrat', sans-serif",
    "'Playfair Display', serif",
    "'Cinzel', serif",
    "'Inter', sans-serif",
    "'Plus Jakarta Sans', sans-serif",
    "'Poppins', sans-serif",
    "'Roboto', sans-serif"
  ]);
  const SECRET_KEY_PATTERN = /token|secret|password|passcode|private.?key|credential/i;
  const SECRET_VALUE_PATTERN = /^(?:bearer\s+[A-Za-z0-9._~-]{16,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;

  function getRelativeLuminance(hexColor) {
    const rawHex = String(hexColor || '').trim().replace(/^#/, '');
    const expandedHex = rawHex.length === 3
      ? rawHex.split('').map(character => `${character}${character}`).join('')
      : rawHex;
    if (!/^[0-9a-f]{6}$/i.test(expandedHex)) return 0;
    const channels = [0, 2, 4].map(index => parseInt(expandedHex.slice(index, index + 2), 16) / 255);
    const linear = channels.map(channel => (
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    ));
    return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
  }

  function getReadableForeground(backgroundColor) {
    const backgroundLuminance = getRelativeLuminance(backgroundColor);
    const dark = '#152D24';
    const light = '#F6F3E8';
    const darkContrast = (backgroundLuminance + 0.05) / (getRelativeLuminance(dark) + 0.05);
    const lightContrast = (getRelativeLuminance(light) + 0.05) / (backgroundLuminance + 0.05);
    const preferredForeground = darkContrast >= lightContrast ? dark : light;
    if (Math.max(darkContrast, lightContrast) >= 4.5) return preferredForeground;

    // Mid-tone tenant accents sometimes need absolute black/white to reach WCAG AA.
    const blackContrast = (backgroundLuminance + 0.05) / 0.05;
    const whiteContrast = 1.05 / (backgroundLuminance + 0.05);
    return blackContrast >= whiteContrast ? '#000000' : '#FFFFFF';
  }

  function getContrastRatio(firstColor, secondColor) {
    const firstLuminance = getRelativeLuminance(firstColor);
    const secondLuminance = getRelativeLuminance(secondColor);
    const lighter = Math.max(firstLuminance, secondLuminance);
    const darker = Math.min(firstLuminance, secondLuminance);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function getAccessibleTextColor(preferredColor, surfaceColor) {
    const normalizedPreferred = String(preferredColor || '').trim();
    if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(normalizedPreferred)
      && getContrastRatio(normalizedPreferred, surfaceColor) >= 4.5) {
      return normalizedPreferred;
    }
    return getReadableForeground(surfaceColor);
  }

  function mixColors(firstColor, secondColor, amount) {
    const channels = color => color.slice(1).match(/../g).map(value => parseInt(value, 16));
    const first = channels(firstColor);
    const second = channels(secondColor);
    return '#' + first.map((value, index) => Math.round(value * amount + second[index] * (1 - amount))
      .toString(16).padStart(2, '0')).join('');
  }

  function createThemeTokens(visuals, mode = 'light') {
    const dark = mode === 'dark';
    const primary = visuals.primaryColor;
    const accent = visuals.accentColor;
    const background = dark ? mixColors(primary, '#101114', 0.16) : mixColors(primary, '#faf9f5', 0.025);
    const surface = dark ? mixColors(primary, '#1b1d22', 0.18) : '#fffefb';
    const elevated = dark ? mixColors(primary, '#252830', 0.2) : mixColors(primary, '#ffffff', 0.04);
    const strong = getRelativeLuminance(primary) > 0.16 ? mixColors(primary, '#101114', 0.45) : primary;
    const ink = getAccessibleTextColor(visuals.textColor, background);
    return {
      '--theme-bg': background,
      '--theme-surface': surface,
      '--theme-elevated': elevated,
      '--theme-ink': ink,
      '--theme-muted': getAccessibleTextColor(mixColors(ink, surface, 0.75), surface),
      '--theme-line': mixColors(ink, surface, 0.22),
      '--theme-strong': strong,
      '--theme-strong-soft': mixColors(strong, '#000000', 0.82),
      '--theme-on-strong': getReadableForeground(strong),
      '--theme-accent': accent,
      '--theme-accent-soft': mixColors(accent, '#ffffff', 0.38),
      '--theme-accent-ink': getAccessibleTextColor(accent, surface),
      '--theme-on-accent': getReadableForeground(accent),
      '--theme-primary-ink': getAccessibleTextColor(primary, surface),
      '--theme-action': visuals.actionColor,
      '--theme-on-action': getReadableForeground(visuals.actionColor),
      '--theme-action-ink': getAccessibleTextColor(visuals.actionColor, surface)
    };
  }

  const DEFAULT_CONFIG_SOURCE = {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    tenantId: DEFAULT_TENANT_ID,
    revision: 0,
    status: 'published',
    updatedAt: null,
    publishedAt: null,
    brand: {
      verticalCode: 'growshop',
      visuals: {
        logoUrl: 'assets/logo.jpg',
        faviconUrl: 'assets/logo.jpg',
        primaryColor: '#152D24',
        accentColor: '#C2A246',
        textColor: '#152D24',
        actionColor: '#2E7D32',
        fontFamily: "'Outfit', sans-serif",
        headingFont: "'Playfair Display', serif"
      },
      texts: {
        name: 'BÔ Grow Club',
        slogan: 'Espacio Zen para Cultivo Premium',
        productTerm: 'Producto',
        vendorTerm: 'Vendedor',
        warehouseTerm: 'Depósito',
        whatsapp: '',
        instagram: '',
        address: ''
      },
      hero: {
        enabled: false,
        slides: []
      }
    },
    catalog: {
      source: 'unified',
      visibility: 'public',
      showOutOfStock: true,
      allowBackorders: true,
      currency: 'ARS',
      lowStockThreshold: 3
    },
    payments: {
      mercadoPago: {
        enabled: false,
        publicKey: ''
      },
      bankTransfer: {
        enabled: false,
        bankName: '',
        accountHolder: '',
        cbu: '',
        alias: ''
      }
    },
    rules: {
      sales: {
        allowVendorAdjustments: false,
        maxDiscountPercent: 15,
        maxDiscountFixed: 0,
        requireCustomerForCredit: true
      },
      inventory: {
        allowNegativeStock: false,
        requireLocationOnReceive: true
      },
      cash: {
        requireOpenShift: true,
        supervisorApprovalForDifference: true,
        differenceTolerance: 0
      },
      currentAccount: {
        enabled: true,
        requireCreditLimit: true,
        blockOverdue: true
      },
      pos: {
        billDenominations: [20000, 10000, 2000, 1000, 500, 200, 100],
        barcodeDirectAdd: true,
        parkedTicketsEnabled: true,
        printDuplicateReceipts: true
      }
    }
  };

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  const DEFAULT_CONFIG = deepFreeze(clone(DEFAULT_CONFIG_SOURCE));
  let activeConfig = DEFAULT_CONFIG;

  function get(path, fallback = undefined) {
    if (!path) return activeConfig;
    const segments = Array.isArray(path) ? path : String(path).split('.');
    let value = activeConfig;
    for (const segment of segments) {
      if (!segment || ['__proto__', 'prototype', 'constructor'].includes(segment)
          || value === null || value === undefined || typeof value !== 'object'
          || !Object.prototype.hasOwnProperty.call(value, segment)) {
        return fallback;
      }
      value = value[segment];
    }
    return value === undefined ? fallback : value;
  }

  function sanitizeClientConfig(input) {
    if (Array.isArray(input)) return input.map(sanitizeClientConfig);
    if (!input || typeof input !== 'object') {
      if (typeof input === 'string' && SECRET_VALUE_PATTERN.test(input.trim())) return undefined;
      return input;
    }

    return Object.entries(input).reduce((result, [key, value]) => {
      if (SECRET_KEY_PATTERN.test(key)) return result;
      const sanitizedValue = sanitizeClientConfig(value);
      if (sanitizedValue !== undefined) result[key] = sanitizedValue;
      return result;
    }, {});
  }

  function normalizeTenantId(value) {
    const candidate = String(value || '').trim();
    return /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(candidate) ? candidate : DEFAULT_TENANT_ID;
  }

  function cleanText(value, fallback, maxLength) {
    if (typeof value !== 'string') return fallback;
    const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
    return cleaned ? cleaned.slice(0, maxLength) : fallback;
  }

  function cleanOptionalText(value, maxLength) {
    return typeof value === 'string'
      ? value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLength)
      : '';
  }

  function cleanColor(value, fallback) {
    const candidate = String(value || '').trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(candidate) ? candidate : fallback;
  }

  function cleanAssetUrl(value, fallback) {
    const candidate = String(value || '').trim();
    if (!candidate) return fallback;
    if (/^(?:https:\/\/|\/|\.\/|\.\.\/|assets\/)[^\s]+$/i.test(candidate)) return candidate.slice(0, 2048);
    if (/^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml);base64,[a-z0-9+/=]+$/i.test(candidate) && candidate.length <= 2_000_000) {
      return candidate;
    }
    return fallback;
  }

  function cleanActionUrl(value, fallback = '#catalog-section') {
    const candidate = String(value || '').trim();
    if (/^#[a-z0-9][a-z0-9_-]*$/i.test(candidate)) return candidate.slice(0, 300);
    if (/^(?:https:\/\/|\/|\.\/|\.\.\/)[^\s]+$/i.test(candidate)) return candidate.slice(0, 2048);
    return fallback;
  }

  function normalizeHeroSlides(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 8).map((slide, index) => {
      const type = cleanEnum(slide?.type, ['image', 'video'], 'image');
      const mediaUrl = cleanAssetUrl(slide?.mediaUrl ?? slide?.media_url, '');
      return {
        id: cleanText(String(slide?.id || `slide-${index + 1}`), `slide-${index + 1}`, 80),
        type,
        mediaUrl,
        title: cleanOptionalText(slide?.title, 140),
        subtitle: cleanOptionalText(slide?.subtitle, 240),
        targetUrl: cleanActionUrl(slide?.targetUrl ?? slide?.target_url),
        ctaText: cleanText(slide?.ctaText ?? slide?.cta_text, 'Ver más', 60),
        durationSeconds: cleanNumber(slide?.durationSeconds ?? slide?.duration_seconds, 5, 2, 60, true),
        overlayEnabled: cleanBoolean(slide?.overlayEnabled ?? slide?.overlay_enabled, true)
      };
    }).filter(slide => slide.mediaUrl);
  }

  function normalizeBillDenominations(input, fallback = [20000, 10000, 2000, 1000, 500, 200, 100]) {
    if (!Array.isArray(input)) return [...fallback];
    const cleaned = [...new Set(input.map(val => Math.trunc(Number(val))).filter(val => Number.isInteger(val) && val > 0 && val <= 1_000_000))].sort((a, b) => b - a);
    return cleaned.length > 0 ? cleaned.slice(0, 12) : [...fallback];
  }

  function cleanFont(value, fallback) {
    return SAFE_FONT_FAMILIES.has(value) ? value : fallback;
  }

  function cleanBoolean(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
  }

  function cleanNumber(value, fallback, min, max, integer = false) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const bounded = Math.min(max, Math.max(min, parsed));
    return integer ? Math.round(bounded) : Math.round(bounded * 100) / 100;
  }

  function cleanEnum(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
  }

  function normalizeConfig(input = {}, options = {}) {
    const sanitized = sanitizeClientConfig(input) || {};
    const defaults = DEFAULT_CONFIG;
    const brand = sanitized.brand || {};
    const visuals = brand.visuals || {};
    const texts = brand.texts || {};
    const hero = brand.hero || {};
    const catalog = sanitized.catalog || {};
    const payments = sanitized.payments || {};
    const mercadoPago = payments.mercadoPago || {};
    const bankTransfer = payments.bankTransfer || {};
    const rules = sanitized.rules || {};
    const salesRules = rules.sales || {};
    const inventoryRules = rules.inventory || {};
    const cashRules = rules.cash || {};
    const currentAccountRules = rules.currentAccount || {};
    const posRules = rules.pos || {};
    const explicitTenant = options.tenantId || sanitized.tenantId || sanitized.tenant_id;

    return {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      tenantId: normalizeTenantId(explicitTenant),
      revision: cleanNumber(sanitized.revision, 0, 0, Number.MAX_SAFE_INTEGER, true),
      status: cleanEnum(sanitized.status, ['draft', 'published'], 'published'),
      updatedAt: typeof sanitized.updatedAt === 'string' ? sanitized.updatedAt : null,
      publishedAt: typeof sanitized.publishedAt === 'string' ? sanitized.publishedAt : null,
      brand: {
        // Presentation preference only; operational permissions still use the tenant record.
        verticalCode: cleanEnum(brand.verticalCode || sanitized.vertical_code,
          ['growshop', 'ferreteria', 'repuestos', 'indumentaria'], defaults.brand.verticalCode),
        visuals: {
          logoUrl: cleanAssetUrl(visuals.logoUrl || sanitized.logo_url, defaults.brand.visuals.logoUrl),
          faviconUrl: cleanAssetUrl(visuals.faviconUrl || sanitized.favicon_url, defaults.brand.visuals.faviconUrl),
          primaryColor: cleanColor(visuals.primaryColor || sanitized.primary_color, defaults.brand.visuals.primaryColor),
          accentColor: cleanColor(visuals.accentColor || sanitized.accent_color, defaults.brand.visuals.accentColor),
          textColor: cleanColor(visuals.textColor || sanitized.text_color, defaults.brand.visuals.textColor),
          actionColor: cleanColor(visuals.actionColor || sanitized.action_color, defaults.brand.visuals.actionColor),
          fontFamily: cleanFont(visuals.fontFamily || sanitized.font_family, defaults.brand.visuals.fontFamily),
          headingFont: cleanFont(visuals.headingFont || sanitized.font_headings, defaults.brand.visuals.headingFont)
        },
        texts: {
          name: cleanText(texts.name || sanitized.brand_name, defaults.brand.texts.name, 100),
          slogan: cleanOptionalText(texts.slogan ?? sanitized.slogan, 180),
          productTerm: cleanText(texts.productTerm || sanitized.terminology?.product, defaults.brand.texts.productTerm, 60),
          vendorTerm: cleanText(texts.vendorTerm || sanitized.terminology?.vendor, defaults.brand.texts.vendorTerm, 60),
          warehouseTerm: cleanText(texts.warehouseTerm || sanitized.terminology?.warehouse, defaults.brand.texts.warehouseTerm, 60),
          whatsapp: cleanOptionalText(texts.whatsapp ?? sanitized.whatsapp_phone, 40),
          instagram: cleanOptionalText(texts.instagram ?? sanitized.instagram_url, 120),
          address: cleanOptionalText(texts.address ?? sanitized.address, 240)
        },
        hero: {
          enabled: cleanBoolean(hero.enabled ?? sanitized.hero_slider_active, defaults.brand.hero.enabled),
          slides: normalizeHeroSlides(hero.slides ?? sanitized.hero_slides)
        }
      },
      catalog: {
        source: cleanEnum(catalog.source, ['internal', 'unified', 'disabled'], defaults.catalog.source),
        visibility: cleanEnum(catalog.visibility, ['public', 'members', 'private'], defaults.catalog.visibility),
        showOutOfStock: cleanBoolean(catalog.showOutOfStock, defaults.catalog.showOutOfStock),
        allowBackorders: cleanBoolean(catalog.allowBackorders, defaults.catalog.allowBackorders),
        currency: /^[A-Z]{3}$/.test(String(catalog.currency || '').trim().toUpperCase())
          ? String(catalog.currency).trim().toUpperCase()
          : defaults.catalog.currency,
        lowStockThreshold: cleanNumber(catalog.lowStockThreshold, defaults.catalog.lowStockThreshold, 0, 9999, true)
      },
      payments: {
        mercadoPago: {
          enabled: cleanBoolean(mercadoPago.enabled ?? sanitized.mpActive, defaults.payments.mercadoPago.enabled),
          publicKey: cleanOptionalText(mercadoPago.publicKey ?? sanitized.mpPublicKey, 200)
        },
        bankTransfer: {
          enabled: cleanBoolean(bankTransfer.enabled ?? sanitized.bankActive, defaults.payments.bankTransfer.enabled),
          bankName: cleanOptionalText(bankTransfer.bankName ?? sanitized.bankName, 120),
          accountHolder: cleanOptionalText(bankTransfer.accountHolder ?? sanitized.bankHolder, 160),
          cbu: cleanOptionalText(bankTransfer.cbu ?? sanitized.bankCbu, 22).replace(/\D/g, ''),
          alias: cleanOptionalText(bankTransfer.alias ?? sanitized.bankAlias, 80).toUpperCase()
        }
      },
      rules: {
        sales: {
          allowVendorAdjustments: cleanBoolean(salesRules.allowVendorAdjustments, defaults.rules.sales.allowVendorAdjustments),
          maxDiscountPercent: cleanNumber(salesRules.maxDiscountPercent, defaults.rules.sales.maxDiscountPercent, 0, 100),
          maxDiscountFixed: cleanNumber(salesRules.maxDiscountFixed, defaults.rules.sales.maxDiscountFixed, 0, 1_000_000_000),
          requireCustomerForCredit: cleanBoolean(salesRules.requireCustomerForCredit, defaults.rules.sales.requireCustomerForCredit)
        },
        inventory: {
          allowNegativeStock: false,
          requireLocationOnReceive: true
        },
        cash: {
          requireOpenShift: true,
          supervisorApprovalForDifference: true,
          differenceTolerance: cleanNumber(cashRules.differenceTolerance, defaults.rules.cash.differenceTolerance, 0, 1_000_000_000)
        },
        currentAccount: {
          enabled: cleanBoolean(currentAccountRules.enabled, defaults.rules.currentAccount.enabled),
          requireCreditLimit: true,
          blockOverdue: true
        },
        pos: {
          barcodeDirectAdd: cleanBoolean(posRules.barcodeDirectAdd, defaults.rules.pos?.barcodeDirectAdd ?? true),
          billDenominations: normalizeBillDenominations(posRules.billDenominations, defaults.rules.pos?.billDenominations || [20000, 10000, 2000, 1000, 500, 200, 100]),
          parkedTicketsEnabled: cleanBoolean(posRules.parkedTicketsEnabled, defaults.rules.pos?.parkedTicketsEnabled ?? true),
          printDuplicateReceipts: cleanBoolean(posRules.printDuplicateReceipts, defaults.rules.pos?.printDuplicateReceipts ?? true)
        }
      }
    };
  }

  function findForbiddenKeys(value, path = '') {
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value).flatMap(([key, child]) => {
      const childPath = path ? `${path}.${key}` : key;
      const ownError = SECRET_KEY_PATTERN.test(key) || (typeof child === 'string' && SECRET_VALUE_PATTERN.test(child.trim()))
        ? [{ path: childPath, code: 'secret_forbidden', message: 'Los secretos no pueden formar parte de la configuración cliente.' }]
        : [];
      return ownError.concat(findForbiddenKeys(child, childPath));
    });
  }

  function validateConfig(config) {
    const errors = findForbiddenKeys(config);
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      errors.push({ path: '$', code: 'invalid_type', message: 'La configuración debe ser un objeto.' });
      return { valid: false, errors };
    }

    const tenant = Object.prototype.hasOwnProperty.call(config, 'tenantId') ? config.tenantId : config.tenant_id;
    if (tenant !== undefined && normalizeTenantId(tenant) !== String(tenant).trim()) {
      errors.push({ path: 'tenantId', code: 'invalid_tenant', message: 'El identificador de empresa no es válido.' });
    }

    const colors = config.brand?.visuals || {};
    ['primaryColor', 'accentColor', 'textColor', 'actionColor'].forEach(key => {
      if (colors[key] !== undefined && !/^#[0-9A-F]{6}$/i.test(String(colors[key]))) {
        errors.push({ path: `brand.visuals.${key}`, code: 'invalid_color', message: 'El color debe usar el formato #RRGGBB.' });
      }
    });

    const heroSlides = config.brand?.hero?.slides;
    if (heroSlides !== undefined && (!Array.isArray(heroSlides) || heroSlides.length > 8)) {
      errors.push({ path: 'brand.hero.slides', code: 'invalid_slides', message: 'La portada admite hasta ocho piezas visuales.' });
    } else if (Array.isArray(heroSlides)) {
      heroSlides.forEach((slide, index) => {
        if (!['image', 'video'].includes(slide?.type) || !cleanAssetUrl(slide?.mediaUrl, '')) {
          errors.push({ path: `brand.hero.slides.${index}`, code: 'invalid_slide', message: 'Cada pieza necesita un tipo y recurso visual seguros.' });
        }
        if (slide?.targetUrl !== undefined && cleanActionUrl(slide.targetUrl, '') !== slide.targetUrl) {
          errors.push({ path: `brand.hero.slides.${index}.targetUrl`, code: 'invalid_url', message: 'El destino de la pieza visual no es seguro.' });
        }
      });
    }

    if (config.catalog?.currency !== undefined && !/^[A-Z]{3}$/.test(String(config.catalog.currency))) {
      errors.push({ path: 'catalog.currency', code: 'invalid_currency', message: 'La moneda debe ser un código ISO de tres letras.' });
    }

    const cbu = config.payments?.bankTransfer?.cbu;
    if (cbu !== undefined && cbu !== '' && !/^\d{22}$/.test(String(cbu))) {
      errors.push({ path: 'payments.bankTransfer.cbu', code: 'invalid_cbu', message: 'El CBU/CVU debe contener exactamente 22 dígitos.' });
    }
    const bankTransfer = config.payments?.bankTransfer;
    if (bankTransfer?.enabled) {
      ['bankName', 'accountHolder', 'cbu', 'alias'].forEach(key => {
        if (!String(bankTransfer[key] || '').trim()) {
          errors.push({ path: `payments.bankTransfer.${key}`, code: 'required', message: 'Completá todos los datos bancarios antes de habilitar transferencias.' });
        }
      });
    }

    const publicKey = config.payments?.mercadoPago?.publicKey;
    if (publicKey !== undefined && (typeof publicKey !== 'string' || publicKey.length > 200)) {
      errors.push({ path: 'payments.mercadoPago.publicKey', code: 'invalid_public_key', message: 'La clave pública del proveedor no es válida.' });
    }

    const lowStockThreshold = config.catalog?.lowStockThreshold;
    if (lowStockThreshold !== undefined && (!Number.isFinite(Number(lowStockThreshold)) || Number(lowStockThreshold) < 0 || Number(lowStockThreshold) > 9999)) {
      errors.push({ path: 'catalog.lowStockThreshold', code: 'out_of_range', message: 'El umbral de stock bajo debe estar entre 0 y 9999.' });
    }

    const discount = config.rules?.sales?.maxDiscountPercent;
    if (discount !== undefined && (!Number.isFinite(Number(discount)) || Number(discount) < 0 || Number(discount) > 100)) {
      errors.push({ path: 'rules.sales.maxDiscountPercent', code: 'out_of_range', message: 'El descuento máximo debe estar entre 0 y 100.' });
    }

    const fixedDiscount = config.rules?.sales?.maxDiscountFixed;
    if (fixedDiscount !== undefined && (!Number.isFinite(Number(fixedDiscount)) || Number(fixedDiscount) < 0 || Number(fixedDiscount) > 1_000_000_000)) {
      errors.push({ path: 'rules.sales.maxDiscountFixed', code: 'out_of_range', message: 'El descuento fijo debe ser un importe positivo válido.' });
    }

    const differenceTolerance = config.rules?.cash?.differenceTolerance;
    if (differenceTolerance !== undefined && (!Number.isFinite(Number(differenceTolerance)) || Number(differenceTolerance) < 0 || Number(differenceTolerance) > 1_000_000_000)) {
      errors.push({ path: 'rules.cash.differenceTolerance', code: 'out_of_range', message: 'La tolerancia de caja debe ser un importe positivo válido.' });
    }

    return { valid: errors.length === 0, errors };
  }

  function createStorageKey(tenantId, stage = 'published') {
    const safeStage = VALID_STAGES.has(stage) ? stage : 'published';
    return `${STORAGE_PREFIX}:${normalizeTenantId(tenantId)}:${safeStage}`;
  }

  function createMemoryStorage() {
    const values = new Map();
    return {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); }
    };
  }

  function resolveStorage(storage) {
    if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') return storage;
    try {
      if (globalScope.localStorage) return globalScope.localStorage;
    } catch (error) {
      // Storage can be disabled by privacy settings. The in-memory fallback is intentionally non-authoritative.
    }
    return createMemoryStorage();
  }

  function parseCachedConfig(storage, key, tenantId) {
    try {
      const raw = storage.getItem(key);
      return raw ? normalizeConfig(JSON.parse(raw), { tenantId }) : null;
    } catch (error) {
      storage.removeItem(key);
      return null;
    }
  }

  function createRepository(options = {}) {
    const tenantId = normalizeTenantId(options.tenantId);
    const storage = resolveStorage(options.storage);
    const supabaseClient = options.supabaseClient || null;
    const requireRemoteWrites = options.requireRemoteWrites === true;
    const tableName = cleanText(options.tableName, 'tenant_app_config', 80);

    async function readRemote(stage) {
      if (!supabaseClient?.from) return { config: null, error: null };
      try {
        const { data, error } = await supabaseClient
          .from(tableName)
          .select('tenant_id,stage,config_json,revision,updated_at,published_at')
          .eq('tenant_id', tenantId)
          .eq('stage', stage)
          .maybeSingle();
        if (error) return { config: null, error };
        const remoteConfig = data?.config_json ? normalizeConfig({
          ...data.config_json,
          tenantId: data.tenant_id,
          status: data.stage,
          revision: data.revision,
          updatedAt: data.updated_at,
          publishedAt: data.published_at
        }, { tenantId }) : null;
        return { config: remoteConfig, error: null };
      } catch (error) {
        return { config: null, error };
      }
    }

    async function writeRemote(stage, config) {
      if (!supabaseClient?.from) return { remoteSynced: false, remoteError: null };
      try {
        const payload = {
          tenant_id: tenantId,
          stage,
          schema_version: CONFIG_SCHEMA_VERSION,
          revision: config.revision,
          config_json: sanitizeClientConfig(config),
          updated_at: config.updatedAt,
          published_at: config.publishedAt
        };
        const { error } = await supabaseClient.from(tableName).upsert(payload, { onConflict: 'tenant_id,stage' });
        return { remoteSynced: !error, remoteError: error || null };
      } catch (error) {
        return { remoteSynced: false, remoteError: error };
      }
    }

    async function load(stage = 'published') {
      const safeStage = VALID_STAGES.has(stage) ? stage : 'published';
      const remote = await readRemote(safeStage);
      if (remote.config) {
        const newer = parseCachedConfig(storage, createStorageKey(tenantId, safeStage), tenantId);
        if (newer && newer.revision > remote.config.revision) return newer;
        storage.setItem(createStorageKey(tenantId, safeStage), JSON.stringify(remote.config));
        return remote.config;
      }
      const cached = parseCachedConfig(storage, createStorageKey(tenantId, safeStage), tenantId);
      return cached || normalizeConfig({ tenantId, status: safeStage });
    }

    async function saveDraft(input) {
      const current = await load('draft');
      const timestamp = new Date().toISOString();
      const config = normalizeConfig({
        ...input,
        tenantId,
        status: 'draft',
        revision: Math.max(current.revision, Number(input?.revision) || 0) + 1,
        updatedAt: timestamp,
        publishedAt: null
      }, { tenantId });
      const validation = validateConfig(config);
      if (!validation.valid) throw new Error(validation.errors.map(error => error.message).join(' '));
      const remoteResult = await writeRemote('draft', config);
      if (requireRemoteWrites && !remoteResult.remoteSynced) {
        throw new Error(remoteResult.remoteError?.message || 'No se pudo guardar el borrador en la configuración central.');
      }
      storage.setItem(createStorageKey(tenantId, 'draft'), JSON.stringify(config));
      return { config, ...remoteResult };
    }

    async function publish(input) {
      const source = input || await load('draft');
      const current = await load('published');
      const timestamp = new Date().toISOString();
      const config = normalizeConfig({
        ...source,
        tenantId,
        status: 'published',
        revision: Math.max(current.revision, Number(source?.revision) || 0) + 1,
        updatedAt: timestamp,
        publishedAt: timestamp
      }, { tenantId });
      const validation = validateConfig(config);
      if (!validation.valid) throw new Error(validation.errors.map(error => error.message).join(' '));
      const remoteResult = await writeRemote('published', config);
      if (requireRemoteWrites && !remoteResult.remoteSynced) {
        throw new Error(remoteResult.remoteError?.message || 'No se pudo publicar la configuración central.');
      }
      storage.setItem(createStorageKey(tenantId, 'published'), JSON.stringify(config));
      return { config, ...remoteResult };
    }

    function clearCache(stage) {
      if (VALID_STAGES.has(stage)) {
        storage.removeItem(createStorageKey(tenantId, stage));
        return;
      }
      VALID_STAGES.forEach(cacheStage => storage.removeItem(createStorageKey(tenantId, cacheStage)));
    }

    return {
      tenantId,
      load,
      loadDraft: () => load('draft'),
      loadPublished: () => load('published'),
      saveDraft,
      publish,
      clearCache
    };
  }

  function applyCssVariables(config, rootElement) {
    const normalized = normalizeConfig(config);
    activeConfig = deepFreeze(clone(normalized));
    const root = rootElement || globalScope.document?.documentElement;
    if (!root?.style?.setProperty) return normalized;
    const visuals = normalized.brand.visuals;
    const activeTheme = root.getAttribute?.('data-theme') || 'light';
    const tokens = createThemeTokens(visuals, activeTheme);
    const accessibleTextColor = tokens['--theme-ink'];
    const variables = {
      ...tokens,
      '--app-brand-primary': visuals.primaryColor,
      '--app-brand-accent': visuals.accentColor,
      '--app-brand-text': visuals.textColor,
      '--app-brand-action': visuals.actionColor,
      '--app-font-body': visuals.fontFamily,
      '--app-font-heading': visuals.headingFont,
      '--color-primary': visuals.primaryColor,
      '--color-accent-gold': visuals.accentColor,
      '--color-text-main': accessibleTextColor,
      '--bo-brand-primary': visuals.primaryColor,
      '--bo-brand-accent': visuals.accentColor,
      '--bo-brand-text': visuals.textColor,
      '--bo-brand-action': visuals.actionColor,
      '--bo-on-accent': getReadableForeground(visuals.accentColor),
      '--font-sans': visuals.fontFamily,
      '--font-serif': visuals.headingFont,
      '--font-display': visuals.headingFont
    };
    const aliases = {
      '--color-bg': '--theme-bg', '--color-card-bg': '--theme-surface',
      '--color-card-bg-alt': '--theme-elevated', '--color-surface-glass': '--theme-surface',
      '--color-text-muted': '--theme-muted', '--color-border-subtle': '--theme-line',
      '--color-border-accent': '--theme-accent', '--color-neutral-dark': '--theme-ink',
      '--color-neutral-light': '--theme-bg', '--color-neutral-stone': '--theme-elevated',
      '--color-b2b-bg': '--theme-bg', '--color-b2b-card': '--theme-surface', '--color-b2b-border': '--theme-line',
      '--color-primary-light': '--theme-action', '--color-success': '--theme-action',
      '--color-accent-gold-dark': '--theme-accent-ink', '--color-earth-brown': '--theme-primary-ink',
      '--bo-forest': '--theme-strong', '--bo-forest-soft': '--theme-strong-soft',
      '--bo-canvas': '--theme-bg', '--bo-paper': '--theme-surface', '--bo-ink': '--theme-ink',
      '--bo-muted': '--theme-muted', '--bo-line': '--theme-line', '--bo-cream': '--theme-on-strong',
      '--rc-bg': '--theme-bg', '--rc-surface': '--theme-surface', '--rc-card': '--theme-elevated',
      '--rc-card-border': '--theme-line', '--rc-gold': '--theme-accent', '--rc-cream': '--theme-ink',
      '--rc-muted': '--theme-muted', '--tv-accent-green': '--theme-action', '--tv-accent-gold': '--theme-accent',
      '--tv-bg-dark': '--theme-strong-soft', '--tv-card-bg': '--theme-strong'
    };
    for (const prefix of ['vendor', 'cash']) {
      Object.assign(aliases, {
        [`--${prefix}-forest`]: '--theme-strong', [`--${prefix}-forest-soft`]: '--theme-strong-soft',
        [`--${prefix}-gold`]: '--theme-accent', [`--${prefix}-gold-soft`]: '--theme-accent-soft',
        [`--${prefix}-leaf`]: '--theme-action', [`--${prefix}-leaf-dark`]: '--theme-action-ink',
        [`--${prefix}-paper`]: '--theme-surface', [`--${prefix}-ink`]: '--theme-ink',
        [`--${prefix}-muted`]: '--theme-muted', [`--${prefix}-line`]: '--theme-line',
        [`--${prefix}-cream`]: '--theme-bg', [`--${prefix}-earth`]: '--theme-accent-ink'
      });
    }
    Object.entries(aliases).forEach(([name, token]) => { variables[name] = tokens[token]; });
    Object.entries(variables).forEach(([name, value]) => root.style.setProperty(name, value));
    root.setAttribute?.('data-brand-theme', 'canonical');
    applyBrandContent(normalized, root.ownerDocument || globalScope.document);
    return normalized;
  }

  function loadBrandFonts(visuals, documentRef) {
    if (!documentRef?.head?.appendChild || !documentRef.createElement) return;
    const families = [...new Set([visuals.fontFamily, visuals.headingFont])]
      .filter(family => SAFE_FONT_FAMILIES.has(family))
      .map(family => family.split("'")[1]);
    const existingLinks = [...documentRef.querySelectorAll('link[rel="stylesheet"]')]
      .filter(link => !link.hasAttribute('data-brand-fonts'));
    const missing = families.filter(family => !existingLinks.some(link =>
      (link.href || '').replace(/\+/g, ' ').includes(`family=${family}:`)));
    if (!missing.length) return;
    const href = 'https://fonts.googleapis.com/css2?' + missing.map(family =>
      `family=${family.replace(/ /g, '+')}:wght@400;500;600;700;800`).join('&') + '&display=swap';
    let link = documentRef.querySelector('link[data-brand-fonts]');
    if (!link) {
      link = documentRef.createElement('link');
      link.rel = 'stylesheet';
      link.setAttribute('data-brand-fonts', '');
      documentRef.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
  }

  function applyBrandContent(config, documentRef = globalScope.document) {
    if (!documentRef?.querySelectorAll) return normalizeConfig(config);
    const normalized = normalizeConfig(config);
    const { visuals, texts } = normalized.brand;
    loadBrandFonts(visuals, documentRef);
    documentRef.querySelectorAll('#brand-logo-img, .brand-logo, .b2b-logo-img, .vendor-sidebar-brand img, .vendor-login-brand img, .footer-logo-img, .hero-service-brand img, .tablet-header img, .tv-header img, .perfil-header img, .rc-brand-logo, [data-app-brand-logo]')
      .forEach(image => {
        if (image.tagName !== 'IMG') return;
        image.src = visuals.logoUrl;
        image.alt = `${texts.name} — logo`;
      });
    documentRef.querySelectorAll('.saas-brand-name-display, .vendor-sidebar-brand strong, .vendor-login-brand strong, #saas-active-tenant-name, .footer-logo span, .footer-brand-info h3, .tablet-header h2, .tv-brand-title, .perfil-header-title h2, [data-app-brand-name]')
      .forEach(element => { element.textContent = texts.name; });
    const brandedLabels = {
      '.vendor-home-eyebrow': `Centro operativo · ${texts.name}`,
      '.vendor-sidebar-version': `${texts.name} · Centro operativo`,
      '.pos-ticket-subtitle': `${texts.name} · Mostrador POS`,
      '#cash-title, #vendor-home-cash-title': `Caja · ${texts.name}`,
      '.rc-brand-title': `${texts.name} · Reprocam`,
      '.hero-service-brand span': `Tu tienda ${texts.name}`
    };
    Object.entries(brandedLabels).forEach(([selector, label]) => {
      documentRef.querySelectorAll(selector).forEach(element => { element.textContent = label; });
    });
    documentRef.querySelectorAll('.hero-service-brand strong').forEach(element => { element.textContent = texts.slogan; });
    documentRef.querySelectorAll('.hero-eyebrow').forEach(element => { element.textContent = texts.slogan || texts.name; });
    documentRef.querySelectorAll('.vendor-login-brand, .header-logo-area').forEach(element => {
      element.setAttribute('aria-label', `Volver al inicio de ${texts.name}`);
    });
    for (const [key, value] of Object.entries({ product: texts.productTerm, vendor: texts.vendorTerm, warehouse: texts.warehouseTerm })) {
      documentRef.querySelectorAll(`.saas-term-${key}`).forEach(element => { element.textContent = value; });
    }
    const headerTitle = documentRef.querySelector('.brand-title');
    const headerSubtitle = documentRef.querySelector('.brand-subtitle');
    if (headerTitle) headerTitle.textContent = texts.name;
    if (headerSubtitle) headerSubtitle.textContent = texts.slogan;
    documentRef.querySelectorAll('[data-app-brand-slogan]').forEach(element => {
      element.textContent = texts.slogan;
    });
    const whatsappDigits = texts.whatsapp.replace(/\D/g, '');
    documentRef.querySelectorAll('[data-app-brand-whatsapp], [data-app-brand-whatsapp-cta]').forEach(whatsappLink => {
      if (whatsappLink.hasAttribute('data-app-brand-whatsapp')) {
        whatsappLink.textContent = texts.whatsapp;
      }
      whatsappLink.href = whatsappDigits ? `https://wa.me/${whatsappDigits}` : '#';
    });
    documentRef.querySelectorAll('[data-app-contact-row="whatsapp"]').forEach(whatsappRow => {
      whatsappRow.hidden = !whatsappDigits;
    });

    const instagramLink = documentRef.querySelector('[data-app-brand-instagram]');
    const instagramRow = documentRef.querySelector('[data-app-contact-row="instagram"]');
    const instagramValue = texts.instagram.trim();
    const instagramHandle = instagramValue.replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '');
    const instagramUrl = /^https:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9._/-]+$/i.test(instagramValue)
      ? instagramValue
      : (instagramHandle ? `https://www.instagram.com/${instagramHandle}/` : '#');
    if (instagramLink) {
      instagramLink.textContent = instagramValue;
      instagramLink.href = instagramUrl;
    }
    if (instagramRow) instagramRow.hidden = !instagramValue || instagramUrl === '#';

    const addressElement = documentRef.querySelector('[data-app-brand-address]');
    const addressRow = documentRef.querySelector('[data-app-contact-row="address"]');
    if (addressElement) addressElement.textContent = texts.address;
    if (addressRow) addressRow.hidden = !texts.address;
    documentRef.querySelectorAll('[data-app-brand-copyright]').forEach(element => {
      element.textContent = `© ${new Date().getFullYear()} ${texts.name}. Todos los derechos reservados.`;
    });
    const favicon = documentRef.querySelector('link[rel="icon"]');
    const appleIcon = documentRef.querySelector('link[rel="apple-touch-icon"]');
    if (favicon) favicon.href = visuals.faviconUrl;
    if (appleIcon) appleIcon.href = visuals.faviconUrl;
    if (documentRef.title) documentRef.title = texts.slogan ? `${texts.name} | ${texts.slogan}` : texts.name;
    return normalized;
  }

  function resolveTenantId() {
    try {
      const context = globalScope.SaasAuth?.getTenantContext?.();
      if (context?.isVerified && context.tenantId) return normalizeTenantId(context.tenantId);
    } catch (error) {
      // Authentication context is optional for public reads; default tenant remains a presentation fallback only.
    }
    return DEFAULT_TENANT_ID;
  }

  function getPresentationConfig(tenantId = resolveTenantId()) {
    const id = normalizeTenantId(tenantId);
    const cached = parseCachedConfig(resolveStorage(), createStorageKey(id, 'published'), id);
    if (activeConfig.tenantId === id && activeConfig.status === 'published'
      && activeConfig.revision > (cached?.revision || 0)) return clone(activeConfig);
    return cached || normalizeConfig({ tenantId: id });
  }

  async function bootstrap(options = {}) {
    const tenantId = normalizeTenantId(options.tenantId || resolveTenantId());
    const repository = createRepository({ ...options, tenantId });
    const config = await repository.loadPublished();
    applyCssVariables(config, options.rootElement);
    return { config, repository };
  }

  const api = {
    CONFIG_SCHEMA_VERSION,
    DEFAULT_CONFIG,
    sanitizeClientConfig,
    normalizeConfig,
    validateConfig,
    createStorageKey,
    createRepository,
    applyCssVariables,
    applyBrandContent,
    createThemeTokens,
    getReadableForeground,
    getPresentationConfig,
    resolveTenantId,
    getActiveTenantId: resolveTenantId,
    get,
    bootstrap
  };

  globalScope.AppConfig = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
