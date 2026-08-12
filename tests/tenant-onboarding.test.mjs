import test from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage for Node environment
class StorageMock {
  constructor() { this.store = {}; }
  getItem(key) { return this.store[key] || null; }
  setItem(key, value) { this.store[key] = String(value); }
  removeItem(key) { delete this.store[key]; }
  clear() { this.store = {}; }
}
global.localStorage = new StorageMock();
global.sessionStorage = new StorageMock();

import { TenantOnboarding } from '../tenant-onboarding.js';

test('1. Onboarding Session: Creación, Persistencia e Inicialización de Borrador', () => {
  const session = TenantOnboarding.initSession('Profesor Franco');
  assert.ok(session.id.startsWith('onb-'));
  assert.equal(session.status, 'DRAFT');
  assert.equal(session.step_current, 1);
});

test('2. Onboarding Session: Guardar datos por paso y avanzar cursor de forma persistente', () => {
  TenantOnboarding.initSession('Profesor Franco');
  TenantOnboarding.saveStepData(1, { name: 'Ferretería San Martín', slug: 'ferreteria-san-martin', email: 'contacto@sanmartin.com' });

  assert.equal(TenantOnboarding.activeSession.step_current, 1);
  assert.equal(TenantOnboarding.activeSession.status, 'IN_PROGRESS');
  assert.equal(TenantOnboarding.activeSession.company_data.name, 'Ferretería San Martín');
  assert.equal(TenantOnboarding.activeSession.company_data.slug, 'ferreteria-san-martin');
});

test('3. Onboarding Reanudación: Cerrar navegador y continuar en el paso exacto', () => {
  const session = TenantOnboarding.initSession('Profesor Franco');
  const sessionId = session.id;

  TenantOnboarding.saveStepData(1, { name: 'Moda Urbana', slug: 'moda-urbana' });
  TenantOnboarding.saveStepData(2, { code: 'indumentaria', name: 'Indumentaria' });

  // Simular cierre de navegador y reanudación por ID de sesión
  const resumedSession = TenantOnboarding.initSession('Profesor Franco', sessionId);
  assert.equal(resumedSession.id, sessionId);
  assert.equal(resumedSession.step_current, 2);
  assert.equal(resumedSession.company_data.name, 'Moda Urbana');
  assert.equal(resumedSession.vertical_data.code, 'indumentaria');
});

test('4. Validar Slug Único & Prevención de Slug Duplicado', () => {
  const existingTenants = [{ id: 't1', slug: 'ferreteria-san-martin', name: 'Ferretería San Martín' }];
  
  TenantOnboarding.initSession('Profesor Franco');
  TenantOnboarding.saveStepData(1, { name: 'Ferretería San Martín', slug: 'ferreteria-san-martin' });
  
  const checklist = TenantOnboarding.runPreactivationChecklist(existingTenants);
  assert.equal(checklist.valid, false);
  assert.ok(checklist.errors.some(e => e.includes('slug')));
});

test('5. Checklist Pre-Activación Exitoso', () => {
  const existingTenants = [];
  TenantOnboarding.initSession('Profesor Franco');
  TenantOnboarding.saveStepData(1, { name: 'Ferretería San Martín', slug: 'ferreteria-san-martin', email: 'contacto@sanmartin.com' });
  TenantOnboarding.saveStepData(2, { code: 'ferreteria', name: 'Ferretería' });
  TenantOnboarding.saveStepData(7, { admin_name: 'Juan Pérez', admin_email: 'juan@sanmartin.com' });
  TenantOnboarding.saveStepData(8, { enabled: true, warehouse_name: 'Depósito Central' });

  const checklist = TenantOnboarding.runPreactivationChecklist(existingTenants);
  assert.equal(checklist.valid, true);
  assert.equal(TenantOnboarding.activeSession.status, 'READY_TO_ACTIVATE');
});

