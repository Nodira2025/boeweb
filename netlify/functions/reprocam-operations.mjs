import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
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
    const err = new Error('No tenés permisos operativos para realizar esta acción en Reprocam.');
    err.statusCode = 403;
    throw err;
  }
  return true;
}

async function handleOpenShift(supabaseAdmin, caller, body) {
  const { tenantId, registerId, openingAmount } = body;
  if (!isUuid(tenantId) || !isUuid(registerId)) {
    const err = new Error('Identificadores de comercio o terminal de caja no válidos.');
    err.statusCode = 422;
    throw err;
  }

  await verifyCallerRole(supabaseAdmin, caller.id, tenantId);

  // Verificar si ya existe sesión abierta
  const { data: existing, error: findErr } = await supabaseAdmin
    .from('cash_sessions_v2')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('register_id', registerId)
    .eq('status', 'OPEN')
    .maybeSingle();

  if (findErr) throw findErr;
  if (existing) {
    return { success: true, session: existing, alreadyOpen: true };
  }

  const amount = Math.max(0, parseFloat(openingAmount) || 0);

  const { data: newSession, error: insertErr } = await supabaseAdmin
    .from('cash_sessions_v2')
    .insert({
      tenant_id: tenantId,
      register_id: registerId,
      status: 'OPEN',
      opened_by: caller.id,
      opening_amount: amount
    })
    .select()
    .single();

  if (insertErr) throw insertErr;

  try {
    await supabaseAdmin.from('operational_audit_log').insert({
      tenant_id: tenantId,
      actor_user_id: caller.id,
      action: 'CASH_SESSION_OPENED',
      entity_type: 'CASH_SESSION_V2',
      entity_id: newSession.id,
      after_data: { register_id: registerId, opening_amount: amount, status: 'OPEN' }
    });
  } catch (auditErr) {
    console.warn('Aviso al auditar apertura de caja:', auditErr.message);
  }

  return { success: true, session: newSession };
}

async function handleCloseShift(supabaseAdmin, caller, body) {
  const { tenantId, sessionId, countedAmount, notes } = body;
  if (!isUuid(tenantId) || !isUuid(sessionId)) {
    const err = new Error('Identificadores de comercio o sesión no válidos.');
    err.statusCode = 422;
    throw err;
  }

  await verifyCallerRole(supabaseAdmin, caller.id, tenantId);

  const { data: session, error: sessErr } = await supabaseAdmin
    .from('cash_sessions_v2')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', sessionId)
    .maybeSingle();

  if (sessErr) throw sessErr;
  if (!session || session.status !== 'OPEN') {
    const err = new Error('La sesión de caja no existe o no se encuentra abierta.');
    err.statusCode = 400;
    throw err;
  }

  // Calcular movimientos de efectivo
  const { data: movs } = await supabaseAdmin
    .from('cash_movements_v2')
    .select('direction, amount')
    .eq('tenant_id', tenantId)
    .eq('session_id', sessionId);

  let cashDelta = 0;
  (movs || []).forEach(m => {
    const a = Number(m.amount || 0);
    if (m.direction === 'IN') cashDelta += a;
    else cashDelta -= a;
  });

  const opening = Number(session.opening_amount || 0);
  const expected = Math.round((opening + cashDelta) * 100) / 100;
  const counted = countedAmount !== undefined ? Math.max(0, parseFloat(countedAmount) || 0) : expected;
  const diff = Math.round((counted - expected) * 100) / 100;

  // Actualizar sesión a CLOSED
  const { error: updateErr } = await supabaseAdmin
    .from('cash_sessions_v2')
    .update({
      status: 'CLOSED',
      closed_by: caller.id,
      closed_at: new Date().toISOString()
    })
    .eq('tenant_id', tenantId)
    .eq('id', sessionId);

  if (updateErr) throw updateErr;

  // Insertar cierre
  const { data: closure } = await supabaseAdmin
    .from('cash_closures')
    .insert({
      tenant_id: tenantId,
      session_id: sessionId,
      expected_amount: expected,
      counted_amount: counted,
      difference: diff,
      review_status: 'PENDING_REVIEW',
      closed_by: caller.id,
      notes: notes ? String(notes).trim().slice(0, 500) : 'Cierre Turno Reprocam'
    })
    .select()
    .maybeSingle();

  try {
    await supabaseAdmin.from('operational_audit_log').insert({
      tenant_id: tenantId,
      actor_user_id: caller.id,
      action: 'CASH_CLOSURE_SUBMITTED',
      entity_type: 'CASH_CLOSURE',
      entity_id: closure?.id || sessionId,
      after_data: { session_id: sessionId, expected_amount: expected, counted_amount: counted, difference: diff }
    });
  } catch (auditErr) {
    console.warn('Aviso al auditar cierre de caja:', auditErr.message);
  }

  return { success: true, closure_id: closure?.id, expected_amount: expected, counted_amount: counted, difference: diff };
}

