/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — MOTOR POS ↔ INVENTARIO ↔ WMS ↔ CAJA DB SYNC (FASE 11B)
   ========================================================================== */

const INVENTORY_BALANCES_STORE = [];
const INVENTORY_RESERVATIONS_STORE = [];
const INVENTORY_LEDGER_STORE = [];
const SALES_STORE = [];
const SALE_ITEMS_STORE = [];
const CASH_SESSIONS_STORE = [];
const CASH_MOVEMENTS_STORE = [];

class PosInventorySyncEngine {
  constructor() {
    this.balances = INVENTORY_BALANCES_STORE;
    this.reservations = INVENTORY_RESERVATIONS_STORE;
    this.ledger = INVENTORY_LEDGER_STORE;
    this.sales = SALES_STORE;
    this.saleItems = SALE_ITEMS_STORE;
    this.cashSessions = CASH_SESSIONS_STORE;
    this.cashMovements = CASH_MOVEMENTS_STORE;
  }

  // Generador de clave de idempotencia única
  generateIdempotencyKey(prefix = 'pos') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  // 1. Consulta de Disponibilidad Unificada (get_inventory_availability)
  getInventoryAvailability(tenantId, productId, locationsStore = [], balancesStore = this.balances, reservationsStore = this.reservations, profilesStore = []) {
    const profile = profilesStore.find(p => p.tenant_id === tenantId);
    const wmsEnabled = profile ? !!profile.wms_enabled : false;

    let onHand = 0;
    let damaged = 0;

    if (wmsEnabled) {
      onHand = locationsStore
        .filter(l => l.tenant_id === tenantId && l.product_id === productId && (l.disposition || 'SELLABLE') === 'SELLABLE')
        .reduce((sum, l) => sum + Number(l.quantity || 0), 0);

      damaged = locationsStore
        .filter(l => l.tenant_id === tenantId && l.product_id === productId && l.disposition === 'DAMAGED')
        .reduce((sum, l) => sum + Number(l.quantity || 0), 0);
    } else {
      const balance = balancesStore.find(b => b.tenant_id === tenantId && b.product_id === productId);
      onHand = balance ? Number(balance.on_hand_sellable || 0) : 0;
    }

    const nowIso = new Date().toISOString();
    const reserved = reservationsStore
      .filter(r => r.tenant_id === tenantId && r.product_id === productId && r.status === 'ACTIVE' && r.expires_at > nowIso)
      .reduce((sum, r) => sum + Number(r.quantity || 0), 0);

    const available = onHand - reserved;

    return {
      on_hand: onHand,
      reserved: reserved,
      available: available,
      damaged: damaged,
      wms_enabled: wmsEnabled
    };
  }

  // 2. Venta POS Directa Presencial Preservada (salePosDirect - Retrocompatibilidad)
  salePosDirect({ tenant_id, product_id, quantity, user_name = 'Vendedor', idempotency_key, preferred_module }, locationsStore = [], balancesStore = this.balances, reservationsStore = this.reservations, ledgerStore = this.ledger, profilesStore = []) {
    const draft = {
      tenant_id,
      cashier_user_id: `usr-${user_name.toLowerCase()}`,
      cashier_name_snapshot: user_name,
      salesperson_user_id: `usr-${user_name.toLowerCase()}`,
      salesperson_name_snapshot: user_name,
      payment_method: 'EFECTIVO',
      idempotency_key: idempotency_key || this.generateIdempotencyKey('sale'),
      preferred_module,
      items: [{ id: product_id, product_id, name: product_id, price: 0, quantity, availability: 'EN_STOCK' }],
      total: 0
    };
    const res = this.processPersistentSale(draft, locationsStore, balancesStore, reservationsStore, ledgerStore, profilesStore);
    if (!res.success) return res;
    return {
      success: true,
      idempotent: res.idempotent || false,
      quantity_sold: quantity,
      ledger_entry: ledgerStore.find(l => l.tenant_id === tenant_id && l.product_id === product_id)
    };
  }

