const OPEN_PRODUCTS_URL = 'https://world.openfoodfacts.org/api/v3/product';
const MERCADOLIBRE_SEARCH_URL = 'https://api.mercadolibre.com/sites/MLA/search';
const REQUEST_WINDOW_MS = 60_000;
const REQUEST_LIMIT_PER_WINDOW = 20;
const EXTERNAL_TIMEOUT_MS = 12_000;
const requestBuckets = new Map();

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function isAllowedOrigin(request) {
  const configuredOrigin = process.env.PRODUCT_ANALYSIS_ALLOWED_ORIGIN;
  if (!configuredOrigin) return true;
  const origin = request.headers.get('origin');
  return !origin || origin === configuredOrigin;
}

function isRateLimited(request, context) {
  const clientIp = context?.ip || request.headers.get('x-nf-client-connection-ip') || 'unknown';
  const now = Date.now();
  const bucket = requestBuckets.get(clientIp);
  if (!bucket || now - bucket.startedAt > REQUEST_WINDOW_MS) {
    requestBuckets.set(clientIp, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > REQUEST_LIMIT_PER_WINDOW;
}

function cleanText(value, maxLength = 180) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeBarcode(value) {
  const barcode = cleanText(value, 24).replace(/[\s-]+/g, '');
  return /^\d{6,18}$/.test(barcode) ? barcode : '';
}

function mapCategory(...values) {
  const text = values.filter(Boolean).join(' ').toLocaleLowerCase('es');
  const categoryRules = [
    ['Semillas', /semilla|seed|germin/],
    ['Sustratos', /sustrat|substrat|tierra|soil|turba|peat|coco/],
    ['Fertilizantes', /fertili|nutrient|abono|bio grow|bio bloom|estimulador/],
    ['Vaporizadores', /vaporiz|vaporizer/],
    ['Macetas', /maceta|plant pot|flower pot/],
    ['Medición y Riego', /riego|irrig|medidor|meter|conductiv|\bph\b|\bec\b/],
    ['Indoor', /indoor|lámpara|lampara|lighting|\bled\b|extractor|ventilador|carpa|prohanger|polea|ratchet|colgador|hanger/],
    ['Parafernalia', /grinder|picador|papel|pipa|bong|parafernalia/]
  ];
  return categoryRules.find(([, pattern]) => pattern.test(text))?.[0] || 'Otros';
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function getLocalizedProductValue(product, field) {
  return cleanText(product?.[`${field}_es`] || product?.[field] || '');
}

function normalizeOpenProduct(product, barcode) {
  if (!product) return null;
  const name = getLocalizedProductValue(product, 'product_name') || getLocalizedProductValue(product, 'generic_name');
  const brand = cleanText(product.brands || '').split(',')[0].trim();
  const presentation = cleanText(product.quantity || '');
  const genericName = getLocalizedProductValue(product, 'generic_name');
  const categories = cleanText(product.categories || '');
  return {
    name: name || null,
    brand: brand || null,
    presentation: presentation || null,
    category: mapCategory(name, categories),
    description: genericName || categories || null,
    barcode,
    official_url: null,
    market_query: cleanText([brand, name, presentation].filter(Boolean).join(' ')) || barcode,
    image_url: product.image_front_url || product.image_url || null
  };
}

async function searchOpenProducts(barcode) {
  if (!barcode) return null;
  const fields = [
    'code', 'product_name', 'product_name_es', 'generic_name', 'generic_name_es',
    'brands', 'quantity', 'categories', 'categories_tags', 'image_front_url', 'image_url', 'product_type'
  ].join(',');
  const url = new URL(`${OPEN_PRODUCTS_URL}/${encodeURIComponent(barcode)}`);
  url.searchParams.set('product_type', 'all');
  url.searchParams.set('cc', 'ar');
  url.searchParams.set('lc', 'es');
  url.searchParams.set('fields', fields);
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'BO-Grow-Club/1.0 (https://boeweb.netlify.app)'
    }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Open Products respondió con estado ${response.status}`);
  const payload = await response.json();
  if (!payload?.product) return null;
  return {
    product: normalizeOpenProduct(payload.product, barcode),
    source: {
      label: 'Ficha pública por código de barras',
      url: `https://world.openfoodfacts.org/product/${encodeURIComponent(barcode)}`
    }
  };
}

async function searchWebEanBarcode(barcode) {
  if (!barcode) return null;
  try {
    const response = await fetchWithTimeout('https://lite.duckduckgo.com/lite/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: `q=${encodeURIComponent(barcode)}`
    });
    if (!response.ok) return null;
    const html = await response.text();

    const titleMatches = [...html.matchAll(/<a[^>]+class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/gi)];
    const titles = titleMatches
      .map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
      .filter(t => t.length > 5 && !/duckduckgo/i.test(t));

    if (!titles.length) return null;

    let rawTitle = titles[0].replace(/\s*[-|–|:]\s*[A-Za-z0-9.\s]+$/gi, '').trim();
    if (!rawTitle || rawTitle.length < 3) rawTitle = titles[0];

    let brand = null;
    if (/garden\s*high\s*pro/i.test(rawTitle)) brand = 'Garden HighPro';
    else if (/biobizz/i.test(rawTitle)) brand = 'BioBizz';
    else if (/top\ crop/i.test(rawTitle)) brand = 'Top Crop';
    else if (/namaste/i.test(rawTitle)) brand = 'Namaste';

    return {
      product: {
        name: rawTitle,
        brand,
        presentation: null,
        category: mapCategory(rawTitle),
        description: `Producto identificado mediante EAN ${barcode}.`,
        barcode,
        official_url: null,
        market_query: rawTitle,
        image_url: null
      },
      source: {
        label: `Búsqueda pública por EAN ${barcode}`,
        url: `https://duckduckgo.com/?q=${encodeURIComponent(barcode)}`
      }
    };
  } catch (err) {
    console.warn('Falló la consulta web EAN:', err.message);
    return null;
  }
}

