const OPEN_PRODUCTS_URL = 'https://world.openfoodfacts.org/api/v3/product';
const UPCITEMDB_LOOKUP_URL = 'https://api.upcitemdb.com/prod/trial/lookup';
const GOOGLE_CUSTOM_SEARCH_URL = 'https://customsearch.googleapis.com/customsearch/v1';
const GOOGLE_SEARCH_WEB_URL = 'https://www.google.com/search';
const MERCADOLIBRE_SEARCH_URL = 'https://api.mercadolibre.com/sites/MLA/search';
const REQUEST_WINDOW_MS = 60_000;
const REQUEST_LIMIT_PER_WINDOW = 20;
const EXTERNAL_TIMEOUT_MS = 12_000;
const requestBuckets = new Map();
const KNOWN_GROWSHOP_DOMAINS = [
  'tomaco.com.ar', 'elgrowshop.com.ar', 'upgrowshop.com', 'gorigrow.com.ar',
  'juanijuana.com.ar', 'lustgrow.com.ar', 'oroverdegrow.ar', 'pulpot.com.ar',
  'growshopganesh.com', 'astrogrow.com.ar', 'highprotek.com.ar', 'cultivourbano.com.ar'
];
const OFFICIAL_GROW_BRAND_DOMAINS = [
  'topcropfert.com', 'biobizz.com', 'advancednutrients.com', 'plagron.com',
  'gardenhighpro.com', 'cannagardening.com', 'mamboreta.com.ar', 'terrafertil.com.ar'
];
const GROW_CONTEXT_PATTERN = /grow\s*shop|cultivo|indoor|outdoor|hidropon|fertili|nutrient|sustrat|semilla|germin|floraci|vegetativo|enraizante|micorriza|trichoderma|carpa|panel\s*led|extractor|maceta|parafernalia|vaporiz|grinder|picador|bong|papelillo|riego|medidor\s*(?:ph|ec)/i;
const NON_GROW_PRODUCT_PATTERN = /alimento|bebida|golosina|noodle|fideo|salsa|gallet|chocolate|shampoo|perfume|juguete|repuesto automotor|comida/i;
const SEARCH_MATCH_STOP_WORDS = new Set([
  'argentina', 'comprar', 'compra', 'online', 'oferta', 'precio', 'producto',
  'productos', 'tienda', 'shop', 'grow', 'growshop', 'para', 'con', 'del', 'las',
  'los', 'una', 'uno', 'por'
]);
const GROW_BRAND_RULES = [
  [/garden\s*high\s*pro/i, 'Garden HighPro'],
  [/advanced\s*nutrients/i, 'Advanced Nutrients'],
  [/general\s*hydroponics/i, 'General Hydroponics'],
  [/bio\s*mamboret[aá]/i, 'Bio Mamboretá'],
  [/lion\s*rolling\s*circus/i, 'Lion Rolling Circus'],
  [/top\s*crop/i, 'Top Crop'],
  [/bio\s*bizz/i, 'BioBizz'],
  [/grow\s*mix/i, 'GrowMix'],
  [/garden\s*pro/i, 'Garden Pro'],
  [/namaste/i, 'Namaste'],
  [/plagron/i, 'Plagron'],
  [/vitaflor/i, 'Vitaflor'],
  [/terrafertil/i, 'Terrafertil'],
  [/cultivate/i, 'Cultivate'],
  [/mamboret[aá]/i, 'Mamboretá'],
  [/bioproyect/i, 'Bioproyect'],
  [/kawsay/i, 'Kawsay'],
  [/canna\b/i, 'Canna'],
  [/juani\s*juana/i, 'JuaniJuana'],
  [/vamp\b/i, 'Vamp']
];

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
  const barcode = cleanText(value, 24).replace(/[^\d]/g, '');
  return barcode.length >= 6 && barcode.length <= 18 ? barcode : '';
}

