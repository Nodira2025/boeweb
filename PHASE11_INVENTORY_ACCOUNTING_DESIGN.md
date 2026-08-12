# PHASE 11 — FINAL INVENTORY ACCOUNTING & EVENT LEDGER ARCHITECTURE
## Modelo Canónico Definitorio de Contabilidad de Inventario (Saldos, Reservas, Allocation WMS y Reconciliación de Pagos)

**Proyecto:** `boeweb` (Ecosistema SaaS Multi-Empresa)  
**Estado:** ESTADO: FASE 11 — ARQUITECTURA CERTIFICADA CON LAS 4 CORRECCIONES DE PRECISIÓN LISTA PARA IMPLEMENTAR.

---

## 1. Regla Canónica Absoluta de Fuentes de Verdad

Para garantizar que **no exista ninguna duplicación ni divergencia contable**, cada concepto posee exactamente **una fuente de verdad**:

```text
                     CONSULTA DE STOCK (get_inventory_availability)
                                          │
        ┌─────────────────────────────────┼─────────────────────────────────┐
        ▼                                 ▼                                 ▼
   ON HAND (WMS OFF)               ON HAND (WMS ON)                     RESERVED
inventory_balances.           SUM(inventory_locations.          SUM(inventory_reservations.
  on_hand_sellable             quantity WHERE disposition='SELLABLE') quantity WHERE status='ACTIVE')
        │                                 │                                 │
        └─────────────────────────────────┼─────────────────────────────────┘
                                          │
                             available = on_hand - reserved
```

---

## 2. Restricción Única en WMS (`inventory_locations`) Incluyendo `disposition`

Para permitir la coexistencia de stock vendible y stock dañado/cuarentena en una misma ubicación física sin colisiones:

```sql
ALTER TABLE public.inventory_locations 
ADD COLUMN IF NOT EXISTS disposition VARCHAR(50) DEFAULT 'SELLABLE' CHECK (disposition IN ('SELLABLE', 'DAMAGED', 'QUARANTINE'));

-- Restricción Única Canónica contemplando la disposición del stock:
ALTER TABLE public.inventory_locations
ADD CONSTRAINT unique_location_product_disposition 
UNIQUE (tenant_id, module_code, product_id, human_level, sector_position, disposition);
```

---

## 3. Desacoplamiento de Pagos Externos & Reconciliación en `TIMEOUT`

Un `TIMEOUT` de red durante un pago **NUNCA ejecuta un `RELEASE` ciego** de stock:

```
                            PROCESO DE VENTA / CHECKOUT
                                         │
                                RPC rpc_reserve_inventory
                                • Status = ACTIVE (expires_at)
                                • reserved = +N, available = -N
                                         │
                             PROCESADOR EXTERNO DE PAGO
                                         │
         ┌───────────────────────────────┼───────────────────────────────┐
         ▼                               ▼                               ▼
  [PAGO APROBADO]                [PAGO RECHAZADO]             [TIMEOUT / DESCONOCIDO]
         │                               │                               │
RPC rpc_fulfill_reservation    RPC rpc_release_reservation      RPC rpc_reconcile_payment
• on_hand -= N                 • reserved -= N                  • Consulta Gateway MP
• reserved -= N                • available += N                 • Si cobró: FULFILL
• Cero doble descuento         • Stock disponible vuelve        • Si no cobró: RELEASE
```

---

## 4. Momento Exacto de la Asignación Física WMS (Allocation)

- **Venta POS Presencial Directa:** Asignación física **inmediata** en caja. Se determina el módulo físico y se descuenta `inventory_locations.quantity` al momento del cobro.
- **Pedido con Reserva (`RESERVE`):** Reserva **comercial pura** por `product_id`. No bloquea ni secuestra módulos físicos específicos.
- **Despacho del Pedido (`FULFILL`):** La asignación física WMS y el decremento de módulos ocurren en el momento de **picking/despacho**.

---

## 5. Matriz Definitoria de Eventos de Inventario

| Evento | `on_hand` (Sellable) | `on_hand` (Damaged) | `reserved` (ACTIVE) | `available` (Derivado) | WMS Location (`quantity`) | Estado Reserva | Acción de Pago / Reconciliación |
| :--- | :---: | :---: | :---: | :---: | :--- | :--- | :--- |
| **`RECEIPT`** | $+N$ | $0$ | $0$ | $+N$ | $+N$ | Sin cambio | Factura Proveedor Aprobada |
| **`RESERVE`** | $0$ | $0$ | $+N$ | $-N$ | $0$ (Sin bloqueo físico) | Crear `ACTIVE` | Intento Pago Iniciado |
| **`RELEASE`** | $0$ | $0$ | $-N$ | $+N$ | $0$ | Cambiar a `RELEASED` | Pago Confirmado Rechazado |
| **`SALE_POS_DIRECT`**| $-N$ | $0$ | $0$ | $-N$ | $-N$ (Asignación inmediata) | Sin cambio | Cobro Efectivo POS Aprobado |
| **`FULFILL`** | $-N$ | $0$ | $-N$ | $0$ | $-N$ (Asignación picking) | Cambiar a `FULFILLED` | Pago Confirmado Aprobado |
| **`TIMEOUT_RECONCILE`**| $0$ | $0$ | $0$ | $0$ | $0$ | En Verificación | Consulta Gateway MP |
| **`RETURN_SELLABLE`**| $+N$ | $0$ | $0$ | $+N$ | $+N$ | Sin cambio | Devolución Aprobada Vendible |
| **`RETURN_DAMAGED`** | $0$ | $+N$ | $0$ | $0$ | $+N$ (`DAMAGED`) | Sin cambio | Devolución Rota (Cuarentena) |
| **`REFUND`** | $0$ | $0$ | $0$ | $0$ | $0$ | Sin cambio | Reintegro Monetario Puro |

---

ESTADO: FASE 11 — ARQUITECTURA CERTIFICADA CON LAS 4 CORRECCIONES DE PRECISIÓN LISTA PARA IMPLEMENTAR.
