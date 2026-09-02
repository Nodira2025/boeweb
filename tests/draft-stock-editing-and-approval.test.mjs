import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import OperationalApi from '../operational-api.js';

const root = path.resolve('.');
const migration006 = fs.readFileSync(path.join(root, 'scripts/migrations/006_catalog_ingestion.sql'), 'utf8');
const migration018 = fs.readFileSync(path.join(root, 'scripts/migrations/018_draft_edits_and_stock_overrides.sql'), 'utf8');
const operationalApiSrc = fs.readFileSync(path.join(root, 'operational-api.js'), 'utf8');
const vendedorJs = fs.readFileSync(path.join(root, 'vendedor.js'), 'utf8');
const vendedorHtml = fs.readFileSync(path.join(root, 'vendedor.html'), 'utf8');
const lookupProductMjs = fs.readFileSync(path.join(root, 'netlify/functions/lookup-product.mjs'), 'utf8');

test('Migración 006 y 018 definen update_catalog_product_draft_v2 con soporte para VENDEDOR y validación de stock', () => {
  for (const sql of [migration006, migration018]) {
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.update_catalog_product_draft_v2/);
    assert.match(sql, /ARRAY\['ADMIN',\s*'SUPERVISOR',\s*'VENDEDOR'\]::TEXT\[\]/);
    assert.match(sql, /status NOT IN \('PENDING_LOCATION',\s*'PENDING_REVIEW'\)/);
    assert.match(sql, /IF v_stock < 0 THEN/);
    assert.match(sql, /stock_quantity = v_stock/);
    assert.match(sql, /CATALOG_PRODUCT_DRAFT_UPDATED/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.update_catalog_product_draft_v2.*TO authenticated/);
  }
});

test('Migración 006 y 018 actualizan approve_catalog_product_draft_v2 con override de stock para receive_inventory_v2', () => {
  for (const sql of [migration006, migration018]) {
    assert.match(sql, /v_stock := COALESCE\(\s*NULLIF\(p_overrides->>'stock_quantity', ''\)::NUMERIC/);
    assert.match(sql, /public\.receive_inventory_v2\(\s*p_tenant_id,\s*v_product_id,\s*v_location_id,\s*v_stock,/);
    assert.match(sql, /UPDATE public\.catalog_product_drafts_v2[\s\S]*?stock_quantity = v_stock/);
  }
});

test('Migración 018 registra la versión en schema_migrations', () => {
  assert.match(migration018, /INSERT INTO public\.schema_migrations/);
  assert.match(migration018, /'018'/);
  assert.match(migration018, /'draft_edits_and_stock_overrides'/);
});

test('OperationalApi expone updateCatalogProductDraft e invoca la RPC correspondiente con validaciones', async () => {
  assert.equal(typeof OperationalApi.updateCatalogProductDraft, 'function');

  const tenantId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const draftId = '33333333-3333-4333-8333-333333333333';

  let rpcCall = null;
  const mockClient = {
    async rpc(name, params) {
      rpcCall = { name, params };
      return { data: { draft_id: draftId, stock_quantity: 15 }, error: null };
    }
  };

  const res = await OperationalApi.updateCatalogProductDraft({
    supabaseClient: mockClient,
    authContext: { isVerified: true, tenantId, userId, role: 'VENDEDOR' },
    draftId,
    updates: {
      stock_quantity: 15,
      name: 'Extractor Turbina 4 Pulgadas',
      category: 'Ventilación',
      sale_price: 35000
    }
  });

  assert.equal(rpcCall.name, 'update_catalog_product_draft_v2');
  assert.equal(rpcCall.params.p_tenant_id, tenantId);
  assert.equal(rpcCall.params.p_draft_id, draftId);
  assert.equal(rpcCall.params.p_updates.stock_quantity, 15);
  assert.equal(rpcCall.params.p_updates.category, 'Ventilación');
  assert.equal(res.stock_quantity, 15);
});

test('Categoría Ventilación está incorporada en vendedor.html', () => {
  assert.match(vendedorHtml, /<select id="fastupload-category-input"[\s\S]*?<option value="Ventilación">Ventilación<\/option>/);
  assert.match(vendedorHtml, /<select id="internal-editor-category"[\s\S]*?<option>Ventilación<\/option>/);
  assert.match(vendedorHtml, /data-category="Ventilación"/);
  assert.match(vendedorHtml, /id="count-Ventilacion"/);
});

test('Categoría Ventilación está incorporada en vendedor.js', () => {
  assert.match(vendedorJs, /categoriesList = \[[^\]]*'Ventilación'[^\]]*\]/);
  assert.match(vendedorJs, /count-Ventilacion/);
  assert.match(vendedorJs, /<option value="Ventilación">Ventilación<\/option>/);
});

