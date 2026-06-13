const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const { findBestMatch } = require('./utils');

// Verify environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env file.');
  process.exit(1);
}

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

// User-Agent to prevent getting blocked by basic anti-bot systems
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36';

// Supplier display names mapping
const supplierNames = {
  'astrogrow': 'AstroGrow',
  'santaplanta': 'Santa Planta',
  'rosse': 'Distribuidora Rosse',
  'candyclub': 'Candy Club'
};

/**
 * Classify product category based on name and WooCommerce categories
 */
function classifyCategory(name, wpCategories) {
  if (wpCategories && wpCategories.length > 0) {
    const catNames = wpCategories.map(c => c.name.toLowerCase());
    if (catNames.some(n => n.includes('semilla') || n.includes('genet'))) return 'Semillas';
    if (catNames.some(n => n.includes('sustra') || n.includes('tierra') || n.includes('growmix') || n.includes('turba') || n.includes('perlita'))) return 'Sustratos';
    if (catNames.some(n => n.includes('fertil') || n.includes('nutri') || n.includes('aditiv') || n.includes('namaste') || n.includes('kawsay') || n.includes('top crop') || n.includes('feeding'))) return 'Fertilizantes';
    if (catNames.some(n => n.includes('indoor') || n.includes('carpa') || n.includes('ilumina') || n.includes('luz') || n.includes('led') || n.includes('extractor') || n.includes('turbi'))) return 'Indoor';
    if (catNames.some(n => n.includes('vaporizador') || n.includes('vape'))) return 'Vaporizadores';
    if (catNames.some(n => n.includes('maceta'))) return 'Macetas';
    if (catNames.some(n => n.includes('medici') || n.includes('riego') || n.includes('ph') || n.includes('conducti'))) return 'Medición y Riego';
    if (catNames.some(n => n.includes('parafer') || n.includes('seda') || n.includes('pica') || n.includes('armado') || n.includes('ocb') || n.includes('blunt') || n.includes('cenicero') || n.includes('celulosa'))) return 'Parafernalia';
  }

  const n = name.toLowerCase();
  if (n.includes('sustrato') || n.includes('tierra') || n.includes('growmix') || n.includes('turba') || n.includes('perlita') || n.includes('grow mix')) return 'Sustratos';
  if (n.includes('fertilizante') || n.includes('namaste') || n.includes('kawsay') || n.includes('top crop') || n.includes('feeding') || n.includes('oro negro') || n.includes('madline') || n.includes('shanti') || n.includes('flora') || n.includes('crop') || n.includes('aditivo') || n.includes('nutrient')) return 'Fertilizantes';
  if (n.includes('carpa') || n.includes('indoor') || n.includes('panel') || n.includes('led') || n.includes('extractor') || n.includes('turbina') || n.includes('iluminacion') || n.includes('luz') || n.includes('cultivo')) return 'Indoor';
  if (n.includes('vaporizador') || n.includes('vapeador') || n.includes('davinci') || n.includes('g pen')) return 'Vaporizadores';
  if (n.includes('maceta')) return 'Macetas';
  if (n.includes('medidor') || n.includes('riego') || n.includes('ph') || n.includes('conductividad') || n.includes('gotero') || n.includes('manguera')) return 'Medición y Riego';
  if (n.includes('seda') || n.includes('picador') || n.includes('armador') || n.includes('ocb') || n.includes('blunt') || n.includes('cenicero') || n.includes('papelillo') || n.includes('celulosa') || n.includes('redecilla') || n.includes('filtro') || n.includes('boquilla')) return 'Parafernalia';
  if (n.includes('semilla') || n.includes('genetica')) return 'Semillas';
  
  return 'Otros';
}

/**
 * Fetch all base products from Supabase to match against in memory
 */
async function fetchBaseProducts() {
  console.log('Fetching base products from Supabase...');
  let allProducts = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    console.log(`Loading base products range: ${page * pageSize} to ${(page + 1) * pageSize - 1}...`);
    const { data, error } = await supabase
      .from('products')
      .select('id, name, category, image')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      throw new Error(`Failed to fetch base products: ${error.message}`);
    }

    allProducts = allProducts.concat(data || []);
    
    if (!data || data.length < pageSize) {
      hasMore = false;
    } else {
      page++;
    }
  }

  console.log(`Loaded ${allProducts.length} base products for matching.`);
  return allProducts;
}

/**
 * Scrape Santa Planta (WooCommerce)
 */
