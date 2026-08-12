import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sxbhrgvizqylnfcqzhin.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { requesterContext, targetTenantId, action, targetUserId, newRole, name } = JSON.parse(event.body || '{}');

    if (!requesterContext || !requesterContext.userId) {
      return { statusCode: 401, body: JSON.stringify({ error: '🔒 Acceso denegado: Usuario no autenticado.' }) };
    }

    const isSuperadmin = requesterContext.isSuperadmin || requesterContext.role === 'SUPERADMIN';
    if (!isSuperadmin && requesterContext.tenantId !== targetTenantId) {
      return { statusCode: 403, body: JSON.stringify({ error: '🔒 Acceso denegado RLS Multi-Tenant: ADMIN de Tenant A no puede modificar usuarios de Tenant B.' }) };
    }

    if (requesterContext.role !== 'ADMIN' && !isSuperadmin) {
      return { statusCode: 403, body: JSON.stringify({ error: '🔒 Acceso denegado: Únicamente el ADMIN o SUPERADMIN puede gestionar la nómina de usuarios.' }) };
    }

    if (newRole === 'SUPERADMIN' && !isSuperadmin) {
      return { statusCode: 403, body: JSON.stringify({ error: '🔒 Operación denegada: Un ADMIN local no puede otorgar ni promover a un usuario al rol SUPERADMIN.' }) };
    }

    // Execute via Supabase Service Role client if configured, or invoke RPC
    if (SUPABASE_SERVICE_ROLE_KEY) {
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data, error } = await supabaseAdmin.rpc('rpc_manage_tenant_user_saas', {
        p_target_tenant_id: targetTenantId,
        p_action: action,
        p_target_user_id: targetUserId,
        p_new_role: newRole,
        p_name: name
      });
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify(data) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        action,
        user: { id: targetUserId, tenant_id: targetTenantId, role: newRole, name }
      })
    };
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: err.message }) };
  }
}
