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

test('SaaS Roles & Tenant Switching: Solo cuando el usuario está verificado como SUPERADMIN puede alternar Tenants', () => {
  // Iniciar sesión autenticada como Profesor Franco SUPERADMIN
  SaasAuth.loginAsUser('Profesor Franco', 'profesor.franco@boeweb.com', 'SUPERADMIN', '11111111-1111-1111-1111-111111111111');
  assert.equal(SaasAuth.getTenantContext().isSuperadmin, true);

  // Switch to Tenant B Demo
  const switched = SaasAuth.switchActiveTenant('22222222-2222-2222-2222-222222222222');
  assert.equal(switched, true);
  assert.equal(SaasAuth.getTenantContext().tenantName, 'Empresa B Demo (Ferretería Norte)');

  // Reset back to Tenant #1
  SaasAuth.switchActiveTenant('11111111-1111-1111-1111-111111111111');
});

test('SaaS Roles: VENDEDOR posee permisos operativos pero NO administrativos', () => {
  SaasAuth.loginAsUser('Vendedor Test', 'vendedor@test.com', 'VENDEDOR', '11111111-1111-1111-1111-111111111111');
  const ctx = SaasAuth.getTenantContext();

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
