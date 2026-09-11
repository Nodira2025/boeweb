import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import AppConfig from '../app-config.js';

const tenantId = '11111111-1111-1111-1111-111111111111';
const contentFields = AppConfig.SITE_CONTENT_FIELDS;

function element(attributes = {}, text = '') {
  return { attributes, textContent: text, hidden: false, href: '',
    hasAttribute: key => Object.hasOwn(attributes, key), getAttribute: key => attributes[key] ?? null,
    setAttribute(key, value) { attributes[key] = value; } };
}
function documentWith(nodes) {
  function matches(node, selector) {
    const attr = selector.trim().match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    return !!attr && node.hasAttribute(attr[1]) && (attr[2] === undefined || node.getAttribute(attr[1]) === attr[2]);
  }
  return { title: 'Tienda', querySelector: () => null,
    querySelectorAll: selector => nodes.filter(node => selector.split(',').some(part => matches(node, part))) };
}

test('content is normalized, bounded, isolated, immutable by default and preserves explicit blanks', () => {
  const input = { brand: { content: { homeTitle: '<b>Hola</b>', footerNote: '', homeEnabled: false, contactEnabled: false, homeDescription: 'x'.repeat(2000), unknown: 'discard' } } };
  const result = AppConfig.normalizeConfig(input);
  assert.equal(result.brand.content.homeTitle, '<b>Hola</b>');
  assert.equal(result.brand.content.homeDescription.length, 500);
  assert.equal(result.brand.content.footerNote, '');
  assert.equal(result.brand.content.homeEnabled, false);
  assert.equal(result.brand.content.contactEnabled, false);
  assert.equal('unknown' in result.brand.content, false);
  assert.ok(Object.isFrozen(AppConfig.DEFAULT_CONFIG.brand.content));
  assert.ok(contentFields.every(Object.isFrozen));
  result.brand.content.homeTitle = 'changed';
  assert.equal(input.brand.content.homeTitle, '<b>Hola</b>');
  for (const content of [null, [], 'invalid']) assert.equal(AppConfig.normalizeConfig({ brand: { content } }).brand.content.homeTitle, 'Elegí hoy.');
});

test('texts and section visibility survive draft/publish/reload including another repository', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const first = AppConfig.createRepository({ tenantId, storage });
  const config = AppConfig.normalizeConfig({ brand: { content: { homeTitle: 'Título compartido', homeEnabled: false, footerNote: '' }, texts: { mapsUrl: 'https://maps.app.goo.gl/example', facebookUrl: 'https://www.facebook.com/example' } } });
  await first.saveDraft(config);
  await first.publish();
  const next = await AppConfig.createRepository({ tenantId, storage }).loadPublished();
  assert.equal(next.brand.content.homeTitle, 'Título compartido');
  assert.equal(next.brand.content.homeEnabled, false);
  assert.equal(next.brand.texts.mapsUrl, config.brand.texts.mapsUrl);
});

test('all contact links use the published contact and hide when cleared, preserving CTA labels', () => {
  const first = element({ 'data-app-brand-whatsapp-cta': '' }, 'Asesor');
  const second = element({ 'data-app-brand-whatsapp-cta': '', 'data-whatsapp-message': 'hola & gracias' }, 'Contacto');
  const insta = element({ 'data-app-brand-instagram-cta': '' }, 'Instagram');
  const instaFooter = element({ 'data-app-brand-instagram': '' });
  const map = element({ 'data-app-brand-maps-cta': '' });
  const title = element({ 'data-site-text': 'homeTitle' });
  const home = element({ 'data-site-section': 'home' });
  const developer = element({ 'data-developer-credit': '' }, 'PULSO');
  const doc = documentWith([first, second, insta, instaFooter, map, title, home, developer]);
  AppConfig.applyBrandContent(AppConfig.normalizeConfig({ brand: { texts: { whatsapp: '+54 9 381 1234567', instagram: '@tienda', mapsUrl: 'https://maps.app.goo.gl/example' }, content: { homeTitle: '<img src=x onerror=alert(1)>', homeEnabled: false } } }), doc);
  assert.equal(first.href, 'https://wa.me/5493811234567');
  assert.equal(first.textContent, 'Asesor');
  assert.equal(second.href, 'https://wa.me/5493811234567?text=hola%20%26%20gracias');
  assert.equal(insta.href, instaFooter.href);
  assert.equal(insta.textContent, 'Instagram');
  assert.equal(title.textContent, '<img src=x onerror=alert(1)>', 'assigned as text, never HTML');
  assert.equal(home.hidden, true);
  assert.equal(developer.textContent, 'PULSO');
  AppConfig.applyBrandContent(AppConfig.normalizeConfig(), doc);
  assert.ok([first, second, insta, instaFooter, map].every(link => link.hidden && link.href === '#'));
  assert.equal(home.hidden, false);
});

