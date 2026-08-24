/* Cliente público: crea órdenes canónicas sin confiar en precios del navegador. */

(function initPublicOrderApi(globalScope) {
  async function parseResponse(response) {
    try {
      return await response.json();
    } catch (error) {
      console.warn('El servidor de pedidos devolvió una respuesta sin JSON:', error);
      return {};
    }
  }

  function buildPayload(orderData) {
    const items = Array.isArray(orderData?.items) ? orderData.items.map(item => ({
      product_id: String(item.product_id || item.product_code || item.id || ''),
      quantity: Math.max(1, Math.trunc(Number(item.quantity) || 1))
    })) : [];
    if (items.length === 0 || items.some(item => !item.product_id)) {
      throw new Error('El pedido no contiene productos identificables.');
    }
    return {
      tenantId: orderData.tenantId,
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
    };
  }

  async function createPublicOrder(orderData) {
    const payload = buildPayload(orderData);
    const response = await fetch('/.netlify/functions/create-public-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': String(payload.idempotencyKey || '')
      },
      body: JSON.stringify(payload)
    });
    const result = await parseResponse(response);
    if (!response.ok || !result.order_id) {
      throw new Error(result.error || `No se pudo registrar el pedido (${response.status}).`);
    }
    return result;
  }

  const api = Object.freeze({ buildPayload, createPublicOrder });
  globalScope.PublicOrderApi = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