function mapCategory(...values) {
  const text = values.filter(Boolean).join(' ').toLocaleLowerCase('es');
  const categoryRules = [
    ['Semillas', /semilla|seed|germin/],
    ['Sustratos', /sustrat|substrat|tierra|soil|turba|peat|coco|all mix|light mix|grow\s*mix/],
    ['Fertilizantes', /fertili|nutrient|abono|bio grow|bio bloom|estimulador|top\s*(?:veg|bloom|candy|bud)|deeper underground|big\s*one|bud\s*candy|sensi|microvita|kawsay|bioproyect/],
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

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (entity, code) => {
      const numericCode = Number(code);
      return Number.isInteger(numericCode) && numericCode >= 0 && numericCode <= 0x10FFFF
        ? String.fromCodePoint(numericCode)
        : entity;
    });
}

function stripHtml(value) {
  return cleanText(decodeHtmlEntities(String(value || '').replace(/<[^>]+>/g, ' ')), 500);
}

function detectGrowBrand(...values) {
  const text = values.filter(Boolean).join(' ');
  return GROW_BRAND_RULES.find(([pattern]) => pattern.test(text))?.[1] || null;
}

function extractPresentation(...values) {
  const text = values.filter(Boolean).join(' ');
  const match = text.match(/\b\d+(?:[.,]\d+)?\s*(?:ml|cc|l|lts?|litros?|g|grs?|kg|w|cm|mm|unidades?|uds?|u)\b/i);
  return match ? cleanText(match[0], 60) : null;
}

function hostnameFromUrl(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    return url.hostname.replace(/^www\./, '').toLowerCase();
  } catch (error) {
    return '';
  }
}

function isOfficialGrowProductUrl(value) {
  const hostname = hostnameFromUrl(value);
  return OFFICIAL_GROW_BRAND_DOMAINS.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
}

function growshopRelevanceScore(item) {
  const hostname = hostnameFromUrl(item.url);
  const text = [item.title, item.snippet, hostname].filter(Boolean).join(' ');
  let score = 0;
  if (KNOWN_GROWSHOP_DOMAINS.some(domain => hostname === domain || hostname.endsWith(`.${domain}`))) score += 7;
  if (/grow|cultiv|indoor|hidro|420/.test(hostname)) score += 5;
  if (GROW_CONTEXT_PATTERN.test(text)) score += 3;
  if (detectGrowBrand(text)) score += 3;
  if (/\.com\.ar$|\.ar$/.test(hostname)) score += 2;
  if (NON_GROW_PRODUCT_PATTERN.test(text)) score -= 10;
  return score;
}

function isGrowProduct(product) {
  if (!product) return false;
  return growshopRelevanceScore({
    title: [product.name, product.brand, product.presentation].filter(Boolean).join(' '),
    snippet: [product.description, product.category].filter(Boolean).join(' '),
    url: product.official_url || ''
  }) >= 3;
}

function buildGrowshopQuery(value) {
  const base = cleanText(value, 150);
  return cleanText(`${base} growshop Argentina`, 190);
}

function normalizeLookupMatchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function lookupMatchTokens(value) {
  return normalizeLookupMatchText(value)
    .split(/\s+/)
    .filter(token => token.length >= 2 && !SEARCH_MATCH_STOP_WORDS.has(token));
}

function isLikelyStoreLandingPage(item) {
  try {
    const url = new URL(item.url);
    const path = url.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
    const isGenericPath = !path || /^(?:home|inicio|tienda|shop|productos|catalogo)$/.test(path);
    const text = [item.title, item.snippet].filter(Boolean).join(' ');
    const hasProductEvidence = Boolean(
      item.price
      || extractPresentation(text)
      || detectGrowBrand(text)
      || /\b(?:sku|stock|comprar|precio|presentaci[oó]n)\b|\$\s*\d/i.test(text)
    );
    return isGenericPath && !hasProductEvidence;
  } catch (error) {
    return true;
  }
}

