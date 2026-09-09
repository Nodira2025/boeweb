# Política de backups y restauración

## Alcance real

El respaldo PostgreSQL se genera con `pg_dump` en formato custom. Incluye únicamente los esquemas y objetos que el usuario de conexión puede leer. No se considera válido un archivo construido desde fixtures, objetos JavaScript o datos de ejemplo.

Cada ejecución correcta produce:

- un archivo `.dump` creado por `pg_dump`;
- un manifiesto `.manifest.json` con tamaño, SHA-256, identidad no secreta del origen y marcas de tiempo;
- una salida de consola que no contiene la URL ni la contraseña.

El script no obtiene una URL por defecto ni conoce producción. La URL de origen debe suministrarse explícitamente mediante el nombre de una variable de entorno:

```powershell
node scripts/db-pg-dump-restore-real.mjs backup `
  --source-url-env BOE_BACKUP_SOURCE_URL `
  --output D:\backups\boeweb-2026-09-09.dump
```

`BOE_BACKUP_SOURCE_URL` debe cargarse mediante el gestor de secretos del entorno. No escribir la URL en el comando, documentación, CI logs ni archivos versionados.

## Restauración

Toda restauración requiere una URL de destino explícita, el dump, su manifiesto o SHA-256 y la confirmación `--confirm-restore`. El script bloquea un destino cuya combinación host, puerto y base coincide con el origen registrado.

```powershell
node scripts/db-pg-dump-restore-real.mjs restore `
  --destination-url-env BOE_RESTORE_DESTINATION_URL `
  --dump D:\backups\boeweb-2026-09-09.dump `
  --manifest D:\backups\boeweb-2026-09-09.dump.manifest.json `
  --confirm-restore
```

Usar `--clean` sólo contra una base aislada que pueda perder sus objetos actuales. La restauración ejecuta `pg_restore`; no modifica la base de origen.

## Límites de Supabase Storage y Auth

`pg_dump` no descarga los bytes almacenados en Supabase Storage. Los objetos deben respaldarse con otro proceso que:

1. inventarie buckets y rutas;
2. descargue cada objeto con una credencial de servicio protegida;
3. registre tamaño y SHA-256;
4. vuelva a cargarlo en un proyecto Storage aislado;
5. descargue una muestra o el conjunto completo y compare hashes.

La tabla de metadatos de Storage, cuando sea accesible, no sustituye los archivos. Este repositorio aún no contiene una herramienta que automatice y certifique ese proceso.

Tampoco se debe asumir que un dump lógico recupera toda la identidad administrada por el proveedor. La recuperación de Supabase Auth debe seguir el mecanismo soportado por el proveedor y probarse por separado.

## Retención y evidencia

La retención concreta debe configurarse en infraestructura y quedar registrada fuera del repositorio. Una ejecución sólo cuenta como evidencia cuando conserva el dump, manifiesto, checksum, versión de `pg_dump`, destino aislado usado para la prueba y resultados de validación posteriores. Las pruebas unitarias con un ejecutor falso verifican el contrato del script, pero no demuestran que una base o bucket reales hayan sido respaldados.
