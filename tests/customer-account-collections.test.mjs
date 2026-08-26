import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('1. Conciliación de cobranza en cuenta corriente: valida saldo previo, abono y saldo remanente', () => {
  function processAccountPayment({ currentBalance, paymentAmount }) {
    if (paymentAmount <= 0) {
      throw new Error('El importe de cobro debe ser mayor a 0');
    }
    if (paymentAmount > currentBalance) {
      throw new Error('El cobro no puede superar la deuda actual');
    }

    const previousBalance = currentBalance;
    const remainingBalance = currentBalance - paymentAmount;

    return {
      previousBalance,
      paymentAmount,
      remainingBalance,
      isFullyPaid: remainingBalance === 0
    };
  }

  // Caso 1: Pago parcial ($15.000 de $50.000)
  const p1 = processAccountPayment({ currentBalance: 50000, paymentAmount: 15000 });
  assert.equal(p1.previousBalance, 50000);
  assert.equal(p1.paymentAmount, 15000);
  assert.equal(p1.remainingBalance, 35000);
  assert.equal(p1.isFullyPaid, false);

  // Caso 2: Cancelación total ($35.000 de $35.000)
  const p2 = processAccountPayment({ currentBalance: 35000, paymentAmount: 35000 });
  assert.equal(p2.remainingBalance, 0);
  assert.equal(p2.isFullyPaid, true);

  // Caso 3: Rechazo de pago excesivo ($60.000 con deuda de $50.000)
  assert.throws(() => {
    processAccountPayment({ currentBalance: 50000, paymentAmount: 60000 });
  }, /El cobro no puede superar la deuda actual/);
});

test('2. Recibo de cobranza: genera formato en dos cuerpos institucionales y firmas', () => {
  function generateCollectionReceipt(data, copyType) {
    return `
      [${copyType}]
      BÔ GROW CLUB · RECIBO DE COBRANZA · COMPROBANTE INTERNO NO FISCAL
      Recibo N.º: ${data.receiptId}
      Cliente: ${data.customerName}
      Monto Abonado: $${data.amount}
      Saldo Anterior: $${data.previousBalance}
      Saldo Remanente: $${data.balance}
      [Firma y Aclaración Cliente] [Firma y Sello BÔ Grow Club]
    `;
  }

  const receiptData = {
    receiptId: 'REC-10025',
    customerName: 'Martín Palermo',
    amount: 15000,
    previousBalance: 50000,
    balance: 35000
  };

  const original = generateCollectionReceipt(receiptData, 'ORIGINAL · CLIENTE / CONSTANCIA DE PAGO');
  const duplicate = generateCollectionReceipt(receiptData, 'DUPLICADO · ADMINISTRACIÓN / CONTROL');

  assert.ok(original.includes('ORIGINAL · CLIENTE / CONSTANCIA DE PAGO'));
  assert.ok(original.includes('REC-10025'));
  assert.ok(original.includes('Martín Palermo'));
  assert.ok(original.includes('$15000'));
  assert.ok(original.includes('Firma y Aclaración Cliente'));

  assert.ok(duplicate.includes('DUPLICADO · ADMINISTRACIÓN / CONTROL'));
  assert.ok(duplicate.includes('Firma y Sello BÔ Grow Club'));
});

test('3. Notificación de Cobro por WhatsApp: formatea mensaje de pago y saldo remanente', () => {
  function generatePaymentWhatsAppMessage({ customerName, receiptId, amount, method, balance }) {
    return (
      `🌱 *BÔ GROW CLUB — Constancia de Pago*\n\n` +
      `¡Hola ${customerName}! 👋 Te confirmamos la recepción de tu pago:\n\n` +
      `📄 *Recibo N.º:* #${receiptId}\n` +
      `💵 *Importe Abonado:* *$${amount}* (${method})\n` +
      `💰 *Saldo Remanente en Cuenta Corriente:* *$${balance}*\n\n` +
      `¡Muchas gracias por tu compromiso! 🌱✨`
    );
  }

  const msg = generatePaymentWhatsAppMessage({
    customerName: 'Román Riquelme',
    receiptId: 'REC-10030',
    amount: '20.000,00',
    method: 'Efectivo',
    balance: '15.000,00'
  });

  assert.ok(msg.includes('Román Riquelme'));
  assert.ok(msg.includes('#REC-10030'));
  assert.ok(msg.includes('$20.000,00'));
  assert.ok(msg.includes('$15.000,00'));
  assert.ok(msg.includes('Saldo Remanente en Cuenta Corriente'));
});

test('4. Las cobranzas reciben número central y la UI no usa el UUID del ledger como recibo', () => {
  const sql = fs.readFileSync(path.resolve('scripts', 'migrations', '012_pos_flexible_sales.sql'), 'utf8');
  const source = fs.readFileSync(path.resolve('vendedor.js'), 'utf8');
  assert.match(sql, /AR_PAYMENT_RECEIPT/);
  assert.match(sql, /CREATE TRIGGER ar_payments_assign_document_v2/);
  assert.match(sql, /accounts_receivable_ledger_document_number_uidx/);
  assert.match(source, /documentNumber:\s*entry\.document_number/);
  assert.match(source, /receiptId:\s*mov\.documentNumber \|\| null/);
  assert.doesNotMatch(source, /receiptId:\s*result\.entry_id/);
  assert.match(source, /Comprobante interno no fiscal/);
});
