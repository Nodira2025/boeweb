import test from 'node:test';
import assert from 'node:assert/strict';
import OperationalApi from '../operational-api.js';

const IDS = Object.freeze({
  tenant: '11111111-1111-4111-8111-111111111111',
  cashier: '22222222-2222-4222-8222-222222222222',
  salesperson: '33333333-3333-4333-8333-333333333333',
  supervisor: '44444444-4444-4444-8444-444444444444',
  register: '55555555-5555-4555-8555-555555555555',
  session: '66666666-6666-4666-8666-666666666666',
  draft: '77777777-7777-4777-8777-777777777777',
  product: '88888888-8888-4888-8888-888888888888',
  shelfA: '99999999-9999-4999-8999-999999999999',
  shelfB: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  count: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  customer: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  order: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  closure: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  saleCash: '12121212-1212-4212-8212-121212121212',
  saleBank: '13131313-1313-4313-8313-131313131313',
  saleMixed: '14141414-1414-4414-8414-141414141414',
  saleCredit: '15151515-1515-4515-8515-151515151515'
});

function createRpcHarness() {
  const calls = [];
  const saleIds = [IDS.saleCash, IDS.saleBank, IDS.saleMixed, IDS.saleCredit];
  const replies = {
    upsert_inventory_location_v2: (parameters) => ({ location_id: parameters.p_location_id || (calls.filter(call => call.name === 'upsert_inventory_location_v2').length === 1 ? IDS.shelfA : IDS.shelfB) }),
    submit_catalog_product_draft_v2: () => ({ draft_id: IDS.draft, status: 'DRAFT' }),
    locate_catalog_product_draft_v2: () => ({ draft_id: IDS.draft, status: 'LOCATED' }),
    approve_catalog_product_draft_v2: () => ({ draft_id: IDS.draft, product_id: IDS.product, status: 'APPROVED' }),
    receive_inventory_v2: () => ({ product_id: IDS.product, on_hand: 20 }),
    transfer_inventory_v2: () => ({ transfer_id: '16161616-1616-4616-8616-161616161616', quantity: 5 }),
    submit_inventory_count_v2: () => ({ count_id: IDS.count, status: 'PENDING_REVIEW' }),
    review_inventory_count_v2: () => ({ count_id: IDS.count, status: 'APPROVED' }),
    upsert_customer_v2: () => ({ customer_id: IDS.customer, account_status: 'ACTIVE' }),
    open_cash_session_v2: () => ({ session_id: IDS.session, status: 'OPEN' }),
    checkout_sale_v2: () => ({ sale_id: saleIds.shift(), status: 'CONFIRMED' }),
    record_customer_account_payment_v2: () => ({ customer_id: IDS.customer, balance: 0 }),
    record_cash_movement_v2: (parameters) => ({ session_id: IDS.session, type: parameters.p_type }),
    transition_public_order_v2: (parameters) => ({ order_id: IDS.order, status: parameters.p_new_status }),
    void_sale_v2: () => ({ sale_id: IDS.saleBank, status: 'VOIDED' }),
    submit_cash_closure_v2: () => ({ closure_id: IDS.closure, status: 'PENDING_REVIEW' }),
    review_cash_closure_v2: () => ({ closure_id: IDS.closure, status: 'APPROVED' })
  };
  return {
    calls,
    client: {
      async rpc(name, parameters) {
        calls.push({ name, parameters });
        const reply = replies[name];
        return reply
          ? { data: reply(parameters), error: null }
          : { data: null, error: { code: 'MISSING_MOCK', message: `RPC no simulada: ${name}` } };
      }
    }
  };
}

function saleDraft({ key, total, paymentMethod, quantity = 1, customerId = null, breakdown = null }) {
  return {
    idempotency_key: key,
    salesperson_user_id: IDS.salesperson,
    customer_id: customerId,
    customer_account_due: customerId ? '2026-09-23' : null,
    items: [{
      product_id: IDS.product,
      location_id: IDS.shelfB,
      quantity,
      unit_price: 100
    }],
    total,
    payment_method: paymentMethod,
    payment_breakdown: breakdown,
    notes: 'Loop operativo automatizado'
  };
}

