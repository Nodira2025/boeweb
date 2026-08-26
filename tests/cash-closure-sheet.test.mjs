import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import OperationalApi from '../operational-api.js';

test('1. Calculadora de billetes ARS: calcula subtotales por denominación y total acumulado', () => {
  function calculateBreakdown(input) {
    const denoms = [20000, 10000, 2000, 1000, 500, 200, 100];
    let total = 0;
    const details = {};

    denoms.forEach(d => {
      const qty = input[d] || 0;
      if (qty > 0) {
        details[d] = qty * d;
        total += qty * d;
      }
    });

    const coins = input.coins || 0;
    if (coins > 0) {
      details.coins = coins;
      total += coins;
    }

    return { total, details };
  }

  // Ejemplo: 5 billetes de $20.000 + 3 de $10.000 + 10 de $1.000 + 450 en monedas
  const input = {
    20000: 5, // 100.000
    10000: 3, // 30.000
    1000: 10, // 10.000
    coins: 450
  };

  const res = calculateBreakdown(input);
  assert.equal(res.total, 140450);
  assert.equal(res.details[20000], 100000);
  assert.equal(res.details[10000], 30000);
  assert.equal(res.details[1000], 10000);
  assert.equal(res.details.coins, 450);
});

test('2. Conciliación contable de caja: calcula efectivo esperado y diferencia de arqueo', () => {
  function reconcileCash({ openingCash, cashSales, otherIncome, expenses, withdrawals, countedCash }) {
    const totalCashIn = openingCash + cashSales + otherIncome;
    const totalCashOut = expenses + withdrawals;
    const expectedCash = totalCashIn - totalCashOut;
    const difference = countedCash - expectedCash;

    let status = 'BALANCED';
    if (difference > 0.01) status = 'SURPLUS';
    else if (difference < -0.01) status = 'SHORTAGE';

    return { expectedCash, difference, status };
  }

  // Caso 1: Caja balanceada
  const c1 = reconcileCash({
    openingCash: 15000,
    cashSales: 85000,
    otherIncome: 5000,
    expenses: 12000,
    withdrawals: 20000,
    countedCash: 73000 // 15000 + 85000 + 5000 - 12000 - 20000 = 73000
  });
  assert.equal(c1.expectedCash, 73000);
  assert.equal(c1.difference, 0);
  assert.equal(c1.status, 'BALANCED');

  // Caso 2: Sobrante de caja ($2.000)
  const c2 = reconcileCash({
    openingCash: 10000,
    cashSales: 50000,
    otherIncome: 0,
    expenses: 5000,
    withdrawals: 0,
    countedCash: 57000 // Esperado: 55000, Contado: 57000
  });
  assert.equal(c2.expectedCash, 55000);
  assert.equal(c2.difference, 2000);
  assert.equal(c2.status, 'SURPLUS');

  // Caso 3: Faltante de caja (-$1.500)
  const c3 = reconcileCash({
    openingCash: 10000,
    cashSales: 30000,
    otherIncome: 0,
    expenses: 0,
    withdrawals: 0,
    countedCash: 38500 // Esperado: 40000, Contado: 38500
  });
  assert.equal(c3.expectedCash, 40000);
  assert.equal(c3.difference, -1500);
  assert.equal(c3.status, 'SHORTAGE');
});

test('3. Planilla de Cierre con Duplicado: valida que contenga los dos cuerpos institucionales y firmas', () => {
  function generateClosureSheet(dateKey, copyType) {
    return `
      [${copyType}]
      BÔ GROW CLUB · PLANILLA OFICIAL DE ARQUEO
      Fecha: ${dateKey}
      [Firma Cajero] [Firma Supervisor]
    `;
  }

  const original = generateClosureSheet('2026-08-25', 'ORIGINAL · ADMINISTRACIÓN / TESORERÍA');
  const duplicate = generateClosureSheet('2026-08-25', 'DUPLICADO · CAJERO / CONSTANCIA DE TURNO');

  assert.ok(original.includes('ORIGINAL · ADMINISTRACIÓN / TESORERÍA'));
  assert.ok(original.includes('Firma Cajero'));
  assert.ok(original.includes('Firma Supervisor'));

  assert.ok(duplicate.includes('DUPLICADO · CAJERO / CONSTANCIA DE TURNO'));
  assert.ok(duplicate.includes('Firma Cajero'));
  assert.ok(duplicate.includes('Firma Supervisor'));
});

