import { createClient } from '@supabase/supabase-js';
import {
  authenticateBearer,
  getBearerToken,
  isUuid,
  jsonResponse,
  legacyJsonResponse,
  requireServerConfig,
  safeErrorStatus
} from './_shared/http-auth.mjs';

const ACTIONS = new Set(['INVITE', 'CREATE', 'SUSPEND', 'ACTIVATE', 'CHANGE_ROLE']);
const ROLES = new Set(['ADMIN', 'SUPERVISOR', 'VENDEDOR', 'DEPOSITO']);

function normalizePayload(rawPayload) {
  const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
  const action = String(payload.action || '').trim().toUpperCase();
  const targetTenantId = String(payload.targetTenantId || '').trim();
  const targetUserId = String(payload.targetUserId || '').trim();
  const newRole = payload.newRole ? String(payload.newRole).trim().toUpperCase() : null;
  const name = payload.name ? String(payload.name).trim().slice(0, 160) : null;

  if (!ACTIONS.has(action)) {
    const error = new Error('Acción de gestión de usuario no permitida.');
    error.statusCode = 422;
    throw error;
  }
  if (!isUuid(targetTenantId) || !isUuid(targetUserId)) {
    const error = new Error('Tenant y usuario objetivo deben ser identificadores UUID válidos.');
    error.statusCode = 422;
    throw error;
  }
  if (['INVITE', 'CREATE', 'CHANGE_ROLE'].includes(action) && !ROLES.has(newRole || 'VENDEDOR')) {
    const error = new Error('Rol objetivo no permitido.');
    error.statusCode = 422;
    throw error;
  }
  return { action, targetTenantId, targetUserId, newRole: newRole || 'VENDEDOR', name };
}

async function getCallerAuthorization(supabaseAdmin, callerId, targetTenantId) {
  const [{ data: memberships, error }, { data: platformAdmin, error: platformAdminError }] = await Promise.all([
    supabaseAdmin
      .from('tenant_users')
      .select('tenant_id,user_id,email,name,role,active')
      .eq('user_id', callerId)
      .eq('active', true),
    supabaseAdmin
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', callerId)
      .maybeSingle()
  ]);
  if (error) throw error;
  if (platformAdminError) throw platformAdminError;

  const rows = Array.isArray(memberships) ? memberships : [];
  const superadmin = platformAdmin ? { user_id: callerId, role: 'SUPERADMIN' } : null;
  const localAdmin = rows.find(row => row.tenant_id === targetTenantId && row.role === 'ADMIN');
  if (!superadmin && !localAdmin) {
    const authError = new Error('No tenés permisos de administración para esta empresa.');
    authError.statusCode = 403;
    throw authError;
  }
  return { membership: superadmin || localAdmin, isSuperadmin: Boolean(superadmin) };
}

async function ensureTargetCanChange(supabaseAdmin, callerAuthorization, payload) {
  const { data: currentTarget, error } = await supabaseAdmin
    .from('tenant_users')
    .select('tenant_id,user_id,email,name,role,active')
    .eq('tenant_id', payload.targetTenantId)
    .eq('user_id', payload.targetUserId)
    .maybeSingle();
  if (error) throw error;

  if (currentTarget?.role === 'SUPERADMIN' && !callerAuthorization.isSuperadmin) {
    const authError = new Error('Un administrador local no puede modificar un superadministrador.');
    authError.statusCode = 403;
    throw authError;
  }
  if (payload.newRole === 'SUPERADMIN') {
    const authError = new Error('La promoción a SUPERADMIN no está disponible desde este endpoint.');
    authError.statusCode = 403;
    throw authError;
  }

  const removesAdmin = currentTarget?.role === 'ADMIN'
    && (payload.action === 'SUSPEND' || (payload.action === 'CHANGE_ROLE' && payload.newRole !== 'ADMIN'));
  if (removesAdmin) {
    const { count, error: countError } = await supabaseAdmin
      .from('tenant_users')
      .select('user_id', { count: 'exact', head: true })
      .eq('tenant_id', payload.targetTenantId)
      .eq('role', 'ADMIN')
      .eq('active', true);
    if (countError) throw countError;
    if (Number(count || 0) <= 1) {
      const conflict = new Error('No se puede quitar el último administrador activo de la empresa.');
      conflict.statusCode = 409;
      throw conflict;
    }
  }
  return currentTarget;
}