test('contact validation rejects unsafe URLs, malformed phone numbers and fake Instagram hosts', () => {
  for (const texts of [{ mapsUrl: 'javascript:alert(1)' }, { facebookUrl: 'https://user:pass@example.com/' }, { whatsapp: '123' }, { instagram: 'https://instagram.com.evil.test/shop' }]) {
    assert.equal(AppConfig.validateConfig(AppConfig.normalizeConfig({ brand: { texts } })).valid, false);
  }
  assert.equal(AppConfig.getWhatsappUrl('Hola', AppConfig.normalizeConfig()), '');
  assert.equal(AppConfig.getContactLinks({ brand: { texts: { instagram: 'https://www.instagram.com/tienda/?igsh=compartido' } } }).instagram, 'https://www.instagram.com/tienda/');
  assert.equal(AppConfig.getWhatsappUrl('Hola', AppConfig.normalizeConfig({ brand: { texts: { whatsapp: '+5493811234567' } } })), 'https://wa.me/5493811234567?text=Hola');
});

test('YouTube watch, share, mobile, shorts and embeds resolve to one controlled iframe URL', () => {
  for (const url of ['https://youtu.be/M7lc1UVf-VE?si=example', 'https://www.youtube.com/watch?x=1&v=M7lc1UVf-VE', 'https://m.youtube.com/watch?v=M7lc1UVf-VE', 'https://youtube.com/shorts/M7lc1UVf-VE', 'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE']) {
    const media = AppConfig.getHeroMedia({ type: 'video', mediaUrl: url });
    assert.equal(media.kind, 'youtube');
    assert.equal(media.src, 'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?playsinline=1&rel=0');
    assert.equal(media.watchUrl, 'https://www.youtube.com/watch?v=M7lc1UVf-VE');
  }
});

test('videos reject unsupported or spoofed links and accept direct MP4/WebM assets', () => {
  for (const url of ['javascript:alert(1)', 'https://youtube.com.evil.test/watch?v=M7lc1UVf-VE', 'https://evil@youtube.com/watch?v=M7lc1UVf-VE', 'https://youtu.be/invalid', 'https://example.com/page', '']) {
    assert.equal(AppConfig.getHeroMedia({ type: 'video', mediaUrl: url }).kind, 'invalid', url);
  }
  for (const url of ['assets/video.mp4', 'https://example.com/video.WEBM?version=2']) assert.equal(AppConfig.getHeroMedia({ type: 'video', mediaUrl: url }).kind, 'video');
  const invalid = AppConfig.normalizeConfig({ brand: { hero: { enabled: true, slides: [{ type: 'video', mediaUrl: 'https://example.com/page' }] } } });
  assert.equal(AppConfig.validateConfig(invalid).valid, false);
});

test('the admin escapes banner fields and rejects unfinished media before attempting a publication', async () => {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', innerHTML: '', checked: false, style: {}, dataset: {}, setAttribute() {}, addEventListener() {} });
    return nodes.get(id);
  };
  const document = { getElementById: node, querySelectorAll: () => [], addEventListener() {} };
  const window = { AppConfig, SaasAuth: { getTenantContext: () => ({ isVerified: true, role: 'ADMIN', tenantId }) } };
  const sandbox = vm.createContext({ window, document, console, URL, setTimeout() {} });
  vm.runInContext(fs.readFileSync(new URL('../admin-config.js', import.meta.url), 'utf8'), sandbox);
  vm.runInContext(`heroSlidesState = [{type:'image', media_url:'assets/logo.jpg', title:'\" onfocus=\"alert(1)', subtitle:'<script>bad</script>'}]; renderHeroSlidesManager();`, sandbox);
  assert.ok(node('hero-slides-container').innerHTML.includes('&quot; onfocus=&quot;alert(1)'));
  assert.ok(!node('hero-slides-container').innerHTML.includes('<script>bad</script>'));
  vm.runInContext(`adminTenantContext = { tenantId:'${tenantId}' }; heroSlidesState = [{type:'video',media_url:''}]; appConfigRepository = { async publish() { throw new Error('unexpected write'); } };`, sandbox);
  await window.saveAdminConfig();
  assert.match(node('admin-page-save-state').textContent, /Banner 1/);
});

test('every configured text has an admin field and a storefront consumer; contact and credit remain separate', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const field of contentFields) assert.ok(html.includes(`data-site-text="${field.key}"`), field.key);
  assert.doesNotMatch(html, /href="https:\/\/(?:wa\.me\/549381|www\.instagram\.com\/bo\.growclub|www\.facebook\.com\/p\/BO-growclub)/);
  assert.match(html, /assets\/pulso-developer-logo\.png/);
  const source = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /const waPhone = "549381/);
  assert.equal((source.match(/AppConfig\.getWhatsappUrl\(/g) || []).length, 3);
});

