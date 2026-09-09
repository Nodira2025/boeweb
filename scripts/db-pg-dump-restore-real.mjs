import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_DUMPS_DIR = path.resolve('scratch', 'dumps');
const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

export function calculateFileSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

export function validateSchemaForBaseline(existingSchemaTables = [], existingRpcs = [], tableSchemas = {}) {
  const requiredTables = [
    'tenants', 'tenant_users', 'sales',
    'inventory_ledger', 'admin_activity_log', 'operational_alerts'
  ];
  const requiredRpcs = [
    'rpc_sale_pos_direct_saas',
    'rpc_process_sale_checkout_saas',
    'get_inventory_availability'
  ];

  const missingTables = requiredTables.filter(table => !existingSchemaTables.includes(table));
  const missingRpcs = requiredRpcs.filter(rpc => !existingRpcs.includes(rpc));

  if (missingTables.length > 0 || missingRpcs.length > 0) {
    return {
      allowed: false,
      reason: `Estructura incompatible para baseline adoption. Faltan tablas: [${missingTables.join(', ')}], Faltan RPCs: [${missingRpcs.join(', ')}]`
    };
  }

  if (tableSchemas.tenants) {
    const idType = tableSchemas.tenants.id_type;
    if (idType && idType !== 'UUID' && idType !== 'VARCHAR') {
      return {
        allowed: false,
        reason: `🔒 BASELINE DENIED: Data type mismatch for tenants.id (expected UUID/VARCHAR, found ${idType})`
      };
    }
  }

  return { allowed: true };
}

function requireDatabaseUrl(databaseUrl, label) {
  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    throw new Error(`${label} debe ser una URL PostgreSQL explícita.`);
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch (error) {
    throw new Error(`${label} no es una URL PostgreSQL válida.`, { cause: error });
  }

  if (!POSTGRES_PROTOCOLS.has(parsed.protocol) || !parsed.hostname) {
    throw new Error(`${label} debe usar postgres:// o postgresql:// e incluir un host.`);
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!database) throw new Error(`${label} debe incluir el nombre de la base de datos.`);

  return {
    raw: databaseUrl,
    host: parsed.hostname,
    port: parsed.port || '5432',
    database,
    user: decodeURIComponent(parsed.username || ''),
    password: decodeURIComponent(parsed.password || ''),
    sslMode: parsed.searchParams.get('sslmode') || '',
    identity: `${parsed.hostname.toLowerCase()}:${parsed.port || '5432'}/${database}`
  };
}

function databaseIdentitySha256(connection) {
  return crypto.createHash('sha256').update(connection.identity).digest('hex');
}

function redactConnection(connection) {
  return {
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user || null,
    ssl_mode: connection.sslMode || null,
    identity_sha256: databaseIdentitySha256(connection)
  };
}

function buildPostgresEnvironment(connection, inheritedEnvironment = process.env) {
  const environment = {
    ...inheritedEnvironment,
    PGHOST: connection.host,
    PGPORT: connection.port,
    PGDATABASE: connection.database
  };

  if (connection.user) environment.PGUSER = connection.user;
  if (connection.password) environment.PGPASSWORD = connection.password;
  if (connection.sslMode) environment.PGSSLMODE = connection.sslMode;
  return environment;
}

function redactSensitiveText(value, connections = []) {
  let sanitized = String(value || '');
  for (const connection of connections) {
    const secrets = [connection.raw, connection.password, encodeURIComponent(connection.password)]
      .filter(Boolean)
      .sort((left, right) => right.length - left.length);
    for (const secret of secrets) sanitized = sanitized.split(secret).join('[REDACTED]');
  }
  return sanitized;
}

export async function runPostgresCommand({ command, args, env, cwd = process.cwd() }) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', exitCode => resolve({ exitCode, stdout, stderr }));
  });
}

async function invokePostgresTool({ command, args, connection, runner, cwd }) {
  let result;
  try {
    result = await runner({
      command,
      args,
      cwd,
      env: buildPostgresEnvironment(connection)
    });
  } catch (error) {
    const safeMessage = redactSensitiveText(error?.message || error, [connection]);
    throw new Error(`${command} no pudo iniciarse: ${safeMessage}`, { cause: error });
  }

  const exitCode = Number(result?.exitCode ?? result?.code ?? 0);
  if (exitCode !== 0) {
    const safeDetails = redactSensitiveText(result?.stderr || result?.stdout || 'sin detalle', [connection]);
    throw new Error(`${command} terminó con código ${exitCode}: ${safeDetails.trim()}`);
  }
  return result || { exitCode: 0, stdout: '', stderr: '' };
}

function resolveDumpPath(outputFile, outputDirectory) {
  if (outputFile) return path.resolve(outputFile);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.resolve(outputDirectory, `boeweb-${timestamp}.dump`);
}

