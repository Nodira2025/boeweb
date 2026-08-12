/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — MOTOR DE ROLLBACK Y LEDGER DE ACCIONES
   ========================================================================== */

const MIGRATION_VERSIONS_CACHE = [];
const MIGRATION_ACTIONS_LEDGER = [];

class MigrationRollbackEngine {
  createVersionSnapshot(jobId, tenantId, rowsToImport, currentCatalog = [], entityType = 'PRODUCT') {
    const snapshotBefore = [];
    const snapshotAfter = [];

    rowsToImport.forEach(row => {
      const targetId = row.normalized_data.product_code || row.matched_product_id || row.normalized_data.barcode;
      const existingProduct = currentCatalog.find(p => p.product_code === targetId || p.id === targetId || p.barcode === targetId);

      const actionType = existingProduct ? 'UPDATE' : 'CREATE';
      const beforeVal = existingProduct ? { ...existingProduct } : null;
      const afterVal = existingProduct ? { ...existingProduct, ...row.normalized_data } : { ...row.normalized_data };

      snapshotBefore.push({ action: actionType, product_code: targetId, data: beforeVal });
      snapshotAfter.push({ action: actionType, product_code: targetId, data: afterVal });

      // Registrar entrada granular en el Ledger de Acciones (MIGRATION_ACTIONS)
      MIGRATION_ACTIONS_LEDGER.push({
        id: `act-${Date.now()}-${Math.floor(Math.random()*1000)}`,
        job_id: jobId,
        tenant_id: tenantId,
        entity_type: entityType,
        entity_id: targetId,
        action: actionType,
        before_data: beforeVal,
        after_data: afterVal,
        executed_at: new Date().toISOString()
      });
    });

    const versionRecord = {
      id: `ver-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      job_id: jobId,
      tenant_id: tenantId,
      snapshot_before: snapshotBefore,
      snapshot_after: snapshotAfter,
      created_at: new Date().toISOString(),
      status: 'ACTIVE'
    };

    MIGRATION_VERSIONS_CACHE.push(versionRecord);
    return versionRecord;
  }

  // Ejecuta un rollback atómico granular restaurando únicamente las acciones de esta migración
  executeRollback(versionId, tenantId, catalogState = []) {
    const version = MIGRATION_VERSIONS_CACHE.find(v => v.id === versionId && v.tenant_id === tenantId);
    if (!version) {
      return { success: false, error: 'Versión de migración no encontrada o no autorizada' };
    }

    if (version.status === 'ROLLED_BACK') {
      return { success: false, error: 'Esta migración ya ha sido revertida anteriormente.' };
    }

    const restoredCatalog = [...catalogState];
    const actionsForJob = MIGRATION_ACTIONS_LEDGER.filter(a => a.job_id === version.job_id && a.tenant_id === tenantId);

    // Si existen acciones en el ledger, usar el ledger granular
    if (actionsForJob.length > 0) {
      actionsForJob.forEach(act => {
        if (act.action === 'CREATE') {
          const idx = restoredCatalog.findIndex(p => p.product_code === act.entity_id || p.id === act.entity_id);
          if (idx !== -1) restoredCatalog.splice(idx, 1);
        } else if (act.action === 'UPDATE' && act.before_data) {
          const idx = restoredCatalog.findIndex(p => p.product_code === act.entity_id || p.id === act.entity_id);
          if (idx !== -1) restoredCatalog[idx] = { ...act.before_data };
        }
      });
    } else {
      // Reversión por Snapshot si no hay ledger
      const beforeList = version.snapshot_before;
      beforeList.forEach(item => {
        if (item.action === 'CREATE') {
          const idx = restoredCatalog.findIndex(p => p.product_code === item.product_code);
          if (idx !== -1) restoredCatalog.splice(idx, 1);
        } else if (item.action === 'UPDATE' && item.data) {
          const idx = restoredCatalog.findIndex(p => p.product_code === item.product_code);
          if (idx !== -1) restoredCatalog[idx] = { ...item.data };
        }
      });
    }

    version.status = 'ROLLED_BACK';
    console.log(`[MigrationRollback] Rollback granular ejecutado con éxito para job ${version.job_id} (Tenant ${tenantId})`);
    return { success: true, restoredCatalog, version, rolledBackActionsCount: actionsForJob.length };
  }
}

const MigrationRollback = new MigrationRollbackEngine();

if (typeof window !== 'undefined') {
  window.MigrationRollback = MigrationRollback;
  window.MIGRATION_VERSIONS_CACHE = MIGRATION_VERSIONS_CACHE;
  window.MIGRATION_ACTIONS_LEDGER = MIGRATION_ACTIONS_LEDGER;
}
if (typeof global !== 'undefined') {
  global.MigrationRollback = MigrationRollback;
  global.MIGRATION_VERSIONS_CACHE = MIGRATION_VERSIONS_CACHE;
  global.MIGRATION_ACTIONS_LEDGER = MIGRATION_ACTIONS_LEDGER;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MigrationRollback, MIGRATION_VERSIONS_CACHE, MIGRATION_ACTIONS_LEDGER };
}
