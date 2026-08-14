// Mercado Pago Preference Generator & Payment Engine

async function createMercadoPagoPreference(orderData, mpAccessToken) {
  const cleanToken = (mpAccessToken || '').replace(/^Bearer\s+/i, '').trim();
  if (!cleanToken) {
    throw new Error('Access Token de Mercado Pago no configurado. Ingresá al panel de administración (admin-config.html) para configurarlo.');
  }

  const cleanItems = (orderData.items || []).map(item => ({
    id: String(item.id || item.product_code || 'PROD'),
    title: String(item.name || 'Producto BÔ').substring(0, 120),
    quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
    currency_id: 'ARS',
    unit_price: Math.max(1, Number(item.price) || 1)
  }));

  if (cleanItems.length === 0) {
    throw new Error('El carrito no contiene productos válidos para procesar.');
  }

  const payerData = {};
  if (orderData.customerName) payerData.name = String(orderData.customerName).trim();
  if (orderData.customerEmail) payerData.email = String(orderData.customerEmail).trim();
  const rawPhone = String(orderData.customerPhone || '').replace(/\D/g, '');
  if (rawPhone && rawPhone.length >= 6) {
    payerData.phone = { number: rawPhone };
  }

  const isHttpsPublic = typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    !window.location.hostname.includes('localhost') &&
    !window.location.hostname.includes('127.0.0.1');

  const pathname = (typeof window !== 'undefined' && window.location.pathname) ? window.location.pathname : '/index.html';
  const cleanPath = pathname.endsWith('.html') ? pathname : (pathname.replace(/\/$/, '') + '/index.html');
  const baseUrl = (typeof window !== 'undefined' && window.location.origin)
    ? (window.location.origin + cleanPath)
    : 'http://127.0.0.1:4173/index.html';

  const preferencePayload = {
    items: cleanItems,
    payer: Object.keys(payerData).length > 0 ? payerData : undefined,
    back_urls: {
      success: `${baseUrl}?payment=success`,
      failure: `${baseUrl}?payment=failure`,
      pending: `${baseUrl}?payment=pending`
    },
    statement_descriptor: 'BO GROWCLUB',
    external_reference: String(orderData.orderId || 'ORD-' + Date.now())
  };

  if (isHttpsPublic) {
    preferencePayload.auto_return = 'approved';
  }

  const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cleanToken}`
    },
    body: JSON.stringify(preferencePayload)
  });

  if (!response.ok) {
    let detail = `Error HTTP ${response.status}`;
    try {
      const errData = await response.json();
      const causes = Array.isArray(errData.cause) ? errData.cause.map(c => c.description || c.code).join(', ') : '';
      detail = errData.message || errData.error || causes || detail;
    } catch (_) {}
    if (response.status === 401) {
      throw new Error(`Token no autorizado (${detail}). Asegurate de copiar el Access Token (APP_USR-... o TEST-...) de tu panel de Desarrolladores de Mercado Pago.`);
    }
    throw new Error(`Mercado Pago (${response.status}): ${detail}`);
  }

  const result = await response.json();
  return {
    init_point: result.init_point,
    sandbox_init_point: result.sandbox_init_point,
    id: result.id
  };
}

async function testMercadoPagoCredentials(mpAccessToken) {
  const cleanToken = (mpAccessToken || '').replace(/^Bearer\s+/i, '').trim();
  if (!cleanToken) {
    return { ok: false, error: 'El campo Access Token está vacío.' };
  }

  try {
    const testPayload = {
      items: [
        {
          id: 'TEST-ITEM',
          title: 'Prueba de Conexión BÔ Grow Club',
          quantity: 1,
          currency_id: 'ARS',
          unit_price: 100
        }
      ]
    };

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cleanToken}`
      },
      body: JSON.stringify(testPayload)
    });

    if (!response.ok) {
      let detail = `Error HTTP ${response.status}`;
      try {
        const errData = await response.json();
        const causes = Array.isArray(errData.cause) ? errData.cause.map(c => c.description || c.code).join(', ') : '';
        detail = errData.message || errData.error || causes || detail;
      } catch (_) {}
      return { ok: false, status: response.status, error: detail };
    }

    const data = await response.json();
    return { ok: true, preferenceId: data.id };
  } catch (err) {
    return { ok: false, error: err.message || 'Error de red o conexión.' };
  }
}

window.createMercadoPagoPreference = createMercadoPagoPreference;
window.testMercadoPagoCredentials = testMercadoPagoCredentials;

