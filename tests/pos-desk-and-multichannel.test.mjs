import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PosCartEngine } from '../pos-cart-engine.js';
import AppConfig from '../app-config.js';
import PosDeskUtils from '../pos-desk-utils.js';

test('1. parsePosScanCommand: parsea multiplicadores de escaneo rápido de mostrador', () => {
  const { parsePosScanCommand } = PosDeskUtils;

  assert.deepEqual(parsePosScanCommand('5*7791234567890'), { quantity: 5, code: '7791234567890' });
  assert.deepEqual(parsePosScanCommand('3xSKU-PROD-99'), { quantity: 3, code: 'SKU-PROD-99' });
  assert.deepEqual(parsePosScanCommand('10 * 7799999'), { quantity: 10, code: '7799999' });
  assert.deepEqual(parsePosScanCommand('7791234567890'), { quantity: 1, code: '7791234567890' });
  assert.deepEqual(parsePosScanCommand(''), { quantity: 1, code: '' });
  assert.deepEqual(parsePosScanCommand('2.5*SKU'), { quantity: 1, code: '2.5*SKU' });
  assert.deepEqual(parsePosScanCommand('1000*SKU'), { quantity: 1, code: '1000*SKU' });
  assert.deepEqual(parsePosScanCommand('SKU*5'), { quantity: 1, code: 'SKU*5' });
});

test('2. PosCartEngine: acepta ítems libres (QUICK_ENTRY) y backorders sin stock físico', () => {
  const cart = new PosCartEngine();

  // 1. Ítem libre
  const quickAdded = cart.addItem({
    id: 'QUICK-101',
    name: 'Sustrato Especial Fraccionado 5L',
    price: 3500,
    quantity: 2,
    line_type: 'QUICK_ENTRY',
    product_id: null
  });
  assert.equal(quickAdded, true);

  // 2. Ítem sin stock propio (Backorder)
  const backorderAdded = cart.addItem({
    id: 'PROD-OUT',
    product_code: 'OUT-999',
    name: 'Panel LED Quantum 150W (Agotado)',
    price: 180000,
    quantity: 1,
    line_type: 'OWN_BACKORDER',
    stock: 0
  });
  assert.equal(backorderAdded, true);

  assert.equal(cart.getItemCount(), 3);
  assert.equal(cart.getSubtotal(), 3500 * 2 + 180000);
});

test('2.b PosCartEngine permite productos propios que explícitamente no controlan stock', () => {
  const cart = new PosCartEngine();
  const added = cart.addItem({
    id: 'SERVICE-001',
    name: 'Servicio de armado',
    price: 12000,
    quantity: 1,
    line_type: 'OWN_STOCK',
    track_stock: false,
    stock: 0,
    available_quantity: null
  });
  assert.equal(added, true);
  assert.equal(cart.getItems()[0].track_stock, false);
  assert.equal(cart.getItems()[0].available_quantity, null);
});

test('3. AppConfig y Cálculo de Vuelto en Efectivo con Denominaciones ARS', () => {
  const denominations = AppConfig.DEFAULT_CONFIG.rules.pos.billDenominations;
  assert.ok(Array.isArray(denominations));
  assert.ok(denominations.includes(20000));
  assert.ok(denominations.includes(10000));
  assert.ok(denominations.includes(1000));

  const totalSale = 16500;
  const tendered = 20000;
  const result = PosDeskUtils.calculateCashChange(totalSale, tendered);

  assert.equal(result.change, 3500);
  assert.equal(result.sufficient, true);
  assert.equal(PosDeskUtils.calculateCashChange(100.10, 100.20).change, 0.1);
  assert.equal(PosDeskUtils.calculateCashChange(100, 90).sufficient, false);
});

test('4. Vales de caja usan numeración central y no imprimen un UUID como comprobante', () => {
  const source = fs.readFileSync(path.resolve('vendedor.js'), 'utf8');
  assert.match(source, /if \(!movement\.documentNumber\)/);
  assert.match(source, /documentNumber:\s*movement\.document_number/);
  assert.match(source, /N\.º Comprobante:<\/strong>\s*\$\{escapeCashHtml\(movement\.documentNumber\)\}/);
  assert.doesNotMatch(source, /N\.º:\s*\$\{movement\.id\}/);
});

test('5. La posventa describe con precisión impresión/PDF y preparación de correo', () => {
  const html = fs.readFileSync(path.resolve('vendedor.html'), 'utf8');
  const source = fs.readFileSync(path.resolve('vendedor.js'), 'utf8');
  assert.match(html, /Imprimir comprobante interno/);
  assert.match(html, /Imprimir \/ guardar PDF A4/);
  assert.match(html, /Preparar correo/);
  assert.match(source, /mailto:\?subject=/);
  assert.doesNotMatch(html, /Enviar por Email/);
});

test('6. Los tickets en espera conservan su número y no reportan un falso error después de guardarse', () => {
  const source = fs.readFileSync(path.resolve('vendedor.js'), 'utf8');
  const sql = fs.readFileSync(path.resolve('scripts', 'migrations', '012_pos_flexible_sales.sql'), 'utf8');
  const parkStart = source.indexOf('async function parkCurrentPosSale()');
  const parkEnd = source.indexOf('window.parkCurrentPosSale', parkStart);
  const parkSource = source.slice(parkStart, parkEnd);
  assert.match(parkSource, /const parkedTicket = await window\.OperationalApi\.parkPosTicket/);
  assert.doesNotMatch(parkSource, /if \(!added\)/);
  assert.match(sql, /parked_pos_tickets_v2 ADD COLUMN IF NOT EXISTS document_number TEXT/);
  assert.match(sql, /'document_number', pt\.document_number/);
});

test('7. Las preferencias publicadas gobiernan ventas en espera y duplicados', () => {
  const source = fs.readFileSync(path.resolve('vendedor.js'), 'utf8');
  const sql = fs.readFileSync(path.resolve('scripts', 'migrations', '012_pos_flexible_sales.sql'), 'utf8');
  assert.match(source, /rules\.pos\.parkedTicketsEnabled/);
  assert.match(sql, /\{rules,pos,parkedTicketsEnabled\}/,
    'El backend debe hacer cumplir la preferencia de tickets en espera');
  assert.match(source, /function shouldPrintDuplicateReceipts\(\)/);
  assert.match(source, /rules\.pos\.printDuplicateReceipts/);
  assert.match(source, /shouldPrintDuplicateReceipts\(\) \? `<div class="cut-line"/);
});
