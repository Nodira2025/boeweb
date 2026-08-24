import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve('.');
const vendedorHtml = fs.readFileSync(path.join(projectRoot, 'vendedor.html'), 'utf8');
const vendedorJs = fs.readFileSync(path.join(projectRoot, 'vendedor.js'), 'utf8');
const operationalSql = fs.readFileSync(path.join(projectRoot, 'scripts/migrations/004_operational_core_and_config.sql'), 'utf8');

function extractFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : -1;
  assert.notEqual(start, -1, `No se encontró ${name}`);
  return source.slice(start, end > start ? end : source.length);
}

test('el portal no expone acciones de reseteo o importación local de caja', () => {
  assert.doesNotMatch(vendedorHtml, /Resetear Pruebas|purgeProductionTestData\(/);
  assert.doesNotMatch(vendedorJs, /window\.importCashBackup\s*=/);
  assert.doesNotMatch(vendedorJs, /window\.saveCurrentAccount\s*=/);
  assert.doesNotMatch(vendedorJs, /window\.submitPosSaleDraftLegacyUnsafe\s*=/);
});

test('caja y cuenta corriente no aceptan persistencia operativa local', () => {
  const cashReader = extractFunction(vendedorJs, 'getVendorCashData', 'saveVendorCashData');
  const cashWriter = extractFunction(vendedorJs, 'saveVendorCashData', 'formatCashCurrency');
  const accountWriter = extractFunction(vendedorJs, 'saveCurrentAccount', 'switchPortfolioSubtab');
  assert.match(cashReader, /authority: 'server'/);
  assert.doesNotMatch(cashReader, /localStorage/);
  assert.match(cashWriter, /La caja local fue retirada/);
  assert.doesNotMatch(cashWriter, /localStorage/);
  assert.match(accountWriter, /La cuenta corriente local fue retirada/);
  assert.doesNotMatch(accountWriter, /localStorage/);
});

test('archivo individual y por lote usan el comando central y conservan historia', () => {
  const single = extractFunction(vendedorJs, 'deleteSingleInternalCatalogProduct', 'deleteSelectedInternalCatalogProducts');
  const batch = extractFunction(vendedorJs, 'deleteSelectedInternalCatalogProducts', 'openAdminAuditInvestigationModal');
  assert.match(single, /OperationalApi\.archiveCatalogProduct/);
  assert.match(single, /source !== 'catalog_products'/);
  assert.match(batch, /OperationalApi\.archiveCatalogProduct/);
  assert.match(batch, /productos heredados o inválidos/);
  assert.match(batch, /sin borrar su historial/);
});

test('un tombstone del navegador no puede ocultar el catálogo canónico', () => {
  const filter = extractFunction(vendedorJs, 'getFilteredInternalCatalogProducts', 'toggleSelectInternalCatalogItem');
  assert.doesNotMatch(filter, /getDeletedInternalProductIds|deletedIds|isProductTombstoned/);
  assert.doesNotMatch(vendedorJs, /window\.(?:getDeletedInternalProductIds|addDeletedInternalProductIds|isProductTombstoned)\s*=/);
});

test('el Centro de Auditoría verifica sesión y consulta operational_audit_log', () => {
  assert.match(vendedorHtml, /id="modal-admin-investigation-audit"/);
  assert.doesNotMatch(vendedorHtml, /id="admin-audit-pass-input"|Contraseña de Administrador/);
  assert.match(vendedorHtml, /Verificar sesión y abrir auditoría/);
  assert.match(vendedorJs, /loadCanonicalAdminAuditLogs/);
  assert.match(vendedorJs, /\.from\('operational_audit_log'\)/);
  assert.match(vendedorJs, /\.eq\('tenant_id', context\.tenantId\)/);
  assert.match(vendedorJs, /authority: 'server'/);
  assert.doesNotMatch(vendedorJs, /boeweb_secure_audit_trail_v1/);
});

test('la auditoría central tiene RLS de supervisor y no admite escritura directa', () => {
  assert.match(operationalSql, /operational_audit_supervisor_read_v2[\s\S]*?ARRAY\['ADMIN', 'SUPERVISOR'\]/);
  assert.match(operationalSql, /REVOKE ALL ON TABLE[\s\S]*?public\.operational_audit_log[\s\S]*?FROM anon, authenticated/);
  assert.match(operationalSql, /GRANT SELECT ON[\s\S]*?public\.operational_audit_log[\s\S]*?TO authenticated/);
});

test('la exportación usa el mismo snapshot central y falla cerrada', () => {
  const exporter = extractFunction(vendedorJs, 'exportAdminAuditLogJSON', 'renderInternalCatalogGrid');
  assert.match(exporter, /await loadCanonicalAdminAuditLogs\(\{ refresh: true \}\)/);
  assert.match(exporter, /catch \(error\)/);
  assert.doesNotMatch(exporter, /localStorage/);
});
