import test from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage and DOM for Node test runner
class StorageMock {
  constructor() { this.store = {}; }
  getItem(key) { return this.store[key] || null; }
  setItem(key, value) { this.store[key] = String(value); }
  removeItem(key) { delete this.store[key]; }
  clear() { this.store = {}; }
}
global.localStorage = new StorageMock();
global.sessionStorage = new StorageMock();

import { BusinessVerticals, BUSINESS_VERTICALS_CACHE } from '../business-verticals.js';
import { TenantTheme, TENANT_PROFILES_CACHE } from '../tenant-theme.js';

test('Business Verticals: Carga correcta del esquema attribute_schema JSONB para 4 rubros comerciales', () => {
  const growshop = BusinessVerticals.getVertical('growshop');
  const ferreteria = BusinessVerticals.getVertical('ferreteria');
  const repuestos = BusinessVerticals.getVertical('repuestos');
  const indumentaria = BusinessVerticals.getVertical('indumentaria');

  assert.equal(growshop.code, 'growshop');
  assert.equal(ferreteria.code, 'ferreteria');
  assert.equal(repuestos.code, 'repuestos');
  assert.equal(indumentaria.code, 'indumentaria');

  // Ferretería prioriza potencia (W), voltaje y modelo
  const ferreteriaKeys = ferreteria.attribute_schema.map(a => a.key);
  assert.ok(ferreteriaKeys.includes('power_watts'));
  assert.ok(ferreteriaKeys.includes('voltage'));
  assert.ok(ferreteriaKeys.includes('model'));

  // Repuestos prioriza OEM, marca auto y modelos compatibles
  const repuestosKeys = repuestos.attribute_schema.map(a => a.key);
  assert.ok(repuestosKeys.includes('oem_code'));
  assert.ok(repuestosKeys.includes('vehicle_make'));
});

test('Business Verticals: Generación de HTML para formulario dinámico basado en JSONB', () => {
  const formHtml = BusinessVerticals.renderDynamicFormFields('ferreteria');
  assert.ok(formHtml.includes('Voltaje Alimentación'));
  assert.ok(formHtml.includes('220V'));
  assert.ok(formHtml.includes('Potencia Motor'));
});

test('Business Verticals: Enriquecimiento de código de barras según heurística del rubro', () => {
  const rawBarcode = { brand: 'Bosch', model: 'GSB 13 RE', power_watts: 750, voltage: '220V' };
  const enriched = BusinessVerticals.enrichBarcodeProductData(rawBarcode, 'ferreteria');

  assert.equal(enriched.verticalCode, 'ferreteria');
  assert.equal(enriched.dynamicAttributes.brand, 'Bosch');
  assert.equal(enriched.dynamicAttributes.voltage, '220V');
});

test('Tenant Theme & White-Label: Ciclo Borrador -> Live Preview -> Publicar', () => {
  const tenantId = '22222222-2222-2222-2222-222222222222';
  const profile = TenantTheme.getProfile(tenantId);

  // 1. Estado Inicial Publicado
  assert.equal(profile.brand_name, 'Empresa B Demo (Ferretería Norte)');
  assert.equal(profile.primary_color, '#0052CC');

  // 2. Guardar Borrador
  TenantTheme.saveDraft(tenantId, { brand_name: 'Ferretería El Martillo SA', primary_color: '#d32f2f' });
  const draftProfile = TenantTheme.getProfile(tenantId);
  assert.equal(draftProfile.draft_branding.brand_name, 'Ferretería El Martillo SA');
  // La marca publicada no ha mutado aún
  assert.equal(draftProfile.brand_name, 'Empresa B Demo (Ferretería Norte)');

  // 3. Publicar Cambios
  const publishedProfile = TenantTheme.publishBranding(tenantId);
  assert.equal(publishedProfile.brand_name, 'Ferretería El Martillo SA');
  assert.equal(publishedProfile.primary_color, '#d32f2f');
});
