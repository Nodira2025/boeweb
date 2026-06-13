const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Verify environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env file.');
  process.exit(1);
}

// Create Supabase admin client
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function seedCatalog() {
  try {
    const productsPath = path.join(__dirname, '..', 'products.json');
    if (!fs.existsSync(productsPath)) {
      console.error(`Error: products.json file not found at ${productsPath}`);
      process.exit(1);
    }

    console.log('Reading products.json...');
    const rawData = fs.readFileSync(productsPath, 'utf8');
    const productsData = JSON.parse(rawData);
    
    console.log(`Found ${productsData.length} products to seed.`);

    // 1. Prepare products table data (unique products based on ID)
    const baseProducts = [];
    const supplierProducts = [];
    
    // Set to track unique IDs
    const seenIds = new Set();

    for (const item of productsData) {
      if (!item.id || !item.name) continue;
      
      const idStr = String(item.id);
      
      // Ensure we don't have duplicate base product IDs in our list
      if (!seenIds.has(idStr)) {
        seenIds.add(idStr);
        
        baseProducts.push({
          id: idStr,
          name: item.name,
          image: item.image || null,
          category: item.category || 'Otros',
          description: item.description || null
        });
      }

      // Prepare mapping to AstroGrow as supplier
      supplierProducts.push({
        supplier_id: 'astrogrow',
        supplier_product_id: idStr,
        name: item.name,
        price: Number(item.price) || 0,
        stock: item.stock !== undefined && item.stock !== null ? Number(item.stock) : null,
        available: item.available !== undefined ? Boolean(item.available) : true,
        image: item.image || null,
        link: item.link || null,
        mapped_product_id: idStr
      });
    }

    console.log(`Prepared ${baseProducts.length} unique base products.`);
    console.log(`Prepared ${supplierProducts.length} supplier product relationships (AstroGrow).`);

    // 2. Insert Base Products in chunks of 100
    const CHUNK_SIZE = 100;
    console.log('\n--- Seeding Base Products ---');
    for (let i = 0; i < baseProducts.length; i += CHUNK_SIZE) {
      const chunk = baseProducts.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase
        .from('products')
        .upsert(chunk, { onConflict: 'id' });

      if (error) {
        console.error(`Error seeding base products chunk ${i} - ${i + chunk.length}:`, error);
      } else {
        console.log(`Successfully seeded base products chunk ${i} - ${i + chunk.length}`);
      }
    }

    // 3. Insert Supplier Products (AstroGrow) in chunks of 100
    console.log('\n--- Seeding Supplier Products (AstroGrow) ---');
    for (let i = 0; i < supplierProducts.length; i += CHUNK_SIZE) {
      const chunk = supplierProducts.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase
        .from('supplier_products')
        .upsert(chunk, { onConflict: 'supplier_id,supplier_product_id' });

      if (error) {
        console.error(`Error seeding supplier products chunk ${i} - ${i + chunk.length}:`, error);
      } else {
        console.log(`Successfully seeded supplier products chunk ${i} - ${i + chunk.length}`);
      }
    }

    console.log('\nSeeding completed successfully!');
  } catch (error) {
    console.error('An unexpected error occurred during seeding:', error);
  }
}

seedCatalog();