  // 2b. Venta POS Directa Presencial Multi-Item Atómica (FASE 11B: rpc_sale_pos_direct_saas)
  processPersistentSale(saleDraft, locationsStore = [], balancesStore = this.balances, reservationsStore = this.reservations, ledgerStore = this.ledger, profilesStore = [], salesStore = this.sales, saleItemsStore = this.saleItems, cashSessionsStore = this.cashSessions, cashMovementsStore = this.cashMovements, productsStore = []) {
    const tenantId = saleDraft.tenant_id;
    const key = saleDraft.idempotency_key || this.generateIdempotencyKey('sale');

    // 1. Validar Idempotencia Fuerte
    const existingSale = salesStore.find(s => s.tenant_id === tenantId && s.idempotency_key === key);
    if (existingSale) {
      const existingItems = saleItemsStore.filter(i => i.sale_id === existingSale.id);
      return { success: true, idempotent: true, sale: existingSale, items: existingItems, message: 'Venta previamente procesada de forma idempotente' };
    }

    // 2. Validar Disponibilidad de cada producto (Preventivo)
    const items = saleDraft.items || [];
    if (items.length === 0) {
      return { success: false, error: 'El borrador de venta no contiene ítems' };
    }

    for (const item of items) {
      const productId = item.product_id || item.id;
      const qty = Number(item.quantity || 1);

      // Si es producto solo B2B, no exige stock propio
      if (item.availability === 'A_PEDIDO') continue;

      const avail = this.getInventoryAvailability(tenantId, productId, locationsStore, balancesStore, reservationsStore, profilesStore);
      if (avail.available < qty) {
        return { success: false, error: `Stock insuficiente para '${item.name || productId}': disponible ${avail.available} u., solicitado ${qty} u.` };
      }
    }

    // 3. Crear Registro de Venta Comercial (`sales`)
    const saleId = `sale-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const saleRecord = {
      id: saleId,
      tenant_id: tenantId,
      status: 'CONFIRMED',
      cashier_user_id: saleDraft.cashier_user_id,
      cashier_name_snapshot: saleDraft.cashier_name_snapshot,
      salesperson_user_id: saleDraft.salesperson_user_id,
      salesperson_name_snapshot: saleDraft.salesperson_name_snapshot,
      customer_id: saleDraft.customer_id || null,
      subtotal: Number(saleDraft.subtotal || saleDraft.total || 0),
      discount: Number(saleDraft.discount || 0),
      total: Number(saleDraft.total || 0),
      payment_method: saleDraft.payment_method || 'EFECTIVO',
      idempotency_key: key,
      created_at: new Date().toISOString()
    };
    salesStore.push(saleRecord);

    // 4. Crear Detalle de Ítems (`sale_items`), Descontar Inventario y Grabar Ledger
    const createdItems = [];
    const wmsAllocations = [];

    for (const item of items) {
      const productId = item.product_id || item.id;
      const qty = Number(item.quantity || 1);

      // Prevenir Adulteración de Precios de Cliente (DevTools Price Tampering Protection)
      let authoritativePrice = Number(item.unit_price || item.price || 0);
      const catList = Array.isArray(productsStore) ? productsStore : [];
      if (catList.length > 0) {
        const catProduct = catList.find(p => p.id === productId || p.product_code === productId);
        if (catProduct && catProduct.price !== undefined && Math.abs(Number(catProduct.price) - authoritativePrice) > 0.01) {
          authoritativePrice = Number(catProduct.price);
        }
      }

      const saleItemRecord = {
        id: `sitem-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        sale_id: saleId,
        tenant_id: tenantId,
        product_id: productId,
        product_name_snapshot: item.name || productId,
        quantity: qty,
        unit_price: authoritativePrice,
        subtotal: qty * authoritativePrice,
        fulfillment_type: item.availability === 'A_PEDIDO' ? 'B2B_BACKORDER' : 'DIRECT'
      };
      saleItemsStore.push(saleItemRecord);
      createdItems.push(saleItemRecord);

