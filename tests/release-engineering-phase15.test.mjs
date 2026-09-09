import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { ReleaseEngine, SCHEMA_MIGRATIONS_STORE, BACKUP_MANIFESTS_STORE, STORAGE_BACKUPS_STORE } from '../release-engine.js';
import {
  calculateFileSha256,
  validateSchemaForBaseline,
  generatePhysicalPostgresDump,
  restorePhysicalPostgresDump,
  getStorageBackupBoundary,
  runPhysicalStorageBackupAndRestore
} from '../scripts/db-pg-dump-restore-real.mjs';

test('1. Environment Separation & Validation: Entornos válidos e invalidez de entorno ambiguo', () => {
  const localEnv = ReleaseEngine.validateEnvironmentConfig('LOCAL');
  assert.equal(localEnv.environment, 'LOCAL');
  assert.equal(localEnv.isLocal, true);

  const prodEnv = ReleaseEngine.validateEnvironmentConfig('PRODUCTION');
  assert.equal(prodEnv.environment, 'PRODUCTION');
  assert.equal(prodEnv.isProduction, true);

  assert.throws(() => {
    ReleaseEngine.validateEnvironmentConfig('INVALID_ENV_NAME');
  }, /🔒 Entorno no válido o ambiguo/);
});

test('2. Release Manifest Generator: Retorna versión, commit, tag y timestamp sin secretos', () => {
  const manifest = ReleaseEngine.getReleaseManifest();
  assert.notEqual(manifest.app_version, undefined);
  assert.notEqual(manifest.git_commit, undefined);
  assert.notEqual(manifest.git_tag, undefined);
  assert.notEqual(manifest.schema_version, undefined);
  assert.equal(manifest.git_tag, 'saas-v11-release-engineering-certified');
});

test('3. Baseline Adoption & Schema Migrations: DB preexistente adopta 001 sin recrear tablas e inmutabilidad de checksum', () => {
  SCHEMA_MIGRATIONS_STORE.length = 0;

  // Baseline adoption para DB preexistente
  const baseline = ReleaseEngine.adoptSchemaBaseline('001', 'initial_schema_baseline', 'sha256-baseline-001', {
    existingTables: ['tenants', 'tenant_users', 'sales', 'inventory_ledger', 'admin_activity_log', 'operational_alerts'],
    existingRpcs: ['rpc_sale_pos_direct_saas', 'rpc_process_sale_checkout_saas', 'get_inventory_availability']
  });
  assert.equal(baseline.adopted, true);
  assert.equal(SCHEMA_MIGRATIONS_STORE.length, 1);

  // Intentar adoptar baseline en DB incompatible (faltan tablas/RPCs)
  assert.throws(() => {
    ReleaseEngine.adoptSchemaBaseline('001-fake', 'initial_schema_baseline', 'sha256-baseline-001', {
      existingTables: ['tenants'], // Faltan ventas, ledger, etc.
      existingRpcs: []
    });
  }, /🔒 BASELINE ADOPTION DENIED/);

  const mig2 = { version: '002', name: 'add_schema_migrations', checksum: 'sha256-002', backward_compatible: true };
  const res2 = ReleaseEngine.applyMigration(mig2);
  assert.equal(res2.applied, true);
  assert.equal(SCHEMA_MIGRATIONS_STORE.length, 2);

  // Intento de alteración de checksum en migración histórica
  const tamperedMig = { version: '001', name: 'initial_schema', checksum: 'sha256-TAMPERED', backward_compatible: true };
  assert.throws(() => {
    ReleaseEngine.applyMigration(tamperedMig);
  }, /🔒 ALERTA DE INTEGRIDAD/);
});

test('4. Baseline Validation Hardening: Rechazo de baseline si data type o schema es incompatible (Prueba 5)', () => {
  const invalidTypeCheck = validateSchemaForBaseline(
    ['tenants', 'tenant_users', 'sales', 'inventory_ledger', 'admin_activity_log', 'operational_alerts'],
    ['rpc_sale_pos_direct_saas', 'rpc_process_sale_checkout_saas', 'get_inventory_availability'],
    { tenants: { id_type: 'INTEGER' } } // Incompatible! Expected UUID/VARCHAR
  );

  assert.equal(invalidTypeCheck.allowed, false);
  assert.equal(invalidTypeCheck.reason.includes('Data type mismatch for tenants.id'), true);
});

