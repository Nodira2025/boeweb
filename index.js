/* ==========================================================================
   BO growclub E-commerce Logic Engine
   ========================================================================== */

// Supabase Initialization for storefront
const SUPABASE_URL = 'https://sxbhrgvizqylnfcqzhin.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4YmhyZ3ZpenF5bG5mY3F6aGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMjM1MzEsImV4cCI6MjA5Njg5OTUzMX0.UUOwXsHXKNCjlJKdxMUlAuCtNAnNWgAroBwMlWAdTag';

let supabaseClient = null;
if (window.supabase) {
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (sbInitErr) {
    console.warn('Supabase initialization in storefront:', sbInitErr);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // --- STATE MANAGEMENT ---
  let products = [];
  let filteredProducts = [];
  let cart = JSON.parse(localStorage.getItem('boeweb_cart')) || [];
  let currentCategory = 'all';
  let searchQuery = '';
  let currentPage = 1;
  const itemsPerPage = 24; // Smooth batch rendering
  let appliedCoupon = JSON.parse(localStorage.getItem('boeweb_applied_coupon')) || null;
  let blogArticles = [];
  let filteredArticles = [];
  let currentBlogCategory = 'all';

  // Zen Quotes Database
  const zenQuotes = [
    { text: "La paz viene de adentro. No la busques afuera.", author: "Buda" },
    { text: "En la mente del principiante hay muchas posibilidades; en la del experto, pocas.", author: "Shunryu Suzuki" },
    { text: "Quien planta un jardín, planta felicidad.", author: "Proverbio Zen" },
    { text: "El que cuida una planta, cuida su propia mente.", author: "Sabiduría Zen" },
    { text: "La flor no sueña con la abeja. Florece y la abeja viene.", author: "Arland Ussher" },
    { text: "El barro es necesario para que el loto crezca.", author: "Thich Nhat Hanh" },
    { text: "Sé paciente. Todo tiene su tiempo de maduración y floración.", author: "Buda" }
  ];

  // Rueda Zen segments definition (12 slices, 30deg each)
  const wheelSlices = [
    { index: 0, code: 'ZEN5', desc: '5% de Descuento', value: 0.05, type: 'percent' },
    { index: 1, code: 'DHARMA10', desc: '10% de Descuento', value: 0.10, type: 'percent' },
    { index: 2, code: 'SABIDURIA', desc: 'Mensaje Zen + 5%', value: 0.05, type: 'wisdom' },
    { index: 3, code: 'ENVIOFREE', desc: 'Envío Gratis', value: 0, type: 'shipping' },
    { index: 4, code: 'OMSHANTI15', desc: '15% de Descuento', value: 0.15, type: 'percent' },
    { index: 5, code: 'REGALO', desc: 'Regalo Sorpresa', value: 0, type: 'gift' },
    { index: 6, code: 'SABIDURIA', desc: 'Mensaje Zen + 5%', value: 0.05, type: 'wisdom' },
    { index: 7, code: 'ZEN5', desc: '5% de Descuento', value: 0.05, type: 'percent' },
    { index: 8, code: 'DHARMA10', desc: '10% de Descuento', value: 0.10, type: 'percent' },
    { index: 9, code: 'ENVIOFREE', desc: 'Envío Gratis', value: 0, type: 'shipping' },
    { index: 10, code: 'REGALO', desc: 'Regalo Sorpresa', value: 0, type: 'gift' },
    { index: 11, code: 'SABIDURIA', desc: 'Mensaje Zen + 5%', value: 0.05, type: 'wisdom' }
  ];

  // --- HTML ELEMENT REFERENCES ---
  const productGrid = document.getElementById('product-grid');
  const loadMoreBtn = document.getElementById('load-more-btn');
  const loadMoreContainer = document.getElementById('load-more-container');
  const noResults = document.getElementById('no-results');
  const displayedCountEl = document.getElementById('displayed-count');
  const totalCountEl = document.getElementById('total-count');
  
  // Category Pill Buttons
  const categoryButtons = document.querySelectorAll('.category-btn');
  const activeFiltersArea = document.getElementById('active-filters-area');
  const filterBadgeText = document.getElementById('filter-badge-text');
  const removeFilterBtn = document.getElementById('remove-filter-btn');
  const resetSearchBtn = document.getElementById('reset-search-btn');

  // Search
  const searchInput = document.getElementById('search-input');
  const clearSearchBtn = document.getElementById('clear-search');
  const sortSelect = document.getElementById('sort-select');

  // Cart Drawer
  const cartTrigger = document.getElementById('cart-trigger');
  const cartClose = document.getElementById('close-cart');
  const cartOverlay = document.getElementById('cart-overlay');
  const cartDrawer = document.getElementById('cart-drawer');
  const cartItemsContainer = document.getElementById('cart-items-container');
  const cartCountEl = document.getElementById('cart-count');
  const cartSubtotalEl = document.getElementById('cart-subtotal');
  const cartDiscountEl = document.getElementById('cart-discount');
  const cartDiscountRow = document.getElementById('cart-discount-row');
  const cartDiscountLabelEl = document.getElementById('cart-discount-label');
  const cartTotalEl = document.getElementById('cart-total');
  const cartFooter = document.getElementById('cart-footer');
  const emptyCartShopBtn = document.getElementById('empty-cart-shop-btn');
  const emptyCartStateEl = document.getElementById('empty-cart-state');
  const cartCouponBanner = document.getElementById('cart-coupon-banner');
  const appliedCouponCodeEl = document.getElementById('applied-coupon-code');
  const appliedCouponDescEl = document.getElementById('applied-coupon-desc');
  const removeCouponBtn = document.getElementById('remove-coupon-btn');
  const railOpenCartBtn = document.getElementById('rail-open-cart');
  const railOpenClubBtn = document.getElementById('rail-open-club');
  const railCartCount = document.getElementById('rail-cart-count');
  const railCartTotal = document.getElementById('rail-cart-total');
  const railCartMessage = document.getElementById('rail-cart-message');

  // Product Detail Modal
  const productDetailModal = document.getElementById('product-detail-modal');
  const closeDetailModal = document.getElementById('close-detail-modal');
  const detailProductImg = document.getElementById('detail-product-img');
  const detailProductCategory = document.getElementById('detail-product-category');
  const detailProductName = document.getElementById('detail-product-name');
  const detailProductPrice = document.getElementById('detail-product-price');
  const detailProductStock = document.getElementById('detail-product-stock');
  const detailQtyMinus = document.getElementById('detail-qty-minus');
  const detailQtyPlus = document.getElementById('detail-qty-plus');
  const detailQtyValue = document.getElementById('detail-qty-value');
  const detailAddToCartBtn = document.getElementById('detail-add-to-cart-btn');
  const detailProductDescription = document.getElementById('detail-product-description');

  // Checkout Modal
  const checkoutTriggerBtn = document.getElementById('checkout-trigger-btn');
  const checkoutModal = document.getElementById('checkout-modal');
  const closeCheckoutModal = document.getElementById('close-checkout-modal');
  const checkoutForm = document.getElementById('checkout-form');
  const checkoutDeliverySelect = document.getElementById('checkout-delivery');
  const addressGroup = document.getElementById('address-group');
  const checkoutAddressInput = document.getElementById('checkout-address');

  // Checkout Summary
  const summaryItemsCount = document.getElementById('summary-items-count');
  const summarySubtotal = document.getElementById('summary-subtotal');
  const summaryDiscountRow = document.getElementById('summary-discount-row');
  const summaryDiscount = document.getElementById('summary-discount');
  const summaryDiscountLabel = document.getElementById('summary-discount-label');
  const summaryTotal = document.getElementById('summary-total');

  // Zen Discount Wheel Modal
  const wheelModal = document.getElementById('wheel-modal');
  const closeWheelModal = document.getElementById('close-wheel-modal');
  const wheelTriggerHero = document.getElementById('wheel-trigger-hero');
  const floatingWheelBtn = document.getElementById('floating-wheel-btn');
  const wheelIntro = document.getElementById('wheel-intro');
  const wheelGame = document.getElementById('wheel-game');
  const wheelResult = document.getElementById('wheel-result');
  const wheelForm = document.getElementById('wheel-form');
  const wheelUsername = document.getElementById('wheel-username');
  const spinnerPlayerName = document.getElementById('spinner-player-name');
  const spinActionBtn = document.getElementById('spin-action-btn');
  const wheelInnerGroup = document.getElementById('wheel-inner-group');
  
  // Results
  const resultHeadline = document.getElementById('result-headline');
  const wisdomQuoteBox = document.getElementById('wisdom-quote-box');
  const quoteTextEl = document.getElementById('quote-text');
  const quoteAuthorEl = document.getElementById('quote-author');
  const couponCodeDisplay = document.getElementById('coupon-code-display');
  const couponDescDisplay = document.getElementById('coupon-desc-display');
  const claimCouponBtn = document.getElementById('claim-coupon-btn');


  // --- CLUB MEMBER HELPERS ---
  function getMemberDiscountPercent() {
    const memberStr = localStorage.getItem('boeweb_member');
    if (!memberStr) return 0;
    try {
      const member = JSON.parse(memberStr);
      const seeds = member.seeds || 0;
      if (seeds >= 1500) return 0.15;
      if (seeds >= 500) return 0.10;
      return 0.05;
    } catch (e) {
      return 0;
    }
  }

  function getMemberTierName() {
    const memberStr = localStorage.getItem('boeweb_member');
    if (!memberStr) return "";
    try {
      const member = JSON.parse(memberStr);
      const seeds = member.seeds || 0;
      if (seeds >= 1500) return "Árbol Zen VIP";
      if (seeds >= 500) return "Planta";
      return "Brote";
    } catch (e) {
      return "";
    }
  }

  function updateCartDisplay() {
    updateCartBadge();
    renderCartItems();
  }

  // Expose cart update globally for memberPortal.js
  window.updateCartDisplay = updateCartDisplay;


  // --- INITIALIZE & FETCH CATALOG ---
  async function loadCatalog() {
    try {
      let fetchedSuccessfully = false;

      // 1. Priority A: Fetch Internal Store Catalog from Supabase
      if (window.supabase) {
        try {
          const supabaseUrl = 'https://sxbhrgvizqylnfcqzhin.supabase.co';
          const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4YmhyZ3ZpenF5bG5mY3F6aGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMjM1MzEsImV4cCI6MjA5Njg5OTUzMX0.UUOwXsHXKNCjlJKdxMUlAuCtNAnNWgAroBwMlWAdTag';
          const client = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

          // 1.1 Fetch products from supplier_products (both local_store and external suppliers)
          const { data: allSupplierRows, error: suppErr } = await client
            .from('supplier_products')
            .select('*')
            .order('name', { ascending: true });

          if (!suppErr && allSupplierRows && allSupplierRows.length > 0) {
            const productIds = [...new Set(allSupplierRows.map(r => r.mapped_product_id || r.supplier_product_id).filter(Boolean))];
            let metadataMap = new Map();
            if (productIds.length > 0) {
              const { data: prodMeta } = await client.from('products').select('*').in('id', productIds);
              if (prodMeta) {
                prodMeta.forEach(pm => metadataMap.set(String(pm.id), pm));
              }
            }

            // Local Stock Overrides (para reflejar bajas y retiros inmediatamente)
            let localCatalogMap = new Map();
            try {
              const cachedCat = JSON.parse(localStorage.getItem('boeweb_internal_catalog') || '[]');
              if (Array.isArray(cachedCat)) {
                cachedCat.forEach(item => {
                  const code = String(item.product_code || item.id || '').toUpperCase();
                  if (code) localCatalogMap.set(code, item);
                });
              }
            } catch (_) {}

            const ownRows = allSupplierRows.filter(r => r.supplier_id === 'local_store' || r.supplier_id === 'propio' || !r.supplier_id);
            const b2bRows = allSupplierRows.filter(r => r.supplier_id && r.supplier_id !== 'local_store' && r.supplier_id !== 'propio');

            const ownParsed = ownRows.map(r => {
              const pid = String(r.mapped_product_id || r.supplier_product_id || r.id);
              const meta = metadataMap.get(pid) || {};
              const localOverride = localCatalogMap.get(pid.toUpperCase());
              const finalStock = localOverride !== undefined && localOverride.stock !== undefined
                ? Math.max(0, Number(localOverride.stock) || 0)
                : Math.max(0, Number(r.stock) || 0);
              const isAvail = r.available !== false && finalStock > 0;
              return {
                id: pid,
                product_code: pid,
                name: meta.name || r.name || 'Producto BÔ',
                price: Number(r.price) || 0,
                image: meta.image || r.image || 'assets/logo.jpg',
                link: r.link || '',
                slug: (meta.name || r.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
                stock: finalStock,
                own_stock: finalStock,
                available: isAvail,
                category: meta.category || 'Otros',
                description: meta.description || r.description || ''
              };
            });

            const b2bParsed = b2bRows.map(r => {
              const pid = String(r.mapped_product_id || r.supplier_product_id || r.id);
              const meta = metadataMap.get(pid) || {};
              return {
                id: pid,
                product_code: pid,
                name: meta.name || r.name || 'Producto B2B',
                price: Number(r.price) || 0,
                image: meta.image || r.image || 'assets/logo.jpg',
                link: r.link || '',
                slug: (meta.name || r.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
                stock: 0,
                own_stock: 0,
                available: true,
                category: meta.category || 'Otros',
                description: meta.description || r.description || '',
                supplier_code: r.supplier_id,
                supplier_name: r.supplier_id
              };
            });

            // Local Stores Products (Otras Tiendas Cerca)
            let localStores = [];
            try {
              const cachedLocalStores = localStorage.getItem('boeweb_nearby_stores_catalog');
              if (cachedLocalStores) localStores = JSON.parse(cachedLocalStores);
            } catch (_) {}

            if (typeof window.PublicCatalogUnifier !== 'undefined') {
              products = window.PublicCatalogUnifier.unifyProducts(ownParsed, b2bParsed, {
                localStoresProducts: localStores
              });
            } else {
              products = [...ownParsed, ...b2bParsed];
            }

            products = products.filter(p => p.id && p.name);
            if (products.length > 0) {
              fetchedSuccessfully = true;
              try {
                localStorage.setItem('boeweb_internal_catalog', JSON.stringify(products));
              } catch (_) {}
            }
          }

          // 1.2 Fallback to safe public_catalog_products view
          if (!fetchedSuccessfully) {
            const { data: viewData, error: viewErr } = await client
              .from('public_catalog_products')
              .select('*')
              .order('name', { ascending: true });

            if (!viewErr && viewData && viewData.length > 0) {
              const viewParsed = viewData.map(p => ({
                id: String(p.product_id || p.id),
                product_code: String(p.sku || p.id),
                name: p.name || 'Producto BÔ',
                price: Number(p.public_price || p.price) || 0,
                image: p.image_url || p.image || 'assets/logo.jpg',
                link: '',
                slug: (p.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
                stock: 10,
                own_stock: 10,
                available: p.is_available !== false,
                availability: 'EN_STOCK',
                badge_text: '🟢 EN STOCK',
                category: p.category || 'Otros',
                description: p.public_description || p.description || ''
              }));
              products = viewParsed.filter(p => p.id && p.name);
              if (products.length > 0) {
                fetchedSuccessfully = true;
              }
            }
          }
        } catch (spErr) {
          console.warn('Supabase catalog fetch failed:', spErr);
        }
      }

      // 2. Fallback to cached local internal catalog
      if (!fetchedSuccessfully) {
        try {
          const cached = localStorage.getItem('boeweb_internal_catalog');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              products = parsed;
              fetchedSuccessfully = true;
            }
          }
        } catch (_) {}
      }

      // 3. Fallback to local products.json if no internal products found yet
      if (!fetchedSuccessfully) {
        try {
          const response = await fetch('products.json');
          if (response.ok) {
            products = await response.json();
            products = products.filter(p => p && p.id && p.name);
            if (products.length > 0) {
              fetchedSuccessfully = true;
            }
          }
        } catch (jsonErr) {
          console.warn('Local products.json fetch failed, trying Supabase fallback...', jsonErr);
        }
      }

      if (!fetchedSuccessfully) {
        throw new Error('No se pudo establecer conexión con el catálogo de productos.');
      }

      // Default Sort Order: Relevance (relevance matches index order)
      filteredProducts = [...products];
      
      // Update UI counts
      totalCountEl.textContent = products.length;
      
      // Render Initial View
      applyFiltersAndRender();
      
      // Render Cart Badge count
      updateCartBadge();
    } catch (error) {
      console.error("Error loading products catalog:", error);
      
      productGrid.innerHTML = `
        <div class="grid-loading" style="color: #721c24; grid-column: 1 / -1; width: 100%; text-align: center; padding: 40px 20px;">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 40px; height: 40px; margin: 0 auto 15px auto; display: block;">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <p style="font-size: 1.1rem; font-weight: 700; margin-bottom: 8px;">No se pudo conectar con el catálogo de productos.</p>
          <p style="font-size: 0.9rem; opacity: 0.8; margin-bottom: 16px;">Por favor, comprobá tu conexión a internet o recargá la página.</p>
          <button onclick="window.loadCatalog && window.loadCatalog()" style="padding: 10px 20px; background: var(--color-primary, #152d24); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Reintentar Carga</button>
        </div>
      `;
    }
  }

  // Expose loadCatalog globally for retry buttons
  window.loadCatalog = loadCatalog;


  // --- DYNAMIC FACETED FILTER ENGINE ---
  let facetedState = {
    category: 'all',
    subcategory: null,
    selectedBrands: [],
    contextualFilters: {},
    minPrice: null,
    maxPrice: null,
    stockOnly: false,
    lowStockOnly: false
  };

  const KNOWN_BRANDS = [
    'Biobizz', 'Grotek', 'Plagron', 'Advanced Nutrients', 'Storz & Bickel', 'Grenco',
    'Davinci', 'Pax', 'Puffco', 'Dutch Passion', 'Buddha Seeds', 'BSF', 'Paradise Seeds',
    'Sensi Seeds', 'Santa Planta', 'Growmix', 'Mad Grow', 'Jiffy', 'Klassmann', 'Top Crop',
    'Namaste', 'Kawsay', 'Vamp', 'Ecocrop', 'Crop', 'Biolab', 'Treemix', 'Canna', 'Atami', 'Hesi'
  ];

  function extractProductFacets(product) {
    const text = `${product.name || ''} ${product.description || ''}`.toLowerCase();
    let foundBrand = null;
    for (const b of KNOWN_BRANDS) {
      if (text.includes(b.toLowerCase())) {
        foundBrand = b;
        break;
      }
    }

    let subcategory = null;
    let attributes = {};
    const cat = product.category || 'Otros';

    if (cat === 'Semillas') {
      if (text.includes('auto')) attributes.tipo = 'Autofloreciente';
      else if (text.includes('foto') || text.includes('feminizada')) attributes.tipo = 'Fotoperiódica';
      else if (text.includes('cbd')) attributes.tipo = 'CBD';

      if (text.includes('importad') || text.includes('dutch') || text.includes('buddha') || text.includes('bsf') || text.includes('sensi')) {
        attributes.origen = 'Importada';
      } else {
        attributes.origen = 'Nacional';
      }

      const qtyMatch = text.match(/x\s*(\d+)/i);
      if (qtyMatch) attributes.cantidad = `x${qtyMatch[1]}`;

    } else if (cat === 'Parafernalia') {
      if (text.includes('bong')) subcategory = 'Bongs';
      else if (text.includes('pipa')) subcategory = 'Pipas';
      else if (text.includes('papel') || text.includes('seda')) subcategory = 'Papeles';
      else if (text.includes('filtro') || text.includes('tip')) subcategory = 'Filtros';
      else if (text.includes('picador') || text.includes('grinder')) subcategory = 'Picadores';
      else if (text.includes('extrac')) subcategory = 'Extracción';

      if (text.includes('vidrio') || text.includes('pyrex')) attributes.material = 'Vidrio';
      else if (text.includes('silicona')) attributes.material = 'Silicona';
      else if (text.includes('metal') || text.includes('aluminio')) attributes.material = 'Metal';
      else if (text.includes('cáñamo') || text.includes('canamo')) attributes.material = 'Cáñamo';
      else if (text.includes('3d')) attributes.material = 'Impresión 3D';
      else if (text.includes('acrílico') || text.includes('acrilico')) attributes.material = 'Acrílico';

    } else if (cat === 'Fertilizantes') {
      if (text.includes('estimul') || text.includes('root') || text.includes('tricho') || text.includes('mico')) subcategory = 'Bioestimulantes';
      else if (text.includes('crecimiento') || text.includes('veg')) subcategory = 'Crecimiento';
      else if (text.includes('floración') || text.includes('flora') || text.includes('bloom')) subcategory = 'Floración';
      else subcategory = 'Aditivos y complementos';

    } else if (cat === 'Vaporizadores') {
      if (text.includes('extrac') || text.includes('wax')) attributes.uso = 'Para extracciones';
      else if (text.includes('flor')) attributes.uso = 'Para flores';
      else attributes.uso = 'Híbrido';
    }

    return { brand: foundBrand, subcategory, attributes };
  }

  function renderFacetedBrandsList() {
    const container = document.getElementById('facet-brands-list');
    if (!container) return;

    const brandCounts = {};
    KNOWN_BRANDS.forEach(b => brandCounts[b] = 0);

    products.forEach(p => {
      const facets = extractProductFacets(p);
      if (facets.brand && brandCounts[facets.brand] !== undefined) {
        brandCounts[facets.brand]++;
      }
    });

    const activeBrands = KNOWN_BRANDS.filter(b => brandCounts[b] > 0);

    container.innerHTML = activeBrands.map(b => {
      const isChecked = facetedState.selectedBrands.includes(b);
      return `
        <label class="facet-check-item">
          <input type="checkbox" value="${b}" ${isChecked ? 'checked' : ''} onchange="toggleBrandFilter('${b}')">
          <span>${b}</span>
          <span class="facet-count">(${brandCounts[b]})</span>
        </label>
      `;
    }).join('');
  }

  window.toggleBrandFilter = function(brand) {
    const idx = facetedState.selectedBrands.indexOf(brand);
    if (idx >= 0) facetedState.selectedBrands.splice(idx, 1);
    else facetedState.selectedBrands.push(brand);
    applyFiltersAndRender(true);
  };

  window.filterBrandChecklist = function(query) {
    const q = (query || '').toLowerCase();
    document.querySelectorAll('#facet-brands-list .facet-check-item').forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(q) ? 'flex' : 'none';
    });
  };

  window.setPricePreset = function(min, max) {
    const minInput = document.getElementById('price-min-input');
    const maxInput = document.getElementById('price-max-input');
    if (minInput) minInput.value = min || '';
    if (maxInput) maxInput.value = (max && max < 9999999) ? max : '';
    facetedState.minPrice = min || null;
    facetedState.maxPrice = (max && max < 9999999) ? max : null;
    applyFiltersAndRender(true);
  };

  window.clearAllFacetedFilters = function() {
    facetedState = {
      category: 'all',
      subcategory: null,
      selectedBrands: [],
      contextualFilters: {},
      minPrice: null,
      maxPrice: null,
      stockOnly: false,
      lowStockOnly: false
    };
    currentCategory = 'all';
    const minInput = document.getElementById('price-min-input');
    const maxInput = document.getElementById('price-max-input');
    if (minInput) minInput.value = '';
    if (maxInput) maxInput.value = '';
    updateCategoryActiveState();
    applyFiltersAndRender(true);
  };

  function renderActiveChips() {
    const container = document.getElementById('active-chips-container');
    const list = document.getElementById('active-chips-list');
    const clearBtn = document.getElementById('clear-all-filters-btn');
    if (!container || !list) return;

    const chips = [];

    if (currentCategory !== 'all') {
      chips.push({ label: `Categoría: ${currentCategory}`, remove: () => { currentCategory = 'all'; updateCategoryActiveState(); } });
    }
    if (facetedState.subcategory) {
      chips.push({ label: `Subcat: ${facetedState.subcategory}`, remove: () => { facetedState.subcategory = null; } });
    }
    facetedState.selectedBrands.forEach(b => {
      chips.push({ label: `Marca: ${b}`, remove: () => { window.toggleBrandFilter(b); return false; } });
    });
    Object.keys(facetedState.contextualFilters).forEach(k => {
      const val = facetedState.contextualFilters[k];
      chips.push({ label: `${k}: ${val}`, remove: () => { delete facetedState.contextualFilters[k]; } });
    });
    if (facetedState.minPrice || facetedState.maxPrice) {
      const minText = facetedState.minPrice ? `$${formatPrice(facetedState.minPrice)}` : '$0';
      const maxText = facetedState.maxPrice ? `$${formatPrice(facetedState.maxPrice)}` : 'Máx';
      chips.push({ label: `Precio: ${minText} - ${maxText}`, remove: () => { window.setPricePreset(null, null); return false; } });
    }

    if (chips.length > 0) {
      container.style.display = 'flex';
      if (clearBtn) clearBtn.style.display = 'inline-block';
      list.innerHTML = chips.map((c, idx) => `
        <span class="filter-chip">
          ${c.label}
          <span class="filter-chip-remove" onclick="removeChipIndex(${idx})">&times;</span>
        </span>
      `).join('');

      window._activeChips = chips;
    } else {
      container.style.display = 'none';
      if (clearBtn) clearBtn.style.display = 'none';
    }
  }

  window.removeChipIndex = function(idx) {
    if (window._activeChips && window._activeChips[idx]) {
      const shouldRender = window._activeChips[idx].remove();
      if (shouldRender !== false) applyFiltersAndRender(true);
    }
  };

  window.toggleFacetAccordion = function(el) {
    const group = el.closest('.facet-group');
    if (group) group.classList.toggle('collapsed');
  };

  window.openMobileFilterDrawer = function() {
    const drawer = document.getElementById('mobile-filter-drawer');
    const body = document.getElementById('mobile-filter-drawer-body');
    const sourcePanel = document.getElementById('faceted-filter-panel');
    const catalogControls = document.querySelector('.catalog-header-controls');

    if (drawer && catalogControls && drawer.previousElementSibling !== catalogControls) {
      catalogControls.insertAdjacentElement('afterend', drawer);
    }

    // Move the real filter panel so controls keep their state and unique IDs.
    if (body && sourcePanel && sourcePanel.parentElement !== body) body.appendChild(sourcePanel);
    if (drawer) drawer.classList.add('active');
    drawer?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  window.closeMobileFilterDrawer = function() {
    const drawer = document.getElementById('mobile-filter-drawer');
    const sourcePanel = document.getElementById('faceted-filter-panel');
    const sidebarBlock = document.querySelector('#catalog-sidebar .sidebar-block');
    if (drawer) drawer.classList.remove('active');
    if (sourcePanel && sidebarBlock && sourcePanel.parentElement !== sidebarBlock) {
      sidebarBlock.appendChild(sourcePanel);
    }
  };

  window.applyMobileFilterDrawer = function() {
    applyFiltersAndRender(true);
    closeMobileFilterDrawer();
  };

  window.applyFacetedFilters = function() {
    applyFiltersAndRender(true);
  };

  function updateCategoryCounts() {
    const counts = { all: products.length };
    
    products.forEach(p => {
      const cat = p.category;
      if (cat) {
        counts[cat] = (counts[cat] || 0) + 1;
      }
    });

    document.querySelectorAll('.category-btn').forEach(btn => {
      const cat = btn.getAttribute('data-category');
      const countSpan = btn.querySelector('.facet-count');
      if (countSpan) {
        const num = cat === 'all' ? (counts.all || 0) : (counts[cat] || 0);
        countSpan.textContent = `(${num})`;
      }
    });

    const inStockCount = products.filter(p => p.available && p.stock > 0).length;
    const lowStockCount = products.filter(p => p.stock > 0 && p.stock <= 5).length;

    const countInStockEl = document.getElementById('count-stock-in');
    if (countInStockEl) countInStockEl.textContent = `(${inStockCount})`;

    const countLowStockEl = document.getElementById('count-stock-low');
    if (countLowStockEl) countLowStockEl.textContent = `(${lowStockCount})`;
  }

  // --- CATALOG FILTER & RENDER ENGINE ---
  function applyFiltersAndRender(resetPage = true) {
    if (resetPage) {
      currentPage = 1;
    }

    updateCategoryCounts();
    renderFacetedBrandsList();
    renderActiveChips();

    // 1. Filter by category
    if (currentCategory === 'all') {
      filteredProducts = [...products];
    } else {
      filteredProducts = products.filter(p => p.category === currentCategory);
    }

    // 2. Filter by search query
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase().trim();
      filteredProducts = filteredProducts.filter(p => 
        (p.name || '').toLowerCase().includes(query) || 
        (p.slug || '').toLowerCase().includes(query)
      );
    }

    // 3. Filter by Selected Brands (OR logic within brands)
    if (facetedState.selectedBrands.length > 0) {
      filteredProducts = filteredProducts.filter(p => {
        const facets = extractProductFacets(p);
        return facets.brand && facetedState.selectedBrands.includes(facets.brand);
      });
    }

    // 4. Filter by Subcategory
    if (facetedState.subcategory) {
      filteredProducts = filteredProducts.filter(p => {
        const facets = extractProductFacets(p);
        return facets.subcategory === facetedState.subcategory;
      });
    }

    // 5. Filter by Price Range
    const minInputVal = parseFloat(document.getElementById('price-min-input')?.value) || facetedState.minPrice;
    const maxInputVal = parseFloat(document.getElementById('price-max-input')?.value) || facetedState.maxPrice;

    if (minInputVal) {
      filteredProducts = filteredProducts.filter(p => p.price >= minInputVal);
    }
    if (maxInputVal) {
      filteredProducts = filteredProducts.filter(p => p.price <= maxInputVal);
    }

    // 6. Filter by Stock Availability
    const checkStockIn = document.getElementById('check-stock-in');
    const checkStockLow = document.getElementById('check-stock-low');

    if (checkStockIn && checkStockIn.checked) {
      filteredProducts = filteredProducts.filter(p => p.available && p.stock > 0);
    }
    if (checkStockLow && checkStockLow.checked) {
      filteredProducts = filteredProducts.filter(p => p.stock > 0 && p.stock <= 5);
    }

    // 7. Sort Products
    const sortVal = sortSelect.value;
    if (sortVal === 'price-asc') {
      filteredProducts.sort((a, b) => a.price - b.price);
    } else if (sortVal === 'price-desc') {
      filteredProducts.sort((a, b) => b.price - a.price);
    } else if (sortVal === 'name-asc') {
      filteredProducts.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortVal === 'sales-desc') {
      filteredProducts.sort((a, b) => (b.stock || 0) - (a.stock || 0));
    } else {
      const idToIndex = {};
      products.forEach((p, idx) => idToIndex[p.id] = idx);
      filteredProducts.sort((a, b) => idToIndex[a.id] - idToIndex[b.id]);
    }

    // Total Count Label
    totalCountEl.textContent = filteredProducts.length;
    const mobileApplyCount = document.getElementById('mobile-apply-count');
    if (mobileApplyCount) mobileApplyCount.textContent = filteredProducts.length;
    const mobileBadge = document.getElementById('mobile-filter-count-badge');
    if (mobileBadge) {
      const count = (facetedState.selectedBrands.length + (currentCategory !== 'all' ? 1 : 0));
      mobileBadge.textContent = count;
      mobileBadge.style.display = count > 0 ? 'inline-block' : 'none';
    }

    renderGrid();
  }

  function renderGrid() {
    productGrid.innerHTML = '';
    
    if (filteredProducts.length === 0) {
      noResults.style.display = 'flex';
      loadMoreContainer.style.display = 'none';
      displayedCountEl.textContent = '0';
      return;
    }

    noResults.style.display = 'none';

    // Paginate items
    const endIndex = currentPage * itemsPerPage;
    const itemsToRender = filteredProducts.slice(0, endIndex);
    
    displayedCountEl.textContent = itemsToRender.length;

    // Show/hide load more button
    if (endIndex < filteredProducts.length) {
      loadMoreContainer.style.display = 'flex';
    } else {
      loadMoreContainer.style.display = 'none';
    }

    // Render cards
    itemsToRender.forEach(product => {
      const stockNum = Number(product.stock !== undefined ? product.stock : (product.own_stock !== undefined ? product.own_stock : 0)) || 0;
      const hasPhysicalStock = stockNum > 0;
      const isLocalOrB2b = product.availability === 'LOCAL_2_DAYS' || product.availability === 'A_PEDIDO';
      const isAvailableToBuy = hasPhysicalStock || isLocalOrB2b;

      const card = document.createElement('article');
      card.className = `product-card ${!isAvailableToBuy ? 'out-of-stock' : ''}`;
      card.setAttribute('data-id', product.id);
      
      // Stock warning tags
      let stockTag = '';
      if (hasPhysicalStock) {
        if (stockNum <= 5) {
          stockTag = `<span class="stock-tag">Últimos ${stockNum}</span>`;
        } else {
          stockTag = '<span class="stock-tag tag-in-stock">🟢 En Stock</span>';
        }
      } else if (product.availability === 'LOCAL_2_DAYS' || product.badge_text?.includes('2 DÍAS')) {
        stockTag = '<span class="stock-tag tag-local-store">📦 Llega en 2 días</span>';
      } else if (product.availability === 'A_PEDIDO' || product.badge_text?.includes('5 días') || product.badge_text?.includes('PEDIDO')) {
        stockTag = '<span class="stock-tag tag-on-demand">📦 Solo por pedido · 5 días</span>';
      } else {
        stockTag = '<span class="stock-tag tag-out">Sin Stock</span>';
      }

      // Fallback image if empty
      const imageUrl = product.image && product.image !== '' ? product.image : 'assets/logo.jpg';
      const safeName = escapeHtml(product.name || 'Producto BÔ');
      const safeCategory = escapeHtml(product.category || 'Cultivo');

      // Weight badge if present
      let weightTag = '';
      if (product.weight) {
        weightTag = `<span class="product-card-weight-badge">${escapeHtml(product.weight)}</span>`;
      }

      card.innerHTML = `
        ${stockTag}
        <div class="product-card-img-wrapper">
          <div class="product-card-img-container">
            <img src="${imageUrl}" alt="${safeName}" class="product-card-img" loading="lazy" onerror="this.onerror=null;this.src='assets/logo.jpg';">
          </div>
        </div>
        <div class="product-card-content">
          <div class="product-card-category-row">
            <div class="product-card-category" style="margin-bottom: 0;">${safeCategory}</div>
            ${weightTag}
          </div>
          <h3 class="product-card-title" title="${safeName}">${safeName}</h3>
          <button type="button" class="product-card-detail-link" data-id="${product.id}" aria-label="Ver detalles de ${safeName}">Ver detalles</button>
          <div class="product-card-footer">
            <div class="product-card-price">$${formatPrice(product.price)}</div>
            <button class="add-to-cart-btn ${!isAvailableToBuy ? 'disabled' : ''}" 
                    data-id="${product.id}" 
                    aria-label="Agregar ${safeName} al carrito"
                    ${!isAvailableToBuy ? 'disabled' : ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span class="add-to-cart-label">Agregar</span>
            </button>
          </div>
        </div>
      `;
      productGrid.appendChild(card);
    });
  }

  // Formatting utilities
  function formatPrice(number) {
    return number.toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[character]));
  }


  // --- SEARCH & SORT ACTIONS ---
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      if (clearSearchBtn) {
        clearSearchBtn.style.display = searchQuery.trim() !== '' ? 'block' : 'none';
      }
      applyFiltersAndRender(true);
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      searchQuery = '';
      clearSearchBtn.style.display = 'none';
      applyFiltersAndRender(true);
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      applyFiltersAndRender(false);
    });
  }

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      currentPage++;
      renderGrid();
    });
  }

  if (resetSearchBtn) {
    resetSearchBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      searchQuery = '';
      if (clearSearchBtn) clearSearchBtn.style.display = 'none';
      currentCategory = 'all';
      updateCategoryActiveState();
      applyFiltersAndRender(true);
    });
  }


  // --- CATEGORY PILLS FILTER ---
  categoryButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      currentCategory = btn.getAttribute('data-category');
      updateCategoryActiveState();
      applyFiltersAndRender(true);
      if (btn.classList.contains('home-category-btn')) {
        document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
      } else if (btn.closest('#mobile-filter-drawer')) {
        closeMobileFilterDrawer();
      }
    });
  });

  function updateCategoryActiveState() {
    categoryButtons.forEach(btn => {
      if (btn.getAttribute('data-category') === currentCategory) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // Remove Category badge
  if (removeFilterBtn) {
    removeFilterBtn.addEventListener('click', () => {
      currentCategory = 'all';
      updateCategoryActiveState();
      applyFiltersAndRender(true);
    });
  }


  // --- CART DRAWER ACTIONS ---
  function showInlineStorefrontView(element) {
    if (!element) return;
    const catalog = document.getElementById('catalog-section');
    if (catalog) catalog.insertAdjacentElement('beforebegin', element);
    element.scrollIntoView({ behavior: 'auto', block: 'start' });
  }

  function updateStorefrontUtilityRail() {
    const totalQty = cart.reduce((acc, item) => acc + item.quantity, 0);
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    if (railCartCount) railCartCount.textContent = `${totalQty} ${totalQty === 1 ? 'artículo' : 'artículos'}`;
    if (railCartTotal) railCartTotal.textContent = `$${formatPrice(subtotal)}`;
    if (railCartMessage) {
      railCartMessage.textContent = totalQty > 0
        ? 'Tu selección queda guardada mientras seguís recorriendo la tienda.'
        : 'Agregá productos y revisá el pedido sin salir del catálogo.';
    }
  }

  function updateCartBadge() {
    const totalQty = cart.reduce((acc, item) => acc + item.quantity, 0);
    if (cartCountEl) cartCountEl.textContent = totalQty;
    const mobileCartCountEl = document.getElementById('mobile-cart-count');
    if (mobileCartCountEl) {
      mobileCartCountEl.textContent = totalQty;
    }
    updateStorefrontUtilityRail();
  }

  function toggleCart() {
    if (cartDrawer) cartDrawer.classList.toggle('active');
    if (cartOverlay) cartOverlay.classList.remove('active');
    
    if (cartDrawer && cartDrawer.classList.contains('active')) {
      productDetailModal?.classList.remove('active');
      checkoutModal?.classList.remove('active');
      renderCartItems();
      setActiveMobileNav('mobile-cart-btn');
      showInlineStorefrontView(cartDrawer);
    } else if (window.innerWidth <= 900) {
      setActiveMobileNav('mobile-store-btn');
    }
  }

  if (cartTrigger) cartTrigger.addEventListener('click', toggleCart);
  if (cartClose) cartClose.addEventListener('click', toggleCart);
  if (cartOverlay) cartOverlay.addEventListener('click', toggleCart);
  if (emptyCartShopBtn) emptyCartShopBtn.addEventListener('click', toggleCart);
  if (railOpenCartBtn) railOpenCartBtn.addEventListener('click', toggleCart);
  if (railOpenClubBtn) {
    railOpenClubBtn.addEventListener('click', () => document.getElementById('club-trigger')?.click());
  }

  function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existingItem = cart.find(item => item.id === productId);
    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      cart.push({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        category: product.category,
        quantity: 1
      });
    }

    localStorage.setItem('boeweb_cart', JSON.stringify(cart));
    updateCartBadge();
    
    renderCartItems();
    if (window.showToast) window.showToast('Producto agregado al carrito');
  }

  function updateCartQty(productId, delta) {
    const item = cart.find(i => i.id === productId);
    if (!item) return;

    item.quantity += delta;
    if (item.quantity <= 0) {
      // remove
      cart = cart.filter(i => i.id !== productId);
    }

    localStorage.setItem('boeweb_cart', JSON.stringify(cart));
    updateCartBadge();
    renderCartItems();
  }

  function removeCartItem(productId) {
    cart = cart.filter(i => i.id !== productId);
    localStorage.setItem('boeweb_cart', JSON.stringify(cart));
    updateCartBadge();
    renderCartItems();
  }

  function renderCartItems() {
    cartItemsContainer.innerHTML = '';
    
    // Check coupon banner visibility
    if (appliedCoupon) {
      cartCouponBanner.style.display = 'flex';
      appliedCouponCodeEl.textContent = appliedCoupon.code;
      appliedCouponDescEl.textContent = appliedCoupon.desc;
    } else {
      cartCouponBanner.style.display = 'none';
    }

    if (cart.length === 0) {
      emptyCartStateEl.style.display = 'flex';
      cartFooter.style.display = 'none';
      updateStorefrontUtilityRail();
      return;
    }

    emptyCartStateEl.style.display = 'none';
    cartFooter.style.display = 'block';

    let subtotal = 0;

    cart.forEach(item => {
      subtotal += item.price * item.quantity;
      const imageUrl = item.image && item.image !== '' ? item.image : 'assets/logo.jpg';
      
      const itemEl = document.createElement('div');
      itemEl.className = 'cart-item';
      itemEl.innerHTML = `
        <img src="${imageUrl}" alt="${item.name}" class="cart-item-img" onerror="this.onerror=null;this.src='assets/logo.jpg';">
        <div class="cart-item-info">
          <h4 class="cart-item-title">${item.name}</h4>
          <div class="cart-item-price">$${formatPrice(item.price)}</div>
          <div class="cart-item-actions">
            <div class="quantity-selector">
              <button class="qty-btn qty-minus" data-id="${item.id}">&minus;</button>
              <span class="qty-value">${item.quantity}</span>
              <button class="qty-btn qty-plus" data-id="${item.id}">&plus;</button>
            </div>
            <button class="remove-item-btn" data-id="${item.id}" aria-label="Eliminar item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon" style="width:16px; height:16px;">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          </div>
        </div>
      `;
      cartItemsContainer.appendChild(itemEl);
    });

    // Totals calculations
    let discount = 0;
    let discountLabel = "Descuento";
    
    if (appliedCoupon) {
      if (appliedCoupon.type === 'percent' || appliedCoupon.type === 'wisdom') {
        discount = subtotal * (appliedCoupon.value || 0.05);
      }
    } else {
      const memberDiscountPct = getMemberDiscountPercent();
      if (memberDiscountPct > 0) {
        discount = subtotal * memberDiscountPct;
        discountLabel = `Descuento Club (${getMemberTierName()})`;
      }
    }

    const total = Math.max(0, subtotal - discount);

    cartSubtotalEl.textContent = `$${formatPrice(subtotal)}`;
    if (cartDiscountLabelEl) {
      cartDiscountLabelEl.textContent = discountLabel;
    }
    
    if (discount > 0) {
      cartDiscountRow.style.display = 'flex';
      cartDiscountEl.textContent = `-$${formatPrice(discount)}`;
    } else if (appliedCoupon && appliedCoupon.type === 'shipping') {
      cartDiscountRow.style.display = 'flex';
      cartDiscountEl.textContent = 'Envío Gratis';
      if (cartDiscountLabelEl) {
        cartDiscountLabelEl.textContent = 'Envío';
      }
    } else {
      cartDiscountRow.style.display = 'none';
    }

    cartTotalEl.textContent = `$${formatPrice(total)}`;
    updateStorefrontUtilityRail();

    // Quantity selectors events
    cartItemsContainer.querySelectorAll('.qty-minus').forEach(btn => {
      btn.addEventListener('click', () => updateCartQty(btn.getAttribute('data-id'), -1));
    });
    cartItemsContainer.querySelectorAll('.qty-plus').forEach(btn => {
      btn.addEventListener('click', () => updateCartQty(btn.getAttribute('data-id'), 1));
    });
    cartItemsContainer.querySelectorAll('.remove-item-btn').forEach(btn => {
      btn.addEventListener('click', () => removeCartItem(btn.getAttribute('data-id')));
    });
  }

  // Remove Coupon Event
  if (removeCouponBtn) {
    removeCouponBtn.addEventListener('click', () => {
      appliedCoupon = null;
      localStorage.removeItem('boeweb_applied_coupon');
      renderCartItems();
    });
  }


  // --- CHECKOUT FORM & REDIRECTION ---
  function openCheckout() {
    // Hide cart drawer
    cartDrawer.classList.remove('active');
    cartOverlay.classList.remove('active');

    // Populate checkout values
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    let discount = 0;
    let discountLabel = "Descuento aplicado:";
    
    if (appliedCoupon) {
      if (appliedCoupon.type === 'percent' || appliedCoupon.type === 'wisdom') {
        discount = subtotal * (appliedCoupon.value || 0.05);
      }
    } else {
      const memberDiscountPct = getMemberDiscountPercent();
      if (memberDiscountPct > 0) {
        discount = subtotal * memberDiscountPct;
        discountLabel = `Descuento Club (${getMemberTierName()}):`;
      }
    }
    const total = Math.max(0, subtotal - discount);
    const totalQty = cart.reduce((acc, item) => acc + item.quantity, 0);

    summaryItemsCount.textContent = totalQty;
    summarySubtotal.textContent = `$${formatPrice(subtotal)}`;
    
    if (summaryDiscountLabel) {
      summaryDiscountLabel.textContent = discountLabel;
    }
    
    if (discount > 0) {
      summaryDiscountRow.style.display = 'flex';
      summaryDiscount.textContent = `-$${formatPrice(discount)}`;
    } else if (appliedCoupon && appliedCoupon.type === 'shipping') {
      summaryDiscountRow.style.display = 'flex';
      summaryDiscount.textContent = 'Gratis';
      if (summaryDiscountLabel) {
        summaryDiscountLabel.textContent = 'Envío:';
      }
    } else {
      summaryDiscountRow.style.display = 'none';
    }
    
    summaryTotal.textContent = `$${formatPrice(total)}`;

    // Open Modal
    checkoutModal.classList.add('active');
    showInlineStorefrontView(checkoutModal);
  }

  function closeCheckout() {
    checkoutModal.classList.remove('active');
  }

  checkoutTriggerBtn.addEventListener('click', openCheckout);
  closeCheckoutModal.addEventListener('click', closeCheckout);

  // Delivery toggle (shipping address show/hide)
  checkoutDeliverySelect.addEventListener('change', (e) => {
    if (e.target.value === 'shipping') {
      addressGroup.style.display = 'block';
      checkoutAddressInput.setAttribute('required', 'required');
    } else {
      addressGroup.style.display = 'none';
      checkoutAddressInput.removeAttribute('required');
    }
  });

  // Submit form and handle payment gateway / WhatsApp
  checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('checkout-name').value.trim();
    const phone = document.getElementById('checkout-phone').value.trim();
    const deliveryType = checkoutDeliverySelect.value;
    const payment = document.getElementById('checkout-payment').value;
    const address = checkoutAddressInput.value.trim();
    const notes = document.getElementById('checkout-notes').value.trim();

    let subtotal = 0;
    cart.forEach(item => {
      subtotal += item.price * item.quantity;
    });

    let discount = 0;
    let discountLabel = "Descuento";
    if (appliedCoupon) {
      if (appliedCoupon.type === 'percent' || appliedCoupon.type === 'wisdom') {
        discount = subtotal * (appliedCoupon.value || 0.05);
        discountLabel = `Descuento (Cupón: ${appliedCoupon.code})`;
      }
    } else {
      const memberDiscountPct = getMemberDiscountPercent();
      if (memberDiscountPct > 0) {
        discount = subtotal * memberDiscountPct;
        discountLabel = `Descuento Club BÔ (${getMemberTierName()})`;
      }
    }
    const total = Math.max(0, subtotal - discount);
    const orderId = 'BO-' + Math.floor(100000 + Math.random() * 900000);

    // Save order history locally
    let orderHistory = [];
    try {
      orderHistory = JSON.parse(localStorage.getItem('boeweb_order_history')) || [];
    } catch (e) {
      orderHistory = [];
    }
    let currentMember = null;
    try {
      currentMember = JSON.parse(localStorage.getItem('boeweb_member'));
    } catch (e) {
      currentMember = null;
    }
    const newOrder = {
      id: orderId,
      order_id: orderId,
      date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      email: currentMember ? currentMember.email : '',
      phone: phone,
      name: name,
      customer_name: name,
      customer_phone: phone,
      deliveryType: deliveryType,
      delivery_type: deliveryType,
      address: deliveryType === 'shipping' ? (address || '') : 'Retiro por el local',
      notes: notes || '',
      items: cart.map(i => ({
        id: i.id,
        product_code: i.product_code || i.id,
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        image: i.image || i.image_url || 'assets/logo.jpg'
      })),
      subtotal: subtotal,
      discount: discount,
      total: total,
      total_amount: total,
      paymentMethod: payment,
      payment_method: payment,
      status: payment.includes('Mercado') ? 'Pendiente Mercado Pago' : 'Pendiente Vendedor',
      source: 'WEB'
    };
    orderHistory.unshift(newOrder);
    localStorage.setItem('boeweb_order_history', JSON.stringify(orderHistory));

    // Save for store vendor mediation
    try {
      let webOrders = JSON.parse(localStorage.getItem('boeweb_web_orders') || '[]');
      webOrders.unshift(newOrder);
      localStorage.setItem('boeweb_web_orders', JSON.stringify(webOrders));
    } catch (_) {}

    // Save to Supabase orders table if client available
    if (window.supabase) {
      try {
        const client = window.supabase.createClient('https://sxbhrgvizqylnfcqzhin.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4YmhyZ3ZpenF5bG5mY3F6aGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMjM1MzEsImV4cCI6MjA5Njg5OTUzMX0.UUOwXsHXKNCjlJKdxMUlAuCtNAnNWgAroBwMlWAdTag');
        await client.from('orders').insert([{
          order_id: orderId,
          customer_name: name,
          customer_phone: phone,
          delivery_type: deliveryType,
          payment_method: payment,
          total_amount: total,
          items_json: newOrder.items,
          notes: notes || '',
          status: newOrder.status,
          created_at: new Date().toISOString()
        }]);
      } catch (sbErr) {
        console.warn('Could not record order in Supabase orders table:', sbErr);
      }
    }

    // Load admin payment gateway config (with Supabase store_config cloud sync)
    let config = JSON.parse(localStorage.getItem('boeweb_payment_config')) || {};
    if (!config.mpAccessToken && typeof supabaseClient !== 'undefined' && supabaseClient) {
      try {
        const { data: scData } = await supabaseClient.from('store_config').select('*').eq('id', 'main_config').maybeSingle();
        if (scData && scData.config_json) {
          config = { ...config, ...scData.config_json };
          try { localStorage.setItem('boeweb_payment_config', JSON.stringify(config)); } catch (_) {}
        }
      } catch (_) {}
    }

    // 1. MERCADO PAGO AUTOMATED CHECKOUT
    if (payment.includes('Mercado Pago')) {
      const mpToken = (config.mpAccessToken || '').trim();
      if (!mpToken) {
        alert('⚠️ El Administrador aún no configuró el Access Token de Mercado Pago. Podés ingresar a admin-config.html para configurarlo o seleccionar otro método de pago.');
        return;
      }

      try {
        const submitBtn = checkoutForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = '⏳ Conectando con Mercado Pago...';

        // Guardar detalles del pedido para mostrarlos al volver de Mercado Pago
        try {
          localStorage.setItem('boeweb_last_mp_order', JSON.stringify({
            orderId: orderId,
            customerName: name,
            customerPhone: phone,
            items: cart.map(i => ({ id: i.id, name: i.name, quantity: i.quantity, price: i.price })),
            subtotal: subtotal,
            discount: discount,
            total: total,
            address: address,
            deliveryType: deliveryType,
            timestamp: new Date().toISOString()
          }));
        } catch (_) {}

        const pref = await window.createMercadoPagoPreference({
          orderId: orderId,
          customerName: name,
          customerPhone: phone,
          items: cart.map(i => ({ id: i.id, name: i.name, quantity: i.quantity, price: i.price }))
        }, mpToken);

        // Clear cart
        cart = [];
        localStorage.removeItem('boeweb_cart');
        updateCartBadge();
        appliedCoupon = null;
        localStorage.removeItem('boeweb_applied_coupon');
        closeCheckout();

        // Redirect customer to Mercado Pago Payment URL
        window.location.href = pref.init_point || pref.sandbox_init_point;
        return;
      } catch (mpErr) {
        alert('Error al conectar con Mercado Pago: ' + mpErr.message);
        const submitBtn = checkoutForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'Confirmar Pedido';
        return;
      }
    }

    // 2. BANK TRANSFER AUTOMATED DISPLAY
    if (payment.includes('Transferencia')) {
      const bankName = config.bankName || 'Banco Galicia';
      const bankHolder = config.bankHolder || 'BÔ GROWCLUB S.A.';
      const bankCbu = config.bankCbu || '0000003100012345678901';
      const bankAlias = config.bankAlias || 'BO.GROWCLUB.MP';

      let bankMsg = `✨ *BO growclub - Datos de Transferencia* ✨\n\n`;
      bankMsg += `📦 *Pedido N°:* ${orderId}\n`;
      bankMsg += `💰 *Monto a transferir:* $${formatPrice(total)}\n\n`;
      bankMsg += `🏦 *Banco:* ${bankName}\n`;
      bankMsg += `👤 *Titular:* ${bankHolder}\n`;
      bankMsg += `🔢 *CBU/CVU:* ${bankCbu}\n`;
      bankMsg += `🏷️ *Alias:* ${bankAlias}\n\n`;
      bankMsg += `Al realizar la transferencia, envianos el comprobante por WhatsApp.`;

      const waPhone = "5493813023185";
      const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(bankMsg)}`;
      
      // Descontar stock inmediatamente para reserva
      deductWebOrderStock(newOrder.items, orderId);
      newOrder.stock_deducted = true;

      cart = [];
      localStorage.removeItem('boeweb_cart');
      updateCartBadge();
      appliedCoupon = null;
      localStorage.removeItem('boeweb_applied_coupon');
      closeCheckout();
      
      // Abrir WhatsApp en ventana aparte y mostrar comprobante en la web
      window.open(waUrl, '_blank');
      showWebOrderReceipt(newOrder, waUrl);
      return;
    }

    // 3. WHATSAPP DIRECT CHECKOUT
    let msg = `✨ *Nuevo Pedido - BO growclub* ✨\n\n`;
    msg += `📦 *Pedido N°:* ${orderId}\n`;
    msg += `👤 *Cliente:* ${name}\n`;
    msg += `📞 *Teléfono:* ${phone}\n`;
    msg += `🚚 *Entrega:* ${deliveryType === 'shipping' ? 'Envío a domicilio' : 'Retiro por el local'}\n`;
    if (deliveryType === 'shipping') msg += `📍 *Dirección:* ${address}\n`;
    msg += `💳 *Método de pago:* ${payment}\n`;
    if (appliedCoupon) msg += `🎫 *Cupón:* ${appliedCoupon.code} (${appliedCoupon.desc})\n`;

    msg += `\n🛒 *Detalle del Pedido:*\n`;
    cart.forEach(item => {
      msg += `- ${item.quantity}x ${item.name} ($${formatPrice(item.price)} c/u)\n`;
    });

    msg += `\n💰 *Subtotal:* $${formatPrice(subtotal)}\n`;
    if (discount > 0) msg += `📉 *${discountLabel}:* -$${formatPrice(discount)}\n`;
    msg += `✨ *Total final:* $${formatPrice(total)}\n`;
    if (notes !== '') msg += `\n💬 *Notas:* ${notes}\n`;
    msg += `\n¡Muchas gracias! 🙏`;

    const waPhone = "5493813023185";
    const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`;

    // Descontar stock inmediatamente para reserva
    deductWebOrderStock(newOrder.items, orderId);
    newOrder.stock_deducted = true;

    cart = [];
    localStorage.removeItem('boeweb_cart');
    updateCartBadge();
    appliedCoupon = null;
    localStorage.removeItem('boeweb_applied_coupon');
    closeCheckout();

    // Abrir WhatsApp en ventana aparte y mostrar comprobante interactivo
    window.open(waUrl, '_blank');
    showWebOrderReceipt(newOrder, waUrl);
  });

  function deductWebOrderStock(items, orderId) {
    try {
      const rawCatalog = JSON.parse(localStorage.getItem('boeweb_internal_catalog') || '[]');
      let catalogChanged = false;

      items.forEach(soldItem => {
        const code = String(soldItem.product_id || soldItem.id || soldItem.product_code || '');
        const barcode = String(soldItem.barcode || '');
        const name = String(soldItem.name || '').toLowerCase();
        const qty = Math.max(1, Number(soldItem.quantity) || 1);

        if (Array.isArray(rawCatalog)) {
          const intP = rawCatalog.find(p =>
            (code && (String(p.id) === code || String(p.product_code) === code)) ||
            (barcode && p.barcode === barcode) ||
            (name && p.name && p.name.toLowerCase() === name)
          );
          if (intP) {
            const prev = Number(intP.stock || 0);
            intP.stock = Math.max(0, prev - qty);
            intP.available = intP.stock > 0;
            catalogChanged = true;
          }
        }

        try {
          const rawLocs = JSON.parse(localStorage.getItem('boeweb_product_locations') || '[]');
          if (Array.isArray(rawLocs)) {
            const loc = rawLocs.find(l =>
              (code && (String(l.product_code) === code || String(l.product_id) === code)) ||
              (barcode && l.barcode === barcode) ||
              (name && l.name && l.name.toLowerCase() === name)
            );
            if (loc) {
              loc.stock = Math.max(0, Number(loc.stock || 0) - qty);
              localStorage.setItem('boeweb_product_locations', JSON.stringify(rawLocs));
            }
          }
        } catch (_) {}
      });

      if (catalogChanged) {
        localStorage.setItem('boeweb_internal_catalog', JSON.stringify(rawCatalog));
      }
    } catch (e) {
      console.warn('Error al descontar stock en pedido web:', e);
    }
  }

  let currentReceiptOrder = null;

  function showWebOrderReceipt(order, waUrl) {
    currentReceiptOrder = order;
    const modal = document.getElementById('web-order-receipt-modal');
    if (!modal) return;

    const idEl = document.getElementById('receipt-order-id');
    const dateEl = document.getElementById('receipt-date');
    const nameEl = document.getElementById('receipt-customer-name');
    const phoneEl = document.getElementById('receipt-customer-phone');
    const deliveryEl = document.getElementById('receipt-delivery-type');
    const paymentEl = document.getElementById('receipt-payment-method');
    const itemsListEl = document.getElementById('receipt-items-list');
    const subtotalEl = document.getElementById('receipt-subtotal');
    const discountRow = document.getElementById('receipt-discount-row');
    const discountLabel = document.getElementById('receipt-discount-label');
    const discountEl = document.getElementById('receipt-discount');
    const totalEl = document.getElementById('receipt-total');
    const waLinkEl = document.getElementById('receipt-whatsapp-link');

    if (idEl) idEl.textContent = order.order_id || order.id;
    if (dateEl) dateEl.textContent = new Date(order.created_at || order.date).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
    if (nameEl) nameEl.textContent = order.customer_name || order.name || 'Cliente';
    if (phoneEl) phoneEl.textContent = order.customer_phone || order.phone || '-';
    if (deliveryEl) {
      deliveryEl.textContent = order.delivery_type === 'shipping' || order.deliveryType === 'shipping'
        ? `🚚 Envío a Domicilio: ${order.address || 'Sin especificar'}`
        : '🏬 Retiro por el Local (BÔ Grow Club)';
    }
    if (paymentEl) paymentEl.textContent = order.payment_method || order.paymentMethod || 'Coordinar por WhatsApp';

    if (itemsListEl) {
      const items = order.items || [];
      itemsListEl.innerHTML = items.map(it => `
        <li style="display: flex; justify-content: space-between; align-items: center; font-size: 0.84rem; padding: 4px 0; border-bottom: 1px dashed rgba(255,255,255,0.08);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${it.image || 'assets/logo.jpg'}" alt="${it.name}" style="width: 28px; height: 28px; object-fit: contain; border-radius: 4px; background: #000;" onerror="this.onerror=null;this.src='assets/logo.jpg';">
            <span><strong>${it.quantity}x</strong> ${it.name}</span>
          </div>
          <strong style="color: var(--color-accent-gold);">$${formatPrice(Number(it.price || 0) * Number(it.quantity || 1))}</strong>
        </li>
      `).join('');
    }

    if (subtotalEl) subtotalEl.textContent = `$${formatPrice(order.subtotal || order.total)}`;
    if (discountRow) {
      if (order.discount && Number(order.discount) > 0) {
        discountRow.style.display = 'flex';
        if (discountLabel) discountLabel.textContent = `Descuento:`;
        if (discountEl) discountEl.textContent = `-$${formatPrice(order.discount)}`;
      } else {
        discountRow.style.display = 'none';
      }
    }
    if (totalEl) totalEl.textContent = `$${formatPrice(order.total || order.total_amount)}`;
    if (waLinkEl) waLinkEl.href = waUrl;

    modal.style.display = 'flex';
  }

  function closeWebOrderReceipt() {
    const modal = document.getElementById('web-order-receipt-modal');
    if (modal) modal.style.display = 'none';
  }
  window.closeWebOrderReceipt = closeWebOrderReceipt;

  function printWebOrderReceipt() {
    if (!currentReceiptOrder) return;
    const o = currentReceiptOrder;
    const itemsHtml = (o.items || []).map(it => `
      <tr>
        <td style="padding: 6px; border-bottom: 1px solid #ddd;">${it.quantity}x ${it.name}</td>
        <td style="padding: 6px; text-align: right; border-bottom: 1px solid #ddd;">$${formatPrice(Number(it.price || 0) * Number(it.quantity || 1))}</td>
      </tr>
    `).join('');

    const printContent = `
      <html>
        <head>
          <title>Comprobante de Pre-compra #${o.order_id || o.id} - BÔ Grow Club</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #333; max-width: 500px; margin: auto; }
            .header { text-align: center; border-bottom: 2px solid #2e7d32; padding-bottom: 12px; margin-bottom: 16px; }
            .title { font-size: 20px; font-weight: 800; color: #1b5e20; margin: 0; }
            .sub { font-size: 12px; color: #666; margin-top: 4px; }
            .info { font-size: 13px; margin-bottom: 16px; line-height: 1.5; background: #f9f9f9; padding: 12px; border-radius: 8px; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px; }
            .totals { font-size: 14px; text-align: right; margin-top: 8px; line-height: 1.6; }
            .badge { display: inline-block; background: #e8f5e9; color: #2e7d32; border: 1px solid #81c784; padding: 4px 8px; border-radius: 6px; font-weight: 700; font-size: 11px; margin-top: 4px; }
            .note { font-size: 11px; color: #777; margin-top: 24px; text-align: center; border-top: 1px solid #eee; padding-top: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">BÔ GROW CLUB</div>
            <div class="sub">Comprobante de Pre-compra y Reserva de Stock</div>
            <span class="badge">RESERVA PENDIENTE DE PAGO / RETIRO</span>
          </div>
          <div class="info">
            <div><strong>Orden:</strong> #${o.order_id || o.id}</div>
            <div><strong>Fecha:</strong> ${new Date(o.created_at || o.date).toLocaleString('es-AR')}</div>
            <div><strong>Cliente:</strong> ${o.customer_name || o.name || 'Cliente'}</div>
            <div><strong>Teléfono:</strong> ${o.customer_phone || o.phone || '-'}</div>
            <div><strong>Entrega:</strong> ${o.delivery_type === 'shipping' ? `Envío a domicilio (${o.address || ''})` : 'Retiro por el local'}</div>
            <div><strong>Método de pago:</strong> ${o.payment_method || 'Coordinar por WhatsApp'}</div>
          </div>
          <table>
            <thead>
              <tr style="background: #eee; font-weight: 700;">
                <th style="padding: 6px; text-align: left;">Producto</th>
                <th style="padding: 6px; text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          <div class="totals">
            <div>Subtotal: $${formatPrice(o.subtotal || o.total)}</div>
            ${o.discount ? `<div style="color: #2e7d32;">Descuento: -$${formatPrice(o.discount)}</div>` : ''}
            <div style="font-size: 18px; font-weight: 900; margin-top: 6px; color: #1b5e20;">Total Final: $${formatPrice(o.total || o.total_amount)}</div>
          </div>
          <div class="note">
            Presentá este comprobante o envialo a nuestro WhatsApp (+54 9 3813 02-3185) junto con tu comprobante de pago para retirar o coordinar el envío.<br>
            ¡Muchas gracias por cultivar con BÔ Grow Club!
          </div>
        </body>
      </html>
    `;
    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.write(printContent);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => { printWin.print(); }, 350);
    }
  }
  window.printWebOrderReceipt = printWebOrderReceipt;
  });

  // Global Helper: Add Gift Item to Cart ($0)
  window.addGiftToCart = function(giftProduct) {
    const existing = cart.find(i => i.id === giftProduct.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({
        id: giftProduct.id,
        name: giftProduct.name,
        price: 0,
        image: giftProduct.image,
        quantity: 1,
        available: true
      });
    }
    saveCart();
    updateCartBadge();
    renderCart();
  };

  // Global Helper: Reorder Items from History
  window.reorderItems = function(itemsList) {
    itemsList.forEach(histItem => {
      const matchProd = products.find(p => p.name === histItem.name);
      if (matchProd) {
        addToCart(matchProd, histItem.quantity);
      }
    });
    openCart();
  };


  // --- ZEN DISCOUNT WHEEL GAME ENGINE ---
  let isSpinning = false;

  function openWheel() {
    // Check if player has already spun today
    const lastSpinDate = localStorage.getItem('boeweb_last_spin_date');
    const today = new Date().toDateString();
    
    // If they already spun today, show result directly
    if (lastSpinDate === today) {
      let savedCoupon = null;
      try {
        savedCoupon = JSON.parse(localStorage.getItem('boeweb_applied_coupon'));
      } catch (e) {
        savedCoupon = null;
      }
      if (savedCoupon) {
        showWheelResult(savedCoupon, false);
      } else {
        // spun today but coupon got removed or quote was won
        showWheelResult({ code: 'ZEN-CULTIVA', desc: '5% de Descuento Especial', value: 0.05, type: 'percent' }, false);
      }
      wheelModal.classList.add('active');
      return;
    }

    // Otherwise, show intro form
    wheelIntro.style.display = 'block';
    wheelGame.style.display = 'none';
    wheelResult.style.display = 'none';
    wheelModal.classList.add('active');
  }

  function closeWheel() {
    if (isSpinning) return; // Cannot close while spinning
    wheelModal.classList.remove('active');
    sessionStorage.setItem('boeweb_wheel_closed', 'true');
  }

  // Bind Open/Close
  wheelTriggerHero.addEventListener('click', openWheel);
  floatingWheelBtn.addEventListener('click', openWheel);
  closeWheelModal.addEventListener('click', closeWheel);

  // The benefit remains user-initiated from the hero to avoid interrupting browsing.

  // Wheel form submit -> transition to Game
  wheelForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = wheelUsername.value.trim();
    spinnerPlayerName.textContent = username;
    
    // Transition
    wheelIntro.style.display = 'none';
    wheelGame.style.display = 'block';
  });

  // Spin Action Math and Animation
  spinActionBtn.addEventListener('click', () => {
    if (isSpinning) return;
    isSpinning = true;
    spinActionBtn.disabled = true;

    // Pick segment based on weighted probabilities:
    // 5% Off (Index 0, 7) - High (35%)
    // 10% Off (Index 1, 8) - Medium (25%)
    // 15% Off (Index 4) - Low/Rare (5%)
    // Envío Gratis (Index 3, 9) - Medium (15%)
    // Regalo Sorpresa (Index 5, 10) - Low (10%)
    // Wisdom Quote (Index 2, 6, 11) - Medium (10%)
    
    const randomVal = Math.random() * 100;
    let targetIndex = 0; // fallback

    if (randomVal < 35) {
      // 5% Off -> choose index 0 or 7
      targetIndex = Math.random() < 0.5 ? 0 : 7;
    } else if (randomVal < 60) {
      // 10% Off -> choose index 1 or 8
      targetIndex = Math.random() < 0.5 ? 1 : 8;
    } else if (randomVal < 75) {
      // Envío gratis -> index 3 or 9
      targetIndex = Math.random() < 0.5 ? 3 : 9;
    } else if (randomVal < 85) {
      // Regalo -> index 5 or 10
      targetIndex = Math.random() < 0.5 ? 5 : 10;
    } else if (randomVal < 95) {
      // Wisdom -> index 2, 6 or 11
      const rand = Math.random();
      targetIndex = rand < 0.33 ? 2 : (rand < 0.66 ? 6 : 11);
    } else {
      // 15% Off -> index 4
      targetIndex = 4;
    }

    const wonSlice = wheelSlices[targetIndex];

    // Math for wheel rotation:
    // Each slice is 30 degrees. Slices are 0 to 11.
    // Slice center is: idx * 30 + 15 degrees.
    // To align the won segment center with the indicator (pointing top at 0 degrees), 
    // we need to rotate the wheel clockwise by `360 - (idx * 30 + 15)` degrees.
    // Adding 5 full rotations (1800 deg) for effect:
    const sliceAngle = targetIndex * 30 + 15;
    const spinDegrees = 1800 + (360 - sliceAngle);

    // Apply rotation transition
    wheelInnerGroup.style.transform = `rotate(${spinDegrees}deg)`;

    // Wait for transition duration (6000ms in CSS transition)
    setTimeout(() => {
      isSpinning = false;
      spinActionBtn.disabled = false;
      
      // Store state so they cannot spin again today
      localStorage.setItem('boeweb_last_spin_date', new Date().toDateString());
      
      // Apply the coupon to state
      appliedCoupon = {
        code: wonSlice.code,
        desc: wonSlice.desc,
        value: wonSlice.value,
        type: wonSlice.type
      };
      
      // Save applied coupon
      localStorage.setItem('boeweb_applied_coupon', JSON.stringify(appliedCoupon));
      
      // If it's a Wisdom quote, pick a random quote to show
      if (wonSlice.type === 'wisdom') {
        const randomQuote = zenQuotes[Math.floor(Math.random() * zenQuotes.length)];
        appliedCoupon.quote = randomQuote;
      }

      // Show Results screen
      showWheelResult(appliedCoupon, true);
    }, 6100);
  });

  function showWheelResult(coupon, animateResult = true) {
    wheelIntro.style.display = 'none';
    wheelGame.style.display = 'none';
    wheelResult.style.display = 'block';

    // Set title/headline
    if (coupon.type === 'wisdom') {
      resultHeadline.textContent = '¡El universo te regala sabiduría!';
      wisdomQuoteBox.style.display = 'block';
      quoteTextEl.textContent = `"${coupon.quote ? coupon.quote.text : 'La paz viene de adentro.'}"`;
      quoteAuthorEl.textContent = coupon.quote ? `- ${coupon.quote.author}` : '- Buda';
      couponCodeDisplay.textContent = 'SABIDURIA';
      couponDescDisplay.textContent = 'Mensaje Zen y 5% de Descuento en tu compra';
    } else {
      resultHeadline.textContent = '¡El universo te ha bendecido!';
      wisdomQuoteBox.style.display = 'none';
      couponCodeDisplay.textContent = coupon.code;
      couponDescDisplay.textContent = coupon.desc;
    }

    // Refresh cart in case drawer is open or changes are active
    renderCartItems();
  }

  // Claim Coupon Button action
  claimCouponBtn.addEventListener('click', () => {
    closeWheel();
    // Open cart so they see the coupon applied!
    if (!cartDrawer.classList.contains('active')) {
      toggleCart();
    }
  });


  // --- PRODUCT DETAIL MODAL SYSTEM ---
  let currentDetailProduct = null;
  let currentDetailQty = 1;

  function openProductDetail(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    currentDetailProduct = product;
    currentDetailQty = 1;
    
    // Populate elements
    detailProductImg.src = product.image && product.image !== '' ? product.image : 'assets/logo.jpg';
    detailProductImg.alt = product.name;
    detailProductCategory.textContent = product.category;
    detailProductName.textContent = product.name;
    detailProductPrice.textContent = `$${formatPrice(product.price)}`;
    
    // Stock and availability check
    if (!product.available) {
      detailProductStock.textContent = 'Sin Stock (No disponible)';
      detailProductStock.style.color = '#721c24';
      detailAddToCartBtn.disabled = true;
      detailAddToCartBtn.classList.add('disabled');
      detailAddToCartBtn.textContent = 'Sin Stock';
    } else {
      if (product.stock) {
        detailProductStock.textContent = `Stock disponible: ${product.stock} unidades`;
      } else {
        detailProductStock.textContent = 'Stock disponible';
      }
      detailProductStock.style.color = 'var(--color-primary)';
      detailAddToCartBtn.disabled = false;
      detailAddToCartBtn.classList.remove('disabled');
      detailAddToCartBtn.textContent = 'Agregar al Carrito';
    }
    
    detailQtyValue.textContent = currentDetailQty;
    
    // Description rendering
    if (product.description && product.description.trim() !== '') {
      detailProductDescription.innerHTML = product.description;
    } else {
      detailProductDescription.innerHTML = '<p>No hay descripción adicional disponible para este producto en este momento.</p>';
    }
    
    // Open
    productDetailModal.classList.add('active');
    cartDrawer?.classList.remove('active');
    checkoutModal?.classList.remove('active');
    showInlineStorefrontView(productDetailModal);
  }

  function closeProductDetail() {
    productDetailModal.classList.remove('active');
    currentDetailProduct = null;
  }

  // Bind Detail Modal Event Listeners
  closeDetailModal.addEventListener('click', closeProductDetail);
  productDetailModal.addEventListener('click', (e) => {
    if (e.target === productDetailModal) {
      closeProductDetail();
    }
  });

  detailQtyMinus.addEventListener('click', () => {
    if (currentDetailQty > 1) {
      currentDetailQty--;
      detailQtyValue.textContent = currentDetailQty;
    }
  });

  detailQtyPlus.addEventListener('click', () => {
    if (currentDetailProduct && currentDetailProduct.stock && currentDetailQty >= currentDetailProduct.stock) {
      return;
    }
    currentDetailQty++;
    detailQtyValue.textContent = currentDetailQty;
  });

  detailAddToCartBtn.addEventListener('click', () => {
    if (!currentDetailProduct) return;
    
    // Add to cart with custom quantity
    const existingItem = cart.find(item => item.id === currentDetailProduct.id);
    if (existingItem) {
      existingItem.quantity += currentDetailQty;
    } else {
      cart.push({
        id: currentDetailProduct.id,
        name: currentDetailProduct.name,
        price: currentDetailProduct.price,
        image: currentDetailProduct.image,
        category: currentDetailProduct.category,
        quantity: currentDetailQty
      });
    }
    
    localStorage.setItem('boeweb_cart', JSON.stringify(cart));
    updateCartBadge();
    
    // Close detail modal
    closeProductDetail();
    
    renderCartItems();
    if (window.showToast) window.showToast('Producto agregado al carrito');
  });

  // --- GRID EVENT DELEGATION ---
  productGrid.addEventListener('click', (e) => {
    // 1. Add to cart button click
    const addBtn = e.target.closest('.add-to-cart-btn');
    if (addBtn) {
      e.stopPropagation();
      const id = addBtn.getAttribute('data-id');
      addToCart(id);
      
      // Visual feedback
      addBtn.style.backgroundColor = 'var(--color-accent-gold)';
      addBtn.style.borderColor = 'var(--color-accent-gold)';
      addBtn.style.color = 'var(--color-primary)';
      
      setTimeout(() => {
        addBtn.style.backgroundColor = '';
        addBtn.style.borderColor = '';
        addBtn.style.color = '';
      }, 300);
      return;
    }

    // 2. Card itself click
    const card = e.target.closest('.product-card');
    if (card) {
      const id = card.getAttribute('data-id');
      openProductDetail(id);
    }
  });

  // --- BLOG / CULTIVATION GUIDES SYSTEM ---
  const blogSection = document.getElementById('blog-section');
  const catalogSection = document.getElementById('catalog-section');
  const heroSection = document.querySelector('.hero-section');
  const blogGrid = document.getElementById('blog-grid');
  const blogTrigger = document.getElementById('blog-trigger');
  const blogBackToShopBtn = document.getElementById('blog-back-to-shop-btn');
  const articleDetailModal = document.getElementById('article-detail-modal');
  const closeArticleModal = document.getElementById('close-article-modal');
  
  // Article detail fields
  const articleDetailTitle = document.getElementById('article-detail-title');
  const articleDetailCategories = document.getElementById('article-detail-categories');
  const articleDetailImg = document.getElementById('article-detail-img');
  const articleDetailContent = document.getElementById('article-detail-content');

  // Load articles
  async function loadBlog() {
    try {
      const response = await fetch('articles.json');
      if (!response.ok) throw new Error('Articles database not found.');
      blogArticles = await response.json();
      filteredArticles = [...blogArticles];
    } catch (err) {
      console.error("Error loading blog articles:", err);
      blogGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px 0; color: #721c24;">
          <p style="font-weight: 600; margin-bottom: 8px;">⚠️ No se pudieron cargar las guías de cultivo</p>
          <p style="font-size: 0.9rem; opacity: 0.8;">Por favor, recarga la página o asegúrate de que el servidor local esté corriendo.</p>
        </div>
      `;
    }
  }

  // Switch between Catalog view and Blog view
  function setActiveMobileNav(activeId) {
    document.querySelectorAll('.mobile-nav-btn').forEach(button => {
      button.classList.toggle('active', button.id === activeId);
    });
  }

  function showView(view) {
    const mobileShopBtn = document.getElementById('mobile-shop-btn');
    const mobileStoreBtn = document.getElementById('mobile-store-btn');

    if (view === 'shop') {
      catalogSection.style.display = 'block';
      if (heroSection) heroSection.style.display = ''; // Clear inline flex
      blogSection.style.display = 'none';
      if (blogTrigger) blogTrigger.classList.remove('active');
      
      // Update mobile bottom nav active classes
      if (mobileStoreBtn) setActiveMobileNav('mobile-store-btn');
      
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (view === 'blog') {
      catalogSection.style.display = 'none';
      if (heroSection) heroSection.style.display = 'none';
      blogSection.style.display = 'block';
      if (blogTrigger) blogTrigger.classList.add('active');
      
      // Update mobile bottom nav active classes
      if (mobileShopBtn) setActiveMobileNav('');
      
      renderBlogGrid();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // Render blog cards grid
  function renderBlogGrid() {
    blogGrid.innerHTML = '';
    
    if (filteredArticles.length === 0) {
      blogGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px 0; opacity: 0.7;">
          <p>No se encontraron artículos en esta categoría.</p>
        </div>
      `;
      return;
    }
    
    filteredArticles.forEach(article => {
      const card = document.createElement('article');
      card.className = 'blog-card';
      card.setAttribute('data-id', article.id);
      
      const imageUrl = article.image && article.image !== '' ? article.image : 'assets/logo.jpg';
      const categoryText = article.categories.join(', ');
      
      card.innerHTML = `
        <div class="blog-card-img-wrapper">
          <img src="${imageUrl}" alt="${article.title}" class="blog-card-img" loading="lazy" onerror="this.onerror=null;this.src='assets/logo.jpg';">
        </div>
        <div class="blog-card-content">
          <div class="blog-card-category">${categoryText}</div>
          <h3 class="blog-card-title">${article.title}</h3>
          <p class="blog-card-excerpt">${article.excerpt}</p>
          <span class="blog-card-readmore">Leer artículo</span>
        </div>
      `;
      blogGrid.appendChild(card);
    });
  }

  // Filter blog articles by category
  function applyBlogCategoryFilter(category) {
    currentBlogCategory = category;
    
    // Update active state of buttons
    document.querySelectorAll('.blog-cat-btn').forEach(btn => {
      if (btn.getAttribute('data-category') === category) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (category === 'all') {
      filteredArticles = [...blogArticles];
    } else {
      filteredArticles = blogArticles.filter(art => 
        art.categories.some(cat => cat.toLowerCase().includes(category.toLowerCase()))
      );
    }
    renderBlogGrid();
  }

  // Open full article detail reading modal
  function openArticleDetail(articleId) {
    const article = blogArticles.find(art => art.id === articleId);
    if (!article) return;
    
    articleDetailTitle.textContent = article.title;
    articleDetailCategories.textContent = article.categories.join(', ');
    articleDetailImg.src = article.image && article.image !== '' ? article.image : 'assets/logo.jpg';
    
    // Populate paragraphs
    articleDetailContent.innerHTML = '';
    article.paragraphs.forEach(pText => {
      // If paragraph contains a subtitle (e.g. starts with bold or a title structure), we can render it styled
      if (pText.startsWith('##')) {
        const h3 = document.createElement('h3');
        h3.textContent = pText.replace(/^##\s*/, '');
        articleDetailContent.appendChild(h3);
      } else {
        const p = document.createElement('p');
        p.textContent = pText;
        articleDetailContent.appendChild(p);
      }
    });
    
    articleDetailModal.classList.add('active');
  }

  function closeArticleDetail() {
    articleDetailModal.classList.remove('active');
  }

  // --- BIND BLOG EVENTS ---
  if (blogTrigger) {
    blogTrigger.addEventListener('click', () => {
      if (blogSection.style.display === 'none') {
        showView('blog');
      } else {
        showView('shop');
      }
    });
  }

  if (blogBackToShopBtn) {
    blogBackToShopBtn.addEventListener('click', () => showView('shop'));
  }

  // Blog Category Pill Clicks
  document.querySelectorAll('.blog-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.getAttribute('data-category');
      applyBlogCategoryFilter(cat);
    });
  });

  // Grid Event Delegation for Blog Cards
  blogGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.blog-card');
    if (card) {
      const id = card.getAttribute('data-id');
      openArticleDetail(id);
    }
  });

  // Modal Close Events
  if (closeArticleModal) {
    closeArticleModal.addEventListener('click', closeArticleDetail);
  }
  articleDetailModal.addEventListener('click', (e) => {
    if (e.target === articleDetailModal) {
      closeArticleDetail();
    }
  });

  // Logo Area Click to Return to Shop
  const logoArea = document.querySelector('.header-logo-area');
  if (logoArea) {
    logoArea.addEventListener('click', () => {
      showView('shop');
      currentCategory = 'all';
      updateCategoryActiveState();
      applyFiltersAndRender(true);
    });
  }

  // --- CIRCULAR NAV MORE MENU HANDLERS ---
  window.toggleNavMoreMenu = function() {
    const dropdown = document.getElementById('nav-more-menu-dropdown');
    if (dropdown) {
      dropdown.classList.toggle('active');
    }
  };

  window.closeNavMoreMenu = function() {
    const dropdown = document.getElementById('nav-more-menu-dropdown');
    if (dropdown) {
      dropdown.classList.remove('active');
    }
  };

  // Close dropdown menu when clicking outside
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('nav-more-menu-dropdown');
    const trigger = document.getElementById('nav-more-trigger');
    if (dropdown && dropdown.classList.contains('active')) {
      if (!dropdown.contains(e.target) && !trigger?.contains(e.target)) {
        closeNavMoreMenu();
      }
    }
  });

  // --- APP INITIALIZATION ---
  loadCatalog();
  loadBlog(); // load blog articles
  renderCartItems();
  
  // Footer category link overrides
  document.querySelectorAll('.footer-cat-link').forEach(link => {
    link.addEventListener('click', (e) => {
      showView('shop'); // Ensure we switch to shop view first
      const cat = link.getAttribute('data-category');
      currentCategory = cat;
      updateCategoryActiveState();
      applyFiltersAndRender(true);
    });
  });

  // --- MOBILE BOTTOM NAVIGATION LISTENERS ---
  const mobileShopBtn = document.getElementById('mobile-shop-btn');
  const mobileStoreBtn = document.getElementById('mobile-store-btn');
  const mobileCartBtn = document.getElementById('mobile-cart-btn');

  if (mobileShopBtn) {
    mobileShopBtn.addEventListener('click', () => {
      showView('shop');
      setActiveMobileNav('mobile-shop-btn');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  if (mobileStoreBtn) {
    mobileStoreBtn.addEventListener('click', () => {
      showView('shop');
      setActiveMobileNav('mobile-store-btn');
      document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  if (mobileCartBtn) {
    mobileCartBtn.addEventListener('click', toggleCart);
  }

  // Initialize Zen 420 Floating Leaves
  initZenLeaves();
  checkReferralURL();
  renderTeamShowcaseUI();
  checkPaymentReturnStatus();
});

// --- TEAM SHOWCASE & REFERRAL LISTENER ---
function checkReferralURL() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref') || params.get('vendedor') || params.get('asesor');
  if (ref) {
    localStorage.setItem('boeweb_referred_by', ref);
    if (window.showToast) window.showToast(`🌿 Asesor asignado por link: ${ref}`);
  }
}

function renderTeamShowcaseUI() {
  const container = document.getElementById('team-cards-grid');
  if (!container) return;

  const sellers = window.AUTHORIZED_VENDEDORES || [
    { name: 'Raul', role: 'Especialista en Sustratos & Nutrición Orgánica', phone: '5493510001111', refCode: 'raul123' },
    { name: 'Nacho Mina', role: 'Asesor Técnico en Cultivo Indoor & Iluminación LED', phone: '5493510002222', refCode: 'nachomina123' },
    { name: 'Alexis', role: 'Especialista en Riego Automático & Hidroponía', phone: '5493510003333', refCode: 'alexis123' },
    { name: 'Gino', role: 'Asesor en Extracciones & Parafernalia Premium', phone: '5493510004444', refCode: 'gino123' },
    { name: 'Rodrigo', role: 'Especialista en Control de Plagas & Fitopatología', phone: '5493510005555', refCode: 'rodrigo123' },
    { name: 'Felipe', role: 'Asesor de Membresías & Trámites REPROCANN', phone: '5493510006666', refCode: 'felipe123' },
    { name: 'Mariano', role: 'Especialista en Semillas & Genética Cannabis', phone: '5493510007777', refCode: 'mariano123' }
  ];

  container.innerHTML = sellers.map(v => `
    <div style="background: var(--color-card-bg); border: 1.5px solid var(--color-border-accent); border-radius: 18px; padding: 20px 16px; text-align: center; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; align-items: center; justify-content: space-between; gap: 12px; transition: transform 0.2s ease;">
      <div style="width: 72px; height: 72px; border-radius: 50%; border: 2px solid var(--color-accent-gold); padding: 3px; background: rgba(195,155,75,0.15);">
        <img src="assets/logo.jpg" alt="${v.name}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
      </div>
      <div>
        <h4 style="margin: 0; font-family: var(--font-serif); font-size: 1.15rem; color: var(--color-text-main); font-weight: 700;">${v.name}</h4>
        <span style="display: block; font-size: 0.78rem; color: var(--color-accent-gold); font-weight: 700; margin-top: 4px;">${v.role}</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
        <a href="https://wa.me/${v.phone}?text=${encodeURIComponent('Hola ' + v.name + '! Quisiera hacerte una consulta de cultivo.')}" target="_blank" class="btn btn-secondary" style="width: 100%; border-color: #25d366; color: #25d366; font-size: 0.82rem; font-weight: 700; padding: 8px 12px; border-radius: 10px;">
          💬 Asesorarme por WhatsApp
        </a>
      </div>
    </div>
  `).join('');
}

window.renderTeamShowcaseUI = renderTeamShowcaseUI;

// --- ZEN 420 FLOATING LEAVES EFFECT ---
function initZenLeaves() {
  const container = document.getElementById('zen-leaves-container');
  if (!container) return;

  const colors = [
    'rgba(195, 155, 75, 0.25)', // Gold
    'rgba(21, 45, 36, 0.15)',   // Zen Green Dark
    'rgba(46, 125, 50, 0.2)',   // Leaf Green Light
    'rgba(139, 195, 74, 0.15)'  // Lime Green
  ];

  for (let i = 0; i < 15; i++) {
    const leaf = document.createElement('div');
    leaf.className = 'zen-leaf';
    
    // Random properties
    const size = Math.random() * 20 + 12; // 12px to 32px
    const left = Math.random() * 100; // 0% to 100%
    const delay = Math.random() * 10; // 0s to 10s
    const duration = Math.random() * 8 + 8; // 8s to 16s
    const color = colors[Math.floor(Math.random() * colors.length)];
    const rotation = Math.random() * 360;

    leaf.style.width = `${size}px`;
    leaf.style.height = `${size}px`;
    leaf.style.left = `${left}%`;
    leaf.style.animationDelay = `${delay}s`;
    leaf.style.animationDuration = `${duration}s`;
    leaf.style.color = color;
    leaf.style.transform = `rotate(${rotation}deg)`;

    leaf.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" style="width: 100%; height: 100%;">
        <path d="M12 2c-4 5.3-6 9.8-6 13.5C6 18.8 8.7 21 12 21s6-2.2 6-5.5c0-3.7-2-8.2-6-13.5z"/>
      </svg>
    `;
    container.appendChild(leaf);
  }
}

// --- MERCADO PAGO RETURN & WHATSAPP NOTIFICATION ENGINE ---
function checkPaymentReturnStatus() {
  const urlParams = new URLSearchParams(window.location.search);
  const paymentStatus = urlParams.get('payment');
  const collectionStatus = urlParams.get('collection_status') || urlParams.get('status');
  const collectionId = urlParams.get('collection_id') || urlParams.get('payment_id') || urlParams.get('preference_id');
  const externalRef = urlParams.get('external_reference');

  if (paymentStatus === 'success' || collectionStatus === 'approved') {
    // Vaciar carrito
    try {
      localStorage.removeItem('boeweb_cart');
      localStorage.removeItem('boeweb_applied_coupon');
    } catch (_) {}

    let lastOrder = null;
    try {
      lastOrder = JSON.parse(localStorage.getItem('boeweb_last_mp_order') || 'null');
    } catch (_) {}

    showPaymentSuccessModal({
      collectionId: collectionId || 'Acreditado',
      orderId: externalRef || (lastOrder?.orderId) || 'ORD-' + Math.floor(100000 + Math.random() * 900000),
      customerName: lastOrder?.customerName || '',
      customerPhone: lastOrder?.customerPhone || '',
      total: lastOrder?.total || null,
      items: lastOrder?.items || []
    });

    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  } else if (paymentStatus === 'failure' || collectionStatus === 'rejected') {
    alert('⚠️ El pago en Mercado Pago fue rechazado o cancelado. Podés volver a intentar o seleccionar otro método de pago.');
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }
}

function showPaymentSuccessModal(data) {
  const modal = document.getElementById('payment-result-modal');
  if (!modal) return;

  const orderIdEl = document.getElementById('mp-res-order-id');
  const collectionIdEl = document.getElementById('mp-res-collection-id');
  const totalEl = document.getElementById('mp-res-total');
  const waBtn = document.getElementById('mp-res-whatsapp-btn');

  if (orderIdEl) orderIdEl.textContent = data.orderId || 'ORD-BOE';
  if (collectionIdEl) collectionIdEl.textContent = `#${data.collectionId || '172791026753'}`;
  if (totalEl) {
    if (data.total !== null && data.total !== undefined) {
      totalEl.textContent = `$${Number(data.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
    } else {
      totalEl.textContent = 'Pago confirmado';
    }
  }

  // Armar mensaje directo de WhatsApp
  const waPhone = "5493813023185";
  let waMsg = `✨ *Comprobante de Pago Acreditado - BO growclub* ✨\n\n`;
  waMsg += `📦 *Pedido:* ${data.orderId}\n`;
  waMsg += `💳 *Operación Mercado Pago:* #${data.collectionId}\n`;
  if (data.customerName) waMsg += `👤 *Cliente:* ${data.customerName}\n`;
  if (data.customerPhone) waMsg += `📞 *Teléfono:* ${data.customerPhone}\n`;
  if (data.total) waMsg += `💰 *Monto Abonado:* $${Number(data.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}\n`;
  waMsg += `✅ *Estado:* Pago Aprobado en Mercado Pago\n\n`;
  waMsg += `¡Hola equipo BÔ Grow Club! Ya completé el pago de mi pedido por Mercado Pago. Les comparto el comprobante para coordinar la entrega. 🙏🌿`;

  if (waBtn) {
    waBtn.href = `https://wa.me/${waPhone}?text=${encodeURIComponent(waMsg)}`;
  }

  modal.classList.add('active');
}

function closePaymentResultModal() {
  const modal = document.getElementById('payment-result-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

window.closePaymentResultModal = closePaymentResultModal;

