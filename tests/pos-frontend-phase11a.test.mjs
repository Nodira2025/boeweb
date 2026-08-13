import test from 'node:test';
import assert from 'node:assert/strict';
import { PosCartEngine } from '../pos-cart-engine.js';
import { PublicCatalogUnifier } from '../public-catalog-unification.js';
import { SaasAuth } from '../saas-auth.js';

test('1. PosCartEngine: Aislamiento por Modos (POS vs B2B vs PUBLIC_ORDER)', () => {
  const mockStorage = {};
  global.localStorage = {
    getItem: (key) => mockStorage[key] || null,
    setItem: (key, val) => { mockStorage[key] = String(val); },
    removeItem: (key) => { delete mockStorage[key]; }
  };

  const posCart = new PosCartEngine('POS');
  const b2bCart = new PosCartEngine('B2B_PURCHASE');

  posCart.addItem({ id: 'P01', name: 'Maceta 10L', price: 5000, quantity: 2, availability: 'EN_STOCK' });
  b2bCart.addItem({ id: 'B2B-99', name: 'Top Crop 1L', price: 12000, quantity: 5, availability: 'A_PEDIDO' });

  assert.equal(posCart.getItemCount(), 2);
  assert.equal(posCart.getTotal(), 10000);

  assert.equal(b2bCart.getItemCount(), 5);
  assert.equal(b2bCart.getTotal(), 60000);

  // Verificar que las claves de localStorage están totalmente aisladas
  assert.ok(mockStorage['boeweb_cart_pos'].includes('Maceta 10L'));
  assert.ok(mockStorage['boeweb_cart_b2b_purchase'].includes('Top Crop 1L'));
});

test('2. PublicCatalogUnifier: Deduplicación y Badges EN STOCK vs A PEDIDO', () => {
  const ownProducts = [
    { id: 'SKU-01', product_code: 'SKU-01', name: 'BioBizz Bio Grow 1L', price: 15000, own_stock: 10, category: 'Fertilizantes' },
    { id: 'SKU-02', product_code: 'SKU-02', name: 'Klasmann TS1 Sustrato 70L', price: 28000, own_stock: 0, category: 'Sustratos' }
  ];

  const b2bProducts = [
    { id: 'SKU-01', product_code: 'SKU-01', name: 'BioBizz Bio Grow 1L', price: 14000, stock: 50, supplier_code: 'astrogrow' },
    { id: 'SKU-03', product_code: 'SKU-03', name: 'Vaporizador Mighty+', price: 450000, stock: 5, supplier_code: 'santaplanta' }
  ];

  const unified = PublicCatalogUnifier.unifyProducts(ownProducts, b2bProducts);

  assert.equal(unified.length, 3); // Deduplicó SKU-01 en 1 sola ficha

  const sku01 = unified.find(p => p.product_code === 'SKU-01');
  assert.equal(sku01.availability, 'EN_STOCK');
  assert.equal(sku01.badge_text, '🟢 EN STOCK');
  assert.equal(sku01.own_stock, 10); // NUNCA suma stock de proveedor a stock propio
  assert.equal(sku01.suppliers.length, 1); // Proveedor agregado como secundario

  const sku02 = unified.find(p => p.product_code === 'SKU-02');
  assert.equal(sku02.availability, 'A_PEDIDO');
  assert.equal(sku02.badge_text, '📦 A PEDIDO');

  const sku03 = unified.find(p => p.product_code === 'SKU-03');
  assert.equal(sku03.availability, 'A_PEDIDO');
  assert.equal(sku03.own_stock, 0); // No tiene stock propio
});

test('3. Sale Draft Contract (Contrato de Venta Fase 11A)', () => {
  const cart = new PosCartEngine('POS');
  cart.clear();
  cart.addItem({ id: 'P01', name: 'Tornillo Industrial 10mm', price: 200, quantity: 50 });

  const draft = cart.createSaleDraft({
    tenantId: '22222222-2222-2222-2222-222222222222',
    cashierUser: { id: 'usr-franco', name: 'Profesor Franco' },
    salespersonUser: { id: 'usr-lautaro', name: 'Lautaro' },
    paymentMethod: 'EFECTIVO',
    notes: 'Venta mostrador ferretería'
  });

  assert.ok(draft.draft_id.startsWith('draft_'));
  assert.equal(draft.tenant_id, '22222222-2222-2222-2222-222222222222');
  assert.equal(draft.cashier_user_id, 'usr-franco');
  assert.equal(draft.cashier_name_snapshot, 'Profesor Franco');
  assert.equal(draft.salesperson_user_id, 'usr-lautaro');
  assert.equal(draft.salesperson_name_snapshot, 'Lautaro');
  assert.equal(draft.total, 10000);
  assert.equal(draft.payment_method, 'EFECTIVO');
  assert.equal(draft.status, 'DRAFT_READY_FOR_11B');
  assert.ok(draft.idempotency_key.includes('pos_draft_'));
});

test('4. Identidad del Vendedor no se inventa sin sesión autenticada', () => {
  const users = SaasAuth.getTenantUsers('11111111-1111-1111-1111-111111111111');
  assert.ok(Array.isArray(users));
  assert.equal(users.length, 0);
  assert.equal(SaasAuth.getTenantContext().isVerified, false);
});

test('5. Aislamiento de Drafts vs Caja (Previene Doble Contabilización)', () => {
  const mockStorage = {};
  global.localStorage = {
    getItem: (key) => mockStorage[key] || null,
    setItem: (key, val) => { mockStorage[key] = String(val); },
    removeItem: (key) => { delete mockStorage[key]; }
  };

  const cart = new PosCartEngine('POS');
  cart.addItem({ id: 'P01', name: 'Sustrato 50L', price: 12000, quantity: 1 });
  const draft = cart.createSaleDraft({
    tenantId: '11111111-1111-1111-1111-111111111111',
    cashierUser: { id: 'usr-franco', name: 'Profesor Franco' },
    salespersonUser: { id: 'usr-lautaro', name: 'Lautaro' },
    paymentMethod: 'EFECTIVO'
  });

  // Guardado en clave propia de drafts
  mockStorage['boeweb_pos_sale_drafts'] = JSON.stringify([draft]);

  // Verificar que NO existe entrada en las claves de caja real (boeweb_cash_*)
  const cashKeys = Object.keys(mockStorage).filter(k => k.startsWith('boeweb_cash_'));
  assert.equal(cashKeys.length, 0);
  assert.ok(mockStorage['boeweb_pos_sale_drafts'].includes('draft_'));
});
