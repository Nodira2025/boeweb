import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import {
  isUuid,
  jsonResponse,
  requireServerConfig,
  safeErrorStatus
} from './_shared/http-auth.mjs';

export const config = {
  rateLimit: {
    windowLimit: 20,
    windowSize: 60,
    aggregateBy: ['domain', 'ip']
  }
};

function cleanText(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, maxLength);
}

export function getAllowedOrigin(request) {
  const configuredSite = String(process.env.PUBLIC_SITE_URL || '').trim().replace(/\/$/, '');
  const origin = String(request.headers.get('origin') || '').trim().replace(/\/$/, '');
  if (configuredSite) {
    if (!origin || origin === configuredSite) return configuredSite;
    return null;
  }
  if (/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(origin)) return origin;
  return null;
}

export function corsHeaders(request) {
  const origin = getAllowedOrigin(request);
  return origin ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin'
  } : {};
}

export function normalizeRequest(body) {
  // Public tenant selection is deployment-owned; request payloads cannot switch tenant context.
  const tenantId = cleanText(process.env.PUBLIC_TENANT_ID || process.env.DEFAULT_TENANT_ID, 40);
  if (!isUuid(tenantId)) {
    const error = new Error('No se pudo identificar la tienda.');
    error.statusCode = 422;
    throw error;
  }
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) {
    const error = new Error('El pedido debe contener entre 1 y 50 productos.');
    error.statusCode = 422;
    throw error;
  }
  const items = body.items.map(item => {
    const productId = cleanText(item.product_id || item.product_code || item.id, 160);
    const quantity = Number(item.quantity);
    if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      const error = new Error('Producto o cantidad inválida en el pedido.');
      error.statusCode = 422;
      throw error;
    }
    return { product_id: productId, quantity };
  });
  const customer = {
    name: cleanText(body.customerName, 160),
    email: cleanText(body.customerEmail, 254).toLowerCase(),
    phone: cleanText(body.customerPhone, 40)
  };
  if (!customer.name || !customer.phone) {
    const error = new Error('Nombre y teléfono son obligatorios.');
    error.statusCode = 422;
    throw error;
  }
  const delivery = {
    type: cleanText(body.deliveryType, 30).toUpperCase() || 'PICKUP',
    address: cleanText(body.address, 500)
  };
  const idempotencyKey = cleanText(body.idempotencyKey || body.orderId || randomUUID(), 160);
  return {
    tenantId,
    items,
    customer,
    delivery,
    notes: cleanText(body.notes, 1000),
    couponCode: cleanText(body.couponCode, 80).toUpperCase() || null,
    idempotencyKey
  };
}

export async function createCanonicalOrder(supabaseAdmin, input) {
  const { data, error } = await supabaseAdmin.rpc('create_public_order_v2', {
    p_tenant_id: input.tenantId,
    p_idempotency_key: input.idempotencyKey,
    p_items: input.items,
    p_customer: input.customer,
    p_delivery: input.delivery,
    p_notes: input.notes || null,
    p_coupon_code: input.couponCode
  });
  if (error) throw error;
  const order = Array.isArray(data) ? data[0] : data;
  if (!order?.order_id || !Array.isArray(order.items) || Number(order.total) <= 0) {
    throw new Error('La base no devolvió una orden canónica válida.');
  }
  return order;
}

async function createMercadoPagoPreference(order, input) {
  const accessToken = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  const publicSiteUrl = String(process.env.PUBLIC_SITE_URL || '').trim().replace(/\/$/, '');
  if (!accessToken || !publicSiteUrl) {
    const error = new Error('Mercado Pago no está configurado en el servidor.');
    error.statusCode = 503;
    throw error;
  }

  const preferencePayload = {
    items: order.items.map(item => ({
      id: String(item.product_id),
      title: cleanText(item.name, 120),
      quantity: Number(item.quantity),
      currency_id: order.currency || 'ARS',
      unit_price: Number(item.unit_price)
    })),
    payer: {
      name: input.customer.name,
      email: input.customer.email || undefined,
      phone: { number: input.customer.phone.replace(/\D/g, '') }
    },
    back_urls: {
      success: `${publicSiteUrl}/index.html?payment=success&order=${encodeURIComponent(order.order_number)}`,
      failure: `${publicSiteUrl}/index.html?payment=failure&order=${encodeURIComponent(order.order_number)}`,
      pending: `${publicSiteUrl}/index.html?payment=pending&order=${encodeURIComponent(order.order_number)}`
    },
    notification_url: `${publicSiteUrl}/.netlify/functions/mercadopago-webhook`,
    auto_return: 'approved',
    external_reference: String(order.order_id),
    statement_descriptor: cleanText(process.env.MERCADOPAGO_STATEMENT_DESCRIPTOR || 'BO GROW CLUB', 22)
  };

  const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-Idempotency-Key': input.idempotencyKey
    },
    body: JSON.stringify(preferencePayload)
  });
  let responseBody = {};
  try {
    responseBody = await response.json();
  } catch (parseError) {
    console.warn('Mercado Pago devolvió una respuesta sin JSON:', parseError.message);
  }
  if (!response.ok || !responseBody?.id || !responseBody?.init_point) {
    const error = new Error(responseBody?.message || `Mercado Pago rechazó la preferencia (${response.status}).`);
    error.statusCode = 502;
    throw error;
  }
  return responseBody;
}

async function persistProviderReference(supabaseAdmin, orderId, preference) {
  const { error } = await supabaseAdmin
    .from('public_orders_v2')
    .update({
      payment_provider: 'MERCADO_PAGO',
      provider_reference: String(preference.id),
      provider_checkout_url: preference.init_point,
      payment_status: 'PENDING',
      updated_at: new Date().toISOString()
    })
    .eq('id', orderId);
  if (error) throw error;
}

export default async function (request) {
  const headers = corsHeaders(request);
  if (request.method === 'OPTIONS') return jsonResponse(204, {}, headers);
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method Not Allowed' }, headers);
  if (!getAllowedOrigin(request)) return jsonResponse(403, { error: 'Origen no permitido.' }, headers);

  try {
    const body = await request.json();
    const input = normalizeRequest(body);
    const { supabaseUrl, serviceRoleKey } = requireServerConfig();
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const order = await createCanonicalOrder(supabaseAdmin, input);

    if (order.provider_checkout_url && order.provider_reference) {
      return jsonResponse(200, {
        order_id: order.order_id,
        order_number: order.order_number,
        preference_id: order.provider_reference,
        init_point: order.provider_checkout_url,
        total: order.total,
        currency: order.currency || 'ARS',
        idempotent: true
      }, headers);
    }

    const preference = await createMercadoPagoPreference(order, input);
    await persistProviderReference(supabaseAdmin, order.order_id, preference);
    return jsonResponse(201, {
      order_id: order.order_id,
      order_number: order.order_number,
      preference_id: preference.id,
      init_point: preference.init_point,
      total: order.total,
      currency: order.currency || 'ARS',
      idempotent: false
    }, headers);
  } catch (error) {
    console.error('No se pudo crear la preferencia de pago:', error.message);
    return jsonResponse(safeErrorStatus(error, 400), { error: error.message }, headers);
  }
}