function growshopLookupMatchScore(item, query, barcode) {
  const searchableText = normalizeLookupMatchText([item.title, item.snippet, item.url].filter(Boolean).join(' '));
  if (barcode) {
    const searchableDigits = searchableText.replace(/\D/g, '');
    return searchableDigits.includes(barcode) ? 20 : Number.NEGATIVE_INFINITY;
  }

  const queryTokens = lookupMatchTokens(query);
  if (!queryTokens.length || isLikelyStoreLandingPage(item)) return Number.NEGATIVE_INFINITY;
  const itemTokens = new Set(lookupMatchTokens(searchableText));
  const compactItemText = searchableText.replace(/\s+/g, '');
  const matchedTokens = queryTokens.filter(token => itemTokens.has(token) || compactItemText.includes(token));
  const totalWeight = queryTokens.reduce((sum, token) => sum + token.length, 0);
  const matchedWeight = matchedTokens.reduce((sum, token) => sum + token.length, 0);
  const coverage = totalWeight ? matchedWeight / totalWeight : 0;
  const hasDistinctiveMatch = matchedTokens.some(token => token.length >= 4);

  // Un dominio de growshop no alcanza: el resultado también debe coincidir
  // con términos concretos del producto solicitado.
  if (!hasDistinctiveMatch || coverage < 0.55) return Number.NEGATIVE_INFINITY;
  return Math.round(coverage * 10);
}

function buildGoogleArgentinaUrl(query) {
  const url = new URL(GOOGLE_SEARCH_WEB_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('gl', 'ar');
  url.searchParams.set('hl', 'es-419');
  url.searchParams.set('pws', '0');
  return url.toString();
}

function parseArgentinePrice(value) {
  const text = String(value || '');
  const match = text.match(/(?:ARS\s*|\$\s*)(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d{3,8}(?:,\d{1,2})?)/i);
  if (!match) return null;
  const normalized = match[1].replace(/[.\s]/g, '').replace(',', '.');
  const price = Number(normalized);
  return Number.isFinite(price) && price >= 100 ? price : null;
}

function normalizeUpcItem(item, barcode) {
  if (!item) return null;
  const name = cleanText(item.title || '');
  const brand = cleanText(item.brand || '');
  const presentation = cleanText(item.size || item.model || '');
  const category = cleanText(item.category || '');
  return {
    name: name || null,
    brand: brand || null,
    presentation: presentation || null,
    category: mapCategory(name, category),
    description: cleanText(item.description || category, 500) || null,
    barcode,
    official_url: null,
    market_query: cleanText([brand, name, presentation].filter(Boolean).join(' ')) || barcode,
    image_url: Array.isArray(item.images) ? item.images.find(Boolean) || null : null
  };
}

async function searchUpcItemDb(barcode) {
  if (!barcode) return null;
  const url = new URL(UPCITEMDB_LOOKUP_URL);
  url.searchParams.set('upc', barcode);
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'BO-Grow-Club/1.0 (https://boeweb.netlify.app)'
    }
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const item = payload?.items?.[0];
  if (!item) return null;
  return {
    product: normalizeUpcItem(item, barcode),
    source: {
      label: 'Base internacional de códigos de barras',
      url: `https://www.upcitemdb.com/upc/${encodeURIComponent(barcode)}`
    }
  };
}

function normalizeSearchTitle(value) {
  const title = stripHtml(value)
    .replace(/^comprar\s+/i, '')
    .replace(/\s+[|–—-]\s+[^|–—-]*(?:grow\s*shop|tienda online|mercado libre)[^|–—-]*$/i, '')
    .trim();
  return cleanText(title, 180);
}

function normalizeGrowshopSearchItem(item) {
  const meta = item?.pagemap?.metatags?.[0] || {};
  const title = normalizeSearchTitle(item?.title || meta['og:title'] || '');
  const snippet = cleanText(item?.snippet || meta['og:description'] || meta.description || '', 500);
  const url = cleanText(item?.link || '', 500);
  const image = item?.pagemap?.cse_image?.[0]?.src || meta['og:image'] || null;
  const offer = item?.pagemap?.offer?.[0] || {};
  const price = parseArgentinePrice([
    offer.priceCurrency === 'ARS' ? `ARS ${offer.price || ''}` : '',
    meta['product:price:currency'] === 'ARS' ? `ARS ${meta['product:price:amount'] || ''}` : '',
    snippet,
    title
  ].join(' '));
  return { title, snippet, url, image, price, score: 0 };
}

