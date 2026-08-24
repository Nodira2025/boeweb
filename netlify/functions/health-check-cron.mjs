import { createClient } from '@supabase/supabase-js';
import {
  jsonResponse,
  legacyJsonResponse,
  requireServerConfig,
  safeErrorStatus
} from './_shared/http-auth.mjs';

export const config = { schedule: '*/15 * * * *' };

function isAuthorizedManualInvocation(event) {
  if (event?.scheduled === true) return true;
  const configuredSecret = String(process.env.CRON_SECRET || '').trim();
  if (!configuredSecret) return false;
  const headers = event?.headers || {};
  const provided = String(headers['x-boe-cron-token'] || headers['X-Boe-Cron-Token'] || '').trim();
  return provided.length === configuredSecret.length && provided === configuredSecret;
}

async function countRows(query) {
  const { count, error } = await query;
  if (error) throw error;
  return Number(count || 0);
}

async function inspectTenant(supabaseAdmin, tenantId) {
  const staleOpenBefore = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();
  const staleOutboxBefore = new Date(Date.now() - (15 * 60 * 1000)).toISOString();

  const [negativeStock, staleCashSessions, stuckOutbox] = await Promise.all([
    countRows(supabaseAdmin
      .from('inventory_balances_v2')
      .select('product_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .lt('on_hand', 0)),
    countRows(supabaseAdmin
      .from('cash_sessions_v2')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'OPEN')
      .lt('opened_at', staleOpenBefore)),
    countRows(supabaseAdmin
      .from('outbox_events')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'PENDING')
      .lt('created_at', staleOutboxBefore))
  ]);

  const status = negativeStock > 0 || staleCashSessions > 0 || stuckOutbox > 0 ? 'ATTENTION' : 'HEALTHY';
  return {
    tenant_id: tenantId,
    status,
    findings: {
      negative_stock: negativeStock,
      stale_open_cash_sessions: staleCashSessions,
      stuck_outbox_events: stuckOutbox
    }
  };
}

async function runHealthCheck() {
  const startedAt = new Date().toISOString();
  const { supabaseUrl, serviceRoleKey } = requireServerConfig();
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // La expiración forma parte del mantenimiento operativo: liberar la reserva
  // y actualizar el pedido deben ocurrir en la misma transacción de Postgres.
  const { data: expirationResult, error: expirationError } = await supabaseAdmin.rpc(
    'expire_public_order_reservations_v2',
    { p_limit: 500 }
  );
  if (expirationError) throw expirationError;

  const { data: tenants, error: tenantsError } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('status', 'ACTIVE');
  if (tenantsError) throw tenantsError;

  const summaries = [];
  for (const tenant of tenants || []) {
    summaries.push(await inspectTenant(supabaseAdmin, tenant.id));
  }

  return {
    status: summaries.some(summary => summary.status !== 'HEALTHY') ? 'ATTENTION' : 'SUCCESS',
    scheduled_at: startedAt,
    expired_reservations: Number(expirationResult?.expired_reservations || 0),
    tenants_checked: summaries.length,
    summaries
  };
}

export async function handler(event) {
  if (event?.httpMethod && event.httpMethod !== 'POST') {
    return legacyJsonResponse(405, { error: 'Method Not Allowed' });
  }
  if (!isAuthorizedManualInvocation(event)) {
    return legacyJsonResponse(401, { error: 'Invocación programada no autorizada.' });
  }
  try {
    return legacyJsonResponse(200, await runHealthCheck());
  } catch (error) {
    console.error('Health check programado falló:', error.message);
    return legacyJsonResponse(safeErrorStatus(error, 500), { status: 'CHECK_FAILED', error: error.message });
  }
}

export default async function () {
  try {
    return jsonResponse(200, await runHealthCheck());
  } catch (error) {
    console.error('Health check programado falló:', error.message);
    return jsonResponse(safeErrorStatus(error, 500), { status: 'CHECK_FAILED', error: error.message });
  }
}
