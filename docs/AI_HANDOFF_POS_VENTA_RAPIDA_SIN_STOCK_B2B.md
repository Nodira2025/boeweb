# Handoff maestro: POS unificado, venta flexible, cobro, comprobantes y caja

Fecha: 2026-08-25
Proyecto: `C:\Users\Profesor Franco\Desktop\boeweb`
Rama: `main`
Commit de partida recomendado: `b4fac19`

## Pedido del usuario

Implementar en la sección **Vender producto** estas capacidades, tanto en escritorio como en móvil:

1. **Venta rápida / ítem libre:** permitir cobrar inmediatamente un producto recién llegado que todavía no fue ingresado al catálogo.
2. **Venta de productos sin stock:** volver a ofrecer productos agotados y registrar la operación como pendiente de entrega, sin fabricar stock ni llevar el inventario a negativo.
3. **Catálogo ampliado para vender:** permitir buscar y seleccionar artículos del catálogo propio, catálogo B2B y tiendas locales/cercanas desde el mismo flujo de venta.
4. **Mostrador de alta velocidad:** escaneo directo, multiplicadores como `5*7791234567890`, acumulación por reescaneo y foco permanente.
5. **Cobro en efectivo:** cálculo de “paga con” y vuelto, con denominaciones configurables.
6. **Ventas en espera en móvil:** pausar, listar y recuperar tickets sin convertirlos todavía en ventas confirmadas.
7. **Comprobante posventa multicanal:** ticket térmico, WhatsApp, PDF A4 y correo a partir de la venta confirmada.
8. **Comprobantes de caja:** recibos/vales numerados por ingresos, egresos y retiros, con ORIGINAL y DUPLICADO.
9. **Planilla de arqueo:** cierre con movimientos, efectivo esperado/contado, diferencia, observaciones y firmas.

No alcanza con mostrar botones. La venta debe confirmarse en Supabase, quedar contabilizada, ser idempotente y conservar el origen y el estado de entrega de cada artículo. Los comprobantes deben nacer de registros confirmados por el servidor y no de datos temporales del navegador.

## Plan previo incorporado

Este handoff fusiona el pedido nuevo con el plan que ya se había acordado con otra IA: PC de mostrador en dos columnas, asistente móvil de siete pasos, lector rápido, multiplicador, vuelto, tickets en espera, salidas posventa, comprobantes de caja por duplicado y planilla de arqueo.

No son proyectos incompatibles. Deben construirse sobre un único contrato de carrito y checkout:

- el catálogo flexible determina **qué** se vende y cómo se entrega;
- la experiencia PC/móvil determina **cómo** se carga el ticket;
- el checkout transaccional determina **cómo** se confirma, cobra y contabiliza;
- comprobantes y documentos se generan **después** de recibir el resultado confirmado.

## Resultado esperado desde el punto de vista del vendedor

En **Vender producto** debe existir una búsqueda única con filtros o pestañas:

- Todos
- Stock propio
- Sin stock / por encargo
- Proveedores B2B
- Tiendas locales

Cada resultado debe mostrar claramente:

- nombre, imagen, código y categoría;
- precio de venta al cliente;
- origen: `Propio`, `B2B` o nombre de la tienda local;
- disponibilidad;
- fecha o plazo estimado de entrega;
- proveedor/oferta elegida cuando haya más de una;
- si se entrega ahora o queda pendiente.

Además debe haber una acción visible **“Venta rápida”**. Sus campos mínimos son:

- nombre o concepto, obligatorio;
- precio unitario mayor que cero, obligatorio;
- cantidad entera mayor que cero, obligatoria;
- categoría, opcional;
- código de barras/SKU, opcional;
- nota, opcional.

La acción debe agregar el artículo al mismo ticket y permitir cobrarlo con los medios ya existentes.

## Definiciones funcionales que no se deben confundir

### Producto propio con stock

- Se entrega en el acto.
- El servidor valida y descuenta el saldo de la ubicación elegida.
- Genera ledger de inventario.

### Producto propio sin stock

- Es una venta por encargo/backorder, no una entrega física inmediata.
- Puede cobrarse completa en la primera versión.
- Debe crear un pendiente de entrega con fecha estimada.
- No descuenta inventario y jamás crea stock negativo.
- Si luego ingresa mercadería, la entrega debe resolverse mediante un flujo de fulfillment separado y auditable.

### Producto B2B

- Es un producto de un proveedor externo.
- Debe quedar registrado el proveedor y la oferta seleccionada.
- Debe quedar pendiente de abastecimiento/entrega.
- No suma ni descuenta stock propio.
- No debe modificar `supplier_products.stock` como si fuera inventario de la tienda.

### Producto de tienda local

- Debe conservar tienda, contacto, oferta y plazo estimado, hoy normalmente dos días.
- Queda pendiente de coordinación/entrega.
- No modifica inventario propio.
- No puede depender exclusivamente de `localStorage` para confirmar una venta.

### Venta rápida

