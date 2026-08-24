import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migrationFiles = Object.freeze([
  '000_saas_foundation.sql',
  '001_initial_schema_baseline.sql',
  '002_add_schema_migrations_and_releases.sql',
  '003_expand_contract_support.sql'
]);

function readMigration(fileName) {
  const filePath = path.resolve('scripts', 'migrations', fileName);
  assert.ok(fs.existsSync(filePath), `falta la migración ${filePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ');
}

function compact(source) {
  return withoutComments(source).replace(/\s+/g, ' ').trim().toLowerCase();
}

function definition(source, marker) {
  const normalizedMarker = marker.toLowerCase();
  const lower = source.toLowerCase();
  const start = lower.indexOf(normalizedMarker);
  assert.notEqual(start, -1, `no se encontró ${marker}`);
  const nextSemicolon = source.indexOf(';', start);
  assert.notEqual(nextSemicolon, -1, `${marker} no finaliza`);
  return source.slice(start, nextSemicolon + 1);
}

function functionDefinition(source, functionName) {
  const expression = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\s*\\(`, 'i');
  const match = expression.exec(source);
  assert.ok(match, `no se encontró public.${functionName}`);
  const tail = source.slice(match.index);
  const delimiterMatch = /\bas\s+(\$[a-z0-9_]*\$)/i.exec(tail);
  assert.ok(delimiterMatch, `${functionName} no usa dollar quoting`);
  const delimiter = delimiterMatch[1];
  const bodyStart = delimiterMatch.index + delimiterMatch[0].length;
  const bodyEnd = tail.indexOf(delimiter, bodyStart);
  assert.notEqual(bodyEnd, -1, `${functionName} no cierra ${delimiter}`);
  return tail.slice(0, bodyEnd + delimiter.length);
}

test('000..003 forman una secuencia transaccional, registrada e idempotente', () => {
  migrationFiles.forEach((fileName, index) => {
    const sql = readMigration(fileName);
    const normalized = compact(sql);
    const version = String(index).padStart(3, '0');

    assert.match(normalized, /^begin\s*;/, `${fileName} debe abrir una transacción`);
    assert.match(normalized, /commit\s*;$/, `${fileName} debe confirmar la transacción`);
    assert.match(normalized, /insert into public\.schema_migrations\b/);
    assert.match(normalized, new RegExp(`values\\s*\\(\\s*'${version}'`));
    assert.match(normalized, /on conflict\s*\(\s*version\s*\)\s*do\s+(?:nothing|update)/);
    assert.doesNotMatch(normalized, /\b(?:drop\s+table|truncate\s+table)\b/);
    assert.doesNotMatch(normalized, /\bcreate\s+table\s+(?!if\s+not\s+exists)/);
    assert.doesNotMatch(normalized, /\bcreate\s+(?:unique\s+)?index\s+(?!if\s+not\s+exists)/);
  });
});

test('000 crea las dependencias que 004 necesita antes de registrar el baseline', () => {
  const sql = compact(readMigration(migrationFiles[0]));
  const extension = sql.indexOf('create extension if not exists pgcrypto');
  const registry = sql.indexOf('create table if not exists public.schema_migrations');
  const tenants = sql.indexOf('create table if not exists public.tenants');
  const tenantUsers = sql.indexOf('create table if not exists public.tenant_users');
  const registration = sql.indexOf("values ('000'");

  assert.ok(extension >= 0);
  assert.ok(registry > extension);
  assert.ok(tenants > registry);
  assert.ok(tenantUsers > tenants);
  assert.ok(registration > tenantUsers);
  assert.match(sql, /unique\s*\(\s*tenant_id\s*,\s*user_id\s*\)/);
});

test('000 normaliza instalaciones legacy sin perder SETUP ni la vertical de marca', () => {
  const sql = compact(readMigration(migrationFiles[0]));
  const dropStatusConstraint = sql.indexOf('alter table public.tenants drop constraint if exists tenants_status_check');
  const normalizeStatus = sql.indexOf('update public.tenants set status');
  const addStatusConstraint = sql.indexOf('alter table public.tenants add constraint tenants_status_check');
  const dropRoleConstraint = sql.indexOf('alter table public.tenant_users drop constraint if exists tenant_users_role_check');
  const normalizeRole = sql.indexOf('update public.tenant_users set role');
  const addRoleConstraint = sql.indexOf('alter table public.tenant_users add constraint tenant_users_role_check');

  assert.ok(dropStatusConstraint >= 0 && dropStatusConstraint < normalizeStatus);
  assert.ok(normalizeStatus < addStatusConstraint);
  assert.match(sql, /when 'activo' then 'active'/);
  assert.match(sql, /when 'suspendido' then 'suspended'/);
  assert.match(sql, /when 'en_prueba' then 'trial'/);
  assert.match(sql, /check\s*\(\s*status in\s*\(\s*'setup'\s*,\s*'active'\s*,\s*'suspended'\s*,\s*'trial'\s*,\s*'archived'\s*\)\s*\)/);
  assert.match(sql, /vertical_code varchar\(50\) not null default 'growshop'/);
  assert.match(sql, /add column if not exists vertical_code/);
  assert.match(sql, /update public\.tenants set vertical_code = 'growshop' where nullif\s*\(\s*btrim\(vertical_code\)\s*,\s*''\s*\) is null/);

  assert.ok(dropRoleConstraint >= 0 && dropRoleConstraint < normalizeRole);
  assert.ok(normalizeRole < addRoleConstraint);
  assert.match(sql, /when 'superadmin' then 'admin'/);
  assert.match(sql, /check\s*\(\s*role in\s*\(\s*'admin'\s*,\s*'supervisor'\s*,\s*'vendedor'\s*,\s*'deposito'\s*\)\s*\)/);
});

