// Mercado Pago Preference Generator & Payment Engine

async function createMercadoPagoPreference(orderData, mpAccessToken) {
  if (!mpAccessToken || mpAccessToken.trim() === '') {
    throw new Error('Access Token de Mercado Pago no configurado. Ingresá al panel de administración (admin-config.html) para configurarlo.');
  }

  const preferencePayload = {
    items: orderData.items.map(item => ({
      id: String(item.id),
      title: item.name,
      quantity: Number(item.quantity),
      currency_id: 'ARS',
      unit_price: Number(item.price)
    })),
    payer: {
      name: orderData.customerName,
      phone: {
        number: orderData.customerPhone
      }
    },
    back_urls: {
      success: window.location.origin + window.location.pathname + '?payment=success',
      failure: window.location.origin + window.location.pathname + '?payment=failure',
      pending: window.location.origin + window.location.pathname + '?payment=pending'
    },
    auto_return: 'approved',
    statement_descriptor: 'BO GROWCLUB',
    external_reference: orderData.orderId
  };

  const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mpAccessToken.trim()}`
    },
    body: JSON.stringify(preferencePayload)
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.message || 'Error al conectar con la API de Mercado Pago');
  }

  const result = await response.json();
  return {
    init_point: result.init_point,
    sandbox_init_point: result.sandbox_init_point,
    id: result.id
  };
}

window.createMercadoPagoPreference = createMercadoPagoPreference;
