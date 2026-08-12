# ESQUEMA DE DATOS DE VENTAS COMERCIALES Y CAJA (PERSISTENCIA DB) — FASE 11B

## 1. Tabla `sales`

Guarda el encabezado inmutable de cada venta comercial:
- `id` (UUID PK)
- `tenant_id` (UUID FK tenants)
- `status` (`CONFIRMED`, `CANCELLED`, `REFUNDED`)
- `cashier_user_id` & `cashier_name_snapshot` (Cajero Auth server-side)
- `salesperson_user_id` & `salesperson_name_snapshot` (Vendedor mostrador de `tenant_users`)
- `subtotal`, `discount`, `total` (Importes exactos NUMERIC(12,2))
- `payment_method` (`EFECTIVO`, `TRANSFERENCIA`, `DEBITO`, `CREDITO`, `MERCADOPAGO`)
- `idempotency_key` (VARCHAR UNIQUE)

---

## 2. Tabla `sale_items`

Guarda el detalle de productos vendidos con sus precios snapshot:
- `sale_id` (UUID FK sales)
- `product_id` & `product_name_snapshot`
- `quantity`, `unit_price`, `subtotal`
- `fulfillment_type` (`DIRECT`, `B2B_BACKORDER`, `RESERVATION_FULFILL`)

---

## 3. Tablas `cash_sessions` y `cash_movements`

- `cash_sessions`: Control de aperturas, montos iniciales, arqueos contados y cierres.
- `cash_movements`: Registro granular vinculable por `reference_id` al `sale_id`.
