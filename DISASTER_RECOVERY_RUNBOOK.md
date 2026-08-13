# RUNBOOK DE RECUPERACIÓN ANTE DESASTRES (DISASTER RECOVERY) — FASE 15

## 1. Objetivos Operativos (RPO & RTO)

- **RPO (Recovery Point Objective):** Máximo 15 minutos (respaldos incrementales / WAL log de Supabase).
- **RTO (Recovery Time Objective):** Máximo 30 minutos para restauración completa de servicio.

## 2. Procedimiento de Restore Drill

1. Obtener el manifiesto y dump del respaldo unívoco (`backup_id`).
2. Inicializar un entorno de base de datos aislado de prueba.
3. Ejecutar la restauración de datos (`ReleaseEngine.runRestoreDrill`).
4. Validar invariantes contables:
   - Suma de saldos en `inventory_balances` == suma de allocations WMS + balances.
   - Total de ventas en `sales` == suma de `sale_items`.
   - Movimientos de caja en `cash_movements` == total contabilizado.
5. Marcar estado `RESTORE_SUCCESS`.
