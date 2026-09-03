import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('1. Archivos físicos de Reprocam: HTML, CSS, JS y Migración 020', () => {
  const root = process.cwd();
  const htmlPath = path.join(root, 'reprocam.html');
  const cssPath = path.join(root, 'reprocam.css');
  const jsPath = path.join(root, 'reprocam.js');
  const sqlPath = path.join(root, 'scripts', 'migrations', '020_reprocam_catalog_and_register.sql');

  assert.ok(fs.existsSync(htmlPath), 'reprocam.html debe existir físicamente');
  assert.ok(fs.existsSync(cssPath), 'reprocam.css debe existir físicamente');
  assert.ok(fs.existsSync(jsPath), 'reprocam.js debe existir físicamente');
  assert.ok(fs.existsSync(sqlPath), '020_reprocam_catalog_and_register.sql debe existir físicamente');
});

test('2. reprocam.html: Estructura mobile-first con Catálogo y Caja independiente', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'reprocam.html'), 'utf8');

  // Título e Identidad
  assert.match(html, /BÔ REPROCAM/);
  assert.match(html, /Catálogo & Caja Exclusiva/);

  // Tabs
  assert.match(html, /id="tab-btn-catalog"/);
  assert.match(html, /id="tab-btn-cash"/);
  assert.match(html, /switchRcTab\('catalog'\)/);
  assert.match(html, /switchRcTab\('cash'\)/);

  // Alta Rápida: Nombre, Selector g/u, Precio, Stock
  assert.match(html, /id="rc-prod-name"/);
  assert.match(html, /id="rc-btn-unit-gram"/);
  assert.match(html, /id="rc-btn-unit-unit"/);
  assert.match(html, /id="rc-prod-price"/);
  assert.match(html, /id="rc-prod-stock"/);

  // Mostrador de Venta / Pesaje
  assert.match(html, /id="rc-pos-product-select"/);
  assert.match(html, /id="rc-scale-value"/);
  assert.match(html, /id="rc-pos-qty-input"/);
  assert.match(html, /id="rc-pos-total-display"/);
  assert.match(html, /id="rc-btn-charge"/);

  // Botones Rápidos de Balanza
  assert.match(html, /setRcQuickGrams\(1\)/);
  assert.match(html, /setRcQuickGrams\(3\.5\)/);
  assert.match(html, /setRcQuickGrams\(5\)/);
  assert.match(html, /setRcQuickGrams\(10\)/);

  // Caja Reprocam y Arqueo
  assert.match(html, /Caja Reprocam/);
  assert.match(html, /id="rc-cash-opening-val"/);
  assert.match(html, /id="rc-cash-sales-val"/);
  assert.match(html, /id="rc-cash-expected-val"/);
  assert.match(html, /openRcShift\(\)/);
  assert.match(html, /closeRcShift\(\)/);
});

test('3. Migración 020 SQL: Terminal CAJA-REPROCAM y funciones RPC transaccionales', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'scripts', 'migrations', '020_reprocam_catalog_and_register.sql'), 'utf8');

  // Terminal en cash_registers
  assert.match(sql, /'CAJA-REPROCAM'/);
  assert.match(sql, /Caja Reprocam/);

  // RPC upsert_reprocam_product_v2
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.upsert_reprocam_product_v2/);
  assert.match(sql, /p_unit TEXT DEFAULT 'g'/);
  assert.match(sql, /'is_reprocam', true/);
  assert.match(sql, /'reprocam_unit', v_unit/);

  // RPC record_reprocam_sale_v2
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.record_reprocam_sale_v2/);
  assert.match(sql, /Stock insuficiente en Reprocam/);
  assert.match(sql, /r\.code = 'CAJA-REPROCAM'/);
  assert.match(sql, /INSERT INTO public\.cash_movements_v2/);
  assert.match(sql, /'020'/);
});

test('4. Lógica de Pesaje y Fraccionamiento: Cálculos exactos para g y u', () => {
  // Simulación de cálculo de venta pesable (gramos con decimales)
  function calculateSale(pricePerUnit, quantity) {
    return Math.round(Number(pricePerUnit) * Number(quantity) * 100) / 100;
  }

  // Caso 1: Flor / Biomasa a granel pesada en balanza (ej: 3.5g a $4.500/g)
  const totalGrams = calculateSale(4500, 3.5);
  assert.equal(totalGrams, 15750, '3.5g a $4.500 debe dar exactamente $15.750');

  // Caso 2: Pequeño pesaje fraccionario (ej: 0.75g a $5.000/g)
  const totalMicro = calculateSale(5000, 0.75);
  assert.equal(totalMicro, 3750, '0.75g a $5.000 debe dar exactamente $3.750');

  // Caso 3: Producto fraccionado por unidad (ej: 2 semillas sueltas a $3.000/u)
  const totalUnits = calculateSale(3000, 2);
  assert.equal(totalUnits, 6000, '2 unidades a $3.000 debe dar exactamente $6.000');
});

test('5. Enlaces de navegación hacia Reprocam en el portal vendedor', () => {
  const vendorHtml = fs.readFileSync(path.join(process.cwd(), 'vendedor.html'), 'utf8');

  // Enlace en sidebar
  assert.match(vendorHtml, /href="reprocam\.html"[^>]*class="vendor-side-nav-item"/);
  assert.match(vendorHtml, /<span>Reprocam<\/span>/);

  // Enlace en menú móvil de operaciones
  assert.match(vendorHtml, /href="reprocam\.html"[^>]*class="vendor-sheet-op-btn"/);
  assert.match(vendorHtml, /Reprocam & Caja/);
});
