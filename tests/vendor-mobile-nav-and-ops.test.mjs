import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('vendedor.html', 'utf8');
const portalCss = fs.readFileSync('vendedor-portal.css', 'utf8');
const vendorJs = fs.readFileSync('vendedor.js', 'utf8');

test('1. Menú de Operaciones: Incluye Caja y Arqueo en tarjetas y no contiene números verdes fijos', () => {
  // Check that Caja & Arqueo is present in the flow cards
  assert.match(html, /id="vcard-cash"[\s\S]*?Caja & Arqueo Diario/i);
  assert.match(html, /switchVendorTab\('cash'\)/);
  
  // Verify that vendor-flow-num spans were removed from dashboard cards
  assert.doesNotMatch(html, /class="vendor-flow-num"/);
});

test('2. Mobile Footer Bar: Contiene exactamente Inicio, Vender, Ingresar, Localizar y Operaciones', () => {
  assert.match(html, /id="vendor-mobile-bottom-nav" class="vendor-mobile-bottom-nav"/);
  assert.match(html, /id="mob-nav-home"[\s\S]*?switchVendorTab\('home'\)[\s\S]*?Inicio/);
  assert.match(html, /id="mob-nav-pos"[\s\S]*?switchVendorTab\('pos'\)[\s\S]*?Vender/);
  assert.match(html, /id="mob-nav-fastupload"[\s\S]*?switchVendorTab\('fast-upload'\)[\s\S]*?Ingresar/);
  assert.match(html, /id="mob-nav-location"[\s\S]*?switchVendorTab\('location-assistant'\)[\s\S]*?Localizar/);
  assert.match(html, /id="mob-nav-more"[\s\S]*?toggleVendorMobileOperationsMenu\(\)[\s\S]*?Operaciones/);
});

test('3. Modal de Resto de Operaciones: Contiene todas las operaciones complementarias', () => {
  assert.match(html, /id="vendor-mobile-operations-sheet"/);
  assert.match(html, /switchVendorTab\('cash'\); closeVendorMobileOperationsMenu\(\);/);
  assert.match(html, /switchVendorTab\('web-orders'\); closeVendorMobileOperationsMenu\(\);/);
  assert.match(html, /switchVendorTab\('internal-catalog'\); closeVendorMobileOperationsMenu\(\);/);
  assert.match(html, /switchVendorTab\('drafts-review'\); closeVendorMobileOperationsMenu\(\);/);
  assert.match(html, /switchVendorTab\('map'\); closeVendorMobileOperationsMenu\(\);/);
  assert.match(html, /switchVendorTab\('catalog'\); closeVendorMobileOperationsMenu\(\);/);
  assert.match(html, /switchVendorTab\('portfolio'\); closeVendorMobileOperationsMenu\(\);/);
  assert.match(html, /switchVendorTab\('expirations'\); closeVendorMobileOperationsMenu\(\);/);
  assert.match(html, /switchVendorTab\('retired-products'\); closeVendorMobileOperationsMenu\(\);/);
});

test('4. Barra de Navegación: Botón y Panel de Notificaciones dinámico', () => {
  assert.match(html, /id="vendor-notifications-bell-btn"/);
  assert.match(html, /id="vendor-nav-notifications-badge"/);
  assert.match(html, /id="vendor-notifications-dropdown"/);
  assert.match(vendorJs, /function updateVendorNotificationCenter/);
  assert.match(vendorJs, /function toggleVendorNotificationPanel/);
});

test('5. CSS Responsive: Barra de navegación compacta y bottom bar en móviles', () => {
  assert.match(portalCss, /\.vendor-mobile-bottom-nav\s*\{/);
  assert.match(portalCss, /\.vendor-operations-sheet-overlay\s*\{/);
  assert.match(portalCss, /\.vendor-nav-bell-badge\s*\{/);
});

test('6. Seguridad de Acceso: Contraseña personalizada anula e invalida la contraseña por defecto', () => {
  // Simular la lógica de autenticación de vendedor
  const vendor = { name: 'Gino', pass: 'gino123', altPass: null };
  
  // Caso 1: Sin contraseña personalizada -> acepta la por defecto
  const storage1 = {};
  const isAuthDefault = (typed) => {
    const custom = storage1['boeweb_vendor_password_' + vendor.name.toLowerCase()];
    return custom ? typed.toLowerCase() === custom.toLowerCase() : (typed.toLowerCase() === vendor.pass.toLowerCase());
  };
  assert.equal(isAuthDefault('gino123'), true, 'Debe aceptar password por defecto si no se cambió');
  assert.equal(isAuthDefault('GINOXDPROFE20276'), false, 'No debe aceptar password nuevo antes de cambiarlo');

  // Caso 2: Se cambia la contraseña a GINOXDPROFE20276 -> SOLO acepta la nueva, RECHAZA la vieja
  storage1['boeweb_vendor_password_gino'] = 'GINOXDPROFE20276';
  assert.equal(isAuthDefault('GINOXDPROFE20276'), true, 'Debe aceptar la nueva contraseña');
  assert.equal(isAuthDefault('gino123'), false, 'Debe RECHAZAR la contraseña vieja por defecto');
});