test('helpers de identidad evitan recursión RLS y no aceptan sesiones anónimas', () => {
  const sql = readMigration(migrationFiles[0]);

  for (const helper of ['is_superadmin', 'is_tenant_member']) {
    const normalized = compact(functionDefinition(sql, helper));
    assert.match(normalized, /security definer/);
    assert.match(normalized, /set search_path = pg_catalog\s*,\s*public\s*,\s*pg_temp/);
    assert.match(normalized, /set row_security = off/);
    assert.match(normalized, /auth\.uid\s*\(\s*\) is not null/);
    assert.match(normalized, /revoke all on function|select/);
  }

  const normalized = compact(sql);
  assert.match(normalized, /revoke all on function public\.is_superadmin\(\) from public\s*,\s*anon/);
  assert.match(normalized, /revoke all on function public\.is_tenant_member\(uuid\) from public\s*,\s*anon/);
  assert.match(normalized, /grant execute on function public\.is_superadmin\(\)\s*,\s*public\.is_tenant_member\(uuid\) to authenticated\s*,\s*service_role/);
});

test('RLS de fundación sólo expone filas del tenant y reserva escrituras al backend', () => {
  const sql = compact(readMigration(migrationFiles[0]));

  for (const tableName of ['tenants', 'tenant_users', 'platform_admins']) {
    assert.match(sql, new RegExp(`alter table public\\.${tableName} enable row level security`));
    assert.match(sql, new RegExp(`create policy [^;]+ on public\\.${tableName}`));
  }

  assert.match(sql, /create policy tenants_member_select_v2 on public\.tenants for select to authenticated using\s*\([^;]*is_tenant_member\(id\)/);
  assert.match(sql, /create policy tenant_users_member_select_v2 on public\.tenant_users for select to authenticated using\s*\([^;]*is_tenant_member\(tenant_id\)/);
  assert.match(sql, /create policy platform_admins_self_select_v2 on public\.platform_admins for select to authenticated using\s*\(\s*user_id = auth\.uid\(\)\s*\)/);
  assert.match(sql, /revoke all on public\.tenants\s*,\s*public\.tenant_users\s*,\s*public\.platform_admins from public\s*,\s*anon\s*,\s*authenticated/);
  assert.match(sql, /grant select on public\.tenants\s*,\s*public\.tenant_users\s*,\s*public\.platform_admins to authenticated/);
  assert.doesNotMatch(sql, /grant[^;]*\b(?:insert|update|delete)\b[^;]*to authenticated/);
});

test('001 hace inmutable el registro de migraciones para usuarios normales', () => {
  const sql = compact(readMigration(migrationFiles[1]));

  assert.match(sql, /alter table public\.schema_migrations enable row level security/);
  assert.match(sql, /create policy schema_migrations_superadmin_read_v2 on public\.schema_migrations for select to authenticated using\s*\(\s*public\.is_superadmin\(\)\s*\)/);
  assert.match(sql, /create policy schema_migrations_service_v2 on public\.schema_migrations for all to service_role using\s*\(\s*true\s*\) with check\s*\(\s*true\s*\)/);
  assert.match(sql, /revoke all on public\.schema_migrations from public\s*,\s*anon\s*,\s*authenticated/);
  assert.match(sql, /grant select on public\.schema_migrations to authenticated/);
  assert.doesNotMatch(sql, /grant[^;]*\b(?:insert|update|delete)\b[^;]*public\.schema_migrations[^;]*to authenticated/);
});

test('002 protege el historial global de releases con rol de plataforma', () => {
  const sql = readMigration(migrationFiles[2]);
  const normalized = compact(sql);
  const table = compact(definition(sql, 'create table if not exists public.release_history'));

  assert.match(table, /status varchar\(50\) not null default 'healthy' check\s*\(\s*status in\s*\([^)]*'deploying'[^)]*'failed'[^)]*\)\s*\)/);
  assert.match(normalized, /alter table public\.release_history enable row level security/);
  assert.match(normalized, /create policy release_history_superadmin_read_v2 on public\.release_history for select to authenticated using\s*\(\s*public\.is_superadmin\(\)\s*\)/);
  assert.match(normalized, /create policy release_history_service_v2 on public\.release_history for all to service_role/);
  assert.match(normalized, /revoke all on public\.release_history from public\s*,\s*anon\s*,\s*authenticated/);
  assert.doesNotMatch(normalized, /grant[^;]*\b(?:insert|update|delete)\b[^;]*public\.release_history[^;]*to authenticated/);
});

test('003 tolera una base limpia sin tabla sales legacy', () => {
  const sql = compact(readMigration(migrationFiles[3]));

  assert.match(sql, /if to_regclass\(\s*'public\.sales'\s*\) is not null then alter table public\.sales add column if not exists build_version_snapshot/);
  assert.doesNotMatch(sql, /alter table public\.sales[^;]*drop\b/);
});
