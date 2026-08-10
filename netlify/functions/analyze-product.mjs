const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENROUTER_RESPONSES_URL = 'https://openrouter.ai/api/v1/responses';
const MERCADOLIBRE_SEARCH_URL = 'https://api.mercadolibre.com/sites/MLA/search';
const REQUEST_WINDOW_MS = 60_000;
const REQUEST_LIMIT_PER_WINDOW = 12;
const requestBuckets = new Map();

const productSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name', 'brand', 'presentation', 'category', 'description', 'barcode',
    'official_url', 'market_query', 'confidence', 'visible_text'
  ],
  properties: {
    name: { type: ['string', 'null'] },
    brand: { type: ['string', 'null'] },
    presentation: { type: ['string', 'null'] },
    category: {
      type: ['string', 'null'],
      enum: ['Semillas', 'Sustratos', 'Fertilizantes', 'Indoor', 'Vaporizadores', 'Macetas', 'Medición y Riego', 'Parafernalia', 'Otros', null]
    },
    description: { type: ['string', 'null'] },
    barcode: { type: ['string', 'null'] },
    official_url: { type: ['string', 'null'] },
    market_query: { type: ['string', 'null'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    visible_text: { type: 'array', items: { type: 'string' }, maxItems: 20 }
  }
};

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

function validateImageDataUrl(value) {
  if (typeof value !== 'string' || value.length > 8_000_000) return false;
  return /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(value);
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

function extractResponseText(openAiResponse) {
  if (typeof openAiResponse.output_text === 'string') return openAiResponse.output_text;
  for (const item of openAiResponse.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return '';
}

function extractWebSources(openAiResponse) {
  const byUrl = new Map();
  for (const item of openAiResponse.output || []) {
    const sources = item?.action?.sources || [];
    for (const source of sources) {
      if (source?.url && /^https?:\/\//i.test(source.url)) {
        byUrl.set(source.url, { title: source.title || 'Fuente consultada', url: source.url });
      }
    }
    for (const content of item?.content || []) {
      for (const annotation of content?.annotations || []) {
        const citation = annotation?.url_citation || annotation;
        if (annotation?.type === 'url_citation' && citation?.url && /^https?:\/\//i.test(citation.url)) {
          byUrl.set(citation.url, { title: citation.title || 'Fuente consultada', url: citation.url });
        }
      }
    }
  }
  return [...byUrl.values()].slice(0, 8);
}

function getAiProviderConfig() {
  if (process.env.OPENROUTER_API_KEY) {
    const models = [
      process.env.OPENROUTER_PRODUCT_MODEL || 'openrouter/free',
      process.env.OPENROUTER_FALLBACK_MODEL || 'openai/gpt-5-nano'
    ];
    return {
      name: 'OpenRouter',
      apiKey: process.env.OPENROUTER_API_KEY,
      endpoint: OPENROUTER_RESPONSES_URL,
      models: [...new Set(models.filter(Boolean))],
      tools: [{
        type: 'openrouter:web_search',
        parameters: { engine: 'auto', max_total_results: 5, search_context_size: 'low' }
      }]
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      name: 'OpenAI',
      apiKey: process.env.OPENAI_API_KEY,
      endpoint: OPENAI_RESPONSES_URL,
      models: [process.env.OPENAI_PRODUCT_MODEL || 'gpt-5.6'],
      tools: [{ type: 'web_search' }]
    };
  }
  return null;
}

function buildAiRequestBody(imageDataUrl, barcode, hints, provider, model) {
  const prompt = [
    'Analizá la foto de este producto para ayudar a un vendedor de Argentina a ingresarlo al stock.',
    'Extraé únicamente datos visibles o que puedas verificar con una fuente pública confiable.',
    'No inventes marca, presentación, código de barras ni URL. Usá null cuando no estés seguro.',
    'La descripción debe ser breve, comercial y factual, sin afirmar propiedades médicas.',
    'Si encontrás la página exacta del fabricante, official_url debe ser esa página; no uses tiendas ni redes sociales como página oficial.',
    'market_query debe ser una búsqueda corta y específica útil para Mercado Libre Argentina.',
    `Código de barras informado por el vendedor: ${barcode || 'no informado'}.`,
    `Pistas manuales: ${JSON.stringify(hints || {})}.`
  ].join('\n');
  const requestBody = {
    model,
    store: false,
    input: [{
      role: 'user',
      content: [
        { type: 'input_text', text: prompt },
        { type: 'input_image', image_url: imageDataUrl, detail: 'high' }
      ]
    }],
    tools: provider.tools,
    text: {
      format: {
        type: 'json_schema',
        name: 'product_stock_analysis',
        strict: true,
        schema: productSchema
      }
    },
    max_output_tokens: 1400
  };
  if (model !== 'openrouter/free') requestBody.reasoning = { effort: 'low' };
  return requestBody;
}

async function analyzeWithModel(imageDataUrl, barcode, hints, provider, model) {
  const requestBody = buildAiRequestBody(imageDataUrl, barcode, hints, provider, model);
  const headers = {
    Authorization: `Bearer ${provider.apiKey}`,
    'Content-Type': 'application/json'
  };
  if (provider.name === 'OpenRouter') {
    headers['HTTP-Referer'] = process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://boeweb.netlify.app';
    headers['X-Title'] = 'BÔ Grow Club · Ingreso de stock';
  }
  const response = await fetch(provider.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `${provider.name} respondió con estado ${response.status}`;
    throw new Error(message);
  }
  const outputText = extractResponseText(payload);
  if (!outputText) throw new Error('El modelo no devolvió datos estructurados.');
  return { product: JSON.parse(outputText), sources: extractWebSources(payload), model };
}

async function analyzeWithAI(imageDataUrl, barcode, hints, provider) {
  const errors = [];
  for (const model of provider.models) {
    try {
      return await analyzeWithModel(imageDataUrl, barcode, hints, provider, model);
    } catch (error) {
      errors.push(`${model}: ${error.message}`);
      console.warn(`Falló el análisis con ${model}:`, error.message);
    }
  }
  console.error('Todos los modelos de análisis fallaron:', errors.join(' | '));
  throw new Error('La IA no pudo procesar la foto. Reintentá en unos segundos.');
}

function calculateMarketStats(items) {
  const arsItems = items.filter(item => item.currency_id === 'ARS' && Number.isFinite(Number(item.price)) && Number(item.price) > 0);
  if (!arsItems.length) return { average: null, median: null, sample: [] };
  const sorted = arsItems.map(item => Number(item.price)).sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  const comparable = arsItems.filter(item => Number(item.price) >= median * 0.35 && Number(item.price) <= median * 2.8);
  const average = comparable.reduce((sum, item) => sum + Number(item.price), 0) / comparable.length;
  return { average, median, sample: comparable };
}

async function searchMercadoLibre(query) {
  if (!query) return null;
  const url = new URL(MERCADOLIBRE_SEARCH_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '20');
  const headers = { Accept: 'application/json' };
  if (process.env.MERCADOLIBRE_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.MERCADOLIBRE_ACCESS_TOKEN}`;
  const response = await fetch(url, { headers });
  if (!response.ok) return null;
  const payload = await response.json();
  const stats = calculateMarketStats(payload.results || []);
  if (!stats.sample.length) return null;
  return {
    query,
    search_url: `https://listado.mercadolibre.com.ar/${encodeURIComponent(query).replace(/%20/g, '-')}`,
    currency: 'ARS',
    average_price: Math.round(stats.average),
    median_price: Math.round(stats.median),
    sample_size: stats.sample.length,
    results: stats.sample.slice(0, 5).map(item => ({
      title: item.title,
      price: Number(item.price),
      permalink: item.permalink,
      condition: item.condition || null
    }))
  };
}

export default async function handler(request, context) {
  if (request.method !== 'POST') return jsonResponse(405, { message: 'Método no permitido.' });
  if (!isAllowedOrigin(request)) return jsonResponse(403, { message: 'Origen no autorizado.' });
  if (isRateLimited(request, context)) return jsonResponse(429, { message: 'Demasiados análisis. Esperá un minuto y volvé a intentar.' });
  const aiProvider = getAiProviderConfig();
  if (!aiProvider) {
    return jsonResponse(503, {
      code: 'IA_NOT_CONFIGURED',
      message: 'La IA todavía no tiene configurada OPENROUTER_API_KEY u OPENAI_API_KEY en el servidor.'
    });
  }
  try {
    const body = await request.json();
    if (!validateImageDataUrl(body.imageDataUrl)) {
      return jsonResponse(400, { message: 'La imagen no es válida o es demasiado grande.' });
    }
    const analysis = await analyzeWithAI(body.imageDataUrl, body.barcode, body.hints, aiProvider);
    let market = null;
    try {
      market = await searchMercadoLibre(analysis.product.market_query || analysis.product.name);
    } catch (marketError) {
      console.warn('No se pudo consultar Mercado Libre:', marketError.message);
    }
    return jsonResponse(200, { ...analysis, market, provider: aiProvider.name });
  } catch (error) {
    console.error('Error al analizar producto:', error.message);
    return jsonResponse(502, { message: `No se pudo completar el análisis: ${error.message}` });
  }
}
