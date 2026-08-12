/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — MOTOR DE ROLLBACK Y VERSIONADO MIGRACIONES
   ========================================================================== */

const MIGRATION_VERSIONS_CACHE = [];

class MigrationRollbackEngine {
  createVersionSnapshot(jobId, tenantId, rowsToImport, currentCatalog = []) {
    const snapshotBefore = [];
    const snapshotAfter = [];

    rowsToImport.forEach(row => {
      const targetId = row.normalized_data.product_code || row.matched_product_id;
      const existingProduct = currentCatalog.find(p => p.product_code === targetId || p.id === targetId);

      if (existingProduct) {
        snapshotBefore.push({ action: 'UPDATE', product_code: targetId, data: { ...existingProduct } });
        snapshotAfter.push({ action: 'UPDATE', product_code: targetId, data: { ...existingProduct, ...row.normalized_data } });
      } else {
        snapshotBefore.push({ action: 'CREATE', product_code: targetId, data: null });
        snapshotAfter.push({ action: 'CREATE', product_code: targetId, data: { ...row.normalized_data } });
      }
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

  // Ejecuta un rollback atómico restaurando el snapshot exacto previo a la migración
  executeRollback(versionId, tenantId, catalogState = []) {
    const version = MIGRATION_VERSIONS_CACHE.find(v => v.id === versionId && v.tenant_id === tenantId);
    if (!version) {
      return { success: false, error: 'Versión de migración no encontrada o no autorizada' };
    }

    if (version.status === 'ROLLED_BACK') {
      return { success: false, error: 'Esta migración ya ha sido revertida anteriormente.' };
    }

    const restoredCatalog = [...catalogState];
    const beforeList = version.snapshot_before;

    beforeList.forEach(item => {
      if (item.action === 'CREATE') {
        // Eliminar el registro que fue creado por esta migración
        const idx = restoredCatalog.findIndex(p => p.product_code === item.product_code);
        if (idx !== -1) restoredCatalog.splice(idx, 1);
      } else if (item.action === 'UPDATE' && item.data) {
        // Restaurar los datos exactos que existían antes de la migración
        const idx = restoredCatalog.findIndex(p => p.product_code === item.product_code);
        if (idx !== -1) restoredCatalog[idx] = { ...item.data };
      }
    });

    version.status = 'ROLLED_BACK';
    console.log(`[MigrationRollback] Rollback ejecutado con éxito para la versión ${versionId} (Tenant ${tenantId})`);
    return { success: true, restoredCatalog, version };
  }
}

const MigrationRollback = new MigrationRollbackEngine();

if (typeof window !== 'undefined') {
  window.MigrationRollback = MigrationRollback;
  window.MIGRATION_VERSIONS_CACHE = MIGRATION_VERSIONS_CACHE;
}
if (typeof global !== 'undefined') {
  global.MigrationRollback = MigrationRollback;
  global.MIGRATION_VERSIONS_CACHE = MIGRATION_VERSIONS_CACHE;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MigrationRollback, MIGRATION_VERSIONS_CACHE };
}
