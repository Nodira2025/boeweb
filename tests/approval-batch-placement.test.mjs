import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import placement from '../wms-product-placement.js';
import api from '../operational-api.js';

test('Specific names override misleading categories and brands', () => {
  for (const [name, expected] of [
    ['Bio Proyect Neem 60ml', 4], ['Mamboreta Foli', 4], ['Mamboreta regulador PH', 5],
    ['Kawsay Control', 4], ['Kawsay K9', 3], ['Lana de roca Bioproyect', 2],
    ['Carbon de coco narguile', 1], ['Turbina chupete', 1], ['Turbina extractor', 5],
    ['The Press Club Filtrr Bags', 1], ['Garden Hi Pro filtro carbon', 5],
    ['Red Scrog 150x150', 5], ['Powder Feeding Bio Grow', 3], ['Maceta 10L', 5],
    ['Green leaf 100 cm3', null], ['PRUEBA CODEX', null], ['Baby', null]
  ]) assert.equal(placement.inferSector({ name, category: 'Otros' }), expected, name);
});

test('Legacy sector location gets accepted by the operational contract', async () => {
  let sent;
  await api.locateCatalogProductDraft({
    supabaseClient: { async rpc(name, args) { sent = args.p_location; return { data: {}, error: null }; } },
    authContext: { isVerified: true, role: 'ADMIN', tenantId: '11111111-1111-1111-1111-111111111111', userId: '22222222-2222-4222-8222-222222222222' },
    draftId: '33333333-3333-4333-8333-333333333333',
    location: { code: 'S3-GENERAL', location_type: 'SECTOR', metadata: { floor_level: 3 } }, idempotencyKey: 'legacy-sector-test'
  });
  assert.equal(sent.location_type, 'SHELF');
  assert.deepEqual(sent.metadata, { floor_level: 3, is_sector_only: true });
});

test('Plan preserves correct shelves, reserved balances, private inventory and quantities', () => {
  const data = {
    drafts: [{ id: 'd', status: 'PENDING_REVIEW', name: 'Fertilizante', stock_quantity: 12,
      location_data: { code: 'S3-P4-N2', location_type: 'SHELF' } }],
    products: [{ id: 'a', name: 'Medidor PH' }, { id: 'b', name: 'Tijera', metadata: { is_reprocam: true } }],
    locations: [{ id: 'loc', code: 'S1-GENERAL', active: true, is_sellable: true, location_type: 'SHELF' }],
    balances: [{ product_id: 'a', location_id: 'loc', on_hand: 12, reserved: 2 }, { product_id: 'b', location_id: 'loc', on_hand: 5, reserved: 0 }]
  };
  const before = structuredClone(data);
  assert.equal(placement.buildPlan(data).actions.length, 0);
  assert.deepEqual(data, before);
  data.balances[0].reserved = 0;
  const [move] = placement.buildPlan(data).actions;
  assert.equal(move.after.code, 'S5-GENERAL');
  assert.equal(move.quantity, 12);
});

function batchHarness(rpc) {
  const source = fs.readFileSync(new URL('../vendedor.js', import.meta.url), 'utf8');
  const start = source.indexOf('let draftApprovalBatchRunning = false;');
  const end = source.indexOf('window.approveAllPendingProductDrafts = approveAllPendingProductDrafts;', start);
  const approveStart = source.indexOf('async function approveProductDraft(');
  const approveEnd = source.indexOf('\nasync function handleShelfPhotoChange', approveStart);
  const drafts = new Map(['one', 'two', 'bad'].map(id => [id, { id, name: id, stock: 2, sale_price: 4 }]));
  const elements = new Map();
  for (const id of drafts.keys()) for (const [field, value] of Object.entries({ name: id, cat: 'Otros', cost: '3', price: '20', stock: id === 'two' ? '17' : '5' })) {
    elements.set(`draft-${field}-${id}`, { value, focus() {} });
  }
  elements.set('draft-approval-status', { textContent: '' });
  let refreshes = 0;
  const context = vm.createContext({ pendingDraftCache: drafts, console: { error() {}, warn() {} },
    window: { OperationalApi: { approveCatalogProductDraft: rpc }, WmsProductPlacement: placement },
    document: { getElementById: id => elements.get(id) }, confirm: () => true, showToast() {},
    ensureVendorOperationalSession: async () => ({ isVerified: true }), supabaseClient: {}, storeMapDataLoaded: true,
    loadPendingProductDrafts: async () => { refreshes++; elements.get('draft-stock-two').value = '999'; },
    refreshPendingLocationBadge: async () => {}, refreshPendingDraftsBadge: async () => {}, loadInternalCatalog: async () => {},
    loadStoreMapData: async () => {} });
  vm.runInContext(source.slice(start, end) + source.slice(approveStart, approveEnd), context);
  return { context, drafts, elements, refreshes: () => refreshes };
}

test('Batch keeps edited amounts, counts actual RPC success and refreshes only once', async () => {
  const sent = [];
  const h = batchHarness(async args => { sent.push(args); if (args.draftId === 'bad') throw new Error('Ubicación inválida'); return { status: 'APPROVED' }; });
  await vm.runInContext('approveAllPendingProductDrafts()', h.context);
  assert.equal(sent[1].overrides.stock_quantity, 17);
  assert.equal(h.refreshes(), 1);
  assert.equal(h.drafts.size, 1);
  assert.match(h.elements.get('draft-approval-status').textContent, /2 productos aprobados. 1 pendientes/);
});

test('Batch rejects decimal stock and duplicate clicks without writing twice', async () => {
  let calls = 0;
  const h = batchHarness(async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return { status: 'APPROVED' }; });
  h.elements.get('draft-stock-bad').value = '1.5';
  await Promise.all([vm.runInContext('approveAllPendingProductDrafts()', h.context), vm.runInContext('approveAllPendingProductDrafts()', h.context)]);
  assert.equal(calls, 2);
  assert.equal(h.drafts.size, 1);
});

test('Transfer retries keep one key and never increase aggregate stock after a lost response', async () => {
  let origin = 12, destination = 0, attempts = 0;
  const keys = new Set();
  const context = { isVerified: true, tenantId: 'tenant', userId: 'admin' };
  const action = { kind: 'transfer', id: 'product', name: 'Medidor PH', before: { id: 'old', code: 'S1-GENERAL' },
    after: placement.sectorLocation(5), quantity: 12, key: 'stable-transfer-key' };
  const params = { plan: { actions: [action], review: [] }, authContext: context, getContext: () => context,
    api: { async upsertInventoryLocation() { return { location_id: 'new' }; },
      async transferInventory(args) {
        attempts++;
        if (!keys.has(args.idempotencyKey)) { origin -= args.quantity; destination += args.quantity; keys.add(args.idempotencyKey); }
        if (attempts === 1) throw new Error('Lost response');
        return { idempotent: true };
      } } };
  assert.equal((await placement.applyPlan(params)).failed.length, 1);
  assert.equal((await placement.applyPlan(params)).completed.length, 1);
  assert.equal(origin, 0); assert.equal(destination, 12); assert.equal(keys.size, 1);
  assert.equal(origin + destination, 12);
});

test('A changed session stops relocation before the first write', async () => {
  let writes = 0;
  const report = await placement.applyPlan({ plan: { actions: [{ kind: 'transfer' }], review: [] },
    authContext: { isVerified: true, tenantId: 'one', userId: 'admin' },
    getContext: () => ({ isVerified: true, tenantId: 'two', userId: 'admin' }),
    api: { async upsertInventoryLocation() { writes++; } }
  });
  assert.equal(writes, 0); assert.equal(report.failed.length, 1);
});
