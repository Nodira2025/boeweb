/* Capa única de comandos operativos. No muta stock, caja ni deuda en el cliente. */

(function initOperationalApi(globalScope) {
  const PAYMENT_METHODS = Object.freeze({
    EFECTIVO: 'CASH',
    CASH: 'CASH',
    TRANSFERENCIA: 'BANK_TRANSFER',
    TRANSFER: 'BANK_TRANSFER',
    DIGITAL: 'BANK_TRANSFER',
    BANK_TRANSFER: 'BANK_TRANSFER',
    TARJETA: 'CARD',
    DEBITO: 'CARD',
    CREDITO: 'CARD',
    CARD: 'CARD',
    MERCADOPAGO: 'MERCADO_PAGO',
    MERCADO_PAGO: 'MERCADO_PAGO',
    'MERCADO PAGO': 'MERCADO_PAGO',
    QR: 'MERCADO_PAGO',
    CUENTA_CORRIENTE: 'ACCOUNT_CREDIT',
    ACCOUNT_CREDIT: 'ACCOUNT_CREDIT',
    OTHER: 'OTHER'
  });
  const NETWORK_ERROR_PATTERN = /fetch|network|failed to fetch|load failed|timeout|offline/i;
  const SALE_LINE_TYPES = new Set([
    'OWN_STOCK', 'OWN_BACKORDER', 'B2B_BACKORDER', 'LOCAL_STORE_BACKORDER', 'QUICK_ENTRY'
  ]);
  let retryInProgress = false;

  class OperationalApiError extends Error {
    constructor(message, code = 'OPERATION_REJECTED', details = null) {
      super(message);
      this.name = 'OperationalApiError';
      this.code = code;
      this.details = details;
    }
  }

  function normalizeUuid(value) {
    const normalized = String(value || '').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
      ? normalized
      : null;
  }

  function normalizeMoney(value) {
    const amount = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    if (!Number.isFinite(amount) || amount < 0) {
      throw new OperationalApiError('El importe de pago no es válido.', 'INVALID_PAYMENT_AMOUNT');
    }
    return amount;
  }

  function normalizeCashBreakdown(value, countedAmount) {
    if (value === null || value === undefined) return {};
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new OperationalApiError('El desglose de efectivo no es válido.', 'INVALID_CASH_BREAKDOWN');
    }
    const entries = Object.entries(value);
    if (entries.length === 0) return {};
    if (entries.length > 50) {
      throw new OperationalApiError('El desglose contiene demasiadas denominaciones.', 'INVALID_CASH_BREAKDOWN');
    }
    const normalized = {};
    let total = 0;
    for (const [key, rawQuantity] of entries) {
      const quantity = Number(rawQuantity);
      if (key === 'coins') {
        if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1_000_000_000) {
          throw new OperationalApiError('El importe de monedas no es válido.', 'INVALID_CASH_BREAKDOWN');
        }
        const coins = Math.round((quantity + Number.EPSILON) * 100) / 100;
        if (Math.abs(coins - quantity) > Number.EPSILON) {
          throw new OperationalApiError('El importe de monedas admite hasta dos decimales.', 'INVALID_CASH_BREAKDOWN');
        }
        if (coins > 0) normalized.coins = coins;
        total += coins;
        continue;
      }
      if (!/^[1-9][0-9]{0,8}$/.test(key) || !Number.isInteger(quantity) || quantity < 0 || quantity > 100_000) {
        throw new OperationalApiError('El desglose contiene una denominación o cantidad no válida.', 'INVALID_CASH_BREAKDOWN');
      }
      if (quantity > 0) normalized[key] = quantity;
      total += Number(key) * quantity;
    }
    if (Math.abs(normalizeMoney(total) - countedAmount) > 0.001) {
      throw new OperationalApiError('El desglose de efectivo no coincide con el total contado.', 'CASH_BREAKDOWN_MISMATCH');
    }
    return normalized;
  }

  function normalizePaymentMethod(method) {
    const key = String(method || '').trim().toUpperCase();
    const normalized = PAYMENT_METHODS[key];
    if (!normalized) {
      throw new OperationalApiError(`Forma de pago no admitida: ${method || 'vacía'}.`, 'INVALID_PAYMENT_METHOD');
    }
    return normalized;
  }

  function buildPayments(draft) {
    const method = String(draft?.payment_method || 'EFECTIVO').toUpperCase();
    if (method !== 'MIXTO') {
      const normalizedMethod = normalizePaymentMethod(method);
      const amount = normalizeMoney(draft.total);
      const metadata = {};
      if (normalizedMethod === 'CASH' && draft?.cash_tendered !== null && draft?.cash_tendered !== undefined && draft?.cash_tendered !== '') {
        const tendered = normalizeMoney(draft.cash_tendered);
        if (tendered < amount) {
          throw new OperationalApiError('El efectivo recibido no alcanza para cubrir la venta.', 'INSUFFICIENT_CASH_TENDERED');
        }
        metadata.cash_tendered = tendered;
      }
      return [{ method: normalizedMethod, amount, metadata }];
    }

    const breakdown = draft.payment_breakdown || {};
    const cashAmount = normalizeMoney(breakdown.cash_amount);
    const secondaryAmount = normalizeMoney(breakdown.secondary_amount);
    const total = normalizeMoney(draft.total);
    if (Math.abs((cashAmount + secondaryAmount) - total) > 0.01) {
      throw new OperationalApiError('El desglose del pago mixto no coincide con el total.', 'PAYMENT_SPLIT_MISMATCH');
    }

    const payments = [];
    if (cashAmount > 0) {
      const metadata = {};
      if (draft?.cash_tendered !== null && draft?.cash_tendered !== undefined && draft?.cash_tendered !== '') {
        const tendered = normalizeMoney(draft.cash_tendered);
        if (tendered < cashAmount) {
          throw new OperationalApiError('El efectivo recibido no alcanza para cubrir la parte en efectivo.', 'INSUFFICIENT_CASH_TENDERED');
        }
        metadata.cash_tendered = tendered;
      }
      payments.push({ method: 'CASH', amount: cashAmount, metadata });
    }
    if (secondaryAmount > 0) {
      payments.push({
        method: normalizePaymentMethod(breakdown.secondary_method),
        amount: secondaryAmount,
        metadata: {}
      });
    }
    if (payments.length < 2) {
      throw new OperationalApiError('Un pago mixto debe contener al menos dos asignaciones.', 'INVALID_PAYMENT_SPLIT');
    }
    return payments;
  }

  function buildItems(draft) {
    const rawItems = Array.isArray(draft?.items) ? draft.items : [];
    if (rawItems.length === 0) {
      throw new OperationalApiError('La venta no contiene productos.', 'EMPTY_SALE');
    }
    return rawItems.map(item => {
      const lineType = String(item.line_type || (item.is_express ? 'QUICK_ENTRY' : 'OWN_STOCK')).toUpperCase();
      const rawProductId = String(item.product_id || item.product_code || item.id || '').trim();
      const productId = normalizeUuid(rawProductId);
      const sku = String(item.sku || item.product_code || '').trim().slice(0, 120);
      const name = String(item.name || '').trim().slice(0, 255);
      const quantity = Number(item.quantity);
      const rawLocationId = String(item.location_id || '').trim();
      const locationId = rawLocationId ? normalizeUuid(rawLocationId) : null;
      const unitPrice = normalizeMoney(item.unit_price ?? item.price ?? 0);
      const rawSourceId = String(item.source_id || item.source_offer_id || '').trim();
      const sourceId = rawSourceId ? normalizeUuid(rawSourceId) : null;
      const expectedDeliveryDate = String(item.expected_delivery_date || '').trim();
      const metadata = item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
        ? item.metadata
        : {};

      if (!SALE_LINE_TYPES.has(lineType)) {
        throw new OperationalApiError('Hay un producto con tipo de venta no admitido.', 'INVALID_LINE_TYPE');
      }
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999 || Math.round(quantity * 1000) !== quantity * 1000) {
        throw new OperationalApiError('Hay un producto con cantidad inválida.', 'INVALID_SALE_ITEM');
      }
      if (lineType === 'OWN_STOCK' || lineType === 'OWN_BACKORDER') {
        if (!productId && !sku) {
          throw new OperationalApiError('El producto propio en stock requiere identificación válida.', 'INVALID_SALE_ITEM');
        }
        if (rawLocationId && !locationId) {
          throw new OperationalApiError('La ubicación de inventario del producto no es válida.', 'INVALID_LOCATION_ID');
        }
      }
      if (lineType === 'B2B_BACKORDER' || lineType === 'LOCAL_STORE_BACKORDER') {
        if (!sourceId || !sku || !name) {
          throw new OperationalApiError('La oferta externa requiere una identificación central válida.', 'INVALID_EXTERNAL_OFFER');
        }
      }
      if (expectedDeliveryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expectedDeliveryDate)) {
        throw new OperationalApiError('La fecha estimada de entrega no es válida.', 'INVALID_DELIVERY_DATE');
      }
      if (lineType === 'OWN_BACKORDER' && !expectedDeliveryDate) {
        throw new OperationalApiError('El encargo propio requiere una fecha estimada de entrega.', 'DELIVERY_DATE_REQUIRED');
      }
      let serializedMetadata;
      try {
        serializedMetadata = JSON.stringify(metadata);
      } catch (error) {
        throw new OperationalApiError('Los metadatos del producto no son serializables.', 'INVALID_ITEM_METADATA', error);
      }
      if (serializedMetadata.length > 4000) {
        throw new OperationalApiError('Los metadatos del producto son demasiado extensos.', 'INVALID_ITEM_METADATA');
      }
      if (lineType === 'QUICK_ENTRY' && (name.length < 3 || unitPrice <= 0)) {
        throw new OperationalApiError('El ítem de venta rápida requiere nombre y precio mayor a cero.', 'INVALID_SALE_ITEM');
      }
      const currency = String(item.currency || 'ARS').trim().toUpperCase();
      if (lineType === 'QUICK_ENTRY' && !/^[A-Z]{3}$/.test(currency)) {
        throw new OperationalApiError('La moneda del ítem rápido no es válida.', 'INVALID_CURRENCY');
      }

      return {
        line_type: lineType,
        product_id: lineType === 'OWN_STOCK' || lineType === 'OWN_BACKORDER' ? productId : null,
        sku: sku || (lineType === 'QUICK_ENTRY' ? `QUICK-${Date.now()}` : null),
        name,
        quantity,
        ...(locationId ? { location_id: locationId } : {}),
        ...(lineType === 'QUICK_ENTRY' ? {
          client_unit_price: unitPrice,
          currency
        } : {}),
        source_id: sourceId,
        expected_delivery_date: expectedDeliveryDate || null,
        metadata: JSON.parse(serializedMetadata)
      };
    });
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
      return Object.keys(value).sort().reduce((result, key) => {
        result[key] = stableValue(value[key]);
        return result;
      }, {});
    }
    return value;
  }

  async function sha256(value) {
    const serialized = JSON.stringify(stableValue(value));
    const cryptoApi = globalScope.crypto || globalThis.crypto;
    if (!cryptoApi?.subtle) {
      let hash = 2166136261;
      for (let index = 0; index < serialized.length; index += 1) {
        hash ^= serialized.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
    }
    const bytes = new TextEncoder().encode(serialized);
    const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function normalizeAdjustment(draft) {
    const allowedTypes = new Set([
      'NONE', 'DISCOUNT_PERCENT', 'DISCOUNT_FIXED', 'INCREASE_PERCENT', 'INCREASE_FIXED'
    ]);
    const type = String(draft?.adjustment_type || 'NONE').toUpperCase();
    return {
      type: allowedTypes.has(type) ? type : 'NONE',
      value: normalizeMoney(draft?.adjustment_value || 0)
    };
  }

  async function buildCheckoutCommand(draft, options = {}) {
    const rawTenantId = draft?.tenant_id || options.tenantId;
    const rawCashierId = draft?.cashier_user_id || options.cashierUserId;
    const rawSalespersonId = draft?.salesperson_user_id || options.salespersonUserId;
    const rawCustomerId = String(draft?.customer_id || '').trim();
    const rawRegisterId = String(options.registerId || draft?.register_id || '').trim();
    const rawParkedTicketId = String(draft?.parked_ticket_id || options.parkedTicketId || '').trim();

    const tenantId = normalizeUuid(rawTenantId);
    const cashierUserId = normalizeUuid(rawCashierId);
    const salespersonUserId = normalizeUuid(rawSalespersonId);

    if (!tenantId || !cashierUserId || !salespersonUserId) {
      throw new OperationalApiError('La venta requiere tenant, cajero y vendedor autenticados.', 'UNVERIFIED_IDENTITY');
    }

    const command = {
      tenant_id: tenantId,
      idempotency_key: String(draft.idempotency_key || draft.draft_id || '').trim(),
      items: buildItems(draft),
      payments: buildPayments(draft),
      adjustment: normalizeAdjustment(draft),
      cashier_user_id: cashierUserId,
      salesperson_user_id: salespersonUserId,
      customer_id: normalizeUuid(rawCustomerId),
      register_id: normalizeUuid(rawRegisterId),
      notes: String(draft.notes || '').trim().slice(0, 1000) || null,
      due_date: draft.customer_account_due || null,
      parked_ticket_id: normalizeUuid(rawParkedTicketId) || null
    };
    if (rawCustomerId && !command.customer_id) {
      throw new OperationalApiError('El cliente seleccionado no tiene una identificación válida.', 'INVALID_CUSTOMER_ID');
    }
    if (rawRegisterId && !command.register_id) {
      throw new OperationalApiError('La caja seleccionada no tiene una identificación válida.', 'INVALID_REGISTER_ID');
    }
    if (!command.register_id) {
      throw new OperationalApiError('Toda venta POS requiere una caja con turno abierto.', 'REGISTER_REQUIRED');
    }
    if (rawParkedTicketId && !command.parked_ticket_id) {
      throw new OperationalApiError('El ticket en espera no tiene una identificación válida.', 'INVALID_TICKET_ID');
    }
    if (command.payments.some(payment => payment.method === 'ACCOUNT_CREDIT') && !command.customer_id) {
      throw new OperationalApiError(
        'La cuenta corriente requiere un cliente centralizado.',
        'CUSTOMER_REQUIRED_FOR_CREDIT'
      );
    }
    if (command.idempotency_key.length < 8 || command.idempotency_key.length > 160) {
      throw new OperationalApiError('La clave de idempotencia de la venta no es válida.', 'INVALID_IDEMPOTENCY_KEY');
    }
    command.payload_hash = await sha256(command);
    return command;
  }

  function outboxKey(tenantId, userId) {
    return `boeweb:operational-outbox:v2:${tenantId}:${userId}`;
  }

  function readOutbox(tenantId, userId) {
    if (!globalScope.localStorage) return [];
    try {
      const parsed = JSON.parse(globalScope.localStorage.getItem(outboxKey(tenantId, userId)) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('No se pudo leer la cola operativa:', error);
      return [];
    }
  }

  function writeOutbox(tenantId, userId, records) {
    if (!globalScope.localStorage) return;
    globalScope.localStorage.setItem(outboxKey(tenantId, userId), JSON.stringify(records.slice(0, 100)));
  }

  function queuePendingCommand(command, reason) {
    const records = readOutbox(command.tenant_id, command.cashier_user_id);
    const existingIndex = records.findIndex(record => record.idempotency_key === command.idempotency_key);
    if (existingIndex >= 0 && records[existingIndex].payload_hash !== command.payload_hash) {
      throw new OperationalApiError(
        'La clave de idempotencia ya pertenece a otra operación pendiente.',
        'IDEMPOTENCY_PAYLOAD_CONFLICT'
      );
    }
    const record = {
      ...command,
      state: 'PENDING',
      attempts: existingIndex >= 0 ? Number(records[existingIndex].attempts || 0) : 0,
      queued_at: existingIndex >= 0 ? records[existingIndex].queued_at : new Date().toISOString(),
      last_error: String(reason || 'Sin conexión').slice(0, 500)
    };
    if (existingIndex >= 0) records[existingIndex] = record;
    else records.unshift(record);
    writeOutbox(command.tenant_id, command.cashier_user_id, records);
    return record;
  }

  async function invokeCheckout(supabaseClient, command) {
    const { data, error } = await supabaseClient.rpc('checkout_sale_v3', {
      p_tenant_id: command.tenant_id,
      p_idempotency_key: command.idempotency_key,
      p_payload_hash: command.payload_hash,
      p_items: command.items,
      p_payments: command.payments,
      p_adjustment: command.adjustment,
      p_cashier_user_id: command.cashier_user_id,
      p_salesperson_user_id: command.salesperson_user_id,
      p_customer_id: command.customer_id,
      p_register_id: command.register_id,
      p_notes: command.notes,
      p_due_date: command.due_date,
      p_parked_ticket_id: command.parked_ticket_id
    });
    if (error) {
      throw new OperationalApiError(error.message || 'El servidor rechazó la venta.', error.code || 'RPC_ERROR', error);
    }
    return data;
  }

  async function checkoutSale({ supabaseClient, authContext, draft, registerId = null, allowQueue = true }) {
    if (!supabaseClient || !authContext?.isVerified) {
      throw new OperationalApiError('Iniciá sesión con Supabase antes de confirmar una operación.', 'AUTH_REQUIRED');
    }
    const command = await buildCheckoutCommand(draft, {
      tenantId: authContext.tenantId,
      cashierUserId: authContext.userId,
      registerId
    });
    if (command.tenant_id !== authContext.tenantId || command.cashier_user_id !== authContext.userId) {
      throw new OperationalApiError('La identidad de la venta no coincide con la sesión activa.', 'IDENTITY_MISMATCH');
    }

    try {
      const receipt = await invokeCheckout(supabaseClient, command);
      return { state: 'CONFIRMED', receipt, command };
    } catch (error) {
      const canQueue = allowQueue && (globalScope.navigator?.onLine === false || NETWORK_ERROR_PATTERN.test(error.message));
      if (!canQueue) throw error;
      queuePendingCommand(command, error.message);
      return { state: 'PENDING', receipt: null, command };
    }
  }

  function requireOperationalContext(supabaseClient, authContext) {
    const tenantId = normalizeUuid(authContext?.tenantId);
    const userId = normalizeUuid(authContext?.userId);
    if (!supabaseClient?.rpc || !authContext?.isVerified || !tenantId || !userId) {
      throw new OperationalApiError('Se requiere una sesión operativa verificada.', 'AUTH_REQUIRED');
    }
    return { tenantId, userId };
  }

  function requireIdempotencyKey(value, code) {
    const key = String(value || '').trim();
    if (key.length < 8 || key.length > 160) {
      throw new OperationalApiError('La clave de idempotencia de la operación no es válida.', code);
    }
    return key;
  }

  async function invokeOperationalRpc(supabaseClient, name, parameters) {
    const { data, error } = await supabaseClient.rpc(name, parameters);
    if (error) {
      throw new OperationalApiError(error.message || `El servidor rechazó ${name}.`, error.code || 'RPC_ERROR', error);
    }
    return data;
  }

  async function openCashSession({ supabaseClient, authContext, registerId, openingAmount = 0 }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const safeRegisterId = normalizeUuid(registerId);
    if (!safeRegisterId) throw new OperationalApiError('Seleccioná una caja válida.', 'INVALID_REGISTER_ID');
    return invokeOperationalRpc(supabaseClient, 'open_cash_session_v2', {
      p_tenant_id: tenantId,
      p_register_id: safeRegisterId,
      p_opening_amount: normalizeMoney(openingAmount)
    });
  }

  async function recordCashMovement({ supabaseClient, authContext, sessionId, type, amount, category, description, reference = {} }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const safeSessionId = normalizeUuid(sessionId);
    const safeType = String(type || '').trim().toUpperCase();
    const safeAmount = normalizeMoney(amount);
    if (!safeSessionId) throw new OperationalApiError('La sesión de caja no es válida.', 'INVALID_CASH_SESSION');
    if (!['INCOME', 'EXPENSE', 'WITHDRAWAL', 'ADJUSTMENT'].includes(safeType) || safeAmount <= 0) {
      throw new OperationalApiError('El tipo o importe del movimiento no es válido.', 'INVALID_CASH_MOVEMENT');
    }
    return invokeOperationalRpc(supabaseClient, 'record_cash_movement_v2', {
      p_tenant_id: tenantId,
      p_session_id: safeSessionId,
      p_type: safeType,
      p_amount: safeAmount,
      p_category: String(category || '').trim().slice(0, 120) || null,
      p_description: String(description || '').trim().slice(0, 1000),
      p_reference: reference && typeof reference === 'object' ? reference : {}
    });
  }

  async function submitCashClosure({ supabaseClient, authContext, sessionId, countedAmount, cashBreakdown = {}, notes = '' }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const safeSessionId = normalizeUuid(sessionId);
    if (!safeSessionId) throw new OperationalApiError('La sesión de caja no es válida.', 'INVALID_CASH_SESSION');
    const safeCountedAmount = normalizeMoney(countedAmount);
    return invokeOperationalRpc(supabaseClient, 'submit_cash_closure_v3', {
      p_tenant_id: tenantId,
      p_session_id: safeSessionId,
      p_counted: safeCountedAmount,
      p_cash_breakdown: normalizeCashBreakdown(cashBreakdown, safeCountedAmount),
      p_notes: String(notes || '').trim().slice(0, 1000) || null
    });
  }

  async function reviewCashClosure({ supabaseClient, authContext, closureId, decision, reason = '' }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const safeClosureId = normalizeUuid(closureId);
    const safeDecision = String(decision || '').trim().toUpperCase();
    if (!safeClosureId) throw new OperationalApiError('El cierre de caja no es válido.', 'INVALID_CASH_CLOSURE');
    if (!['APPROVE', 'APPROVED', 'REJECT', 'REJECTED'].includes(safeDecision)) {
      throw new OperationalApiError('La decisión de supervisión no es válida.', 'INVALID_CLOSURE_DECISION');
    }
    return invokeOperationalRpc(supabaseClient, 'review_cash_closure_v2', {
      p_tenant_id: tenantId,
      p_closure_id: safeClosureId,
      p_decision: safeDecision,
      p_reason: String(reason || '').trim().slice(0, 1000) || null
    });
  }

  async function upsertCatalogProduct({ supabaseClient, authContext, product }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const productId = product?.id ? normalizeUuid(product.id) : null;
    if (product?.id && !productId) throw new OperationalApiError('El ID de producto no es válido.', 'INVALID_PRODUCT_ID');
    return invokeOperationalRpc(supabaseClient, 'upsert_catalog_product_v2', {
      p_tenant_id: tenantId,
      p_sku: String(product?.sku || product?.product_code || '').trim().slice(0, 120),
      p_name: String(product?.name || '').trim().slice(0, 255),
      p_price: normalizeMoney(product?.price),
      p_currency: String(product?.currency || 'ARS').trim().toUpperCase(),
      p_track_stock: product?.track_stock !== false,
      p_metadata: product?.metadata && typeof product.metadata === 'object' ? product.metadata : {},
      p_product_id: productId
    });
  }

  async function submitCatalogProductDraft({ supabaseClient, authContext, draft, idempotencyKey }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
      throw new OperationalApiError('El borrador de producto no es válido.', 'INVALID_PRODUCT_DRAFT');
    }
    return invokeOperationalRpc(supabaseClient, 'submit_catalog_product_draft_v2', {
      p_tenant_id: tenantId,
      p_idempotency_key: requireIdempotencyKey(idempotencyKey, 'INVALID_PRODUCT_DRAFT'),
      p_draft: draft
    });
  }

  async function locateCatalogProductDraft({ supabaseClient, authContext, draftId, location, idempotencyKey }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const safeDraftId = normalizeUuid(draftId);
    if (!safeDraftId || !location || typeof location !== 'object' || Array.isArray(location)) {
      throw new OperationalApiError('El borrador o la ubicación no son válidos.', 'INVALID_DRAFT_LOCATION');
    }
    return invokeOperationalRpc(supabaseClient, 'locate_catalog_product_draft_v2', {
      p_tenant_id: tenantId,
      p_draft_id: safeDraftId,
      p_location: location,
      p_idempotency_key: requireIdempotencyKey(idempotencyKey, 'INVALID_DRAFT_LOCATION')
    });
  }

  async function approveCatalogProductDraft({ supabaseClient, authContext, draftId, overrides = {}, idempotencyKey }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const safeDraftId = normalizeUuid(draftId);
    if (!safeDraftId || !overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
      throw new OperationalApiError('La aprobación del producto no es válida.', 'INVALID_DRAFT_APPROVAL');
    }
    return invokeOperationalRpc(supabaseClient, 'approve_catalog_product_draft_v2', {
      p_tenant_id: tenantId,
      p_draft_id: safeDraftId,
      p_overrides: overrides,
      p_idempotency_key: requireIdempotencyKey(idempotencyKey, 'INVALID_DRAFT_APPROVAL')
    });
  }

  async function rejectCatalogProductDraft({ supabaseClient, authContext, draftId, reason }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const safeDraftId = normalizeUuid(draftId);
    if (!safeDraftId) throw new OperationalApiError('El borrador no es válido.', 'INVALID_PRODUCT_DRAFT');
    return invokeOperationalRpc(supabaseClient, 'reject_catalog_product_draft_v2', {
      p_tenant_id: tenantId,
      p_draft_id: safeDraftId,
      p_reason: String(reason || '').trim().slice(0, 1000)
    });
  }

  async function upsertInventoryLocation({ supabaseClient, authContext, location }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const locationId = location?.id ? normalizeUuid(location.id) : null;
    if (location?.id && !locationId) {
      throw new OperationalApiError('El ID de ubicación no es válido.', 'INVALID_LOCATION_ID');
    }
    return invokeOperationalRpc(supabaseClient, 'upsert_inventory_location_v2', {
      p_tenant_id: tenantId,
      p_code: String(location?.code || location?.wms_code || '').trim().toUpperCase().slice(0, 120),
      p_name: String(location?.name || location?.location_label || '').trim().slice(0, 255),
      p_location_type: String(location?.location_type || 'SHELF').trim().toUpperCase(),
      p_is_sellable: location?.is_sellable !== false,
      p_is_default: location?.is_default === true,
      p_metadata: location?.metadata && typeof location.metadata === 'object' ? location.metadata : {},
      p_location_id: locationId
    });
  }

  async function archiveCatalogProduct({ supabaseClient, authContext, productId, reason }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const safeProductId = normalizeUuid(productId);
    if (!safeProductId) throw new OperationalApiError('El producto no es válido.', 'INVALID_PRODUCT_ID');
    return invokeOperationalRpc(supabaseClient, 'archive_catalog_product_v2', {
      p_tenant_id: tenantId,
      p_product_id: safeProductId,
      p_reason: String(reason || '').trim().slice(0, 1000)
    });
  }

  async function receiveInventory({ supabaseClient, authContext, productId, locationId, quantity, unitCost = 0, idempotencyKey }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const safeProductId = normalizeUuid(productId);
    const safeLocationId = normalizeUuid(locationId);
    const safeQuantity = Number(quantity);
    if (!safeProductId || !safeLocationId || !Number.isFinite(safeQuantity) || safeQuantity <= 0) {
      throw new OperationalApiError('Producto, ubicación o cantidad de recepción inválidos.', 'INVALID_INVENTORY_RECEIPT');
    }
    return invokeOperationalRpc(supabaseClient, 'receive_inventory_v2', {
      p_tenant_id: tenantId,
      p_product_id: safeProductId,
      p_location_id: safeLocationId,
      p_quantity: safeQuantity,
      p_unit_cost: normalizeMoney(unitCost),
      p_idempotency_key: requireIdempotencyKey(idempotencyKey, 'INVALID_INVENTORY_RECEIPT')
    });
  }

  async function adjustInventory({ supabaseClient, authContext, productId, locationId, quantityDelta, reason, notes = '', idempotencyKey }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const safeProductId = normalizeUuid(productId);
    const safeLocationId = normalizeUuid(locationId);
    const delta = Number(quantityDelta);
    if (!safeProductId || !safeLocationId || !Number.isFinite(delta) || delta === 0) {
      throw new OperationalApiError('Producto, ubicación o cantidad de ajuste inválidos.', 'INVALID_INVENTORY_ADJUSTMENT');
    }
    return invokeOperationalRpc(supabaseClient, 'adjust_inventory_v2', {
      p_tenant_id: tenantId,
      p_product_id: safeProductId,
      p_location_id: safeLocationId,
      p_quantity_delta: delta,
      p_reason: String(reason || '').trim().toUpperCase().slice(0, 120),
      p_notes: String(notes || '').trim().slice(0, 1000) || null,
      p_idempotency_key: requireIdempotencyKey(idempotencyKey, 'INVALID_INVENTORY_ADJUSTMENT')
    });
  }

  async function transferInventory({
    supabaseClient,
    authContext,
    productId,
    originLocationId,
    destinationLocationId,
    quantity,
    notes = '',
    idempotencyKey
  }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const safeProductId = normalizeUuid(productId);
    const safeOriginLocationId = normalizeUuid(originLocationId);
    const safeDestinationLocationId = normalizeUuid(destinationLocationId);
    const safeQuantity = Number(quantity);
    if (
      !safeProductId
      || !safeOriginLocationId
      || !safeDestinationLocationId
      || safeOriginLocationId === safeDestinationLocationId
      || !Number.isFinite(safeQuantity)
      || safeQuantity <= 0
    ) {
      throw new OperationalApiError('Producto, ubicaciones o cantidad de transferencia inválidos.', 'INVALID_INVENTORY_TRANSFER');
    }
    const safeIdempotencyKey = requireIdempotencyKey(idempotencyKey, 'INVALID_INVENTORY_TRANSFER');
    return invokeOperationalRpc(supabaseClient, 'transfer_inventory_v2', {
      p_tenant_id: tenantId,
      p_product_id: safeProductId,
      p_origin_location_id: safeOriginLocationId,
      p_destination_location_id: safeDestinationLocationId,
      p_quantity: safeQuantity,
      p_notes: String(notes || '').trim().slice(0, 1000) || null,
      p_idempotency_key: safeIdempotencyKey
    });
  }

  async function submitInventoryCount({
    supabaseClient,
    authContext,
    productId,
    locationId,
    countedQuantity,
    notes = '',
    idempotencyKey
  }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const safeProductId = normalizeUuid(productId);
    const safeLocationId = normalizeUuid(locationId);
    const safeCountedQuantity = Number(countedQuantity);
    if (!safeProductId || !safeLocationId || !Number.isFinite(safeCountedQuantity) || safeCountedQuantity < 0) {
      throw new OperationalApiError('Producto, ubicación o conteo de inventario inválidos.', 'INVALID_INVENTORY_COUNT');
    }
    const safeIdempotencyKey = requireIdempotencyKey(idempotencyKey, 'INVALID_INVENTORY_COUNT');
    return invokeOperationalRpc(supabaseClient, 'submit_inventory_count_v2', {
      p_tenant_id: tenantId,
      p_product_id: safeProductId,
      p_location_id: safeLocationId,
      p_counted_quantity: safeCountedQuantity,
      p_notes: String(notes || '').trim().slice(0, 1000) || null,
      p_idempotency_key: safeIdempotencyKey
    });
  }

  async function reviewInventoryCount({
    supabaseClient,
    authContext,
    countId,
    decision,
    reason = '',
    idempotencyKey
  }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const safeCountId = normalizeUuid(countId);
    const safeDecision = String(decision || '').trim().toUpperCase();
    if (!safeCountId || !['APPROVE', 'APPROVED', 'REJECT', 'REJECTED'].includes(safeDecision)) {
      throw new OperationalApiError('Conteo o decisión de supervisión inválidos.', 'INVALID_INVENTORY_COUNT_REVIEW');
    }
    const safeIdempotencyKey = requireIdempotencyKey(idempotencyKey, 'INVALID_INVENTORY_COUNT_REVIEW');
    return invokeOperationalRpc(supabaseClient, 'review_inventory_count_v2', {
      p_tenant_id: tenantId,
      p_count_id: safeCountId,
      p_decision: safeDecision,
      p_reason: String(reason || '').trim().slice(0, 1000) || null,
      p_idempotency_key: safeIdempotencyKey
    });
  }

  async function upsertCustomer({ supabaseClient, authContext, customer }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const customerId = customer?.id ? normalizeUuid(customer.id) : null;
    if (customer?.id && !customerId) throw new OperationalApiError('El ID de cliente no es válido.', 'INVALID_CUSTOMER_ID');
    return invokeOperationalRpc(supabaseClient, 'upsert_customer_v2', {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
      p_display_name: String(customer?.display_name || customer?.name || '').trim().slice(0, 255),
      p_email: String(customer?.email || '').trim().slice(0, 254) || null,
      p_phone: String(customer?.phone || '').trim().slice(0, 40) || null,
      p_tax_id: String(customer?.tax_id || customer?.dni || '').trim().slice(0, 40) || null,
      p_credit_limit: normalizeMoney(customer?.credit_limit || 0),
      p_currency: String(customer?.currency || 'ARS').trim().toUpperCase(),
      p_metadata: customer?.metadata && typeof customer.metadata === 'object' ? customer.metadata : {}
    });
  }

  async function recordCustomerAccountPayment({ supabaseClient, authContext, customerId, amount, method, idempotencyKey, registerId = null, notes = '' }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const safeCustomerId = normalizeUuid(customerId);
    const safeRegisterId = registerId ? normalizeUuid(registerId) : null;
    if (!safeCustomerId || (registerId && !safeRegisterId)) {
      throw new OperationalApiError('Cliente o caja inválidos para la cobranza.', 'INVALID_ACCOUNT_PAYMENT');
    }
    return invokeOperationalRpc(supabaseClient, 'record_customer_account_payment_v2', {
      p_tenant_id: tenantId,
      p_customer_id: safeCustomerId,
      p_amount: normalizeMoney(amount),
      p_method: normalizePaymentMethod(method),
      p_idempotency_key: requireIdempotencyKey(idempotencyKey, 'INVALID_ACCOUNT_PAYMENT'),
      p_register_id: safeRegisterId,
      p_notes: String(notes || '').trim().slice(0, 1000) || null
    });
  }

  async function transitionPublicOrder({ supabaseClient, authContext, orderId, status, notes = '', idempotencyKey }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const safeOrderId = normalizeUuid(orderId);
    const safeStatus = String(status || '').trim().toUpperCase();
    if (!safeOrderId || !['PREPARING', 'READY', 'DELIVERED', 'CANCELLED'].includes(safeStatus)) {
      throw new OperationalApiError('Pedido o transición no válidos.', 'INVALID_ORDER_TRANSITION');
    }
    return invokeOperationalRpc(supabaseClient, 'transition_public_order_v2', {
      p_tenant_id: tenantId,
      p_order_id: safeOrderId,
      p_new_status: safeStatus,
      p_notes: String(notes || '').trim().slice(0, 1000) || null,
      p_idempotency_key: requireIdempotencyKey(idempotencyKey, 'INVALID_ORDER_TRANSITION')
    });
  }

  async function voidSale({ supabaseClient, authContext, saleId, reason, idempotencyKey, registerId = null }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const safeSaleId = normalizeUuid(saleId);
    const safeRegisterId = registerId ? normalizeUuid(registerId) : null;
    if (!safeSaleId || (registerId && !safeRegisterId)) {
      throw new OperationalApiError('Venta o caja no válidas para la anulación.', 'INVALID_SALE_VOID');
    }
    return invokeOperationalRpc(supabaseClient, 'void_sale_v2', {
      p_tenant_id: tenantId,
      p_sale_id: safeSaleId,
      p_reason: String(reason || '').trim().slice(0, 1000),
      p_idempotency_key: requireIdempotencyKey(idempotencyKey, 'INVALID_SALE_VOID'),
      p_register_id: safeRegisterId
    });
  }

  async function retryPending({ supabaseClient, authContext }) {
    if (retryInProgress || !supabaseClient || !authContext?.isVerified) return [];
    retryInProgress = true;
    const results = [];
    try {
      const records = readOutbox(authContext.tenantId, authContext.userId);
      for (const record of records) {
        if (record.state !== 'PENDING' && record.state !== 'FAILED') continue;
        try {
          const receipt = await invokeCheckout(supabaseClient, record);
          record.state = 'SYNCED';
          record.synced_at = new Date().toISOString();
          record.last_error = null;
          results.push({ idempotency_key: record.idempotency_key, state: 'SYNCED', receipt });
        } catch (error) {
          record.attempts = Number(record.attempts || 0) + 1;
          record.state = record.attempts >= 5 ? 'FAILED' : 'PENDING';
          record.last_error = String(error.message || error).slice(0, 500);
          results.push({ idempotency_key: record.idempotency_key, state: record.state, error: record.last_error });
          if (NETWORK_ERROR_PATTERN.test(record.last_error)) break;
        }
      }
      writeOutbox(authContext.tenantId, authContext.userId, records);
      return results;
    } finally {
      retryInProgress = false;
    }
  }

  async function parkPosTicket({ supabaseClient, authContext, draft, idempotencyKey = null, customerName = null }) {
    const { tenantId, userId } = requireOperationalContext(supabaseClient, authContext);
    const key = requireIdempotencyKey(
      idempotencyKey || draft?.idempotency_key || `parked-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      'INVALID_IDEMPOTENCY_KEY'
    );
    return invokeOperationalRpc(supabaseClient, 'park_pos_ticket_v2', {
      p_tenant_id: tenantId,
      p_cashier_user_id: userId,
      p_salesperson_user_id: normalizeUuid(draft?.salesperson_user_id) || userId,
      p_payload: draft,
      p_idempotency_key: key,
      p_customer_id: normalizeUuid(draft?.customer_id),
      p_customer_name: customerName || draft?.customer_name || null
    });
  }

  async function cancelParkedPosTicket({ supabaseClient, authContext, ticketId }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const safeTicketId = normalizeUuid(ticketId);
    if (!safeTicketId) throw new OperationalApiError('Identificador de ticket inválido.', 'INVALID_TICKET_ID');
    return invokeOperationalRpc(supabaseClient, 'cancel_pos_ticket_v2', {
      p_tenant_id: tenantId,
      p_ticket_id: safeTicketId
    });
  }

  async function fetchParkedPosTickets({ supabaseClient, authContext }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    return invokeOperationalRpc(supabaseClient, 'list_parked_pos_tickets_v2', {
      p_tenant_id: tenantId
    });
  }

  async function fetchCashSessionSheet({ supabaseClient, authContext, sessionId }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const safeSessionId = normalizeUuid(sessionId);
    if (!safeSessionId) throw new OperationalApiError('La sesión de caja no es válida.', 'INVALID_CASH_SESSION');
    return invokeOperationalRpc(supabaseClient, 'get_cash_session_sheet_v2', {
      p_tenant_id: tenantId,
      p_session_id: safeSessionId
    });
  }

  async function fetchSaleFulfillments({ supabaseClient, authContext, statusFilter = null, query = null, limit = 50, offset = 0 }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    return invokeOperationalRpc(supabaseClient, 'list_sale_fulfillments_v2', {
      p_tenant_id: tenantId,
      p_status_filter: statusFilter || null,
      p_query: query || null,
      p_limit: limit || 50,
      p_offset: offset || 0
    });
  }

  async function updateSaleFulfillment({ supabaseClient, authContext, fulfillmentId, status, notes = null, fulfilledBy = null }) {
    const { tenantId, userId } = requireOperationalContext(supabaseClient, authContext);
    const safeFulfillmentId = normalizeUuid(fulfillmentId);
    if (!safeFulfillmentId) throw new OperationalApiError('Identificador de encargo/entrega inválido.', 'INVALID_FULFILLMENT_ID');
    const validStatuses = new Set(['PENDING', 'ORDERED', 'IN_TRANSIT', 'READY_FOR_PICKUP', 'FULFILLED', 'CANCELLED']);
    const upperStatus = String(status || '').trim().toUpperCase();
    if (!validStatuses.has(upperStatus)) {
      throw new OperationalApiError(`Estado de entrega no válido: ${status}`, 'INVALID_FULFILLMENT_STATUS');
    }

    return invokeOperationalRpc(supabaseClient, 'update_sale_fulfillment_v2', {
      p_tenant_id: tenantId,
      p_fulfillment_id: safeFulfillmentId,
      p_new_status: upperStatus,
      p_notes: String(notes || '').trim().slice(0, 1000) || null,
      p_fulfilled_by: upperStatus === 'FULFILLED' ? (normalizeUuid(fulfilledBy) || userId) : null
    });
  }

  async function upsertExternalCatalogSource({ supabaseClient, authContext, source }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const sourceId = source?.id ? normalizeUuid(source.id) : null;
    const sourceType = String(source?.source_type || '').trim().toUpperCase();
    const name = String(source?.name || '').trim();
    const estimatedDays = Number(source?.estimated_days ?? 2);
    if (!['B2B_SUPPLIER', 'LOCAL_STORE'].includes(sourceType) || !name || name.length > 255) {
      throw new OperationalApiError('Tipo o nombre de proveedor externo inválido.', 'INVALID_EXTERNAL_SOURCE');
    }
    if (!Number.isInteger(estimatedDays) || estimatedDays < 0 || estimatedDays > 365) {
      throw new OperationalApiError('Los días estimados del proveedor no son válidos.', 'INVALID_ESTIMATED_DAYS');
    }
    return invokeOperationalRpc(supabaseClient, 'upsert_external_catalog_source_v2', {
      p_tenant_id: tenantId,
      p_source_type: sourceType,
      p_name: name,
      p_contact_info: String(source?.contact_info || '').trim() || null,
      p_estimated_days: estimatedDays,
      p_active: source?.active !== false,
      p_metadata: source?.metadata && typeof source.metadata === 'object' ? source.metadata : {},
      p_source_id: sourceId
    });
  }

  async function upsertExternalCatalogOffer({ supabaseClient, authContext, offer }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    const sourceId = normalizeUuid(offer?.source_id);
    if (!sourceId) throw new OperationalApiError('Identificador de proveedor/fuente inválido.', 'INVALID_SOURCE_ID');
    const offerId = offer?.id ? normalizeUuid(offer.id) : null;
    const sku = String(offer?.external_sku || offer?.sku || '').trim();
    const name = String(offer?.name || '').trim();
    const availableUnits = Number(offer?.available_units ?? 0);
    const retailPrice = normalizeMoney(offer?.retail_price ?? 0);
    if (!sku || sku.length > 120 || !name || name.length > 255 || retailPrice <= 0) {
      throw new OperationalApiError('SKU, nombre o precio de la oferta no son válidos.', 'INVALID_EXTERNAL_OFFER');
    }
    if (!Number.isFinite(availableUnits) || availableUnits < 0) {
      throw new OperationalApiError('La disponibilidad externa no es válida.', 'INVALID_EXTERNAL_AVAILABILITY');
    }

    return invokeOperationalRpc(supabaseClient, 'upsert_external_catalog_offer_v2', {
      p_tenant_id: tenantId,
      p_source_id: sourceId,
      p_external_sku: sku,
      p_name: name,
      p_category: String(offer?.category || 'General').trim(),
      p_cost_price: normalizeMoney(offer?.cost_price || 0),
      p_retail_price: retailPrice,
      p_available_units: availableUnits,
      p_active: offer?.active !== false,
      p_metadata: offer?.metadata && typeof offer.metadata === 'object' ? offer.metadata : {},
      p_offer_id: offerId
    });
  }

  async function fetchExternalCatalogOffers({ supabaseClient, authContext, sourceId = null, query = null, activeOnly = true }) {
    const { tenantId } = requireOperationalContext(supabaseClient, authContext);
    return invokeOperationalRpc(supabaseClient, 'list_external_catalog_offers_v2', {
      p_tenant_id: tenantId,
      p_source_id: sourceId ? normalizeUuid(sourceId) : null,
      p_query: query || null,
      p_active_only: activeOnly !== false
    });
  }

  const api = Object.freeze({
    OperationalApiError,
    adjustInventory,
    approveCatalogProductDraft,
    archiveCatalogProduct,
    buildCheckoutCommand,
    buildPayments,
    cancelParkedPosTicket,
    checkoutSale,
    fetchCashSessionSheet,
    fetchExternalCatalogOffers,
    fetchParkedPosTickets,
    fetchSaleFulfillments,
    locateCatalogProductDraft,
    normalizePaymentMethod,
    openCashSession,
    parkPosTicket,
    readOutbox,
    recordCashMovement,
    recordCustomerAccountPayment,
    rejectCatalogProductDraft,
    receiveInventory,
    reviewCashClosure,
    submitCatalogProductDraft,
    submitCashClosure,
    transitionPublicOrder,
    retryPending,
    reviewInventoryCount,
    submitInventoryCount,
    transferInventory,
    updateSaleFulfillment,
    upsertCatalogProduct,
    upsertCustomer,
    upsertExternalCatalogOffer,
    upsertExternalCatalogSource,
    upsertInventoryLocation,
    voidSale
  });

  globalScope.OperationalApi = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
