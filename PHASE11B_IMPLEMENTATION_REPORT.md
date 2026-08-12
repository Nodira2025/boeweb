# INFORME TÉCNICO DE IMPLEMENTACIÓN FASE 11B — VENTA PERSISTENTE + INVENTORY ACCOUNTING + WMS + LEDGER + CAJA DB

## 1. Resumen de Arquitectura Implementada

En la Fase 11B se logró la convergencia transaccional atómica donde una **única confirmación** del vendedor o cajero genera coherentemente:

```text
               VENTA EN POS (Draft Validado)
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
      VENTA COMERCIAL            CONTABILIDAD Y CAJA
  - sales (UUID, totales)       - cash_movements (DB)
  - sale_items (snapshot)       - inventory_balances (WMS OFF)
  - correlation_id              - inventory_locations (WMS ON)
                                - inventory_ledger (Append-Only)
```

---

## 2. Inmunidad a Doble Descuento y Aislamiento de Storage

1. **Aislamiento de Drafts:**
   Los `sale_draft` generados en la Fase 11A se almacenan bajo la clave propia `boeweb_pos_sale_drafts` y **jamás alteran `calculateCashTotals()` ni los movimientos reales de caja**.
2. **Idempotencia Fuerte:**
   El envío repetido de una misma transacción con la misma `idempotency_key` es detectado server-side/engine-side, retornando el registro existente sin duplicar ventas, saldos ni movimientos de caja.
3. **Caja DB Autorritativa:**
   Las tablas `cash_sessions` y `cash_movements` reemplazan a `localStorage` como fuente autoritativa financiera.