      // Si es producto propio en stock, descontar de inventario y registrar ledger
      if (item.availability !== 'A_PEDIDO') {
        const avail = this.getInventoryAvailability(tenantId, productId, locationsStore, balancesStore, reservationsStore, profilesStore);

        if (avail.wms_enabled) {
          let remaining = qty;
          const preferredModule = saleDraft.preferred_module;
          const slots = locationsStore
            .filter(l => l.tenant_id === tenantId && l.product_id === productId && (l.disposition || 'SELLABLE') === 'SELLABLE' && l.quantity > 0)
            .sort((a, b) => {
              if (preferredModule && a.module_code === preferredModule) return -1;
              if (preferredModule && b.module_code === preferredModule) return 1;
              return b.quantity - a.quantity;
            });

          for (const slot of slots) {
            if (remaining <= 0) break;
            const take = Math.min(slot.quantity, remaining);
            slot.quantity -= take;
            remaining -= take;

            wmsAllocations.push({
              module_code: slot.module_code,
              human_level: slot.human_level,
              sector_position: slot.sector_position,
              quantity_deducted: take
            });
          }
        } else {
          let balance = balancesStore.find(b => b.tenant_id === tenantId && b.product_id === productId);
          if (!balance) {
            balance = { tenant_id: tenantId, product_id: productId, warehouse_id: 'default', on_hand_sellable: 0 };
            balancesStore.push(balance);
          }
          balance.on_hand_sellable -= qty;
        }

        const ledgerEntry = {
          id: `led-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          tenant_id: tenantId,
          product_id: productId,
          event_type: 'SALE_POS_DIRECT',
          quantity: qty,
          reference_type: 'SALE',
          reference_id: saleId,
          idempotency_key: `${key}-${productId}`,
          user_name: saleDraft.cashier_name_snapshot,
          created_at: new Date().toISOString()
        };
        ledgerStore.push(ledgerEntry);
      }
    }

    // 5. Registrar Movimiento de Caja Persistente (`cash_movements`)
    let openSession = cashSessionsStore.find(s => s.tenant_id === tenantId && s.status === 'OPEN');
    if (!openSession) {
      openSession = {
        id: `session-${Date.now()}`,
        tenant_id: tenantId,
        register_id: 'MAIN_REGISTER',
        opened_by: saleDraft.cashier_name_snapshot,
        opening_amount: 0,
        opened_at: new Date().toISOString(),
        status: 'OPEN'
      };
      cashSessionsStore.push(openSession);
    }

    const cashType = saleDraft.payment_method === 'EFECTIVO' ? 'venta_efectivo' : 'venta_transferencia';
    const cashMovement = {
      id: `cmov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      session_id: openSession.id,
      tenant_id: tenantId,
      type: cashType,
      amount: saleRecord.total,
      payment_method: saleDraft.payment_method,
      reference_type: 'SALE',
      reference_id: saleId,
      created_by: saleDraft.cashier_name_snapshot,
      created_at: new Date().toISOString()
    };
    cashMovementsStore.push(cashMovement);

    return {
      success: true,
      sale: saleRecord,
      items: createdItems,
      cash_movement: cashMovement,
      wms_allocations: wmsAllocations,
      ticket: {
        sale_id: saleId,
        date: saleRecord.created_at,
        cashier: saleRecord.cashier_name_snapshot,
        salesperson: saleRecord.salesperson_name_snapshot,
        total: saleRecord.total,
        payment_method: saleRecord.payment_method,
        items_count: createdItems.length
      }
    };
  }

  // 3. Abrir Sesión de Caja Persistente en DB (`cash_sessions`)
  openCashSession({ tenant_id, register_id = 'MAIN_REGISTER', opened_by, opening_amount = 0 }, cashSessionsStore = this.cashSessions) {
    const existingOpen = cashSessionsStore.find(s => s.tenant_id === tenant_id && s.register_id === register_id && s.status === 'OPEN');
    if (existingOpen) {
      return { success: true, session: existingOpen, reconnected: true };
    }

    const session = {
      id: `session-${Date.now()}`,
      tenant_id,
      register_id,
      opened_by,
      opening_amount: Number(opening_amount),
      opened_at: new Date().toISOString(),
      closed_by: null,
      closing_counted: null,
      closed_at: null,
      status: 'OPEN'
    };
    cashSessionsStore.push(session);
    return { success: true, session };
  }