- Es un artículo físico vendido ahora, pero todavía no catalogado.
- Se cobra y registra con snapshots de nombre, precio y cantidad.
- No descuenta un saldo inexistente ni inventa un `product_id` del catálogo.
- En la misma transacción debe crear o vincular un registro pendiente en `catalog_product_drafts_v2`, con `stock_quantity = 0` y metadata que indique que nació en una venta rápida. Así el equipo puede completar foto, ubicación y stock después.
- No publicar automáticamente un producto incompleto en el catálogo web.

## Regla sobre señas y pagos parciales

El estado móvil conserva campos antiguos de seña (`isDeposit`, `depositAmount`), pero el checkout actual exige que los pagos sumen exactamente el total.

Para la primera entrega aceptable:

- soportar pago completo de productos sin stock/B2B/locales;
- mantener oculta o deshabilitada la seña si no se implementa un saldo pendiente real.

No marcar una venta como totalmente pagada si sólo se recibió una seña. Si se implementan señas, deben existir deuda/saldo, eventos de cobro posteriores y conciliación; no resolverlo sólo con texto en `metadata`.

## Flujo de PC de mostrador

Mantener el layout de dos columnas existente:

- izquierda: búsqueda/catálogo y filtros;
- derecha: carrito, vendedor, caja, medio de pago y confirmación.

### Escaneo directo y multiplicador

Extraer una función pura, por ejemplo `parsePosScanCommand(rawValue)`, con este contrato:

```js
parsePosScanCommand('7791234567890')
// { quantity: 1, code: '7791234567890' }

parsePosScanCommand('5*7791234567890')
// { quantity: 5, code: '7791234567890' }

parsePosScanCommand('3xSUST-50L')
// { quantity: 3, code: 'SUST-50L' }
```

Reglas:

- aceptar `*` o `x`, mayúscula/minúscula y espacios alrededor;
- cantidad entera entre 1 y un máximo razonable, por ejemplo 999;
- no interpretar texto ambiguo como multiplicador;
- coincidencia exacta por barcode/SKU antes de búsqueda parcial;
- si es un producto propio con stock y `barcodeDirectAdd` está activo, agregar directamente sin modal;
- si ya está en el carrito, incrementar la línea respetando el saldo total disponible;
- si es B2B, tienda local, sin stock o hay varias ofertas, mostrar confirmación de fuente/entrega en vez de elegir silenciosamente;
- si el código es desconocido, ofrecer Venta Rápida con el código ya cargado;
- limpiar y devolver siempre el foco a `#pos-unified-search`;
- el carrito no reserva stock: la RPC debe volver a validar al cobrar.

### Cobro en efectivo y vuelto

Agregar un panel no invasivo con:

- total confirmado del carrito;
- input `Paga con`;
- chips de denominaciones configurables;
- total recibido;
- vuelto, o mensaje de importe insuficiente;
- botón para limpiar/recalcular.

El cálculo debe trabajar con centavos enteros o redondeo monetario consistente para evitar errores de coma flotante.

El importe entregado y el vuelto son datos del comprobante, no nuevos ingresos/egresos:

- el pago contabilizado sigue siendo el total de la venta;
- no registrar el dinero entregado como ingreso y el vuelto como egreso separados;
- opcionalmente enviar `cash_tendered` y `cash_change` en metadata validada por el servidor;
- exigir `cash_tendered >= total` cuando se informe;
- no aplicar el panel a transferencia, tarjeta o cuenta corriente.

## Flujo móvil y tickets en espera

Conservar el asistente táctil/por voz y completar sus siete pasos. Agregar en el resumen del carrito:

- `Poner en espera`;
- contador visible de tickets pausados;
- listado con hora, cliente opcional, importe y cantidad de líneas;
- `Retomar` en un toque;
- `Descartar` con confirmación.

Un ticket en espera no es una venta, no cobra, no descuenta ni reserva stock por defecto.

Implementación recomendada:

- tabla tenant-scoped `parked_pos_tickets_v2` con `id`, `tenant_id`, `cashier_user_id`, `salesperson_user_id`, `payload`, `status`, `created_at`, `updated_at`, `expires_at` e idempotencia;
- estados `PARKED`, `RESUMED`, `CONVERTED`, `CANCELLED`, `EXPIRED`;
- RLS para que el equipo autorizado del tenant pueda recuperar tickets según la política definida;
- al retomar, recalcular precios, fuentes y disponibilidad;
- al confirmar, marcar `CONVERTED` dentro del flujo coordinado con la venta o mediante transición idempotente.

Un fallback en `localStorage` sólo puede contener borradores no confirmados, con clave por tenant/usuario y vencimiento. No debe aparecer como venta, deuda, caja ni stock y no debe ser el único mecanismo si se requiere recuperación entre dispositivos.

## Salida posventa multicanal

Abrir las acciones sólo después de que `OperationalApi.checkoutSale()` devuelva `CONFIRMED` y usar el `sale_id`/`sale_number` del servidor.

Opciones:

- ticket térmico 80/58 mm mediante HTML/CSS de impresión;
- WhatsApp con resumen y enlace/archivo seguro;
- PDF A4;
- correo mediante backend/proveedor configurado.

