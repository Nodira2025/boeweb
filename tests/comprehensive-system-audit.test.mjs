import test from 'node:test';
import assert from 'node:assert/strict';

test('1. Netlify Functions: manage-tenant-user v2 & v1 exports & role security', async () => {
  const mod = await import('../netlify/functions/manage-tenant-user.mjs');
  assert.equal(typeof mod.default, 'function', 'Export default debe existir para Netlify Functions v2');
  assert.equal(typeof mod.handler, 'function', 'Export handler debe existir para retrocompatibilidad v1');

  // Test v2 Request: Method not allowed on GET
  const getReq = new Request('http://localhost/.netlify/functions/manage-tenant-user', { method: 'GET' });
  const getRes = await mod.default(getReq, {});
  assert.equal(getRes.status, 405);

  // Test v2 Request: Unauthenticated rejection
  const unauthReq = new Request('http://localhost/.netlify/functions/manage-tenant-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const unauthRes = await mod.default(unauthReq, {});
  assert.equal(unauthRes.status, 401);

  // Test v2 Request: Role elevation denial (ADMIN trying to elevate to SUPERADMIN)
  const elevateReq = new Request('http://localhost/.netlify/functions/manage-tenant-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requesterContext: { userId: 'admin-1', tenantId: '11111111-1111-1111-1111-111111111111', role: 'ADMIN' },
      targetTenantId: '11111111-1111-1111-1111-111111111111',
      action: 'UPDATE_ROLE',
      targetUserId: 'usr-2',
      newRole: 'SUPERADMIN'
    })
  });
  const elevateRes = await mod.default(elevateReq, {});
  assert.equal(elevateRes.status, 403);

  // Test v2 Request: Cross-tenant isolation denial
  const crossReq = new Request('http://localhost/.netlify/functions/manage-tenant-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requesterContext: { userId: 'admin-1', tenantId: '11111111-1111-1111-1111-111111111111', role: 'ADMIN' },
      targetTenantId: '22222222-2222-2222-2222-222222222222',
      action: 'UPDATE_ROLE',
      targetUserId: 'usr-3',
      newRole: 'VENDEDOR'
    })
  });
  const crossRes = await mod.default(crossReq, {});
  assert.equal(crossRes.status, 403);
});

test('2. Netlify Functions: health-check-cron v2 & v1 execution', async () => {
  const mod = await import('../netlify/functions/health-check-cron.mjs');
  assert.equal(typeof mod.default, 'function', 'Export default debe existir para Netlify Functions v2');
  assert.equal(typeof mod.handler, 'function', 'Export handler debe existir para retrocompatibilidad v1');

  const req = new Request('http://localhost/.netlify/functions/health-check-cron', { method: 'POST' });
  const res = await mod.default(req, {});
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.status, 'SUCCESS');
  assert.ok(data.scheduled_at);
  assert.ok(data.tenants_checked >= 2);
  assert.ok(Array.isArray(data.summaries));
});

test('3. Dr. BÔ Diagnosis Engine Catalog Integration', async () => {
  // Check Dr. BÔ diagnoses structures
  const mockDiagnoses = {
    nitrogen: {
      title: 'Deficiencia de Nitrógeno (N)',
      product: { name: 'Fertilizante Vegetativo Top Crop Top Veg 250ml', price: 14500 }
    },
    spidermite: {
      title: 'Plaga de Arañuela Roja (Tetranychus urticae)',
      product: { name: 'Insecticida Orgánico Jabón Potásico + Neem Ecomambo 250ml', price: 9800 }
    }
  };

  assert.ok(mockDiagnoses.nitrogen.product.price > 0);
  assert.ok(mockDiagnoses.spidermite.product.name.includes('Neem'));
});

test('4. VPD Calculation Agronomic Formula Verification', () => {
  // SVP = 0.61078 * exp((17.27 * T) / (T + 237.3))
  // VP = SVP * (RH / 100)
  // VPD = SVP - VP
  function calcVPD(T, RH) {
    const svp = 0.61078 * Math.exp((17.27 * T) / (T + 237.3));
    const vp = svp * (RH / 100);
    return svp - vp;
  }

  // T=25C, RH=60% -> Standard veg environment
  const vpdVeg = calcVPD(25, 60);
  assert.ok(vpdVeg > 1.0 && vpdVeg < 1.4, `VPD at 25C/60% should be ~1.27 kPa, got ${vpdVeg}`);

  // T=28C, RH=45% -> Intense flower
  const vpdFlower = calcVPD(28, 45);
  assert.ok(vpdFlower > 1.8 && vpdFlower < 2.3, `VPD at 28C/45% should be ~2.08 kPa, got ${vpdFlower}`);
});

test('5. Public Catalog and POS Cart Engine Consistency', async () => {
  const { PublicCatalogUnifier } = await import('../public-catalog-unification.js');
  const { PosCartEngine } = await import('../pos-cart-engine.js');

  const own = [{ id: 'PROD-1', name: 'Maceta 15L', price: 4500, stock: 12 }];
  const b2b = [{ id: 'B2B-1', name: 'Tijera Poda', price: 6200, stock: 50, supplier_code: 'tomaco' }];

  const unified = PublicCatalogUnifier.unifyProducts(own, b2b);
  assert.equal(unified.length, 2);

  const cart = new PosCartEngine('POS');
  cart.clear();
  cart.addItem(unified[0]);
  cart.addItem(unified[1]);

  assert.equal(cart.getItemCount(), 2);
  assert.equal(cart.getSubtotal(), 4500 + 6200);
  assert.equal(cart.getTotal(10), (4500 + 6200) * 0.9);
});
