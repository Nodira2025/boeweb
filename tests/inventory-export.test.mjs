import test from 'node:test';
import assert from 'node:assert/strict';
import exporter from '../inventory-export.js';
import XLSX from 'xlsx';
import StoreCatalog from '../store-catalog.js';

const context = { isVerified: true, tenantId: 'tenant-a', userId: 'admin-a', role: 'ADMIN' };
const options = { context, isPrivateProduct: StoreCatalog.isPrivateProduct, startedAt: '2026-09-11T12:00:00Z', finishedAt: '2026-09-11T12:00:01Z' };
const fixture = {
  products: [
    { id: 'p1', sku: '00012', barcode: '0001234567890', name: '=HYPERLINK("x")', price: '125.50', cost_price: '80', currency: 'ARS', active: true, track_stock: true },
    { id: 'p2', sku: '00013', name: 'Sin ubicación', price: 20, cost_price: null, currency: 'ARS', active: false, track_stock: true },
    { id: 'service', sku: 'S1', name: 'Servicio', track_stock: false },
    { id: 'private', sku: 'R1', name: 'Privado', category: 'REPROCAM', track_stock: true }
  ],
  locations: [
    { id: 'l1', code: 'PI-M04-N3-I', name: 'Estante', active: true, is_sellable: true, metadata: {} },
    { id: 'l2', code: 'DEP', name: 'Depósito', active: true, is_sellable: false },
    { id: 'l3', code: 'OLD', name: 'Ubicación cerrada', active: false, is_sellable: true }
  ],
  balances: [
    { product_id: 'p1', location_id: 'l1', on_hand: '10.5', reserved: '2', available: '8.5' },
    { product_id: 'p1', location_id: 'l2', on_hand: '4', reserved: '1', available: '3' },
    { product_id: 'p1', location_id: 'l3', on_hand: '2', reserved: '0', available: '2' },
    { product_id: 'private', location_id: 'l1', on_hand: 99, reserved: 0, available: 99 }
  ],
  sources: [
    { id: 's1', source_type: 'B2B_SUPPLIER', name: 'Mayorista', active: true, estimated_days: 3 },
    { id: 's2', source_type: 'LOCAL_STORE', name: 'Local', contact_info: '123 · Calle 123', active: false, estimated_days: 0 }
  ],
  offers: [
    { id: 'o1', source_id: 's1', external_sku: '00012', name: 'Oferta mayorista', available_units: '100', cost_price: 10, retail_price: 15, active: true },
    { id: 'o2', source_id: 's2', external_sku: '00012', name: 'Oferta local', available_units: 0, cost_price: 12, retail_price: 17, active: false },
    { id: 'o3', source_id: 's1', name: 'Privado', metadata: { is_reprocann: true } }
  ]
};

test('exporta existencias completas sin duplicar productos ni sumar stock externo', () => {
  const sheets = exporter.buildSheets(fixture, options);
  assert.deepEqual(sheets.map(sheet => sheet.name), ['Resumen', 'Stock propio', 'Ubicaciones', 'B2B', 'Locales']);
  const own = sheets[1].rows;
  assert.equal(own.length, 3);
  assert.equal(own[0][9], 16.5);
  assert.equal(own[0][10], 3);
  assert.equal(own[0][11], 8.5);
  assert.equal(own[0][15], 1320);
  assert.equal(own[1][13], null);
  assert.equal(own[1][17], 'Sin ubicación asignada');
  assert.equal(own[1][7], 'Inactivo');
  assert.equal(own[2][9], null);
  assert.equal(sheets[2].rows.length, 5);
  assert.equal(sheets[2].rows[0][8], '3');
  assert.equal(sheets[2].rows[0][9], 'Izquierda');
  assert.equal(sheets[3].rows.length, 1);
  assert.equal(sheets[3].rows[0][11], 100);
  assert.equal(sheets[4].rows[0][9], 'Calle 123');
  assert.equal(sheets[4].rows[0][10], 0);
  assert.equal(sheets[4].rows[0][11], 0);
  assert.equal(sheets[4].rows[0][16], 'Inactivo');
});

test('el XLSX real conserva códigos, textos literales, números, filtros y hojas vacías', () => {
  const sheets = exporter.buildSheets(fixture, options);
  const bytes = XLSX.write(exporter.createWorkbook(XLSX, sheets), { type: 'buffer', bookType: 'xlsx', compression: true });
  assert.equal(Buffer.from(bytes.subarray(0, 2)).toString(), 'PK');
  const workbook = XLSX.read(bytes, { type: 'buffer' });
  assert.deepEqual(workbook.SheetNames, sheets.map(sheet => sheet.name));
  const own = workbook.Sheets['Stock propio'];
  assert.equal(own.B2.v, '00012');
  assert.equal(own.C2.v, '0001234567890');
  assert.equal(own.D2.t, 's');
  assert.equal(own.D2.f, undefined);
  assert.equal(own.J2.t, 'n');
  assert.equal(own.J2.v, 16.5);
  assert.ok(own['!autofilter']);
  const empty = exporter.buildSheets({ products: [], balances: [], locations: [], sources: [], offers: [] }, options);
  assert.equal(exporter.createWorkbook(XLSX, empty).Sheets.B2B.A1.v, 'ID oferta');
});

