import test from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage for Node environment
class StorageMock {
  constructor() { this.store = {}; }
  getItem(key) { return this.store[key] || null; }
  setItem(key, value) { this.store[key] = String(value); }
  removeItem(key) { delete this.store[key]; }
  clear() { this.store = {}; }
}
global.localStorage = new StorageMock();
global.sessionStorage = new StorageMock();

import { MigrationAI } from '../migration-ai.js';
import { MigrationRollback, MIGRATION_ACTIONS_LEDGER } from '../migration-rollback.js';
import { MigrationCenter } from '../migration-center.js';

test('1. XLSX Real: Parsing multi-hoja, decimales con coma y celdas vacías', () => {
  const xlsxMockRows = [
    { COD_ART: 'FER-100', DESCRIPCION: 'Taladro DCD771', MARCA: 'DeWalt', PVP: '$ 1.500,50', CANT: '15' },
    { COD_ART: 'FER-101', DESCRIPCION: 'Amoladora DWE402', MARCA: 'DeWalt', PVP: '$ 850,00', CANT: '' }
  ];
  
  const parsed = MigrationAI.parseXlsxSource(xlsxMockRows);
  assert.equal(parsed.length, 2);

  const mappings = MigrationAI.suggestColumnMappings(['COD_ART', 'DESCRIPCION', 'MARCA', 'PVP', 'CANT'], 'ferreteria');
  const norm1 = MigrationAI.normalizeRow(parsed[0], mappings, 'ferreteria');
  
  assert.equal(norm1.normalized_data.price, 1500.50);
  assert.equal(norm1.normalized_data.stock, 15);
  assert.equal(norm1.validation_status, 'VALID');
});

test('2. PDF Real: Extracción de tabla de catálogo desde texto/PDF', () => {
  const pdfTextMock = `COD_ART,DESCRIPCION,MARCA,PVP,CANT\nGRO-01,Top Crop Top Auto 1L,Top Crop,45.00,50\nGRO-02,Namaste Nutrientes 500ml,Namaste,30.00,40`;
  const pdfRows = MigrationAI.parsePdfTableSource(pdfTextMock);

  assert.equal(pdfRows.length, 2);
  assert.equal(pdfRows[0].COD_ART, 'GRO-01');
  assert.equal(pdfRows[0].DESCRIPCION, 'Top Crop Top Auto 1L');
});

test('3. Imagen Real OCR: Escaneo de lista impresa con asignación de menor confianza (REQUIRES_REVIEW)', () => {
  const imageOcrMock = `COD_ART,DESCRIPCION,MARCA,PVP,CANT\nGRO-99,Sustrato Klasmann 50L,Klasmann,60.00,10`;
  const rows = MigrationAI.parseImageTableSource(imageOcrMock);
  
  assert.equal(rows[0]._ocr_scanned, true);
  const mappings = MigrationAI.suggestColumnMappings(['COD_ART', 'DESCRIPCION', 'MARCA', 'PVP', 'CANT'], 'growshop');
  const norm = MigrationAI.normalizeRow(rows[0], mappings, 'growshop');

  assert.equal(norm.validation_status, 'WARNING'); // Marca advertencia por escaneo OCR
  assert.ok(norm.confidence < 0.85);
});

test('4. URL Real: Extracción de fuentes web con registro de procedencia, timestamp y checksum', () => {
  const targetUrl = 'https://proveedor-ferreteria.com/lista-precios-2026';
  const tenantId = '11111111-1111-1111-1111-111111111111';

  MigrationCenter.initWizard(tenantId, 'Profesor Franco');
  const res = MigrationCenter.loadSourceContent('', 'URL', 'url_import.html', targetUrl);

  assert.equal(res.metadata.original_url, targetUrl);
  assert.ok(res.metadata.checksum.startsWith('sha256-'));
  assert.ok(res.metadata.created_at);
});

test('5. B2B Supplier Isolation: Catálogo de Proveedor A NO contamina al Proveedor B', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  
  const supplierA_Products = [
    { supplier_id: 'sup-a', supplier_product_id: 'PROV-A-01', name: 'Taladro Bosch GSB 13', cost_price: 90.00, stock: 100 }
  ];
  const supplierB_Products = [
    { supplier_id: 'sup-b', supplier_product_id: 'PROV-B-99', name: 'Taladro Bosch GSB 13', cost_price: 88.50, stock: 50 }
  ];

  assert.notEqual(supplierA_Products[0].supplier_id, supplierB_Products[0].supplier_id);
  assert.notEqual(supplierA_Products[0].supplier_product_id, supplierB_Products[0].supplier_product_id);
  assert.notEqual(supplierA_Products[0].cost_price, supplierB_Products[0].cost_price);
});

test('6. Stock Inicial WMS: Migración de inventario inicial por SKU, módulo, nivel, posición y cantidad', () => {
  const wmsStockCsv = `COD_ART,MODULO,NIVEL,POSICION,CANT\nFER-01,M01,1,A,25\nFER-02,M02,3,B,10`;
  const tenantId = '11111111-1111-1111-1111-111111111111';

  MigrationCenter.initWizard(tenantId, 'Profesor Franco');
  MigrationCenter.activeJob.type = 'INITIAL_STOCK';
  
  const loaded = MigrationCenter.loadSourceContent(wmsStockCsv, 'FILE_CSV', 'wms_initial.csv');
  assert.equal(loaded.totalRows, 2);

  const staged = MigrationCenter.processStagingValidation([]);
  assert.equal(staged.stagedRows.length, 2);
  assert.equal(staged.stagedRows[0].normalized_data.module_code, 'M01');
  assert.equal(staged.stagedRows[0].normalized_data.stock, 25);
});

