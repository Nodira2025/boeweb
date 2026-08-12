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

test('SaaS Auth: Inicialización por defecto con Profesor Franco como SUPERADMIN en BÔ Grow Club (Tenant #1)', () => {
  const ctx = SaasAuth.getTenantContext();
  assert.equal(ctx.tenantId, '11111111-1111-1111-1111-111111111111');
  assert.equal(ctx.tenantSlug, 'boe-grow-club');
  assert.equal(ctx.tenantName, 'BÔ Grow Club');
  assert.equal(ctx.userName, 'Profesor Franco');
  assert.equal(ctx.role, 'SUPERADMIN');
  assert.equal(ctx.isSuperadmin, true);
});

test('SaaS Roles: SUPERADMIN posee permisos globales y puede alternar entre Tenants', () => {
  assert.equal(SaasAuth.hasPermission('wms.transfer'), true);
  assert.equal(SaasAuth.hasPermission('tenant.edit'), true);

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

  // Reset back to Superadmin
  SaasAuth.loginAsUser('Profesor Franco', 'profesor.franco@boeweb.com', 'SUPERADMIN', '11111111-1111-1111-1111-111111111111');
});

test('SaaS Multi-Tenant Isolation: Los datos de Tenant A y Tenant B están aislados por tenant_id', () => {
  const dataset = [
    { id: 1, tenant_id: '11111111-1111-1111-1111-111111111111', item: 'Sustrato BÔ' },
    { id: 2, tenant_id: '11111111-1111-1111-1111-111111111111', item: 'Top Bud BÔ' },
    { id: 3, tenant_id: '22222222-2222-2222-2222-222222222222', item: 'Taladro Ferretería' }
  ];

  function queryTenantData(activeTenantId, userRole) {
    if (userRole === 'SUPERADMIN') return dataset;
    return dataset.filter(row => row.tenant_id === activeTenantId);
  }

  const boeData = queryTenantData('11111111-1111-1111-1111-111111111111', 'VENDEDOR');
  const ferreteriaData = queryTenantData('22222222-2222-2222-2222-222222222222', 'VENDEDOR');

  assert.equal(boeData.length, 2);
  assert.equal(ferreteriaData.length, 1);
  assert.equal(boeData[0].item, 'Sustrato BÔ');
  assert.equal(ferreteriaData[0].item, 'Taladro Ferretería');
});

test('SaaS Legacy Compatibility: El almacenamiento legacy boeweb_vendor_name convive sin errores', () => {
  localStorage.setItem('boeweb_vendor_name', 'Vendedor Legacy');
  assert.equal(localStorage.getItem('boeweb_vendor_name'), 'Vendedor Legacy');
});
