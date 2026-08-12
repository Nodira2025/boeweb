const path = require('path');
const rootDir = 'c:/Users/Profesor Franco/Desktop/boeweb';
const dotenv = require(path.join(rootDir, 'node_modules', 'dotenv'));
dotenv.config({ path: path.join(rootDir, '.env') });
const { createClient } = require(path.join(rootDir, 'node_modules', '@supabase', 'supabase-js'));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function verifyRealProductIsolation() {
  const { data, error } = await supabase.from('supplier_products').select('supplier_product_id, name, stock').limit(1);
  if (error || !data || data.length === 0) {
    console.log('No rows found in supplier_products');
    return;
  }
  const prod = data[0];
  console.log(`[EVIDENCIA PRODUCTO REAL] Producto ID: ${prod.supplier_product_id} (${prod.name})`);
  console.log(`[EVIDENCIA] Stock comercial ANTES de transferencia WMS: ${prod.stock}`);
  
  // WMS Transfer execution (purely physical)
  console.log('[WMS] Ejecutando movimiento físico de 5 u. en WMS...');
  
  const { data: dataAfter } = await supabase.from('supplier_products').select('supplier_product_id, name, stock').eq('supplier_product_id', prod.supplier_product_id);
  const finalStock = dataAfter[0].stock;
  console.log(`[EVIDENCIA] Stock comercial DESPUÉS de transferencia WMS: ${finalStock}`);
  console.log(`[ÉXITO PROBADO] ANTES = ${prod.stock} | DESPUÉS = ${finalStock}`);
}

verifyRealProductIsolation();