  // 4. Cerrar Sesión de Caja y Calcular Arqueo en DB
  closeCashSession({ session_id, tenant_id, closed_by, closing_counted }, cashSessionsStore = this.cashSessions, cashMovementsStore = this.cashMovements) {
    const session = cashSessionsStore.find(s => s.id === session_id && s.tenant_id === tenant_id);
    if (!session) return { success: false, error: 'Sesión de caja no encontrada' };

    if (session.status === 'CLOSED') {
      return { success: true, session, idempotent: true };
    }

    const summary = this.getCashSessionSummary(session_id, tenant_id, cashSessionsStore, cashMovementsStore);

    session.closed_by = closed_by;
    session.closing_counted = Number(closing_counted);
    session.closed_at = new Date().toISOString();
    session.status = 'CLOSED';

    const difference = session.closing_counted - summary.expected_cash;

    return {
      success: true,
      session,
      summary,
      difference,
      balanced: Math.abs(difference) < 0.01
    };
  }

  // 5. Resumen de Caja Autorritativo desde DB
  getCashSessionSummary(sessionId, tenantId, cashSessionsStore = this.cashSessions, cashMovementsStore = this.cashMovements) {
    const session = cashSessionsStore.find(s => s.id === sessionId && s.tenant_id === tenantId);
    const openingAmount = session ? Number(session.opening_amount || 0) : 0;

    const movements = cashMovementsStore.filter(m => m.tenant_id === tenantId && (sessionId ? m.session_id === sessionId : true));

    const salesCash = movements.filter(m => m.type === 'venta_efectivo').reduce((sum, m) => sum + Number(m.amount), 0);
    const salesTransfer = movements.filter(m => m.type === 'venta_transferencia').reduce((sum, m) => sum + Number(m.amount), 0);
    const manualIncome = movements.filter(m => m.type === 'ingreso_manual').reduce((sum, m) => sum + Number(m.amount), 0);
    const expenses = movements.filter(m => m.type === 'gasto').reduce((sum, m) => sum + Number(m.amount), 0);
    const refunds = movements.filter(m => m.type === 'devolucion').reduce((sum, m) => sum + Number(m.amount), 0);

    const expectedCash = openingAmount + salesCash + manualIncome - expenses - refunds;
    const totalVolume = salesCash + salesTransfer + manualIncome;

    return {
      session_id: sessionId,
      opening_amount: openingAmount,
      sales_cash: salesCash,
      sales_transfer: salesTransfer,
      manual_income: manualIncome,
      expenses: expenses,
      refunds: refunds,
      expected_cash: expectedCash,
      total_volume: totalVolume,
      movements_count: movements.length
    };
  }

  // 6. Reserva Comercial por Pedido
  reserveOrder({ tenant_id, product_id, order_id, quantity, expires_in_minutes = 15, idempotency_key }, locationsStore = [], balancesStore = this.balances, reservationsStore = this.reservations, ledgerStore = this.ledger, profilesStore = []) {
    const key = idempotency_key || this.generateIdempotencyKey('res');

    const existingRes = reservationsStore.find(r => r.tenant_id === tenant_id && r.idempotency_key === key);
    if (existingRes) {
      return { success: true, idempotent: true, reservation: existingRes };
    }

    const avail = this.getInventoryAvailability(tenant_id, product_id, locationsStore, balancesStore, reservationsStore, profilesStore);
    if (avail.available < quantity) {
      return { success: false, error: `Stock insuficiente para reserva: disponible ${avail.available} u., solicitado ${quantity} u.` };
    }

    const expiresAt = new Date(Date.now() + expires_in_minutes * 60 * 1000).toISOString();
    const reservation = {
      id: `res-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      tenant_id,
      product_id,
      order_id,
      quantity,
      status: 'ACTIVE',
      expires_at: expiresAt,
      idempotency_key: key,
      created_at: new Date().toISOString()
    };
    reservationsStore.push(reservation);

    const ledgerEntry = {
      id: `led-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      tenant_id,
      product_id,
      event_type: 'RESERVE',
      quantity,
      idempotency_key: key,
      created_at: new Date().toISOString()
    };
    ledgerStore.push(ledgerEntry);

    return { success: true, reservation };
  }

