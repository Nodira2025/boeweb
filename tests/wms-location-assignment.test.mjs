import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Assignment from '../wms-location-assignment.js';

const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = { isVerified: true, tenantId: id(1), userId: id(2), role: 'ADMIN' };
const destination = { code: 'S3-GENERAL', name: 'Sector 3', location_type: 'STORE', metadata: { floor_level: 3, shelf_code: 'GENERAL', is_sector_only: true } };
const draft = n => ({ id: id(n), status: 'PENDING_LOCATION', name: `Producto ${n}`, stock_quantity: n });
function job(products, location = destination) {
  let serial = 0;
  return Assignment.createJob({ products, location, ...context, randomId: () => id(900 + serial++) });
}

function fixture() {
  const calls = [];
  const balances = [];
  const locations = [];
  const confirmed = new Map();
  const client = { from(table) {
    const filters = [];
    let count = Infinity;
    const query = { select() { return this; }, eq(key, value) { filters.push(row => row[key] === value); return this; },
      gt(key, value) { filters.push(row => row[key] > value); return this; }, order() { return this; },
      limit(value) { count = value; return this; },
      async maybeSingle() { const result = await this; return { ...result, data: result.data?.[0] || null }; },
      async then(resolve, reject) {
        try {
          const rows = table === 'inventory_balances_v2' ? balances : locations;
          calls.push({ read: table });
          resolve({ data: rows.filter(row => filters.every(filter => filter(row))).slice(0, count).map(row => ({ ...row })) });
        } catch (error) { reject(error); }
      }
    };
    return query;
  } };
  const api = {
    async locateCatalogProductDraft(input) { calls.push({ locate: input }); return { draft_id: input.draftId, status: 'PENDING_REVIEW' }; },
    async upsertInventoryLocation(input) {
      calls.push({ create: input });
      const location = { ...input.location, id: id(80), tenant_id: context.tenantId, active: true };
      locations.push(location);
      return { location_id: location.id };
    },
    async transferInventory(input) {
      calls.push({ transfer: input });
      if (confirmed.has(input.idempotencyKey)) return confirmed.get(input.idempotencyKey);
      const origin = balances.find(row => row.location_id === input.originLocationId && row.product_id === input.productId);
      assert.ok(origin.available >= input.quantity);
      let target = balances.find(row => row.location_id === input.destinationLocationId && row.product_id === input.productId);
      if (!target) { target = { tenant_id: context.tenantId, product_id: input.productId, location_id: input.destinationLocationId, on_hand: 0, available: 0, reserved: 0 }; balances.push(target); }
      origin.on_hand -= input.quantity; origin.available -= input.quantity;
      target.on_hand += input.quantity; target.available += input.quantity;
      const result = { transfer_id: id(90), product_id: input.productId, destination_location_id: input.destinationLocationId };
      confirmed.set(input.idempotencyKey, result);
      return result;
    }
  };
  function stock(product = 10, location = 70, quantity = 7, reserved = 0, tenantId = context.tenantId) {
    balances.push({ tenant_id: tenantId, product_id: id(product), location_id: id(location), on_hand: quantity, reserved, available: quantity - reserved });
  }
  return { calls, balances, locations, confirmed, stock, api, options: { supabaseClient: client, api, authContext: context } };
}

test('bulk draft placement uses the central RPC and preserves each distinct stock quantity', async () => {
  const f = fixture(); const products = [draft(10), draft(11), draft(12)];
  const batch = job(products);
  const result = await Assignment.runJob(batch, f.options);
  assert.equal(result.complete, true);
  assert.equal(result.confirmed.length, 3);
  assert.deepEqual(f.calls.map(call => call.locate.draftId), products.map(product => product.id));
  assert.deepEqual(products.map(product => product.stock_quantity), [10, 11, 12]);
  assert.ok(f.calls.every(call => !('stock_quantity' in call.locate.location.metadata)));
});

test('drafts projected on the map retain their identity even without a status field', async () => {
  const f = fixture();
  const batch = job([{ id: id(10), product_id: id(10), draft_id: id(10), is_draft: true }]);
  assert.equal((await Assignment.runJob(batch, f.options)).complete, true);
  assert.equal(f.calls[0].locate.draftId, id(10));
  assert.throws(() => job([{ id: id(10), status: 'APPROVED' }]), /identificar/);
  assert.throws(() => job([{ product_code: 'SKU-NO-UUID' }]), /identificar/);
  assert.throws(() => job([{ draft_id: id(10), status: 'REJECTED' }]), /rechazado/);
  assert.deepEqual(Assignment.identity({ draft_id: id(10), product_id: id(11), status: 'APPROVED', is_draft: true }), { kind: 'stock', id: id(11) });
});

test('existing stock is transferred, not merely represented by a new empty shelf', async () => {
  const f = fixture(); f.stock(); f.stock(10, 70, 99, 0, id(99));
  const result = await Assignment.runJob(job([{ product_id: id(10), location_id: id(70), stock: 999 }]), f.options);
  assert.equal(result.complete, true);
  assert.equal(f.calls.find(call => call.transfer).transfer.quantity, 7, 'quantity comes from a tenant-scoped central read');
  assert.equal(f.balances.find(row => row.location_id === id(70) && row.tenant_id === context.tenantId).on_hand, 0);
  assert.equal(f.balances.find(row => row.location_id === id(80)).on_hand, 7);
  assert.equal(f.balances.find(row => row.tenant_id === id(99)).on_hand, 99);
  assert.equal(f.calls.find(call => call.create).create.location.location_type, 'STORE');
});

