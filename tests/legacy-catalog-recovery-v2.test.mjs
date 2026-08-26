import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import OperationalApi from '../operational-api.js';

const root = path.resolve('.');
const migration = fs.readFileSync(
  path.join(root, 'scripts', 'migrations', '015_legacy_catalog_recovery.sql'),
  'utf8'
);
const seller = fs.readFileSync(path.join(root, 'vendedor.js'), 'utf8');
const verifier = fs.readFileSync(
  path.join(root, 'scripts', 'verify_operational_v2_deployment.js'),
  'utf8'
);

function functionSource(source, name, nextMarker) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(nextMarker, start + 1);
  assert.notEqual(start, -1, `No se encontró ${name}`);
  return source.slice(start, end > start ? end : source.length);
}

test('015 recupera el catálogo legacy de forma transaccional e idempotente', () => {
  assert.match(migration, /^\s*BEGIN;/im);
  assert.match(migration, /COMMIT;\s*$/i);
  assert.match(migration, /VALUES\s*\(\s*'015',\s*'legacy_catalog_recovery'/i);
  assert.match(migration, /ON CONFLICT \(tenant_id, sku\) DO NOTHING/i);
  assert.match(migration, /ON CONFLICT \(tenant_id, source_id, external_sku\) DO UPDATE/i);
  assert.match(migration, /ON CONFLICT \(tenant_id, source_type, name\) DO UPDATE/i);
  assert.doesNotMatch(
    migration,
    /(?:DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?|DROP\s+TABLE)\s+(?:public\.)?(?:products|supplier_products|suppliers)\b/i,
    'La recuperación nunca debe borrar las tablas históricas'
  );
});

test('015 separa stock físico, B2B y datos anómalos sin inventar existencias', () => {
  assert.match(migration, /sp\.supplier_id = 'local_store'/i);
  assert.match(migration, /sp\.supplier_id <> 'local_store'/i);
  assert.match(migration, /issue_code IN \('SUSPICIOUS_STOCK', 'INVALID_PRICE', 'SKU_CONFLICT'\)/i);
  assert.match(migration, /COALESCE\(sp\.stock, 0\) > p_max_safe_stock/i);
  assert.match(migration, /ELSE 0::numeric[\s\S]+END AS safe_stock/i);
  assert.match(migration, /'stock_review_required'/i);
  assert.match(migration, /'OPENING'/i);
  assert.match(migration, /ON CONFLICT \(tenant_id, idempotency_key\) DO NOTHING/i);
  assert.match(
    migration,
    /'legacy-local-opening:'\s*\|\|\s*\(cp\.metadata->>'legacy_local_supplier_row_id'\)/i,
    'La precedencia no debe convertir el prefijo de idempotencia en JSONB'
  );
  assert.match(migration, /round\(\(sp\.price \* 0\.70\)::numeric, 2\) AS cost_price/i);
  assert.match(migration, /round\(sp\.price::numeric, 2\) AS retail_price/i);
  assert.match(migration, /_legacy_product_draft_json_v2/i);
  assert.match(migration, /draft\.details->>'barcode'/i);
  assert.match(migration, /'shelf_code', ll\.shelf_code/i);
  assert.match(migration, /ll\.reported_stock <= p_max_safe_stock/i,
    'El producto con stock sospechoso debe quedar inactivo');
  assert.match(migration, /SET active = false[\s\S]+legacy_missing/i,
    'Las ofertas que desaparecen del legacy deben desactivarse sin borrarse');
  assert.match(migration, /SKU_CONFLICT[\s\S]+No se importó stock ni se sobrescribió/i);
});

test('015 cierra helpers privados y exige administración o superadmin', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\._recover_legacy_local_catalog_v2[\s\S]+service_role;/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\._sync_legacy_b2b_catalog_v2[\s\S]+service_role;/i);
  assert.match(migration, /public\.is_superadmin\(\)[\s\S]+public\.operational_has_tenant_role/i);
  assert.match(migration, /p_tenant_id <> '11111111-1111-1111-1111-111111111111'::uuid/i,
    'Las tablas globales legacy no se pueden copiar a otro tenant');
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.sync_legacy_b2b_catalog_v2\(UUID\)[\s\S]+TO authenticated;/i);
  assert.doesNotMatch(migration, /GRANT EXECUTE[^;]+sync_legacy_b2b_catalog_v2[^;]+TO anon/i);
});

