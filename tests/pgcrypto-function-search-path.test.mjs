import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('scripts/migrations/016_pgcrypto_function_search_path.sql', 'utf8');

test('016 registra una reparación transaccional e idempotente de pgcrypto', () => {
  assert.match(migration, /^\s*--[\s\S]*?BEGIN;/i);
  assert.match(migration, /CREATE EXTENSION IF NOT EXISTS pgcrypto/i);
  assert.match(migration, /VALUES\s*\(\s*'016',\s*'pgcrypto_function_search_path'/i);
  assert.match(migration, /ON CONFLICT \(version\) DO NOTHING/i);
  assert.match(migration, /COMMIT;\s*$/i);
});

test('016 obtiene el esquema real de pgcrypto y no supone que digest está en public', () => {
  assert.match(migration, /pg_catalog\.pg_extension/i);
  assert.match(migration, /ext\.extname = 'pgcrypto'/i);
  assert.match(migration, /pg_catalog\.to_regprocedure/i);
  assert.match(migration, /ALTER FUNCTION %s SET search_path = %s/i);
});

test('016 cubre ingreso de producto, WMS, checkout, pedidos y tickets en espera', () => {
  const requiredFunctions = [
    'submit_catalog_product_draft_v2',
    'transfer_inventory_v2',
    'submit_inventory_count_v2',
    'review_inventory_count_v2',
    'checkout_sale_v2',
    'checkout_sale_v3',
    'create_public_order_v2',
    'record_public_order_accounting_v2',
    'park_pos_ticket_v2'
  ];

  requiredFunctions.forEach(functionName => {
    assert.match(migration, new RegExp(`public\\.${functionName}\\(`));
  });
});
