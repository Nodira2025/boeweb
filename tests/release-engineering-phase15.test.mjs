import test from 'node:test';
import assert from 'node:assert/strict';
import { ReleaseEngine, SCHEMA_MIGRATIONS_STORE, BACKUP_MANIFESTS_STORE } from '../release-engine.js';

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

test('3. Schema Migrations: Aplicación idempotente y detección de checksum alterado', () => {
  SCHEMA_MIGRATIONS_STORE.length = 0;

  const mig1 = { version: '001', name: 'initial_schema', checksum: 'sha256-001', backward_compatible: true };
  const res1 = ReleaseEngine.applyMigration(mig1);
  assert.equal(res1.applied, true);
  assert.equal(SCHEMA_MIGRATIONS_STORE.length, 1);

  // Re-aplicación idempotente con el mismo checksum
  const resIdempotent = ReleaseEngine.applyMigration(mig1);
  assert.equal(resIdempotent.applied, false);
  assert.equal(resIdempotent.idempotent, true);

  // Intento de alteración de checksum en migración histórica
  const tamperedMig = { version: '001', name: 'initial_schema', checksum: 'sha256-TAMPERED', backward_compatible: true };
  assert.throws(() => {
    ReleaseEngine.applyMigration(tamperedMig);
  }, /🔒 ALERTA DE INTEGRIDAD/);
});

test('4. Release Preflight Check: Preflight exitoso y bloqueo ante fallas críticas', () => {
  const cleanPreflight = ReleaseEngine.runReleasePreflight({ gitClean: true, testsPassing: true, dbConnected: true, secretsPresent: true });
  assert.equal(cleanPreflight.status, 'PREFLIGHT_SUCCESS');

  const blockedPreflight = ReleaseEngine.runReleasePreflight({ gitClean: false, testsPassing: true, dbConnected: true, secretsPresent: true });
  assert.equal(blockedPreflight.status, 'DEPLOY_BLOCKED');
  assert.equal(blockedPreflight.failed_checks.includes('GIT_STATUS_CLEAN'), true);
});

test('5. Database Backup & Restore Drill: Respaldos lógicos y prueba de restauración aislada', () => {
  BACKUP_MANIFESTS_STORE.length = 0;
  const tenantId = '11111111-1111-1111-1111-111111111111';

  const sampleStores = {
    tenantsStore: [{ id: tenantId, name: 'BÔ Grow Club' }],
    productsStore: [{ id: 'P01', tenant_id: tenantId, name: 'Sustrato GrowMix 80L', price: 12000 }],
    salesStore: [{ id: 'S01', tenant_id: tenantId, total: 12000 }]
  };

  const backupManifest = ReleaseEngine.runDatabaseBackup(tenantId, sampleStores);
  assert.notEqual(backupManifest.backup_id, undefined);
  assert.equal(backupManifest.tables_count, 7);

  // Restore Drill en entorno aislado
  const targetIsolatedStores = {};
  const restoreResult = ReleaseEngine.runRestoreDrill(backupManifest.backup_id, targetIsolatedStores);

  assert.equal(restoreResult.status, 'RESTORE_SUCCESS');
  assert.equal(restoreResult.consistent, true);
  assert.equal(targetIsolatedStores.productsStore.length, 1);
  assert.equal(targetIsolatedStores.productsStore[0].name, 'Sustrato GrowMix 80L');
});

test('6. Maintenance Mode: Bloqueo server-side para roles no autorizados', () => {
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

test('7. Tenant Feature Flags: Habilitación aislada por tenant', () => {
  const tenantA = '11111111-1111-1111-1111-111111111111';
  const tenantB = '22222222-2222-2222-2222-222222222222';

  assert.equal(ReleaseEngine.isFeatureFlagEnabled('new_pos_flow', tenantA), true);
  assert.equal(ReleaseEngine.isFeatureFlagEnabled('new_pos_flow', tenantB), false);
});

test('8. Client Version Skew Detector: Aviso de desactualización de versión cliente', () => {
  const matching = ReleaseEngine.checkVersionSkew('v1.0.0-saas.15');
  assert.equal(matching.skew, false);

  const outdated = ReleaseEngine.checkVersionSkew('v0.9.0-legacy');
  assert.equal(outdated.skew, true);
  assert.equal(outdated.warning.includes('Nueva versión de plataforma disponible'), true);
});