function productFromGrowshopItem(item, barcode) {
  const brand = detectGrowBrand(item.title, item.snippet);
  const presentation = extractPresentation(item.title, item.snippet);
  return {
    name: item.title || null,
    brand,
    presentation,
    category: mapCategory(item.title, item.snippet),
    description: item.snippet || null,
    barcode: barcode || null,
    official_url: isOfficialGrowProductUrl(item.url) ? item.url : null,
    market_query: item.title || cleanText([brand, presentation].filter(Boolean).join(' ')) || barcode,
    image_url: item.image || null
  };
}

function marketFromGrowshopItems(query, searchUrl, items, provider) {
  const pricedItems = items
    .filter(item => Number.isFinite(item.price) && item.price > 0)
    .map(item => ({
      title: item.title,
      price: item.price,
      currency_id: 'ARS',
      permalink: item.url,
      condition: null,
      source: provider
    }));
  const stats = calculateMarketStats(pricedItems);
  if (!stats.comparableItems.length) return null;
  return {
    provider,
    query,
    search_url: searchUrl,
    currency: 'ARS',
    average_price: Math.round(stats.average),
    median_price: Math.round(stats.median),
    sample_size: stats.comparableItems.length,
    results: stats.comparableItems.slice(0, 5)
  };
}

function growshopResultFromItems(items, query, searchUrl, barcode, provider) {
  const rankedItems = items
    .map(item => ({
      ...item,
      score: growshopRelevanceScore(item) + growshopLookupMatchScore(item, query, barcode)
    }))
    .filter(item => item.title && item.url && Number.isFinite(item.score) && item.score >= 3)
    .sort((a, b) => b.score - a.score);
  if (!rankedItems.length) return null;
  const product = productFromGrowshopItem(rankedItems[0], barcode);
  const officialItem = rankedItems.find(item => isOfficialGrowProductUrl(item.url));
  if (officialItem) product.official_url = officialItem.url;
  return {
    product,
    market: marketFromGrowshopItems(query, searchUrl, rankedItems, provider),
    sources: rankedItems.slice(0, 5).map(item => ({
      label: `${provider}: ${item.title}`,
      url: item.url
    })),
    provider
  };
}

async function searchGoogleArgentinaGrowshops(value, barcode) {
  const query = buildGrowshopQuery(value);
  const searchUrl = buildGoogleArgentinaUrl(query);
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const engineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
  if (!apiKey || !engineId) return { result: null, searchUrl, configured: false };

  const url = new URL(GOOGLE_CUSTOM_SEARCH_URL);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('cx', engineId);
  url.searchParams.set('q', query);
  url.searchParams.set('gl', 'ar');
  url.searchParams.set('cr', 'countryAR');
  url.searchParams.set('hl', 'es');
  url.searchParams.set('lr', 'lang_es');
  url.searchParams.set('safe', 'active');
  url.searchParams.set('num', '10');
  const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
  // Google cerró esta API para clientes nuevos. En ese caso continuamos con
  // las fuentes públicas de growshops sin mostrarle un error técnico al vendedor.
  if (response.status === 403) return { result: null, searchUrl, configured: false };
  if (!response.ok) throw new Error(`Google Argentina respondió con estado ${response.status}`);
  const payload = await response.json();
  const items = (payload.items || []).map(normalizeGrowshopSearchItem);
  return {
    result: growshopResultFromItems(items, value, searchUrl, barcode, 'Google Argentina'),
    searchUrl,
    configured: true
  };
}

function resultUrlFromDuckDuckGo(value) {
  const decoded = decodeHtmlEntities(value);
  try {
    const url = new URL(decoded, 'https://html.duckduckgo.com');
    return url.searchParams.get('uddg') || url.toString();
  } catch (error) {
    return '';
  }
}

