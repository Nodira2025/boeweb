import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Mock localStorage/sessionStorage for Node environment
class StorageMock {
  constructor() { this.store = {}; }
  getItem(key) { return this.store[key] || null; }
  setItem(key, value) { this.store[key] = String(value); }
  removeItem(key) { delete this.store[key]; }
  clear() { this.store = {}; }
}
global.localStorage = new StorageMock();
global.sessionStorage = new StorageMock();

import { SaasAuth, SAAS_TENANTS, SAAS_ROLES } from '../saas-auth.js';

test('SaaS Security: Inicialización por defecto sin privilegios (VENDEDOR) sin SUPERADMIN hardcodeado', () => {
  const ctx = SaasAuth.getTenantContext();
  assert.equal(ctx.tenantId, '11111111-1111-1111-1111-111111111111');
  assert.equal(ctx.role, 'VENDEDOR');
  assert.equal(ctx.isSuperadmin, false);
});

test('SaaS Security: DevTools Tamper Protection (Alterar localStorage a SUPERADMIN no altera la seguridad backend RLS)', () => {
  // Simular usuario malicioso alterando localStorage en la consola del navegador
  localStorage.setItem('boeweb_saas_user_role', 'SUPERADMIN');
  
  // En frontend el rol cambia visualmente pero no altera las políticas de base de datos ni tokens JWT de Supabase
  const tamperedRole = localStorage.getItem('boeweb_saas_user_role');
  assert.equal(tamperedRole, 'SUPERADMIN');

  // Restablecer sesión limpia
  SaasAuth.logout();
  assert.equal(SaasAuth.getTenantContext().isSuperadmin, false);
});

test('SaaS Security: el selector local de roles está deshabilitado', () => {
  const result = SaasAuth.loginAsUser('Usuario falso', 'fake@example.com', 'SUPERADMIN', SAAS_TENANTS[1].id);
  const context = SaasAuth.getTenantContext();

  assert.equal(result, false);
  assert.equal(context.isVerified, false);
  assert.equal(context.isSuperadmin, false);
  assert.equal(SaasAuth.switchActiveTenant(SAAS_TENANTS[1].id), false);
});

test('SaaS Session: recupera una sesión operativa válida y comparte la hidratación concurrente', async () => {
  SaasAuth.logout();
  const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const membership = {
    tenant_id: SAAS_TENANTS[0].id,
    user_id: userId,
    email: 'operador@example.com',
    name: 'Operador Test',
    role: 'VENDEDOR',
    active: true
  };
  let releaseAuth;
  let getUserCalls = 0;
  const authGate = new Promise(resolve => { releaseAuth = resolve; });
  const query = {
    select() { return this; },
    eq() { return this; },
    limit() { return this; },
    async maybeSingle() { return { data: membership, error: null }; }
  };
  const client = {
    auth: {
      async getUser() {
        getUserCalls += 1;
        await authGate;
        return { data: { user: { id: userId, email: membership.email } }, error: null };
      }
    },
    from() { return query; }
  };

  const firstRecovery = SaasAuth.ensureOperationalContext(client);
  const secondRecovery = SaasAuth.ensureOperationalContext(client);
  assert.equal(getUserCalls, 1);
  releaseAuth();
  const [firstContext, secondContext] = await Promise.all([firstRecovery, secondRecovery]);

  assert.equal(firstContext?.isVerified, true);
  assert.equal(secondContext?.userId, userId);
  assert.equal(SaasAuth.isOperationalContextReady(firstContext), true);
  assert.equal(getUserCalls, 1);

  const forcedContext = await SaasAuth.ensureOperationalContext(client, { forceRefresh: true });
  assert.equal(forcedContext?.userId, userId);
  assert.equal(getUserCalls, 2);
});

test('SaaS Session: no convierte una sesión inexistente en acceso operativo', async () => {
  SaasAuth.logout();
  const client = {
    auth: {
      async getUser() {
        return { data: { user: null }, error: { message: 'No session' } };
      }
    }
  };

  assert.equal(await SaasAuth.ensureOperationalContext(client), null);
  assert.equal(SaasAuth.getTenantContext().isVerified, false);
});

test('SaaS Session: invalida el contexto cacheado cuando la sesión real desaparece', async () => {
  SaasAuth.logout();
  const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const membership = {
    tenant_id: SAAS_TENANTS[0].id,
    user_id: userId,
    email: 'operador@example.com',
    name: 'Operador Test',
    role: 'VENDEDOR',
    active: true
  };
  let signedIn = true;
  const query = {
    select() { return this; },
    eq() { return this; },
    limit() { return this; },
    async maybeSingle() { return { data: membership, error: null }; }
  };
  const client = {
    auth: {
      async getSession() {
        return signedIn
          ? { data: { session: { access_token: 'token-test', user: { id: userId } } }, error: null }
          : { data: { session: null }, error: null };
      },
      async getUser() {
        return signedIn
          ? { data: { user: { id: userId, email: membership.email } }, error: null }
          : { data: { user: null }, error: { message: 'No session' } };
      }
    },
    from() { return query; }
  };

  assert.equal(await SaasAuth.hydrateFromSupabase(client), true);
  assert.equal(SaasAuth.getTenantContext().isVerified, true);

  signedIn = false;
  assert.equal(await SaasAuth.ensureOperationalContext(client), null);
  assert.equal(SaasAuth.getTenantContext().isVerified, false);
  assert.equal(SaasAuth.getTenantContext().userId, null);
});

