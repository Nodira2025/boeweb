# Revisión del centro de administración

La aplicación es un **sistema de gestión comercial con tienda online**: combina mostrador, caja, inventario y ubicación física, proveedores, pedidos y cuentas de clientes. No hace falta cambiar de base ni rehacerla para centralizar mejor su administración.

## Alcance y comprobaciones

Se revisaron el código, la configuración publicada en Supabase y las pantallas reales de Marca, Catálogo y reglas, y Pagos. No se publicaron nombres, colores, datos bancarios ni otros valores de prueba desde el admin. Las pruebas transaccionales de visibilidad se ejecutaron con reversión completa.

La versión de código preparada para esta entrega pasó **420 pruebas** y la compilación. Se verificaron en navegador el filtro nacional (7.215 ofertas), la consulta de encargo sin agregar al carrito, el enlace al contacto configurado y el logo sobre blanco. La prueba de la base confirmó exclusión de productos privados, rechazo de pedidos públicos de esos productos y respeto de las opciones de catálogo interno/privado. No se ensayaron cobros reales ni apertura/cierre de turnos reales.

La base tenía cuatro proveedores nacionales activos, 7.215 ofertas activas con precio y 995 inactivas. Existían dos cajas independientes, CAJA-PRINCIPAL y CAJA-REPROCAM, pero el selector y el historial del local no las separaban. Había dos productos clasificados como Reprocam.

## Cambios de esta entrega

- El selector, resumen e historial de caja del local excluyen la caja privada. Los movimientos históricos no se trasladan ni se borran.
- El catálogo interno del local y la proyección pública excluyen productos Reprocam. Un control en la base también impide incorporarlos a un pedido público mediante un carrito antiguo o una petición manual.
- La tienda lee las ofertas activas mediante una vista pública sin costos, contactos ni metadatos privados del proveedor. La carga recorre páginas para no quedar limitada a los primeros 1.000 productos.
- El filtro nacional distingue proveedores reales de productos propios agotados. No suma disponibilidad externa al stock físico del local.
- Los productos externos se muestran como **consulta de encargo**: precio publicado y días hábiles estimados, a confirmar con la tienda. No se integraron al cobro automático ni se crean pedidos centrales al abrir WhatsApp. El cliente todavía debe enviar la consulta y el equipo debe gestionarla.
- Se retiró la sección de asesores de ejemplo y se agregó el crédito de desarrollo PULSO sobre blanco. El acceso del equipo al portal se conserva.

## Qué ya puede administrarse

| Área | Controles actuales | Límite real |
| --- | --- | --- |
| Identidad | Nombre, eslogan, logo, colores, tipografías, términos y contactos | Todavía hay textos y enlaces fijos en varias secciones. Cambiar el rubro no transforma todos los contenidos. |
| Catálogo | Unificado / sólo interno / deshabilitado; público / miembros / privado; agotados y pedidos sin stock | “Sólo miembros” oculta la tienda pública, pero no crea por sí solo un catálogo exclusivo para miembros. |
| Operación | Límites de descuentos, clientes para crédito, tolerancia de caja | Hay reglas obligatorias que no conviene convertir en interruptores: trazabilidad, pertenencia a empresa y consistencia de saldos. |
| Mostrador | Escaneo directo, billetes rápidos, ventas en espera y duplicados | Son preferencias del mostrador, no configuración completa de cada caja. |
| Pagos | Activación y datos públicos de Mercado Pago y transferencia | Activar una casilla no demuestra que credenciales, notificaciones y conciliación del servidor funcionen. No se probó ningún cobro real. |

## Mejoras recomendadas, en orden

