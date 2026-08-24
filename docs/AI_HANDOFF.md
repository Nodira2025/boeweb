# Handoff para continuar la arquitectura operativa v2

Última actualización: 2026-08-24
Proyecto: `C:\Users\Profesor Franco\Desktop\boeweb`

## Objetivo

Terminar y desplegar de forma segura la migración de BÔ Web desde una aplicación híbrida basada en `localStorage` y escrituras directas a una arquitectura donde Supabase/PostgreSQL sea la única autoridad de:

- catálogo propio;
- ubicaciones y stock;
- ventas, ítems y asignaciones de pago;
- caja, movimientos, cierre y supervisión;
- clientes y cuentas corrientes;
- pedidos públicos, reservas y reintegros;
- auditoría, outbox y alertas operativas;
- configuración visual y reglas por tenant.

## Estado actual confirmado

- La suite completa pasa: `289/289`.
- `npm.cmd test` ejecuta chequeo sintáctico y todas las pruebas.
- El smoke HTTP local devolvió `200` para `/`, `/vendedor.html`, `/admin-config.html`, `/app-config.js` y `/operational-api.js`.
- El loop de contrato completo pasa en `tests/exhaustive-operational-loop-v2.test.mjs`.
- `git diff --check` no informa errores; sólo avisos de conversión LF/CRLF.
- No se aplicaron migraciones a una base real.
- No se realizó commit, push ni despliegue.
- No había PostgreSQL, Supabase CLI ni Docker disponibles en el entorno auditado.
- La inspección visual con el navegador integrado quedó bloqueada por un error interno de ruta confiable del plugin, no por un error confirmado de la app.

Últimos cierres de autoridad local:

- el storefront ya no contiene el catálogo/stock heredado ni replica pedidos operativos en `localStorage`;
- caja y cuenta corriente fallan cerradas si una ruta antigua intenta persistirlas localmente;
- auditoría administrativa consulta `operational_audit_log` con sesión y rol verificados;
- mermas, reposiciones y reversiones se derivan de `inventory_ledger_v2` y las reversiones requieren supervisor;
- el mapa WMS y las fotos de estantería conservan tipo, condición vendible y ubicación predeterminada;
- la migración `010` hace efectivas en servidor las reglas publicadas de visibilidad, fuente, productos sin stock y backorders del catálogo.
- la migración `011` expone sólo la marca comercial saneada y el storefront deriva marcas/categorías del catálogo del tenant, sin listas growshop codificadas.
- WhatsApp, Instagram, dirección, lema y copyright del storefront se aplican desde AppConfig; ya no hay contactos BÔ fijos en esas superficies.

## Decisiones que no deben revertirse

1. PostgreSQL/Supabase es la única fuente de verdad operativa.
2. `localStorage` no puede confirmar stock, deuda, caja, ventas, roles ni cierres.
3. Las operaciones financieras y de inventario deben pasar por RPC transaccionales.
4. `cashier_user_id` y `salesperson_user_id` son identidades diferentes.
5. Una venta puede ser atendida por un vendedor y confirmada por otro cajero, conservando ambos actores.
6. El supervisor del cierre o conteo debe ser otra persona.
7. Las anulaciones y devoluciones son movimientos compensatorios; no se borra historia.
8. Los precios y totales se recalculan en servidor.
9. CARD, Mercado Pago y QR no pueden declararse capturados desde el navegador.
10. No permitir stock negativo, recepción sin ubicación, venta sin caja abierta, crédito sin límite ni nuevos cargos con deuda vencida.
11. Configuración visual pública sí es administrable; secretos y controles de seguridad no.

## Archivos centrales

### Arquitectura y frontend

- `app-config.js`: contrato schema v2 de marca, hero, catálogo, pagos públicos y reglas.
- `app-config.css`: interfaz de configuración.
- `admin-config.html` y `admin-config.js`: borrador/publicación tenant-scoped, con escritura remota obligatoria.
- `operational-api.js`: frontera de comandos operativos.
- `public-order-api.js`: creación segura de pedidos públicos.
- `pos-cart-engine.js`: carrito canónico con ubicación física por línea.
- `vendedor.js`: POS, caja, clientes, cuenta corriente, pedidos y WMS conectados a backend.
- `index.js` y `hero-slider.js`: storefront y branding publicados.

### Backend server-side

