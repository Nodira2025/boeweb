# Corte y despliegue seguro de arquitectura v2

## Condición de salida

No habilitar ventas financieras reales hasta completar este procedimiento en staging y repetirlo en producción con respaldo verificado.

## 1. Preparación

1. Congelar cambios de esquema y operaciones durante la ventana de corte.
2. Exportar base, Auth y objetos de Storage; verificar checksums y restauración en una instancia aislada.
3. Configurar en el entorno server-side: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_TENANT_ID`, `PUBLIC_SITE_URL`, `CRON_SECRET` y, si corresponde, credenciales privadas de Mercado Pago/búsqueda/IA.
4. No exponer `SUPABASE_SERVICE_ROLE_KEY`, tokens o secretos en HTML, configuración publicada ni bundles.

## 2. Migraciones

Aplicar en orden y dentro del pipeline que verifica versión/checksum:

1. `000_saas_foundation.sql`
2. `001_initial_schema_baseline.sql`
3. `002_add_schema_migrations_and_releases.sql`
4. `003_expand_contract_support.sql`
5. `004_operational_core_and_config.sql`
6. `005_operational_lifecycle.sql`
7. `006_catalog_ingestion.sql`
8. `007_security_accounting_contract.sql`
9. `008_wms_inventory_security.sql`
10. `009_config_governance_forward.sql`
11. `010_public_catalog_config_enforcement.sql`
12. `011_public_catalog_dynamic_taxonomy.sql`

`009` existe para reforzar instalaciones donde versiones históricas ya pudieron haber quedado registradas. No se debe editar el checksum de una migración que ya fue aplicada: toda corrección posterior debe salir en una nueva migración forward.

## 3. Datos iniciales

1. Crear tenant y membresías reales con UUID de Supabase Auth.
2. Crear cajas/registros y ubicaciones activas; una ubicación default debe ser vendible.
3. Migrar clientes y cuentas corrientes conciliando cada saldo contra su ledger.
4. Migrar catálogo y stock mediante borrador/aprobación/recepción, no con `UPDATE` directo.
5. Guardar y publicar `tenant_app_config` schema v2 desde el panel admin.

## 4. Prueba exhaustiva obligatoria en staging

Ejecutar dos veces, incluyendo doble clic/reintento de cada comando:

- alta de producto → ubicación depósito → aprobación → recepción → traslado a estantería;
- conteo por un operador → aprobación por otra persona → intento de aprobar snapshot obsoleto;
- caja abierta → venta efectivo → transferencia → mixta → cuenta corriente;
- venta atendida por vendedor B y confirmada por cajero A;
- gasto → ingreso → cobro de cuenta corriente → intento de sobrepago;
- pedido web → reserva → preparación → listo → entrega;
- cancelación antes de fulfillment y reintegro completo después de fulfillment;
- anulación de venta con reposición y reversión de caja/CC;
- cierre del cajero → revisión por supervisor distinto → consulta del historial desde otro navegador;
- dos cajas intentando vender el último stock al mismo tiempo: una confirma y otra falla sin residuos.

Validar después de cada paso: `sales_v2`, `sale_items_v2`, `sale_payments_v2`, `inventory_balances_v2`, `inventory_ledger_v2`, `cash_movements_v2`, `accounts_receivable_ledger`, `operational_audit_log` y `outbox_events`.

## 5. Automatización y smoke tests

```powershell
npm.cmd test
node --test tests/exhaustive-operational-loop-v2.test.mjs
```

Luego ejecutar smoke visual en desktop y mobile sobre `/`, `/vendedor.html` y `/admin-config.html`, con sesiones reales de vendedor y supervisor.

## 6. Rollback

Si falla una reconciliación, detener nuevas operaciones, conservar logs/outbox, volver el frontend a mantenimiento y restaurar la copia completa. No hacer rollback parcial borrando ventas, ledgers o cierres. El reintento se hace con una migración forward corregida y claves de idempotencia nuevas sólo cuando la intención de negocio sea diferente.

## Pendientes que requieren infraestructura externa

- Compilar/aplicar SQL contra PostgreSQL real.
- Configurar webhooks y secretos reales.
- Ejecutar concurrencia real con dos sesiones/JWT.
- Migrar y conciliar datos productivos existentes.
- Activar monitoreo del cron de reservas y procesamiento de outbox.
