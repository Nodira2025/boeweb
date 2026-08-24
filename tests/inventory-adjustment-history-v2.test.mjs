import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve('.');
const seller = fs.readFileSync(path.join(projectRoot, 'vendedor.js'), 'utf8');
const sellerHtml = fs.readFileSync(path.join(projectRoot, 'vendedor.html'), 'utf8');

function extractFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : -1;
  assert.notEqual(start, -1, `No se encontró ${name}`);
  return source.slice(start, end > start ? end : source.length);
}

test('el historial de mermas se deriva del ledger central y no de localStorage', () => {
  const reader = extractFunction(seller, 'getRetiredProductsHistory', 'saveRetiredProductAdjustment');
  assert.match(reader, /canonicalWmsMovements/);
  assert.match(reader, /ADJUSTMENT_POSITIVE/);
  assert.match(reader, /ADJUSTMENT_NEGATIVE/);
  assert.match(reader, /Reversión compensatoria del ajuste/);
  assert.doesNotMatch(reader, /localStorage/);
  assert.doesNotMatch(seller, /boeweb_retired_products_history_v1/);
});

test('un ajuste activo confirma primero en el RPC y refresca catálogo y ledger', () => {
  const submit = extractFunction(seller, 'handleStockAdjustmentSubmit', 'renderRetiredProductsUI');
  assert.match(submit, /await window\.OperationalApi\.adjustInventory/);
  assert.match(submit, /Promise\.all\(\[loadInternalCatalog\(\), loadWmsInventoryData\(true\)\]\)/);
  assert.match(submit, /reason === 'vendido'/);
  assert.doesNotMatch(submit, /localStorage/);
});

test('las reversiones son compensatorias, idempotentes y requieren supervisor', () => {
  const reversal = extractFunction(seller, 'revertRetiredProductAdjustment', 'exportRetiredProductsCsv');
  assert.match(reversal, /\['ADMIN', 'SUPERVISOR', 'SUPERADMIN'\]/);
  assert.match(reversal, /reason: 'CORRECTION'/);
  assert.match(reversal, /idempotencyKey: `inventory-reversal:\$\{item\.id\}`/);
  assert.doesNotMatch(reversal, /localStorage/);
});

test('la interfaz explica que las ventas sólo salen por POS', () => {
  assert.match(sellerHtml, /Las ventas se registran exclusivamente desde el POS/);
  assert.doesNotMatch(sellerHtml, /Ventas Mostrador \/ Otros|ret-filter-vendido/);
});
