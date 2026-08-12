# PHASE 11 FINAL IMPLEMENTATION PLAN — POS ↔ INVENTARIO ↔ WMS

**Proyecto:** `boeweb` (Ecosistema SaaS Multi-Empresa)  
**Estado:** ESTADO: FASE 11 — ARQUITECTURA CERTIFICADA CON LAS 4 CORRECCIONES DE PRECISIÓN LISTA PARA IMPLEMENTAR.

---

## 🎯 Resumen de Arquitectura Final Aprobada

1. **Fuentes Únicas de Verdad (Sin Duplicados):**
   - **`on_hand` (WMS OFF):** `inventory_balances.on_hand_sellable`.
   - **`on_hand` (WMS ON):** `SUM(inventory_locations.quantity WHERE disposition = 'SELLABLE')`.
   - **`reserved`:** `SUM(inventory_reservations.quantity WHERE status = 'ACTIVE' AND expires_at > NOW())`. **`inventory_balances` no almacena otra copia.**
   - **`available` (Derivado):** `on_hand - reserved` (Consulta unificada `get_inventory_availability()`).

2. **Restricción Única Canónica en WMS:**
   - `UNIQUE(tenant_id, module_code, product_id, human_level, sector_position, disposition)` permitiendo stock vendible y dañado en la misma estantería sin colisiones.

3. **Flujo de Reconciliación de Pagos en TIMEOUT:**
   - `TIMEOUT` no hace `RELEASE` ciego. Invoca `rpc_reconcile_payment_saas()` para consultar el gateway externo. Si cobró $\rightarrow$ `FULFILL`; si falló/expiró $\rightarrow$ `RELEASE`.

4. **Momento de Allocation Física WMS:**
   - **POS Directo:** Allocation física **inmediata** en caja.
   - **Reserva de Pedido:** Reserva **comercial pura**. Allocation física diferida al momento de **picking/despacho (`FULFILL`)**.

---

## 📋 Pasos de Ejecución de la Fase 11

### Paso 1: Scripts DDL en PostgreSQL (`scripts/setup_pos_inventory_wms_integration_schema.sql`)
- Definición de `inventory_balances`, `inventory_reservations`, `inventory_ledger` y columna `disposition` en `inventory_locations`.
- Función de lectura unificada `get_inventory_availability()`.
- RPCs atómicas: `rpc_sale_pos_direct_saas`, `rpc_reserve_inventory_saas`, `rpc_fulfill_reservation_saas`, `rpc_release_reservation_saas`, `rpc_reconcile_payment_saas`, `rpc_return_inventory_saas`, `rpc_cleanup_expired_reservations_saas`.

### Paso 2: Engine de Sincronización POS (`pos-inventory-sync.js`)
- Motor cliente para abstraer la disponibilidad de stock, invocación idempotente con `idempotency_key` y selector de módulo WMS preferido.

### Paso 3: Interfaz POS (`vendedor.html` / `vendedor.js`)
- Pantalla de cobro mostrando insignias de stock `Disponible`, `Reservado`, `Ubicación Físico WMS` y manejo de tickets.

### Paso 4: Suite de Pruebas Automatizadas (`tests/pos-inventory-sync.test.mjs`)
- Pruebas automatizadas cubriendo:
  1. `available` derivado en caliente (`on_hand - reserved`).
  2. Venta POS Directa presencial (1-Step ACID).
  3. Pedido con Reserva $\rightarrow$ Fulfillment (0 doble descuento).
  4. Allocation WMS diferido a Fulfillment.
  5. Reconciliación de TIMEOUT en pasarela de pagos.
  6. Devolución vendible vs dañada (`RETURN_SELLABLE` vs `RETURN_DAMAGED`).
  7. Idempotencia (`idempotency_key`) y Concurrencia (`SELECT FOR UPDATE`).
  8. Aislamiento RLS multi-tenant en todas las operaciones.

---

ESTADO: FASE 11 — ARQUITECTURA CERTIFICADA CON LAS 4 CORRECCIONES DE PRECISIÓN LISTA PARA IMPLEMENTAR.
