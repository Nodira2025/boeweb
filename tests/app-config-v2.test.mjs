import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import configPackage from '../app-config.js';

const {
  DEFAULT_CONFIG,
  CONFIG_SCHEMA_VERSION,
  normalizeConfig,
  validateConfig,
  createStorageKey,
  createRepository,
  sanitizeClientConfig
} = configPackage;

const expectedShape = {
  root: [
    'brand', 'catalog', 'payments', 'publishedAt', 'revision', 'rules', 'schemaVersion',
    'status', 'tenantId', 'updatedAt'
  ],
  brand: ['hero', 'texts', 'visuals'],
  hero: ['enabled', 'slides'],
  heroSlide: [
    'ctaText', 'durationSeconds', 'id', 'mediaUrl', 'overlayEnabled', 'subtitle',
    'targetUrl', 'title', 'type'
  ],
  visuals: [
    'accentColor', 'actionColor', 'faviconUrl', 'fontFamily', 'headingFont',
    'logoUrl', 'primaryColor', 'textColor'
  ],
  texts: [
    'address', 'instagram', 'name', 'productTerm', 'slogan', 'vendorTerm',
    'warehouseTerm', 'whatsapp'
  ],
  catalog: [
    'allowBackorders', 'currency', 'lowStockThreshold', 'showOutOfStock',
    'source', 'visibility'
  ],
  payments: ['bankTransfer', 'mercadoPago'],
  mercadoPago: ['enabled', 'publicKey'],
  bankTransfer: ['accountHolder', 'alias', 'bankName', 'cbu', 'enabled'],
  rules: ['cash', 'currentAccount', 'inventory', 'sales'],
  sales: ['allowVendorAdjustments', 'maxDiscountFixed', 'maxDiscountPercent', 'requireCustomerForCredit'],
  inventory: ['allowNegativeStock', 'requireLocationOnReceive'],
  cash: ['differenceTolerance', 'requireOpenShift', 'supervisorApprovalForDifference'],
  currentAccount: ['blockOverdue', 'enabled', 'requireCreditLimit']
};

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }

  dump() {
    return [...this.values.entries()];
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertExactKeys(value, keys, label) {
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} debe tener un shape canónico`);
}

function assertDeepFrozen(value, pathLabel = 'DEFAULT_CONFIG') {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, `${pathLabel} debe estar congelado`);
  for (const [key, child] of Object.entries(value)) {
    assertDeepFrozen(child, `${pathLabel}.${key}`);
  }
}

function buildTenantConfig(tenantId, name) {
  const input = clone(DEFAULT_CONFIG);
  input.tenantId = tenantId;
  input.status = 'draft';
  input.brand.texts.name = name;
  input.brand.texts.slogan = 'Configuración operativa de prueba';
  input.brand.visuals.primaryColor = '#123456';
  input.brand.hero.enabled = true;
  input.brand.hero.slides = [{
    id: 'hero-principal',
    type: 'image',
    mediaUrl: 'assets/hero-banner1.jpg',
    title: 'Portada de prueba',
    subtitle: 'Contenido administrable',
    targetUrl: '#catalog-section',
    ctaText: 'Ver catálogo',
    durationSeconds: 7,
    overlayEnabled: true
  }];
  input.catalog.currency = 'ARS';
  input.catalog.lowStockThreshold = 7;
  input.payments.mercadoPago.enabled = true;
  input.payments.mercadoPago.publicKey = 'APP_USR-1234567890-public-key-value';
  input.payments.bankTransfer.enabled = true;
  input.payments.bankTransfer.bankName = 'Banco Prueba';
  input.payments.bankTransfer.accountHolder = 'Marca de Prueba SA';
  input.payments.bankTransfer.cbu = '0000003100012345678901';
  input.payments.bankTransfer.alias = 'marca.prueba';
  input.rules.sales.maxDiscountPercent = 12.5;
  input.rules.sales.allowVendorAdjustments = true;
  input.rules.sales.maxDiscountFixed = 750;
  input.rules.cash.requireOpenShift = true;
  input.rules.cash.differenceTolerance = 100;
  input.rules.currentAccount.enabled = true;
  input.rules.currentAccount.requireCreditLimit = true;
  return input;
}

function collectKeys(value, result = []) {
  if (!value || typeof value !== 'object') return result;
  for (const [key, child] of Object.entries(value)) {
    result.push(key);
    collectKeys(child, result);
  }
  return result;
}

test('config v2 exporta un contrato completo y un DEFAULT_CONFIG profundamente inmutable', () => {
  assert.equal(Number.isInteger(CONFIG_SCHEMA_VERSION), true);
  assert.ok(CONFIG_SCHEMA_VERSION > 0);
  assert.equal(DEFAULT_CONFIG.schemaVersion, CONFIG_SCHEMA_VERSION);
  assert.equal(typeof normalizeConfig, 'function');
  assert.equal(typeof validateConfig, 'function');
  assert.equal(typeof createStorageKey, 'function');
  assert.equal(typeof createRepository, 'function');
  assert.equal(typeof sanitizeClientConfig, 'function');

  assertExactKeys(DEFAULT_CONFIG, expectedShape.root, 'config');
  assertExactKeys(DEFAULT_CONFIG.brand, expectedShape.brand, 'brand');
  assertExactKeys(DEFAULT_CONFIG.brand.visuals, expectedShape.visuals, 'brand.visuals');
  assertExactKeys(DEFAULT_CONFIG.brand.texts, expectedShape.texts, 'brand.texts');
  assertExactKeys(DEFAULT_CONFIG.brand.hero, expectedShape.hero, 'brand.hero');
  assertExactKeys(DEFAULT_CONFIG.catalog, expectedShape.catalog, 'catalog');
  assertExactKeys(DEFAULT_CONFIG.payments, expectedShape.payments, 'payments');
  assertExactKeys(DEFAULT_CONFIG.payments.mercadoPago, expectedShape.mercadoPago, 'payments.mercadoPago');
  assertExactKeys(DEFAULT_CONFIG.payments.bankTransfer, expectedShape.bankTransfer, 'payments.bankTransfer');
  assertExactKeys(DEFAULT_CONFIG.rules, expectedShape.rules, 'rules');
  assertExactKeys(DEFAULT_CONFIG.rules.sales, expectedShape.sales, 'rules.sales');
  assertExactKeys(DEFAULT_CONFIG.rules.inventory, expectedShape.inventory, 'rules.inventory');
  assertExactKeys(DEFAULT_CONFIG.rules.cash, expectedShape.cash, 'rules.cash');
  assertExactKeys(DEFAULT_CONFIG.rules.currentAccount, expectedShape.currentAccount, 'rules.currentAccount');
  assertDeepFrozen(DEFAULT_CONFIG);
});

test('normalizeConfig produce brand/catalog/rules canónicos, tipados y sin compartir referencias', () => {
  const input = buildTenantConfig('  tenant-a  ', '  Marca Norte  ');
  input.revision = '8';
  input.catalog.currency = ' usd ';
  input.catalog.lowStockThreshold = '9';
  input.rules.sales.maxDiscountPercent = '15.5';
  input.unknownRoot = 'descartar';
  input.brand.unknownBrandField = 'descartar';

  const normalized = normalizeConfig(input);

  assert.equal(normalized.tenantId, 'tenant-a');
  assert.equal(normalized.brand.texts.name, 'Marca Norte');
  assert.equal(normalized.catalog.currency, 'USD');
  assert.equal(normalized.revision, 8);
  assert.equal(normalized.catalog.lowStockThreshold, 9);
  assert.equal(normalized.rules.sales.maxDiscountPercent, 15.5);
  assert.equal(normalized.payments.mercadoPago.publicKey, 'APP_USR-1234567890-public-key-value');
  assert.equal(normalized.payments.bankTransfer.alias, 'MARCA.PRUEBA');
  assert.equal(normalized.brand.hero.slides[0].title, 'Portada de prueba');
  assertExactKeys(normalized.brand.hero.slides[0], expectedShape.heroSlide, 'brand.hero.slide');
  assert.equal(typeof normalized.rules.cash.requireOpenShift, 'boolean');
  assert.equal('unknownRoot' in normalized, false);
  assert.equal('unknownBrandField' in normalized.brand, false);
  assert.notEqual(normalized, input);
  assert.notEqual(normalized.brand, input.brand);
  assert.notEqual(normalized.rules.cash, input.rules.cash);
  assert.equal(input.tenantId, '  tenant-a  ', 'normalizar no debe mutar el input');

  assertExactKeys(normalized, expectedShape.root, 'config normalizada');
  assertExactKeys(normalized.brand.visuals, expectedShape.visuals, 'visuales normalizados');
  assertExactKeys(normalized.catalog, expectedShape.catalog, 'catálogo normalizado');
  assertExactKeys(normalized.payments, expectedShape.payments, 'pagos normalizados');
  assertExactKeys(normalized.rules, expectedShape.rules, 'reglas normalizadas');
});

test('validateConfig acepta la configuración normalizada y devuelve errores estructurados para reglas inválidas', () => {
  const validConfig = normalizeConfig(buildTenantConfig('tenant-validation', 'Marca Validada'));
  const validResult = validateConfig(validConfig);
  assert.deepEqual(validResult, { valid: true, errors: [] });

  const invalidConfig = clone(validConfig);
  invalidConfig.tenantId = '';
  invalidConfig.brand.visuals.primaryColor = 'javascript:alert(1)';
  invalidConfig.catalog.currency = '';
  invalidConfig.catalog.lowStockThreshold = -1;
  invalidConfig.rules.sales.maxDiscountPercent = 101;
  invalidConfig.rules.cash.differenceTolerance = -10;

  const invalidResult = validateConfig(invalidConfig);
  assert.equal(invalidResult.valid, false);
  assert.ok(invalidResult.errors.length >= 4, 'debe informar más de una violación, no detenerse en la primera');
  for (const error of invalidResult.errors) {
    assert.equal(typeof error.path, 'string');
    assert.ok(error.path.length > 0);
    assert.equal(typeof error.code, 'string');
    assert.ok(error.code.length > 0);
    assert.equal(typeof error.message, 'string');
    assert.ok(error.message.length > 0);
  }
  const paths = invalidResult.errors.map((error) => error.path);
  assert.ok(paths.some((value) => value.includes('tenantId')));
  assert.ok(paths.some((value) => value.includes('primaryColor')));
  assert.ok(paths.some((value) => value.includes('maxDiscountPercent')));
  assert.ok(paths.some((value) => value.includes('differenceTolerance')));
});

test('sanitizeClientConfig elimina secretos de manera recursiva sin borrar configuración pública', () => {
  const input = buildTenantConfig('tenant-safe', 'Marca Segura');
  input.secrets = { mpAccessToken: 'APP_USR-SECRET-DO-NOT-STORE' };
  input.accessToken = 'top-level-token';
  input.brand.texts.password = 'nested-password';
  input.catalog.credentials = {
    privateKey: '-----BEGIN PRIVATE KEY-----secret',
    harmless: 'also-discarded-because-parent-is-secret'
  };
  input.rules.cash.passcode = 'passcode-must-not-survive-7788';

  const sanitized = sanitizeClientConfig(input);
  const serialized = JSON.stringify(sanitized);
  const forbiddenKey = /token|secret|password|passcode|private.?key|credential/i;

  assert.equal(sanitized.tenantId, 'tenant-safe');
  assert.equal(sanitized.brand.texts.name, 'Marca Segura');
  assert.equal(collectKeys(sanitized).some((key) => forbiddenKey.test(key)), false);
  assert.doesNotMatch(serialized, /APP_USR-SECRET|top-level-token|nested-password|BEGIN PRIVATE KEY|passcode-must-not-survive/);
});

test('las claves de persistencia están separadas por tenant y por etapa draft/published', () => {
  assert.equal(createStorageKey('tenant-a'), 'boeweb:app-config:v2:tenant-a:published');
  assert.equal(createStorageKey('tenant-a', 'draft'), 'boeweb:app-config:v2:tenant-a:draft');
  assert.equal(createStorageKey('tenant-b', 'draft'), 'boeweb:app-config:v2:tenant-b:draft');
  assert.notEqual(createStorageKey('tenant-a', 'draft'), createStorageKey('tenant-b', 'draft'));
  assert.notEqual(createStorageKey('tenant-a', 'draft'), createStorageKey('tenant-a', 'published'));
});

test('repositorio: draft/publish es tenant-safe, no persiste secretos y devuelve copias aisladas', async () => {
  const storage = new MemoryStorage();
  const repoA = createRepository({ tenantId: 'tenant-a', storage });
  const repoB = createRepository({ tenantId: 'tenant-b', storage });
  const inputA = buildTenantConfig('tenant-a', 'Marca A');
  inputA.secrets = { mpAccessToken: 'APP_USR-TENANT-A-SECRET' };
  inputA.apiToken = 'tenant-a-api-token';

  const saved = await repoA.saveDraft(inputA);
  assert.equal(saved.config.tenantId, 'tenant-a');
  assert.equal(saved.config.status, 'draft');
  assert.equal(typeof saved.remoteSynced, 'boolean');

  inputA.brand.texts.name = 'Mutación posterior';
  const draftA = await repoA.loadDraft();
  assert.equal(draftA.brand.texts.name, 'Marca A');
  assert.equal(draftA.tenantId, 'tenant-a');

  draftA.brand.texts.name = 'Mutación de copia cargada';
  const reloadedA = await repoA.loadDraft();
  assert.equal(reloadedA.brand.texts.name, 'Marca A');

  const published = await repoA.publish();
  assert.equal(published.config.status, 'published');
  assert.ok(published.config.revision >= saved.config.revision);
  const publishedA = await repoA.loadPublished();
  assert.equal(publishedA.brand.texts.name, 'Marca A');
  assert.equal(publishedA.tenantId, 'tenant-a');

  const draftB = await repoB.saveDraft(buildTenantConfig('tenant-b', 'Marca B'));
  assert.equal(draftB.config.tenantId, 'tenant-b');
  assert.equal((await repoB.loadDraft()).brand.texts.name, 'Marca B');
  assert.equal((await repoA.loadPublished()).brand.texts.name, 'Marca A');

  const persisted = storage.dump().map(([, value]) => value).join('\n');
  assert.doesNotMatch(persisted, /APP_USR-TENANT-A-SECRET|tenant-a-api-token/);
  assert.ok(storage.dump().some(([key]) => key === createStorageKey('tenant-a', 'draft')));
  assert.ok(storage.dump().some(([key]) => key === createStorageKey('tenant-a', 'published')));
  assert.ok(storage.dump().some(([key]) => key === createStorageKey('tenant-b', 'draft')));
});

test('el panel administrativo falla cerrado si la configuración central no confirma la escritura', async () => {
  const storage = new MemoryStorage();
  const repository = createRepository({
    tenantId: 'tenant-central',
    storage,
    requireRemoteWrites: true
  });

  await assert.rejects(
    repository.saveDraft(buildTenantConfig('tenant-central', 'Marca Central')),
    /configuración central/i
  );
  assert.equal(storage.getItem(createStorageKey('tenant-central', 'draft')), null);
});

test('app-config.js no contiene credenciales reales embebidas en el bundle cliente', () => {
  const source = fs.readFileSync(path.resolve('app-config.js'), 'utf8');
  const jwtCandidates = source.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];

  for (const token of jwtCandidates) {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    assert.notEqual(payload.role, 'service_role', 'nunca debe enviarse una service-role key al cliente');
  }

  assert.doesNotMatch(source, /APP_USR-[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(source, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/);
  assert.doesNotMatch(source, /(?:service[_-]?role|client[_-]?secret|private[_-]?key)\s*[:=]\s*['"][^'"]{12,}['"]/i);
});

test('panel admin integra estilos/config/auth y expone Visuales, Textos, Catálogo, Reglas, draft y publicación', () => {
  const html = fs.readFileSync(path.resolve('admin-config.html'), 'utf8');
  const authScript = html.search(/<script\s+[^>]*src=["']saas-auth\.js/i);
  const configScript = html.search(/<script\s+[^>]*src=["']app-config\.js/i);
  const adminScript = html.search(/<script\s+[^>]*src=["']admin-config\.js/i);

  assert.match(html, /<link\s+[^>]*href=["']app-config\.css/i);
  assert.ok(authScript >= 0 && configScript > authScript && adminScript > configScript, 'auth y config deben cargar antes del controlador admin');
  assert.match(html, /id=["']admin-dashboard-content["'][^>]*style=["'][^"']*display\s*:\s*none/i);
  for (const sectionId of ['app-config-visuals', 'app-config-texts', 'app-config-catalog', 'app-config-rules']) {
    assert.match(html, new RegExp(`id=["']${sectionId}["']`, 'i'));
  }
  assert.match(html, /onclick=["']saveFutureAppConfigDraft\(\)["'][^>]*>\s*Guardar borrador/i);
  assert.match(html, /onclick=["']publishFutureAppConfig\(\)["'][^>]*>\s*Publicar configuración/i);
});

test('panel admin sólo recibe contraseña de sesión Supabase y no recrea passcodes/tokens locales', () => {
  const html = fs.readFileSync(path.resolve('admin-config.html'), 'utf8');
  const source = fs.readFileSync(path.resolve('admin-config.js'), 'utf8');
  const inputs = [...html.matchAll(/<input\b[^>]*>/gi)].map((match) => match[0]);
  const passwordInputs = inputs.filter((tag) => /\btype=["']password["']/i.test(tag));

  assert.match(html, /<input\b[^>]*type=["']email["'][^>]*id=["']admin-session-email["']/i);
  assert.equal(passwordInputs.length, 1, 'sólo debe existir la contraseña transitoria de la sesión');
  assert.match(passwordInputs[0], /id=["']admin-session-password["']/i);
  assert.match(passwordInputs[0], /autocomplete=["']current-password["']/i);
  assert.equal(inputs.some((tag) => /id=["'][^"']*(?:access-token|passcode|secret|private-key)/i.test(tag)), false);
  assert.doesNotMatch(html, /id=["']mp-access-token["']/i);
  assert.doesNotMatch(source, /\bmpAccessToken\b|\baccessToken\b/i);
  assert.doesNotMatch(source, /localStorage\.setItem\s*\([^,]*(?:passcode|password|token|secret)/i);
  assert.match(source, /localStorage\.removeItem\s*\(\s*['"]boeweb_admin_passcode['"]\s*\)/i);
  assert.match(source, /window\.AppConfig(?:\?\.)?\.sanitizeClientConfig\s*\(|window\.AppConfig\?\.sanitizeClientConfig\s*\(/i);
});

test('panel admin autentica con Supabase y revalida ADMIN/SUPERADMIN antes de guardar o publicar', () => {
  const source = fs.readFileSync(path.resolve('admin-config.js'), 'utf8');

  assert.match(source, /window\.SaasAuth\.signInWithSupabase\s*\(/);
  assert.match(source, /window\.SaasAuth\.hydrateFromSupabase\s*\(/);
  assert.match(source, /context\.isVerified\s*&&\s*\[['"]ADMIN['"],\s*['"]SUPERADMIN['"]\]\.includes\(context\.role\)/);
  assert.match(source, /function\s+ensureAdministrativeContext\s*\([^)]*\)[\s\S]*?\[['"]ADMIN['"],\s*['"]SUPERADMIN['"]\]\.includes\(context\.role\)/);
  assert.match(source, /async function saveFutureAppConfigDraft\s*\([^)]*\)\s*\{[\s\S]*?ensureAdministrativeContext\s*\(\)[\s\S]*?\.saveDraft\s*\(/);
  assert.match(source, /async function saveAdminConfig\s*\([^)]*\)\s*\{[\s\S]*?ensureAdministrativeContext\s*\(\)[\s\S]*?\.publish\s*\(/);
  assert.match(source, /passwordInput\.value\s*=\s*['"]['"]/);
  assert.match(source, /requireRemoteWrites:\s*true/);
  assert.doesNotMatch(source, /\.from\s*\(\s*['"]tenant_profiles['"]\s*\)/);
  assert.doesNotMatch(source, /localStorage\.setItem\s*\(\s*['"]boeweb_(?:hero_slides|tenant_profile_)/);
});

test('bridge Mercado Pago del navegador envía identidad/cantidad, nunca precio ni credenciales', () => {
  const bridge = fs.readFileSync(path.resolve('mercadopago-checkout.js'), 'utf8');
  const admin = fs.readFileSync(path.resolve('admin-config.js'), 'utf8');
  const storefront = fs.readFileSync(path.resolve('index.js'), 'utf8');
  const itemMapping = /orderData\.items\.map\s*\([^=]*=>\s*\(\{([\s\S]*?)\}\)\)/.exec(bridge);

  assert.ok(itemMapping, 'el bridge debe construir un payload explícito por ítem');
  const mappedKeys = [...itemMapping[1].matchAll(/\b([a-z_]+)\s*:/gi)].map((match) => match[1]).sort();
  assert.deepEqual(mappedKeys, ['product_id', 'quantity']);
  assert.match(bridge, /fetch\s*\(\s*['"]\/\.netlify\/functions\/create-payment-preference['"]/);
  assert.doesNotMatch(bridge, /mpAccessToken|MERCADOPAGO_ACCESS_TOKEN|Authorization\s*:/i);
  assert.doesNotMatch(admin, /\bmpAccessToken\b|\baccessToken\b/i);
  assert.doesNotMatch(storefront, /\bmpAccessToken\b|\baccessToken\b/i);
});

test('endpoint Mercado Pago fija tenant/credenciales por env y crea orden canónica antes de cotizar', () => {
  const endpoint = fs.readFileSync(path.resolve('netlify', 'functions', 'create-payment-preference.mjs'), 'utf8');
  const normalizer = /export function normalizeRequest\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/.exec(endpoint);

  assert.ok(normalizer);
  assert.match(normalizer[1], /process\.env\.(?:PUBLIC_TENANT_ID|DEFAULT_TENANT_ID)/);
  assert.doesNotMatch(normalizer[1], /body\.(?:tenantId|tenant_id|price|unit_price|total)/);
  assert.match(normalizer[1], /return\s*\{\s*product_id\s*:\s*productId\s*,\s*quantity\s*\}/);
  assert.match(endpoint, /\.rpc\s*\(\s*['"]create_public_order_v2['"]/);
  assert.match(endpoint, /process\.env\.MERCADOPAGO_ACCESS_TOKEN/);
  assert.match(endpoint, /requireServerConfig\s*\(\s*\)/);
  assertOrderedSource(endpoint, [
    /const\s+order\s*=\s*await\s+createCanonicalOrder\s*\(\s*supabaseAdmin\s*,\s*input\s*\)/,
    /const\s+preference\s*=\s*await\s+createMercadoPagoPreference\s*\(\s*order\s*,\s*input\s*\)/
  ]);
  assert.doesNotMatch(endpoint, /(?:MERCADOPAGO_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY)\s*(?:=|:)\s*['"][^'"]+['"]/);
});

test('storefront, vendedor y admin cargan AppConfig y no operan la tabla legacy store_config', () => {
  const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
  const vendorHtml = fs.readFileSync(path.resolve('vendedor.html'), 'utf8');
  const browserSources = ['index.js', 'admin-config.js', 'app-config.js']
    .map((file) => fs.readFileSync(path.resolve(file), 'utf8'))
    .join('\n');

  assert.match(indexHtml, /<script\s+[^>]*src=["']app-config\.js/i);
  assert.match(vendorHtml, /<script\s+[^>]*src=["']app-config\.js/i);
  assert.doesNotMatch(browserSources, /\.from\s*\(\s*['"]store_config['"]\s*\)/);
  assert.match(fs.readFileSync(path.resolve('app-config.js'), 'utf8'), /['"]tenant_app_config['"]/);
  const hero = fs.readFileSync(path.resolve('hero-slider.js'), 'utf8');
  assert.match(hero, /boeStorefrontAppConfig/);
  assert.match(hero, /boeweb_app_config_loaded/);
  assert.match(hero, /brand\.hero/);
  assert.match(hero, /escapeHeroHtml/);
});

test('el portal vendedor enlaza el panel de configuración sólo para roles administrativos', () => {
  const html = fs.readFileSync(path.resolve('vendedor.html'), 'utf8');
  const source = fs.readFileSync(path.resolve('vendedor.js'), 'utf8');

  assert.match(html, /href=["']admin-config\.html["'][^>]*data-admin-config-link[^>]*hidden/i);
  assert.match(source, /querySelectorAll\s*\(\s*['"]\[data-admin-config-link\]['"]\s*\)/);
  assert.match(source, /\[['"]ADMIN['"],\s*['"]SUPERADMIN['"]\]\.includes\(String\(authContext\.role/);
  assert.match(source, /link\.hidden\s*=\s*!canManageConfiguration/);
});

function assertOrderedSource(source, expressions) {
  let cursor = -1;
  for (const expression of expressions) {
    const relative = source.slice(cursor + 1).search(expression);
    assert.notEqual(relative, -1, `no se encontró ${expression}`);
    cursor += relative + 1;
  }
}