async function scrapeSantaPlanta(baseProducts) {
  console.log('\n======================================');
  console.log('Scraping Santa Planta...');
  console.log('======================================');
  
  const supplierId = 'santaplanta';
  let page = 1;
  let hasMore = true;
  const scrapedItems = [];

  while (hasMore) {
    const url = `https://santaplanta.com.ar/wp-json/wc/store/v1/products?per_page=100&page=${page}`;
    console.log(`Fetching Santa Planta page ${page}...`);
    
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      
      if (response.status === 400 || response.status === 404) {
        hasMore = false;
        break;
      }
      
      if (!response.ok) {
        console.error(`Error fetching page ${page}: ${response.status} ${response.statusText}`);
        break;
      }

      const products = await response.json();
      if (!Array.isArray(products) || products.length === 0) {
        hasMore = false;
        break;
      }

      console.log(`Received ${products.length} products from page ${page}.`);

      for (const item of products) {
        const minorUnit = item.prices.currency_minor_unit !== undefined ? item.prices.currency_minor_unit : 2;
        const price = Number(item.prices.price) / Math.pow(10, minorUnit);
        
        let stock = null;
        if (item.add_to_cart && item.add_to_cart.maximum !== undefined) {
          stock = item.add_to_cart.maximum;
        }

        const scrapedItem = {
          supplier_id: supplierId,
          supplier_product_id: String(item.id),
          name: item.name,
          price: price || 0,
          stock: stock,
          available: item.is_in_stock !== undefined ? item.is_in_stock : true,
          image: item.images && item.images.length > 0 ? item.images[0].src : null,
          link: item.permalink,
          rawCategories: item.categories
        };

        scrapedItems.push(scrapedItem);
      }

      page++;
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err) {
      console.error(`Unexpected error on page ${page}:`, err.message);
      break;
    }
  }

  console.log(`Scraped ${scrapedItems.length} products from Santa Planta.`);
  return mapAndSave(scrapedItems, baseProducts);
}

/**
 * Scrape Candy Club (WooCommerce)
 */
async function scrapeCandyClub(baseProducts) {
  console.log('\n======================================');
  console.log('Scraping Candy Club...');
  console.log('======================================');

  const supplierId = 'candyclub';
  let page = 1;
  let hasMore = true;
  const scrapedItems = [];

  while (hasMore) {
    const url = `https://candyclub.com.ar/wp-json/wc/store/v1/products?per_page=100&page=${page}`;
    console.log(`Fetching Candy Club page ${page}...`);

    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });

      if (response.status === 400 || response.status === 404) {
        hasMore = false;
        break;
      }

      if (!response.ok) {
        console.error(`Error fetching page ${page}: ${response.status} ${response.statusText}`);
        break;
      }

      const products = await response.json();
      if (!Array.isArray(products) || products.length === 0) {
        hasMore = false;
        break;
      }

      console.log(`Received ${products.length} products from page ${page}.`);

      for (const item of products) {
        const minorUnit = item.prices.currency_minor_unit !== undefined ? item.prices.currency_minor_unit : 2;
        const price = Number(item.prices.price) / Math.pow(10, minorUnit);

        let stock = null;
        if (item.add_to_cart && item.add_to_cart.maximum !== undefined) {
          stock = item.add_to_cart.maximum;
        }

        const scrapedItem = {
          supplier_id: supplierId,
          supplier_product_id: String(item.id),
          name: item.name,
          price: price || 0,
          stock: stock,
          available: item.is_in_stock !== undefined ? item.is_in_stock : true,
          image: item.images && item.images.length > 0 ? item.images[0].src : null,
          link: item.permalink,
          rawCategories: item.categories
        };

        scrapedItems.push(scrapedItem);
      }

      page++;
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err) {
      console.error(`Unexpected error on page ${page}:`, err.message);
      break;
    }
  }

  console.log(`Scraped ${scrapedItems.length} products from Candy Club.`);
  return mapAndSave(scrapedItems, baseProducts);
}

/**
 * Scrape Distribuidora Rosse (TiendaNube JSON-LD)
 */
async function scrapeDistribuidoraRosse(baseProducts) {
  console.log('\n======================================');
  console.log('Scraping Distribuidora Rosse...');
  console.log('======================================');

  const supplierId = 'rosse';
  let page = 1;
  let hasMore = true;
  const scrapedItems = [];

  while (hasMore && page <= 100) {
    const url = `https://distribuidorarosse.com.ar/productos/?page=${page}`;
    console.log(`Fetching Distribuidora Rosse page ${page}...`);

    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });

      if (response.status === 404) {
        hasMore = false;
        break;
      }

      if (!response.ok) {
        console.error(`Error fetching page ${page}: ${response.status} ${response.statusText}`);
        break;
      }

      const html = await response.text();
      
      const schemaRegex = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
      let match;
      let pageProductsCount = 0;

      while ((match = schemaRegex.exec(html)) !== null) {
        const content = match[1];
        if (content.includes('"Product"') || content.includes('"@type":"Product"') || content.includes('"@type": "Product"')) {
          try {
            const json = JSON.parse(content.trim());
            
            if (json && json.offers) {
              const offer = json.offers;
              const productUrl = offer.url || json.url || '';
              
              let slug = '';
              const urlMatch = productUrl.match(/\/productos\/([^/]+)\/?$/);
              if (urlMatch) {
                slug = urlMatch[1];
              } else {
                slug = `rosse-prod-${Math.random().toString(36).substring(2, 9)}`;
              }

              let stock = null;
              if (offer.inventoryLevel && offer.inventoryLevel.value !== undefined) {
                stock = Number(offer.inventoryLevel.value);
              }
              
              const isAvailable = offer.availability 
                ? offer.availability.includes('InStock') 
                : true;

              const scrapedItem = {
                supplier_id: supplierId,
                supplier_product_id: slug,
                name: json.name || '',
                price: Number(offer.price) || 0,
                stock: stock,
                available: isAvailable,
                image: json.image || null,
                link: productUrl,
                rawCategories: null
              };

              scrapedItems.push(scrapedItem);
              pageProductsCount++;
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }

      console.log(`Found ${pageProductsCount} products on page ${page}.`);

      if (pageProductsCount === 0) {
        hasMore = false;
        break;
      }

      page++;
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.error(`Unexpected error on page ${page}:`, err.message);
      break;
    }
  }

  console.log(`Scraped ${scrapedItems.length} products from Distribuidora Rosse.`);
  return mapAndSave(scrapedItems, baseProducts);
}

