import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import lookupProduct from '../netlify/functions/lookup-product.mjs';

const originalFetch = globalThis.fetch;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function lookupRequest(body) {
  return {
    method: 'POST',
    headers: new Headers({ Origin: 'https://boeweb.netlify.app' }),
    json: async () => body
  };
}

function installFetchMock(searchHtml) {
  globalThis.fetch = async url => {
    const href = String(url);
    if (href.includes('customsearch.googleapis.com')) return jsonResponse({}, 403);
    if (href.includes('html.duckduckgo.com')) return new Response(searchHtml, { status: 200 });
    if (href.includes('api.mercadolibre.com')) return jsonResponse({ results: [] });
    if (href.includes('world.openfoodfacts.org')) return jsonResponse({}, 404);
    if (href.includes('api.upcitemdb.com')) return jsonResponse({ items: [] });
    return jsonResponse({}, 404);
  };
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('descarta la portada de un growshop cuando no contiene el código buscado', async () => {
  installFetchMock(`
    <a class="result__a" href="https://astrogrow.com.ar/">Astro Grow Shop</a>
    <div class="result__snippet">Encontrá todo para tu cultivo: sustratos, carpas y macetas.</div>
  `);

  const response = await lookupProduct(lookupRequest({ barcode: '8414606516469' }), { ip: 'test-barcode' });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.found, false);
  assert.equal(result.product, null);
});

test('acepta una ficha que coincide con el nombre y la presentación', async () => {
  installFetchMock(`
    <a class="result__a" href="https://oroverdegrow.ar/productos/bio-trap-30gr-mamboreta">BIO TRAP 30GR - MAMBORETA</a>
    <div class="result__snippet">Bio Mamboretá Biotrap 30 gr para cultivo. Precio $13.262.</div>
  `);

  const response = await lookupProduct(lookupRequest({ query: 'Bio Mamboreta Biotrap 30 g' }), { ip: 'test-name' });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.found, true);
  assert.match(result.product.name, /BIO TRAP 30GR/i);
});

test('el vendedor no consulta tablas o columnas ausentes del esquema anterior', async () => {
  const sellerSource = await readFile(new URL('../vendedor.js', import.meta.url), 'utf8');

  assert.doesNotMatch(sellerSource, /\.from\(['"]product_locations['"]\)/);
  assert.doesNotMatch(
    sellerSource,
    /\.from\(['"]product_drafts['"]\)[\s\S]{0,180}\.eq\(['"]barcode['"]/
  );
});