Reglas:

- no generar un “comprobante confirmado” desde el carrito o una venta `PENDING` del outbox;
- volver a consultar o usar el receipt firmado/confirmado, no campos editables de la UI;
- incluir líneas, cantidades, importes, pagos, cajero, vendedor, entrega y pendientes;
- evitar exponer costos B2B o datos internos;
- una reimpresión no crea otra venta;
- registrar auditoría de envío/reimpresión si se necesita trazabilidad;
- el navegador no puede garantizar impresión ESC/POS silenciosa. Implementar vista imprimible y, sólo como integración opcional, WebUSB/bridge local con permiso explícito;
- `mailto:` no equivale a entrega de correo. Para envío real usar una Function/backend y guardar resultado;
- aclarar que es ticket/comprobante interno y no factura fiscal, salvo que luego se integre un proveedor fiscal autorizado.

## Comprobantes de movimientos de caja

La base actual ya tiene `cash_movements_v2` y `record_cash_movement_v2`; extenderla, no reemplazarla con objetos locales.

Cada ingreso, gasto o retiro confirmado debe poder emitir:

- número único generado en PostgreSQL;
- tipo `RECIBO` o `VALE`;
- fecha/hora y local/caja;
- cajero autenticado;
- concepto, categoría, importe y moneda;
- contraparte y documento/DNI cuando corresponda;
- referencia operativa;
- líneas de firma;
- etiqueta `ORIGINAL · RENDICIÓN DE CAJA` o `DUPLICADO · INTERESADO`.

El ORIGINAL y el DUPLICADO son representaciones del mismo movimiento:

- no insertar dos movimientos;
- no generar el número en JavaScript ni con `localStorage`;
- generar numeración concurrente y tenant-scoped en servidor;
- una reimpresión debe conservar número y datos originales;
- si se guarda contador de impresiones, hacerlo como evento/auditoría, no mutando el movimiento append-only.

La RPC debe devolver suficientes datos o un identificador para consultar el documento confirmado. Considerar campos estructurados para contraparte y documento; no esconder información crítica únicamente dentro de `description`.

## Planilla oficial de arqueo y cierre

La base actual ya tiene `cash_closures`, `submit_cash_closure_v2` y revisión por supervisor. La planilla imprimible debe derivarse de esas filas y sus movimientos.

Incluir:

- número de cierre generado por servidor;
- caja, turno, local, fecha de apertura/cierre;
- cajero saliente;
- ventas en efectivo;
- ingresos, retiros y gastos;
- transferencias y otros medios en secciones separadas, sin sumarlos al efectivo físico;
- efectivo esperado;
- efectivo contado;
- diferencia;
- observaciones;
- estado de revisión;
- supervisor que revisó;
- firmas de cajero y supervisor;
- ORIGINAL y DUPLICADO sin duplicar el cierre.

No usar `downloadCashBackup('json')` como sustituto de la planilla. Puede mantenerse como respaldo técnico separado.

## Aprobación de cuenta corriente por supervisor

El plan anterior pedía un PIN para autorizar sobregiro o mora. La UX puede mostrar una solicitud compacta de aprobación, pero la autoridad debe ser server-side.

El checkout actual valida límite de crédito en PostgreSQL. Un PIN comprobado sólo en JavaScript no puede ni debe saltar esa regla.

Diseño seguro:

1. El cajero solicita una excepción indicando cliente, ticket, importe y motivo.
2. Un usuario `SUPERVISOR`/`ADMIN` se autentica o aprueba con una credencial server-side.
3. El servidor crea una autorización de un solo uso, tenant-scoped, ligada a cliente, importe máximo, cajero y vencimiento corto.
4. La RPC de checkout consume esa autorización atómicamente.
5. Se registran solicitante, aprobador, motivo, regla excedida y resultado en auditoría.

Nunca:

- guardar el PIN en `app-config`, código, HTML o `localStorage`;
- compartir la contraseña Supabase del supervisor con el cajero;
- aceptar un booleano `supervisorApproved: true` enviado por el navegador;
- reutilizar indefinidamente la autorización;
- ocultar el sobregiro como descuento, pago completo o metadata.

Si no se implementa el flujo server-side completo, mantener el bloqueo actual. No simular una aprobación.

## Configuración POS

El plan anterior proponía `pos_configuration` con nombres snake_case. El contrato actual usa camelCase y agrupa políticas bajo `rules`. Para mantener consistencia, agregar por ejemplo:

```js
rules: {
  pos: {
    billDenominations: [20000, 10000, 2000, 1000, 500, 200, 100],
    barcodeDirectAdd: true,
    parkedTicketsEnabled: true,
    printDuplicateReceipts: true,
    requireSupervisorCreditOverride: true
  }
}
```

Actualizar en conjunto:

- `DEFAULT_CONFIG_SOURCE`;
- `normalizeConfig()`;
- `validateConfig()`;
- sanitización;
- controles de `admin-config.html`/`admin-config.js`;
- pruebas de shape exacto en `tests/app-config-v2.test.mjs`;
- persistencia draft/published.

