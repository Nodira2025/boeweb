# Monitoreo de producción y servicios locales

## Sentry en la portada actual

El snippet Netlify `boeweb Sentry portada privada v1` está instalado en boeweb (snippet 0). Se inyecta al servir HTML y no requiere reconstruir el despliegue manual actual. Sólo carga Sentry en `/` y `/index.html`; conserva el filtro de detalles privados de `sentry-bootstrap.js`. En otras rutas, incluidas las pantallas operativas, no inicia el SDK por este snippet.

La instalación se verifica con `node quality/install-sentry-snippet.mjs`. Usa una sesión existente de Netlify o `NETLIFY_AUTH_TOKEN`; nunca imprime el token. La operación es idempotente por título. Netlify puede devolver null tras guardar: se vuelve a consultar el registro antes de decidir el resultado.

Verificado: snippet presente en el HTML servido, HTTP 200 y título de la portada actual. La página conserva su acceso por edad. La incidencia sintética local ya se había recibido en Sentry. Falta verificar una incidencia originada en producción; tener el script servido no prueba por sí solo la recepción de un evento.

El despliegue manual `6b09a2403ee0329f7aa2ddcd` permanece fijado (locked) para que main no sustituya cambios productivos que aún no se versionaron. No desbloquear hasta sincronizar y revisar la fuente real de producción.

## Uptime Kuma local

Instalado desde el tag oficial 2.5.12, commit `5aa5dec425f8a955b54e150636979a6927745ec5`, en `C:\Users\Profesor Franco\Desktop\boeweb\scratch\uptime-kuma-runtime`. Dependencias y distribución oficial descargadas; SQLite inicializado. Escucha sólo en `127.0.0.1:3001`.

Abrir http://127.0.0.1:3001 y crear el administrador. Después configurar un monitor HTTP(s), URL `https://bogrowclub.com.ar/`, intervalo 60 segundos, timeout 15 segundos, reintentos 2, estados aceptados 200-299 y aviso de caducidad TLS. No desactivar la validación del certificado. Falta comprobar al menos dos heartbeats correctos; todavía no hay un monitor activo.

Para iniciar manualmente:

```powershell
cd 'C:\Users\Profesor Franco\Desktop\boeweb\scratch\uptime-kuma-runtime'
node server/server.js --host=127.0.0.1 --port=3001
```

Los datos y logs permanecen locales. Con la PC apagada no habrá mediciones. La cuenta de administrador debe completarla el titular; no se generaron contraseñas por él.

## n8n local

El servidor responde en http://127.0.0.1:5678 y tiene publicado el workflow `boewebSentryLocalTriage`, con credencial cifrada y consulta real verificada. Falta el alta de propietario en `/setup` para acceder al editor. El flujo consulta sólo `boeweb-browser`, aunque el alcance de `event:read` del token abarca la organización `tucapacitacion`, autorizado por el titular.

## Fuentes

- https://docs.netlify.com/build/post-processing/snippet-injection/
- https://github.com/louislam/uptime-kuma/releases/tag/2.5.12

## Conexión Sentry–n8n verificada (27/11/2026)

La credencial `Sentry boeweb lectura` ya está importada en el almacén cifrado local de n8n con alcance `event:read`, autorizado para la organización. El archivo temporal restringido se eliminó tras importarlo. La ejecución CLI terminó en `Resumir incidencias nuevas` con `success` y devolvió `BOEWEB-BROWSER-1`, nivel error, recuento 1. Evidencia sanitizada: `scratch/n8n-runtime/sentry-verified.json` en el checkout original.

El workflow `boewebSentryLocalTriage` está publicado (`active=true`) y el servidor reiniciado carga un workflow publicado. Tiene inicio manual para diagnóstico y programación cada 15 minutos. La consulta no modifica Sentry ni envía mensajes. El alta de propietario local sigue pendiente para poder usar el editor. Una ejecución programada se inició; todavía falta confirmar un ciclo programado completo después del reinicio.

Los archivos versionados de `automation/n8n/` generan e importan este flujo. `connect-sentry-local.cjs` usa la instalación existente en `scratch/n8n-runtime/`, verifica la consulta y publica el workflow; reimporta el ID fijo, por lo que sólo debe ejecutarse durante la instalación o una actualización controlada. Exportar antes cualquier edición propia del flujo.

Argos ya tiene instalado su GitHub App únicamente en `Nodira2025/boeweb` y el proyecto muestra ese repositorio conectado. Renovate está instalado únicamente en boeweb; su panel Mend pide aceptar los términos antes de finalizar el alta, con autorización del titular pendiente.
