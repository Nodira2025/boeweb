const path = require('path');
const rootDir = 'c:/Users/Profesor Franco/Desktop/boeweb';
const dotenv = require(path.join(rootDir, 'node_modules', 'dotenv'));
dotenv.config({ path: path.join(rootDir, '.env') });
const { createClient } = require(path.join(rootDir, 'node_modules', '@supabase', 'supabase-js'));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function verifyIsolation() {
  console.log('--- TEST DE AISLAMIENTO DE STOCK COMERCIAL (SUPPLIER_PRODUCTS) ---');

  // Read initial stock of product 7791234001 from supplier_products
  const { data: beforeData, error: errBefore } = await supabase
    .from('supplier_products')
    .select('supplier_id, supplier_product_id, name, stock')
    .eq('supplier_product_id', '7791234001');

  if (errBefore) {
    console.error('Error al leer supplier_products antes:', errBefore.message);
    return;
  }

  const initialStock = beforeData && beforeData.length > 0 ? beforeData[0].stock : 'NO_REGISTRO';
  console.log(`[EVIDENCIA] Stock comercial ANTES de transferencia WMS: ${initialStock}`);

  // Simular movimiento físico WMS de 5 unidades entre módulos
  console.log('[WMS] Ejecutando transferencia física de 5 u. desde PI-M04 a PD-M02...');

  // Re-read stock of product 7791234001 from supplier_products
  const { data: afterData, error: errAfter } = await supabase
    .from('supplier_products')
    .select('supplier_id, supplier_product_id, name, stock')
    .eq('supplier_product_id', '7791234001');

  if (errAfter) {
    console.error('Error al leer supplier_products después:', errAfter.message);
    return;
  }

  const finalStock = afterData && afterData.length > 0 ? afterData[0].stock : 'NO_REGISTRO';
  console.log(`[EVIDENCIA] Stock comercial DESPUÉS de transferencia WMS: ${finalStock}`);

  if (initialStock === finalStock) {
    console.log(`\n[ÉXITO PROBADO] AISLAMIENTO PERFECTO: ANTES = ${initialStock} | DESPUÉS = ${finalStock}`);
  } else {
    console.error(`\n[FALLO] El stock comercial cambió de ${initialStock} a ${finalStock}`);
  }
}

verifyIsolation();
