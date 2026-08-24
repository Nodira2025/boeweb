# Arquitectura operativa v2

## Decisión

PostgreSQL/Supabase es la única autoridad de ventas, stock, ubicaciones, caja, clientes, cuenta corriente, pedidos y auditoría. El navegador puede conservar configuración publicada y una outbox de checkout para tolerar cortes de red, pero no confirma operaciones por sí solo.

```text
Storefront / Vendedor / Admin
            │
            ├── lecturas tenant-scoped (RLS / vistas públicas saneadas)
            │
            └── comandos OperationalApi / funciones Netlify
                         │
                         ▼
              RPC transaccionales Supabase
                         │
       ┌─────────────────┼─────────────────┐
       ▼                 ▼                 ▼
 inventario/ledger   ventas/pagos     caja/CC/auditoría
       └─────────────────┴─────────────────┘
                  un solo commit
```

## Límites de responsabilidad

- `app-config.js`: contrato versionado y saneado de marca, textos, hero, catálogo, pagos públicos y reglas por tenant.
- `operational-api.js`: frontera de comandos del portal vendedor. Valida identidad, UUID, importes e idempotencia antes de invocar RPC.
- `public-order-api.js` y funciones Netlify: frontera pública; los precios, tenant y credenciales se resuelven en servidor.
- `scripts/migrations/004..009`: modelo operacional, checkout, ciclo de vida, ingestión, seguridad contable, WMS y gobierno de configuración.
- `outbox_events` y ledgers: historial append-only para integración, investigación y supervisión.
- `localStorage`: caché visual, preferencias y checkout pendiente. Nunca es fuente de saldo, stock, deuda, permiso ni cierre.

## Flujo canónico de producto e inventario

1. El operador crea `catalog_product_drafts_v2` con `submit_catalog_product_draft_v2`.
2. Define una ubicación real con `locate_catalog_product_draft_v2`.
3. Un rol autorizado aprueba con `approve_catalog_product_draft_v2`.
4. La aprobación/recepción crea o actualiza catálogo, balance, ledger, auditoría y outbox en una transacción.
5. Las transferencias usan `transfer_inventory_v2`; los conteos no alteran stock hasta una revisión de otra persona.
6. El POS envía `product_id` y `location_id`; el backend bloquea el balance y recalcula precio y total.

## Flujo canónico de venta

`checkout_sale_v2` valida sesión, tenant, cajero y vendedor atribuido; exige turno abierto; bloquea stock; recalcula precios; persiste venta, ítems y asignaciones de pago; registra sólo la parte en efectivo en caja; carga sólo la parte de cuenta corriente; y emite ledger, auditoría y outbox. Cualquier error revierte el conjunto.

El cajero puede cerrar una venta atendida por otro vendedor: ambos quedan registrados en campos distintos. La atribución no cambia quién operó la caja.

Las anulaciones son compensatorias mediante `void_sale_v2`: nunca se borra la venta original. Los reintegros web admitidos actualmente son completos; un importe parcial se rechaza para no marcar una venta completa como reintegrada.

## Caja y supervisión

- Una caja tiene un único turno `OPEN` por registro.
- Ingresos, gastos, retiros, ventas y cobros quedan como movimientos con actor y referencia.
- El cajero presenta el cierre; no lo aprueba.
- `cash_closures` guarda esperado, contado, diferencia, tolerancia configurada y estado de revisión.
- Otro usuario con rol supervisor/admin aprueba o rechaza. El historial no depende del dispositivo del cajero.

## Clientes y cuenta corriente

- `customers`, `customer_accounts` y `accounts_receivable_ledger` son tenant-scoped.
- El crédito exige cliente UUID, cuenta activa y límite disponible.
- La deuda vencida bloquea nuevos cargos; pagos superiores al saldo se rechazan en backend.
- Cobros externos con tarjeta/MP/QR requieren verificación server-side; un navegador no puede declararlos capturados.

## Marca y configuración futura

`tenant_app_config` mantiene etapas `draft` y `published`, revisión, actor y fecha. Permite cambiar por empresa:

- logotipo, favicon, paleta y tipografías seguras;
- nombre, lema, terminología y datos de contacto;
- piezas de portada/hero, CTA y duración;
- fuente, visibilidad, moneda y umbral del catálogo;
- medios de pago públicos;
- autorización y topes de descuento del vendedor;
- habilitación de cuenta corriente y tolerancia de arqueo.

Los secretos nunca forman parte de esta configuración. Stock negativo, ubicación de recepción, caja abierta, revisión del cierre, límite de crédito y bloqueo de deuda vencida son invariantes no desactivables desde el panel.

## Modelo de seguridad

- La identidad proviene de Supabase Auth; no se aceptan nombres, contraseñas o roles de `localStorage`.
- Todas las tablas operativas usan `tenant_id`, claves foráneas compuestas y RLS.
- Las mutaciones financieras y de stock se revocan a `anon/authenticated` y pasan por RPC autorizadas.
- Mercado Pago y demás credenciales viven sólo en servidor; los webhooks verifican firma y enlazan el evento al pedido.
- El catálogo anónimo usa una vista saneada sin costo, metadata privada ni actores.

## Estado de validación

La suite local prueba contratos, aislamiento, idempotencia, pagos mixtos, cuenta corriente, caja, WMS, pedidos, anulaciones y un loop operativo completo usando las funciones reales del cliente. La compilación PostgreSQL y el recorrido con datos reales deben ejecutarse en un proyecto Supabase de staging antes del corte; el entorno local auditado no dispone de PostgreSQL, Supabase CLI ni credenciales de despliegue.
