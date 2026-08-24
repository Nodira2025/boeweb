import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(
  path.join(path.resolve('.'), 'scripts/migrations/010_public_catalog_config_enforcement.sql'),
  'utf8'
).toLowerCase();

test('010 es forward-only, transaccional y queda registrada sin mutar 007', () => {
  assert.match(migration, /^begin;/);
  assert.match(migration, /commit;\s*$/);
  assert.match(migration, /create or replace view public\.public_catalog_products_v2/);
  assert.doesNotMatch(migration, /drop table|truncate|delete from/);
  assert.match(migration, /'010'[\s\S]*?'public_catalog_config_enforcement'/);
  assert.match(migration, /on conflict \(version\) do nothing/);
});

test('la vista pública aplica visibilidad y fuente de la configuración publicada', () => {
  assert.match(migration, /join public\.tenant_app_config tac/);
  assert.match(migration, /tac\.stage = 'published'/);
  assert.match(migration, /\{catalog,visibility\}'[\s\S]*?= 'public'/);
  assert.match(migration, /\{catalog,source\}'[\s\S]*?<> 'disabled'/);
});

test('showOutOfStock y allowBackorders gobiernan la exposición sin filtrar datos sensibles', () => {
  assert.match(migration, /having[\s\S]*?\{catalog,showoutofstock\}/);
  assert.match(migration, /having[\s\S]*?\{catalog,allowbackorders\}/);
  assert.match(migration, /greatest\(ib\.on_hand - ib\.reserved, 0\)/);
  assert.doesNotMatch(migration, /cost_price|supplier_id/);
});

test('la vista sólo concede lectura pública saneada', () => {
  assert.match(migration, /revoke all on public\.public_catalog_products_v2 from public/);
  assert.match(migration, /grant select on public\.public_catalog_products_v2 to anon, authenticated/);
  assert.match(migration, /grant all on public\.public_catalog_products_v2 to service_role/);
});