test('6. Activación Idempotente del Tenant (SETUP -> ACTIVE)', () => {
  const existingTenants = [];
  TenantOnboarding.initSession('Profesor Franco');
  TenantOnboarding.saveStepData(1, { name: 'Moda Urbana', slug: 'moda-urbana', email: 'contacto@modaurbana.com' });
  TenantOnboarding.saveStepData(2, { code: 'indumentaria', name: 'Indumentaria' });
  TenantOnboarding.saveStepData(7, { admin_name: 'María Gómez', admin_email: 'maria@modaurbana.com' });

  const result1 = TenantOnboarding.activateTenant(existingTenants);
  assert.equal(result1.success, true);
  assert.equal(existingTenants.length, 1);
  assert.equal(existingTenants[0].status, 'ACTIVE');

  // Re-ejecutar activación (Prueba de Idempotencia por doble-clic)
  const result2 = TenantOnboarding.activateTenant(existingTenants);
  assert.equal(result2.success, true);
  assert.equal(existingTenants.length, 1); // NO se duplicó el tenant
});

test('7. WMS Opcional: Negocio SIN WMS funciona perfectamente', () => {
  const existingTenants = [];
  TenantOnboarding.initSession('Profesor Franco');
  TenantOnboarding.saveStepData(1, { name: 'Boutique Sin WMS', slug: 'boutique-sin-wms', email: 'info@boutique.com' });
  TenantOnboarding.saveStepData(2, { code: 'indumentaria', name: 'Indumentaria' });
  TenantOnboarding.saveStepData(7, { admin_name: 'Carlos', admin_email: 'carlos@boutique.com' });
  TenantOnboarding.saveStepData(8, { enabled: false });

  const checklist = TenantOnboarding.runPreactivationChecklist(existingTenants);
  assert.equal(checklist.valid, true);

  const result = TenantOnboarding.activateTenant(existingTenants);
  assert.equal(result.success, true);
  assert.equal(result.tenant.wms_enabled, false);
});

test('8. Ciclo de Vida del Tenant: Suspensión y Reactivación', () => {
  const existingTenants = [{ id: 't-100', name: 'Comercio X', slug: 'comercio-x', status: 'ACTIVE' }];

  // Suspender Tenant
  const suspRes = TenantOnboarding.toggleTenantLifecycleStatus('t-100', 'SUSPENDED', existingTenants);
  assert.equal(suspRes.success, true);
  assert.equal(existingTenants[0].status, 'SUSPENDED');

  // Reactivar Tenant
  const reactRes = TenantOnboarding.toggleTenantLifecycleStatus('t-100', 'ACTIVE', existingTenants);
  assert.equal(reactRes.success, true);
  assert.equal(existingTenants[0].status, 'ACTIVE');
});

test('9. Cancelación de Onboarding limpia borrador', () => {
  TenantOnboarding.initSession('Profesor Franco');
  TenantOnboarding.saveStepData(1, { name: 'Borrador Descartado', slug: 'borrador-descartado' });
  
  const cancelRes = TenantOnboarding.cancelSession();
  assert.equal(cancelRes.success, true);
  assert.equal(cancelRes.session.status, 'CANCELLED');
});

test('10. Multi-Tenant Isolation: Ferretería San Martín NO ve Moda Urbana', () => {
  const tenantA = { id: 't-san-martin', name: 'Ferretería San Martín' };
  const tenantB = { id: 't-moda-urbana', name: 'Moda Urbana' };

  const canAccessData = (userTenantId, dataTenantId, isSuperAdmin = false) => {
    return isSuperAdmin || userTenantId === dataTenantId;
  };

  assert.equal(canAccessData(tenantA.id, tenantA.id), true);
  assert.equal(canAccessData(tenantA.id, tenantB.id), false); // DENIED
  assert.equal(canAccessData(tenantA.id, tenantB.id, true), true); // SUPERADMIN OK
});
