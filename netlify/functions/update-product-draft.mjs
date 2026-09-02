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

const ALLOWED_ROLES = new Set(['ADMIN', 'SUPERVISOR', 'VENDEDOR']);

async function verifyCallerRole(supabaseAdmin, callerId, tenantId) {
  const [{ data: memberships, error }, { data: platformAdmin, error: adminError }] = await Promise.all([
    supabaseAdmin
      .from('tenant_users')
      .select('tenant_id, user_id, role, active')
      .eq('user_id', callerId)
      .eq('tenant_id', tenantId)
      .eq('active', true),
    supabaseAdmin
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', callerId)
      .maybeSingle()
  ]);

  if (error) throw error;
  if (adminError) throw adminError;

  if (platformAdmin?.user_id) return true;

  const validRole = memberships?.some(m => ALLOWED_ROLES.has(String(m.role || '').toUpperCase()));
  if (!validRole) {
    const err = new Error('No tenés permisos para actualizar borradores de productos en este comercio.');
    err.statusCode = 403;
    throw err;
  }
  return true;
}

async function processRequest({ method, headers, body }) {
  if (method !== 'POST') {
    return { status: 405, payload: { error: 'Método no permitido. Utilizá POST.' } };
  }

  try {
    if (!getBearerToken(headers)) {
      const authError = new Error('Se requiere una sesión autenticada.');
      authError.statusCode = 401;
      throw authError;
    }

    const { tenantId, draftId, updates } = body || {};
    const safeDraftId = draftId ? String(draftId).trim() : '';
    const safeTenantId = tenantId ? String(tenantId).trim() : '';

    if (!isUuid(safeDraftId)) {
      const err = new Error('Identificador de borrador no válido.');
      err.statusCode = 422;
      throw err;
    }

    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      const err = new Error('Los datos de actualización no son válidos.');
      err.statusCode = 422;
      throw err;
    }

    const { supabaseUrl, serviceRoleKey } = requireServerConfig();
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const caller = await authenticateBearer(supabaseAdmin, headers);

    // Buscar borrador existente
    const { data: draft, error: fetchError } = await supabaseAdmin
      .from('catalog_product_drafts_v2')
      .select('*')
      .eq('id', safeDraftId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!draft) {
      const notFound = new Error('Borrador de producto no encontrado.');
      notFound.statusCode = 404;
      throw notFound;
    }

    const targetTenantId = draft.tenant_id;
    if (safeTenantId && isUuid(safeTenantId) && safeTenantId !== targetTenantId) {
      const mismatch = new Error('El borrador no corresponde al comercio especificado.');
      mismatch.statusCode = 403;
      throw mismatch;
    }

    await verifyCallerRole(supabaseAdmin, caller.id, targetTenantId);

    if (!['PENDING_LOCATION', 'PENDING_REVIEW'].includes(draft.status)) {
      const invalidStatus = new Error('Solo se pueden actualizar borradores pendientes de ubicación o revisión.');
      invalidStatus.statusCode = 400;
      throw invalidStatus;
    }

    // Normalizar campos a actualizar
    const newName = updates.name !== undefined ? String(updates.name || '').trim() : draft.name;
    const newCategory = updates.category !== undefined ? String(updates.category || '').trim() : draft.category;
    const newPrice = updates.sale_price !== undefined || updates.price !== undefined
      ? Math.max(0, parseFloat(updates.sale_price ?? updates.price) || 0)
      : Number(draft.sale_price || 0);
    const newCost = updates.cost_price !== undefined
      ? Math.max(0, parseFloat(updates.cost_price) || 0)
      : Number(draft.cost_price || 0);
    const newStock = updates.stock_quantity !== undefined || updates.stock !== undefined || updates.initial_quantity !== undefined
      ? Math.max(0, parseInt(updates.stock_quantity ?? updates.stock ?? updates.initial_quantity, 10) || 0)
      : Number(draft.stock_quantity || 0);

    const mergedMetadata = {
      ...(draft.metadata || {}),
      ...(updates.metadata || {}),
      updated_via: 'serverless_update_product_draft',
      last_updated_at: new Date().toISOString()
    };

    const updatePayload = {
      name: newName,
      category: newCategory,
      sale_price: newPrice,
      cost_price: newCost,
      stock_quantity: newStock,
      metadata: mergedMetadata,
      updated_at: new Date().toISOString()
    };

    const { data: updatedDraft, error: updateError } = await supabaseAdmin
      .from('catalog_product_drafts_v2')
      .update(updatePayload)
      .eq('id', safeDraftId)
      .eq('tenant_id', targetTenantId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Registrar en auditoría
    try {
      await supabaseAdmin.from('operational_audit_log').insert({
        tenant_id: targetTenantId,
        actor_user_id: caller.id,
        action: 'CATALOG_PRODUCT_DRAFT_UPDATED',
        entity_type: 'CATALOG_PRODUCT_DRAFT_V2',
        entity_id: safeDraftId,
        after_data: {
          name: newName,
          category: newCategory,
          sale_price: newPrice,
          cost_price: newCost,
          stock_quantity: newStock
        }
      });
    } catch (auditErr) {
      console.warn('Aviso al registrar auditoría de borrador:', auditErr.message);
    }

    return {
      status: 200,
      payload: {
        success: true,
        draft: {
          draft_id: updatedDraft.id,
          status: updatedDraft.status,
          stock_quantity: updatedDraft.stock_quantity,
          name: updatedDraft.name,
          sale_price: updatedDraft.sale_price,
          cost_price: updatedDraft.cost_price,
          category: updatedDraft.category
        }
      }
    };
  } catch (error) {
    console.error('Error al actualizar borrador de producto:', error.message);
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
