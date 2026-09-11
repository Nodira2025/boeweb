import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve('.');
const storefront = fs.readFileSync(path.join(projectRoot, 'index.js'), 'utf8');
const catalogClient = fs.readFileSync(path.join(projectRoot, 'store-catalog.js'), 'utf8');

function extractFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : -1;
  assert.notEqual(start, -1, `No se encontró ${name}`);
  return source.slice(start, end > start ? end : source.length);
}

test('el catálogo público sólo consume vistas canónicas y falla cerrado', () => {
  const loader = extractFunction(storefront, 'loadCatalog', 'readCatalogSnapshot');
  assert.match(loader, /StoreCatalog\.readAllRows\(supabaseClient,[\s\S]*?'public_catalog_products_v2'/);
  assert.match(catalogClient, /\.eq\('tenant_id', tenantId\)/);
  assert.match(loader, /await storefrontAppConfigReady/);
  assert.match(loader, /catalogConfig\.source === 'disabled'/);
  assert.match(loader, /catalogConfig\.visibility !== 'public'/);
  assert.match(loader, /normalizeOwnProduct\(row, catalogConfig\)/);
  assert.match(catalogClient, /config\.allowBackorders === true/);
  assert.match(catalogClient, /availability:[\s\S]*?'A_PEDIDO'/);
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
