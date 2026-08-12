/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — MOTOR POS ↔ INVENTARIO ↔ WMS SYNC (FASE 11)
   ========================================================================== */

const INVENTORY_BALANCES_STORE = [];
const INVENTORY_RESERVATIONS_STORE = [];
const INVENTORY_LEDGER_STORE = [];

class PosInventorySyncEngine {
  constructor() {
    this.balances = INVENTORY_BALANCES_STORE;
    this.reservations = INVENTORY_RESERVATIONS_STORE;
    this.ledger = INVENTORY_LEDGER_STORE;
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

  // 2. Venta POS Directa Presencial (Atómica 1-Step)
  salePosDirect({ tenant_id, product_id, quantity, user_name, idempotency_key, preferred_module }, locationsStore = [], balancesStore = this.balances, reservationsStore = this.reservations, ledgerStore = this.ledger, profilesStore = []) {
    const key = idempotency_key || this.generateIdempotencyKey('sale');

    // Control de Idempotencia Fuerte
    const existingEvent = ledgerStore.find(l => l.tenant_id === tenant_id && l.event_type === 'SALE_POS_DIRECT' && l.idempotency_key === key);
    if (existingEvent) {
      return { success: true, idempotent: true, message: 'Venta previamente procesada', ledger_entry: existingEvent };
    }

    const avail = this.getInventoryAvailability(tenant_id, product_id, locationsStore, balancesStore, reservationsStore, profilesStore);

    if (avail.available < quantity) {
      return { success: false, error: `Stock insuficiente: disponible ${avail.available} u., solicitado ${quantity} u.` };
    }

    if (avail.wms_enabled) {
      let remaining = quantity;
      
      // Ordenar por módulo preferido primero, luego por mayor cantidad disponible
      const slots = locationsStore
        .filter(l => l.tenant_id === tenant_id && l.product_id === product_id && (l.disposition || 'SELLABLE') === 'SELLABLE' && l.quantity > 0)
        .sort((a, b) => {
          if (preferred_module && a.module_code === preferred_module) return -1;
          if (preferred_module && b.module_code === preferred_module) return 1;
          return b.quantity - a.quantity;
        });

      for (const slot of slots) {
        if (remaining <= 0) break;
        const take = Math.min(slot.quantity, remaining);
        slot.quantity -= take;
        remaining -= take;
      }
    } else {
      let balance = balancesStore.find(b => b.tenant_id === tenant_id && b.product_id === product_id);
      if (!balance) {
        balance = { tenant_id, product_id, warehouse_id: 'default', on_hand_sellable: 0 };
        balancesStore.push(balance);
      }
      balance.on_hand_sellable -= quantity;
    }

    const ledgerEntry = {
      id: `led-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      tenant_id,
      product_id,
      event_type: 'SALE_POS_DIRECT',
      quantity,
      idempotency_key: key,
      user_name,
      created_at: new Date().toISOString()
    };
    ledgerStore.push(ledgerEntry);

    return { success: true, quantity_sold: quantity, ledger_entry: ledgerEntry };
  }

  // 3. Reserva Comercial por Pedido (Sin tocar módulos WMS)
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

  // 4. Fulfillment / Despacho de Reserva (Allocation WMS diferida al picking - Cero doble descuento)
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

  // 5. Liberación de Reserva (`RELEASED`)
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

  // 6. Devolución con Disposición (`RETURN_SELLABLE` vs `RETURN_DAMAGED`)
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

  // 7. Limpieza Server-Side de Reservas Vencidas
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
}
if (typeof global !== 'undefined') {
  global.PosInventorySync = PosInventorySync;
  global.INVENTORY_BALANCES_STORE = INVENTORY_BALANCES_STORE;
  global.INVENTORY_RESERVATIONS_STORE = INVENTORY_RESERVATIONS_STORE;
  global.INVENTORY_LEDGER_STORE = INVENTORY_LEDGER_STORE;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PosInventorySync, INVENTORY_BALANCES_STORE, INVENTORY_RESERVATIONS_STORE, INVENTORY_LEDGER_STORE };
}
