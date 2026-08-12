# CONTRATO DE BORRADOR DE VENTA (`sale_draft`) — FASE 11A

## 1. Propósito y Límites de la Fase 11A

El borrador de venta (`sale_draft`) es la estructura de datos emitida al completar una operación en el POS Itemizado durante la Fase 11A. 
**No ejecuta el descuento contable de inventario (`rpc_sale_pos_direct_saas`) ni modifica el Ledger en la Fase 11A**, quedando preparado como contrato inmutable para ser procesado en la Fase 11B.

---

## 2. Esquema JSON del Contrato `sale_draft`

```json
{
  "draft_id": "draft_1786559800000_123",
  "tenant_id": "11111111-1111-1111-1111-111111111111",
  "cashier_user_id": "usr-profesor-franco",
  "cashier_name_snapshot": "Profesor Franco",
  "salesperson_user_id": "usr-lautaro-vendedor",
  "salesperson_name_snapshot": "Lautaro (Vendedor)",
  "items": [
    {
      "product_id": "SKU-01",
      "name": "BioBizz Bio Grow 1 L",
      "quantity": 2,
      "unit_price": 15000,
      "subtotal": 30000,
      "availability": "EN_STOCK"
    }
  ],
  "subtotal": 30000,
  "discount": 0,
  "total": 30000,
  "payment_method": "EFECTIVO",
  "notes": "Venta de mostrador turno tarde",
  "idempotency_key": "pos_draft_1786559800000_30000",
  "created_at": "2026-08-12T18:45:00.000Z",
  "status": "DRAFT_READY_FOR_11B"
}
```

---

## 3. Matriz de Mapeo de Identidades

| Campo Contrato | Fuente Autoritativa | Propósito |
| :--- | :--- | :--- |
| `cashier_user_id` | `SaasAuth.getTenantContext().userId` | Identifica al usuario autenticado server-side que cobró la venta. |
| `cashier_name_snapshot` | `SaasAuth.getTenantContext().userName` | Preserva el nombre del cajero al momento del cobro. |
| `salesperson_user_id` | `<select id="pos-salesperson-select">` | Identifica al vendedor de `tenant_users` que atendió la consulta. |
| `salesperson_name_snapshot` | Opción seleccionada en `<select>` | Preserva el nombre del vendedor para el cálculo de comisiones. |
