import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve('.');
const storefront = fs.readFileSync(path.join(projectRoot, 'index.js'), 'utf8');

function extractFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : -1;
  assert.notEqual(start, -1, `No se encontró ${name}`);
  return source.slice(start, end > start ? end : source.length);
}

test('el catálogo público sólo consume la vista canónica y falla cerrado', () => {
  const loader = extractFunction(storefront, 'loadCatalog', 'readCatalogSnapshot');
  assert.match(loader, /\.from\('public_catalog_products_v2'\)/);
  assert.match(loader, /\.eq\('tenant_id', tenantId\)/);
  assert.match(loader, /await storefrontAppConfigReady/);
  assert.match(loader, /catalogConfig\.source === 'disabled'/);
  assert.match(loader, /catalogConfig\.visibility !== 'public'/);
  assert.match(loader, /catalogConfig\.allowBackorders === true/);
  assert.match(loader, /availability: row\.track_stock[\s\S]*?'A_PEDIDO'/);
  assert.match(loader, /\.filter\(product => catalogConfig\.showOutOfStock \|\| product\.available\)/);
  assert.match(loader, /throw new Error\('El catálogo central no está disponible/);
  assert.doesNotMatch(loader, /supplier_products|products\.json|boeweb_internal_catalog/);
});

test('el storefront no descuenta stock ni publica pedidos mediante localStorage', () => {
  assert.doesNotMatch(storefront, /function deductWebOrderStock/);
  assert.doesNotMatch(storefront, /boeweb_product_locations/);
  assert.doesNotMatch(storefront, /boeweb_internal_catalog/);
  assert.doesNotMatch(storefront, /boeweb_web_orders/);
});

test('la copia local conserva sólo el comprobante del cliente', () => {
  assert.match(storefront, /boeweb_order_history/);
  assert.match(storefront, /No se pudo guardar el comprobante local del cliente/);
});