test('cada selección genera solo las hojas correspondientes y exige alcance comercial', () => {
  for (const [scope, names] of Object.entries({ own: ['Stock propio', 'Ubicaciones'], b2b: ['B2B'], local: ['Locales'], locations: ['Ubicaciones'] })) {
    assert.deepEqual(exporter.buildSheets(fixture, { ...options, scope }).slice(1).map(sheet => sheet.name), names);
  }
  assert.throws(() => exporter.buildSheets(fixture), /alcance/);
  assert.throws(() => exporter.buildSheets(fixture, { ...options, scope: 'bad' }), /no válido/);
  assert.throws(() => exporter.buildSheets({ ...fixture, locations: [] }, options), /ubicación/);
});

function pagedClient(rows, { cap = 200, failAt = Infinity } = {}) {
  const calls = [];
  return {
    calls,
    auth: { getSession: async () => ({ data: { session: { access_token: 'test-session' } } }) },
    from(table) {
      const call = { table, order: [] };
      calls.push(call);
      const query = {
        select() { return query; },
        eq(key, value) { call[key] = value; return query; },
        order(column) { call.order.push(column); return query; },
        async range(start, end) {
          call.start = start;
          return start >= failAt ? { error: { message: 'fallo de red' } }
            : { data: rows.slice(start, Math.min(end + 1, start + cap)), count: rows.length, error: null };
        }
      };
      return query;
    }
  };
}

test('pagina más de 1000 filas con un límite de servidor menor y conserva tenant y orden', async () => {
  const rows = Array.from({ length: 1201 }, (_, id) => ({ id }));
  const client = pagedClient(rows);
  assert.deepEqual(await exporter.readPages(client, 'tenant-a', 'inventory_balances_v2', '*', ['product_id', 'location_id']), rows);
  assert.equal(client.calls.length, 7);
  assert.ok(client.calls.every(call => call.tenant_id === 'tenant-a'));
  assert.deepEqual(client.calls[0].order, ['product_id', 'location_id']);
  await assert.rejects(exporter.readPages(pagedClient(rows, { failAt: 200 }), 'tenant-a', 'products', '*', ['id']), /fallo de red/);
});

function externalFetcher(rows = [], { failAt = Infinity } = {}) {
  return async (url, request) => {
    assert.equal(url, '/.netlify/functions/inventory-export');
    assert.equal(request.headers.Authorization, 'Bearer test-session');
    const { tenantId, resource, offset } = JSON.parse(request.body);
    assert.equal(tenantId, context.tenantId);
    assert.ok(['sources', 'offers'].includes(resource));
    if (offset >= failAt) return Response.json({ error: 'fallo de servidor' }, { status: 503 });
    const page = rows.slice(offset, offset + 200);
    return Response.json({ rows: page, nextOffset: offset + page.length < rows.length ? offset + page.length : null });
  };
}

test('rechaza roles no administrativos y exporta externos sin leer tablas protegidas desde el navegador', async () => {
  const client = pagedClient([]);
  await assert.rejects(exporter.fetchData(client, { ...context, role: 'VENDEDOR' }), /administrativa/);
  assert.equal(client.calls.length, 0);
  const rows = Array.from({ length: 1201 }, (_, id) => ({ id }));
  const data = await exporter.fetchData(client, context, 'b2b', externalFetcher(rows));
  assert.deepEqual(data.offers, rows);
  assert.equal(client.calls.length, 0);
  await assert.rejects(exporter.fetchData(client, context, 'local', externalFetcher(rows, { failAt: 200 })), /fallo de servidor/);
  client.auth.getSession = async () => ({ data: { session: null } });
  await assert.rejects(exporter.fetchData(client, context, 'all', externalFetcher()), /sesión expiró/);
});

test('la descarga informa errores, no entrega archivos parciales y permite reintentar', async () => {
  const status = { textContent: '' };
  const button = { textContent: 'Descargar', disabled: false };
  let downloads = 0;
  globalThis.document = { getElementById: () => status };
  globalThis.XLSX = { ...XLSX, writeFile: () => { downloads += 1; } };
  const auth = { hydrateFromSupabase: async () => true, getTenantContext: () => context };
  const originalError = console.error;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = externalFetcher();
  console.error = () => {};
  try {
    await exporter.download({ client: pagedClient([{}], { failAt: 0 }), auth, button });
    assert.equal(downloads, 0);
    assert.match(status.textContent, /No se generó el Excel/);
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, 'Descargar');
    await exporter.download({ client: pagedClient([]), auth, button });
    assert.equal(downloads, 1);
    assert.match(status.textContent, /Excel generado/);
    globalThis.fetch = externalFetcher([{}, {}, {}], { failAt: 0 });
    await exporter.download({ client: pagedClient([]), auth, button });
    assert.equal(downloads, 1);
    assert.match(status.textContent, /fallo de servidor/);
    assert.equal(button.disabled, false);
    globalThis.fetch = externalFetcher();
    let reads = 0;
    const switchingAuth = { ...auth, getTenantContext: () => (++reads === 1 ? context : { ...context, tenantId: 'other' }) };
    await exporter.download({ client: pagedClient([]), auth: switchingAuth, button });
    assert.equal(downloads, 1);
    assert.match(status.textContent, /sesión cambió/);
  } finally {
    console.error = originalError;
    globalThis.fetch = originalFetch;
    delete globalThis.document;
    delete globalThis.XLSX;
  }
});
