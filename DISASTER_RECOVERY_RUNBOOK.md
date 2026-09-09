# RUNBOOK DE RECUPERACIÓN ANTE DESASTRES (DISASTER RECOVERY)

> Estado al 2026-09-09: procedimiento preparado, todavía no certificado contra
> una base PostgreSQL y un proyecto Storage aislados. Los RPO/RTO siguientes son
> objetivos operativos; no deben presentarse como resultados medidos hasta que
> exista un acta de restore real con artefactos y conteos verificables.

## 1. Objetivos Operativos (RPO & RTO)

- **RPO objetivo:** 15 minutos, sujeto a contratar/configurar el mecanismo de respaldo correspondiente.
- **RTO objetivo:** 30 minutos, pendiente de medición mediante un restore real.

## 2. Procedimiento de Restore Drill

1. Obtener el manifiesto y dump del respaldo unívoco (`backup_id`).
2. Inicializar un entorno de base de datos aislado de prueba.
3. Ejecutar `pg_restore` mediante `scripts/db-pg-dump-restore-real.mjs`.
4. Validar invariantes contables:
   - Suma de saldos en `inventory_balances` == suma de allocations WMS + balances.
   - Total de ventas en `sales` == suma de `sale_items`.
   - Movimientos de caja en `cash_movements` == total contabilizado.
5. Marcar `RESTORE_SUCCESS` solamente si se conservaron dump, manifiesto,
   checksum, salida saneada, conteos e invariantes del destino aislado.

Las pruebas de `ReleaseEngine` y los runners inyectados validan contratos de
código; no certifican por sí solos un backup o restore de infraestructura.
