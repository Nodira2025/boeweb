import test from 'node:test';
import assert from 'node:assert/strict';
import { ReleaseEngine, SCHEMA_MIGRATIONS_STORE, BACKUP_MANIFESTS_STORE, STORAGE_BACKUPS_STORE } from '../release-engine.js';

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
  const baseline = ReleaseEngine.adoptSchemaBaseline('001', 'initial_schema_baseline', 'sha256-baseline-001');
  assert.equal(baseline.adopted, true);
  assert.equal(SCHEMA_MIGRATIONS_STORE.length, 1);

  // Intentar re-adoptar
  const reAdopt = ReleaseEngine.adoptSchemaBaseline('001', 'initial_schema_baseline', 'sha256-baseline-001');
  assert.equal(reAdopt.adopted, false);

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

test('4. Release Preflight Check: Preflight exitoso y bloqueo ante fallas críticas', () => {
  const cleanPreflight = ReleaseEngine.runReleasePreflight({ gitClean: true, testsPassing: true, dbConnected: true, secretsPresent: true });
  assert.equal(cleanPreflight.status, 'PREFLIGHT_SUCCESS');

  const blockedPreflight = ReleaseEngine.runReleasePreflight({ gitClean: false, testsPassing: true, dbConnected: true, secretsPresent: true });
  assert.equal(blockedPreflight.status, 'DEPLOY_BLOCKED');
  assert.equal(blockedPreflight.failed_checks.includes('GIT_STATUS_CLEAN'), true);
});

test('5. Database Backup & Restore Drill: Respaldos lógicos reales en 17 tablas y prueba de restauración aislada', () => {
  BACKUP_MANIFESTS_STORE.length = 0;
  const tenantId = '11111111-1111-1111-1111-111111111111';

  const sampleStores = {
    tenantsStore: [{ id: tenantId, name: 'BÔ Grow Club' }],
    tenantUsersStore: [{ user_id: 'usr-1', tenant_id: tenantId, role: 'ADMIN' }],
    productsStore: [{ id: 'P01', tenant_id: tenantId, name: 'Sustrato GrowMix 80L', price: 12000 }],
    suppliersStore: [{ id: 'SUP-01', name: 'AstroGrow' }],
    supplierProductsStore: [{ id: 'SP-01', tenant_id: tenantId, product_id: 'P01', price: 10000 }],
    salesStore: [{ id: 'S01', tenant_id: tenantId, total: 12000 }],
    saleItemsStore: [{ id: 'SI01', tenant_id: tenantId, sale_id: 'S01', product_id: 'P01', quantity: 1, unit_price: 12000 }],
    cashSessionsStore: [{ id: 'CS01', tenant_id: tenantId, status: 'OPEN' }],
    cashMovementsStore: [{ id: 'CM01', tenant_id: tenantId, amount: 12000 }],
    balancesStore: [{ tenant_id: tenantId, product_id: 'P01', on_hand_sellable: 10 }],
    locationsStore: [{ tenant_id: tenantId, product_id: 'P01', quantity: 10 }],
    reservationsStore: [{ id: 'RES01', tenant_id: tenantId, quantity: 2 }],
    ledgerStore: [{ id: 'LED01', tenant_id: tenantId, event_type: 'SALE_POS_DIRECT', quantity: 1 }],
    auditLogStore: [{ id: 'LOG01', tenant_id: tenantId, action: 'SALE' }],
    alertsStore: [{ id: 'ALT01', tenant_id: tenantId, alert_type: 'LOW_STOCK' }],
    rulesStore: [{ id: 'RUL01', tenant_id: tenantId, min_stock: 5 }]
  };

  const backupManifest = ReleaseEngine.runDatabaseBackup(tenantId, sampleStores);
  assert.notEqual(backupManifest.backup_id, undefined);
  assert.equal(backupManifest.tables_count, 17);

  // Restore Drill en entorno aislado
  const targetIsolatedStores = {};
  const restoreResult = ReleaseEngine.runRestoreDrill(backupManifest.backup_id, targetIsolatedStores);

  assert.equal(restoreResult.status, 'RESTORE_SUCCESS');
  assert.equal(restoreResult.tables_restored, 17);
  assert.equal(restoreResult.consistent, true);
  assert.equal(targetIsolatedStores.productsStore.length, 1);
  assert.equal(targetIsolatedStores.productsStore[0].name, 'Sustrato GrowMix 80L');
});

test('6. Backup Integrity Checksum: Rechazo de archivo de respaldo con byte alterado (Prueba 12)', () => {
  BACKUP_MANIFESTS_STORE.length = 0;
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const sampleStores = { tenantsStore: [{ id: tenantId, name: 'BÔ Grow Club' }] };

  const backup = ReleaseEngine.runDatabaseBackup(tenantId, sampleStores);
  backup.checksum = 'sha256-dump-TAMPERED-BYTE';

  assert.throws(() => {
    ReleaseEngine.verifyBackupChecksum(backup);
  }, /🔒 ALERTA DE INTEGRIDAD DE BACKUP/);
});

test('7. Storage Backup & Restore Drill: Manifiesto de objetos, checksums y restauración aislada (Prueba 2)', () => {
  STORAGE_BACKUPS_STORE.length = 0;
  const tenantId = '11111111-1111-1111-1111-111111111111';

  const mockObjects = [
    { path: `${tenantId}/logos/logo-boeweb.png`, tenant_id: tenantId, mime_type: 'image/png', size_bytes: 45000, checksum: 'sha-logo-1' },
    { path: `${tenantId}/products/prod-80l.jpg`, tenant_id: tenantId, mime_type: 'image/jpeg', size_bytes: 120000, checksum: 'sha-prod-1' }
  ];

  const backupManifest = ReleaseEngine.runStorageBackup(tenantId, mockObjects);
  assert.equal(backupManifest.objects_count, 2);

  const restoredObjects = [];
  const restoreResult = ReleaseEngine.runStorageRestore(backupManifest.storage_backup_id, restoredObjects);

  assert.equal(restoreResult.status, 'STORAGE_RESTORE_SUCCESS');
  assert.equal(restoredObjects.length, 2);
  assert.equal(restoredObjects[0].path, `${tenantId}/logos/logo-boeweb.png`);
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
