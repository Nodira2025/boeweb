# DOCUMENTACIÓN DE CONTABILIDAD DE INVENTARIO (INVENTORY ACCOUNTING) — FASE 11B

## 1. Reglas Canónicas de Fuentes de Verdad

```text
WMS DESACTIVADO (WMS OFF)
on_hand = inventory_balances.on_hand_sellable

WMS ACTIVADO (WMS ON)
on_hand = SUM(inventory_locations.quantity WHERE disposition = 'SELLABLE')

RESERVAS (RESERVED)
reserved = SUM(inventory_reservations.quantity WHERE status = 'ACTIVE' AND expires_at > NOW())

STOCK DISPONIBLE COMERCIAL (AVAILABLE)
available = on_hand - reserved
```

---

## 2. Event Ledger Inmutable (`inventory_ledger`)

El sistema registra eventos append-only sin permitir operaciones `UPDATE` o `DELETE`:
- `SALE_POS_DIRECT`: Venta directa presencial en mostrador.
- `RESERVE`: Reserva comercial por pedido.
- `RELEASE`: Liberación o cancelación de reserva.
- `FULFILL`: Despacho físico de reserva activa.
- `RETURN_SELLABLE`: Devolución en buen estado (reintegra disponible).
- `RETURN_DAMAGED`: Devolución rota (reintegra como DAMAGED, no disponible).
