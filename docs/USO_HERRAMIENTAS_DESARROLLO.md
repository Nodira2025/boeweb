# Cómo usamos las herramientas en boeweb

1. Abrimos una rama por cambio y un pull request hacia main. Revisamos el diff, los permisos y el comportamiento del módulo tocado antes de fusionar. Linear Diffs puede servir como interfaz de revisión; el PR de GitHub conserva el registro del cambio y los resultados.
2. Playwright recorre portada y carrito en escritorio y móvil. Si falla un paso, abrimos el artefacto de GitHub Actions o repetimos npm run test:ui. Las capturas de Argos muestran diferencias visuales: aprobar sólo cambios intencionales y corregir los accidentales. Hace falta una primera referencia de main para comparar PR posteriores.
3. k6 corre contra el sitio efímero de CI: exige menos de 1 % de errores y p95 menor a 1000 ms. Una optimización debe mejorar el resultado sin relajar los umbrales. Este smoke no mide checkout, base de datos ni capacidad de producción; esos escenarios requieren un entorno de ensayo y datos de prueba.
4. Gitleaks examina secretos nuevos; Trivy y OSV revisan dependencias; Semgrep busca patrones de código. Si hay un hallazgo, comprobamos la ruta y el riesgo antes de corregir o documentar una excepción. Un secreto expuesto se revoca en el proveedor: quitar el texto no lo invalida.
5. Sentry registra errores de la portada con detalles privados eliminados. Una incidencia real se convierte en un caso reproducible, se agrega una prueba, se corrige en un PR y se verifica tras publicar. El flujo local n8n consulta Sentry cada 15 minutos cuando la PC está encendida; su alta de propietario y la credencial deben completarse antes de activarlo.
6. Renovate define grupos de actualización sin fusión automática. Su archivo requiere instalar la app o un runner con acceso autorizado para que aparezcan PR reales.

## Comandos

```powershell
npm.cmd ci
npx.cmd playwright install chromium --only-shell
npm.cmd run check
npm.cmd run build
npm.cmd run test:ui
# Con el sitio local iniciado en otra terminal:
npm.cmd run test:load:local
```

## Criterio de fusión

Recorrido correcto, cambios visuales revisados, umbrales de carga cumplidos, hallazgos de seguridad resueltos o evaluados y revisión humana del diff. Después de fusionar se verifica la versión servida y se observan sus incidencias en Sentry. Un CI verde no prueba una transferencia real ni una migración de base.

## Alcance de este cambio

Integra calidad sobre la versión que existe en origin/main. La portada local del checkout original tiene otros cambios pendientes; sus textos y su control de edad requieren actualizar los recorridos en el PR que los publique. No se mezclan en esta integración.