function calculateMarketStats(items) {
  const prices = items
    .filter(item => item.currency_id === 'ARS' && Number.isFinite(Number(item.price)) && Number(item.price) > 0)
    .map(item => Number(item.price))
    .sort((a, b) => a - b);
  if (!prices.length) return { average: null, median: null, comparableItems: [] };
  const midpoint = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[midpoint] : (prices[midpoint - 1] + prices[midpoint]) / 2;
  const comparableItems = items.filter(item => {
    const price = Number(item.price);
    return item.currency_id === 'ARS' && price >= median * 0.35 && price <= median * 2.8;
  });
  const average = comparableItems.reduce((sum, item) => sum + Number(item.price), 0) / comparableItems.length;
  return { average, median, comparableItems };
}

async function searchMercadoLibre(query) {
  if (!query) return null;
  const url = new URL(MERCADOLIBRE_SEARCH_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '20');
  const headers = { Accept: 'application/json' };
  if (process.env.MERCADOLIBRE_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.MERCADOLIBRE_ACCESS_TOKEN}`;
  const response = await fetchWithTimeout(url, { headers });
  if (!response.ok) return null;
  const payload = await response.json();
  const stats = calculateMarketStats(payload.results || []);
  if (!stats.comparableItems.length) return null;
  return {
    query,
    search_url: `https://listado.mercadolibre.com.ar/${encodeURIComponent(query).replace(/%20/g, '-')}`,
    currency: 'ARS',
    average_price: Math.round(stats.average),
    median_price: Math.round(stats.median),
    sample_size: stats.comparableItems.length,
    results: stats.comparableItems.slice(0, 5).map(item => ({
      title: cleanText(item.title),
      price: Number(item.price),
      permalink: item.permalink,
      condition: item.condition || null
    }))
  };
}

function productFromMarket(market, barcode) {
  const firstResult = market?.results?.[0];
  if (!firstResult) return null;
  return {
    name: firstResult.title || null,
    brand: null,
    presentation: null,
    category: mapCategory(firstResult.title),
    description: null,
    barcode: barcode || null,
    official_url: null,
    market_query: market.query,
    image_url: null
  };
}

export default async function handler(request, context) {
  if (request.method !== 'POST') return jsonResponse(405, { message: 'Método no permitido.' });
  if (!isAllowedOrigin(request)) return jsonResponse(403, { message: 'Origen no autorizado.' });
  if (isRateLimited(request, context)) {
    return jsonResponse(429, { message: 'Demasiadas búsquedas. Esperá un minuto y volvé a intentar.' });
  }

  try {
    const body = await request.json();
    const rawBarcode = cleanText(body.barcode, 24);
    const barcode = normalizeBarcode(rawBarcode);
    const query = cleanText(body.query, 160);
    if (rawBarcode && !barcode) {
      return jsonResponse(400, { message: 'El código debe contener entre 6 y 18 números.' });
    }
    if (!barcode && query.length < 2) {
      return jsonResponse(400, { message: 'Escaneá un código o escribí al menos dos caracteres del nombre.' });
    }

    const warnings = [];
    let openResult = null;
    if (barcode) {
      try {
        openResult = await searchOpenProducts(barcode);
        if (!openResult) {
          openResult = await searchWebEanBarcode(barcode);
        }
      } catch (error) {
        warnings.push('La base abierta no respondió; intentando con fuentes de respaldo.');
        console.warn('Falló la consulta de Open Products:', error.message);
        try {
          openResult = await searchWebEanBarcode(barcode);
        } catch (e) {
          console.warn('Falló la búsqueda web EAN:', e.message);
        }
      }
    }

    const primaryMarketQuery = openResult?.product?.name || openResult?.product?.market_query || query || barcode;
    let market = null;
    try {
      market = await searchMercadoLibre(primaryMarketQuery);
      if (!market && openResult?.product?.market_query && openResult.product.market_query !== primaryMarketQuery) {
        market = await searchMercadoLibre(openResult.product.market_query);
      }
    } catch (error) {
      warnings.push('Mercado Libre no respondió; el precio puede completarse manualmente.');
      console.warn('Falló la consulta de Mercado Libre:', error.message);
    }

    const product = openResult?.product || productFromMarket(market, barcode);
    const sources = [];
    if (openResult?.source) sources.push(openResult.source);
    (market?.results || []).slice(0, 3).forEach(item => {
      sources.push({ label: 'Referencia en Mercado Libre', url: item.permalink });
    });

    return jsonResponse(200, {
      mode: 'lookup_without_ai',
      found: Boolean(product || market),
      product,
      market,
      sources,
      providers: [openResult ? 'Búsqueda EAN' : null, market ? 'Mercado Libre' : null].filter(Boolean),
      warnings
    });
  } catch (error) {
    console.error('Error al buscar producto sin IA:', error.message);
    return jsonResponse(502, { message: 'No se pudo consultar las fuentes externas. Podés continuar manualmente.' });
  }
}
