# ESPECIFICACIÓN DE TRANSACCIÓN POS ATÓMICA — FASE 11B

## 1. Algoritmo Atómico de Venta Directa (`rpc_sale_pos_direct_saas`)

```text
Entrada: sale_draft
  │
  ├── 1. Validar autenticación de Cajero y RLS por tenant_id
  ├── 2. Verificar idempotency_key (si existe, retornar respuesta idempotent)
  ├── 3. Verificar disponible (available >= quantity) para cada producto propio
  ├── 4. Crear registro en sales y sale_items con precios snapshot
  ├── 5. Si WMS ON: realizar allocation físico y descontar inventory_locations (SELLABLE)
  │      Si WMS OFF: descontar inventory_balances.on_hand_sellable
  ├── 6. Grabar entrada inmutable en inventory_ledger (SALE_POS_DIRECT)
  ├── 7. Crear movimiento en cash_movements vinculado al sale_id
  └── 8. Confirmar transacción y emitir Ticket
```

---

## 2. Garantías de Trazabilidad Transaccional

Dado un `sale_id`, el sistema permite recuperar:
- Venta encabezado (`sales`)
- Ítems detallados (`sale_items`)
- Movimiento de caja exacto (`cash_movements` con `reference_id = sale_id`)
- Entradas de bitácora (`inventory_ledger` con `reference_id = sale_id`)
- Allocations de módulos WMS involucrados
