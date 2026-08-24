import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import operationalApi from '../operational-api.js';

const ids = Object.freeze({
  tenant: '11111111-1111-4111-8111-111111111111',
  user: '22222222-2222-4222-8222-222222222222',
  product: '33333333-3333-4333-8333-333333333333',
  origin: '44444444-4444-4444-8444-444444444444',
  destination: '55555555-5555-4555-8555-555555555555',
  count: '66666666-6666-4666-8666-666666666666'
});

function createRpcRecorder() {
  const calls = [];
  return {
    calls,
    supabaseClient: {
      async rpc(name, parameters) {
        calls.push({ name, parameters });
        return { data: { ok: true }, error: null };
      }
    }
  };
}

test('OperationalApi envía transferencias y conteos WMS con IDs canónicos y tenant verificado', async () => {
  const { calls, supabaseClient } = createRpcRecorder();
  const authContext = { isVerified: true, tenantId: ids.tenant, userId: ids.user };

  await operationalApi.transferInventory({
    supabaseClient,
    authContext,
    productId: ids.product,
    originLocationId: ids.origin,
    destinationLocationId: ids.destination,
    quantity: 3,
    notes: 'Reposición de salón',
    idempotencyKey: 'transfer-001'
  });
  await operationalApi.submitInventoryCount({
    supabaseClient,
    authContext,
    productId: ids.product,
    locationId: ids.destination,
    countedQuantity: 7,
    notes: 'Conteo turno tarde',
    idempotencyKey: 'count-001'
  });
  await operationalApi.reviewInventoryCount({
    supabaseClient,
    authContext,
    countId: ids.count,
    decision: 'APPROVE',
    reason: 'Conteo verificado',
    idempotencyKey: 'count-review-001'
  });

  assert.deepEqual(calls.map(call => call.name), [
    'transfer_inventory_v2',
    'submit_inventory_count_v2',
    'review_inventory_count_v2'
  ]);
  assert.deepEqual(calls[0].parameters, {
    p_tenant_id: ids.tenant,
    p_product_id: ids.product,
    p_origin_location_id: ids.origin,
    p_destination_location_id: ids.destination,
    p_quantity: 3,
    p_notes: 'Reposición de salón',
    p_idempotency_key: 'transfer-001'
  });
  assert.equal(calls[1].parameters.p_counted_quantity, 7);
  assert.equal(calls[2].parameters.p_decision, 'APPROVE');
});

test('OperationalApi bloquea transferencias/conteos locales o inconsistentes antes del RPC', async () => {
  const { calls, supabaseClient } = createRpcRecorder();
  const authContext = { isVerified: true, tenantId: ids.tenant, userId: ids.user };

  await assert.rejects(
    operationalApi.transferInventory({
      supabaseClient,
      authContext,
      productId: 'producto-local',
      originLocationId: ids.origin,
      destinationLocationId: ids.destination,
      quantity: 1,
      idempotencyKey: 'invalid-transfer'
    }),
    error => error.code === 'INVALID_INVENTORY_TRANSFER'
  );
  await assert.rejects(
    operationalApi.transferInventory({
      supabaseClient,
      authContext,
      productId: ids.product,
      originLocationId: ids.origin,
      destinationLocationId: ids.origin,
      quantity: 1,
      idempotencyKey: 'same-location'
    }),
    error => error.code === 'INVALID_INVENTORY_TRANSFER'
  );
  await assert.rejects(
    operationalApi.submitInventoryCount({
      supabaseClient,
      authContext,
      productId: ids.product,
      locationId: ids.origin,
      countedQuantity: -1,
      idempotencyKey: 'negative-count'
    }),
    error => error.code === 'INVALID_INVENTORY_COUNT'
  );
  await assert.rejects(
    operationalApi.reviewInventoryCount({
      supabaseClient,
      authContext,
      countId: ids.count,
      decision: 'BORRAR',
      reason: 'No corresponde',
      idempotencyKey: 'invalid-review'
    }),
    error => error.code === 'INVALID_INVENTORY_COUNT_REVIEW'
  );
  await assert.rejects(
    operationalApi.submitInventoryCount({
      supabaseClient,
      authContext,
      productId: ids.product,
      locationId: ids.origin,
      countedQuantity: 1,
      idempotencyKey: 'short'
    }),
    error => error.code === 'INVALID_INVENTORY_COUNT'
  );
  assert.equal(calls.length, 0);
});

test('la UI WMS usa saldos, conteos y ledger centrales y no fabrica stock de demostración', () => {
  const sellerSource = fs.readFileSync(path.join(process.cwd(), 'vendedor.js'), 'utf8');
  const sellerHtml = fs.readFileSync(path.join(process.cwd(), 'vendedor.html'), 'utf8');

  assert.match(sellerSource, /from\('inventory_locations_v2'\)/);
  assert.match(sellerSource, /from\('inventory_balances_v2'\)/);
  assert.match(sellerSource, /from\('inventory_ledger_v2'\)/);
  assert.match(sellerSource, /from\('inventory_count_status_v2'\)/);
  assert.match(sellerSource, /location_type: location\.location_type/);
  assert.match(sellerSource, /is_default: location\.is_default === true/);
  assert.match(sellerSource, /metadata: \{ \.\.\.location\.metadata, photo_url: photoUrl, photo_path: photoPath \}/);
  assert.match(sellerSource, /OperationalApi\.transferInventory\(/);
  assert.match(sellerSource, /OperationalApi\.submitInventoryCount\(/);
  assert.match(sellerSource, /OperationalApi\.reviewInventoryCount\(/);
  assert.doesNotMatch(sellerSource, /boeweb_wms_inventory_locations_v1/);
  assert.doesNotMatch(sellerSource, /boeweb_product_locations_v1/);
  assert.doesNotMatch(sellerSource, /boeweb_store_shelf_photos_v1/);
  assert.doesNotMatch(sellerSource, /from\('store_shelves'\)/);
  assert.doesNotMatch(sellerSource, /wms-loc-1/);
  assert.doesNotMatch(sellerSource, /saveWmsLocations\(/);
  assert.match(sellerSource, /La asignación rápida local fue desactivada/);
  assert.match(sellerSource, /el conteo no modifica stock/);
  assert.match(sellerSource, /\['ADMIN', 'SUPERVISOR', 'DEPOSITO'\]/);
  assert.doesNotMatch(sellerHtml, /módulo demo seleccionado/i);
  assert.doesNotMatch(sellerHtml, /id="wms-tr-dest-level"/);
  assert.doesNotMatch(sellerHtml, /id="wms-tr-dest-sector"/);
});
