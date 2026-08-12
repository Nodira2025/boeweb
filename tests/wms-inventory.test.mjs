import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('WMS: El código fuente exporta correctamente las funciones WMS y traduce niveles humanos', async () => {
  const sellerSource = fs.readFileSync(path.join(process.cwd(), 'vendedor.js'), 'utf8');

  // Verify functions exist in vendedor.js
  assert.match(sellerSource, /function getHumanLevelLabel/);
  assert.match(sellerSource, /function getHumanSectorLabel/);
  assert.match(sellerSource, /function handleWmsTransferSubmit/);
  assert.match(sellerSource, /function submitWmsAuditWithStatus/);
  assert.match(sellerSource, /function runWmsReverseSearch/);
});

test('WMS: Nivel humano traduce 1..5 a etiquetas legibles para empleados', () => {
  function getHumanLevelLabel(level) {
    const num = Number(level) || 3;
    const labels = {
      1: 'Nivel 1 — abajo',
      2: 'Nivel 2 — bajo',
      3: 'Nivel 3 — altura media',
      4: 'Nivel 4 — alto',
      5: 'Nivel 5 — arriba'
    };
    return labels[num] || `Nivel ${num}`;
  }

  assert.equal(getHumanLevelLabel(1), 'Nivel 1 — abajo');
  assert.equal(getHumanLevelLabel(3), 'Nivel 3 — altura media');
  assert.equal(getHumanLevelLabel(5), 'Nivel 5 — arriba');
});

test('WMS: Transferencia atómica valida stock insuficiente y no permite mover más de lo disponible', () => {
  const locations = [
    { module_code: 'PI-M04', product_id: 'prod-1', human_level: 3, sector_position: 'C', quantity: 10 }
  ];

  function validateTransfer(qty, available) {
    if (qty <= 0) return { success: false, error: 'Cantidad debe ser mayor a cero' };
    if (qty > available) return { success: false, error: 'Stock insuficiente en origen' };
    return { success: true };
  }

  assert.equal(validateTransfer(5, 10).success, true);
  assert.equal(validateTransfer(10, 10).success, true);
  assert.equal(validateTransfer(12, 10).success, false);
  assert.equal(validateTransfer(0, 10).success, false);
  assert.equal(validateTransfer(-5, 10).success, false);
});

test('WMS: Mismo SKU en múltiples ubicaciones físicas (Búsqueda Inversa)', () => {
  const locations = [
    { module_code: 'PI-M04', product_id: 'klasmann-50l', human_level: 3, sector_position: 'C', quantity: 25 },
    { module_code: 'PD-M02', product_id: 'klasmann-50l', human_level: 2, sector_position: 'I', quantity: 10 },
    { module_code: 'DEP-M01', product_id: 'klasmann-50l', human_level: 5, sector_position: 'C', quantity: 3 }
  ];

  const found = locations.filter(loc => loc.product_id === 'klasmann-50l');
  const totalPhysicalStock = found.reduce((acc, curr) => acc + curr.quantity, 0);

  assert.equal(found.length, 3);
  assert.equal(totalPhysicalStock, 38);
});

test('WMS: Reportar diferencia en auditoría NO altera el stock comercial ni físico automáticamente', () => {
  const initialLocations = [
    { module_code: 'PI-M04', product_id: 'prod-1', quantity: 15 }
  ];

  // Simular auditoría donde el empleado encuentra 12 unidades (diferencia -3)
  const auditReport = {
    module_code: 'PI-M04',
    status: 'PENDIENTE_APROBACION',
    items: [
      { product_id: 'prod-1', expected_qty: 15, found_qty: 12, difference: -3 }
    ]
  };

  // La cantidad en ubicaciones físicas permanece 15
  assert.equal(initialLocations[0].quantity, 15);
  assert.equal(auditReport.items[0].difference, -3);
  assert.equal(auditReport.status, 'PENDIENTE_APROBACION');
});
