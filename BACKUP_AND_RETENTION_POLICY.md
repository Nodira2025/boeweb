# POLÍTICA DE BACKUPS, RETENCIÓN Y MANIFIESTOS — FASE 15

## 1. Alcance de Respaldos Lógicos

Cada respaldo de base de datos cubre obligatoriamente el 100% de los datos multi-tenant:
- `tenants`, `tenant_users`, `tenant_profiles`
- `products`, `suppliers`, `supplier_products`
- `sales`, `sale_items`
- `cash_sessions`, `cash_movements`
- `inventory_balances`, `inventory_reservations`, `inventory_ledger`, `inventory_locations`
- `operational_alerts`, `operational_alert_events`, `alert_rules`, `health_check_runs`
- `admin_activity_log`

## 2.Manifiesto de Backup
Todo respaldo genera un archivo de manifiesto no secreto con la siguiente estructura:
- `backup_id`: Identificador unívoco (`bkp-{timestamp}-{rand}`)
- `created_at`: Marca de tiempo ISO
- `environment`: `PRODUCTION` / `STAGING` / `LOCAL`
- `schema_version`: Versión de esquema al momento del respaldo
- `checksum`: Firma SHA-256 del contenido