- `netlify/functions/_shared/http-auth.mjs`
- `netlify/functions/create-public-order.mjs`
- `netlify/functions/create-payment-preference.mjs`
- `netlify/functions/mercadopago-webhook.mjs`
- `netlify/functions/manage-tenant-user.mjs`
- `netlify/functions/health-check-cron.mjs`
- `netlify/functions/analyze-product.mjs`
- `netlify/functions/lookup-product.mjs`

### Migraciones, en orden

1. `scripts/migrations/000_saas_foundation.sql`
2. `scripts/migrations/001_initial_schema_baseline.sql`
3. `scripts/migrations/002_add_schema_migrations_and_releases.sql`
4. `scripts/migrations/003_expand_contract_support.sql`
5. `scripts/migrations/004_operational_core_and_config.sql`
6. `scripts/migrations/005_operational_lifecycle.sql`
7. `scripts/migrations/006_catalog_ingestion.sql`
8. `scripts/migrations/007_security_accounting_contract.sql`
9. `scripts/migrations/008_wms_inventory_security.sql`
10. `scripts/migrations/009_config_governance_forward.sql`
11. `scripts/migrations/010_public_catalog_config_enforcement.sql`
12. `scripts/migrations/011_public_catalog_dynamic_taxonomy.sql`

No editar una migración ya registrada en una base. Si el checksum/version ya existe, crear una migración forward nueva.

## Qué falta para terminar realmente

### P0 — Base de staging

1. Conseguir un proyecto Supabase de staging vacío o un clon anonimizado.
2. Hacer backup verificable antes de tocar una instalación existente.
3. Aplicar `000..011` en orden dentro de transacciones.
4. Registrar salida completa de cada migración.
5. Verificar `schema_migrations`, checksums, funciones, triggers, grants y RLS.
6. Corregir cualquier error PostgreSQL mediante `012_*.sql`; no modificar migraciones ya aplicadas.

Consultas mínimas después de migrar:

```sql
select * from public.schema_migrations order by version;
select schemaname, tablename, rowsecurity from pg_tables where schemaname = 'public';
select routine_name, security_type from information_schema.routines where routine_schema = 'public';
select * from pg_policies where schemaname = 'public' order by tablename, policyname;
```

### P0 — Datos y Auth

1. Crear usuarios reales mediante Supabase Auth.
2. Vincular `tenant_users.user_id` a UUID reales.
3. Crear al menos ADMIN, SUPERVISOR, VENDEDOR y DEPOSITO.
4. Crear una caja física y dos ubicaciones vendibles.
5. Publicar una configuración schema v2.
6. Migrar un conjunto pequeño de productos/clientes mediante RPC, no con inserts manuales.

### P0 — Loop real con dos sesiones

Repetir el flujo de `tests/exhaustive-operational-loop-v2.test.mjs` contra staging:

1. Crear borrador de producto.
2. Ubicar en depósito.
3. Aprobar con rol autorizado.
4. Recibir stock.
5. Transferir a estantería.
6. Contar como operador.
7. Aprobar como supervisor distinto.
8. Crear cliente con cuenta corriente.
9. Abrir caja como cajero.
10. Vender en efectivo.
11. Vender por transferencia.
12. Vender con pago mixto.
13. Vender a cuenta corriente.
14. Confirmar una venta atribuida a otro vendedor.
15. Registrar gasto e ingreso.
16. Cobrar la cuenta corriente.
17. Intentar sobrepago y confirmar rechazo atómico.
18. Crear y completar pedido web.
19. Anular venta y verificar compensaciones.
20. Cerrar caja como cajero.
21. Revisar desde otra sesión como supervisor.
22. Consultar historial desde otro navegador/dispositivo.

Después de cada paso conciliar:

- `sales_v2`
- `sale_items_v2`
- `sale_payments_v2`
- `inventory_balances_v2`
- `inventory_ledger_v2`
- `cash_sessions_v2`
- `cash_movements_v2`
- `cash_closures`
- `customer_accounts`
- `accounts_receivable_ledger`
- `operational_audit_log`
- `outbox_events`

### P0 — Concurrencia

Con dos JWT y dos clientes independientes:

- vender simultáneamente el último stock;
- abrir simultáneamente la misma caja;
- reutilizar la misma idempotency key con igual payload;
- reutilizarla con payload diferente;
- aprobar un conteo después de una venta o transferencia;
- cancelar/expirar una reserva mientras se confirma el pago.