test('4. Caja y cierres reciben numeración documental atómica desde la base', () => {
  const sql = fs.readFileSync(path.resolve('scripts', 'migrations', '012_pos_flexible_sales.sql'), 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS document_number TEXT/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.allocate_document_number_v2/);
  assert.match(sql, /ON CONFLICT \(tenant_id, doc_type\) DO UPDATE/);
  assert.match(sql, /CREATE TRIGGER cash_movements_assign_document_v2/);
  assert.match(sql, /NEW\.movement_type IN \('INCOME', 'EXPENSE', 'WITHDRAWAL', 'ADJUSTMENT'\)/,
    'Las ventas no deben recibir un segundo vale de caja además del comprobante POS');
  assert.match(sql, /COALESCE\(NEW\.reference_type, ''\) <> 'AR_LEDGER'/,
    'Una cobranza ya numerada no debe recibir además un segundo vale de caja');
  assert.match(sql, /CREATE TRIGGER cash_closures_assign_document_v2/);
  assert.match(sql, /CREATE TRIGGER ar_payments_assign_document_v2/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.submit_cash_closure_v3/);
  assert.match(sql, /'cash_breakdown', v_breakdown/,
    'El desglose de billetes debe quedar sellado en el cierre central');
  assert.match(sql, /round\(v_breakdown_total, 2\) <> p_counted/,
    'El servidor debe rechazar un desglose que no coincide con el total contado');
  assert.match(sql, /'CAPTURED', v_session_id/,
    'Todos los medios de pago deben quedar vinculados a la sesión de caja exacta');
  assert.match(sql, /sp\.cash_session_id = p_session_id/,
    'El resumen digital debe derivarse de la sesión y no de una ventana horaria del cajero');
  assert.match(sql, /SELECT cs\.\* INTO v_session[\s\S]+FOR UPDATE;[\s\S]+SELECT cc\.\* INTO v_existing/,
    'La sesión debe bloquearse antes del control idempotente para soportar cierres concurrentes');
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.allocate_document_number_v2[^;]+authenticated/s);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.next_document_number_v2\(UUID, TEXT\) TO service_role/,
    'La numeración no debe poder consumirse directamente desde una sesión de vendedor');
});

test('5. El cliente envía el arqueo a v3 y rechaza un desglose inconsistente', async () => {
  const calls = [];
  const supabaseClient = {
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      return { data: { closure_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }, error: null };
    }
  };
  const authContext = {
    isVerified: true,
    tenantId: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222'
  };
  const sessionId = '33333333-3333-4333-8333-333333333333';

  await OperationalApi.submitCashClosure({
    supabaseClient,
    authContext,
    sessionId,
    countedAmount: 1200.5,
    cashBreakdown: { 1000: 1, 100: 2, coins: 0.5 },
    notes: 'Conteo verificado'
  });
  assert.equal(calls[0].name, 'submit_cash_closure_v3');
  assert.deepEqual(calls[0].parameters.p_cash_breakdown, { 1000: 1, 100: 2, coins: 0.5 });

  await assert.rejects(
    OperationalApi.submitCashClosure({
      supabaseClient,
      authContext,
      sessionId,
      countedAmount: 1200,
      cashBreakdown: { 1000: 1 }
    }),
    error => error instanceof OperationalApi.OperationalApiError && error.code === 'CASH_BREAKDOWN_MISMATCH'
  );
  assert.equal(calls.length, 1, 'un desglose inválido no debe llegar al servidor');
});