test('YouTube slides stop automatic rotation, remove inactive players and have accessible fallback controls', () => {
  const source = fs.readFileSync(new URL('../hero-slider.js', import.meta.url), 'utf8');
  assert.match(source, /kind === 'youtube'\) return/);
  assert.match(source, /iframe\.removeAttribute\('src'\)/);
  assert.match(source, /el\.inert = !active/);
  assert.match(source, /referrerpolicy="strict-origin-when-cross-origin"/);
  assert.match(source, /Ver en YouTube/);
  assert.match(source, /Pausar rotación/);
  assert.match(source, /if \(slideTimer\) clearTimeout\(slideTimer\)/);
});

test('slider lifecycle respects the latest publication, media visibility, pause and reduced motion', () => {
  const timers = new Set();
  const events = new Map();
  const controls = new Map();
  let reducedMotion = false;
  let config = AppConfig.normalizeConfig({ brand: { hero: { enabled: true, slides: [
    { type: 'video', mediaUrl: 'https://youtu.be/M7lc1UVf-VE', title: 'Actual' },
    { type: 'image', mediaUrl: 'assets/logo.jpg' }
  ] } } });
  const classes = () => { const values = new Set(); return { add: value => values.add(value), remove: value => values.delete(value) }; };
  const frame = element({ 'data-src': AppConfig.getHeroMedia(config.brand.hero.slides[0]).src });
  frame.removeAttribute = key => delete frame.attributes[key];
  Object.defineProperty(frame, 'src', { set(value) { frame.attributes.src = value; } });
  const slides = [0, 1].map(index => ({ ...element(), classList: classes(), querySelector: selector => selector === 'iframe' && index === 0 ? frame : null }));
  const wrapper = { innerHTML: '', removed: false, remove() { this.removed = true; },
    querySelectorAll: () => [], addEventListener() {}, querySelector(selector) {
      if (!controls.has(selector)) controls.set(selector, { ...element(), addEventListener(name, callback) { this[name] = callback; } });
      return controls.get(selector);
    }
  };
  const hero = { querySelector: selector => selector === '.hero-container' ? { classList: classes() } : wrapper };
  const document = { readyState: 'loading', addEventListener() {}, getElementById: () => hero,
    querySelectorAll: selector => selector === '.hero-slide-item' ? slides : [] };
  const window = { AppConfig: { ...AppConfig, getPresentationConfig: () => config },
    boeStorefrontAppConfig: AppConfig.normalizeConfig(),
    matchMedia: () => ({ matches: reducedMotion }), addEventListener: (name, callback) => events.set(name, callback) };
  const sandbox = vm.createContext({ window, document, console, setTimeout(callback) { timers.add(callback); return callback; }, clearTimeout: timer => timers.delete(timer) });
  vm.runInContext(fs.readFileSync(new URL('../hero-slider.js', import.meta.url), 'utf8'), sandbox);
  window.initHeroSlider();
  assert.match(wrapper.innerHTML, /Actual/);
  assert.equal(timers.size, 0, 'YouTube is never interrupted by automatic rotation');
  assert.equal(slides[0].inert, false);
  assert.equal(slides[1].inert, true);
  assert.ok(frame.attributes.src);
  controls.get('#hero-slider-next-btn').click({ stopPropagation() {} });
  assert.equal(frame.attributes.src, undefined);
  assert.equal(slides[0].inert, true);
  assert.equal(timers.size, 1);
  controls.get('.hero-slider-pause').click();
  assert.equal(timers.size, 0);
  events.get('boeweb_app_config_loaded')();
  assert.equal(slides[0].inert, true, 'an unchanged publication preserves the selected image');
  assert.equal(controls.get('.hero-slider-pause').attributes['aria-pressed'], 'true');
  assert.equal(timers.size, 0);
  config.brand.hero.slides = [config.brand.hero.slides[1]];
  config.brand.hero.slides[0].title = 'Nueva publicación';
  events.get('boeweb_app_config_loaded')();
  assert.match(wrapper.innerHTML, /Nueva publicación/);
  assert.equal(timers.size, 0, 'a single banner does not reload itself');
  config.brand.hero.slides.push({ ...config.brand.hero.slides[0] });
  reducedMotion = true;
  window.initHeroSlider();
  assert.equal(timers.size, 0);
  config.brand.content.homeEnabled = false;
  window.initHeroSlider();
  assert.equal(wrapper.removed, true);
  assert.equal(timers.size, 0);
});
