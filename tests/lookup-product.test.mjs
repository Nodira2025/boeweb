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

function installFetchMock(searchHtml, yahooHtml = '', astroHtml = '') {
  globalThis.fetch = async url => {
    const href = String(url);
    if (href.includes('customsearch.googleapis.com')) return jsonResponse({}, 403);
    if (href.includes('search.yahoo.com/search')) return new Response(yahooHtml, { status: 200 });
    if (href.includes('astrogrow.com.ar/search/')) return new Response(astroHtml, { status: 200 });
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

test('autocompleta un código encontrado en una ficha de producto argentina', async () => {
  installFetchMock('', `
    <li><div class="dd algo algo-sr">
      <a href="https://www.seedscience.com.ar/product-page/poleas-garden-highpro-prohanger-68-kg">
        <h3><span>Poleas Garden HighPro ProHanger (68 Kg) | Seed Science</span></h3>
      </a>
      <div class="compText"><p>SKU: 8436554760848 · $15.638,00 Precio · $14.074,20 Precio de oferta · Trinquete de cuerda hasta 68 Kg</p></div>
    </div></li>
  `);

  const response = await lookupProduct(lookupRequest({ barcode: '8436554760848' }), { ip: 'test-brave-barcode' });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.found, true);
  assert.match(result.product.name, /Garden HighPro ProHanger/i);
  assert.equal(result.product.barcode, '8436554760848');
  assert.equal(result.product.brand, 'Garden HighPro');
  assert.equal(result.product.presentation, '68 Kg');
  assert.equal(result.market.average_price, 15638);
});

test('usa el precio público de Astro para Top Bud y descarta combos parecidos', async () => {
  installFetchMock('', `
    <li><div class="dd algo algo-sr">
      <a href="https://monkeygrowshop.com.ar/producto/top-crop-bud-100ml/">
        <h3><span>TOP CROP BUD 100ml &ndash; Monkey Grow Shop</span></h3>
      </a>
      <div class="compText"><p>SKU: 8414606516469 · Categoría: Fertilizantes · Marca: Top Crop</p></div>
    </div></li>
  `, `
    <script>
      const googleItems = [
        {"info":{"item_brand":"TOP CROP","item_name":"Fertilizante Top Crop Top Bud - 100 Ml","price":22010,"item_category":"Cultivo"}},
        {"info":{"item_brand":"TOP CROP","item_name":"Tripack Auto Top Crop","price":47440,"item_category":"Cultivo"}}
      ];
    </script>
  `);

  const response = await lookupProduct(lookupRequest({ barcode: '8414606516469' }), { ip: 'test-top-bud-price' });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.found, true);
  assert.match(result.product.name, /Top Crop Top Bud/i);
  assert.equal(result.market.average_price, 22010);
  assert.equal(result.market.sample_size, 1);
  assert.match(result.market.provider, /Astro Grow/i);
});

test('el vendedor no consulta tablas o columnas ausentes del esquema anterior', async () => {
  const sellerSource = await readFile(new URL('../vendedor.js', import.meta.url), 'utf8');

  assert.doesNotMatch(sellerSource, /\.from\(['"]product_locations['"]\)/);
  assert.doesNotMatch(
    sellerSource,
    /\.from\(['"]product_drafts['"]\)[\s\S]{0,180}\.eq\(['"]barcode['"]/
  );
});