/**
 * Fuzzy Match products, dynamically create new base products for unmapped ones, and save to Supabase
 */
async function mapAndSave(scrapedItems, baseProducts) {
  console.log(`Mapping and saving ${scrapedItems.length} items to Supabase...`);
  
  let mappedCount = 0;
  const processedItems = [];
  const newBaseProducts = [];

  for (const item of scrapedItems) {
    const match = findBestMatch(item.name, baseProducts);
    
    if (match) {
      item.mapped_product_id = match.product.id;
      mappedCount++;
    } else {
      // Create a new base product dynamically to expand the catalog
      const newId = `${item.supplier_id}-${item.supplier_product_id}`;
      item.mapped_product_id = newId;

      const category = classifyCategory(item.name, item.rawCategories);
      const newBaseProduct = {
        id: newId,
        name: item.name,
        image: item.image || null,
        category: category,
        description: `Producto importado de ${supplierNames[item.supplier_id] || item.supplier_id}`
      };
      
      newBaseProducts.push(newBaseProduct);
      
      // Add to baseProducts list in memory so future products in this run can match it
      baseProducts.push({
        id: newId,
        name: item.name,
        category: category,
        image: item.image || null
      });
    }

    // Clean up temporary property before saving to DB
    const dbItem = {
      supplier_id: item.supplier_id,
      supplier_product_id: item.supplier_product_id,
      name: item.name,
      price: item.price,
      stock: item.stock,
      available: item.available,
      image: item.image,
      link: item.link,
      mapped_product_id: item.mapped_product_id
    };
    processedItems.push(dbItem);
  }

  console.log(`Fuzzy mapped ${mappedCount} of ${scrapedItems.length} items. Created ${newBaseProducts.length} new base products.`);

  // 1. Insert New Base Products first (satisfies foreign key constraints)
  const CHUNK_SIZE = 100;
  if (newBaseProducts.length > 0) {
    console.log(`Saving ${newBaseProducts.length} new base products to products table...`);
    for (let i = 0; i < newBaseProducts.length; i += CHUNK_SIZE) {
      const chunk = newBaseProducts.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase
        .from('products')
        .upsert(chunk, { onConflict: 'id' });

      if (error) {
        console.error(`Error saving new base products chunk at ${i}:`, error.message);
      }
    }
  }

  // 2. Save Supplier Products
  console.log(`Saving ${processedItems.length} supplier products...`);
  for (let i = 0; i < processedItems.length; i += CHUNK_SIZE) {
    const chunk = processedItems.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from('supplier_products')
      .upsert(chunk, { onConflict: 'supplier_id,supplier_product_id' });

    if (error) {
      console.error(`Error saving supplier products chunk at ${i}:`, error.message);
    }
  }

  console.log(`Saved ${processedItems.length} products to Supabase.`);
  return {
    scraped: scrapedItems.length,
    mapped: mappedCount + newBaseProducts.length
  };
}

/**
 * Main function orchestrating all scrapers
 */
async function main() {
  const startTime = Date.now();
  console.log('Starting catalog synchronization...');
  
  try {
    const baseProducts = await fetchBaseProducts();
    const results = {};
    
    // 1. Scrape Santa Planta
    try {
      results.santaplanta = await scrapeSantaPlanta(baseProducts);
    } catch (err) {
      console.error('Santa Planta Scraper failed:', err.message);
      results.santaplanta = { error: err.message };
    }

    // 2. Scrape Candy Club
    try {
      results.candyclub = await scrapeCandyClub(baseProducts);
    } catch (err) {
      console.error('Candy Club Scraper failed:', err.message);
      results.candyclub = { error: err.message };
    }

    // 3. Scrape Distribuidora Rosse
    try {
      results.rosse = await scrapeDistribuidoraRosse(baseProducts);
    } catch (err) {
      console.error('Distribuidora Rosse Scraper failed:', err.message);
      results.rosse = { error: err.message };
    }

    console.log('\n======================================');
    console.log('Synchronization Summary:');
    console.log('======================================');
    for (const [key, res] of Object.entries(results)) {
      if (res.error) {
        console.log(`${key}: FAILED - ${res.error}`);
      } else {
        console.log(`${key}: Scraped: ${res.scraped} | Processed: ${res.mapped}`);
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Sync process finished in ${duration} seconds.`);
  } catch (error) {
    console.error('Fatal synchronization error:', error.message);
  }
}

main();
