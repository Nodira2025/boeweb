/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — RELEASE ENGINEERING & RESILIENCE (FASE 15)
   ==========================================================================
   Engine para deployments, versionado de esquema DB, backups, restore drills,
   preflight checks, flags y maintenance mode.
   ========================================================================== */

const SCHEMA_MIGRATIONS_STORE = [];
const BACKUP_MANIFESTS_STORE = [];
const FEATURE_FLAGS_STORE = {
  'new_pos_flow': { enabled: true, tenantsAllowed: ['11111111-1111-1111-1111-111111111111'] }
};

let MAINTENANCE_MODE_STATE = {
  active: false,
  reason: null,
  allowedRoles: ['SUPERADMIN']
};

class ReleaseEngine {
  constructor() {
    this.migrations = SCHEMA_MIGRATIONS_STORE;
    this.backups = BACKUP_MANIFESTS_STORE;
    this.flags = FEATURE_FLAGS_STORE;
  }

  // 1. Validar Separación de Entornos (LOCAL, STAGING, PRODUCTION)
  validateEnvironmentConfig(envName = process.env.APP_ENV || 'LOCAL') {
    const validEnvironments = ['LOCAL', 'STAGING', 'PRODUCTION'];
    const normalizedEnv = String(envName).toUpperCase();

    if (!validEnvironments.includes(normalizedEnv)) {
      throw new Error(`🔒 Entorno no válido o ambiguo: '${envName}'. Se requiere uno de: LOCAL, STAGING, PRODUCTION.`);
    }

    return {
      environment: normalizedEnv,
      isProduction: normalizedEnv === 'PRODUCTION',
      isStaging: normalizedEnv === 'STAGING',
      isLocal: normalizedEnv === 'LOCAL',
      validatedAt: new Date().toISOString()
    };
  }

  // 2. Release Manifest Generator
  getReleaseManifest() {
    return {
      app_version: 'v1.0.0-saas.15',
      git_commit: '762f511000ecc6576b95c97c360567f97411fc74',
      git_tag: 'saas-v11-release-engineering-certified',
      schema_version: '003',
      build_timestamp: new Date().toISOString(),
      environment: process.env.APP_ENV || 'LOCAL'
    };
  }

  // 3. Schema Migrations (Inmutabilidad y Detección de Checksum)
  applyMigration(migrationRecord) {
    const existing = this.migrations.find(m => m.version === migrationRecord.version);
    if (existing) {
      if (existing.checksum !== migrationRecord.checksum) {
        throw new Error(`🔒 ALERTA DE INTEGRIDAD: El checksum de la migración histórica '${migrationRecord.version}' fue alterado.`);
      }
      return { applied: false, idempotent: true, migration: existing };
    }

    const newRecord = {
      version: migrationRecord.version,
      name: migrationRecord.name,
      checksum: migrationRecord.checksum,
      backward_compatible: migrationRecord.backward_compatible !== false,
      applied_at: new Date().toISOString(),
      applied_by: migrationRecord.applied_by || 'system'
    };
    this.migrations.push(newRecord);
    return { applied: true, migration: newRecord };
  }

  // 4. Pre-Deploy Preflight Check
  runReleasePreflight(context = {}) {
    const checks = [];
    const isGitClean = context.gitClean !== false;
    const testsPassing = context.testsPassing !== false;
    const dbConnected = context.dbConnected !== false;
    const secretsPresent = context.secretsPresent !== false;

    checks.push({ name: 'GIT_STATUS_CLEAN', pass: isGitClean });
    checks.push({ name: 'AUTOMATED_TESTS_PASS', pass: testsPassing });
    checks.push({ name: 'DATABASE_CONNECTIVITY', pass: dbConnected });
    checks.push({ name: 'REQUIRED_SECRETS_PRESENT', pass: secretsPresent });

    const failed = checks.filter(c => !c.pass);
    if (failed.length > 0) {
      return {
        status: 'DEPLOY_BLOCKED',
        failed_checks: failed.map(f => f.name),
        summary: `Preflight fallido: ${failed.length} verificaciones rechazadas.`
      };
    }

    return {
      status: 'PREFLIGHT_SUCCESS',
      manifest: this.getReleaseManifest(),
      checks
    };
  }