1. **Publicación global confiable — corrección implementada.** Supabase prevalece sobre revisiones locales infladas; las respuestas tardías no pisan una confirmación más reciente. Admin carga todas las secciones desde la misma publicación y guarda sólo si la revisión central sigue siendo la que se abrió. Si otro administrador publicó, conserva el formulario y ofrece descartar explícitamente los cambios para cargar la versión actual. Publicar ya no modifica el borrador como paso previo. La base ya tiene historial en `tenant_configurations`; siguen pendientes una pantalla de comparación y restauración. Es necesario recargar las pestañas antiguas para usar el guardado protegido.
2. **Portada y contenido del sitio.** Un editor único para encabezado, descripción, contacto, enlaces, pie y secciones visibles, con vista previa móvil/escritorio. El video guardado durante la revisión era un enlace de YouTube y el reproductor actual usa un elemento de video para archivos directos; por eso falla. Validar el tipo de recurso y ofrecer integración explícita de YouTube, o pedir MP4/WebM. Revisar también la carga de imágenes de banners: no depender de contenido embebido en la configuración.
3. **Proveedores y publicación comercial.** Administrar visibilidad por proveedor/categoría, precio de venta, margen, plazo estimado, fecha de actualización y datos vencidos. Vista previa antes de publicar una importación. Conservar separados stock propio y disponibilidad del proveedor. La carga pública ya recorre páginas; para crecer conviene búsqueda y filtros del lado del servidor en vez de descargar todo al iniciar.
4. **Encargos con seguimiento.** Para que los nacionales entren al carrito y a Pedidos hace falta extender el contrato del pedido web, su precio autoritativo y la contabilización: producto/oferta de origen, confirmación del proveedor, plazo acordado, seña o pago, compra al proveedor, recepción y entrega. El cobro actual busca productos propios; mostrar una oferta no la vuelve cobrable. Empezaría por presupuesto/encargo pendiente de aprobación humana.
5. **Cajas y sucursales.** Un listado administrativo de cajas, su área y ubicación, quién puede abrirlas, turno actual, cierres y diferencias. La caja general debe mostrar claramente el área seleccionada. Si se desea un informe consolidado, debe ser una vista explícita, no una mezcla implícita de cajas.
6. **Estado operativo verificable.** Un panel con última sincronización, conexión a base, publicación vigente, prueba de medios de pago sin cobrar, avisos de error y respaldos con restauración ensayada. Mostrar “configurado”, “verificado” y “con error” como estados diferentes.
7. **Créditos y avisos, en una etapa posterior.** Límite y condiciones por cliente, cuotas, vencimientos, saldo y pagos identificables; luego plantillas y consentimiento para recordatorios. Definir las condiciones comerciales y revisar el encuadre correspondiente antes de ofrecer un producto llamado tarjeta de crédito.

## Detalles que no conviene prometer como globales todavía

- El umbral de stock bajo existe en admin, pero la tienda aún usa cinco unidades en varios contadores y etiquetas.
- La moneda editable no convierte automáticamente precios, caja ni importes externos; las ofertas externas existentes se presentan en ARS.
- Los textos de cultivo, enlaces de contacto y módulos como pacientes/club siguen teniendo partes fijas. Un selector de rubro no equivale a activar/desactivar módulos completos.
- Los métodos de pago requieren comprobación integral. Esta revisión no creó pagos, créditos, ventas ni mensajes a clientes.

## Diseño y recurso gráfico

Se siguió la guía de diseño del proyecto para contraste, controles táctiles e integración sin ventanas intrusivas nuevas. El logo utilizado está en `assets/pulso-developer-logo.png`; es una versión sobre blanco del adjunto, preparada con la herramienta integrada de imágenes. Instrucción de edición: cambiar únicamente el fondo negro a blanco, conservar símbolo, proporciones, colores y los textos “PULSO” y “Transformar procesos para crecer”.

La recomendación es consolidar **Configuración general** con identidad/contenido, proveedores/catálogo, cajas, usuarios/permisos, pagos y estado del sistema. Con la corrección de publicación implementada, el próximo paso es contenido global; después, el flujo completo de encargos nacionales.

## Verificación de la corrección de publicación

El paquete específico de esta corrección pasó **433 pruebas** y la compilación, aislado de los cambios pendientes de otras tareas.

Se probaron lecturas simultáneas y fuera de orden, publicaciones concurrentes, creación inicial, borradores independientes, caché llena/bloqueada, funcionamiento sin conexión y aislamiento de empresa. Se comprobó el flujo de conflicto → conservación del formulario → recarga explícita → guardado correcto en un panel local con datos simulados, y se revisó visualmente el aviso a 395 px sin desbordamiento horizontal. No se publicaron configuraciones de prueba en la tienda real ni se cambió la estructura de Supabase. Las pantallas visibles consultan la publicación cada minuto y al volver a la pestaña; sin conexión pueden mostrar la última copia disponible, pero el admin exige lectura central antes de habilitar la edición.
