/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — UI WIZARD & MIGRATION CENTER CONTROLLER
   ========================================================================== */

const MIGRATION_JOBS_CACHE = [];

class MigrationCenterUI {
  constructor() {
    this.currentStep = 1;
    this.activeJob = null;
    this.parsedRawRows = [];
    this.columnMappings = [];
    this.stagedRows = [];
  }

  initWizard(tenantId, createdBy) {
    this.currentStep = 1;
    this.activeJob = {
      id: `job-${Date.now()}`,
      tenant_id: tenantId || '11111111-1111-1111-1111-111111111111',
      type: 'CATALOG_INTERNAL',
      status: 'UPLOADED',
      created_by: createdBy || 'Profesor Franco',
      vertical_code: typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext().vertical_code || 'growshop' : 'growshop',
      total_rows: 0,
      valid_rows: 0,
      warning_rows: 0,
      error_rows: 0,
      created_at: new Date().toISOString()
    };
    this.parsedRawRows = [];
    this.columnMappings = [];
    this.stagedRows = [];
  }

  loadSourceContent(content, sourceType = 'FILE_CSV', filename = 'catalogo.csv') {
    const aiEngine = typeof MigrationAI !== 'undefined' ? MigrationAI : (typeof global !== 'undefined' ? global.MigrationAI : null);
    if (!aiEngine) return;
    this.parsedRawRows = aiEngine.parseRawSource(content, sourceType);
    this.activeJob.total_rows = this.parsedRawRows.length;
    this.activeJob.status = 'READY_FOR_MAPPING';

    const headers = Object.keys(this.parsedRawRows[0] || {});
    this.columnMappings = aiEngine.suggestColumnMappings(headers, this.activeJob.vertical_code);
    return { totalRows: this.parsedRawRows.length, headers, mappings: this.columnMappings };
  }

  processStagingValidation(existingCatalog = []) {
    const aiEngine = typeof MigrationAI !== 'undefined' ? MigrationAI : (typeof global !== 'undefined' ? global.MigrationAI : null);
    if (!aiEngine) return;
    this.stagedRows = [];
    let validCount = 0;
    let warningCount = 0;
    let errorCount = 0;

    this.parsedRawRows.forEach((rawRow, idx) => {
      const norm = aiEngine.normalizeRow(rawRow, this.columnMappings, this.activeJob.vertical_code);
      const dup = aiEngine.detectDuplicates(norm.normalized_data, existingCatalog);

      let action = 'CREATE';
      let status = norm.validation_status;

      if (dup.isDuplicate) {
        action = 'UPDATE';
        status = 'DUPLICATE';
      }

      if (status === 'VALID') validCount++;
      else if (status === 'WARNING' || status === 'DUPLICATE') warningCount++;
      else errorCount++;

      this.stagedRows.push({
        id: `row-${idx + 1}`,
        job_id: this.activeJob.id,
        row_number: idx + 1,
        raw_data: rawRow,
        normalized_data: norm.normalized_data,
        validation_status: status,
        confidence: norm.confidence,
        action,
        matched_product_id: dup.matchedId,
        error_messages: norm.errors
      });
    });

    this.activeJob.valid_rows = validCount;
    this.activeJob.warning_rows = warningCount;
    this.activeJob.error_rows = errorCount;
    this.activeJob.status = errorCount > 0 ? 'HAS_ERRORS' : 'READY_FOR_REVIEW';

    return {
      total: this.parsedRawRows.length,
      valid: validCount,
      warning: warningCount,
      error: errorCount,
      stagedRows: this.stagedRows
    };
  }

  approveAndExecuteImport(catalogTarget = []) {
    if ((!this.stagedRows || this.stagedRows.length === 0) && this.parsedRawRows && this.parsedRawRows.length > 0) {
      this.processStagingValidation(catalogTarget);
    }

    if (!this.stagedRows || this.stagedRows.length === 0) {
      return { success: false, error: 'No hay filas en Staging para importar.' };
    }

    const currentCatalog = [...catalogTarget];
    
    // 1. Guardar Snapshot para Rollback Atómico antes de tocar producción
    let versionRecord = null;
    const rollbackEngine = typeof MigrationRollback !== 'undefined' ? MigrationRollback : (typeof global !== 'undefined' ? global.MigrationRollback : null);
    if (rollbackEngine) {
      versionRecord = rollbackEngine.createVersionSnapshot(
        this.activeJob.id, 
        this.activeJob.tenant_id, 
        this.stagedRows, 
        currentCatalog
      );
    }

    // 2. Aplicar importación en catálogo objetivo
    const createdList = [];
    const updatedList = [];

    this.stagedRows.forEach(staged => {
      if (staged.action === 'IGNORE') return;
      const data = staged.normalized_data;

      if (staged.action === 'UPDATE' && staged.matched_product_id) {
        const idx = currentCatalog.findIndex(p => p.product_code === staged.matched_product_id || p.id === staged.matched_product_id);
        if (idx !== -1) {
          currentCatalog[idx] = { ...currentCatalog[idx], ...data };
          updatedList.push(data);
        }
      } else {
        currentCatalog.push(data);
        createdList.push(data);
      }
    });

    this.activeJob.status = 'COMPLETED';
    this.activeJob.completed_at = new Date().toISOString();
    this.activeJob.version_id = versionRecord ? versionRecord.id : null;
    MIGRATION_JOBS_CACHE.push({ ...this.activeJob });

    return {
      success: true,
      createdCount: createdList.length,
      updatedCount: updatedList.length,
      catalogResult: currentCatalog,
      versionId: this.activeJob.version_id
    };
  }
}

const MigrationCenter = new MigrationCenterUI();

if (typeof window !== 'undefined') {
  window.MigrationCenter = MigrationCenter;
  window.MIGRATION_JOBS_CACHE = MIGRATION_JOBS_CACHE;
}
if (typeof global !== 'undefined') {
  global.MigrationCenter = MigrationCenter;
  global.MIGRATION_JOBS_CACHE = MIGRATION_JOBS_CACHE;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MigrationCenter, MIGRATION_JOBS_CACHE };
}
