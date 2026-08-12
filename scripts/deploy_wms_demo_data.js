const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured in .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const DEFAULT_MODULES = [
  { code: 'PI-M01', sector_name: 'Fertilizantes y Nutrición', wall_code: 'PI', module_number: 1, max_levels: 5, description: 'Pared Izquierda - Módulo 1 (Fertilizantes orgánicos)' },
  { code: 'PI-M02', sector_name: 'Nutrición Vegetal', wall_code: 'PI', module_number: 2, max_levels: 5, description: 'Pared Izquierda - Módulo 2 (Bioestimulantes)' },
  { code: 'PI-M03', sector_name: 'Sustratos y Enmiendas', wall_code: 'PI', module_number: 3, max_levels: 5, description: 'Pared Izquierda - Módulo 3 (Sustratos Klasmann/Grow)' },
  { code: 'PI-M04', sector_name: 'Módulo Principal Botánico', wall_code: 'PI', module_number: 4, max_levels: 5, description: 'Pared Izquierda - Módulo 4 (Control de plagas y preventivos)' },
  { code: 'PT-M01', sector_name: 'Luz e Iluminación Indoor', wall_code: 'PT', module_number: 1, max_levels: 5, description: 'Pared Trasera - Módulo 1 (Paneles LED y Kits)' },
  { code: 'PT-M02', sector_name: 'Ventilación y Clima', wall_code: 'PT', module_number: 2, max_levels: 5, description: 'Pared Trasera - Módulo 2 (Extractores y filtros)' },
  { code: 'PD-M01', sector_name: 'Macetas y Riego', wall_code: 'PD', module_number: 1, max_levels: 5, description: 'Pared Derecha - Módulo 1 (Macetas geotextiles)' },
  { code: 'PD-M02', sector_name: 'Accesorios de Cultivo', wall_code: 'PD', module_number: 2, max_levels: 5, description: 'Pared Derecha - Módulo 2 (Tijeras y medidores)' },
  { code: 'DEP-M01', sector_name: 'Depósito Insumos Pesados', wall_code: 'DP', module_number: 1, max_levels: 5, description: 'Depósito - Módulo 1 (Sustratos 50L en pallets)' },
  { code: 'DEP-M02', sector_name: 'Depósito Reserva General', wall_code: 'DP', module_number: 2, max_levels: 5, description: 'Depósito - Módulo 2 (Reserva de seguridad)' }
];

async function seedWms() {
  console.log('Sembrando datos demo WMS en Supabase...');
  try {
    const { data: modulesData, error: modulesErr } = await supabase
      .from('store_modules')
      .upsert(DEFAULT_MODULES, { onConflict: 'code' })
      .select();

    if (modulesErr) {
      console.warn('Tabla store_modules no disponible aún en Supabase REST. Se usará fallback local:', modulesErr.message);
      return;
    }

    console.log(`[OK] Módulos sembrados: ${modulesData.length} módulos físicos.`);

    // Map module code to ID
    const moduleMap = new Map((modulesData || []).map(m => [m.code, m.id]));

    // Sample DEMO Multi-Location items
    const demoItems = [
      {
        module_id: moduleMap.get('PI-M04'),
        product_id: 'klasmann-50l',
        product_code: '7791234001',
        name: 'Sustrato Klasmann Potground H 50L',
        barcode: '7791234001',
        human_level: 3,
        sector_position: 'C',
        quantity: 25
      },
      {
        module_id: moduleMap.get('PD-M02'),
        product_id: 'klasmann-50l',
        product_code: '7791234001',
        name: 'Sustrato Klasmann Potground H 50L',
        barcode: '7791234001',
        human_level: 2,
        sector_position: 'I',
        quantity: 10
      },
      {
        module_id: moduleMap.get('DEP-M01'),
        product_id: 'klasmann-50l',
        product_code: '7791234001',
        name: 'Sustrato Klasmann Potground H 50L',
        barcode: '7791234001',
        human_level: 5,
        sector_position: 'C',
        quantity: 3
      },
      {
        module_id: moduleMap.get('PI-M04'),
        product_id: 'top-bud-250ml',
        product_code: '7791234002',
        name: 'Top Crop Top Bud Bioestimulante 250ml',
        barcode: '7791234002',
        human_level: 4,
        sector_position: 'D',
        quantity: 14
      },
      {
        module_id: moduleMap.get('PI-M01'),
        product_id: 'top-bud-250ml',
        product_code: '7791234002',
        name: 'Top Crop Top Bud Bioestimulante 250ml',
        barcode: '7791234002',
        human_level: 1,
        sector_position: 'C',
        quantity: 6
      },
      {
        module_id: moduleMap.get('PI-M04'),
        product_id: 'mamboreta-aba-30ml',
        product_code: '7791234003',
        name: 'Mamboretá ABA Acaricida 30ml',
        barcode: '7791234003',
        human_level: 2,
        sector_position: 'I',
        quantity: 8
      }
    ];

    const validDemoItems = demoItems.filter(item => item.module_id);

    if (validDemoItems.length > 0) {
      const { error: locErr } = await supabase
        .from('inventory_locations')
        .upsert(validDemoItems, { onConflict: 'module_id,product_id,human_level,sector_position' });

      if (locErr) {
        console.warn('Tabla inventory_locations no disponible aún en Supabase. Usando fallback:', locErr.message);
      } else {
        console.log(`[OK] Sembradas ${validDemoItems.length} ubicaciones demo de inventario WMS.`);
      }
    }

  } catch (err) {
    console.error('Error al desplegar datos demo WMS:', err.message);
  }
}

seedWms();