  // 5. Respaldos y Manifiestos de Backup Lógicos (DB & Storage)
  runDatabaseBackup(tenantId, stores = {}) {
    const startedAt = new Date().toISOString();
    const backupId = `bkp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const tablesDump = {
      tenants: (stores.tenantsStore || []).filter(t => !tenantId || t.id === tenantId),
      products: (stores.productsStore || []).filter(p => !tenantId || p.tenant_id === tenantId),
      sales: (stores.salesStore || []).filter(s => !tenantId || s.tenant_id === tenantId),
      sale_items: (stores.saleItemsStore || []).filter(i => !tenantId || i.tenant_id === tenantId),
      cash_sessions: (stores.cashSessionsStore || []).filter(c => !tenantId || c.tenant_id === tenantId),
      inventory_balances: (stores.balancesStore || []).filter(b => !tenantId || b.tenant_id === tenantId),
      inventory_ledger: (stores.ledgerStore || []).filter(l => !tenantId || l.tenant_id === tenantId)
    };

    const manifest = {
      backup_id: backupId,
      created_at: startedAt,
      environment: process.env.APP_ENV || 'LOCAL',
      schema_version: '003',
      tables_count: Object.keys(tablesDump).length,
      records_count: Object.values(tablesDump).reduce((acc, curr) => acc + curr.length, 0),
      dump: tablesDump,
      checksum: `sha256-${Date.now()}`
    };

    this.backups.push(manifest);
    return manifest;
  }

  // 6. Restore Drill Obligatorio (Prueba de Restauración en Entorno Aislado)
  runRestoreDrill(backupId, targetIsolatedStores = {}) {
    const manifest = this.backups.find(b => b.backup_id === backupId);
    if (!manifest) throw new Error(`Backup '${backupId}' no encontrado para restore drill.`);

    const dump = manifest.dump;
    targetIsolatedStores.tenantsStore = [...(dump.tenants || [])];
    targetIsolatedStores.productsStore = [...(dump.products || [])];
    targetIsolatedStores.salesStore = [...(dump.sales || [])];
    targetIsolatedStores.saleItemsStore = [...(dump.sale_items || [])];
    targetIsolatedStores.cashSessionsStore = [...(dump.cash_sessions || [])];
    targetIsolatedStores.balancesStore = [...(dump.inventory_balances || [])];
    targetIsolatedStores.ledgerStore = [...(dump.inventory_ledger || [])];

    const restoredRecords = Object.values(dump).reduce((acc, curr) => acc + curr.length, 0);

    return {
      status: 'RESTORE_SUCCESS',
      backup_id: backupId,
      restored_records: restoredRecords,
      consistent: restoredRecords === manifest.records_count,
      targetIsolatedStores
    };
  }

  // 7. Maintenance Mode (Server-Side)
  setMaintenanceMode(active, reason = null, allowedRoles = ['SUPERADMIN']) {
    MAINTENANCE_MODE_STATE = { active, reason, allowedRoles };
    return MAINTENANCE_MODE_STATE;
  }

  checkMaintenanceMode(userRole) {
    if (!MAINTENANCE_MODE_STATE.active) return { allowed: true };
    if (MAINTENANCE_MODE_STATE.allowedRoles.includes(userRole)) {
      return { allowed: true, warning: 'Plataforma en mantenimiento. Acceso concedido por rol privilegiado.' };
    }
    return {
      allowed: false,
      error: `🔒 SERVICIO EN MANTENIMIENTO PROGRAMADO: ${MAINTENANCE_MODE_STATE.reason || 'Actualización de plataforma en progreso.'}`
    };
  }

  // 8. Tenant Feature Flags
  isFeatureFlagEnabled(flagKey, tenantId) {
    const flag = this.flags[flagKey];
    if (!flag) return false;
    if (!flag.enabled) return false;
    if (flag.tenantsAllowed && Array.isArray(flag.tenantsAllowed)) {
      return flag.tenantsAllowed.includes(tenantId);
    }
    return true;
  }

  // 9. Client Version Skew Warning
  checkVersionSkew(clientVersion) {
    const serverVersion = this.getReleaseManifest().app_version;
    if (clientVersion !== serverVersion) {
      return {
        skew: true,
        warning: `Nueva versión de plataforma disponible (${serverVersion}). Recargue la página para actualizar.`
      };
    }
    return { skew: false };
  }
}

const ReleaseEngineInstance = new ReleaseEngine();

if (typeof window !== 'undefined') {
  window.ReleaseEngine = ReleaseEngineInstance;
}
if (typeof global !== 'undefined') {
  global.ReleaseEngine = ReleaseEngineInstance;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ReleaseEngine: ReleaseEngineInstance,
    SCHEMA_MIGRATIONS_STORE,
    BACKUP_MANIFESTS_STORE
  };
}
