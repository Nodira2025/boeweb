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

  const DEFAULT_CONFIG_SOURCE = {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    tenantId: DEFAULT_TENANT_ID,
    revision: 0,
    status: 'published',
    updatedAt: null,
    publishedAt: null,
    brand: {
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
      allowBackorders: false,
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
    const explicitTenant = options.tenantId || sanitized.tenantId || sanitized.tenant_id;

    return {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      tenantId: normalizeTenantId(explicitTenant),
      revision: cleanNumber(sanitized.revision, 0, 0, Number.MAX_SAFE_INTEGER, true),
      status: cleanEnum(sanitized.status, ['draft', 'published'], 'published'),
      updatedAt: typeof sanitized.updatedAt === 'string' ? sanitized.updatedAt : null,
      publishedAt: typeof sanitized.publishedAt === 'string' ? sanitized.publishedAt : null,
      brand: {
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
    const root = rootElement || globalScope.document?.documentElement;
    if (!root?.style?.setProperty) return normalized;
    const visuals = normalized.brand.visuals;
    const variables = {
      '--app-brand-primary': visuals.primaryColor,
      '--app-brand-accent': visuals.accentColor,
      '--app-brand-text': visuals.textColor,
      '--app-brand-action': visuals.actionColor,
      '--app-font-body': visuals.fontFamily,
      '--app-font-heading': visuals.headingFont,
      '--color-primary': visuals.primaryColor,
      '--color-accent-gold': visuals.accentColor,
      '--color-text-main': visuals.textColor,
      '--font-sans': visuals.fontFamily,
      '--font-display': visuals.headingFont
    };
    Object.entries(variables).forEach(([name, value]) => root.style.setProperty(name, value));
    applyBrandContent(normalized, root.ownerDocument || globalScope.document);
    return normalized;
  }

  function applyBrandContent(config, documentRef = globalScope.document) {
    if (!documentRef?.querySelectorAll) return normalizeConfig(config);
    const normalized = normalizeConfig(config);
    const { visuals, texts } = normalized.brand;
    documentRef.querySelectorAll('#brand-logo-img, .brand-logo, .b2b-logo-img, [data-app-brand-logo]')
      .forEach(image => {
        if (image.tagName !== 'IMG') return;
        image.src = visuals.logoUrl;
        image.alt = `${texts.name} — logo`;
      });
    documentRef.querySelectorAll('.saas-brand-name-display, [data-app-brand-name]')
      .forEach(element => { element.textContent = texts.name; });
    const headerTitle = documentRef.querySelector('.brand-title');
    const headerSubtitle = documentRef.querySelector('.brand-subtitle');
    if (headerTitle) headerTitle.textContent = texts.name;
    if (headerSubtitle) headerSubtitle.textContent = texts.slogan;
    documentRef.querySelectorAll('[data-app-brand-slogan]').forEach(element => {
      element.textContent = texts.slogan;
    });
    const whatsappDigits = texts.whatsapp.replace(/\D/g, '');
    documentRef.querySelectorAll('[data-app-brand-whatsapp]').forEach(whatsappLink => {
      whatsappLink.textContent = texts.whatsapp;
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
    resolveTenantId,
    getActiveTenantId: resolveTenantId,
    bootstrap
  };

  globalScope.AppConfig = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
