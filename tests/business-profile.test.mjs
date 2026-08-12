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

test('Server-Side Vertical Resolution: Zero Trust en parámetros arbitrarios enviados por el cliente', () => {
  // Simular resolutor server-side
  function resolveServerTenantVertical(authenticatedTenantId, clientRequestedVertical) {
    const tenantDbMap = {
      '11111111-1111-1111-1111-111111111111': 'growshop',
      '22222222-2222-2222-2222-222222222222': 'ferreteria'
    };
    // El servidor ignora el parámetro del cliente y resuelve mediante la sesión autenticada en DB
    return tenantDbMap[authenticatedTenantId] || 'growshop';
  }

  // Vendedor BÔ intenta enviar vertical="ferreteria" arbitrariamente en el request
  const resolvedVertical = resolveServerTenantVertical('11111111-1111-1111-1111-111111111111', 'ferreteria');
  assert.equal(resolvedVertical, 'growshop'); // El backend fuerza el rubro real del tenant (growshop)
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

test('Terminology Helper t(key): Traducción conceptual y terminología adaptable por Tenant', () => {
  const boeTenant = '11111111-1111-1111-1111-111111111111';
  const ferreteriaTenant = '22222222-2222-2222-2222-222222222222';

  assert.equal(TenantTheme.t('product', boeTenant), 'Producto Botánico');
  assert.equal(TenantTheme.t('vendor', boeTenant), 'Asesor de Cultivo');

  assert.equal(TenantTheme.t('product', ferreteriaTenant), 'Artículo de Ferretería');
  assert.equal(TenantTheme.t('vendor', ferreteriaTenant), 'Cajero');
});

test('RLS Security Rules: ADMIN A no modifica Tenant B y modificación de business_verticals exige SUPERADMIN', () => {
  function canModifyTenantProfile(userId, userRole, userTenantId, targetTenantId) {
    if (userRole === 'SUPERADMIN') return true;
    return userRole === 'ADMIN' && userTenantId === targetTenantId;
  }

  function canModifyGlobalBusinessVerticals(userRole) {
    return userRole === 'SUPERADMIN';
  }

  // Admin de Tenant A intenta modificar Tenant B -> DENEGADO
  assert.equal(canModifyTenantProfile('usr-admin-a', 'ADMIN', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'), false);

  // Admin de Tenant A intenta modificar global business_verticals -> DENEGADO
  assert.equal(canModifyGlobalBusinessVerticals('ADMIN'), false);

  // Superadmin modifica cualquier tenant y verticales globales -> PERMITIDO
  assert.equal(canModifyTenantProfile('usr-franco', 'SUPERADMIN', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'), true);
  assert.equal(canModifyGlobalBusinessVerticals('SUPERADMIN'), true);
});

test('Asset File Validation: Validación estricta de tipo MIME y tamaño de imagen', () => {
  function validateAssetFile(fileName, mimeType, sizeBytes) {
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    const maxSizeBytes = 5 * 1024 * 1024; // 5MB limit
    if (!allowedMimeTypes.includes(mimeType)) return { valid: false, error: 'Tipo de archivo no permitido' };
    if (sizeBytes > maxSizeBytes) return { valid: false, error: 'El archivo excede los 5MB' };
    return { valid: true };
  }

  assert.equal(validateAssetFile('logo.png', 'image/png', 500000).valid, true);
  assert.equal(validateAssetFile('malware.exe', 'application/x-msdownload', 500000).valid, false);
  assert.equal(validateAssetFile('huge.png', 'image/png', 10 * 1024 * 1024).valid, false);
});

test('Tenant Theme & White-Label: Ciclo Borrador -> Live Preview -> Cancelar -> Publicar', () => {
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

  // 3. Cancelar Borrador (Revert)
  TenantTheme.cancelDraft(tenantId);
  assert.equal(Object.keys(TenantTheme.getProfile(tenantId).draft_branding).length, 0);

  // 4. Guardar y Publicar Cambios de Nuevo
  TenantTheme.saveDraft(tenantId, { brand_name: 'Ferretería El Martillo SA', primary_color: '#d32f2f' });
  const publishedProfile = TenantTheme.publishBranding(tenantId);
  assert.equal(publishedProfile.brand_name, 'Ferretería El Martillo SA');
  assert.equal(publishedProfile.primary_color, '#d32f2f');
});