async function handleExecuteSale(supabaseAdmin, caller, body) {
  const { tenantId, productId, quantity, unitPrice, paymentMethod, notes } = body;
  if (!isUuid(tenantId) || !isUuid(productId)) {
    const err = new Error('Identificadores de comercio o producto no válidos.');
    err.statusCode = 422;
    throw err;
  }

  const qty = parseFloat(quantity);
  if (isNaN(qty) || qty <= 0) {
    const err = new Error('La cantidad vendida debe ser mayor a 0.');
    err.statusCode = 422;
    throw err;
  }

  await verifyCallerRole(supabaseAdmin, caller.id, tenantId);

  // 1. Obtener producto
  const { data: prod, error: prodErr } = await supabaseAdmin
    .from('catalog_products')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', productId)
    .maybeSingle();

  if (prodErr) throw prodErr;
  if (!prod) {
    const err = new Error('Producto no encontrado.');
    err.statusCode = 404;
    throw err;
  }

  const price = unitPrice !== undefined ? Math.max(0, parseFloat(unitPrice) || 0) : Number(prod.price || 0);
  const subtotal = Math.round(qty * price * 100) / 100;

  // 2. Obtener ubicación default
  const { data: loc } = await supabaseAdmin
    .from('inventory_locations_v2')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .maybeSingle();

  let newStock = 0;
  if (loc?.id) {
    const { data: bal } = await supabaseAdmin
      .from('inventory_balances_v2')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('product_id', productId)
      .eq('location_id', loc.id)
      .maybeSingle();

    const currentStock = bal?.on_hand !== undefined ? Number(bal.on_hand) : Number(prod.metadata?.reprocam_stock || 0);
    if (currentStock < qty) {
      const err = new Error(`Stock insuficiente. Disponible: ${currentStock}`);
      err.statusCode = 400;
      throw err;
    }

    newStock = Math.round((currentStock - qty) * 1000) / 1000;

    await supabaseAdmin
      .from('inventory_balances_v2')
      .upsert({
        tenant_id: tenantId,
        product_id: productId,
        location_id: loc.id,
        on_hand: newStock,
        updated_at: new Date().toISOString()
      });
  } else {
    const currentStock = Number(prod.metadata?.reprocam_stock || 0);
    newStock = Math.max(0, Math.round((currentStock - qty) * 1000) / 1000);
  }

  // Actualizar metadatos en catálogo
  await supabaseAdmin
    .from('catalog_products')
    .update({
      metadata: {
        ...(prod.metadata || {}),
        reprocam_stock: newStock
      },
      updated_at: new Date().toISOString()
    })
    .eq('tenant_id', tenantId)
    .eq('id', productId);

  // 3. Registrar movimiento en sesión activa si se cobró en efectivo
  const isCash = String(paymentMethod || 'CASH').toUpperCase() === 'CASH';
  const { data: rcReg } = await supabaseAdmin
    .from('cash_registers')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('code', 'CAJA-REPROCAM')
    .maybeSingle();

  if (rcReg?.id) {
    const { data: activeSession } = await supabaseAdmin
      .from('cash_sessions_v2')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('register_id', rcReg.id)
      .eq('status', 'OPEN')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeSession?.id && isCash) {
      await supabaseAdmin
        .from('cash_movements_v2')
        .insert({
          tenant_id: tenantId,
          session_id: activeSession.id,
          movement_type: 'SALE',
          direction: 'IN',
          amount: subtotal,
          currency: 'ARS',
          payment_method: 'CASH',
          description: `Venta Reprocam: ${prod.name} (${qty}${prod.metadata?.reprocam_unit || 'g'})`,
          reference_type: 'SALE',
          actor_user_id: caller.id,
          idempotency_key: `rep-sale-${randomUUID()}`,
          metadata: { product_id: productId, quantity: qty }
        });
    }
  }

  // 4. Auditoría
  const docNumber = `TKT-REP-${Date.now()}`;
  try {
    await supabaseAdmin.from('operational_audit_log').insert({
      tenant_id: tenantId,
      actor_user_id: caller.id,
      action: 'REPROCAM_SALE',
      entity_type: 'CATALOG_PRODUCT',
      entity_id: productId,
      after_data: {
        product_name: prod.name,
        quantity: qty,
        unit_price: price,
        total: subtotal,
        payment_method: paymentMethod,
        stock_after: newStock,
        notes
      }
    });
  } catch (auditErr) {
    console.warn('Aviso al auditar venta:', auditErr.message);
  }

  return {
    success: true,
    document_number: docNumber,
    product_id: productId,
    product_name: prod.name,
    quantity: qty,
    total: subtotal,
    stock_remaining: newStock,
    payment_method: paymentMethod
  };
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

    const { action } = body || {};
    if (!action) {
      const err = new Error('Se requiere especificar la acción.');
      err.statusCode = 422;
      throw err;
    }

    const { supabaseUrl, serviceRoleKey } = requireServerConfig();
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const caller = await authenticateBearer(supabaseAdmin, headers);

    let result;
    if (action === 'OPEN_SHIFT') {
      result = await handleOpenShift(supabaseAdmin, caller, body);
    } else if (action === 'CLOSE_SHIFT') {
      result = await handleCloseShift(supabaseAdmin, caller, body);
    } else if (action === 'EXECUTE_SALE') {
      result = await handleExecuteSale(supabaseAdmin, caller, body);
    } else {
      const err = new Error(`Acción "${action}" no reconocida.`);
      err.statusCode = 400;
      throw err;
    }

    return { status: 200, payload: result };
  } catch (error) {
    console.error('Error en reprocam-operations:', error.message);
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
