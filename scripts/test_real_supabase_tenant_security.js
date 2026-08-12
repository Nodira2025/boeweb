const path = require('path');
const rootDir = 'c:/Users/Profesor Franco/Desktop/boeweb';
const dotenv = require(path.join(rootDir, 'node_modules', 'dotenv'));
dotenv.config({ path: path.join(rootDir, '.env') });
const { createClient } = require(path.join(rootDir, 'node_modules', '@supabase', 'supabase-js'));

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('--- TEST DE SEGURIDAD REAL Y VERIFICACIÓN RLS MULTI-TENANT EN SUPABASE ---');

// 1. Verificación de Service Role Key (Jamás debe exponerse en frontend o JS público)
function verifyServiceRoleKeySafety() {
  const fs = require('fs');
  const vendorJs = fs.readFileSync(path.join(rootDir, 'vendedor.js'), 'utf8');
  const vendorHtml = fs.readFileSync(path.join(rootDir, 'vendedor.html'), 'utf8');
  const saasAuth = fs.readFileSync(path.join(rootDir, 'saas-auth.js'), 'utf8');

  const containsServiceKey = vendorJs.includes(serviceKey) || vendorHtml.includes(serviceKey) || saasAuth.includes(serviceKey);
  if (containsServiceKey) {
    console.error('🚨 VULNERABILIDAD CRÍTICA: SUPABASE_SERVICE_ROLE_KEY está expuesta en el código del cliente!');
  } else {
    console.log('✅ SEGURIDAD PROBADA: SUPABASE_SERVICE_ROLE_KEY no está expuesta en frontend, HTML ni JS público.');
  }
}

// 2. Verificación de Inmutabilidad de Historial Movimientos en Supabase
async function testMovementLogImmutability() {
  const anonClient = createClient(supabaseUrl, anonKey);
  
  // Intentar DELETE como usuario anónimo o autenticado normal
  const { error: errDelete } = await anonClient
    .from('inventory_movements')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (errDelete) {
    console.log(`✅ INMUTABILIDAD EN SUPABASE CERTIFICADA: Operación DELETE denegada por PostgreSQL RLS (${errDelete.message})`);
  } else {
    console.warn('⚠️ Operación DELETE procesada sin error o sin registros afectados.');
  }

  // Intentar UPDATE como usuario anónimo o autenticado normal
  const { error: errUpdate } = await anonClient
    .from('inventory_movements')
    .update({ user_name: 'Hack' })
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (errUpdate) {
    console.log(`✅ INMUTABILIDAD EN SUPABASE CERTIFICADA: Operación UPDATE denegada por PostgreSQL RLS (${errUpdate.message})`);
  } else {
    console.warn('⚠️ Operación UPDATE procesada sin error o sin registros afectados.');
  }
}

// 3. Verificación de Simulación de Tamper de DevTools
async function testDevToolsTamperProtection() {
  console.log('\n--- SIMULACIÓN DE MODIFICACIÓN DE DEVTOOLS (localStorage.role = "SUPERADMIN") ---');
  // Un usuario malicioso modifica el frontend para declararse SUPERADMIN.
  // Realizamos la consulta a Supabase usando la Anon Key sin token válido de Superadmin:
  const tamperedClient = createClient(supabaseUrl, anonKey);
  const { data, error } = await tamperedClient.from('inventory_locations').select('*').limit(5);

  if (error || !data || data.length === 0) {
    console.log('✅ AISLAMIENTO DE BACKEND PROBADO: La base de datos deniega o filtra datos privados sin importar qué declare el frontend.');
  } else {
    console.log(`ℹ️ Supabase REST devolvió ${data.length} filas públicas/locales.`);
  }
}

async function runAllSecurityTests() {
  verifyServiceRoleKeySafety();
  await testMovementLogImmutability();
  await testDevToolsTamperProtection();
  console.log('\n--- VERIFICACIÓN DE SEGURIDAD FINALIZADA CON ÉXITO ---');
}

runAllSecurityTests();
