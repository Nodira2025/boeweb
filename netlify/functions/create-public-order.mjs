import { createClient } from '@supabase/supabase-js';
import {
  corsHeaders,
  createCanonicalOrder,
  getAllowedOrigin,
  normalizeRequest
} from './create-payment-preference.mjs';
import { jsonResponse, requireServerConfig, safeErrorStatus } from './_shared/http-auth.mjs';

export const config = {
  rateLimit: {
    windowLimit: 30,
    windowSize: 60,
    aggregateBy: ['domain', 'ip']
  }
};

export default async function (request) {
  const headers = corsHeaders(request);
  if (request.method === 'OPTIONS') return jsonResponse(204, {}, headers);
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method Not Allowed' }, headers);
  if (!getAllowedOrigin(request)) return jsonResponse(403, { error: 'Origen no permitido.' }, headers);

  try {
    const input = normalizeRequest(await request.json());
    const { supabaseUrl, serviceRoleKey } = requireServerConfig();
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const order = await createCanonicalOrder(supabaseAdmin, input);
    return jsonResponse(201, {
      order_id: order.order_id,
      order_number: order.order_number,
      status: order.status,
      payment_status: order.payment_status,
      total: order.total,
      currency: order.currency || 'ARS',
      items: order.items,
      idempotent: order.idempotent === true
    }, headers);
  } catch (error) {
    console.error('No se pudo crear el pedido público:', error.message);
    return jsonResponse(safeErrorStatus(error, 400), { error: error.message }, headers);
  }
}