test('an active existing destination is reused without overwriting shared metadata or default flags', async () => {
  const f = fixture(); f.stock();
  f.locations.push({ id: id(80), code: destination.code, active: true, tenant_id: context.tenantId, metadata: { retained: true } });
  const result = await Assignment.runJob(job([{ id: id(10) }]), f.options);
  assert.equal(result.complete, true);
  assert.equal(f.calls.filter(call => call.create).length, 0);
  assert.deepEqual(f.locations[0].metadata, { retained: true });
});

test('reserved, missing or ambiguous stock never produces a fabricated placement', async () => {
  for (const mode of ['reserved', 'missing', 'ambiguous']) {
    const f = fixture();
    if (mode === 'reserved') f.stock(10, 70, 7, 2);
    if (mode === 'ambiguous') { f.stock(); f.stock(10, 71); }
    const result = await Assignment.runJob(job([{ id: id(10) }]), f.options);
    assert.equal(result.complete, false, mode);
    assert.equal(result.confirmed.length, 0);
    assert.equal(f.calls.filter(call => call.create || call.transfer).length, 0);
  }
});

test('explicit origins allow a multi-location product to move only the selected position', async () => {
  const f = fixture(); f.stock(); f.stock(10, 71, 3);
  await Assignment.runJob(job([{ id: id(10), location_id: id(70) }]), f.options);
  assert.equal(f.balances.find(row => row.location_id === id(71)).on_hand, 3);
});

test('partial failures keep confirmed entries and retry only the remaining entries with stable keys', async () => {
  const f = fixture(); const batch = job([draft(10), draft(11), draft(12)]);
  const original = f.api.locateCatalogProductDraft; let failing = true;
  f.api.locateCatalogProductDraft = async input => {
    const result = await original(input);
    if (input.draftId === id(11) && failing) throw new Error('Sin conexión');
    return result;
  };
  const first = await Assignment.runJob(batch, f.options);
  assert.equal(first.confirmed.length, 1); assert.equal(first.pending.length, 2);
  assert.equal(f.calls.length, 2);
  const retryKey = f.calls[1].locate.idempotencyKey;
  failing = false;
  const retried = await Assignment.runJob(batch, f.options);
  assert.equal(retried.confirmed.length, 3);
  assert.equal(f.calls[2].locate.idempotencyKey, retryKey);
  assert.equal(f.calls.filter(call => call.locate.draftId === id(10)).length, 1);
});

test('a lost response after a committed transfer retries the same command without doubling stock', async () => {
  const f = fixture(); f.stock(); const batch = job([{ id: id(10) }]);
  const original = f.api.transferInventory; let lost = true;
  f.api.transferInventory = async input => { const result = await original(input); if (lost) throw new Error('Respuesta perdida'); return result; };
  assert.equal((await Assignment.runJob(batch, f.options)).complete, false);
  assert.equal(f.balances.find(row => row.location_id === id(80)).on_hand, 7);
  lost = false;
  assert.equal((await Assignment.runJob(batch, f.options)).complete, true);
  assert.equal(f.balances.find(row => row.location_id === id(80)).on_hand, 7);
  assert.equal(f.confirmed.size, 1);
  const calls = f.calls.filter(call => call.transfer).map(call => call.transfer);
  assert.deepEqual(calls[0], calls[1]);
});

test('simultaneous submissions, switched sessions and unconfirmed responses do not report success', async () => {
  const f = fixture(); const batch = job([draft(10)]);
  let release;
  f.api.locateCatalogProductDraft = async () => new Promise(resolve => { release = resolve; });
  const running = Assignment.runJob(batch, f.options);
  await assert.rejects(Assignment.runJob(batch, f.options), /Ya se está/);
  release({});
  assert.equal((await running).complete, false);
  await assert.rejects(Assignment.runJob(batch, { ...f.options, authContext: { ...context, tenantId: id(77) } }), /sesión cambió/);
});

test('inactive destinations stay inactive and authorization errors remain visible', async () => {
  const f = fixture(); f.stock();
  f.locations.push({ id: id(80), code: destination.code, active: false, tenant_id: context.tenantId });
  const result = await Assignment.runJob(job([{ id: id(10) }]), f.options);
  assert.match(result.failure.message, /inactivo/);
  assert.equal(f.calls.filter(call => call.create || call.transfer).length, 0);
  f.api.locateCatalogProductDraft = async () => { throw new Error('Rol operativo requerido'); };
  assert.match((await Assignment.runJob(job([draft(11)]), f.options)).failure.message, /Rol operativo/);
});

test('assistant wiring removes local writes, swallowed errors, stock edits and invalid SECTOR types', () => {
  const source = fs.readFileSync(new URL('../vendedor.js', import.meta.url), 'utf8');
  const flow = source.slice(source.indexOf('function setLocationAssignmentBusy'), source.indexOf('function startBatchSectorRefinement'));
  assert.doesNotMatch(flow, /saveLocalProductLocation|updateCatalogProductDraft|location_type: 'SECTOR'|\.catch\(/);
  assert.match(flow, /WmsLocationAssignment\.runJob/);
  assert.match(flow, /result\.confirmed/);
  assert.match(flow, /finally \{ setLocationAssignmentBusy\(false\)/);
  assert.doesNotMatch(source, /id="location-assistant-stock-input"/);
  const html = fs.readFileSync(new URL('../vendedor.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('src="wms-location-assignment.js') < html.indexOf('src="vendedor.js'));
});
