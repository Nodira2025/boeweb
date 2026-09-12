# Ubicación masiva: corrección del guardado central

## Problema y alcance

El asistente todavía invocaba `saveLocalProductLocation`, una ruta bloqueada que no persistía datos. Para productos aprobados podía crear una ubicación vacía sin trasladar existencias. El atajo de sector ocultaba errores y podía anunciar un guardado inexistente. El lote también podía copiar la cantidad del primer producto a los demás borradores.

Ahora los borradores se ubican mediante `locate_catalog_product_draft_v2`; las existencias se mueven mediante `transfer_inventory_v2`. La cantidad proviene de la base central y no se modifica el total. Un destino existente se reutiliza sin sobrescribir sus propiedades. No se agregaron permisos ni migraciones.

Los lotes se procesan secuencialmente, no como una única transacción: se detienen al primer error, muestran resultados parciales y conservan las claves de reintento mientras permanece abierto ese asistente. Las posiciones ya confirmadas no se repiten. No se promete reanudación persistente después de cerrar o recargar la página.

El refinamiento del mapa limita el origen al sector seleccionado. Si el origen es ambiguo, hay reservas o se quiere repartir una cantidad, debe utilizarse Traslados WMS. Ubicar no es un ingreso ni un ajuste de stock.

## Verificación

- 469 pruebas aprobadas sobre una copia exacta de los archivos seleccionados para esta publicación, independiente de otros trabajos locales.
- Compilación estática y comprobación sintáctica del módulo aprobadas.
- Prueba visual local con el código real del asistente y datos simulados: fallo en el segundo de tres productos, resultado 1/3, reintento 3/3, cantidades 3/4/5 conservadas y sólo cuatro llamadas en total.
- Casos cubiertos: respuesta perdida después de un traslado, doble clic, cambio de sesión, reservas, múltiples orígenes, sector incorrecto, destino inactivo, fallos de actualización de vistas e identidad de borradores del mapa.
- No se efectuaron escrituras de prueba sobre inventario de producción.

## Revisión automática y deuda anterior

La revisión GGA confirmó que el módulo nuevo usa funciones enfocadas y manejo centralizado de errores. Bloqueó el archivo monolítico `vendedor.js` por deuda existente en la base `9e71aa5`: accesibilidad de controles antiguos, promesas en navegación y portapapeles, funciones extensas y comentarios faltantes. Se contrastaron los señalamientos con esa revisión anterior; no constituyen regresiones de este cambio.

Se revisó el cambio acotado y se publicó con una excepción del hook para este commit, sin modificar su configuración permanente. La revisión general de esos controles sigue pendiente. Otros cambios locales de perfiles, créditos, exportaciones y ordenamiento por nombre no forman parte de esta corrección.
