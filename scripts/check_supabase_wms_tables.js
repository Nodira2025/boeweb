const path = require('path');
const rootDir = 'c:/Users/Profesor Franco/Desktop/boeweb';
const dotenv = require(path.join(rootDir, 'node_modules', 'dotenv'));
dotenv.config({ path: path.join(rootDir, '.env') });
const { createClient } = require(path.join(rootDir, 'node_modules', '@supabase', 'supabase-js'));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const WMS_COMPONENTS = [
  'store_modules',
  'inventory_locations',
  'inventory_movements',
  'inventory_audits',
  'inventory_audit_items'
];

async function checkStatus() {
  console.log('--- VERIFICACIÓN DE ESTADO REAL EN SUPABASE ---');
  const report = {};

  for (const comp of WMS_COMPONENTS) {
    try {
      const { data, error } = await supabase.from(comp).select('*').limit(1);
      if (error) {
        report[comp] = { status: 'SQL PREPARADO (En setup_wms_schema_v3.sql)', appliedInSupabase: false, detail: error.message };
      } else {
        report[comp] = { status: 'SQL REALMENTE APLICADO', appliedInSupabase: true, detail: `${(data || []).length} filas leídas` };
      }
    } catch (err) {
      report[comp] = { status: 'SQL PREPARADO (En setup_wms_schema_v3.sql)', appliedInSupabase: false, detail: err.message };
    }
  }

  // Check RPC
  try {
    const { data, error } = await supabase.rpc('rpc_mover_producto', {
      p_product_id: 'test',
      p_origin_module_code: 'PI-M04',
      p_origin_level: 1,
      p_origin_sector: 'C',
      p_destination_module_code: 'PD-M02',
      p_destination_level: 1,
      p_destination_sector: 'C',
      p_quantity: 1
    });
    if (error && error.message.includes('Could not find the function')) {
      report['rpc_mover_producto'] = { status: 'SQL PREPARADO (En setup_wms_schema_v3.sql)', appliedInSupabase: false, detail: error.message };
    } else {
      report['rpc_mover_producto'] = { status: 'SQL REALMENTE APLICADO', appliedInSupabase: true, detail: data };
    }
  } catch (err) {
    report['rpc_mover_producto'] = { status: 'SQL PREPARADO (En setup_wms_schema_v3.sql)', appliedInSupabase: false, detail: err.message };
  }

  console.log(JSON.stringify(report, null, 2));
}

checkStatus();
