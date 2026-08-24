import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const storefront = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const storefrontHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appConfig = fs.readFileSync(path.join(root, 'app-config.js'), 'utf8');
const migration = fs.readFileSync(
  path.join(root, 'scripts/migrations/011_public_catalog_dynamic_taxonomy.sql'),
  'utf8'
).toLowerCase();

test('011 agrega marca al final de la vista pública sin exponer metadata completa', () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /end as available_quantity,\s*nullif\(btrim\(cp\.metadata->>'brand'\), ''\) as brand/);
  assert.doesNotMatch(migration, /cp\.metadata\s+as metadata|cost_price|supplier_id/);
  assert.match(migration, /'011'[\s\S]*?'public_catalog_dynamic_taxonomy'/);
  assert.match(migration, /commit;\s*$/);
});

test('categorías y marcas del storefront se derivan del catálogo del tenant', () => {
  assert.match(storefront, /renderCatalogTaxonomy\(\)/);
  assert.match(storefront, /new Set\(products[\s\S]*?product\.category/);
  assert.match(storefront, /String\(product\.brand \|\| ''\)/);
  assert.match(storefront, /Array\.from\(brandCounts\.keys\(\)\)/);
  assert.doesNotMatch(storefront, /KNOWN_BRANDS/);
});

test('el HTML inicial no muestra taxonomía growshop antes de cargar el tenant', () => {
  const homeStart = storefrontHtml.indexOf('<nav class="home-category-strip"');
  const homeEnd = storefrontHtml.indexOf('</nav>', homeStart);
  const catalogStart = storefrontHtml.indexOf('<ul class="category-list" id="category-list">');
  const catalogEnd = storefrontHtml.indexOf('</ul>', catalogStart);
  const initialTaxonomy = `${storefrontHtml.slice(homeStart, homeEnd)}${storefrontHtml.slice(catalogStart, catalogEnd)}`;
  assert.doesNotMatch(initialTaxonomy, /Semillas|Fertilizantes|Parafernalia|Vaporizadores/);
  assert.match(initialTaxonomy, /data-category="all"/);
});

test('los filtros dinámicos enlazan eventos sin interpolar JavaScript de la marca', () => {
  assert.match(storefront, /input\[data-brand\]/);
  assert.match(storefront, /addEventListener\('change'/);
  assert.doesNotMatch(storefront, /onchange="toggleBrandFilter/);
  assert.match(storefront, /dataset\.categoryBound/);
});

test('contacto y copyright del storefront provienen de AppConfig', () => {
  for (const selector of ['data-app-brand-whatsapp', 'data-app-brand-instagram', 'data-app-brand-address', 'data-app-brand-copyright']) {
    assert.match(storefrontHtml, new RegExp(selector));
    assert.match(appConfig, new RegExp(selector));
  }
  assert.match(appConfig, /https:\/\/wa\.me\/\$\{whatsappDigits\}/);
  assert.match(appConfig, /instagramUrl/);
  assert.match(appConfig, /element\.textContent = `© \$\{new Date\(\)\.getFullYear\(\)\} \$\{texts\.name\}/);
  const utility = storefrontHtml.slice(storefrontHtml.indexOf('<div class="brand-utility-bar"'), storefrontHtml.indexOf('<!-- Header Navigation -->'));
  const footerContact = storefrontHtml.slice(storefrontHtml.indexOf('<div class="footer-contact-info">'), storefrontHtml.indexOf('<div class="footer-bottom">'));
  assert.doesNotMatch(`${utility}${footerContact}`, /5493813023185|bo\.growclub|BO growclub-61579315981629/);
});