test('Inferencia de categorías en lookup-product.mjs mapea extractores y ventilación', () => {
  assert.match(lookupProductMjs, /\['Ventilación',\s*\/ventilaci\[oó\]n\|extractor\|ventilador\|turbina/);
});

test('vendedor.js contiene soporte para guardar cambios en borrador y editar stock en cola y asistente', () => {
  assert.match(vendedorJs, /function saveProductDraftChanges\(draftId\)/);
  assert.match(vendedorJs, /window\.saveProductDraftChanges = saveProductDraftChanges/);
  assert.match(vendedorJs, /id="draft-stock-\$\{draft\.id\}"/);
  assert.match(vendedorJs, /id="location-assistant-stock-input"/);
  assert.match(vendedorJs, /updateLocationAssistantStock/);
  assert.match(vendedorJs, /overrides:\s*\{[\s\S]*?stock_quantity:\s*stockVal/);
});

test('vendedor.html y vendedor.js exponen modal de edición de borradores y botón ✏️ Editar en ubicación y cola de aprobación', () => {
  assert.match(vendedorHtml, /id="draft-edit-modal"/);
  assert.match(vendedorHtml, /id="draft-edit-stock"/);
  assert.match(vendedorHtml, /id="draft-edit-save-btn"/);
  assert.match(vendedorJs, /function openDraftEditModal\(draftId,\s*event\)/);
  assert.match(vendedorJs, /function closeDraftEditModal\(\)/);
  assert.match(vendedorJs, /async function handleDraftEditFormSubmit\(event\)/);
  assert.match(vendedorJs, /openDraftEditModal\('\$\{escapeStockHtml\(product\.id\)\}',\s*event\)/);
  assert.match(vendedorJs, /openDraftEditModal\('\$\{draft\.id\}',\s*event\)/);
});

test('operational-api.js y netlify functions implementan fallback serverless cuando la RPC no existe en la BD', () => {
  const updateProductDraftMjs = fs.readFileSync(path.join(root, 'netlify/functions/update-product-draft.mjs'), 'utf8');
  assert.match(updateProductDraftMjs, /export async function handler\(event\)/);
  assert.match(updateProductDraftMjs, /catalog_product_drafts_v2/);
  assert.match(updateProductDraftMjs, /ALLOWED_ROLES = new Set\(\['ADMIN',\s*'SUPERVISOR',\s*'VENDEDOR'\]\)/);

  assert.match(operationalApiSrc, /fetch\('\/\.netlify\/functions\/update-product-draft'/);
  assert.match(operationalApiSrc, /isMissingRpc/);
});

test('Diseño responsive para móviles en cola de aprobación, tarjetas y modal', () => {
  const vendedorStockCss = fs.readFileSync(path.join(root, 'vendedor-stock.css'), 'utf8');
  assert.match(vendedorStockCss, /\.vendor-drafts-section-container/);
  assert.match(vendedorStockCss, /\.vendor-drafts-card-box/);
  assert.match(vendedorStockCss, /\.vendor-drafts-grid/);
  assert.match(vendedorStockCss, /@media \(max-width: 768px\)/);

  // Botones en dos niveles ordenados
  assert.match(vendedorJs, /grid-template-columns: 1fr 1fr; gap: 8px;/);
  assert.match(vendedorJs, /Aprobar y Publicar/);
  assert.match(vendedorJs, /Rechazar/);
});

test('http-auth.mjs valida UUIDs de PostgreSQL incluyendo seed tenants y rechaza inválidos', async () => {
  const { isUuid } = await import('../netlify/functions/_shared/http-auth.mjs');
  assert.equal(isUuid('11111111-1111-1111-1111-111111111111'), true);
  assert.equal(isUuid('22222222-2222-2222-2222-222222222222'), true);
  assert.equal(isUuid('e5f7c3be-f0ae-4e52-b046-18d6bc84c29f'), true);
  assert.equal(isUuid('00000000-0000-0000-0000-000000000000'), false);
  assert.equal(isUuid('invalid-uuid'), false);
  assert.equal(isUuid(null), false);
});

