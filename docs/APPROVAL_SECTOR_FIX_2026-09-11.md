# Aprobación múltiple y sectores por nombre

La cola enviaba ubicaciones de tipo SECTOR que la operación central rechazaba. Además, el lote contabilizaba como aprobados los intentos fallidos y recargaba la lista entre productos, perdiendo valores editados.

El arreglo normaliza las ubicaciones, conserva las cantidades editadas, impide duplicados y muestra los resultados reales. La herramienta de sectores clasifica por nombre y usa operaciones WMS auditadas para trasladar existencias sin alterar cantidades ni precios. Conserva reservas y deja los nombres ambiguos para revisión.

Validación: 476 pruebas aprobadas y compilación estática correcta. Incluye reintento idempotente después de una respuesta perdida, cambios de sesión, reservas e inventario privado.

La publicación integra la corrección de ubicación manual f9e04c6. No incluye los demás trabajos locales pendientes.

## Excepción autorizada

La revisión automática GGA rechazó la publicación por reglas generales del AGENTS.md y hallazgos del archivo anterior, fuera del alcance del arreglo. El usuario autorizó explícitamente una excepción para publicar este cambio y ejecutar la reubicación por nombre. La excepción se aplica sólo al comando de este commit; no modifica la configuración permanente del hook.
