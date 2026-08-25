import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import lookupProduct from '../netlify/functions/lookup-product.mjs';

const originalFetch = globalThis.fetch;
const originalEnvironment = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL
};
const TEST_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEST_TENANT_ID = '11111111-1111-1111-1111-111111111111';
let capturedMembershipAuthorization = '';

process.env.SUPABASE_URL = 'https://sxbhrgvizqylnfcqzhin.supabase.co';
process.env.PUBLIC_SITE_URL = 'https://boeweb.netlify.app';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function lookupRequest(body) {
  return {
    method: 'POST',
    headers: new Headers({
      Origin: 'https://boeweb.netlify.app',
      Authorization: 'Bearer unit-test-user-token'
    }),
    json: async () => body
  };
}

function requestUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input?.url || String(input);
}

function supabaseAuthResponse(url, options = {}) {
  if (url.includes('/auth/v1/user')) {
    return jsonResponse({ id: TEST_USER_ID, aud: 'authenticated', role: 'authenticated' });
  }
  if (url.includes('/rest/v1/tenant_users')) {
    capturedMembershipAuthorization = new Headers(options.headers).get('authorization') || '';
    return jsonResponse({
      tenant_id: TEST_TENANT_ID,
      user_id: TEST_USER_ID,
      role: 'VENDEDOR',
      active: true
    });
  }
  return null;
}

function installFetchMock(searchHtml, yahooHtml = '', astroHtml = '', publicPages = {}) {
  globalThis.fetch = async (url, options) => {
    const href = requestUrl(url);
    const authResponse = supabaseAuthResponse(href, options);
    if (authResponse) return authResponse;
    if (href.includes('customsearch.googleapis.com')) return jsonResponse({}, 403);
    if (href.includes('search.yahoo.com/search')) return new Response(yahooHtml, { status: 200 });
    if (href.includes('astrogrow.com.ar/search/')) return new Response(astroHtml, { status: 200 });
    if (href.includes('html.duckduckgo.com')) return new Response(searchHtml, { status: 200 });
    if (href.includes('api.mercadolibre.com')) return jsonResponse({ results: [] });
    if (href.includes('world.openfoodfacts.org')) return jsonResponse({}, 404);
    if (href.includes('api.upcitemdb.com')) return jsonResponse({ items: [] });
    if (publicPages[href]) return new Response(publicPages[href], { status: 200 });
    return jsonResponse({}, 404);
  };
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  capturedMembershipAuthorization = '';
});

test.after(() => {
  Object.entries(originalEnvironment).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
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
  assert.equal(capturedMembershipAuthorization, 'Bearer unit-test-user-token');
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

test('usa una imagen pública provisoria encontrada por código', async () => {
  const productUrl = 'https://monkeygrowshop.com.ar/producto/top-crop-bud-100ml/';
  installFetchMock('', `
    <li><div class="dd algo algo-sr">
      <a href="${productUrl}"><h3><span>TOP CROP BUD 100ml</span></h3></a>
      <div class="compText"><p>SKU: 8414606516469 · Marca: Top Crop</p></div>
    </div></li>
  `, '', {
    [productUrl]: `
      <script type="application/ld+json">
        {"@type":"Product","name":"Top Crop Top Bud 100ml","brand":{"name":"Top Crop"},"gtin13":"8414606516469","image":"https://cdn.example.com/top-bud-100ml.webp","offers":{"@type":"Offer","price":"22010","priceCurrency":"ARS"}}
      </script>
    `
  });

  const response = await lookupProduct(lookupRequest({ barcode: '8414606516469' }), { ip: 'test-provisional-image' });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.product.image_url, 'https://cdn.example.com/top-bud-100ml.webp');
  assert.equal(result.market.average_price, 22010);
});

test('recupera la imagen provisoria desde metadatos públicos de la ficha', async () => {
  const productUrl = 'https://growshop.example.com.ar/productos/prohanger-68kg/';
  installFetchMock('', `
    <li><div class="dd algo algo-sr">
      <a href="${productUrl}"><h3><span>Poleas Garden HighPro ProHanger 68 Kg</span></h3></a>
      <div class="compText"><p>SKU 8436554760848 · Producto para cultivo indoor</p></div>
    </div></li>
  `, '', {
    [productUrl]: `
      <meta content="https://cdn.example.com/prohanger.webp" property="og:image">
      <meta property="og:title" content="Poleas Garden HighPro ProHanger 68 Kg">
      <meta property="product:price:currency" content="ARS">
      <meta property="product:price:amount" content="15500">
    `
  });

  const response = await lookupProduct(lookupRequest({ barcode: '8436554760848' }), { ip: 'test-meta-image' });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.product.image_url, 'https://cdn.example.com/prohanger.webp');
  assert.equal(result.market.average_price, 15500);
});

