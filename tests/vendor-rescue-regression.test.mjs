import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('vendedor.html', 'utf8');
const vendorJs = fs.readFileSync('vendedor.js', 'utf8');
const saasAuthJs = fs.readFileSync('saas-auth.js', 'utf8');
const revokeAnonSql = fs.readFileSync('scripts/revoke_anon_internal_permissions.sql', 'utf8');
const fixRlsSql = fs.readFileSync('scripts/fix_tenant_users_rls_recursion.sql', 'utf8');

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

test('el catálogo público aísla columnas sensibles via vista public_catalog_products', () => {
  assert.match(revokeAnonSql, /CREATE OR REPLACE VIEW public\.public_catalog_products/);
  assert.match(revokeAnonSql, /REVOKE ALL ON TABLE public\.products FROM anon, PUBLIC/);
  assert.match(revokeAnonSql, /GRANT SELECT ON public\.public_catalog_products TO anon, authenticated/);
  assert.doesNotMatch(revokeAnonSql, /SELECT cost/);
});

test('el acceso anónimo a borradores y WMS interno queda estrictamente revocado', () => {
  assert.match(revokeAnonSql, /REVOKE ALL ON TABLE public\.product_drafts FROM anon, PUBLIC/);
  assert.match(revokeAnonSql, /REVOKE ALL ON TABLE public\.store_shelves FROM anon, PUBLIC/);
  assert.match(revokeAnonSql, /REVOKE ALL ON TABLE public\.inventory_audits FROM anon, PUBLIC/);
  assert.match(revokeAnonSql, /REVOKE ALL ON TABLE public\.admin_activity_log FROM anon, PUBLIC/);
});

test('el fix de RLS tenant_users usa SECURITY DEFINER con row_security = off', () => {
  assert.match(fixRlsSql, /SECURITY DEFINER/);
  assert.match(fixRlsSql, /SET search_path = public, pg_temp/);
  assert.match(fixRlsSql, /SET row_security = off/);
  assert.match(fixRlsSql, /REVOKE ALL ON FUNCTION public\.is_tenant_member\(UUID\) FROM PUBLIC/);
});