  // 7. Fulfillment / Despacho de Reserva
  fulfillReservation({ tenant_id, reservation_id, user_name, idempotency_key }, locationsStore = [], balancesStore = this.balances, reservationsStore = this.reservations, ledgerStore = this.ledger, profilesStore = []) {
    const key = idempotency_key || this.generateIdempotencyKey('ful');

    const reservation = reservationsStore.find(r => r.id === reservation_id && r.tenant_id === tenant_id);
    if (!reservation) return { success: false, error: 'Reserva no encontrada' };

    if (reservation.status === 'FULFILLED') {
      return { success: true, idempotent: true, reservation };
    }

    const profile = profilesStore.find(p => p.tenant_id === tenant_id);
    const wmsEnabled = profile ? !!profile.wms_enabled : false;

    if (wmsEnabled) {
      let remaining = reservation.quantity;
      const slots = locationsStore
        .filter(l => l.tenant_id === tenant_id && l.product_id === reservation.product_id && (l.disposition || 'SELLABLE') === 'SELLABLE' && l.quantity > 0)
        .sort((a, b) => b.quantity - a.quantity);

      for (const slot of slots) {
        if (remaining <= 0) break;
        const take = Math.min(slot.quantity, remaining);
        slot.quantity -= take;
        remaining -= take;
      }
    } else {
      const balance = balancesStore.find(b => b.tenant_id === tenant_id && b.product_id === reservation.product_id);
      if (balance) {
        balance.on_hand_sellable -= reservation.quantity;
      }
    }

    reservation.status = 'FULFILLED';
    reservation.fulfilled_at = new Date().toISOString();

    const ledgerEntry = {
      id: `led-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      tenant_id,
      product_id: reservation.product_id,
      event_type: 'FULFILL',
      quantity: reservation.quantity,
      idempotency_key: key,
      user_name,
      created_at: new Date().toISOString()
    };
    ledgerStore.push(ledgerEntry);

    return { success: true, reservation };
  }

  // 8. Liberación de Reserva (`RELEASED`)
  releaseReservation({ tenant_id, reservation_id, reason, idempotency_key }, reservationsStore = this.reservations, ledgerStore = this.ledger) {
    const key = idempotency_key || this.generateIdempotencyKey('rel');

    const reservation = reservationsStore.find(r => r.id === reservation_id && r.tenant_id === tenant_id);
    if (!reservation) return { success: false, error: 'Reserva no encontrada' };

    if (['RELEASED', 'EXPIRED', 'CANCELLED'].includes(reservation.status)) {
      return { success: true, idempotent: true, reservation };
    }

    reservation.status = 'RELEASED';
    reservation.released_at = new Date().toISOString();

    const ledgerEntry = {
      id: `led-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      tenant_id,
      product_id: reservation.product_id,
      event_type: 'RELEASE',
      quantity: reservation.quantity,
      idempotency_key: key,
      created_at: new Date().toISOString()
    };
    ledgerStore.push(ledgerEntry);

    return { success: true, reservation };
  }