test('OperationalApi recupera catálogo físico y B2B en una sola operación server-side', async () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  let call;
  const supabaseClient = {
    rpc: async (name, params) => {
      call = { name, params };
      return { data: { ok: true, sources: 4, offers: 8210 }, error: null };
    }
  };
  const result = await OperationalApi.recoverLegacyCatalogs({
    supabaseClient,
    authContext: { isVerified: true, tenantId, userId: '22222222-2222-4222-8222-222222222222' }
  });

  assert.deepEqual(call, {
    name: 'recover_legacy_catalogs_v2',
    params: { p_tenant_id: tenantId }
  });
  assert.equal(result.offers, 8210);
});

test('el POS refresca B2B y muestra recuperación accionable en vez de una grilla vacía', () => {
  const syncFlow = functionSource(
    seller,
    'syncLegacyB2BCatalogToPos',
    'window.syncLegacyB2BCatalogToPos'
  );
  assert.match(syncFlow, /OperationalApi\.recoverLegacyCatalogs/);
  assert.match(syncFlow, /loadInternalCatalog\(\)/);
  assert.match(syncFlow, /loadExternalCatalogOffers\('', null\)/);
  assert.doesNotMatch(syncFlow, /baseProducts|Promise\.all\(offers\.map/);
  assert.match(seller, /fetchB2BProducts\(true\)[\s\S]+No se pudo actualizar el catálogo B2B/);
  assert.match(seller, /El catálogo para encargos todavía no está sincronizado/);
  assert.match(seller, /Este catálogo todavía no fue recuperado/);
  assert.match(seller, /Recuperar catálogos/);
  assert.match(seller, /refreshPosExternalCatalogSearch\(query/,
    'La búsqueda escrita debe consultar las ofertas fuera de la primera página');
  assert.match(seller, /await loadExternalCatalogOffers\(cleanCode/,
    'Enter y escáner deben tener fallback remoto');
  assert.match(seller, /refreshPosExternalCatalogSearch\(transcript/,
    'El dictado por voz también debe buscar fuera de la primera página');
  assert.match(seller, /El catálogo externo no está disponible/,
    'Una falla remota no se debe presentar como producto inexistente');
  assert.match(seller, /nearby-store-wa-btn[\s\S]+addEventListener\('click'/,
    'WhatsApp de tiendas locales no debe interpolar datos en onclick');
  assert.doesNotMatch(seller, /onclick="orderNearbyProductViaWa\(/,
    'Los datos de proveedor no deben entrar en JavaScript inline');
});

test('la búsqueda externa está saneada y limitada para no congelar el POS', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.search_external_catalog_offers_v2/i);
  assert.match(migration, /v_limit NOT BETWEEN 1 AND 200/i);
  assert.match(migration, /LIMIT v_limit/i);
  assert.match(migration, /'source_contact_info', source\.contact_info/i);
  assert.match(migration, /'source_phone', regexp_replace/i);
  assert.match(migration, /CASE WHEN v_can_view_cost THEN offer\.cost_price ELSE NULL END/i);
  assert.doesNotMatch(migration, /GRANT EXECUTE[^;]+search_external_catalog_offers_v2[^;]+TO anon/i);
});

test('el verificador de producción exige migración 015 y catálogos no vacíos', () => {
  assert.match(verifier, /Array\.from\(\{ length: 17 \}/);
  assert.match(verifier, /canonicalCatalog\.count\) > 0/);
  assert.match(verifier, /externalSources\.count\) > 0/);
  assert.match(verifier, /externalOffers\.count\) > 0/);
  assert.match(verifier, /publicCatalog\.count\) > 0/);
  assert.match(verifier, /publicAccess: 'OK_NON_EMPTY'/);
});
