import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PosCartEngine } from '../pos-cart-engine.js';
import operationalPackage from '../operational-api.js';

const { buildCheckoutCommand, OperationalApiError } = operationalPackage;

test('Migración 012_pos_flexible_sales.sql es transaccional y define checkout_sale_v3', () => {
  const filePath = path.resolve('scripts', 'migrations', '012_pos_flexible_sales.sql');
  assert.ok(fs.existsSync(filePath), '012_pos_flexible_sales.sql debe existir');
  const sql = fs.readFileSync(filePath, 'utf8');

  assert.match(sql, /BEGIN;/i, 'Debe iniciar con BEGIN');
  assert.match(sql, /COMMIT;/i, 'Debe finalizar con COMMIT');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.checkout_sale_v3/i, 'Debe definir checkout_sale_v3');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.sale_fulfillments_v2/i, 'Debe definir sale_fulfillments_v2');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.parked_pos_tickets_v2/i, 'Debe definir parked_pos_tickets_v2');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.document_sequences_v2/i, 'Debe definir document_sequences_v2');
  assert.match(sql, /v_allow_backorders :=/i, 'Debe respetar la configuración de venta sin stock');
  assert.match(sql, /v_current_account_enabled := lower\(COALESCE\(v_rules #>> '\{currentAccount,enabled\}'/i,
    'Debe respetar si la cuenta corriente está habilitada');
  assert.match(sql, /IF NOT v_current_account_enabled THEN/i,
    'Debe bloquear el pago a cuenta corriente cuando la política lo deshabilita');
  assert.match(sql, /v_block_overdue := lower\(COALESCE\(v_rules #>> '\{currentAccount,blockOverdue\}'/i,
    'Debe respetar la política de deuda vencida');
  assert.match(sql, /ar\.due_date < current_date/i,
    'Debe calcular la deuda vencida antes de autorizar un nuevo cargo');
  assert.match(sql, /v_account\.balance \+ v_cc_total > v_account\.credit_limit/i,
    'Debe validar el límite de crédito de forma autoritativa');
  assert.match(sql, /v_expected_delivery_date < current_date/i, 'Debe rechazar fechas de encargo vencidas');
  assert.match(sql, /cash_tendered/i, 'Debe validar y registrar el efectivo entregado');
  assert.match(sql, /cash_change/i, 'Debe calcular el vuelto en el servidor');
  assert.match(sql, /'payments', v_receipt_payments, 'idempotent', true/i, 'El retry debe devolver el mismo comprobante completo');
  assert.match(sql, /octet_length\(COALESCE\(v_item->'metadata'/i, 'Debe limitar metadatos también en el servidor');
  assert.match(sql, /INSERT INTO public\.schema_migrations/i, 'Debe registrarse en schema_migrations');
});

test('PosCartEngine soporta tickets mixtos con todos los line_types', () => {
  const cart = new PosCartEngine('POS');
  cart.clear();

  // 1. OWN_STOCK
  assert.ok(cart.addItem({
    id: 'prod-stock-1',
    product_code: 'SUST-50L',
    name: 'Sustrato 50L',
    price: 15000,
    quantity: 2,
    stock: 10,
    availability: 'EN_STOCK'
  }));

  // 2. OWN_BACKORDER
  assert.ok(cart.addItem({
    id: 'prod-backorder-1',
    product_code: 'PANEL-LED-300W',
    name: 'Panel LED 300W (Por Encargo)',
    price: 180000,
    quantity: 1,
    is_backorder: true,
    expected_delivery_date: '2026-09-01'
  }));

  // 3. B2B_BACKORDER
  assert.ok(cart.addItem({
    id: 'b2b-offer-1',
    product_code: 'CARPA-100X100',
    name: 'Carpa Indoor 100x100 B2B',
    price: 95000,
    quantity: 1,
    source_type: 'B2B_SUPPLIER',
    source_name: 'Distribuidora Central Grow',
    expected_delivery_date: '2026-08-30'
  }));

  // 4. LOCAL_STORE_BACKORDER
  assert.ok(cart.addItem({
    id: 'local-store-offer-1',
    product_code: 'MACETA-GEO-15L',
    name: 'Maceta Geotextil 15L Tienda Vecina',
    price: 4500,
    quantity: 3,
    source_type: 'LOCAL_STORE',
    source_name: 'Grow Shop Paraná Centro',
    expected_delivery_date: '2026-08-27'
  }));

  // 5. QUICK_ENTRY (Ítem Libre)
  assert.ok(cart.addItem({
    name: 'Fertilizante Orgánico Nuevo Sin Catalogar',
    price: 8500,
    quantity: 1,
    is_express: true
  }));

  assert.equal(cart.getItemCount(), 8);
  const items = cart.getItems();
  assert.equal(items.length, 5);
  assert.equal(items[0].line_type, 'OWN_STOCK');
  assert.equal(items[1].line_type, 'OWN_BACKORDER');
  assert.equal(items[2].line_type, 'B2B_BACKORDER');
  assert.equal(items[3].line_type, 'LOCAL_STORE_BACKORDER');
  assert.equal(items[4].line_type, 'QUICK_ENTRY');

  const draft = cart.createSaleDraft({
    tenantId: '11111111-1111-4111-8111-111111111111',
    cashierUser: { id: '22222222-2222-4222-8222-222222222222', name: 'Franco Cajero' },
    salespersonUser: { id: '33333333-3333-4333-8333-333333333333', name: 'Lautaro Vendedor' },
    paymentMethod: 'EFECTIVO'
  });

  assert.equal(draft.items.length, 5);
  assert.equal(draft.items[0].fulfillment_status, 'DELIVERED');
  assert.equal(draft.items[1].fulfillment_status, 'PENDING');
  assert.equal(draft.items[2].fulfillment_status, 'PENDING');
  assert.equal(draft.items[3].fulfillment_status, 'PENDING');
  assert.equal(draft.items[4].fulfillment_status, 'DELIVERED');
  assert.equal(draft.items[4].product_id, null);
});

test('buildCheckoutCommand serializa correctamente ítems mixtos para RPC v3', async () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const cashierId = '22222222-2222-4222-8222-222222222222';
  const salespersonId = '33333333-3333-4333-8333-333333333333';

  const draft = {
    tenant_id: tenantId,
    cashier_user_id: cashierId,
    salesperson_user_id: salespersonId,
    register_id: '55555555-5555-4555-8555-555555555555',
    idempotency_key: 'idemp-pos-flexible-001',
    payment_method: 'EFECTIVO',
    total: 35000,
    items: [
      {
        line_type: 'OWN_STOCK',
        product_id: '44444444-4444-4444-8444-444444444444',
        product_code: 'FERT-01',
        name: 'Fertilizante 1L',
        quantity: 1,
        price: 15000,
        location_id: '55555555-5555-4555-8555-555555555555'
      },
      {
        line_type: 'QUICK_ENTRY',
        product_id: null,
        sku: 'QUICK-ITEM',
        name: 'Maceta plástica negra especial',
        quantity: 2,
        price: 10000
      }
    ]
  };

  const command = await buildCheckoutCommand(draft);
  assert.equal(command.tenant_id, tenantId);
  assert.equal(command.register_id, '55555555-5555-4555-8555-555555555555');
  assert.equal(command.items.length, 2);
  assert.equal(command.items[0].line_type, 'OWN_STOCK');
  assert.equal(command.items[1].line_type, 'QUICK_ENTRY');
  assert.equal(command.items[1].product_id, null);
  assert.ok(command.payload_hash.length >= 8);

  await assert.rejects(
    buildCheckoutCommand({ ...draft, register_id: null }),
    error => error instanceof OperationalApiError && error.code === 'REGISTER_REQUIRED'
  );
});
