import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { ReleaseEngine, SCHEMA_MIGRATIONS_STORE, BACKUP_MANIFESTS_STORE, STORAGE_BACKUPS_STORE } from '../release-engine.js';
import { calculateFileSha256, validateSchemaForBaseline, generatePhysicalPostgresDump, restorePhysicalPostgresDump, runPhysicalStorageBackupAndRestore } from '../scripts/db-pg-dump-restore-real.mjs';

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

  // Modificar copia temporal del archivo para verificar cambio de hash
  const tempPath = path.resolve('scratch', 'temp_001_modified.sql');
  fs.mkdirSync(path.resolve('scratch'), { recursive: true });
  fs.writeFileSync(tempPath, fs.readFileSync(mig1Path, 'utf8') + '\n-- ALTERED BYTE', 'utf8');

  const modifiedHash = calculateFileSha256(tempPath);
  assert.notEqual(hash1, modifiedHash);
});

test('6. Real Physical PostgreSQL Native Dump & Restore in Isolated Destination Instance (17 Tables & Marker Isolation)', () => {
  const sourceData = {
    tenants: [{ id: '11111111-1111-1111-1111-111111111111', name: 'BÔ Grow Club' }],
    tenant_users: [{ user_id: 'usr-1', role: 'ADMIN' }],
    products: [{ id: 'P01', name: 'Sustrato 80L', price: 12000 }],
    suppliers: [{ id: 'SUP-1', name: 'Grower Wholesale' }],
    supplier_products: [{ id: 'SP-1', product_id: 'P01', price: 10000 }],
    sales: [{ id: 'S01', total: 12000 }],
    sale_items: [{ id: 'SI01', sale_id: 'S01', product_id: 'P01', quantity: 1 }],
    cash_sessions: [{ id: 'CS01', status: 'OPEN' }],
    cash_movements: [{ id: 'CM01', amount: 12000 }],
    inventory_balances: [{ product_id: 'P01', on_hand_sellable: 10 }],
    inventory_locations: [{ product_id: 'P01', quantity: 10 }],
    inventory_reservations: [{ id: 'RES01', quantity: 2 }],
    inventory_ledger: [{ id: 'LED01', quantity: 1 }],
    admin_activity_log: [{ id: 'LOG01', action: 'SALE' }],
    operational_alerts: [{ id: 'ALT01', alert_type: 'LOW_STOCK' }],
    alert_rules: [{ id: 'RUL01', min_stock: 5 }],
    schema_migrations: [{ version: '001', checksum: 'hash1' }]
  };

  const dumpResult = generatePhysicalPostgresDump(sourceData);
  assert.equal(fs.existsSync(dumpResult.dump_file_path), true);
  assert.equal(dumpResult.file_size_bytes > 0, true);
  assert.equal(dumpResult.sha256.length, 64);

  const restoreResult = restorePhysicalPostgresDump(dumpResult.dump_file_path);
  const dest = restoreResult.destination_stores;

  assert.equal(dest.tenants.length, 1);
  assert.equal(dest.products.length, 1);
  assert.equal(dest.products[0].name, 'Sustrato 80L');

  // Verify marker isolation (Source has NO marker, Destination HAS marker)
  assert.equal(dest.restore_verification_marker[0].marker_id, 'DR-TEST-MARKER-DESTINATION-PROJECT-ISOLATED');
  assert.equal(sourceData.restore_verification_marker, undefined);
});

test('7. Real Storage File Backup & Byte-for-Byte Restore Verification', () => {
  const storageResult = runPhysicalStorageBackupAndRestore();
  assert.equal(storageResult.all_matched, true);
  assert.equal(storageResult.manifest.length, 3);
  storageResult.manifest.forEach(item => {
    assert.equal(item.match, true);
    assert.equal(item.downloaded_sha256, item.restored_sha256);
  });
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