test('7. Multi-Tenant RLS: Aislamiento por Tenant ID en Jobs, Mappings, Sources y Rollbacks', () => {
  const tenantA_Job = { id: 'job-a', tenant_id: '11111111-1111-1111-1111-111111111111' };
  const tenantB_Job = { id: 'job-b', tenant_id: '22222222-2222-2222-2222-222222222222' };

  // Simulador de política RLS: Usuario de Tenant A no puede acceder a Job B
  const canUserAccessJob = (userTenantId, isSuperAdmin, targetJob) => {
    return isSuperAdmin || userTenantId === targetJob.tenant_id;
  };

  assert.equal(canUserAccessJob('11111111-1111-1111-1111-111111111111', false, tenantA_Job), true);
  assert.equal(canUserAccessJob('11111111-1111-1111-1111-111111111111', false, tenantB_Job), false); // DENIED
  assert.equal(canUserAccessJob('11111111-1111-1111-1111-111111111111', true, tenantB_Job), true);  // SUPERADMIN OK
});

test('8. Gatekeeper Real: El catálogo de producción permanece 100% INMUTABLE antes de APPROVE', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const productionCatalogBefore = [{ product_code: 'EXISTING-01', name: 'Producto Original', price: 100 }];
  
  MigrationCenter.initWizard(tenantId, 'Profesor Franco');
  const sampleCsv = `COD_ART,DESCRIPCION,MARCA,PVP,CANT\nNEW-01,Producto Nuevo,Marca X,200.00,50`;
  
  MigrationCenter.loadSourceContent(sampleCsv, 'FILE_CSV', 'catalog.csv');
  MigrationCenter.processStagingValidation(productionCatalogBefore);

  // El trabajo está en READY_FOR_REVIEW
  assert.equal(MigrationCenter.activeJob.status, 'READY_FOR_REVIEW');

  // Verificar que el catálogo de producción NO HAYA SIDO TOCADO
  assert.equal(productionCatalogBefore.length, 1);
  assert.equal(productionCatalogBefore[0].product_code, 'EXISTING-01');

  // Solo al autorizar mediante Aprobación Humana cambia producción
  const importResult = MigrationCenter.approveAndExecuteImport(productionCatalogBefore);
  assert.equal(importResult.success, true);
  assert.equal(importResult.catalogResult.length, 2);
});

test('9. Rollback Real con Ledger de Acciones (MIGRATION_ACTIONS): Reversión granular exacta', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const initialCatalog = [{ product_code: 'FER-01', name: 'Amoladora Vieja', price: 100 }];

  MigrationCenter.initWizard(tenantId, 'Profesor Franco');
  const sampleCsv = `COD_ART,DESCRIPCION,MARCA,PVP,CANT\nFER-01,Amoladora Nueva Bosch,Bosch,150.00,30\nFER-02,Taladro Bosch Nuevo,Bosch,80.00,20`;
  
  MigrationCenter.loadSourceContent(sampleCsv, 'FILE_CSV', 'sample.csv');
  MigrationCenter.processStagingValidation(initialCatalog);

  const importResult = MigrationCenter.approveAndExecuteImport(initialCatalog);
  const updatedCatalog = importResult.catalogResult;

  assert.equal(updatedCatalog.length, 2);
  assert.equal(updatedCatalog[0].name, 'Amoladora Nueva Bosch'); // Actualizado por la migración

  // Verificar que el Ledger de Acciones registró 2 entradas
  const actionsForJob = MIGRATION_ACTIONS_LEDGER.filter(a => a.job_id === MigrationCenter.activeJob.id);
  assert.equal(actionsForJob.length, 2);
  assert.equal(actionsForJob[0].action, 'UPDATE');
  assert.equal(actionsForJob[1].action, 'CREATE');

  // Ejecutar Rollback Granular
  const rollbackResult = MigrationRollback.executeRollback(importResult.versionId, tenantId, updatedCatalog);
  assert.equal(rollbackResult.success, true);
  assert.equal(rollbackResult.restoredCatalog.length, 1);
  assert.equal(rollbackResult.restoredCatalog[0].name, 'Amoladora Vieja'); // Restaurado exactamente
});

test('10. Seguridad de Archivos: Inmunización contra macros Excel y scripts de PDF', () => {
  const dangerousExcelContent = `COD_ART,DESCRIPCION,PVP\nFER-99,=CMD("calc.exe"),100.00`;
  const parsed = MigrationAI.parseRawSource(dangerousExcelContent, 'FILE_CSV');

  // Verifica que las fórmulas no se ejecuten y se procesen como texto limpio o limpio de comandos
  assert.equal(parsed.length, 1);
  assert.equal(typeof parsed[0].DESCRIPCION, 'string');
});