Validar denominaciones como enteros positivos, únicos, ordenados y con un máximo acotado de opciones. Si se cambia `CONFIG_SCHEMA_VERSION`, implementar migración compatible de configuraciones v2; no romper configuraciones publicadas existentes.

## Arquitectura que se debe preservar

1. Supabase/PostgreSQL es la única autoridad de ventas, caja, deuda e inventario.
2. `localStorage` puede conservar preferencias o una copia de un comprobante, pero no confirmar operaciones.
3. Las ventas pasan por una RPC transaccional e idempotente.
4. El servidor recalcula los precios de productos catalogados y ofertas externas.
5. El navegador sólo puede proponer el precio de una venta rápida, porque ese artículo no tiene precio canónico. El servidor debe validarlo y auditarlo.
6. El stock externo nunca se mezcla con el stock propio.
7. No permitir stock negativo.
8. Mantener separados `cashier_user_id` y `salesperson_user_id`.
9. Efectivo requiere caja abierta; cuenta corriente requiere cliente y crédito válido.
10. No reactivar el checkout local heredado ni escrituras directas de caja/stock.
11. Mantener idempotencia, RLS, aislamiento por tenant, auditoría y outbox.
12. No editar migraciones `000..011` ya existentes. Crear una migración forward nueva; hoy el siguiente número libre es `012`.

## Estado actual del código

La interfaz conserva gran parte del diseño, pero la funcionalidad fue cerrada deliberadamente en varias capas.

### `vendedor.html`

- La sección POS comienza cerca de `vendedor.html:1700`.
- Existe el botón `#pos-express-item-btn` y el modal `#pos-express-item-modal` cerca de `vendedor.html:1778`.
- El texto y los campos de Venta Exprés ya están diseñados, pero el botón tiene semántica de deshabilitado.
- Los scripts tienen caché versionada al final:
  - `pos-cart-engine.js?v=cart_v2`
  - `operational-api.js?v=core_v2`
  - `vendedor.js?v=pos_mobile_v47`
- Incrementar esos tokens cuando cambien los archivos para evitar que producción conserve JavaScript anterior.

### `vendedor.js`

- `getAllSearchableProducts()` cerca de `vendedor.js:9760` filtra exclusivamente `source === 'catalog_products'`.
- `mobilePosAssistantState` ya contempla modos `stock`, `nostock` y `express`, además de fecha estimada y seña.
- `chooseMobilePosMode()` cerca de `vendedor.js:10000` rechaza todo modo que no sea `stock`.
- `confirmMobilePosExpressItem()` está reemplazado por una alerta de función deshabilitada.
- `confirmMobilePosItem()` bloquea cantidad mayor al stock.
- `renderPosSearchResults()` cerca de `vendedor.js:11171` usa sólo el catálogo interno y deshabilita el botón con stock cero.
- `showPosProductConfirmModal()` rechaza stock cero.
- `openPosExpressItemModal()` y `handlePosExpressItemSubmit()` cerca de `vendedor.js:14135` retornan antes de la ruta legacy.
- `submitPosSaleDraft()` cerca de `vendedor.js:11960` es la ruta viva correcta: usa `OperationalApi.checkoutSale()`.
- Existe un bloque legacy de confirmación/localStorage antes de la ruta actual. No reactivarlo ni volver a exportarlo.
- `fetchB2BProducts()` consulta las tablas legacy `products` y `supplier_products` y guarda resultados en `baseProducts`.
- `getNearbyStores()`/`saveNearbyStore()` cerca de `vendedor.js:13070` guardan tiendas y sus catálogos en `localStorage`; esto no es autoridad suficiente para una venta real.

### `pos-cart-engine.js`

Los bloqueos actuales están en:

- `loadFromStorage()`: elimina del carrito POS ítems exprés, sin stock y que no sean `EN_STOCK`.
- `addItem()`: rechaza `product.is_express` en modo POS.
- `addItem()`: rechaza `available_quantity === 0` o disponibilidad distinta de `EN_STOCK`.
- `updateQuantity()`: impide superar el stock para cualquier línea.
- `createSaleDraft()`: sólo serializa los campos pensados para producto propio.

Modificar el motor para reconocer tipos de línea explícitos, no para omitir todas las validaciones.

Contrato sugerido por línea:

```js
{
  line_type: 'OWN_STOCK' | 'OWN_BACKORDER' | 'B2B_BACKORDER' | 'LOCAL_STORE_BACKORDER' | 'QUICK_ENTRY',
  product_id: 'uuid-o-null',
  source_offer_id: 'uuid-o-id-estable-o-null',
  source_name: 'Proveedor o tienda',
  product_code: 'SKU/código externo',
  name: 'Snapshot visible',
  quantity: 1,
  price: 1000,
  availability: 'EN_STOCK' | 'A_PEDIDO' | 'LOCAL_2_DAYS' | 'EXPRESS_UNMAPPED',
  fulfillment_status: 'DELIVERED' | 'PENDING',
  expected_delivery_date: 'YYYY-MM-DD-o-null',
  available_quantity: 0,
  location_id: null,
  metadata: {}
}
```

