import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sectors from '../wms-sectors.js';

const tenantA = '11111111-1111-1111-1111-111111111111';
const tenantB = '22222222-2222-2222-2222-222222222222';
const source = fs.readFileSync(new URL('../wms-sectors.js', import.meta.url), 'utf8');
const mapSource = fs.readFileSync(new URL('../mapa-local.js', import.meta.url), 'utf8');

function harness() {
  let auth = { tenantId: tenantA, userId: tenantB, isVerified: true, role: 'ADMIN' };
  let data = [];
  let uploadError = null;
  let rpcError = null;
  let rpcCalls = 0;
  const window = { console, crypto: { randomUUID: () => tenantB },
    SaasAuth: { getTenantContext: () => auth },
    supabaseClient: {
      from() { return { select() { return this; }, eq() { return this; }, async order() { return { data }; } }; },
      storage: { from() { return {
        async upload() { return { error: uploadError }; },
        async createSignedUrls(paths) { return { data: paths.map(path => ({ path, signedUrl: `https://example.com/${path}` })) }; }
      }; } }
    },
    OperationalApi: { async updateWmsSector({ sector }) {
      rpcCalls += 1;
      if (rpcError) throw new Error(rpcError);
      return { code: sector.id, name: sector.name, description: sector.desc, sort_order: sector.sortOrder,
        revision: sector.revision + 1, photo_path: sector.photoPath };
    } }
  };
  const sandbox = vm.createContext({ window, console, structuredClone,
    document: { getElementById() { return null; } } });
  vm.runInContext(source, sandbox);
  vm.runInContext(mapSource, sandbox);
  return { api: window.WmsSectors, window, sandbox,
    setAuth(value) { auth = { ...auth, ...value }; }, setData(value) { data = value; },
    failUpload(value) { uploadError = { message: value }; }, failRpc(value) { rpcError = value; },
    get rpcCalls() { return rpcCalls; } };
}

test('a depot location has a single sector even when legacy floor metadata says 2', () => {
  assert.equal(sectors.resolveFloor({ wms_code: 'DP-01', floor_level: 2 }), 6);
  assert.equal(sectors.resolveFloor({ wms_code: 'S3-D-P1-N2-C', floor_level: 1 }), 3);
  assert.equal(sectors.resolveFloor({ wms_code: 'SEC4-P1' }), 4);
  assert.equal(sectors.resolveFloor({}), null);
});

test('counters distinguish products, quantities, occupied locations and pending drafts', () => {
  assert.deepEqual(sectors.summarize([
    { product_id: 'A', location_id: 'X', stock: 2 }, { product_id: 'A', location_id: 'Y', stock: 3 },
    { product_id: 'B', location_id: 'Y', stock: 4 }, { product_id: 'C', location_id: 'Z', stock: 0 },
    { product_id: 'D', stock: 100, is_draft: true, draft_id: 'draft-1' }
  ]), { products: 2, units: 9, locations: 2, pending: 1 });
});

test('map does not invent sector-1 locations from catalog stock or recover stale data after an error', () => {
  const h = harness();
  h.window.internalCatalogProducts = [{ product_code: 'UNLOCATED', stock: 50 }];
  assert.equal(vm.runInContext('getSectorProducts(1).length', h.sandbox), 0);
  h.window.setStoreMapData([], [{ product_code: 'TEST', wms_code: 'DP-01', floor_level: 2, stock: 4 }], 'ok');
  assert.equal(vm.runInContext('getSectorProducts(2).length', h.sandbox), 0);
  assert.equal(vm.runInContext('getSectorProducts(6).length', h.sandbox), 1);
  h.window.setStoreMapData([], [], 'error');
  assert.equal(h.window.storeLocationProducts.length, 0);
  assert.equal(vm.runInContext('getSectorProducts(1).length', h.sandbox), 0);
});

test('shelf inspector isolates sectors and does not match P1 with P10', () => {
  const h = harness();
  h.window.setStoreMapData([], [
    { wms_code: 'S1-D-P1-N2-C', stock: 2 }, { wms_code: 'S2-D-P1-N2-C', stock: 9 },
    { wms_code: 'S1-D-P10-N2-C', stock: 8 }
  ], 'ok');
  assert.equal(vm.runInContext("getShelfUnitCount('P1')", h.sandbox), 2);
});

test('published names and order replace presentation only, keeping stable sector codes', async () => {
  const h = harness();
  h.setData([{ code: 'S2', name: 'Tornillos', description: 'Pared izquierda', sort_order: 1, revision: 3 },
    { code: 'S1', name: 'Herramientas', sort_order: 5, revision: 1 }]);
  await h.api.load();
  assert.equal(h.api.list()[0].id, 'S2');
  assert.equal(h.api.get('S2').floor, 2);
  assert.equal(h.api.get('S2').name, 'Tornillos');
});

test('a failed upload never calls the publication RPC', async () => {
  const h = harness(); await h.api.load(); h.failUpload('Sin conexión');
  await assert.rejects(h.api.save({ ...h.api.get('S1'), tenantId: tenantA }, { type: 'image/jpeg', size: 200 }), /Sin conexión/);
  assert.equal(h.rpcCalls, 0);
  assert.equal(h.api.get('S1').revision, 0);
});

test('a rejected publication is not treated as saved locally', async () => {
  const h = harness(); await h.api.load(); h.failRpc('Conflicto de revisión');
  await assert.rejects(h.api.save({ ...h.api.get('S1'), name: 'No guardado', tenantId: tenantA }), /Conflicto/);
  assert.equal(h.api.get('S1').revision, 0);
});

test('photo paths are scoped to tenant and sector and are resolved as signed URLs', async () => {
  const h = harness(); await h.api.load();
  await h.api.save({ ...h.api.get('S1'), tenantId: tenantA }, { type: 'image/jpeg', size: 200 });
  assert.equal(h.api.get('S1').photoPath, `${tenantA}/S1/${tenantB}.jpg`);
  assert.match(h.api.get('S1').photoUrl, /^https:/);
});

test('store switching cannot display or publish another store sector draft', async () => {
  const h = harness(); h.setData([{ code: 'S1', name: 'Privado A', revision: 3 }]); await h.api.load();
  const draft = { ...h.api.get('S1'), tenantId: tenantA };
  h.setAuth({ tenantId: tenantB });
  assert.notEqual(h.api.get('S1').name, 'Privado A');
  await assert.rejects(h.api.save(draft), /sesión cambió/);
  assert.equal(h.rpcCalls, 0);
});

test('employees may view but cannot publish sector configuration', async () => {
  const h = harness(); await h.api.load(); h.setAuth({ role: 'VENDEDOR' });
  assert.equal(h.api.canEdit(), false);
  await assert.rejects(h.api.save({ ...h.api.get('S1'), tenantId: tenantA }), /sesión cambió/);
});

test('sector migration is additive, versioned, permission-checked and preserves inventory', () => {
  const sql = fs.readFileSync(new URL('../scripts/migrations/025_wms_sector_presentation.sql', import.meta.url), 'utf8');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /'ADMIN','SUPERVISOR'/);
  assert.match(sql, /p_expected_revision/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /operational_audit_log/);
  assert.match(sql, /'wms-sector-images', 'wms-sector-images', false/);
  assert.doesNotMatch(sql, /(?:UPDATE|DELETE FROM|INSERT INTO)\s+public\.inventory_(?:balances|locations|ledger)/i);
});
