import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('1. Interfaz de Escaneo por Cámara: Botones y Modal Universal en HTML', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'vendedor.html'), 'utf8');

  // Botón Usar Cámara en POS (Vender Producto)
  assert.match(html, /id="pos-camera-scanner-btn"/);
  assert.match(html, /class="pos-camera-btn"/);
  assert.match(html, /onclick="openUniversalCameraScanner\('pos'\)"/);
  assert.match(html, /Usar cámara/);

  // Botón Usar Cámara en Ingreso Rápido de Stock
  assert.match(html, /class="stock-camera-scan-btn"/);
  assert.match(html, /onclick="openUniversalCameraScanner\('stock'\)"/);

  // Modal Universal de Cámara
  assert.match(html, /id="modal-universal-camera-scanner"/);
  assert.match(html, /id="camera-scanner-modal-title"/);
  assert.match(html, /id="universal-camera-reader-viewport"/);
  assert.match(html, /id="camera-scanner-feedback"/);
  assert.match(html, /onclick="switchUniversalCamera\(\)"/);
  assert.match(html, /onclick="toggleUniversalCameraTorch\(\)"/);
  assert.match(html, /onchange="handleCameraScannerFile\(event\)"/);

  // Script CDN de html5-qrcode
  assert.match(html, /html5-qrcode/);
});

test('2. Estilos Visuales: Clases CSS para botones de cámara y visor láser', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'vendedor-caja.css'), 'utf8');

  assert.match(css, /\.pos-camera-btn/);
  assert.match(css, /\.stock-camera-scan-btn/);
  assert.match(css, /camera-laser-scan/);
  assert.match(css, /@keyframes camera-laser-scan/);
});

test('3. Lógica del Escáner por Cámara: Exportación y Handlers en vendedor.js', () => {
  const js = fs.readFileSync(path.join(process.cwd(), 'vendedor.js'), 'utf8');

  assert.match(js, /function openUniversalCameraScanner/);
  assert.match(js, /function startUniversalCameraReader/);
  assert.match(js, /function handleUniversalCameraScanSuccess/);
  assert.match(js, /function closeUniversalCameraScanner/);
  assert.match(js, /function switchUniversalCamera/);
  assert.match(js, /function toggleUniversalCameraTorch/);
  assert.match(js, /function handleCameraScannerFile/);
  assert.match(js, /function playScannerBeep/);

  assert.match(js, /window\.openUniversalCameraScanner/);
  assert.match(js, /window\.closeUniversalCameraScanner/);
  assert.match(js, /window\.handleUniversalCameraScanSuccess/);
});

test('4. Procesamiento Idempotente del Código Escaneado con Cámara', () => {
  // Simular catálogo interno
  const mockCatalog = [
    {
      id: 'PROD-001',
      name: 'Sustrato Light Mix 50L',
      brand: 'Plagron',
      barcode: '8718844000107',
      price: 15500,
      stock: 12
    },
    {
      id: 'PROD-002',
      name: 'Bio Grow 1L',
      brand: 'BioBizz',
      barcode: '8424365123456',
      price: 24000,
      stock: 0
    }
  ];

  function simulateScan(code, prods) {
    const clean = String(code).trim().toLowerCase();
    const match = prods.find(p => (p.barcode && String(p.barcode).trim().toLowerCase() === clean) || p.id.toLowerCase() === clean);
    if (!match) return { status: 'NOT_FOUND' };
    if (Number(match.stock) <= 0) return { status: 'OUT_OF_STOCK', product: match };
    return { status: 'OK', product: match };
  }

  const result1 = simulateScan('8718844000107', mockCatalog);
  assert.equal(result1.status, 'OK');
  assert.equal(result1.product.name, 'Sustrato Light Mix 50L');

  const result2 = simulateScan('8424365123456', mockCatalog);
  assert.equal(result2.status, 'OUT_OF_STOCK');

  const result3 = simulateScan('9999999999999', mockCatalog);
  assert.equal(result3.status, 'NOT_FOUND');
});
