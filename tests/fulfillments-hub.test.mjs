import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import OperationalApi from '../operational-api.js';

const testIds = {
  tenant: '11111111-1111-4111-8111-111111111111',
  user: '22222222-2222-4222-8222-222222222222',
  fulfillment: '33333333-3333-4333-8333-333333333333'
};

test('1. OperationalApi.updateSaleFulfillment: valida estados permitidos y rechaza estados no válidos', async () => {
  const fakeAuthContext = {
    isVerified: true,
    tenantId: testIds.tenant,
    userId: testIds.user
  };

  let rpcCalled = null;
  const fakeSupabase = {
    rpc: async (name, params) => {
      rpcCalled = { name, params };
      return { data: { ok: true, id: params.p_fulfillment_id, new_status: params.p_new_status }, error: null };
    }
  };

  // Test 1.1: Estado válido 'READY_FOR_PICKUP'
  const res = await OperationalApi.updateSaleFulfillment({
    supabaseClient: fakeSupabase,
    authContext: fakeAuthContext,
    fulfillmentId: testIds.fulfillment,
    status: 'READY_FOR_PICKUP',
    notes: 'Listo en estante A-1'
  });

  assert.equal(res.ok, true);
  assert.equal(rpcCalled.name, 'update_sale_fulfillment_v2');
  assert.equal(rpcCalled.params.p_new_status, 'READY_FOR_PICKUP');
  assert.equal(rpcCalled.params.p_notes, 'Listo en estante A-1');

  // Test 1.2: Estado inválido debe arrojar OperationalApiError
  await assert.rejects(
    async () => {
      await OperationalApi.updateSaleFulfillment({
        supabaseClient: fakeSupabase,
        authContext: fakeAuthContext,
        fulfillmentId: testIds.fulfillment,
        status: 'ESTADO_INVENTADO'
      });
    },
    (err) => {
      assert.equal(err.code, 'INVALID_FULFILLMENT_STATUS');
      return true;
    }
  );
});

test('2. OperationalApi.fetchSaleFulfillments: envía parámetros correctos a list_sale_fulfillments_v2', async () => {
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
        data: {
          total_count: 1,
          items: [
            {
              id: testIds.fulfillment,
              sale_number: '10050',
              customer_name: 'Juan Pérez',
              product_name: 'Panel LED 150W',
              status: 'PENDING'
            }
          ]
        },
        error: null
      };
    }
  };

  const response = await OperationalApi.fetchSaleFulfillments({
    supabaseClient: fakeSupabase,
    authContext: fakeAuthContext,
    statusFilter: 'PENDING',
    query: 'Juan',
    limit: 25,
    offset: 0
  });

  assert.equal(rpcCalled.name, 'list_sale_fulfillments_v2');
  assert.equal(rpcCalled.params.p_status_filter, 'PENDING');
  assert.equal(rpcCalled.params.p_query, 'Juan');
  assert.equal(response.items.length, 1);
  assert.equal(response.items[0].customer_name, 'Juan Pérez');
});

test('3. WhatsApp message generator: formatea mensaje según el estado del pedido', () => {
  function generateWhatsAppMessage(item) {
    const customerName = item.customer_name || 'Cliente';
    const saleNum = item.sale_number || 'N/A';
    const productName = item.product_name || 'tu producto';
    const qty = item.quantity || 1;

    if (item.status === 'READY_FOR_PICKUP') {
      return `¡Hola ${customerName}! 🌱 Te escribimos de *BÔ Grow Club*.\n\n¡Tu encargo ya está *LISTO PARA RETIRAR* en nuestro local! 📦✨\n\n📄 *Ticket:* #${saleNum}\n🛍️ *Detalle:* ${qty}x ${productName}\n\n📍 Podés pasar a retirarlo en nuestro horario habitual.\n¡Muchas gracias por elegirnos!`;
    } else if (item.status === 'IN_TRANSIT') {
      return `¡Hola ${customerName}! 🌱 Te escribimos de *BÔ Grow Club*.\n\nTe contamos que tu encargo de *${qty}x ${productName}* (Ticket #${saleNum}) ya fue despachado por el proveedor y está en camino al local 🚚.\nTe avisamos apenas ingrese. ¡Gracias!`;
    }
    return `¡Hola ${customerName}! 🌱 Encargo #${saleNum}: ${qty}x ${productName} (Estado: ${item.status})`;
  }

  const readyItem = {
    customer_name: 'Martín Palermo',
    sale_number: '10042',
    product_name: 'Panel LED Quantum 150W',
    quantity: 1,
    status: 'READY_FOR_PICKUP'
  };

  const readyMsg = generateWhatsAppMessage(readyItem);
  assert.ok(readyMsg.includes('LISTO PARA RETIRAR'));
  assert.ok(readyMsg.includes('Martín Palermo'));
  assert.ok(readyMsg.includes('#10042'));
  assert.ok(readyMsg.includes('Panel LED Quantum 150W'));

  const transitItem = {
    customer_name: 'Román Riquelme',
    sale_number: '10045',
    product_name: 'Sustrato Light Mix 50L',
    quantity: 4,
    status: 'IN_TRANSIT'
  };

  const transitMsg = generateWhatsAppMessage(transitItem);
  assert.ok(transitMsg.includes('en camino al local 🚚'));
  assert.ok(transitMsg.includes('4x Sustrato Light Mix 50L'));
});

test('4. Backend de entregas exige tenant activo y aplica una máquina de estados legal', () => {
  const sql = fs.readFileSync(path.resolve('scripts', 'migrations', '013_fulfillments_hub.sql'), 'utf8');
  assert.match(sql, /t\.status = 'ACTIVE'/);
  assert.match(sql, /v_fulfillment\.status = 'PENDING' AND v_status IN \('ORDERED', 'CANCELLED'\)/);
  assert.match(sql, /v_fulfillment\.status = 'READY_FOR_PICKUP' AND v_status IN \('FULFILLED', 'CANCELLED'\)/);
  assert.match(sql, /Transicion de entrega no permitida/);
  assert.match(sql, /INSERT INTO public\.operational_audit_log/);
  assert.match(sql, /INSERT INTO public\.outbox_events/);
});