Reglas del carrito:

- `OWN_STOCK`: exigir saldo y ubicación; limitar cantidad al disponible.
- `OWN_BACKORDER`, `B2B_BACKORDER`, `LOCAL_STORE_BACKORDER`: no limitar por saldo propio; exigir fecha/plazo y fuente válida.
- `QUICK_ENTRY`: exigir nombre, precio y cantidad; no exigir `product_id` ni ubicación.
- Permitir tickets mixtos con varios tipos de línea.
- Persistir todos los campos necesarios para recuperar el ticket sin degradarlo a un producto propio.

### `operational-api.js`

- `buildItems()` hoy reduce cada línea a `product_id`, `sku`, `quantity`, ubicación y `client_unit_price`.
- `invokeCheckout()` llama únicamente a `checkout_sale_v2`.
- Ampliar y validar el contrato, conservando `line_type`, fuente, snapshots y fecha estimada.
- No aceptar objetos arbitrarios: usar una allowlist de campos y validación por tipo de línea.
- El `payload_hash` debe incluir los nuevos campos para que la idempotencia detecte cambios.

### Funciones del plan previo que todavía no existen

El relevamiento del 2026-08-25 confirmó:

- `handlePosBarcodeOrDirectSearch()` cerca de `vendedor.js:11068` no parsea multiplicadores y abre un modal para la coincidencia exacta;
- no hay panel `Paga con`/vuelto ni denominaciones en `AppConfig`;
- no hay modelo ni interfaz de tickets pausados;
- no existen `printCashMovementVoucher()` ni `printCashClosureSummarySheet()`;
- `recordCashMovement()` y cierre central sí existen y son la base correcta;
- `cash_movements_v2` y `cash_closures` tienen UUID y datos operativos, pero no numeración documental amigable;
- `rules.cash` ya contiene turno, aprobación de diferencias y tolerancia;
- `rules.currentAccount` ya bloquea límite/mora, pero no existe autorización excepcional de un solo uso;
- la salida posventa actual se limita principalmente a una alerta y una copia local del receipt confirmado.

### `app-config.js` y panel administrativo

- El contrato actual es schema v2 y sus pruebas exigen claves exactas.
- No existe `pos_configuration` ni `rules.pos`.
- `rules.inventory.allowNegativeStock` está fijado en `false` y debe seguir así.
- `catalog.allowBackorders` ya existe, pero hoy está orientado al catálogo público; no asumir que por sí solo habilita backorders POS.
- Agregar controles POS de forma normalizada y publicada, sin guardar secretos o PIN.

### Backend SQL

`checkout_sale_v2` vive en `scripts/migrations/004_operational_core_and_config.sql:1626` y actualmente:

- exige que toda línea encuentre un `catalog_products` activo del mismo tenant;
- usa el precio del catálogo;
- exige stock suficiente si `track_stock = true`;
- descuenta inventario y genera ledger;
- inserta `sale_items_v2` con `product_id UUID NOT NULL`.

Por eso una modificación sólo en JavaScript seguirá siendo rechazada por PostgreSQL.

## Migración forward recomendada

Crear `scripts/migrations/012_pos_flexible_sales.sql` —o el siguiente número libre si el repositorio avanzó— con transacción, registro en `schema_migrations`, grants, RLS y pruebas de contrato.

Diseño recomendado:

1. Permitir `sale_items_v2.product_id` nulo para líneas que no representan inventario propio.
2. Agregar campos consultables, como mínimo:
   - `line_type`;
   - `fulfillment_status`;
   - `expected_delivery_date`;
   - `source_type`;
   - `source_id` o identificador externo estable.
3. Mantener nombre, SKU, precio, impuesto y proveedor como snapshots inmutables.
4. Añadir checks que obliguen `product_id` para `OWN_STOCK` y `OWN_BACKORDER`, pero permitan nulo para `QUICK_ENTRY` y fuentes externas.
5. Crear una entidad tenant-scoped para seguimiento de pendientes, por ejemplo `sale_fulfillments_v2`, y eventos auditables de cambio de estado. No dejar los encargos sólo en un texto del ticket.
6. Persistir tiendas locales y ofertas en tablas tenant-scoped. Sugerencia:
   - `external_catalog_sources_v2`;
   - `external_catalog_offers_v2`.
7. Migrar/adaptar B2B a ofertas con identidad estable. Las tablas legacy `products`/`supplier_products` deben auditarse antes de confiar en ellas porque la consulta actual no filtra por tenant.
8. Crear `checkout_sale_v3` para tickets mixtos y mantener `checkout_sale_v2` para clientes antiguos. Alternativamente, reemplazar la implementación de v2 con la misma firma sólo si se demuestra compatibilidad total; es preferible una v3 explícita.
9. La RPC v3 debe reutilizar las garantías de v2: autenticación, roles, idempotencia, precios, pagos, caja, cuenta corriente, auditoría y outbox.
10. La RPC debe resolver cada tipo de línea así:
    - `OWN_STOCK`: producto y precio canónicos, lock, descuento y ledger.
    - `OWN_BACKORDER`: producto y precio canónicos, sin descuento de stock, fulfillment pendiente.
    - `B2B_BACKORDER`: oferta B2B activa consultada en servidor, precio público autoritativo, fulfillment pendiente.
    - `LOCAL_STORE_BACKORDER`: oferta local activa del tenant, precio público autoritativo, fulfillment pendiente.
    - `QUICK_ENTRY`: nombre/precio/cantidad validados, snapshots, fulfillment entregado y borrador de catálogo pendiente.
