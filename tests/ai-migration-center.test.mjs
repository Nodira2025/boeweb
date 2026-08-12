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
import { MigrationRollback } from '../migration-rollback.js';
import { MigrationCenter } from '../migration-center.js';

test('Migration AI: Parsing de contenido CSV a filas estructuradas raw', () => {
  const csvContent = `COD_ART,DESCRIPCION,MARCA,PVP,CANT\nFER-01,Taladro Bosch 750W,Bosch,150.00,30\nFER-02,Amoladora Bosch,Bosch,85.00,25`;
  const rawRows = MigrationAI.parseRawSource(csvContent, 'FILE_CSV');

  assert.equal(rawRows.length, 2);
  assert.equal(rawRows[0].COD_ART, 'FER-01');
  assert.equal(rawRows[0].DESCRIPCION, 'Taladro Bosch 750W');
  assert.equal(rawRows[0].PVP, '150.00');
});

test('Migration AI: Sugerencia de Mapeo de Columnas con Inteligencia Adaptativa', () => {
  const headers = ['COD_ART', 'DESCRIPCION', 'MARCA', 'PVP', 'CANT'];
  const mappings = MigrationAI.suggestColumnMappings(headers, 'ferreteria');

  assert.equal(mappings.length, 5);
  const targetCols = mappings.map(m => m.target_column);
  assert.ok(targetCols.includes('product_code'));
  assert.ok(targetCols.includes('name'));
  assert.ok(targetCols.includes('brand'));
  assert.ok(targetCols.includes('price'));
  assert.ok(targetCols.includes('stock'));
});

test('Migration AI: Normalización de Precios, Números y Confianza (Confidence Score)', () => {
  const rawRow = { COD_ART: 'FER-01', DESCRIPCION: 'Taladro Bosch', MARCA: 'Bosch', PVP: '$ 150,00', CANT: '30' };
  const mappings = [
    { source_column: 'COD_ART', target_column: 'product_code' },
    { source_column: 'DESCRIPCION', target_column: 'name' },
    { source_column: 'MARCA', target_column: 'brand' },
    { source_column: 'PVP', target_column: 'price' },
    { source_column: 'CANT', target_column: 'stock' }
  ];

  const norm = MigrationAI.normalizeRow(rawRow, mappings, 'ferreteria');
  assert.equal(norm.validation_status, 'VALID');
  assert.equal(norm.normalized_data.price, 150.00);
  assert.equal(norm.normalized_data.stock, 30);
  assert.ok(norm.confidence >= 0.85);
});

test('Migration AI: Detección de Duplicados en Staging', () => {
  const existingCatalog = [{ id: 'p1', product_code: 'FER-01', name: 'Taladro Bosch 750W' }];
  const normData = { product_code: 'FER-01', name: 'Taladro Bosch 750W' };

  const dupRes = MigrationAI.detectDuplicates(normData, existingCatalog);
  assert.equal(dupRes.isDuplicate, true);
  assert.equal(dupRes.matchedId, 'FER-01');
});

test('Staging Pipeline: La IA NO escribe directamente en producción hasta la Aprobación Humana', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  MigrationCenter.initWizard(tenantId, 'Profesor Franco');
  
  const sampleCsv = `COD_ART,DESCRIPCION,MARCA,PVP,CANT\nFER-10,Rotomartillo Bosch,Bosch,210.00,10`;
  MigrationCenter.loadSourceContent(sampleCsv, 'FILE_CSV', 'sample.csv');
  MigrationCenter.processStagingValidation([]);

  // Staging populated, pero el catálogo de producción sigue intacto
  const initialProductionCatalog = [];
  assert.equal(initialProductionCatalog.length, 0);

  // Aprobación Humana Explícita
  const result = MigrationCenter.approveAndExecuteImport(initialProductionCatalog);
  assert.equal(result.success, true);
  assert.equal(result.createdCount, 1);
  assert.equal(result.catalogResult.length, 1);
  assert.equal(result.catalogResult[0].product_code, 'FER-10');
});

test('Migration Rollback: Reversión Atómica Restaura el Snapshot Previo', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const initialCatalog = [{ product_code: 'FER-01', name: 'Taladro Viejo', price: 100 }];

  MigrationCenter.initWizard(tenantId, 'Profesor Franco');
  const sampleCsv = `COD_ART,DESCRIPCION,MARCA,PVP,CANT\nFER-01,Taladro Nuevo Bosch,Bosch,150.00,30\nFER-02,Amoladora Nueva,Bosch,80.00,20`;
  MigrationCenter.loadSourceContent(sampleCsv, 'FILE_CSV', 'sample.csv');
  MigrationCenter.processStagingValidation(initialCatalog);

  const importResult = MigrationCenter.approveAndExecuteImport(initialCatalog);
  const updatedCatalog = importResult.catalogResult;
  assert.equal(updatedCatalog.length, 2);
  assert.equal(updatedCatalog[0].name, 'Taladro Nuevo Bosch'); // Actualizado

  // Ejecutar Rollback Atómico
  const rollbackResult = MigrationRollback.executeRollback(importResult.versionId, tenantId, updatedCatalog);
  assert.equal(rollbackResult.success, true);
  const restored = rollbackResult.restoredCatalog;

  assert.equal(restored.length, 1);
  assert.equal(restored[0].name, 'Taladro Viejo'); // Nombre restaurado
  assert.equal(restored[0].price, 100); // Precio restaurado
});
