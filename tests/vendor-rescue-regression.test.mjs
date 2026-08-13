import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('vendedor.html', 'utf8');
const vendorJs = fs.readFileSync('vendedor.js', 'utf8');
const saasAuthJs = fs.readFileSync('saas-auth.js', 'utf8');

test('portal vendedor conserva sus secciones dentro del contenedor autenticado', () => {
  const portalStart = html.indexOf('<div id="vendedor-portal-app"');
  const scriptsStart = html.indexOf('<script src=', portalStart);
  const portalMarkup = html.slice(portalStart, scriptsStart);

  assert.ok(portalStart >= 0);
  assert.match(portalMarkup, /<header class="b2b-header">/);
  assert.match(portalMarkup, /id="vendor-dashboard-home"/);
  assert.match(portalMarkup, /id="vendor-internal-catalog-section"/);
});

test('navegación lateral y barra móvil están cerradas correctamente', () => {
  assert.match(html, /<nav class="vendor-side-nav"[\s\S]*?<\/nav>[\s\S]*?<div class="vendor-sidebar-tools"/);
  assert.match(html, /id="b2b-mobile-home-btn"[\s\S]*?<\/button>[\s\S]*?id="b2b-mobile-cart-btn"/);
  assert.match(html, /id="b2b-mobile-cart-btn"[\s\S]*?<\/button>[\s\S]*?<\/div>[\s\S]*?<!-- Toast Notification -->/);
});

test('funciones SaaS simuladas no se muestran en el portal operativo', () => {
  assert.match(html, /\.saas-prototype-only,[\s\S]*?display: none !important/);
  assert.match(html, /id="saas-header-bar" class="vendor-header-context saas-prototype-only"/);
});

test('el cliente no permite asignar roles con loginAsUser local', () => {
  assert.match(saasAuthJs, /loginAsUser\(\) \{[\s\S]*?return false;/);
  assert.doesNotMatch(saasAuthJs, /this\.userRole\s*=\s*role/);
});

test('el POS confirma mediante RPC o informa que solo guardó un borrador', () => {
  assert.match(vendorJs, /async function submitPosSaleDraft/);
  assert.match(vendorJs, /rpc_process_sale_checkout_saas/);
  assert.match(vendorJs, /venta todavía NO fue confirmada/);
  assert.doesNotMatch(vendorJs, /VENTA CONFIRMADA EXITOSAMENTE \(FASE 11B/);
});

