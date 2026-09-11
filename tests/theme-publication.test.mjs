import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sources = ['app-config.js', 'theme.js', 'tenant-theme.js'].map(file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
const tenantA = '11111111-1111-1111-1111-111111111111';
const tenantB = '22222222-2222-2222-2222-222222222222';

function createBrowser() {
  const values = new Map();
  const attributes = new Map();
  const listeners = new Map();
  const storage = new Map();
  const root = { style: { setProperty: (key, value) => values.set(key, value) },
    setAttribute: (key, value) => attributes.set(key, value), getAttribute: key => attributes.get(key) };
  const document = { documentElement: root, title: 'Store', head: { appendChild() {} },
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
    createElement: () => ({ setAttribute() {} }) };
  root.ownerDocument = document;
  const window = { document, console, location: { pathname: '/vendedor.html' },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    addEventListener(name, callback) { const callbacks = listeners.get(name) || []; callbacks.push(callback); listeners.set(name, callbacks); },
    dispatchEvent(event) { for (const callback of listeners.get(event.type) || []) callback(event); } };
  const sandbox = vm.createContext({ window, document, localStorage: window.localStorage, console, setTimeout() {},
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } } });
  vm.runInContext(sources[0], sandbox);
  return { window, storage, values, sandbox, api: window.AppConfig,
    start() { vm.runInContext(sources[1], sandbox); vm.runInContext(sources[2], sandbox); } };
}

function brand(api, revision = 7, tenantId = tenantA) {
  return api.normalizeConfig({ tenantId, revision, status: 'published', brand: {
    texts: { name: 'Ferretería Industrial' },
    visuals: { primaryColor: '#0052CC', accentColor: '#FF9800', fontFamily: "'Inter', sans-serif" }
  } });
}

test('reload uses the tenant publication even when a stale global BÔ profile remains', () => {
  const browser = createBrowser();
  const config = brand(browser.api);
  browser.storage.set(browser.api.createStorageKey(tenantA), JSON.stringify(config));
  browser.storage.set('boeweb_tenant_profile_published', JSON.stringify({ brand_name: 'BÔ antiguo', primary_color: '#152D24' }));
  browser.start();
  browser.window.TenantTheme.applyTenantTheme(tenantA);
  assert.equal(browser.api.get('brand.texts.name'), 'Ferretería Industrial');
  assert.equal(browser.values.get('--vendor-forest'), '#0052CC');
  assert.equal(browser.values.get('--cash-gold'), '#FF9800');
  assert.equal(browser.values.get('--font-sans'), "'Inter', sans-serif");
  browser.window.dispatchEvent({ type: 'load' });
  assert.equal(browser.api.get('brand.texts.name'), 'Ferretería Industrial');
});

test('publication events update active tabs; drafts and other tenants do not leak into them', () => {
  const browser = createBrowser();
  browser.start();
  const config = brand(browser.api);
  const key = browser.api.createStorageKey(tenantA);
  browser.window.dispatchEvent({ type: 'storage', key, newValue: JSON.stringify(config) });
  assert.equal(browser.api.get('revision'), 7);
  const previousBackground = browser.values.get('--theme-bg');
  browser.window.toggleTheme();
  assert.notEqual(browser.values.get('--theme-bg'), previousBackground);
  assert.equal(browser.values.get('--vendor-gold'), '#FF9800');
  for (const event of [
    { key: browser.api.createStorageKey(tenantB), newValue: JSON.stringify(brand(browser.api, 20, tenantB)) },
    { key, newValue: JSON.stringify({ ...config, status: 'draft', revision: 21 }) },
    { key, newValue: JSON.stringify(brand(browser.api, 2)) }
  ]) browser.window.dispatchEvent({ type: 'storage', ...event });
  assert.equal(browser.api.get('revision'), 7);
});

test('same-page publish event consumes the new configuration instead of re-reading legacy storage', () => {
  const browser = createBrowser();
  browser.start();
  browser.window.dispatchEvent({ type: 'boeweb_brand_updated', detail: brand(browser.api, 10) });
  assert.equal(browser.api.get('revision'), 10);
  assert.equal(browser.values.get('--bo-brand-primary'), '#0052CC');
});

test('selected brand fonts are loaded on auxiliary pages without adding duplicate links', () => {
  const browser = createBrowser();
  const links = [];
  const document = browser.window.document;
  document.head.appendChild = link => links.push(link);
  document.createElement = () => ({
    attributes: new Set(),
    setAttribute(key) { this.attributes.add(key); },
    hasAttribute(key) { return this.attributes.has(key); }
  });
  document.querySelectorAll = selector => selector === 'link[rel="stylesheet"]' ? links : [];
  document.querySelector = selector => selector === 'link[data-brand-fonts]'
    ? links.find(link => link.hasAttribute('data-brand-fonts')) : null;
  const config = brand(browser.api);
  browser.api.applyCssVariables(config);
  browser.api.applyCssVariables(config);
  assert.equal(links.length, 1);
  assert.match(links[0].href, /family=Inter:wght/);
  assert.match(links[0].href, /family=Playfair\+Display:wght/);
});