11. Registrar en `operational_audit_log` la venta rápida y la creación de cada pendiente.
12. Emitir eventos en `outbox_events` para compra/abastecimiento y regularización del catálogo.
13. Agregar `parked_pos_tickets_v2` y RPC idempotentes para pausar, retomar, cancelar y convertir borradores.
14. Agregar numeración documental server-side para movimientos y cierres, junto con consultas/RPC de impresión que respeten RLS.
15. Si se implementa la excepción de crédito, agregar una tabla/RPC de autorizaciones de supervisor de un solo uso y consumirla dentro del checkout.

No duplicar la lógica contable completa sin necesidad. Extraer helpers SQL si hace falta, pero la confirmación final debe seguir siendo una sola transacción.

Por tamaño, es válido dividir la base en migraciones forward consecutivas y enfocadas, por ejemplo venta flexible, tickets pausados/documentos y autorizaciones. Verificar siempre el siguiente número libre; no amontonar cambios no relacionados en una migración ya aplicada.

## Precios y seguridad

- Producto propio: ignorar el precio enviado por el cliente; usar `catalog_products.price`.
- Oferta B2B/local: ignorar el precio adulterado por DevTools; resolver la oferta y su precio público en servidor.
- Venta rápida: aceptar el precio propuesto sólo para `line_type = QUICK_ENTRY`, validarlo y guardar actor/snapshot.
- Definir límites razonables de longitud, cantidad y monto.
- Si se agregan flags, usar configuración publicada, por ejemplo:
  - `rules.sales.allowQuickSale`;
  - `rules.sales.allowBackorderSale`;
  - `catalog.includeB2BInPos`;
  - `catalog.includeNearbyStoresInPos`.
- No dejar las funciones invisibles por falta de configuración: asegurar que el tenant BÔ de producción las tenga habilitadas.
- No confiar en `body.tenantId`, `localStorage`, nombres de proveedores ni IDs enviados sin validación server-side.

## Catálogo unificado existente

`public-catalog-unification.js` ya define estados útiles:

- `EN_STOCK`: propio;
- `LOCAL_2_DAYS`: tienda cercana;
- `A_PEDIDO`: B2B;
- `SIN_STOCK`: no disponible.

Reutilizar la semántica y los badges, pero no usar ese unificador cliente como autoridad de checkout.

En `fetchB2BProducts()` existe esta mutación:

```js
sp.price = sp.price * 0.70;
```

No copiarla ciegamente al POS. Determinar si el valor es costo, precio mayorista o precio final y calcular el precio público en servidor con la configuración publicada. El comprobante debe diferenciar costo de abastecimiento y precio vendido sin exponer o confundir uno con otro.

## Experiencia de usuario

### Escritorio

- Reactivar el modal existente de Venta Exprés.
- El botón no debe mantener `aria-disabled="true"` si está habilitado.
- Añadir filtros de origen en la búsqueda clásica.
- Un producto sin stock debe poder seleccionarse con una acción “Vender por encargo”, no con el botón deshabilitado “Sin Stock”.
- Antes de agregar, mostrar fecha estimada y estado pendiente.

### Móvil

- Reactivar las tres tarjetas de modo: en stock, sin stock y venta rápida.
- Conservar cámara, lector y voz.
- Para B2B/local mostrar proveedor y plazo antes de confirmar cantidad.
- No limitar la cantidad de un backorder al saldo propio; sí validar cantidad positiva y disponibilidad/reglas de la oferta.

### Ticket y confirmación

- Mostrar badges por línea: `Entrega ahora`, `Pendiente`, `B2B`, `Tienda local`, `Venta rápida`.
- La confirmación final debe advertir qué artículos se entregan y cuáles quedan pendientes.
- El comprobante debe incluir fecha estimada y fuente externa.
- Después de confirmar, refrescar catálogo propio y pendientes sin borrar un ticket rechazado.

## Pruebas que hoy contradicen el pedido y deben actualizarse

### `tests/pos-express-and-mixed-payment.test.mjs`

- Hoy exige que el carrito rechace ítems exprés.
- Reemplazar esos casos por pruebas que acepten Venta Rápida bajo el nuevo contrato y comprueben que no toca inventario.
- Mantener las pruebas de pago mixto y autoridad remota.

### `tests/vender-producto-internal-catalog.test.mjs`

- Hoy exige que la búsqueda POS excluya B2B.
- Hoy exige bloquear productos con stock cero.
- Reescribir esos casos para comprobar filtros, badges y tipos de fulfillment; no simplemente borrar las pruebas.

