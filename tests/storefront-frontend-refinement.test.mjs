import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import AppConfig from '../app-config.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const storefrontCss = fs.readFileSync(new URL('../storefront.css', import.meta.url), 'utf8');

function collectCssVariables(config, theme = 'light') {
  const values = new Map();
  const documentRef = {
    title: '',
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const root = {
    ownerDocument: documentRef,
    getAttribute(name) { return name === 'data-theme' ? theme : null; },
    style: {
      setProperty(name, value) { values.set(name, value); }
    }
  };
  AppConfig.applyCssVariables(config, root);
  return values;
}

test('storefront: el comprobante de pedido queda fuera del panel móvil de filtros', () => {
  assert.match(
    html,
    /mobile-filter-drawer-footer[\s\S]*?<\/button>\s*<\/div>\s*<\/div>\s*<!-- WEB ORDER PRE-PURCHASE RECEIPT MODAL -->/
  );
});

test('storefront: el hero explica stock y plazos sin perder las acciones existentes', () => {
  assert.match(html, /Stock propio y a pedido/i);
  assert.match(html, /Sabé cuándo llega/i);
  assert.match(html, /data-app-brand-whatsapp-cta/);
  assert.match(html, /id="wheel-trigger-hero"/);
  assert.doesNotMatch(html, /\+2\.200/);
});

test('storefront: la configuración white-label publica tokens de marca con contraste seguro', () => {
  const vividConfig = AppConfig.normalizeConfig({
    brand: {
      visuals: {
        primaryColor: '#14992A',
        accentColor: '#3EAF3C',
        textColor: '#DFF2B5'
      }
    }
  });
  const vividVariables = collectCssVariables(vividConfig);
  assert.equal(vividVariables.get('--bo-brand-primary'), '#14992A');
  assert.equal(vividVariables.get('--bo-brand-accent'), '#3EAF3C');
  assert.equal(vividVariables.get('--bo-on-accent'), '#152D24');
  assert.equal(vividVariables.get('--bo-brand-text'), '#DFF2B5');
  assert.equal(vividVariables.get('--color-text-main'), '#152D24');

  const midToneVariables = collectCssVariables(AppConfig.normalizeConfig({
    brand: { visuals: { accentColor: '#777777' } }
  }));
  assert.equal(midToneVariables.get('--bo-on-accent'), '#000000');

  const darkConfig = AppConfig.normalizeConfig({
    brand: { visuals: { accentColor: '#152D24', textColor: '#152D24' } }
  });
  const darkVariables = collectCssVariables(darkConfig, 'dark');
  assert.equal(darkVariables.get('--bo-on-accent'), '#F6F3E8');
  assert.equal(darkVariables.get('--color-text-main'), '#F6F3E8');
});

test('storefront: los controles móviles conservan texto legible y los diálogos cerrados no reciben foco', () => {
  assert.match(storefrontCss, /#sort-select\s*\{[\s\S]*?color:\s*var\(--bo-ink\)\s*!important/);
  assert.match(storefrontCss, /\.modal-backdrop:not\(\.active\):not\(#web-order-receipt-modal\)\s*\{\s*visibility:\s*hidden/);
  assert.match(html, /class="results-count" role="status" aria-live="polite"/);
  assert.match(html, /class="header-logo-area" aria-label="Volver al inicio/);
  assert.match(html, /id="cart-count" role="status" aria-live="polite"/);
  assert.match(html, /id="mobile-cart-count" aria-hidden="true"/);
});