async function mutateTenantUser(supabaseAdmin, payload, currentTarget) {
  if (payload.action === 'INVITE' || payload.action === 'CREATE') {
    const { data: authLookup, error: authLookupError } = await supabaseAdmin.auth.admin.getUserById(payload.targetUserId);
    if (authLookupError || !authLookup?.user) {
      const notFound = new Error('El usuario debe existir previamente en Supabase Auth.');
      notFound.statusCode = 404;
      throw notFound;
    }
    const authUser = authLookup.user;
    const row = {
      tenant_id: payload.targetTenantId,
      user_id: payload.targetUserId,
      email: String(authUser.email || '').trim(),
      name: payload.name || currentTarget?.name || authUser.user_metadata?.name || authUser.email,
      role: payload.newRole,
      active: true
    };
    if (!row.email) {
      const invalidUser = new Error('El usuario de Supabase Auth no tiene email utilizable.');
      invalidUser.statusCode = 422;
      throw invalidUser;
    }
    const { data, error } = await supabaseAdmin
      .from('tenant_users')
      .upsert(row, { onConflict: 'tenant_id,user_id' })
      .select('tenant_id,user_id,email,name,role,active')
      .single();
    if (error) throw error;
    return data;
  }

  const changes = payload.action === 'SUSPEND'
    ? { active: false }
    : payload.action === 'ACTIVATE'
      ? { active: true }
      : { role: payload.newRole };
  const { data, error } = await supabaseAdmin
    .from('tenant_users')
    .update(changes)
    .eq('tenant_id', payload.targetTenantId)
    .eq('user_id', payload.targetUserId)
    .select('tenant_id,user_id,email,name,role,active')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const notFound = new Error('No se encontró la membresía a modificar.');
    notFound.statusCode = 404;
    throw notFound;
  }
  return data;
}

async function recordAudit(supabaseAdmin, caller, payload, before, after) {
  const { error } = await supabaseAdmin.from('operational_audit_log').insert({
    tenant_id: payload.targetTenantId,
    actor_user_id: caller.id,
    action: `TENANT_USER_${payload.action}`,
    entity_type: 'TENANT_USER',
    entity_id: payload.targetUserId,
    before_data: before || {},
    after_data: after || {},
    metadata: { source: 'manage-tenant-user' }
  });
  if (error) {
    console.error('No se pudo registrar auditoría de gestión de usuario:', error.message);
    return false;
  }
  return true;
}

async function processRequest({ method, headers, body }) {
  if (method !== 'POST') return { status: 405, payload: { error: 'Method Not Allowed' } };

  try {
    if (!getBearerToken(headers)) {
      const authError = new Error('Se requiere una sesión autenticada.');
      authError.statusCode = 401;
      throw authError;
    }
    const { supabaseUrl, serviceRoleKey } = requireServerConfig();
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const caller = await authenticateBearer(supabaseAdmin, headers);
    const payload = normalizePayload(body);
    const authorization = await getCallerAuthorization(supabaseAdmin, caller.id, payload.targetTenantId);
    const before = await ensureTargetCanChange(supabaseAdmin, authorization, payload);
    const after = await mutateTenantUser(supabaseAdmin, payload, before);
    const auditRecorded = await recordAudit(supabaseAdmin, caller, payload, before, after);
    return {
      status: 200,
      payload: { success: true, action: payload.action, user: after, auditRecorded }
    };
  } catch (error) {
    console.error('Gestión de usuario rechazada:', error.message);
    return { status: safeErrorStatus(error), payload: { error: error.message } };
  }
}

export async function handler(event) {
  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (error) {
    return legacyJsonResponse(400, { error: 'El cuerpo JSON no es válido.' });
  }
  const result = await processRequest({
    method: event.httpMethod,
    headers: event.headers || {},
    body
  });
  return legacyJsonResponse(result.status, result.payload);
}

export default async function (request) {
  let body = {};
  try {
    body = request.method === 'POST' ? await request.json() : {};
  } catch (error) {
    return jsonResponse(400, { error: 'El cuerpo JSON no es válido.' });
  }
  const result = await processRequest({ method: request.method, headers: request.headers, body });
  return jsonResponse(result.status, result.payload);
}