### `tests/pos-transaction-phase11b.test.mjs`

- Ya existe un caso simulado `A_PEDIDO` que no altera inventario y usa `B2B_BACKORDER`.
- Ese simulador no prueba la RPC real. Mantenerlo como referencia, pero agregar pruebas de contrato SQL y de `OperationalApi`.

## Matriz mínima de pruebas nuevas

1. Venta rápida confirmada:
   - registra venta, ítem, pago y caja;
   - conserva nombre/precio/cantidad;
   - no genera movimiento de stock;
   - crea borrador de catálogo pendiente;
   - retry con la misma clave no duplica nada.
2. Producto propio sin stock:
   - se vende como `OWN_BACKORDER`;
   - stock permanece en cero;
   - no hay ledger negativo;
   - existe fulfillment pendiente con fecha.
3. B2B:
   - precio enviado adulterado es ignorado;
   - proveedor/oferta quedan en snapshot;
   - no se altera inventario propio ni stock del proveedor;
   - crea tarea de abastecimiento.
4. Tienda local:
   - fuente pertenece al tenant y está activa;
   - una oferta de otro tenant devuelve 403/42501;
   - no depende de datos sólo locales del navegador.
5. Ticket mixto:
   - combina propio, backorder, B2B, local y rápido;
   - confirma todo o nada;
   - sólo las líneas propias con stock descuentan inventario.
6. Concurrencia:
   - dos ventas del último stock: una gana y otra puede rechazarse o convertirse en backorder sólo por elección explícita, nunca automáticamente.
7. Permisos:
   - sesión inexistente/inactiva rechazada;
   - tenant cruzado rechazado;
   - flags/rol de venta rápida respetados.
8. Pagos:
   - efectivo sin caja abierta rechazado;
   - cuenta corriente sin cliente/límite rechazada;
   - pago mixto conserva suma exacta.
9. UI:
   - desktop y móvil ofrecen las mismas capacidades;
   - teclado, foco, labels, `aria-*` y textos accesibles;
   - cache-busters actualizados.
10. Regresión:
   - producto propio normal continúa usando stock/ubicación;
   - outbox offline no marca como confirmada una venta pendiente de red;
   - reconocimiento de productos y funciones Netlify siguen funcionando.
11. Escaneo de mostrador:
   - código simple agrega una unidad;
   - `5*código` y `3xSKU` agregan la cantidad correcta;
   - reescaneo acumula sin superar stock;
   - entrada inválida no altera el carrito;
   - el foco vuelve al buscador.
12. Vuelto:
   - denominaciones se leen de configuración normalizada;
   - efectivo insuficiente bloquea confirmación;
   - centavos no producen errores de coma flotante;
   - el pago contabilizado es el total, no el efectivo entregado;
   - otros medios no muestran vuelto.
13. Tickets en espera:
   - pausar no crea venta, pago, caja ni ledger;
   - recuperar respeta tenant/usuario y vuelve a validar precio/stock;
   - convertir dos veces es idempotente;
   - expirado/cancelado no puede confirmarse.
14. Comprobantes y arqueo:
   - dos movimientos concurrentes reciben números únicos;
   - ORIGINAL y DUPLICADO conservan el mismo número/movimiento;
   - reimprimir no duplica contabilidad;
   - la planilla concilia efectivo esperado, contado y diferencia;
   - transferencias no inflan el efectivo físico.
15. Excepción de cuenta corriente:
   - booleano cliente o PIN local no autorizan nada;
   - aprobación pertenece al mismo tenant/cliente/cajero e importe;
   - expirada, usada o de otro tenant es rechazada;
   - aprobación válida se consume una vez y queda auditada.

## Archivos que probablemente deberán cambiar

- `vendedor.html`
- `vendedor.js`
- `pos-cart-engine.js`
- `operational-api.js`
- `public-catalog-unification.js` si se centraliza el adaptador de resultados
- `app-config.js` y panel de configuración si se agregan flags
- nueva migración `scripts/migrations/012_pos_flexible_sales.sql`
- migraciones forward adicionales si se separan tickets pausados, documentos y autorizaciones
- `vendedor-caja.css` para impresión de vales y planilla de cierre
- pruebas existentes mencionadas arriba
- nuevas pruebas dedicadas, por ejemplo:
  - `tests/pos-flexible-sales-v3.test.mjs`
  - `tests/pos-flexible-sales-migration-v3.test.mjs`
  - `tests/vendor-pos-flexible-ui.test.mjs`
  - `tests/pos-barcode-and-change.test.mjs`
  - `tests/pos-parked-tickets.test.mjs`
  - `tests/cash-documents-and-closure-print.test.mjs`
  - `tests/current-account-supervisor-override.test.mjs`

## Cosas que no se deben hacer

