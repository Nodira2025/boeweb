import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import Assignment from '../wms-location-assignment.js';

const source = fs.readFileSync(new URL('../vendedor.js', import.meta.url), 'utf8');
const handlers = source.slice(source.indexOf('function setLocationAssignmentBusy'), source.indexOf('function startBatchSectorRefinement'));
const id = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function fixture() {
  const nodes = new Map();
  const calls = [];
  const messages = [];
  const products = [3, 4, 5].map(n => ({ id: id(n), name: `Producto ${n}`, status: 'PENDING_LOCATION', stock_quantity: n }));
  const session = { isVerified: true, tenantId: id(1), userId: id(2) };
  const state = { isBulk: true, products, product: products[0], zone: { id: 'S3', prefix: 'S3', label: 'Fertilizantes', floor_level: 3 },
    compass: { id: 'D', compass: 'Derecha' }, wall: { id: 'P1', label: 'Pared 1' }, level: { id: 2 }, sector: { id: 'C', label: 'Centro' } };
  const sandbox = {
    console: { error() {} },
    document: { getElementById(key) {
      if (!nodes.has(key)) nodes.set(key, { dataset: {}, hidden: true, inert: false, setAttribute(name, value) { this[name] = value; } });
      return nodes.get(key);
    } },
    locationAssignmentBusy: false, locationAssistantState: state,
    locationAssistantSelectedDraftIds: new Set(products.map(product => product.id)),
    storeMapDataLoaded: true, pendingLocationProducts: products, supabaseClient: {},
    async ensureVendorOperationalSession() { return session; },
    async uploadLocationAssistantPhoto() { return { url: '', path: null }; },
    async loadStoreMapData() { sandbox.storeMapDataLoaded = true; },
    async loadInternalCatalog() {}, async fetchPendingLocationProducts() { return []; },
    updatePendingLocationIndicators() {}, createEmptyLocationAssistantState() { return { step: 'list' }; },
    renderLocationAssistant() {}, showToast(message) { messages.push(message); },
    window: { WmsLocationAssignment: Assignment, OperationalApi: {
      async locateCatalogProductDraft(input) { calls.push(input); return { draft_id: input.draftId, status: 'PENDING_REVIEW' }; }
    } }
  };
  vm.createContext(sandbox);
  vm.runInContext(handlers, sandbox);
  return { sandbox, state, calls, messages, nodes, status: () => nodes.get('location-assistant-status') };
}

test('sector-only UI reports partial confirmation and retries the same operation without repeating confirmed products', async () => {
  const f = fixture(); const api = f.sandbox.window.OperationalApi;
  const original = api.locateCatalogProductDraft; let fail = true;
  api.locateCatalogProductDraft = async input => {
    if (input.draftId === id(4) && fail) throw new Error('Sin conexión');
    return original(input);
  };
  const first = await f.sandbox.saveSectorOnlyLocation();
  assert.equal(first.confirmed.length, 1);
  assert.match(f.status().textContent, /1 de 3 confirmados.*Quedan 2 pendientes.*Sin conexión/);
  assert.equal(f.status().dataset.state, 'error');
  assert.equal(f.sandbox.locationAssistantSelectedDraftIds.size, 2);
  assert.equal(f.nodes.get('location-assistant-toolbar').inert, false);
  fail = false;
  assert.equal((await f.sandbox.saveSectorOnlyLocation()).confirmed.length, 3);
  assert.match(f.status().textContent, /3 producto\(s\) confirmado\(s\).*Se conservaron sus cantidades/);
  assert.equal(f.calls.filter(input => input.draftId === id(3)).length, 1);
  assert.equal(f.calls[0].location.location_type, 'STORE');
  assert.deepEqual(f.state.products.map(product => product.stock_quantity), [3, 4, 5]);
});

test('UI blocks double clicks before asynchronous session verification and releases the controls after completion', async () => {
  const f = fixture(); let release;
  f.sandbox.ensureVendorOperationalSession = async () => new Promise(resolve => { release = resolve; });
  const first = f.sandbox.persistLocationAssistant();
  assert.equal(f.nodes.get('location-assistant-content').inert, true);
  await f.sandbox.persistLocationAssistant();
  assert.equal(f.calls.length, 0);
  release({ isVerified: true, tenantId: id(1), userId: id(2) });
  await first;
  assert.equal(f.calls.length, 3);
  assert.equal(f.nodes.get('location-assistant-content').inert, false);
});

test('refresh failure does not hide confirmed writes or offer a false new transfer', async () => {
  const f = fixture();
  f.sandbox.loadStoreMapData = async () => { throw new Error('Sin red'); };
  f.sandbox.fetchPendingLocationProducts = async () => { throw new Error('Sin red'); };
  await f.sandbox.persistLocationAssistant();
  assert.equal(f.status().dataset.state, 'success');
  assert.match(f.status().textContent, /Falta actualizar: mapa, lista de pendientes/);
  await f.sandbox.persistLocationAssistant();
  assert.equal(f.calls.length, 3, 'a retry only refreshes an already-confirmed batch');
});

test('session errors, changed retry destination and multi-slot actions never report a false assignment', async () => {
  const f = fixture();
  f.sandbox.ensureVendorOperationalSession = async () => null;
  await f.sandbox.saveSectorOnlyLocation();
  assert.equal(f.calls.length, 0);
  assert.equal(f.status().dataset.state, 'error');
  const retry = fixture();
  retry.sandbox.window.OperationalApi.locateCatalogProductDraft = async () => { throw new Error('Sin red'); };
  await retry.sandbox.saveSectorOnlyLocation();
  retry.state.zone = { ...retry.state.zone, prefix: 'S4' };
  await retry.sandbox.saveSectorOnlyLocation();
  assert.match(retry.status().textContent, /mismo destino/);
  const multi = fixture(); multi.state.isMultiSlot = true;
  await multi.sandbox.saveSectorOnlyLocation();
  assert.match(multi.status().textContent, /Traslados WMS/);
  assert.equal(multi.calls.length, 0);
});

test('sector refinement selects only the pending position in that sector, never the first cached stock row', () => {
  const f = fixture();
  const row = { product_id: id(3), product_code: 'MACETA', stock: 4 };
  f.sandbox.window.storeLocationProducts = [
    { ...row, floor_level: 1, wms_code: 'S1-GENERAL', location_id: id(10) },
    { ...row, floor_level: 3, wms_code: 'S3-GENERAL', location_id: id(11) }
  ];
  f.sandbox.LOCATION_ZONE_OPTIONS = [{ id: 'S3', floor_level: 3, label: 'Sector 3' }];
  f.sandbox.switchVendorTab = () => {};
  const refinement = source.slice(source.indexOf('function startBatchSectorRefinement'), source.indexOf('function continueLocationAssistant'));
  vm.runInContext(refinement, f.sandbox);
  f.sandbox.startBatchSectorRefinement(['MACETA'], 3);
  assert.equal(f.sandbox.locationAssistantState.products[0].location_id, id(11));
  assert.equal(f.sandbox.locationAssistantState.step, 'type');
  f.sandbox.window.storeLocationProducts.push({ ...row, floor_level: 3, wms_code: 'S3-GENERAL', location_id: id(12) });
  f.sandbox.startBatchSectorRefinement(['MACETA'], 3);
  assert.match(f.messages.at(-1), /única ubicación/);
  const edit = source.slice(source.indexOf('function openEditProductLocation'), source.indexOf('function renderLocationChoiceCards'));
  assert.match(edit, /targetProduct = \{ \.\.\.targetProduct, location_id: null \}/);
});