test('el vendedor no consulta tablas o columnas ausentes del esquema anterior', async () => {
  const sellerSource = await readFile(new URL('../vendedor.js', import.meta.url), 'utf8');

  assert.match(sellerSource, /let filePath = '';/);
  assert.doesNotMatch(sellerSource, /\.from\(['"]product_locations['"]\)/);
  assert.doesNotMatch(
    sellerSource,
    /\.from\(['"]product_drafts['"]\)[\s\S]{0,180}\.eq\(['"]barcode['"]/
  );
});

test('el catálogo interno queda separado de proveedores y permite editar productos propios', async () => {
  const [sellerSource, sellerHtml] = await Promise.all([
    readFile(new URL('../vendedor.js', import.meta.url), 'utf8'),
    readFile(new URL('../vendedor.html', import.meta.url), 'utf8')
  ]);

  assert.match(sellerHtml, /id="vendor-internal-catalog-section"/);
  assert.match(sellerHtml, /data-vendor-tab="internal-catalog"/);
  assert.match(sellerHtml, /onsubmit="saveInternalCatalogProduct\(event\)"/);
  assert.match(sellerSource, /\.eq\('supplier_id', 'local_store'\)/);
  assert.match(sellerSource, /async function uploadInternalCatalogImage/);
  assert.match(sellerSource, /async function updateInternalCatalogRelations/);
});

test('lookup-product admite país dinámico pero resuelve el rubro desde el tenant autenticado', async () => {
  let capturedMlUrl = '';
  globalThis.fetch = async (url, options) => {
    const href = requestUrl(url);
    const authResponse = supabaseAuthResponse(href, options);
    if (authResponse) return authResponse;
    if (href.includes('api.mercadolibre.com')) {
      capturedMlUrl = href;
      return jsonResponse({
        results: [{
          title: 'Palta Hass Peruana 1 Kg',
          price: 15.50,
          permalink: 'https://articulo.mercadolibre.com.pe/MPE-12345',
          currency_id: 'PEN'
        }]
      });
    }
    return jsonResponse({}, 404);
  };

  const response = await lookupProduct(lookupRequest({
    query: 'Palta Hass 1 Kg',
    country: 'PE',
    vertical: 'verduleria'
  }), { ip: 'test-peru-verduleria' });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.country, 'PE');
  assert.equal(result.vertical, 'growshop');
  assert.match(capturedMlUrl, /\/sites\/MPE\/search/);
  assert.equal(result.market.currency, 'PEN');
  assert.equal(result.market.provider, 'Mercado Libre');
});

test('la interfaz de vendedor incluye selector de criterio y modal de QR universal', async () => {
  const [sellerHtml, sellerSource, indexSource] = await Promise.all([
    readFile(new URL('../vendedor.html', import.meta.url), 'utf8'),
    readFile(new URL('../vendedor.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.js', import.meta.url), 'utf8')
  ]);

  // Modal y controles de criterio en vendedor
  assert.match(sellerHtml, /id="modal-stock-search-criterion"/);
  assert.match(sellerHtml, /id="btn-open-stock-criterion"/);
  assert.match(sellerHtml, /id="stock-criterion-badge"/);
  assert.match(sellerHtml, /id="fastupload-voice-btn"/);
  assert.match(sellerHtml, /id="modal-product-qr-view"/);

  // Funciones de gestión de criterio y QR universal en vendedor.js
  assert.match(sellerSource, /function getActiveStockCriterion/);
  assert.match(sellerSource, /function saveActiveStockCriterion/);
  assert.match(sellerSource, /function startFastUploadVoiceDictation/);
  assert.match(sellerSource, /function openProductQrModal/);
  assert.match(sellerSource, /function buildProductQrPayload/);

  // Deep link y apertura automática de ficha técnica en index.js
  assert.match(indexSource, /function handleUrlProductDeepLink/);
  assert.match(indexSource, /openProductDetail\(productIdOrCode\)/);
});