Resultado esperado: una operación gana; la otra falla sin filas parciales.

### P0 — Pagos externos

1. Configurar secretos sólo en Netlify/Supabase.
2. Registrar webhook real de Mercado Pago.
3. Verificar firma, replay e idempotencia.
4. Probar pago aprobado, rechazado, expirado y reintegro completo.
5. Los reintegros parciales se rechazan actualmente. Si se requieren, implementar un ledger parcial real en una migración/RPC nueva antes de habilitarlos.

### P1 — Prueba visual

Probar desktop y mobile en:

- `/`
- `/vendedor.html`
- `/admin-config.html`

Verificar:

- logo, favicon, colores, tipografías, textos y hero publicados;
- catálogo vacío, con stock, sin stock y múltiples estanterías;
- estados de carga/error sin datos demo;
- POS completo y pago mixto;
- caja abierta/cerrada y bandeja del supervisor;
- clientes sin asignación y separación por vendedor;
- mapa WMS y conteos;
- teclado, foco visible, lectores de pantalla y contraste;
- viewport móvil sin controles cortados.

### P1 — Limpieza legacy

Quedan bloques heredados conservados como referencia o fallback de lectura. Antes de borrarlos:

1. Confirmar con `rg` que no tengan callers HTML/JS.
2. Crear una prueba que asegure que el flujo vivo usa `OperationalApi`.
3. Retirarlos en un cambio separado y pequeño.

Buscar especialmente:

```powershell
rg -n "localStorage|submitPosSaleDraftLegacyUnsafe|saveCurrentAccount|importCashBackup|boeweb_cash_|boeweb_current_accounts|boeweb_wms" vendedor.js
```

No volver a exponer `importCashBackup`, `saveCurrentAccount` o el checkout legacy en `window`.

## Configuración de marca

La configuración canónica vive en `tenant_app_config`, etapas `draft` y `published`. Debe conservar:

- `brand.visuals`: logo, favicon, colores y fuentes permitidas;
- `brand.texts`: nombre, lema, terminología y contacto;
- `brand.hero`: hasta ocho slides saneados;
- `catalog`: fuente, visibilidad, stock, backorders, moneda y umbral;
- `payments`: sólo información pública;
- `rules.sales`: `allowVendorAdjustments`, descuento porcentual y fijo;
- reglas operativas protegidas por backend.

Nunca guardar Access Tokens, service role, contraseñas, private keys o webhook secrets en `tenant_app_config`.

## Comandos de validación

```powershell
npm.cmd test
npm.cmd run verify:deployment
node --test tests/exhaustive-operational-loop-v2.test.mjs
node --test tests/app-config-v2.test.mjs tests/config-governance-v2.test.mjs
node --test tests/operational-core-v2.test.mjs tests/operational-lifecycle-v2.test.mjs
node --test tests/operational-wms-frontend-v2.test.mjs tests/wms-security-v2.test.mjs
git diff --check
```

Último resultado conocido: `292` pruebas, `292` aprobadas. El 24-08-2026
también se verificó contra Supabase real: migraciones `000..011`, tenant activo,
configuración publicada schema v2, ubicación default, caja activa y lectura
pública del catálogo, todo correcto.

## Variables necesarias

Consultar `.env.example`. Como mínimo:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` sólo server-side
- `PUBLIC_TENANT_ID`
- `PUBLIC_SITE_URL`
- `CRON_SECRET`
- `MERCADOPAGO_ACCESS_TOKEN` sólo server-side
- `MERCADOPAGO_WEBHOOK_SECRET` sólo server-side

## Criterio de “terminado”

El proyecto sólo se considera terminado para producción cuando:

- las migraciones compilan y se aplican en staging y producción;
- el loop real completo pasa con JWT y datos persistentes;
- las conciliaciones quedan en cero;
- las pruebas de concurrencia no dejan residuos;
- los webhooks reales están verificados;
- el recorrido visual desktop/mobile está aprobado;
- existe backup restaurable;
- monitoreo/cron/outbox están activos;
- no quedan credenciales cliente ni rutas operativas local-first alcanzables.

## Documentos relacionados

- `docs/ARCHITECTURE_V2.md`
- `docs/CUTOVER_V2.md`
- `README.md`

Si otra IA retoma: primero ejecutar la suite, leer estos tres documentos y revisar `git status`. El worktree contiene cambios sin commit; no descartar ni resetear archivos ajenos.
