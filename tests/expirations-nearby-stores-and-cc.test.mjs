import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PublicCatalogUnifier } from '../public-catalog-unification.js';

const vendorJs = fs.readFileSync('vendedor.js', 'utf8');
const vendorHtml = fs.readFileSync('vendedor.html', 'utf8');

test('1. Unificación Omnicanal: 3 Niveles de Disponibilidad y Markup del Admin', () => {
  const ownStore = [
    { id: 'OWN-1', product_code: 'OWN-1', name: 'Sustrato BÔ 50L', price: 12000, stock: 10 }
  ];
  const localStores = [
    { id: 'LOC-1', product_code: 'LOC-1', name: 'BioBizz Bloom 500ml', price: 15000, stock: 4, store_name: 'Growshop Centro' }
  ];
  const b2bSuppliers = [
    { id: 'B2B-1', product_code: 'B2B-1', name: 'Panel Quantum Board 240W', price: 200000, stock: 2, supplier_code: 'astrogrow' }
  ];

  const unified = PublicCatalogUnifier.unifyProducts(ownStore, b2bSuppliers, {
    localStoresProducts: localStores,
    adminMarkupPercent: 30
  });

  assert.equal(unified.length, 3);

  // 1. Stock Propio
  const pOwn = unified.find(p => p.id === 'OWN-1');
  assert.equal(pOwn.availability, 'EN_STOCK');
  assert.equal(pOwn.badge_text, '🟢 EN STOCK');
  assert.equal(pOwn.price, 12000);
  assert.equal(pOwn.delivery_estimate, 'Inmediata en local');

  // 2. Tienda Cercana (2 días)
  const pLoc = unified.find(p => p.id === 'LOC-1');
  assert.equal(pLoc.availability, 'LOCAL_2_DAYS');
  assert.equal(pLoc.badge_text, '📦 LLEGA EN 2 DÍAS');
  assert.equal(pLoc.price, 19500); // 15000 * 1.30 = 19500
  assert.match(pLoc.delivery_estimate, /2 días/);

  // 3. Proveedor Mayorista B2B (5 días)
  const pB2b = unified.find(p => p.id === 'B2B-1');
  assert.equal(pB2b.availability, 'A_PEDIDO');
  assert.equal(pB2b.badge_text, '📦 SOLO POR PEDIDO · Llega en 5 días');
  assert.equal(pB2b.price, 260000); // 200000 * 1.30 = 260000
  assert.match(pB2b.delivery_estimate, /5 días/);
});

test('2. Reposición B2B: El checkout de compra se dirige a Mariano (+54 9 343 467-5428)', () => {
  assert.match(vendorJs, /purchaseManagerPhone\s*=\s*"5493434675428"/);
  assert.match(vendorJs, /Administrador Mariano/);
});

test('3. Límite Diario de Precios: Vendedor limitado a 5 modificaciones por día', () => {
  assert.match(vendorJs, /function canVendorAdjustPrice/);
  assert.match(vendorJs, /function recordVendorPriceAdjustment/);
  assert.match(vendorJs, /const max = 5/);
});

test('4. Vencimientos: Categorización a 3 meses (90d), 1 mes (30d), 1 semana (7d) y críticos', () => {
  assert.match(vendorJs, /function calculateExpirationStatus/);
  assert.match(vendorJs, /function renderExpirationsSection/);
  assert.match(vendorHtml, /id="vendor-expirations-section"/);
  assert.match(vendorHtml, /data-vendor-tab="expirations"/);
});

test('5. Cuentas Corrientes: Alta, libro mayor, vencimiento del 1.° pago e integración POS', () => {
  assert.match(vendorJs, /function getCurrentAccounts/);
  assert.match(vendorJs, /function saveCurrentAccount/);
  assert.match(vendorJs, /first_payment_due/);
  assert.match(vendorHtml, /id="modal-new-current-account"/);
  assert.match(vendorHtml, /id="modal-record-cc-payment"/);
  assert.match(vendorHtml, /value="CUENTA_CORRIENTE"/);
  assert.match(vendorJs, /draft\.payment_method === 'CUENTA_CORRIENTE'/);
});

test('6. Otras Tiendas Cerca: Panel de aliadas, catálogo local e ingesta IA', () => {
  assert.match(vendorJs, /function getNearbyStores/);
  assert.match(vendorJs, /function parseNearbyStoreCatalogWithAi/);
  assert.match(vendorHtml, /id="vendor-nearby-stores-section"/);
  assert.match(vendorHtml, /data-vendor-tab="nearby-stores"/);
  assert.match(vendorHtml, /id="modal-add-nearby-store"/);
});

test('7. Cuenta Corriente: Detalle de productos retirados, fotos y generación de PDF / WhatsApp', () => {
  // Modal de detalles en HTML
  assert.match(vendorHtml, /id="modal-cc-details"/);
  assert.match(vendorHtml, /id="cc-details-movements-container"/);

  // Funciones de detalle y fotos en JS
  assert.match(vendorJs, /function openCcDetailsModal/);
  assert.match(vendorJs, /function renderCcDetailsMovements/);
  assert.match(vendorJs, /function generateAndPrintCcPdf/);
  assert.match(vendorJs, /function sendCcDetailedWhatsApp/);

  // El comprobante PDF incluye fotos de productos, alias y tabla
  assert.match(vendorJs, /class="prod-img"/);
  assert.match(vendorJs, /ESTADO DE CUENTA CORRIENTE/);
  assert.match(vendorJs, /BOGROWCLUB\.OFICIAL/);
});

