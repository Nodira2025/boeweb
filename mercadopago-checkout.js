/* Checkout de Mercado Pago: las credenciales y los precios viven sólo en el servidor. */

async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch (error) {
    console.warn('El servidor de pagos devolvió una respuesta sin JSON:', error);
    return {};
  }
}

async function createMercadoPagoPreference(orderData) {
  const items = Array.isArray(orderData?.items) ? orderData.items.map(item => ({
    product_id: String(item.product_id || item.product_code || item.id || ''),
    quantity: Math.max(1, Math.trunc(Number(item.quantity) || 1))
  })) : [];
  if (items.length === 0 || items.some(item => !item.product_id)) {
    throw new Error('El carrito no contiene productos identificables.');
  }

  const response = await fetch('/.netlify/functions/create-payment-preference', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': String(orderData.idempotencyKey || orderData.orderId || '')
    },
    body: JSON.stringify({
      idempotencyKey: orderData.idempotencyKey || orderData.orderId,
      orderId: orderData.orderId,
      customerName: orderData.customerName,
      customerEmail: orderData.customerEmail,
      customerPhone: orderData.customerPhone,
      deliveryType: orderData.deliveryType,
      address: orderData.address,
      notes: orderData.notes,
      couponCode: orderData.couponCode,
      items
    })
  });
  const result = await parseJsonResponse(response);
  if (!response.ok || !result.init_point) {
    throw new Error(result.error || `No se pudo iniciar el pago (${response.status}).`);
  }
  return {
    init_point: result.init_point,
    id: result.preference_id,
    order_id: result.order_id,
    order_number: result.order_number,
    total: result.total,
    currency: result.currency,
    idempotent: result.idempotent === true
  };
}

async function testMercadoPagoCredentials() {
  return {
    ok: false,
    error: 'Las credenciales ya no se prueban desde el navegador. Verificá la integración server-side desde el panel operativo.'
  };
}

if (typeof window !== 'undefined') {
  window.createMercadoPagoPreference = createMercadoPagoPreference;
  window.testMercadoPagoCredentials = testMercadoPagoCredentials;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createMercadoPagoPreference, testMercadoPagoCredentials };
}
