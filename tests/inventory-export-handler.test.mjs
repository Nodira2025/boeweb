import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventoryExportHandler } from '../netlify/functions/inventory-export.mjs';

const tenantId = '12345678-1234-1234-1234-123456789abc';
function request(body = {}, headers = {}, method = 'POST') {
  return new Request('https://boeweb.netlify.app/.netlify/functions/inventory-export', {
    method, headers: { Authorization: 'Bearer valid-session', ...headers },
    ...(method === 'POST' ? { body: JSON.stringify({ tenantId, resource: 'offers', ...body }) } : {})
  });
}

function setup({ role = 'ADMIN', member = true, activeTenant = true, platform = false, authError = false, dbError = false, rows = [] } = {}) {
  const calls = [];
  const client = {
    auth: { async getUser(token) {
      assert.equal(token, 'valid-session');
      return authError ? { error: new Error('expired') } : { data: { user: { id: 'actual-user' } } };
    } },
    from(table) {
      const call = { table, filters: {} };
      calls.push(call);
      const query = {
        select(columns, options) { call.columns = columns; call.options = options; return query; },
        eq(key, value) { call.filters[key] = value; return query; },
        order(key) { call.order = key; return query; },
        async maybeSingle() {
          if (dbError) return { error: new Error('private database detail') };
          const data = table === 'tenant_users' ? (member ? { role } : null)
            : table === 'tenants' ? (activeTenant ? { id: tenantId } : null) : (platform ? { user_id: 'actual-user' } : null);
          return { data };
        },
        async range(start, end) {
          call.range = [start, end];
          return { data: rows.slice(start, Math.min(end + 1, start + 200)), count: rows.length };
        }
      };
      return query;
    }
  };
  return { calls, handler: createInventoryExportHandler({ getAdminClient: () => client }) };
}

test('verifica sesión, membresía activa y comercio antes de leer datos paginados', async () => {
  const rows = Array.from({ length: 1201 }, (_, id) => ({ id }));
  const { handler, calls } = setup({ rows });
  const collected = [];
  let offset = 0;
  do {
    const response = await handler(request({ offset, userId: 'forged-user' }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const page = await response.json();
    collected.push(...page.rows);
    offset = page.nextOffset;
  } while (offset !== null);
  assert.deepEqual(collected, rows);
  assert.deepEqual(calls[0].filters, { user_id: 'actual-user', tenant_id: tenantId, active: true });
  assert.deepEqual(calls[1].filters, { id: tenantId, status: 'ACTIVE' });
  const reads = calls.filter(call => call.table === 'external_catalog_offers_v2');
  assert.equal(reads.length, 7);
  assert.ok(reads.every(call => call.filters.tenant_id === tenantId && call.order === 'id' && call.range[1] - call.range[0] === 499));
  assert.equal(reads[0].columns.includes('*'), false);
});

test('rechaza usuarios, comercios o roles sin acceso aunque el cuerpo declare ADMIN', async () => {
  for (const [options, expected] of [[{ authError: true }, 401], [{ member: false }, 403], [{ activeTenant: false }, 403], [{ role: 'VENDEDOR' }, 403], [{ dbError: true }, 503], [{ role: 'VENDEDOR', platform: true, member: false }, 403]]) {
    const { handler, calls } = setup(options);
    const response = await handler(request({ role: 'ADMIN' }));
    assert.equal(response.status, expected);
    assert.equal(calls.some(call => call.table.startsWith('external_')), false);
    assert.equal((await response.text()).includes('private database detail'), false);
  }
});

test('permite superadmin de plataforma con membresía activa y protege también proveedores', async () => {
  const { handler, calls } = setup({ role: 'VENDEDOR', platform: true });
  assert.equal((await handler(request({ resource: 'sources' }))).status, 200);
  assert.deepEqual(calls.at(-1).filters, { tenant_id: tenantId });
  assert.equal(calls.at(-1).table, 'external_catalog_sources_v2');
  assert.ok(calls.at(-1).columns.includes('active,metadata'));
});

test('rechaza origen externo, falta de sesión y parámetros fuera del alcance antes de leer', async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(request({}, {}, 'GET'))).status, 405);
  assert.equal((await handler(request({}, { Origin: 'https://untrusted.example' }))).status, 403);
  assert.equal((await handler(request({}, { Authorization: '' }))).status, 401);
  for (const body of [{ tenantId: 'invalid' }, { resource: 'tenant_users' }, { resource: '__proto__' }, { offset: -1 }, { offset: 0.5 }, { offset: 1000000 }]) {
    assert.equal((await handler(request(body))).status, 422);
  }
  assert.equal(calls.length, 0);
});