test('5. Real Physical SQL Migration SHA-256 Crypto Hash Verification', () => {
  const mig1Path = path.resolve('scripts', 'migrations', '001_initial_schema_baseline.sql');
  const hash1 = calculateFileSha256(mig1Path);
  assert.equal(typeof hash1, 'string');
  assert.equal(hash1.length, 64); // Valid 64-char SHA-256 hex string

  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'boeweb-migration-hash-'));
  const tempPath = path.join(tempDirectory, 'temp_001_modified.sql');
  fs.writeFileSync(tempPath, fs.readFileSync(mig1Path, 'utf8') + '\n-- ALTERED BYTE', 'utf8');

  const modifiedHash = calculateFileSha256(tempPath);
  assert.notEqual(hash1, modifiedHash);
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

test('6. pg_dump y pg_restore reciben URLs explícitas sin exponer secretos en argumentos, logs o manifiestos', async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'boeweb-pg-tools-'));
  const dumpPath = path.join(tempDirectory, 'isolated-test.dump');
  const sourceUrl = 'postgresql://backup_user:SOURCE_SECRET@source.example.test:6543/source_db?sslmode=require';
  const destinationUrl = 'postgresql://restore_user:DEST_SECRET@destination.example.test:6543/restore_db?sslmode=require';
  const calls = [];
  const logs = [];
  const logger = { info(message) { logs.push(message); } };
  const runner = async invocation => {
    calls.push(invocation);
    if (invocation.command === 'pg_dump-test') {
      const outputIndex = invocation.args.indexOf('--file');
      fs.writeFileSync(invocation.args[outputIndex + 1], Buffer.from('PGDMP\u0000test fixture'));
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  };

  try {
    const dumpResult = await generatePhysicalPostgresDump({
      sourceDatabaseUrl: sourceUrl,
      outputFile: dumpPath,
      pgDumpPath: 'pg_dump-test',
      runner,
      logger
    });
    assert.equal(fs.existsSync(dumpResult.dump_file_path), true);
    assert.equal(dumpResult.file_size_bytes > 0, true);
    assert.equal(dumpResult.sha256.length, 64);

    const manifestText = fs.readFileSync(dumpResult.manifest_file_path, 'utf8');
    assert.doesNotMatch(manifestText, /SOURCE_SECRET|postgresql:\/\//);
    assert.equal(JSON.parse(manifestText).includes_storage_object_bytes, false);

    const restoreResult = await restorePhysicalPostgresDump({
      dumpFilePath: dumpResult.dump_file_path,
      manifestFilePath: dumpResult.manifest_file_path,
      destinationDatabaseUrl: destinationUrl,
      pgRestorePath: 'pg_restore-test',
      runner,
      logger,
      allowDestructive: true,
      clean: true
    });
    assert.equal(restoreResult.restored, true);
    assert.equal(restoreResult.destination.database, 'restore_db');

    assert.equal(calls[0].command, 'pg_dump-test');
    assert.equal(calls[0].env.PGPASSWORD, 'SOURCE_SECRET');
    assert.equal(calls[1].command, 'pg_restore-test');
    assert.equal(calls[1].env.PGPASSWORD, 'DEST_SECRET');
    assert.match(calls[1].args.join(' '), /--clean --if-exists/);

    const publicEvidence = JSON.stringify({
      logs,
      results: [dumpResult, restoreResult],
      args: calls.map(call => call.args)
    });
    assert.doesNotMatch(publicEvidence, /SOURCE_SECRET|DEST_SECRET|postgresql:\/\//);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test('7. El restore exige destino aislado, confirmación destructiva e integridad del dump', async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'boeweb-pg-guards-'));
  const dumpPath = path.join(tempDirectory, 'guard-test.dump');
  fs.writeFileSync(dumpPath, Buffer.from('PGDMP\u0000guard fixture'));
  const checksum = calculateFileSha256(dumpPath);
  const sourceUrl = 'postgresql://user:SOURCE@same.example.test/source_db';

  try {
    await assert.rejects(
      restorePhysicalPostgresDump({
        dumpFilePath: dumpPath,
        sourceDatabaseUrl: sourceUrl,
        destinationDatabaseUrl: 'postgresql://other:DEST@same.example.test/source_db',
        expectedSha256: checksum,
        allowDestructive: true,
        runner: async () => ({ exitCode: 0 })
      }),
      /misma base de datos/
    );

    await assert.rejects(
      restorePhysicalPostgresDump({
        dumpFilePath: dumpPath,
        sourceDatabaseUrl: sourceUrl,
        destinationDatabaseUrl: 'postgresql://other:DEST@isolated.example.test/restore_db',
        expectedSha256: checksum,
        runner: async () => ({ exitCode: 0 })
      }),
      /allowDestructive=true/
    );

    await assert.rejects(
      restorePhysicalPostgresDump({
        dumpFilePath: dumpPath,
        sourceDatabaseUrl: sourceUrl,
        destinationDatabaseUrl: 'postgresql://other:DEST@isolated.example.test/restore_db',
        expectedSha256: '0'.repeat(64),
        allowDestructive: true,
        runner: async () => ({ exitCode: 0 })
      }),
      /SHA-256/
    );
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test('7b. Storage queda fuera del dump PostgreSQL y no se certifica con fixtures locales', () => {
  const boundary = getStorageBackupBoundary();
  assert.equal(boundary.included_in_postgres_dump, false);
  assert.match(boundary.required_process, /descargar cada objeto/i);
  assert.throws(() => runPhysicalStorageBackupAndRestore(), /no simula ni certifica/i);
});

test('8. Disclosure de Supabase Auth Recovery: Desacoplamiento explícito de public.tenant_users y auth.users (Prueba 3)', () => {
  const report = ReleaseEngine.getAuthRecoveryReport();
  assert.equal(report.public_tenant_users_backup, true);
  assert.equal(report.auth_users_recoverable_by_public_dump, false);
  assert.equal(report.provider_backup_required, true);
});

test('9. Maintenance Mode: Bloqueo server-side para roles no autorizados', () => {
  ReleaseEngine.setMaintenanceMode(true, 'Actualización de esquema DB', ['SUPERADMIN']);

  const vendorCheck = ReleaseEngine.checkMaintenanceMode('VENDEDOR');
  assert.equal(vendorCheck.allowed, false);
  assert.equal(vendorCheck.error.includes('🔒 SERVICIO EN MANTENIMIENTO PROGRAMADO'), true);

  const superadminCheck = ReleaseEngine.checkMaintenanceMode('SUPERADMIN');
  assert.equal(superadminCheck.allowed, true);

  ReleaseEngine.setMaintenanceMode(false);
  const normalCheck = ReleaseEngine.checkMaintenanceMode('VENDEDOR');
  assert.equal(normalCheck.allowed, true);
});

test('10. Tenant Feature Flags: Habilitación aislada por tenant', () => {
  const tenantA = '11111111-1111-1111-1111-111111111111';
  const tenantB = '22222222-2222-2222-2222-222222222222';

  assert.equal(ReleaseEngine.isFeatureFlagEnabled('new_pos_flow', tenantA), true);
  assert.equal(ReleaseEngine.isFeatureFlagEnabled('new_pos_flow', tenantB), false);
});

test('11. Client Version Skew Detector: Aviso de desactualización de versión cliente', () => {
  const matching = ReleaseEngine.checkVersionSkew('v1.0.0-saas.15');
  assert.equal(matching.skew, false);

  const outdated = ReleaseEngine.checkVersionSkew('v0.9.0-legacy');
  assert.equal(outdated.skew, true);
  assert.equal(outdated.warning.includes('Nueva versión de plataforma disponible'), true);
});

test('12. Backup Integrity Checksum: Rechazo de archivo de respaldo con byte alterado (Prueba 12)', () => {
  BACKUP_MANIFESTS_STORE.length = 0;
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const sampleStores = { tenantsStore: [{ id: tenantId, name: 'BÔ Grow Club' }] };

  const backup = ReleaseEngine.runDatabaseBackup(tenantId, sampleStores);
  backup.checksum = 'sha256-dump-TAMPERED-BYTE';

  assert.throws(() => {
    ReleaseEngine.verifyBackupChecksum(backup);
  }, /🔒 ALERTA DE INTEGRIDAD DE BACKUP/);
});