async function searchGrowshopWeb(value, barcode) {
  const query = buildGrowshopQuery(value);
  const response = await fetchWithTimeout(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'es-AR,es;q=0.9'
    }
  });
  if (!response.ok) return null;
  const html = await response.text();
  const links = [...html.matchAll(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  const snippets = [...html.matchAll(/<(?:a|div)[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/gi)]
    .map(match => stripHtml(match[1]));
  const items = links.map((match, index) => ({
    title: normalizeSearchTitle(match[2]),
    snippet: snippets[index] || '',
    url: resultUrlFromDuckDuckGo(match[1]),
    image: null,
    price: parseArgentinePrice(`${match[2]} ${snippets[index] || ''}`),
    score: 0
  }));
  return growshopResultFromItems(
    items,
    value,
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
    barcode,
    'Web growshop Argentina'
  );
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
    provider: 'Mercado Libre',
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
      condition: item.condition || null,
      source: 'Mercado Libre'
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

async function searchValidatedGenericBarcode(barcode) {
  if (!barcode) return null;
  for (const searchProvider of [searchOpenProducts, searchUpcItemDb]) {
    try {
      const result = await searchProvider(barcode);
      if (result?.product && isGrowProduct(result.product)) return result;
    } catch (error) {
      console.warn('Falló una base genérica de EAN:', error.message);
    }
  }
  return null;
}

function uniqueSources(items) {
  const urls = new Set();
  return items.filter(item => {
    if (!item?.url || !hostnameFromUrl(item.url) || urls.has(item.url)) return false;
    urls.add(item.url);
    return true;
  });
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
    const lookupValue = query || barcode;
    const [googleAttempt, webAttempt, genericAttempt] = await Promise.allSettled([
      searchGoogleArgentinaGrowshops(lookupValue, barcode),
      searchGrowshopWeb(lookupValue, barcode),
      searchValidatedGenericBarcode(barcode)
    ]);
    const googleSearch = googleAttempt.status === 'fulfilled'
      ? googleAttempt.value
      : {
          result: null,
          searchUrl: buildGoogleArgentinaUrl(buildGrowshopQuery(lookupValue)),
          configured: true
        };
    if (googleAttempt.status === 'rejected') {
      console.warn('Falló Google Argentina:', googleAttempt.reason?.message);
      warnings.push('Google Argentina no respondió; se usaron growshops argentinos de respaldo.');
    }
    if (webAttempt.status === 'rejected') {
      console.warn('Falló la búsqueda web de growshops:', webAttempt.reason?.message);
    }
    const productResult = googleSearch.result
      || (webAttempt.status === 'fulfilled' ? webAttempt.value : null)
      || (genericAttempt.status === 'fulfilled' ? genericAttempt.value : null);

    const primaryMarketQuery = productResult?.product?.market_query || productResult?.product?.name || query || barcode;
    let market = productResult?.market || null;
    try {
      if (!market) market = await searchMercadoLibre(primaryMarketQuery);
      if (!market && productResult?.product?.name && productResult.product.name !== primaryMarketQuery) {
        market = await searchMercadoLibre(productResult.product.name);
      }
    } catch (error) {
      warnings.push('Mercado Libre no respondió; el precio puede completarse manualmente.');
      console.warn('Falló la consulta de Mercado Libre:', error.message);
    }
    if (!market) warnings.push('El precio de venta debe confirmarlo el vendedor.');

    const product = productResult?.product || productFromMarket(market, barcode);
    const sources = [
      { label: 'Ver búsqueda en Google Argentina', url: googleSearch?.searchUrl },
      ...(productResult?.sources || []),
      ...(productResult?.source ? [productResult.source] : [])
    ];
    (market?.results || []).slice(0, 3).forEach(item => {
      sources.push({ label: `Referencia en ${item.source || market.provider || 'internet'}`, url: item.permalink });
    });

    return jsonResponse(200, {
      mode: 'lookup_without_ai',
      found: Boolean(product || market),
      product,
      market,
      sources: uniqueSources(sources),
      providers: [...new Set([
        productResult?.provider || (productResult ? 'Base EAN validada para growshop' : null),
        market?.provider
      ].filter(Boolean))],
      google_search_configured: Boolean(googleSearch?.configured),
      warnings
    });
  } catch (error) {
    console.error('Error al buscar producto sin IA:', error.message);
    return jsonResponse(502, { message: 'No se pudo consultar las fuentes externas. Podés continuar manualmente.' });
  }
}