function writeBackupManifest({ dumpFilePath, sourceConnection, startedAt, finishedAt }) {
  const manifestPath = `${dumpFilePath}.manifest.json`;
  const stats = fs.statSync(dumpFilePath);
  const manifest = {
    format_version: 1,
    created_at: finishedAt,
    source: redactConnection(sourceConnection),
    dump: {
      format: 'pg_dump-custom',
      file_name: path.basename(dumpFilePath),
      size_bytes: stats.size,
      sha256: calculateFileSha256(dumpFilePath)
    },
    started_at: startedAt,
    finished_at: finishedAt,
    includes_storage_object_bytes: false,
    includes_provider_managed_auth_backup: false
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return { manifest, manifestPath };
}

export async function generatePhysicalPostgresDump({
  sourceDatabaseUrl,
  outputFile,
  outputDirectory = DEFAULT_DUMPS_DIR,
  pgDumpPath = 'pg_dump',
  runner = runPostgresCommand,
  logger = console,
  overwrite = false
} = {}) {
  const sourceConnection = requireDatabaseUrl(sourceDatabaseUrl, 'sourceDatabaseUrl');
  const dumpFilePath = resolveDumpPath(outputFile, outputDirectory);
  const manifestPath = `${dumpFilePath}.manifest.json`;
  fs.mkdirSync(path.dirname(dumpFilePath), { recursive: true });

  if (!overwrite && (fs.existsSync(dumpFilePath) || fs.existsSync(manifestPath))) {
    throw new Error(`El destino de backup ya existe: ${dumpFilePath}`);
  }

  const startedAt = new Date().toISOString();
  logger?.info?.(`Iniciando pg_dump de ${sourceConnection.host}/${sourceConnection.database}.`);
  try {
    await invokePostgresTool({
      command: pgDumpPath,
      args: [
        '--format=custom',
        '--compress=9',
        '--no-owner',
        '--no-privileges',
        '--file',
        dumpFilePath
      ],
      connection: sourceConnection,
      runner,
      cwd: process.cwd()
    });

    if (!fs.existsSync(dumpFilePath) || fs.statSync(dumpFilePath).size === 0) {
      throw new Error('pg_dump finalizó sin producir un archivo de respaldo utilizable.');
    }

    if (overwrite && fs.existsSync(manifestPath)) fs.rmSync(manifestPath, { force: true });
    const finishedAt = new Date().toISOString();
    const { manifest } = writeBackupManifest({ dumpFilePath, sourceConnection, startedAt, finishedAt });
    logger?.info?.(`Backup PostgreSQL finalizado: ${path.basename(dumpFilePath)} (${manifest.dump.size_bytes} bytes).`);
    return {
      dump_file_path: dumpFilePath,
      manifest_file_path: manifestPath,
      file_size_bytes: manifest.dump.size_bytes,
      sha256: manifest.dump.sha256,
      source: manifest.source,
      start_time: startedAt,
      end_time: finishedAt,
      duration_ms: Date.parse(finishedAt) - Date.parse(startedAt)
    };
  } catch (error) {
    if (!overwrite && fs.existsSync(dumpFilePath)) fs.rmSync(dumpFilePath, { force: true });
    throw error;
  }
}

function loadBackupManifest(manifestFilePath) {
  if (!manifestFilePath) return null;
  const resolvedPath = path.resolve(manifestFilePath);
  if (!fs.existsSync(resolvedPath)) throw new Error(`No se encontró el manifiesto: ${resolvedPath}`);
  try {
    return JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch (error) {
    throw new Error(`El manifiesto no es JSON válido: ${resolvedPath}`, { cause: error });
  }
}

export async function restorePhysicalPostgresDump({
  dumpFilePath,
  destinationDatabaseUrl,
  sourceDatabaseUrl,
  manifestFilePath,
  expectedSha256,
  pgRestorePath = 'pg_restore',
  runner = runPostgresCommand,
  logger = console,
  allowDestructive = false,
  clean = false
} = {}) {
  if (!allowDestructive) {
    throw new Error('Restore bloqueado: establecé allowDestructive=true después de verificar que el destino sea aislado.');
  }

  const resolvedDumpPath = path.resolve(dumpFilePath || '');
  if (!dumpFilePath || !fs.existsSync(resolvedDumpPath) || !fs.statSync(resolvedDumpPath).isFile()) {
    throw new Error(`No se encontró el dump: ${resolvedDumpPath}`);
  }

  const destinationConnection = requireDatabaseUrl(destinationDatabaseUrl, 'destinationDatabaseUrl');
  const sourceConnection = sourceDatabaseUrl
    ? requireDatabaseUrl(sourceDatabaseUrl, 'sourceDatabaseUrl')
    : null;
  const defaultManifestPath = `${resolvedDumpPath}.manifest.json`;
  const manifest = loadBackupManifest(
    manifestFilePath || (fs.existsSync(defaultManifestPath) ? defaultManifestPath : null)
  );
  const sourceIdentityHash = sourceConnection
    ? databaseIdentitySha256(sourceConnection)
    : manifest?.source?.identity_sha256;

  if (!sourceIdentityHash) {
    throw new Error('Restore bloqueado: indicá sourceDatabaseUrl o un manifiesto con la identidad del origen.');
  }
  if (sourceIdentityHash === databaseIdentitySha256(destinationConnection)) {
    throw new Error('Restore bloqueado: origen y destino apuntan a la misma base de datos.');
  }

  const requiredChecksum = expectedSha256 || manifest?.dump?.sha256;
  if (!requiredChecksum) {
    throw new Error('Restore bloqueado: falta el SHA-256 esperado del dump.');
  }
  const actualChecksum = calculateFileSha256(resolvedDumpPath);
  if (actualChecksum.toLowerCase() !== String(requiredChecksum).toLowerCase()) {
    throw new Error('Restore bloqueado: el SHA-256 del dump no coincide con el manifiesto.');
  }

  const args = [
    '--exit-on-error',
    '--no-owner',
    '--no-privileges',
    '--dbname',
    destinationConnection.database
  ];
  if (clean) args.splice(1, 0, '--clean', '--if-exists');
  args.push(resolvedDumpPath);

  const startedAt = new Date().toISOString();
  logger?.info?.(`Iniciando pg_restore en ${destinationConnection.host}/${destinationConnection.database}.`);
  await invokePostgresTool({
    command: pgRestorePath,
    args,
    connection: destinationConnection,
    runner,
    cwd: process.cwd()
  });
  const finishedAt = new Date().toISOString();
  logger?.info?.(`Restore PostgreSQL finalizado en ${destinationConnection.host}/${destinationConnection.database}.`);

  return {
    restored: true,
    dump_file_path: resolvedDumpPath,
    sha256: actualChecksum,
    destination: redactConnection(destinationConnection),
    clean,
    start_time: startedAt,
    end_time: finishedAt,
    duration_ms: Date.parse(finishedAt) - Date.parse(startedAt)
  };
}

export function getStorageBackupBoundary() {
  return {
    included_in_postgres_dump: false,
    reason: 'pg_dump puede respaldar metadatos de Storage accesibles, pero no descarga los bytes de los objetos.',
    required_process: 'Inventariar buckets, descargar cada objeto con una credencial de servicio, verificar SHA-256 y subirlo a un proyecto Storage aislado mediante una herramienta separada.'
  };
}

export function runPhysicalStorageBackupAndRestore() {
  throw new Error(`${getStorageBackupBoundary().reason} Este script no simula ni certifica un restore de Supabase Storage.`);
}

function parseCliArguments(argv) {
  const [operation, ...tokens] = argv;
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) throw new Error(`Argumento inesperado: ${token}`);
    const key = token.slice(2);
    if (key === 'confirm-restore' || key === 'clean' || key === 'overwrite') {
      options[key] = true;
      continue;
    }
    const value = tokens[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Falta el valor de --${key}.`);
    options[key] = value;
    index += 1;
  }
  return { operation, options };
}

function readExplicitUrlFromEnvironment(options, optionName) {
  const environmentVariable = options[optionName];
  if (!environmentVariable) throw new Error(`Falta --${optionName}.`);
  const value = process.env[environmentVariable];
  if (!value) throw new Error(`La variable ${environmentVariable} no está definida.`);
  return value;
}

export async function main(argv = process.argv.slice(2)) {
  const { operation, options } = parseCliArguments(argv);
  if (operation === 'backup') {
    return await generatePhysicalPostgresDump({
      sourceDatabaseUrl: readExplicitUrlFromEnvironment(options, 'source-url-env'),
      outputFile: options.output,
      pgDumpPath: options['pg-dump-path'] || 'pg_dump',
      overwrite: Boolean(options.overwrite)
    });
  }

  if (operation === 'restore') {
    return await restorePhysicalPostgresDump({
      dumpFilePath: options.dump,
      manifestFilePath: options.manifest,
      sourceDatabaseUrl: options['source-url-env']
        ? readExplicitUrlFromEnvironment(options, 'source-url-env')
        : undefined,
      destinationDatabaseUrl: readExplicitUrlFromEnvironment(options, 'destination-url-env'),
      expectedSha256: options.sha256,
      pgRestorePath: options['pg-restore-path'] || 'pg_restore',
      allowDestructive: Boolean(options['confirm-restore']),
      clean: Boolean(options.clean)
    });
  }

  throw new Error('Uso: backup --source-url-env VARIABLE [--output archivo] | restore --destination-url-env VARIABLE --dump archivo --confirm-restore [--manifest archivo] [--source-url-env VARIABLE] [--clean]');
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch(error => {
    console.error(`Error: ${redactSensitiveText(error?.message || error)}`);
    process.exitCode = 1;
  });
}