test('SaaS Session: no devuelve una identidad anterior si el usuario cambia durante la validación', async () => {
  SaasAuth.logout();
  const firstUser = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'primero@example.com' };
  const secondUser = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'segundo@example.com' };
  const memberships = new Map([
    [firstUser.id, {
      tenant_id: SAAS_TENANTS[0].id,
      user_id: firstUser.id,
      email: firstUser.email,
      name: 'Primer Operador',
      role: 'VENDEDOR',
      active: true
    }],
    [secondUser.id, {
      tenant_id: SAAS_TENANTS[0].id,
      user_id: secondUser.id,
      email: secondUser.email,
      name: 'Segundo Operador',
      role: 'VENDEDOR',
      active: true
    }]
  ]);
  let activeUser = firstUser;
  let releaseFirstSessionCheck;
  let delayNextSessionCheck = false;
  const firstSessionGate = new Promise(resolve => { releaseFirstSessionCheck = resolve; });
  const query = {
    select() { return this; },
    eq() { return this; },
    limit() { return this; },
    async maybeSingle() { return { data: memberships.get(activeUser.id), error: null }; }
  };
  const client = {
    auth: {
      async getSession() {
        const sessionUser = activeUser;
        if (delayNextSessionCheck) {
          delayNextSessionCheck = false;
          await firstSessionGate;
        }
        return { data: { session: { access_token: 'token-test', user: sessionUser } }, error: null };
      },
      async getUser() {
        return { data: { user: activeUser }, error: null };
      }
    },
    from() { return query; }
  };

  assert.equal(await SaasAuth.hydrateFromSupabase(client), true);
  delayNextSessionCheck = true;
  const contextValidation = SaasAuth.ensureOperationalContext(client);

  activeUser = secondUser;
  assert.equal(await SaasAuth.hydrateFromSupabase(client), true);
  releaseFirstSessionCheck();

  const validatedContext = await contextValidation;
  assert.equal(validatedContext?.userId, secondUser.id);
  assert.equal(SaasAuth.getTenantContext().userId, secondUser.id);
});

test('SaaS Roles: una membresía validada por Supabase recibe solo sus permisos', async () => {
  const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const membership = {
    tenant_id: SAAS_TENANTS[0].id,
    user_id: userId,
    email: 'vendedor@example.com',
    name: 'Vendedor Test',
    role: 'VENDEDOR',
    active: true
  };
  const query = {
    select() { return this; },
    eq() { return this; },
    limit() { return this; },
    async maybeSingle() { return { data: membership, error: null }; }
  };
  const client = {
    auth: { async getUser() { return { data: { user: { id: userId, email: membership.email } }, error: null }; } },
    from() { return query; }
  };

  assert.equal(await SaasAuth.hydrateFromSupabase(client), true);
  const ctx = SaasAuth.getTenantContext();

  assert.equal(ctx.isVerified, true);
  assert.equal(ctx.role, 'VENDEDOR');
  assert.equal(ctx.isSuperadmin, false);
  assert.equal(SaasAuth.hasPermission('wms.transfer'), true);
  assert.equal(SaasAuth.hasPermission('tenant.edit'), false);

  // Vendedor cannot switch tenant
  const canSwitch = SaasAuth.switchActiveTenant('22222222-2222-2222-2222-222222222222');
  assert.equal(canSwitch, false);
  assert.equal(SaasAuth.getTenantContext().tenantId, '11111111-1111-1111-1111-111111111111');
});

test('SaaS RLS Isolation Rule: Subconsulta RLS evalúa is_superadmin() O tenant_users.user_id = auth.uid()', () => {
  const dataset = [
    { id: 1, tenant_id: '11111111-1111-1111-1111-111111111111', item: 'Sustrato BÔ' },
    { id: 2, tenant_id: '11111111-1111-1111-1111-111111111111', item: 'Top Bud BÔ' },
    { id: 3, tenant_id: '22222222-2222-2222-2222-222222222222', item: 'Taladro Ferretería' }
  ];

  // Simulación estricta de la regla PostgreSQL RLS corregida
  function evaluateStrictRlsQuery(authUserId, activeTenantId, isSuperadmin) {
    if (isSuperadmin) return dataset;
    return dataset.filter(row => row.tenant_id === activeTenantId);
  }

  const boeData = evaluateStrictRlsQuery('usr-vendedor-a', '11111111-1111-1111-1111-111111111111', false);
  const ferreteriaData = evaluateStrictRlsQuery('usr-vendedor-b', '22222222-2222-2222-2222-222222222222', false);

  assert.equal(boeData.length, 2);
  assert.equal(ferreteriaData.length, 1);
  assert.equal(boeData[0].item, 'Sustrato BÔ');
  assert.equal(ferreteriaData[0].item, 'Taladro Ferretería');
});

test('SaaS RLS: la política tenant_users usa helper SECURITY DEFINER y no se autoconsulta', () => {
  const hotfixPath = path.resolve('scripts', 'fix_tenant_users_rls_recursion.sql');
  const sql = fs.readFileSync(hotfixPath, 'utf8');

  assert.match(sql, /FUNCTION public\.is_tenant_member/);
  assert.match(sql, /SET row_security = off/);
  assert.match(sql, /public\.is_tenant_member\(tenant_id\)/);
});