test('an arbitrary local revision written during a read cannot override the server', async () => {
  const browser = createBrowser();
  const latest = brand(browser.api, 12);
  let release;
  const client = { from() { return { select() { return this; }, eq() { return this; },
    maybeSingle() { return new Promise(resolve => { release = resolve; }); } }; } };
  const repository = browser.api.createRepository({ tenantId: tenantA, storage: browser.window.localStorage, supabaseClient: client });
  const loading = repository.loadPublished();
  browser.storage.set(browser.api.createStorageKey(tenantA), JSON.stringify(latest));
  release({ data: { tenant_id: tenantA, stage: 'published', revision: 3, config_json: brand(browser.api, 3) } });
  assert.equal((await loading).revision, 3);
  assert.equal(JSON.parse(browser.storage.get(browser.api.createStorageKey(tenantA))).revision, 3);
});

test('the central theme replaces an inflated cached revision on screen and after load/mode changes', async () => {
  const browser = createBrowser();
  browser.storage.set(browser.api.createStorageKey(tenantA), JSON.stringify(brand(browser.api, 9999)));
  const actual = browser.api.normalizeConfig({ tenantId: tenantA, revision: 9, brand: { texts: { name: 'BÔ central' } } });
  browser.window.supabaseClient = { from() { return { select() { return this; }, eq() { return this; },
    async maybeSingle() { return { data: { tenant_id: tenantA, stage: 'published', revision: 9, config_json: actual } }; } }; } };
  browser.start();
  assert.equal(browser.api.get('revision'), 9999);
  await browser.window.refreshPublishedTheme({ force: true });
  browser.window.dispatchEvent({ type: 'load' });
  browser.window.toggleTheme();
  assert.equal(browser.api.get('revision'), 9);
  assert.equal(browser.api.get('brand.texts.name'), 'BÔ central');
  assert.equal(browser.window.TenantTheme.getProfile(tenantA).brand_name, 'BÔ central');
});

test('cross-tab updates do not replace the appearance of an admin editing a draft', () => {
  const browser = createBrowser();
  browser.start();
  browser.window.boeAdminConfigEditing = true;
  const draft = { ...brand(browser.api, 6), status: 'draft' };
  browser.api.applyCssVariables(draft);
  browser.window.dispatchEvent({ type: 'storage', key: browser.api.createStorageKey(tenantA), newValue: JSON.stringify(brand(browser.api, 8)) });
  assert.equal(browser.api.get('status'), 'draft');
  assert.equal(browser.api.get('revision'), 6);
});

test('a response from the previous tenant is not applied after the active tenant changes', async () => {
  const browser = createBrowser();
  let currentTenant = tenantA;
  let release;
  browser.window.SaasAuth = { getTenantContext: () => ({ isVerified: true, tenantId: currentTenant }) };
  browser.window.supabaseClient = { from() { return { select() { return this; }, eq() { return this; },
    maybeSingle() { return new Promise(resolve => { release = resolve; }); } }; } };
  browser.start();
  const loading = browser.window.refreshPublishedTheme({ force: true });
  currentTenant = tenantB;
  browser.api.applyCssVariables(brand(browser.api, 8, tenantB));
  release({ data: { tenant_id: tenantA, stage: 'published', revision: 9, config_json: brand(browser.api, 9) } });
  await loading;
  assert.equal(browser.api.get('tenantId'), tenantB);
  assert.equal(browser.api.get('revision'), 8);
});

function luminance(hex) {
  const linear = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function contrast(first, second) {
  const values = [luminance(first), luminance(second)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

test('brand, surface and accent text remain readable for preset and edge-case palettes', () => {
  const { api } = createBrowser();
  for (const primaryColor of ['#0052CC', '#152D24', '#FFFFFF', '#777777', '#B71C1C', '#008888']) {
    for (const accentColor of ['#FF9800', '#C2A246', '#777777', '#008888']) {
      for (const mode of ['light', 'dark']) {
        const config = api.normalizeConfig({ brand: { visuals: { primaryColor, accentColor } } });
        const tokens = api.createThemeTokens(config.brand.visuals, mode);
        for (const [foreground, background] of [['--theme-ink', '--theme-bg'], ['--theme-ink', '--theme-surface'],
          ['--theme-muted', '--theme-surface'], ['--theme-on-accent', '--theme-accent'], ['--theme-on-strong', '--theme-strong']]) {
          assert.ok(contrast(tokens[foreground], tokens[background]) >= 4.5, `${primaryColor}/${accentColor}/${mode} ${foreground}`);
        }
      }
    }
  }
});
