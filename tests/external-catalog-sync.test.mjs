import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import OperationalApi from '../operational-api.js';

const testIds = {
  tenant: '11111111-1111-4111-8111-111111111111',
  user: '22222222-2222-4222-8222-222222222222',
  source: '33333333-3333-4333-8333-333333333333',
  offer: '44444444-4444-4444-8444-444444444444'
};

test('1. OperationalApi.upsertExternalCatalogSource: envía parámetros correctos a RPC', async () => {
  const fakeAuthContext = {
    isVerified: true,
    tenantId: testIds.tenant,
    userId: testIds.user
  };

  let rpcCalled = null;
  const fakeSupabase = {
    rpc: async (name, params) => {
      rpcCalled = { name, params };
      return { data: { ok: true, id: testIds.source, name: params.p_name }, error: null };
    }
  };

  const res = await OperationalApi.upsertExternalCatalogSource({
    supabaseClient: fakeSupabase,
    authContext: fakeAuthContext,
    source: {
      id: testIds.source,
      source_type: 'B2B_SUPPLIER',
      name: 'Distribuidora GrowTech B2B',
      contact_info: '+5493415559999',
      estimated_days: 2,
      active: true
    }
  });

  assert.equal(res.ok, true);
  assert.equal(rpcCalled.name, 'upsert_external_catalog_source_v2');
  assert.equal(rpcCalled.params.p_source_type, 'B2B_SUPPLIER');
  assert.equal(rpcCalled.params.p_name, 'Distribuidora GrowTech B2B');
  assert.equal(rpcCalled.params.p_estimated_days, 2);
});

test('2. OperationalApi.upsertExternalCatalogOffer: inserta oferta con costo y precio venta', async () => {
  const fakeAuthContext = {
    isVerified: true,
    tenantId: testIds.tenant,
    userId: testIds.user
  };

  let rpcCalled = null;
  const fakeSupabase = {
    rpc: async (name, params) => {
      rpcCalled = { name, params };
      return { data: { ok: true, id: testIds.offer, external_sku: params.p_external_sku }, error: null };
    }
  };

  const res = await OperationalApi.upsertExternalCatalogOffer({
    supabaseClient: fakeSupabase,
    authContext: fakeAuthContext,
    offer: {
      id: testIds.offer,
      source_id: testIds.source,
      external_sku: 'LED-Q150',
      name: 'Panel LED Quantum 150W Samsung LM301H',
      category: 'Iluminación',
      cost_price: 130000,
      retail_price: 185000,
      available_units: 25,
      active: true
    }
  });

  assert.equal(res.ok, true);
  assert.equal(rpcCalled.name, 'upsert_external_catalog_offer_v2');
  assert.equal(rpcCalled.params.p_source_id, testIds.source);
  assert.equal(rpcCalled.params.p_external_sku, 'LED-Q150');
  assert.equal(rpcCalled.params.p_cost_price, 130000);
  assert.equal(rpcCalled.params.p_retail_price, 185000);
});

test('3. OperationalApi.fetchExternalCatalogOffers: lista ofertas activas', async () => {
  const fakeAuthContext = {
    isVerified: true,
    tenantId: testIds.tenant,
    userId: testIds.user
  };

  let rpcCalled = null;
  const fakeSupabase = {
    rpc: async (name, params) => {
      rpcCalled = { name, params };
      return {
        data: [
          {
            id: testIds.offer,
            source_id: testIds.source,
            source_name: 'Distribuidora GrowTech B2B',
            external_sku: 'LED-Q150',
            name: 'Panel LED Quantum 150W',
            retail_price: 185000
          }
        ],
        error: null
      };
    }
  };

  const offers = await OperationalApi.fetchExternalCatalogOffers({
    supabaseClient: fakeSupabase,
    authContext: fakeAuthContext,
    sourceType: 'B2B_SUPPLIER',
    query: 'LED',
    limit: 80
  });

  assert.equal(rpcCalled.name, 'search_external_catalog_offers_v2');
  assert.equal(rpcCalled.params.p_source_type, 'B2B_SUPPLIER');
  assert.equal(rpcCalled.params.p_query, 'LED');
  assert.equal(rpcCalled.params.p_limit, 80);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].external_sku, 'LED-Q150');
});

test('4. El catálogo externo no expone costos por acceso directo al vendedor', () => {
  const baseSql = fs.readFileSync(path.resolve('scripts', 'migrations', '012_pos_flexible_sales.sql'), 'utf8');
  const syncSql = fs.readFileSync(path.resolve('scripts', 'migrations', '014_external_catalog_sync.sql'), 'utf8');
  assert.match(baseSql, /REVOKE ALL ON public\.sale_fulfillments_v2,[\s\S]+FROM PUBLIC, anon, authenticated;/);
  assert.doesNotMatch(baseSql, /GRANT SELECT[^;]+external_catalog_offers_v2[^;]+TO authenticated/is);
  assert.match(syncSql, /'cost_price',\s*CASE WHEN v_can_view_cost THEN o\.cost_price ELSE NULL END/);
  assert.match(syncSql, /ELSE jsonb_strip_nulls\(jsonb_build_object\(/);
  assert.match(syncSql, /'image_url', o\.metadata->'image_url'/);
  assert.doesNotMatch(syncSql, /ELSE o\.metadata\s*-\s*'cost'/);
  assert.match(syncSql, /t\.status = 'ACTIVE'/);
  assert.match(syncSql, /v_active_only := COALESCE\(p_active_only, true\) OR NOT v_can_view_cost/,
    'Los vendedores sólo deben poder consultar fuentes y ofertas activas');
});

test('5. Los upserts de fuentes y ofertas son seguros ante sincronizaciones concurrentes', () => {
  const sql = fs.readFileSync(path.resolve('scripts', 'migrations', '014_external_catalog_sync.sql'), 'utf8');
  assert.match(sql, /ON CONFLICT \(tenant_id, source_type, name\) DO UPDATE/);
  assert.match(sql, /ON CONFLICT \(tenant_id, source_id, external_sku\) DO UPDATE/);
  assert.match(sql, /octet_length\(COALESCE\(p_metadata/);
});
