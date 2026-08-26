const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

const rootDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(rootDir, '.env'), quiet: true });

const TENANT_ID = process.env.PUBLIC_TENANT_ID
  || process.env.DEFAULT_TENANT_ID
  || '11111111-1111-1111-1111-111111111111';
const EXPECTED_MIGRATIONS = Array.from({ length: 18 }, (_, index) => String(index).padStart(3, '0'));
const FLEXIBLE_POS_TABLES = [
  'sale_fulfillments_v2',
  'external_catalog_sources_v2',
  'external_catalog_offers_v2',
  'parked_pos_tickets_v2'
];

function requireEnvironment(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Falta la variable ${name}.`);
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function selectOrThrow(query, label) {
  const { data, error, count } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return { data: data || [], count };
}

async function verifyDeployment() {
  const supabaseUrl = requireEnvironment('SUPABASE_URL');
  const anonKey = requireEnvironment('SUPABASE_ANON_KEY');
  const serviceRoleKey = requireEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const anonymous = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const migrations = await selectOrThrow(
    service.from('schema_migrations').select('version,name').order('version'),
    'No se pudo leer schema_migrations'
  );
  const appliedVersions = new Set(migrations.data.map(row => row.version));
  const missingVersions = EXPECTED_MIGRATIONS.filter(version => !appliedVersions.has(version));
  assert(missingVersions.length === 0, `Faltan migraciones: ${missingVersions.join(', ')}`);

  for (const tableName of FLEXIBLE_POS_TABLES) {
    await selectOrThrow(
      service.from(tableName).select('id').limit(1),
      `No se pudo verificar ${tableName}`
    );
  }

  const tenant = await selectOrThrow(
    service.from('tenants').select('id,status').eq('id', TENANT_ID).eq('status', 'ACTIVE'),
    'No se pudo verificar el tenant'
  );
  assert(tenant.data.length === 1, 'El tenant público no existe o no está activo.');

  const memberships = await selectOrThrow(
    service.from('tenant_users').select('user_id,role').eq('tenant_id', TENANT_ID).eq('active', true),
    'No se pudieron verificar las membresías'
  );
  assert(memberships.data.length >= 1, 'El tenant no tiene usuarios activos.');

  const publishedConfig = await selectOrThrow(
    service.from('tenant_app_config').select('schema_version,revision,config_json').eq('tenant_id', TENANT_ID).eq('stage', 'published'),
    'No se pudo verificar la configuración publicada'
  );
  assert(publishedConfig.data.length === 1, 'Debe existir exactamente una configuración publicada.');
  assert(Number(publishedConfig.data[0].schema_version) === 2, 'La configuración publicada no usa schema v2.');
  assert(
    publishedConfig.data[0].config_json?.catalog?.allowBackorders === true,
    'La configuración publicada debe permitir ventas sin stock.'
  );

  const locations = await selectOrThrow(
    service.from('inventory_locations_v2').select('id').eq('tenant_id', TENANT_ID).eq('active', true).eq('is_default', true).eq('is_sellable', true),
    'No se pudo verificar la ubicación default'
  );
  assert(locations.data.length === 1, 'Debe existir exactamente una ubicación default activa y vendible.');

  const canonicalCatalog = await selectOrThrow(
    service.from('catalog_products').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID),
    'No se pudo contar el catálogo físico recuperado'
  );
  assert(Number(canonicalCatalog.count) > 0, 'El catálogo físico canónico sigue vacío; falta ejecutar la migración 015.');

  const externalSources = await selectOrThrow(
    service.from('external_catalog_sources_v2').select('id', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID).eq('active', true),
    'No se pudieron contar los proveedores externos recuperados'
  );
  assert(Number(externalSources.count) > 0, 'No hay proveedores externos activos; falta recuperar el catálogo B2B.');

  const externalOffers = await selectOrThrow(
    service.from('external_catalog_offers_v2').select('id', { count: 'exact', head: true })
      .eq('tenant_id', TENANT_ID).eq('active', true),
    'No se pudieron contar las ofertas B2B recuperadas'
  );
  assert(Number(externalOffers.count) > 0, 'El catálogo B2B central sigue vacío; falta ejecutar la migración 015.');

  const registers = await selectOrThrow(
    service.from('cash_registers').select('id,location_id,currency').eq('tenant_id', TENANT_ID).eq('active', true),
    'No se pudieron verificar las cajas'
  );
  assert(registers.data.length >= 1, 'Debe existir al menos una caja activa.');
  assert(registers.data.every(row => row.location_id), 'Toda caja activa debe estar vinculada a una ubicación.');

  const publicConfig = await selectOrThrow(
    anonymous.from('tenant_app_config').select('tenant_id,schema_version').eq('tenant_id', TENANT_ID).eq('stage', 'published'),
    'La configuración publicada no es legible por el storefront'
  );
  assert(publicConfig.data.length === 1, 'El storefront no puede leer la configuración publicada.');

  const publicCatalog = await selectOrThrow(
    anonymous.from('public_catalog_products_v2').select('tenant_id,id', { count: 'exact' }).eq('tenant_id', TENANT_ID).limit(1),
    'El catálogo público canónico no es consultable'
  );
  assert(Number(publicCatalog.count) > 0, 'El catálogo público es consultable pero no contiene productos.');

  const summary = {
    tenantId: TENANT_ID,
    migrations: EXPECTED_MIGRATIONS.length,
    flexiblePosTables: FLEXIBLE_POS_TABLES.length,
    activeUsers: memberships.data.length,
    publishedConfigRevision: publishedConfig.data[0].revision,
    backorders: 'ENABLED',
    canonicalProducts: canonicalCatalog.count,
    externalSources: externalSources.count,
    activeExternalOffers: externalOffers.count,
    defaultLocations: locations.data.length,
    activeRegisters: registers.data.length,
    publicCatalogProducts: publicCatalog.count,
    publicAccess: 'OK_NON_EMPTY'
  };
  console.log(JSON.stringify(summary, null, 2));
}

verifyDeployment().catch(error => {
  console.error(`VERIFICACION_V2_FALLIDA: ${error.message}`);
  process.exitCode = 1;
});