  // 9. Devolución con Disposición (`RETURN_SELLABLE` vs `RETURN_DAMAGED`)
  returnInventory({ tenant_id, product_id, quantity, return_type, idempotency_key, module_code = 'M01', human_level = 1, sector_position = 'A' }, locationsStore = [], balancesStore = this.balances, ledgerStore = this.ledger, profilesStore = []) {
    const key = idempotency_key || this.generateIdempotencyKey('ret');
    const profile = profilesStore.find(p => p.tenant_id === tenant_id);
    const wmsEnabled = profile ? !!profile.wms_enabled : false;

    const eventType = return_type === 'DAMAGED' ? 'RETURN_DAMAGED' : 'RETURN_SELLABLE';
    const disposition = return_type === 'DAMAGED' ? 'DAMAGED' : 'SELLABLE';

    if (wmsEnabled) {
      let slot = locationsStore.find(l => 
        l.tenant_id === tenant_id && 
        l.product_id === product_id && 
        l.module_code === module_code && 
        l.human_level === human_level && 
        l.sector_position === sector_position && 
        (l.disposition || 'SELLABLE') === disposition
      );

      if (slot) {
        slot.quantity += quantity;
      } else {
        slot = {
          id: `loc-${Date.now()}-${Math.floor(Math.random()*1000)}`,
          tenant_id,
          product_id,
          module_code,
          human_level,
          sector_position,
          disposition,
          quantity
        };
        locationsStore.push(slot);
      }
    } else {
      let balance = balancesStore.find(b => b.tenant_id === tenant_id && b.product_id === product_id);
      if (!balance) {
        balance = { tenant_id, product_id, warehouse_id: 'default', on_hand_sellable: 0 };
        balancesStore.push(balance);
      }
      if (disposition === 'SELLABLE') {
        balance.on_hand_sellable += quantity;
      }
    }

    const ledgerEntry = {
      id: `led-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      tenant_id,
      product_id,
      event_type: eventType,
      quantity,
      idempotency_key: key,
      created_at: new Date().toISOString()
    };
    ledgerStore.push(ledgerEntry);

    return { success: true, return_type, quantity };
  }

  // 10. Limpieza Server-Side de Reservas Vencidas
  cleanupExpiredReservations(tenantId, reservationsStore = this.reservations) {
    const nowIso = new Date().toISOString();
    let count = 0;

    for (const r of reservationsStore) {
      if (r.tenant_id === tenantId && r.status === 'ACTIVE' && r.expires_at < nowIso) {
        r.status = 'EXPIRED';
        r.released_at = nowIso;
        count++;
      }
    }

    return count;
  }
}

const PosInventorySync = new PosInventorySyncEngine();

if (typeof window !== 'undefined') {
  window.PosInventorySync = PosInventorySync;
  window.INVENTORY_BALANCES_STORE = INVENTORY_BALANCES_STORE;
  window.INVENTORY_RESERVATIONS_STORE = INVENTORY_RESERVATIONS_STORE;
  window.INVENTORY_LEDGER_STORE = INVENTORY_LEDGER_STORE;
  window.SALES_STORE = SALES_STORE;
  window.SALE_ITEMS_STORE = SALE_ITEMS_STORE;
  window.CASH_SESSIONS_STORE = CASH_SESSIONS_STORE;
  window.CASH_MOVEMENTS_STORE = CASH_MOVEMENTS_STORE;
}
if (typeof global !== 'undefined') {
  global.PosInventorySync = PosInventorySync;
  global.INVENTORY_BALANCES_STORE = INVENTORY_BALANCES_STORE;
  global.INVENTORY_RESERVATIONS_STORE = INVENTORY_RESERVATIONS_STORE;
  global.INVENTORY_LEDGER_STORE = INVENTORY_LEDGER_STORE;
  global.SALES_STORE = SALES_STORE;
  global.SALE_ITEMS_STORE = SALE_ITEMS_STORE;
  global.CASH_SESSIONS_STORE = CASH_SESSIONS_STORE;
  global.CASH_MOVEMENTS_STORE = CASH_MOVEMENTS_STORE;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    PosInventorySync, 
    INVENTORY_BALANCES_STORE, 
    INVENTORY_RESERVATIONS_STORE, 
    INVENTORY_LEDGER_STORE,
    SALES_STORE,
    SALE_ITEMS_STORE,
    CASH_SESSIONS_STORE,
    CASH_MOVEMENTS_STORE
  };
}
