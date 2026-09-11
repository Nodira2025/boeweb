import { createClient } from '@supabase/supabase-js';
import { authenticateBearer, getBearerToken, isAllowedRequestOrigin, isUuid, jsonResponse, requireServerConfig, safeErrorStatus } from './_shared/http-auth.mjs';

const RESOURCES = Object.freeze({
  sources: ['external_catalog_sources_v2', 'id,source_type,name,contact_info,estimated_days,active,metadata'],
  offers: ['external_catalog_offers_v2', 'id,source_id,external_sku,name,category,cost_price,retail_price,available_units,active,metadata,updated_at']
});
const PAGE_SIZE = 500;

function failure(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function createAdminClient() {
  const { supabaseUrl, serviceRoleKey } = requireServerConfig();
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function verifyExportAccess(client, userId, tenantId) {
  try {
    const [membership, tenant] = await Promise.all([
      client.from('tenant_users').select('role').eq('user_id', userId).eq('tenant_id', tenantId).eq('active', true).maybeSingle(),
      client.from('tenants').select('id').eq('id', tenantId).eq('status', 'ACTIVE').maybeSingle()
    ]);
    if (membership.error || tenant.error) throw failure('No se pudieron verificar los permisos de exportación.', 503);
    if (!membership.data || !tenant.data) throw failure('No tenés acceso administrativo a este comercio.', 403);
    if (['ADMIN', 'SUPERADMIN'].includes(membership.data.role)) return;
    // A platform administrator still needs an active membership in the requested tenant.
    const platformAdmin = await client.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle();
    if (platformAdmin.error) throw failure('No se pudieron verificar los permisos de exportación.', 503);
    if (!platformAdmin.data) throw failure('Solo administradores pueden exportar inventarios.', 403);
  } catch (error) { throw error; }
}

async function readExportPage(client, { tenantId, resource, offset }) {
  try {
    const [table, columns] = RESOURCES[resource];
    const { data, count, error } = await client.from(table).select(columns, { count: 'exact' })
      .eq('tenant_id', tenantId).order('id', { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
    if (error || !Array.isArray(data) || !Number.isSafeInteger(count)) {
      throw failure('No se pudo leer el catálogo externo. Intentá nuevamente.', 503);
    }
    // Use actual page length so lower server row caps cannot truncate the workbook.
    const nextOffset = offset + data.length;
    if (data.length === 0 && nextOffset < count) throw failure('La lectura del catálogo quedó incompleta.', 503);
    return { rows: data, nextOffset: nextOffset < count ? nextOffset : null };
  } catch (error) { throw error; }
}

export function createInventoryExportHandler({ getAdminClient = createAdminClient } = {}) {
  return async function inventoryExport(request) {
    try {
      if (request.method !== 'POST') return jsonResponse(405, { error: 'Utilizá POST para exportar.' }, { Allow: 'POST' });
      if (!isAllowedRequestOrigin(request)) return jsonResponse(403, { error: 'Origen no permitido.' });
      if (!getBearerToken(request.headers)) return jsonResponse(401, { error: 'Iniciá sesión para exportar.' });
      const rawBody = await request.text();
      if (rawBody.length > 4096) throw failure('Solicitud demasiado grande.', 413);
      let body;
      try { body = JSON.parse(rawBody); }
      catch { throw failure('Solicitud inválida.', 400); }
      const { tenantId, resource, offset = 0 } = body || {};
      if (!isUuid(tenantId) || !Object.hasOwn(RESOURCES, resource) || !Number.isSafeInteger(offset) || offset < 0 || offset >= 1000000) {
        throw failure('Los parámetros de exportación no son válidos.', 422);
      }
      const client = getAdminClient();
      const caller = await authenticateBearer(client, request.headers);
      await verifyExportAccess(client, caller.id, tenantId);
      return jsonResponse(200, await readExportPage(client, { tenantId, resource, offset }));
    } catch (error) {
      const status = safeErrorStatus(error, 503);
      return jsonResponse(status, { error: status >= 500 ? 'No se pudo completar la exportación. Intentá nuevamente.' : error.message });
    }
  };
}

export default createInventoryExportHandler();
