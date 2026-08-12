# CATÁLOGO DE REGLAS Y DETECTORES OPERATIVOS — FASE 13

## 1. Reglas por Categoría de Negocio

| Categoría | Tipo de Alerta | Severidad | Fingerprint / Deduplicación | Descripción |
| :--- | :--- | :---: | :--- | :--- |
| **INVENTORY** | `LOW_STOCK` | `WARNING` | `LOW_STOCK:tenant:product` | `available < min_stock` |
| **INVENTORY** | `OUT_OF_STOCK` | `CRITICAL` | `OUT_OF_STOCK:tenant:product` | `available == 0` |
| **INVENTORY** | `WMS_RECONCILIATION_DRIFT` | `CRITICAL` | `WMS_DRIFT:tenant:product` | Discrepancia entre saldo virtual y módulos WMS |
| **CASH** | `CASH_SESSION_OPEN_TOO_LONG` | `WARNING` | `CASH_OPEN:tenant:session` | Caja abierta hace más de 14 horas |
| **CASH** | `CASH_DIFFERENCE` | `CRITICAL` | `CASH_DIFF:tenant:session` | Arqueo contado $\neq$ efectivo físico esperado |
| **RESERVATIONS** | `ACTIVE_RESERVATION_EXPIRED` | `WARNING` | `RES_EXPIRED:tenant:reservation` | Reserva en estado `ACTIVE` con `expires_at < NOW()` |
| **WMS_AUDIT** | `AUDIT_PENDING_TOO_LONG` | `WARNING` | `AUDIT_PENDING:tenant:audit` | Auditoría WMS en estado `PENDING` |
| **MIGRATION** | `MIGRATION_FAILED` | `CRITICAL` | `MIG_FAILED:tenant:job` | Proceso de migración fallido |
| **INTEGRITY** | `SALE_WITHOUT_ITEMS` | `CRITICAL` | `INT_SALE_NO_ITEMS:tenant:sale` | Encabezado de venta sin ítems grabados |