test('loop exhaustivo usa los comandos reales: producto, estantería, WMS, ventas, CC, caja y supervisor', async () => {
  const { client, calls } = createRpcHarness();
  const cashierContext = { isVerified: true, tenantId: IDS.tenant, userId: IDS.cashier, role: 'VENDEDOR' };
  const supervisorContext = { isVerified: true, tenantId: IDS.tenant, userId: IDS.supervisor, role: 'SUPERVISOR' };

  await OperationalApi.upsertInventoryLocation({
    supabaseClient: client,
    authContext: supervisorContext,
    location: { id: IDS.shelfA, code: 'DEP-A-N1', name: 'Depósito A · Nivel 1', location_type: 'WAREHOUSE', is_sellable: true, is_default: true }
  });
  await OperationalApi.upsertInventoryLocation({
    supabaseClient: client,
    authContext: supervisorContext,
    location: { id: IDS.shelfB, code: 'TIE-G1-N2', name: 'Tienda · Góndola 1 · Nivel 2', location_type: 'SHELF', is_sellable: true }
  });
  await OperationalApi.submitCatalogProductDraft({
    supabaseClient: client,
    authContext: cashierContext,
    idempotencyKey: 'loop-product-draft-001',
    draft: { sku: 'LOOP-001', name: 'Producto de prueba exhaustiva', price: 100, currency: 'ARS', initial_quantity: 15 }
  });
  await OperationalApi.locateCatalogProductDraft({
    supabaseClient: client,
    authContext: cashierContext,
    draftId: IDS.draft,
    idempotencyKey: 'loop-product-location-001',
    location: { location_id: IDS.shelfA, module: 'A', level: 1, position: 1 }
  });
  await OperationalApi.approveCatalogProductDraft({
    supabaseClient: client,
    authContext: supervisorContext,
    draftId: IDS.draft,
    idempotencyKey: 'loop-product-approval-001',
    overrides: { price: 100, initial_quantity: 15 }
  });
  await OperationalApi.receiveInventory({
    supabaseClient: client,
    authContext: supervisorContext,
    productId: IDS.product,
    locationId: IDS.shelfA,
    quantity: 5,
    unitCost: 50,
    idempotencyKey: 'loop-receipt-001'
  });
  await OperationalApi.transferInventory({
    supabaseClient: client,
    authContext: supervisorContext,
    productId: IDS.product,
    originLocationId: IDS.shelfA,
    destinationLocationId: IDS.shelfB,
    quantity: 5,
    notes: 'Reposición de tienda',
    idempotencyKey: 'loop-transfer-001'
  });
  await OperationalApi.submitInventoryCount({
    supabaseClient: client,
    authContext: cashierContext,
    productId: IDS.product,
    locationId: IDS.shelfB,
    countedQuantity: 5,
    notes: 'Conteo previo a apertura',
    idempotencyKey: 'loop-count-001'
  });
  await OperationalApi.reviewInventoryCount({
    supabaseClient: client,
    authContext: supervisorContext,
    countId: IDS.count,
    decision: 'APPROVE',
    reason: 'Conteo físico verificado por supervisor',
    idempotencyKey: 'loop-count-review-001'
  });
  await OperationalApi.upsertCustomer({
    supabaseClient: client,
    authContext: cashierContext,
    customer: { id: IDS.customer, display_name: 'Cliente Cuenta Corriente', phone: '+5493434000000', credit_limit: 1000, currency: 'ARS' }
  });
  await OperationalApi.openCashSession({
    supabaseClient: client,
    authContext: cashierContext,
    registerId: IDS.register,
    openingAmount: 1000
  });

  await OperationalApi.checkoutSale({
    supabaseClient: client,
    authContext: cashierContext,
    registerId: IDS.register,
    draft: saleDraft({ key: 'loop-sale-cash-001', total: 100, paymentMethod: 'EFECTIVO' }),
    allowQueue: false
  });
  await OperationalApi.checkoutSale({
    supabaseClient: client,
    authContext: cashierContext,
    registerId: IDS.register,
    draft: saleDraft({ key: 'loop-sale-bank-001', total: 100, paymentMethod: 'TRANSFERENCIA' }),
    allowQueue: false
  });
  await OperationalApi.checkoutSale({
    supabaseClient: client,
    authContext: cashierContext,
    registerId: IDS.register,
    draft: saleDraft({
      key: 'loop-sale-mixed-001',
      total: 200,
      quantity: 2,
      paymentMethod: 'MIXTO',
      breakdown: { cash_amount: 80, secondary_amount: 120, secondary_method: 'TRANSFERENCIA' }
    }),
    allowQueue: false
  });
  await OperationalApi.checkoutSale({
    supabaseClient: client,
    authContext: cashierContext,
    registerId: IDS.register,
    draft: saleDraft({ key: 'loop-sale-credit-001', total: 100, paymentMethod: 'CUENTA_CORRIENTE', customerId: IDS.customer }),
    allowQueue: false
  });
  await OperationalApi.recordCustomerAccountPayment({
    supabaseClient: client,
    authContext: cashierContext,
    customerId: IDS.customer,
    amount: 100,
    method: 'EFECTIVO',
    idempotencyKey: 'loop-account-payment-001',
    registerId: IDS.register,
    notes: 'Cancelación de saldo'
  });
  await OperationalApi.recordCashMovement({
    supabaseClient: client,
    authContext: cashierContext,
    sessionId: IDS.session,
    type: 'EXPENSE',
    amount: 60,
    category: 'LIMPIEZA',
    description: 'Compra de insumos de limpieza'
  });
  await OperationalApi.recordCashMovement({
    supabaseClient: client,
    authContext: cashierContext,
    sessionId: IDS.session,
    type: 'INCOME',
    amount: 25,
    category: 'OTROS_INGRESOS',
    description: 'Ingreso operativo documentado'
  });
  for (const [status, suffix] of [['PREPARING', 'prepare'], ['READY', 'ready'], ['DELIVERED', 'deliver']]) {
    await OperationalApi.transitionPublicOrder({
      supabaseClient: client,
      authContext: cashierContext,
      orderId: IDS.order,
      status,
      notes: `Pedido ${status.toLowerCase()}`,
      idempotencyKey: `loop-order-${suffix}-001`
    });
  }
  await OperationalApi.voidSale({
    supabaseClient: client,
    authContext: supervisorContext,
    saleId: IDS.saleBank,
    reason: 'Anulación compensatoria de prueba',
    idempotencyKey: 'loop-void-sale-001',
    registerId: IDS.register
  });
  await OperationalApi.submitCashClosure({
    supabaseClient: client,
    authContext: cashierContext,
    sessionId: IDS.session,
    countedAmount: 1145,
    notes: 'Cierre entregado a supervisión'
  });
  await OperationalApi.reviewCashClosure({
    supabaseClient: client,
    authContext: supervisorContext,
    closureId: IDS.closure,
    decision: 'APPROVE',
    reason: 'Arqueo e historial controlados'
  });

  const names = calls.map(call => call.name);
  assert.deepEqual(names, [
    'upsert_inventory_location_v2', 'upsert_inventory_location_v2',
    'submit_catalog_product_draft_v2', 'locate_catalog_product_draft_v2', 'approve_catalog_product_draft_v2',
    'receive_inventory_v2', 'transfer_inventory_v2', 'submit_inventory_count_v2', 'review_inventory_count_v2',
    'upsert_customer_v2', 'open_cash_session_v2',
    'checkout_sale_v2', 'checkout_sale_v2', 'checkout_sale_v2', 'checkout_sale_v2',
    'record_customer_account_payment_v2', 'record_cash_movement_v2', 'record_cash_movement_v2',
    'transition_public_order_v2', 'transition_public_order_v2', 'transition_public_order_v2',
    'void_sale_v2', 'submit_cash_closure_v2', 'review_cash_closure_v2'
  ]);

  const checkoutCalls = calls.filter(call => call.name === 'checkout_sale_v2');
  assert.equal(checkoutCalls[0].parameters.p_cashier_user_id, IDS.cashier, 'el cajero es quien confirma');
  assert.equal(checkoutCalls[0].parameters.p_salesperson_user_id, IDS.salesperson, 'la venta puede pertenecer a otro vendedor');
  assert.equal(checkoutCalls[0].parameters.p_items[0].location_id, IDS.shelfB, 'la venta conserva la estantería física');
  assert.deepEqual(checkoutCalls[2].parameters.p_payments.map(payment => [payment.method, payment.amount]), [
    ['CASH', 80], ['BANK_TRANSFER', 120]
  ]);
  assert.equal(checkoutCalls[3].parameters.p_customer_id, IDS.customer);
  assert.equal(checkoutCalls[3].parameters.p_payments[0].method, 'ACCOUNT_CREDIT');
  assert.equal(calls.at(-1).parameters.p_decision, 'APPROVE', 'el supervisor decide el cierre después del cajero');
});

test('el loop falla antes del backend si crédito no tiene cliente o la idempotencia es inválida', async () => {
  const { client } = createRpcHarness();
  const authContext = { isVerified: true, tenantId: IDS.tenant, userId: IDS.cashier };
  await assert.rejects(
    OperationalApi.checkoutSale({
      supabaseClient: client,
      authContext,
      registerId: IDS.register,
      draft: saleDraft({ key: 'loop-credit-without-customer', total: 100, paymentMethod: 'CUENTA_CORRIENTE' }),
      allowQueue: false
    }),
    error => error.code === 'CUSTOMER_REQUIRED_FOR_CREDIT'
  );
  await assert.rejects(
    OperationalApi.receiveInventory({
      supabaseClient: client,
      authContext,
      productId: IDS.product,
      locationId: IDS.shelfA,
      quantity: 1,
      idempotencyKey: 'short'
    }),
    error => error.code === 'INVALID_INVENTORY_RECEIPT'
  );
});
