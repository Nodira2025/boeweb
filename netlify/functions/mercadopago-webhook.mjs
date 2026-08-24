import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { jsonResponse, requireServerConfig, safeErrorStatus } from './_shared/http-auth.mjs';

function parseSignature(signatureHeader) {
  return String(signatureHeader || '').split(',').reduce((parts, fragment) => {
    const [key, value] = fragment.trim().split('=', 2);
    if (key && value) parts[key] = value;
    return parts;
  }, {});
}

function secureEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function validateWebhookSignature(request, dataId) {
  const secret = String(process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    const error = new Error('La firma de Webhooks no está configurada en el servidor.');
    error.statusCode = 503;
    throw error;
  }
  const requestId = String(request.headers.get('x-request-id') || '').trim();
  const signature = parseSignature(request.headers.get('x-signature'));
  if (!requestId || !signature.ts || !signature.v1 || !dataId) {
    const error = new Error('Notificación sin firma completa.');
    error.statusCode = 401;
    throw error;
  }
  const normalizedDataId = String(dataId).toLowerCase();
  const manifest = `id:${normalizedDataId};request-id:${requestId};ts:${signature.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  if (!secureEqual(expected, signature.v1)) {
    const error = new Error('Firma de Mercado Pago inválida.');
    error.statusCode = 401;
    throw error;
  }
}

async function fetchPayment(paymentId) {
  const token = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (!token) {
    const error = new Error('Mercado Pago no está configurado en el servidor.');
    error.statusCode = 503;
    throw error;
  }
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  let body = {};
  try {
    body = await response.json();
  } catch (parseError) {
    console.warn('Respuesta de pago sin JSON:', parseError.message);
  }
  if (!response.ok || !body?.id) {
    const error = new Error(body?.message || `No se pudo verificar el pago (${response.status}).`);
    error.statusCode = 502;
    throw error;
  }
  return body;
}

function normalizePaymentStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'approved') return 'APPROVED';
  if (value === 'rejected') return 'REJECTED';
  if (value === 'cancelled' || value === 'cancelled_by_user') return 'CANCELLED';
  if (value === 'refunded' || value === 'charged_back') return 'REFUNDED';
  return 'PENDING';
}

export default async function (request) {
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method Not Allowed' });

  try {
    let body = {};
    try {
      body = await request.json();
    } catch (parseError) {
      const invalidBody = new Error('El Webhook no contiene JSON válido.');
      invalidBody.statusCode = 400;
      throw invalidBody;
    }
    const url = new URL(request.url);
    const dataId = url.searchParams.get('data.id') || url.searchParams.get('data_id') || body?.data?.id;
    validateWebhookSignature(request, dataId);

    if (String(body.type || url.searchParams.get('type') || '').toLowerCase() !== 'payment') {
      return jsonResponse(200, { received: true, ignored: true });
    }

    const payment = await fetchPayment(dataId);
    const orderId = String(payment.external_reference || '').trim();
    if (!orderId) {
      const error = new Error('El pago no está vinculado a una orden interna.');
      error.statusCode = 422;
      throw error;
    }

    const { supabaseUrl, serviceRoleKey } = requireServerConfig();
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await supabaseAdmin.rpc('confirm_public_order_payment_v2', {
      p_order_id: orderId,
      p_provider_payment_id: String(payment.id),
      p_status: normalizePaymentStatus(payment.status),
      p_amount: Number(payment.transaction_amount || 0),
      p_raw: {
        id: payment.id,
        status: payment.status,
        status_detail: payment.status_detail,
        payment_method_id: payment.payment_method_id,
        payment_type_id: payment.payment_type_id,
        currency_id: payment.currency_id,
        transaction_amount: payment.transaction_amount,
        date_approved: payment.date_approved
      }
    });
    if (error) throw error;
    return jsonResponse(200, { received: true, result: data });
  } catch (error) {
    console.error('Webhook Mercado Pago rechazado:', error.message);
    return jsonResponse(safeErrorStatus(error, 500), { error: error.message });
  }
}