- No quitar sólo los `return`/`disabled` esperando que funcione.
- No permitir cantidades negativas ni saldo propio negativo.
- No usar `client_unit_price` como precio autoritativo de productos existentes o externos.
- No insertar una venta sólo en `localStorage`.
- No reactivar `submitPosSaleDraftLegacyUnsafe`.
- No actualizar `supplier_products.stock` al vender una oferta B2B.
- No reutilizar el carrito de compras mayoristas `boeweb_b2b_cart` como carrito de venta al cliente.
- No mezclar IDs externos arbitrarios con el FK UUID de `catalog_products`.
- No generar números de vale/cierre con `Date.now()`, contadores del navegador o longitud de arrays.
- No insertar un segundo movimiento para representar el DUPLICADO.
- No imprimir ni compartir un ticket como confirmado antes de recibir el receipt del servidor.
- No considerar un ticket pausado como reserva de stock salvo que exista una reserva server-side explícita.
- No guardar PIN/contraseña de supervisor en configuración cliente.
- No permitir que una aprobación de crédito sea un booleano enviado desde DevTools.
- No registrar “paga con” como ingreso adicional ni el vuelto como gasto.
- No editar migraciones ya aplicadas.
- No usar `git add .`: actualmente existe una modificación del usuario en `scratch/temp_001_modified.sql` que debe preservarse y excluirse del commit.
- No tocar ni revertir los fixes recientes de reconocimiento de productos en los commits `6078df2`, `87d1342` y `b4fac19`.

## Orden de implementación recomendado

1. Escribir primero el contrato de línea y las pruebas de carrito/API.
2. Crear la migración de venta flexible, fuentes externas y fulfillment con pruebas SQL/RLS.
3. Implementar la RPC v3 transaccional y adaptar `OperationalApi`/carrito.
4. Reactivar Venta Rápida, sin stock, B2B y tiendas locales en UI clásica y móvil.
5. Implementar configuración POS, parser de multiplicador, escaneo directo y foco de mostrador.
6. Implementar tickets en espera server-side y revalidación al retomar.
7. Implementar panel de efectivo/vuelto y salida posventa desde el receipt confirmado.
8. Extender caja con numeración documental, vales/recibos y planilla de cierre.
9. Implementar aprobación server-side de excepción de crédito; mantener bloqueo si no se termina completa.
10. Probar cada épica, tickets mixtos, concurrencia, permisos, impresión y regresiones.
11. Ejecutar suite completa, build y smoke visual desktop/móvil.
12. Aplicar migraciones en staging/producción sólo con backup y verificación.
13. Actualizar cache-busters y publicar con staging selectivo, excluyendo archivos del usuario.

## Comandos de validación

```powershell
npm.cmd test
npm.cmd run build
node --test tests/pos-express-and-mixed-payment.test.mjs
node --test tests/vender-producto-internal-catalog.test.mjs
node --test tests/pos-transaction-phase11b.test.mjs
node --test tests/operational-core-v2.test.mjs
git diff --check
git status --short
```

Antes de este handoff, la última suite completa ejecutada tenía **301/301 pruebas aprobadas**. No aceptar una reducción silenciosa de cobertura ni borrar pruebas para obtener verde.

## Definición de terminado

El trabajo se considera terminado sólo cuando:

- Venta Rápida funciona en móvil y escritorio y confirma en Supabase.
- Un artículo sin stock puede venderse explícitamente por encargo sin stock negativo.
- B2B y tiendas locales aparecen en la búsqueda POS y pueden agregarse al ticket.
- Tickets mixtos confirman de forma atómica.
- Cada línea conserva origen, precio, entrega y proveedor.
- Los pendientes tienen seguimiento operativo, no sólo una etiqueta visual.
- En PC, el escaneo exacto agrega directamente, reconoce multiplicadores y conserva el foco.
- El cobro en efectivo calcula vuelto correctamente sin alterar la contabilidad.
- En móvil se pueden pausar y retomar tickets sin crear ventas ni reservas ficticias.
- Las acciones posventa usan exclusivamente un receipt confirmado.
- Ingresos, gastos y retiros emiten un único documento numerado con ORIGINAL/DUPLICADO.
- El cierre genera una planilla conciliada desde datos centrales y conserva revisión/firma.
- La excepción de cuenta corriente requiere aprobación server-side, de un solo uso y auditada.
- Inventario, caja, pagos y cuenta corriente mantienen las garantías existentes.
- La suite completa, build, pruebas de migración y smoke visual pasan.
- Se probó contra una base real que RLS, grants y RPC funcionan con JWT de VENDEDOR.
- Se actualizó el cache-buster y se verificó el sitio publicado con recarga forzada.

## Instrucción directa para la otra IA

Trabajá sobre el repositorio real y completá este plan por épicas verificables, sin intentar resolverlo con un único parche visual. Primero inspeccioná el estado actual y verificá que `012` siga libre. Diseñá el contrato, agregá migraciones/RPC, actualizá carrito y `OperationalApi`, conectá ambas interfaces y escribí pruebas. Después incorporá velocidad de mostrador, tickets en espera, vuelto, salidas posventa y documentos de caja sobre receipts confirmados. Preservá los cambios ajenos del worktree. Si una decisión de negocio menor no está definida, usá las reglas de este documento; preguntá únicamente si la elección cambia dinero, deuda o alcance de datos de forma material.
