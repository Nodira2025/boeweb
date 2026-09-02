// Initialize Supabase Client
const supabaseUrl = 'https://sxbhrgvizqylnfcqzhin.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4YmhyZ3ZpenF5bG5mY3F6aGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMjM1MzEsImV4cCI6MjA5Njg5OTUzMX0.UUOwXsHXKNCjlJKdxMUlAuCtNAnNWgAroBwMlWAdTag';

let supabaseClient;

// --- STATE MANAGEMENT ---
let baseProducts = []; // Stores products rendered in the grid
let cart = JSON.parse(localStorage.getItem('boeweb_b2b_cart')) || [];

// Clear legacy carts once to prevent price mismatch with the new 30% discount system
if (localStorage.getItem('boeweb_b2b_cart_version') !== '1.1') {
  cart = [];
  localStorage.setItem('boeweb_b2b_cart', JSON.stringify(cart));
  localStorage.setItem('boeweb_b2b_cart_version', '1.1');
}
let currentCategory = 'all';
let searchQuery = '';
let currentPage = 1;
const itemsPerPage = 24;
let filterSupplier = 'all';
let filterOnlyStock = false;

// Web orders state (hoisted to avoid TDZ when called from renderVendorHomeUI)
let webOrdersList = [];
let webOrdersFilterStatus = 'all';
let webOrdersFilterQuery = '';

// Camera scanner state (hoisted to avoid TDZ when called from onclick handlers)
let universalCameraScannerInstance = null;
let universalCameraFacingMode = 'environment';
let universalCameraActiveMode = 'pos';
let universalCameraTorchOn = false;
let universalCameraStream = null;

// Internal catalog state (hoisted to avoid TDZ when accessed across modules)
let internalCatalogProducts = [];
let internalCatalogFilterQuery = '';
let internalCatalogFilterCategory = 'all';
let internalCatalogEditingId = null;
let internalCatalogImageFile = null;
let internalCatalogImagePreviewUrl = null;

// WMS state (hoisted to avoid TDZ)
let currentWmsModuleCode = 'PI-M04';

// POS state (hoisted to avoid TDZ)
let globalPosCart = null;
let posScanPendingProduct = null;
let externalCatalogOffers = [];
let externalCatalogLoadError = '';
let externalCatalogSearchSequence = 0;
let externalCatalogSearchQuery = '';
let externalCatalogSearchSourceType = null;
let mobileExternalCatalogSearchTimer = null;
let catalogRecoveryInFlight = false;
let parkedPosTickets = [];
let activeParkedTicketId = null;

// Expirations, Nearby Stores & CC state (hoisted to avoid TDZ)
let currentExpirationsFilter = 'all';
let activeNearbyStoreFilter = 'all';
let currentSelectedCcId = null;
let canonicalCurrentAccounts = [];
let canonicalCashView = null;
let canonicalAdminAuditLogs = [];
let canonicalAdminAuditLoadedAt = 0;

// Retired products & stock adjustment state (hoisted)
let retiredProductsFilterReason = 'all';
let retiredProductsSearchQuery = '';
let currentStockAdjustmentProduct = null;
let currentStockAdjustmentAction = 'remove';

// Supplier display names mapping
const supplierNames = {
  'astrogrow': 'AstroGrow',
  'santaplanta': 'Santa Planta',
  'rosse': 'Distribuidora Rosse',
  'candyclub': 'Candy Club',
  'distripulpo': 'Distripulpo',
  'cabrasrl': 'Cabra SRL',
  'mundohidroponia': 'Mundo Hidroponía'
};

// --- DOM ELEMENTS ---
const productGrid = document.getElementById('b2b-product-grid');
const searchInput = document.getElementById('b2b-search-input');
const categoryButtons = document.querySelectorAll('.b2b-category-btn');
const loader = document.getElementById('b2b-loader');
const noResults = document.getElementById('b2b-no-results');
const loadMoreContainer = document.getElementById('b2b-load-more-container');
const loadMoreBtn = document.getElementById('b2b-load-more-btn');
const cartTriggerBtn = document.getElementById('b2b-cart-trigger-btn');
const cartDrawer = document.getElementById('b2b-cart-drawer');
const cartOverlay = document.getElementById('b2b-cart-overlay');
const cartCloseBtn = document.getElementById('b2b-cart-close-btn');
const cartBody = document.getElementById('b2b-cart-body');
const cartTotalEl = document.getElementById('b2b-cart-total');
const cartCountEl = document.getElementById('b2b-cart-count');
const checkoutForm = document.getElementById('b2b-checkout-form');
const toastEl = document.getElementById('b2b-toast');
const filterSupplierSelect = document.getElementById('b2b-filter-supplier');
const filterStockCheckbox = document.getElementById('b2b-filter-stock');
const printPdfBtn = document.getElementById('b2b-print-pdf-btn');
const toastMessageEl = document.getElementById('b2b-toast-message');

// Mobile UI DOM Elements
const sidebarCard = document.getElementById('b2b-sidebar-card');
const filtersOverlay = document.getElementById('b2b-filters-overlay');
const sidebarCloseBtn = document.getElementById('b2b-sidebar-close-btn');
const mobileFilterBtn = document.getElementById('b2b-mobile-filter-btn');
const mobileHomeBtn = document.getElementById('b2b-mobile-home-btn');
const mobileCartBtn = document.getElementById('b2b-mobile-cart-btn');
const mobileCartCountEl = document.getElementById('b2b-mobile-cart-count');

// --- INITIALIZE PORTAL ---
document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
      window.supabaseClient = supabaseClient;
      if (window.SaasAuth?.ensureOperationalContext) {
        try {
          await window.SaasAuth.ensureOperationalContext(supabaseClient);
          checkVendorAuth();
        } catch (authErr) {
          console.warn('SaasAuth optional hydration notice:', authErr);
        }
      }
    }
  } catch (clientErr) {
    console.warn('Supabase client optional notice:', clientErr);
  }

  setupEventListeners();

  try {
    await fetchB2BProducts(true);
  } catch (b2bErr) {
    console.warn('B2B products load notice:', b2bErr);
  }

  try {
    updateCartBadge();
    renderCart();
    updateCategoryCounts();
  } catch (cartErr) {
    console.warn('Cart badge notice:', cartErr);
  }

  try {
    await loadPendingProductDrafts();
  } catch (draftErr) {
    console.warn('Product drafts notice:', draftErr);
  }

  try {
    initializeFastUploadForm();
  } catch (formErr) {
    console.warn('Fast upload form notice:', formErr);
  }

  try {
    await refreshPendingLocationBadge();
  } catch (locErr) {
    console.warn('Location badge notice:', locErr);
  }
});

// --- EVENT LISTENERS ---
function setupEventListeners() {
  // Search with debounce
  let searchTimeout;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchQuery = e.target.value.trim();
      searchTimeout = setTimeout(() => {
        fetchB2BProducts(true); // Reset search and clear grid
      }, 400);
    });
  }

  // Category Filtering
  if (categoryButtons && categoryButtons.length) {
    categoryButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        categoryButtons.forEach(b => b.classList.remove('active'));
        
        const targetBtn = e.target.closest('.b2b-category-btn');
        if (targetBtn) {
          targetBtn.classList.add('active');
          currentCategory = targetBtn.dataset.category;
          
          fetchB2BProducts(true); // Reset category and clear grid

          // Close sidebar filter drawer on mobile after selecting category
          if (window.innerWidth <= 992) {
            closeFilters();
          }
        }
      });
    });
  }

  // Load More Button
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      currentPage++;
      fetchB2BProducts(false); // Fetch next page, do not clear grid
    });
  }

  // Cart Drawer open/close
  if (cartTriggerBtn) cartTriggerBtn.addEventListener('click', openCart);
  if (cartCloseBtn) cartCloseBtn.addEventListener('click', closeCart);
  if (cartOverlay) cartOverlay.addEventListener('click', closeCart);

  // Checkout submit
  if (checkoutForm) checkoutForm.addEventListener('submit', handleCheckout);

  // Supplier filter
  if (filterSupplierSelect) {
    filterSupplierSelect.addEventListener('change', (e) => {
      filterSupplier = e.target.value;
      fetchB2BProducts(true);
    });
  }

  // Stock filter
  if (filterStockCheckbox) {
    filterStockCheckbox.addEventListener('change', (e) => {
      filterOnlyStock = e.target.checked;
      fetchB2BProducts(true);
    });
  }

  // PDF button
  if (printPdfBtn) {
    printPdfBtn.addEventListener('click', generateComparativePDF);
  }

  // Mobile Bottom Navigation Event Listeners
  if (mobileFilterBtn) {
    mobileFilterBtn.addEventListener('click', () => {
      if (sidebarCard && sidebarCard.classList.contains('open')) {
        closeFilters();
      } else {
        openFilters();
      }
    });
  }

  if (mobileHomeBtn) {
    mobileHomeBtn.addEventListener('click', () => {
      closeFilters();
      closeCart();
      switchVendorTab('home');
      updateMobileNavActive(mobileHomeBtn);
    });
  }

  if (mobileCartBtn) {
    mobileCartBtn.addEventListener('click', () => {
      closeFilters();
      if (cartDrawer && cartDrawer.classList.contains('open')) {
        closeCart();
      } else {
        openCart();
      }
    });
  }

  // Mobile Sidebar close handlers
  if (sidebarCloseBtn) {
    sidebarCloseBtn.addEventListener('click', closeFilters);
  }
  if (filtersOverlay) {
    filtersOverlay.addEventListener('click', closeFilters);
  }
}

// --- DATA FETCHING ---
async function fetchB2BProducts(clearGrid = true) {
  showLoader(true);
  if (noResults) noResults.style.display = 'none';
  if (loadMoreContainer) loadMoreContainer.style.display = 'none';
  
  if (clearGrid) {
    if (productGrid) productGrid.innerHTML = '';
    baseProducts = [];
    currentPage = 1;
  }

  const from = (currentPage - 1) * itemsPerPage;
  const to = currentPage * itemsPerPage - 1;

  try {
    // Build the select query dynamically.
    // If filtering by supplier or stock is active, we append a renamed inner join relation.
    // This allows database-side filtering of parent rows while still retrieving ALL supplier_products for matching products.
    let selectQuery = `
      id,
      name,
      image,
      category,
      description,
      supplier_products (
        id,
        supplier_id,
        name,
        price,
        stock,
        available,
        link
      )
    `;

    const isSupplierFilterActive = filterSupplier !== 'all';
    const isStockFilterActive = filterOnlyStock;

    if (isSupplierFilterActive || isStockFilterActive) {
      selectQuery += `, filtered_query:supplier_products!inner(supplier_id, available, stock)`;
    }

    let query = supabaseClient
      .from('products')
      .select(selectQuery);

    if (currentCategory !== 'all') {
      query = query.eq('category', currentCategory);
    }

    if (searchQuery) {
      query = query.ilike('name', `%${searchQuery}%`);
    }

    // Apply database filters on the renamed inner relation
    if (isSupplierFilterActive) {
      query = query.eq('filtered_query.supplier_id', filterSupplier);
    }

    if (isStockFilterActive) {
      query = query.eq('filtered_query.available', true)
                   .or('stock.is.null,stock.gt.0', { foreignTable: 'filtered_query' });
    }

    // Sort products by name alphabetically
    query = query.order('name', { ascending: true })
                 .range(from, to);

    const { data, error } = await query;

    if (error) throw error;

    let fetchedProducts = data || [];
    
    // Sort supplier products for each product from cheapest to most expensive and apply 30% B2B discount
    fetchedProducts.forEach(product => {
      if (product.supplier_products) {
        // Clean up the extra filtered_query key returned by Supabase
        delete product.filtered_query;
        product.supplier_products.forEach(sp => {
          sp.price = sp.price * 0.70; // Apply 30% wholesale discount (precios reales con proveedor)
        });
        product.supplier_products.sort((a, b) => a.price - b.price);
      }
    });

    baseProducts = baseProducts.concat(fetchedProducts);

    if (productGrid) renderProductsList(fetchedProducts, clearGrid);
    renderVendorHomeUI();

    // Show/hide Load More button
    if (loadMoreContainer) {
      if ((data || []).length === itemsPerPage) {
        loadMoreContainer.style.display = 'block';
      } else {
        loadMoreContainer.style.display = 'none';
      }
    }

    if (baseProducts.length === 0 && noResults) {
      noResults.style.display = 'block';
    }
  } catch (err) {
    console.error('Error fetching B2B catalog:', err.message);
    if (productGrid) {
      productGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; color: #721c24; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px;">
          <p style="font-weight: bold; margin-bottom: 8px;">Error al conectar con la base de datos de Supabase</p>
          <p style="font-size: 0.9rem; margin-bottom: 12px;">${err.message || err}</p>
          <button onclick="window.fetchB2BProducts && window.fetchB2BProducts(true)" style="padding: 8px 16px; background: #721c24; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">Reintentar Carga</button>
        </div>
      `;
    }
  } finally {
    showLoader(false);
  }
}

window.fetchB2BProducts = fetchB2BProducts;

// --- CATEGORY COUNTS ---
async function updateCategoryCounts() {
  try {
    // Fetch count of all products
    const { count: allCount, error: errAll } = await supabaseClient
      .from('products')
      .select('*', { count: 'exact', head: true });
    
    if (!errAll) {
      document.getElementById('count-all').textContent = `(${allCount})`;
    }

    // List of categories in B2B
    const categories = ['Semillas', 'Sustratos', 'Fertilizantes', 'Indoor', 'Vaporizadores', 'Macetas', 'Medición y Riego', 'Parafernalia', 'Otros'];
    
    for (const cat of categories) {
      const elementId = cat === 'Medición y Riego' ? 'count-Medicion' : `count-${cat}`;
      const countEl = document.getElementById(elementId);
      if (!countEl) continue;

      const { count, error } = await supabaseClient
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('category', cat);

      if (!error) {
        countEl.textContent = `(${count})`;
      }
    }
  } catch (err) {
    console.error('Error fetching category counts:', err.message);
  }
}

// --- RENDERING PRODUCTS LIST ---
function renderProductsList(productsToRender, clearGrid) {
  const fragment = document.createDocumentFragment();

  productsToRender.forEach(product => {
    const card = document.createElement('div');
    card.className = 'b2b-card';
    card.dataset.id = product.id;

    // Determine default supplier: cheapest with stock (or just cheapest if none have stock)
    let selectedSupplier = null;
    const suppliers = product.supplier_products || [];
    
    if (suppliers.length > 0) {
      selectedSupplier = suppliers.find(s => s.available && (s.stock === null || s.stock > 0));
      if (!selectedSupplier) {
        selectedSupplier = suppliers[0];
      }
    }

    // Build supplier dropdown + price display
    let supplierSelectHtml = '';
    let priceDisplayHtml = '';
    const defaultSupplierId = selectedSupplier ? selectedSupplier.supplier_id : '';
    const defaultPrice = selectedSupplier ? selectedSupplier.price : 0;

    if (suppliers.length === 0) {
      supplierSelectHtml = `<div style="padding: 10px; text-align: center; font-size: 0.8rem; color: #888;">Sin proveedores cargados</div>`;
      priceDisplayHtml = '';
    } else {
      // Build select options
      let optionsHtml = '';
      suppliers.forEach((s, idx) => {
        const displayName = supplierNames[s.supplier_id] || s.supplier_id;
        const isCheapest = idx === 0;
        const isSelected = selectedSupplier && selectedSupplier.supplier_id === s.supplier_id;

        let stockLabel = '';
        if (!s.available || (s.stock !== null && s.stock <= 0)) {
          stockLabel = ' — SIN STOCK';
        } else if (s.stock === null) {
          stockLabel = ' — Disponible';
        } else {
          stockLabel = ` — ${s.stock} disp.`;
        }

        optionsHtml += `<option value="${s.supplier_id}" ${isSelected ? 'selected' : ''} data-price="${s.price}" data-stock="${s.stock}" data-available="${s.available}">${displayName} — $${formatPrice(s.price)}${stockLabel}${isCheapest ? ' ★' : ''}</option>`;
      });

      supplierSelectHtml = `
        <div class="b2b-supplier-select-wrapper">
          <label style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #666; margin-bottom: 4px; display: block;">Proveedor</label>
          <select class="b2b-card-supplier-select" id="supplier-select-${product.id}" onchange="handleSupplierChange(this, '${product.id}')">
            ${optionsHtml}
          </select>
        </div>
      `;

      priceDisplayHtml = `
        <div class="b2b-card-price-display" id="price-display-${product.id}">
          <span class="b2b-card-price-value">$${formatPrice(defaultPrice)}</span>
        </div>
      `;
    }

    // Image fallback
    const imgUrl = product.image || 'assets/logo.jpg';

    card.innerHTML = `
      <div class="b2b-card-img-wrapper">
        <img src="${imgUrl}" alt="${product.name}" class="b2b-card-img" onerror="this.src='assets/logo.jpg'">
      </div>
      <div class="b2b-card-content">
        <span class="b2b-card-category">${product.category}</span>
        <h3 class="b2b-card-title" title="${product.name}">${product.name}</h3>
        
        ${supplierSelectHtml}
        ${priceDisplayHtml}

        <div class="b2b-card-footer">
          <div class="b2b-qty-selector">
            <button class="b2b-qty-btn" onclick="adjustQty(this, -1)">-</button>
            <input type="number" class="b2b-qty-value" value="1" min="1" onchange="validateQtyInput(this)">
            <button class="b2b-qty-btn" onclick="adjustQty(this, 1)">+</button>
          </div>
          <button class="b2b-add-btn" 
                  onclick="handleAddClick('${product.id}')"
                  ${suppliers.length === 0 ? 'disabled' : ''}>
            Agregar
          </button>
        </div>
      </div>
    `;

    fragment.appendChild(card);
  });

  productGrid.appendChild(fragment);
}

// --- INTERACTION HELPERS ---
window.handleSupplierChange = function(selectEl, productId) {
  const selectedOption = selectEl.options[selectEl.selectedIndex];
  const price = parseFloat(selectedOption.dataset.price) || 0;
  const priceDisplay = document.getElementById(`price-display-${productId}`);
  if (priceDisplay) {
    priceDisplay.querySelector('.b2b-card-price-value').textContent = `$${formatPrice(price)}`;
  }
};

window.adjustQty = function(btnEl, amount) {
  const input = btnEl.parentNode.querySelector('.b2b-qty-value');
  let val = parseInt(input.value) || 1;
  val = Math.max(1, val + amount);
  input.value = val;
};

window.validateQtyInput = function(inputEl) {
  let val = parseInt(inputEl.value) || 1;
  inputEl.value = Math.max(1, val);
};

window.handleAddClick = function(productId) {
  const card = document.querySelector(`.b2b-card[data-id="${productId}"]`);
  if (!card) return;

  const supplierSelect = card.querySelector('.b2b-card-supplier-select');
  if (!supplierSelect) {
    showToast('No hay proveedores disponibles', true);
    return;
  }

  const supplierId = supplierSelect.value;
  const qty = parseInt(card.querySelector('.b2b-qty-value').value) || 1;

  addToCart(productId, supplierId, qty);
};

// --- CART ACTIONS ---
function addToCart(productId, supplierId, quantity) {
  const product = baseProducts.find(p => p.id === productId);
  if (!product) return;

  const supplierProduct = product.supplier_products.find(s => s.supplier_id === supplierId);
  if (!supplierProduct) return;

  // Check if item is already in cart with same product and supplier
  const existingItem = cart.find(item => item.product_id === productId && item.supplier_id === supplierId);

  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    cart.push({
      product_id: productId,
      supplier_id: supplierId,
      name: product.name,
      image: product.image,
      category: product.category,
      supplier_product_id: supplierProduct.id,
      price: supplierProduct.price,
      link: supplierProduct.link,
      quantity: quantity,
      // Keep other supplier options for matching dropdown in the cart
      suppliers: product.supplier_products.map(s => ({
        supplier_id: s.supplier_id,
        price: s.price,
        stock: s.stock,
        available: s.available
      }))
    });
  }

  saveCart();
  updateCartBadge();
  renderCart();
  showToast(`Agregado: ${quantity}x ${product.name}`);
}

function saveCart() {
  localStorage.setItem('boeweb_b2b_cart', JSON.stringify(cart));
}

function updateCartBadge() {
  const count = cart.reduce((total, item) => total + item.quantity, 0);
  if (cartCountEl) cartCountEl.textContent = count;
  if (mobileCartCountEl) {
    mobileCartCountEl.textContent = count;
  }
  renderVendorHomeUI();
}

// --- CART RENDER & EDITING ---
function renderCart() {
  if (!cartBody) return;
  if (cart.length === 0) {
    cartBody.innerHTML = `
      <div class="b2b-empty-cart">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="9" cy="21" r="1"></circle>
          <circle cx="20" cy="21" r="1"></circle>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
        </svg>
        <p>El pedido está vacío</p>
      </div>
    `;
    if (cartTotalEl) cartTotalEl.textContent = '$0';
    return;
  }

  // Group items by supplier
  const groups = {};
  cart.forEach(item => {
    if (!groups[item.supplier_id]) {
      groups[item.supplier_id] = [];
    }
    groups[item.supplier_id].push(item);
  });

  let cartHtml = '';
  let overallTotal = 0;

  for (const supplierId in groups) {
    const items = groups[supplierId];
    const supplierName = supplierNames[supplierId] || supplierId;
    
    // Group subtotal
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    overallTotal += subtotal;

    let itemsHtml = '';
    items.forEach(item => {
      // Build supplier option dropdown selectors so they can switch directly in cart
      let optionsHtml = '';
      item.suppliers.forEach(s => {
        const displayName = supplierNames[s.supplier_id] || s.supplier_id;
        const isCurrent = s.supplier_id === item.supplier_id;
        optionsHtml += `
          <option value="${s.supplier_id}" ${isCurrent ? 'selected' : ''}>
            ${displayName} ($${formatPrice(s.price)})
          </option>
        `;
      });

      itemsHtml += `
        <div class="b2b-cart-item">
          <img src="${item.image || 'assets/logo.jpg'}" alt="${item.name}" class="b2b-cart-item-img" onerror="this.src='assets/logo.jpg'">
          <div class="b2b-cart-item-info">
            <h4>${item.name}</h4>
            <p>Cant: ${item.quantity} x $${formatPrice(item.price)}</p>
            <select class="b2b-cart-item-supplier-select" 
                    onchange="changeCartItemSupplier('${item.product_id}', '${item.supplier_id}', this.value)">
              ${optionsHtml}
            </select>
          </div>
          <div class="b2b-cart-item-actions">
            <span class="b2b-cart-item-price">$${formatPrice(item.price * item.quantity)}</span>
            <button class="b2b-cart-item-remove" onclick="removeCartItem('${item.product_id}', '${item.supplier_id}')">
              Quitar
            </button>
          </div>
        </div>
      `;
    });

    cartHtml += `
      <div class="b2b-cart-supplier-group">
        <div class="b2b-cart-supplier-header">
          <span>🚚 ${supplierName}</span>
          <span class="b2b-cart-supplier-total">Subtotal: $${formatPrice(subtotal)}</span>
        </div>
        <div class="b2b-cart-supplier-items">
          ${itemsHtml}
        </div>
      </div>
    `;
  }

  cartBody.innerHTML = cartHtml;
  if (cartTotalEl) cartTotalEl.textContent = `$${formatPrice(overallTotal)}`;
}

window.changeCartItemSupplier = function(productId, oldSupplierId, newSupplierId) {
  if (oldSupplierId === newSupplierId) return;

  const itemIndex = cart.findIndex(item => item.product_id === productId && item.supplier_id === oldSupplierId);
  if (itemIndex === -1) return;

  const item = cart[itemIndex];
  
  // Find info of the new supplier option
  const targetOption = item.suppliers.find(s => s.supplier_id === newSupplierId);
  if (!targetOption) return;

  // Retrieve full link from base product cache
  const product = baseProducts.find(p => p.id === productId);
  let link = item.link;
  if (product) {
    const supProd = product.supplier_products.find(s => s.supplier_id === newSupplierId);
    if (supProd) {
      link = supProd.link;
    }
  }

  // Check if we already have an item in the cart with the new supplier
  const duplicateIndex = cart.findIndex(i => i.product_id === productId && i.supplier_id === newSupplierId);

  if (duplicateIndex !== -1) {
    // Merge quantity and delete old item
    cart[duplicateIndex].quantity += item.quantity;
    cart.splice(itemIndex, 1);
  } else {
    // Just update supplier info
    item.supplier_id = newSupplierId;
    item.price = targetOption.price;
    item.link = link;
  }

  saveCart();
  renderCart();
  updateCartBadge();
  showToast('Proveedor modificado en el carrito');
};

window.removeCartItem = function(productId, supplierId) {
  cart = cart.filter(item => !(item.product_id === productId && item.supplier_id === supplierId));
  saveCart();
  renderCart();
  updateCartBadge();
  showToast('Producto eliminado del pedido');
};

// --- CHECKOUT & WHATSAPP GENERATION ---
function handleCheckout(e) {
  e.preventDefault();

  const vendedorName = document.getElementById('b2b-vendedor-name').value.trim();
  const notes = document.getElementById('b2b-order-notes').value.trim();

  if (cart.length === 0) {
    showToast('El pedido está vacío', true);
    return;
  }

  // Group cart items by supplier
  const groups = {};
  cart.forEach(item => {
    if (!groups[item.supplier_id]) {
      groups[item.supplier_id] = [];
    }
    groups[item.supplier_id].push(item);
  });

  // Build Message
  let msg = `📝 *ORDEN DE COMPRA CONSOLIDADA - BO growclub*\n\n`;
  msg += `👤 *Vendedor:* ${vendedorName}\n`;
  msg += `📅 *Fecha:* ${new Date().toLocaleDateString('es-AR')}\n`;
  if (notes) {
    msg += `💬 *Notas:* ${notes}\n`;
  }
  msg += `\n------------------------------------------\n`;

  let overallTotal = 0;

  for (const supplierId in groups) {
    const items = groups[supplierId];
    const supplierName = supplierNames[supplierId] || supplierId;
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    overallTotal += subtotal;

    msg += `\n🚚 *PROVEEDOR: ${supplierName.toUpperCase()}*\n`;
    items.forEach(item => {
      msg += `- ${item.quantity}x ${item.name} ($${formatPrice(item.price)} c/u)\n`;
      if (item.link) {
        msg += `  🔗 Link: ${item.link}\n`;
      }
    });
    msg += `*Subtotal:* $${formatPrice(subtotal)}\n`;
  }

  msg += `\n------------------------------------------\n`;
  msg += `💰 *TOTAL ESTIMADO COMPRA:* $${formatPrice(overallTotal)}\n\n`;
  msg += `¡Pedido de reposición listo para procesar! 🌿`;

  // Administrador Mariano WhatsApp Number: +54 9 343 467-5428 (5493434675428)
  const purchaseManagerPhone = "5493434675428";
  const waUrl = `https://wa.me/${purchaseManagerPhone}?text=${encodeURIComponent(msg)}`;

  // Clear cart
  cart = [];
  saveCart();
  updateCartBadge();
  renderCart();

  // Close Drawer
  closeCart();
  checkoutForm.reset();

  // Redirect to WhatsApp
  window.open(waUrl, '_blank');
}

// --- PDF COMPARATIVO ---
function generateComparativePDF() {
  if (cart.length === 0) {
    showToast('El pedido está vacío. Agregá productos primero.', true);
    return;
  }

  const vendedorName = document.getElementById('b2b-vendedor-name').value.trim() || 'Vendedor';
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  // Show comparison for ALL defined B2B suppliers in the system
  const supplierIdList = ['astrogrow', 'santaplanta', 'rosse', 'candyclub'];

  // Build rows - one per cart item, flat (not grouped)
  let rowsHtml = '';
  let overallTotal = 0;

  cart.forEach((item, idx) => {
    const lineTotal = item.price * item.quantity;
    overallTotal += lineTotal;
    const allSuppliers = item.suppliers || [];

    // Find cheapest available
    const availableSuppliers = allSuppliers.filter(s => s.available && (s.stock === null || s.stock > 0));
    const cheapestPrice = availableSuppliers.length > 0 ? Math.min(...availableSuppliers.map(s => s.price)) : null;

    // Build one cell per known supplier
    let supplierCells = '';
    supplierIdList.forEach(sid => {
      const sp = allSuppliers.find(s => s.supplier_id === sid);
      const isChosen = sid === item.supplier_id;

      if (!sp || (!sp.available && (sp.stock !== null && sp.stock <= 0)) || !sp.available) {
        // No tiene este producto o sin stock
        const label = sp ? 'SIN STOCK' : '—';
        supplierCells += `<td style="padding:6px 8px; border:1px solid #ddd; text-align:center; color:#c62828; font-size:11px; font-weight:600; background:#fff5f5;">${label}</td>`;
      } else {
        const isCheapest = cheapestPrice !== null && sp.price === cheapestPrice;
        let cellBg = '';
        let extra = '';
        if (isChosen) {
          cellBg = 'background:#e3f2fd;';
          extra = '<div style="font-size:8px; color:#1565c0; font-weight:700; margin-top:2px;">✔ ELEGIDO</div>';
        }
        if (isCheapest) {
          cellBg = isChosen ? 'background:#c8e6c9;' : 'background:#e8f5e9;';
          extra += '<div style="font-size:8px; color:#2e7d32; font-weight:700;">★ MÁS BARATO</div>';
        }
        supplierCells += `<td style="padding:6px 8px; border:1px solid #ddd; text-align:center; ${cellBg}">
          <div style="font-weight:700; font-size:12px;">$${formatPrice(sp.price)}</div>
          ${sp.stock !== null ? '<div style="font-size:9px; color:#666;">' + sp.stock + ' u.</div>' : ''}
          ${extra}
        </td>`;
      }
    });

    rowsHtml += `
      <tr style="${idx % 2 !== 0 ? 'background:#fafaf8;' : ''}">
        <td style="padding:8px; border:1px solid #ddd; text-align:center; width:55px; vertical-align:middle;">
          <img src="${item.image || 'assets/logo.jpg'}" style="width:45px; height:45px; object-fit:contain; border-radius:3px;" onerror="this.style.display='none'">
        </td>
        <td style="padding:8px; border:1px solid #ddd; vertical-align:middle;">
          <div style="font-weight:600; font-size:11px;">${item.name}</div>
          <div style="font-size:10px; color:#888;">${item.category || ''}</div>
        </td>
        <td style="padding:8px; border:1px solid #ddd; text-align:center; font-weight:600; vertical-align:middle;">${item.quantity}</td>
        <td style="padding:8px; border:1px solid #ddd; text-align:right; font-weight:600; vertical-align:middle; white-space:nowrap;">$${formatPrice(item.price)}</td>
        <td style="padding:8px; border:1px solid #ddd; text-align:right; font-weight:700; vertical-align:middle; white-space:nowrap; color:#152d24;">$${formatPrice(lineTotal)}</td>
        ${supplierCells}
      </tr>
    `;
  });

  // Build supplier header columns
  let supplierHeaders = '';
  supplierIdList.forEach(sid => {
    const name = supplierNames[sid] || sid;
    supplierHeaders += `<th style="padding:6px 8px; border:1px solid #ddd; text-align:center; font-size:10px; min-width:90px; background:#f0ece2; writing-mode:horizontal-tb;">${name}</th>`;
  });

  const tableHtml = `
    <table style="width:100%; border-collapse:collapse; font-size:12px; font-family:'Segoe UI',Arial,sans-serif; margin-bottom:20px;">
      <thead>
        <tr>
          <th style="padding:8px; border:1px solid #ddd; width:55px; background:#152d24; color:white;">Img</th>
          <th style="padding:8px; border:1px solid #ddd; text-align:left; background:#152d24; color:white;">Producto</th>
          <th style="padding:8px; border:1px solid #ddd; text-align:center; width:45px; background:#152d24; color:white;">Cant.</th>
          <th style="padding:8px; border:1px solid #ddd; text-align:right; width:80px; background:#152d24; color:white;">P.Unit</th>
          <th style="padding:8px; border:1px solid #ddd; text-align:right; width:80px; background:#152d24; color:white;">Subtotal</th>
          ${supplierHeaders}
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;

  // Full HTML document for print
  const printHtml = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Comprobante de Compra - BO growclub</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; padding: 25px; background: #fff; }
        @media print {
          body { padding: 10px; font-size: 11px; }
          .no-print { display: none !important; }
          @page { margin: 8mm; size: landscape; }
          table { font-size: 10px !important; }
        }
      </style>
    </head>
    <body>
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; border-bottom:3px solid #152d24; padding-bottom:12px;">
        <div>
          <h1 style="font-size:20px; color:#152d24; margin-bottom:3px;">🌿 BO growclub</h1>
          <p style="font-size:12px; color:#c39b4b; text-transform:uppercase; letter-spacing:2px; font-weight:600;">Comprobante de Orden de Compra B2B</p>
        </div>
        <div style="text-align:right; font-size:11px; color:#666;">
          <p><strong>Vendedor:</strong> ${vendedorName}</p>
          <p><strong>Fecha:</strong> ${dateStr} — ${timeStr}</p>
          <p style="margin-top:4px; padding:3px 8px; background:#e8f5e9; border-radius:4px; display:inline-block; font-weight:600; color:#2e7d32;">Ítems: ${cart.length} | Unidades: ${cart.reduce((s,i) => s + i.quantity, 0)}</p>
        </div>
      </div>

      <div style="margin-bottom:12px; padding:8px 12px; background:#fffde7; border:1px solid #fff9c4; border-radius:4px; font-size:10px; color:#555;">
        <strong style="color:#f57f17;">📋 LEYENDA:</strong>
        Las columnas de la derecha muestran el <strong>precio de cada proveedor</strong> para ese producto.
        <span style="color:#c62828; font-weight:700;">SIN STOCK</span> = no disponible.
        <span style="color:#2e7d32; font-weight:700;">★ MÁS BARATO</span> = menor precio.
        <span style="color:#1565c0; font-weight:700;">✔ ELEGIDO</span> = proveedor seleccionado en este pedido.
        <strong>—</strong> = el proveedor no vende este producto.
      </div>

      ${tableHtml}

      <div style="background:#152d24; color:white; padding:12px 18px; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:15px; font-weight:700;">💰 TOTAL ESTIMADO DE COMPRA</span>
        <span style="font-size:20px; font-weight:700; color:#c39b4b;">$${formatPrice(overallTotal)}</span>
      </div>

      <div class="no-print" style="margin-top:20px; text-align:center;">
        <button onclick="window.print()" style="background:#152d24; color:white; border:none; padding:12px 30px; border-radius:6px; font-size:14px; font-weight:600; cursor:pointer; margin-right:10px;">🖨️ Imprimir / Guardar como PDF</button>
        <button onclick="window.close()" style="background:#e0e0e0; color:#333; border:none; padding:12px 30px; border-radius:6px; font-size:14px; font-weight:600; cursor:pointer;">Cerrar</button>
      </div>
    </body>
    </html>
  `;

  // Open in new window for print
  const printWindow = window.open('', '_blank', 'width=1200,height=800');
  if (printWindow) {
    printWindow.document.write(printHtml);
    printWindow.document.close();
  } else {
    showToast('El navegador bloqueó la ventana emergente. Habilitá los popups.', true);
  }
}

// --- UI HELPERS ---
function showLoader(show) {
  if (loader) loader.style.display = show ? 'flex' : 'none';
}

function openCart() {
  if (cartDrawer) cartDrawer.classList.add('open');
  if (cartOverlay) cartOverlay.classList.add('open');
  if (mobileCartBtn) updateMobileNavActive(mobileCartBtn);
}

function closeCart() {
  if (cartDrawer) cartDrawer.classList.remove('open');
  if (cartOverlay) cartOverlay.classList.remove('open');
  if (mobileHomeBtn) updateMobileNavActive(mobileHomeBtn);
}

// Mobile specific drawer toggles
window.openFilters = function() {
  if (sidebarCard) sidebarCard.classList.add('open');
  if (filtersOverlay) filtersOverlay.classList.add('open');
  updateMobileNavActive(mobileFilterBtn);
};

window.closeFilters = function() {
  if (sidebarCard) sidebarCard.classList.remove('open');
  if (filtersOverlay) filtersOverlay.classList.remove('open');
  updateMobileNavActive(mobileHomeBtn);
};

function updateMobileNavActive(activeBtn) {
  const navBtns = [mobileFilterBtn, mobileHomeBtn, mobileCartBtn];
  navBtns.forEach(btn => {
    if (btn) btn.classList.remove('active');
  });
  if (activeBtn) activeBtn.classList.add('active');
}

function showToast(message, isError = false) {
  toastMessageEl.textContent = message;
  
  if (isError) {
    toastEl.style.borderLeftColor = '#d9534f';
  } else {
    toastEl.style.borderLeftColor = 'var(--color-accent-gold)';
  }
  
  toastEl.classList.add('show');
  
  setTimeout(() => {
    toastEl.classList.remove('show');
  }, 3000);
}

function formatPrice(value) {
  return Number(value).toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

// --- VENDOR AUTHENTICATION & AI SALES ENGINE ---

// La nómina y los roles provienen exclusivamente de Supabase Auth + tenant_users.
const AUTHORIZED_VENDEDORES = Object.freeze([]);

window.AUTHORIZED_VENDEDORES = AUTHORIZED_VENDEDORES;



// Vendor Auth Check on Load & Session Management
function selectVendorCard(name) {
  const selectEl = document.getElementById('auth-vendor-select');
  if (selectEl) selectEl.value = name;

  const vendor = AUTHORIZED_VENDEDORES.find(item => item.name === name);
  const profile = document.getElementById('vendor-login-profile');
  const profileInitial = document.getElementById('vendor-login-profile-initial');
  const profileName = document.getElementById('vendor-login-profile-name');
  const profileRole = document.getElementById('vendor-login-profile-role');
  if (profile) profile.hidden = !vendor;
  if (vendor) {
    if (profileInitial) profileInitial.textContent = vendor.name.charAt(0).toUpperCase();
    if (profileName) profileName.textContent = vendor.name;
    if (profileRole) profileRole.textContent = vendor.role;
  }

  setVendorLoginMessage('');

  const passEl = document.getElementById('auth-vendor-password');
  if (passEl) passEl.focus();
}

function setVendorLoginMessage(message, state = 'error') {
  const messageElement = document.getElementById('vendor-login-message');
  if (!messageElement) return;
  messageElement.textContent = message;
  messageElement.dataset.state = state;
  messageElement.hidden = !message;
}

async function ensureVendorOperationalSession({ showLogin = false, forceRefresh = false } = {}) {
  if (!supabaseClient || typeof SaasAuth === 'undefined') {
    if (showLogin) {
      setVendorLoginMessage('El servicio de sesión no está disponible. Recargá la página.', 'error');
      checkVendorAuth();
    }
    return null;
  }

  const context = typeof SaasAuth.ensureOperationalContext === 'function'
    ? await SaasAuth.ensureOperationalContext(supabaseClient, { forceRefresh })
    : SaasAuth.getTenantContext();
  const ready = typeof SaasAuth.isOperationalContextReady === 'function'
    ? SaasAuth.isOperationalContextReady(context)
    : Boolean(context?.isVerified && context?.tenantId && context?.userId);

  if (ready) return context;
  if (showLogin) {
    setVendorLoginMessage('Tu sesión venció o todavía no fue verificada. Ingresá nuevamente para continuar sin perder seguridad.', 'info');
    checkVendorAuth();
  }
  return null;
}

async function reconnectVendorSession() {
  const context = await ensureVendorOperationalSession({ showLogin: true, forceRefresh: true });
  if (!context) return false;
  populatePosSalespeople();
  updateSaasHeaderUI();
  await Promise.all([loadPosRegisters(), loadExternalCatalogOffers()]);
  showToast(`✓ Sesión operativa verificada para ${context.userName}.`);
  return true;
}

function toggleVendorPasswordVisibility() {
  const passwordInput = document.getElementById('auth-vendor-password');
  const toggleButton = document.getElementById('vendor-password-toggle');
  if (!passwordInput || !toggleButton) return;
  const showPassword = passwordInput.type === 'password';
  passwordInput.type = showPassword ? 'text' : 'password';
  toggleButton.textContent = showPassword ? 'Ocultar' : 'Ver';
  toggleButton.setAttribute('aria-label', showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');
  toggleButton.setAttribute('aria-pressed', String(showPassword));
  passwordInput.focus();
}

function checkVendorAuth() {
  const authContext = typeof SaasAuth !== 'undefined'
    ? SaasAuth.getTenantContext()
    : { isVerified: false };
  const hasOperationalSession = typeof SaasAuth !== 'undefined'
    && typeof SaasAuth.isOperationalContextReady === 'function'
    ? SaasAuth.isOperationalContextReady(authContext)
    : Boolean(authContext.isVerified && authContext.tenantId && authContext.userId);
  const activeVendor = hasOperationalSession ? authContext.userName : '';
  const loginScreen = document.getElementById('vendedor-login-screen');
  const portalApp = document.getElementById('vendedor-portal-app');
  const vendorNameHeader = document.getElementById('active-vendor-display-name');
  const vendorCheckoutInput = document.getElementById('b2b-vendedor-name');
  const sidebarName = document.getElementById('vendor-sidebar-name');
  const sidebarAvatar = document.getElementById('vendor-sidebar-avatar');
  const adminConfigLinks = document.querySelectorAll('[data-admin-config-link]');

  if (hasOperationalSession && activeVendor) {
    if (loginScreen) loginScreen.style.display = 'none';
    if (portalApp) portalApp.style.display = 'block';
    const activeVendorNameText = document.getElementById('active-vendor-name-text');
    if (activeVendorNameText) {
      activeVendorNameText.textContent = activeVendor;
    } else if (vendorNameHeader) {
      vendorNameHeader.textContent = `🧑‍💼 ${activeVendor}`;
    }
    if (vendorCheckoutInput) vendorCheckoutInput.value = activeVendor;
    if (sidebarName) sidebarName.textContent = activeVendor;
    if (sidebarAvatar) sidebarAvatar.textContent = activeVendor.charAt(0).toUpperCase();
    const canManageConfiguration = ['ADMIN', 'SUPERADMIN'].includes(String(authContext.role || '').toUpperCase());
    adminConfigLinks.forEach(link => { link.hidden = !canManageConfiguration; });
    const welcomeAvatar = document.getElementById('vendor-welcome-avatar');
    if (welcomeAvatar) welcomeAvatar.textContent = activeVendor.charAt(0).toUpperCase();
    const requestedProductCode = new URLSearchParams(window.location.search).get('product');
    if (requestedProductCode) {
      handleProductLocationDeepLink();
    } else {
      switchVendorTab('home');
    }
  } else {
    adminConfigLinks.forEach(link => { link.hidden = true; });
    if (loginScreen) loginScreen.style.display = 'flex';
    if (portalApp) portalApp.style.display = 'none';
  }
}

async function handleVendorLogin(e) {
  if (e) e.preventDefault();
  const emailEl = document.getElementById('auth-vendor-email');
  const passEl = document.getElementById('auth-vendor-password');

  if (!emailEl || !passEl) return false;

  const email = emailEl.value.trim().toLowerCase();
  const typedPass = passEl.value;

  if (!email || !emailEl.checkValidity()) {
    setVendorLoginMessage('Ingresá el correo válido de tu usuario de equipo.', 'info');
    emailEl.focus();
    return false;
  }

  if (!typedPass) {
    setVendorLoginMessage('Ingresá tu contraseña para continuar.', 'info');
    passEl.focus();
    return false;
  }

  if (!supabaseClient || typeof SaasAuth === 'undefined') {
    setVendorLoginMessage('El servicio de autenticación no está disponible. Recargá la página.', 'error');
    return false;
  }

  const submitButton = document.querySelector('#vendor-login-form button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  setVendorLoginMessage('Validando sesión segura…', 'info');
  try {
    const result = await SaasAuth.signInWithSupabase(supabaseClient, email, typedPass);
    if (!result.success || !result.hydrated) {
      try {
        await supabaseClient.auth.signOut();
      } catch (signOutError) {
        console.warn('No se pudo limpiar la sesión rechazada:', signOutError);
      }
      setVendorLoginMessage(result.error || 'El usuario no pertenece a una empresa activa.');
      passEl.select();
      return false;
    }
    const context = SaasAuth.getTenantContext();
    sessionStorage.setItem('boeweb_vendor_name', context.userName);
    localStorage.setItem('boeweb_vendor_name', context.userName);
    passEl.value = '';
    setVendorLoginMessage('');
    checkVendorAuth();
    populatePosSalespeople();
    showToast(`👋 Sesión segura iniciada para ${context.userName}.`);
    return true;
  } catch (error) {
    console.error('No se pudo iniciar la sesión de vendedor:', error);
    setVendorLoginMessage('No se pudo iniciar sesión. Revisá tus datos o la conexión.');
    return false;
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function openVendorPasswordModal() {
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : { isVerified: false };
  if (!context.isVerified) {
    showToast('⚠️ Debés iniciar sesión como vendedor primero.');
    return;
  }
  const modal = document.getElementById('modal-vendor-change-password');
  const nameEl = document.getElementById('change-password-vendor-name');
  const oldPass = document.getElementById('vendor-old-password');
  const newPass = document.getElementById('vendor-new-password');
  const confirmPass = document.getElementById('vendor-confirm-password');
  const msgEl = document.getElementById('vendor-change-password-msg');

  if (nameEl) nameEl.textContent = context.userName;
  if (oldPass) oldPass.value = '';
  if (newPass) newPass.value = '';
  if (confirmPass) confirmPass.value = '';
  if (msgEl) {
    msgEl.style.display = 'none';
    msgEl.textContent = '';
  }

  if (modal) modal.style.display = 'flex';
  if (oldPass) oldPass.focus();
}

function closeVendorPasswordModal() {
  const modal = document.getElementById('modal-vendor-change-password');
  if (modal) modal.style.display = 'none';
}

async function handleVendorChangePassword(e) {
  if (e) e.preventDefault();
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : { isVerified: false };
  if (!context.isVerified || !supabaseClient) return false;

  const oldPassEl = document.getElementById('vendor-old-password');
  const newPassEl = document.getElementById('vendor-new-password');
  const confirmPassEl = document.getElementById('vendor-confirm-password');
  const msgEl = document.getElementById('vendor-change-password-msg');

  const oldPass = (oldPassEl?.value || '').trim();
  const newPass = (newPassEl?.value || '').trim();
  const confirmPass = (confirmPassEl?.value || '').trim();

  const showModalMsg = (text, isError = true) => {
    if (!msgEl) return;
    msgEl.style.display = 'block';
    msgEl.style.background = isError ? 'rgba(239, 83, 80, 0.25)' : 'rgba(76, 175, 80, 0.25)';
    msgEl.style.border = isError ? '1px solid #ef5350' : '1px solid #4caf50';
    msgEl.style.color = isError ? '#ff8a80' : '#a5d6a7';
    msgEl.textContent = text;
  };

  if (newPass.length < 10) {
    showModalMsg('La nueva contraseña debe tener al menos 10 caracteres.');
    newPassEl?.focus();
    return false;
  }

  if (newPass !== confirmPass) {
    showModalMsg('La nueva contraseña y la confirmación no coinciden.');
    confirmPassEl?.select();
    return false;
  }

  try {
    const reauthenticated = await SaasAuth.signInWithSupabase(supabaseClient, context.userEmail, oldPass);
    if (!reauthenticated.success || !reauthenticated.hydrated) {
      showModalMsg('La contraseña actual no pudo validarse.');
      oldPassEl?.select();
      return false;
    }
    const { error } = await supabaseClient.auth.updateUser({ password: newPass });
    if (error) throw error;
    showModalMsg('Contraseña actualizada de forma segura.', false);
    showToast(`🔑 Contraseña actualizada correctamente para ${context.userName}.`);
    setTimeout(closeVendorPasswordModal, 900);
    return true;
  } catch (error) {
    console.error('No se pudo actualizar la contraseña:', error);
    showModalMsg(error.message || 'No se pudo actualizar la contraseña.');
    return false;
  }
}

async function vendorLogout() {
  if (supabaseClient?.auth) {
    try {
      await supabaseClient.auth.signOut();
    } catch (error) {
      console.warn('La sesión remota no pudo cerrarse limpiamente:', error);
    }
  }
  if (typeof SaasAuth !== 'undefined') SaasAuth.logout();
  sessionStorage.removeItem('boeweb_vendor_name');
  localStorage.removeItem('boeweb_vendor_name');
  checkVendorAuth();
  showToast('🔒 Sesión de vendedor cerrada.');
}

function switchVendorTab(tab) {
  const dashboardHome = document.getElementById('vendor-dashboard-home');
  const mainLayout = document.querySelector('.b2b-main-layout');
  const mapSection = document.getElementById('store-map-section');
  const qrSection = document.getElementById('scan-customer-qr-section');
  const cashSection = document.getElementById('vendor-cash-section');
  const portfolioSection = document.getElementById('vendor-portfolio-section');
  const fastUploadSection = document.getElementById('vendor-fast-upload-section');
  const locationAssistantSection = document.getElementById('vendor-location-assistant-section');
  const draftsReviewSection = document.getElementById('vendor-drafts-review-section');
  const internalCatalogSection = document.getElementById('vendor-internal-catalog-section');
  const webOrdersSection = document.getElementById('vendor-web-orders-section');

  const btnCatalog = document.getElementById('tab-btn-catalog');
  const btnMap = document.getElementById('tab-btn-map');
  const btnScan = document.getElementById('tab-btn-scan');

  const vcardPos = document.getElementById('vcard-pos');
  const vcardCatalog = document.getElementById('vcard-catalog');
  const vcardPortfolio = document.getElementById('vcard-portfolio');
  const vcardCash = document.getElementById('vcard-cash');
  const vcardMap = document.getElementById('vcard-map');
  const vcardScan = document.getElementById('vcard-scan');
  const vcardFastUpload = document.getElementById('vcard-fastupload');
  const vcardLocationAssistant = document.getElementById('vcard-locationassistant');
  const vcardDraftsReview = document.getElementById('vcard-draftsreview');
  const vcardInternalCatalog = document.getElementById('vcard-internalcatalog');
  const vcardWebOrders = document.getElementById('vcard-weborders');
  const vcardExpirations = document.getElementById('vcard-expirations');
  const vcardNearbyStores = document.getElementById('vcard-nearbystores');
  const vcardRetired = document.getElementById('vcard-retired');

  const allBtns = [btnCatalog, btnMap, btnScan];
  allBtns.forEach(btn => { if (btn) btn.classList.remove('active'); });

  const allCards = [vcardPos, vcardCatalog, vcardPortfolio, vcardCash, vcardMap, vcardScan, vcardFastUpload, vcardLocationAssistant, vcardDraftsReview, vcardInternalCatalog, vcardWebOrders, vcardExpirations, vcardNearbyStores, vcardRetired];
  allCards.forEach(card => {
    if (card) {
      card.style.borderColor = 'rgba(255,255,255,0.15)';
      card.style.transform = 'scale(1)';
    }
  });

  if (mainLayout) mainLayout.style.display = 'none';
  if (dashboardHome) dashboardHome.style.display = 'none';
  if (mapSection) mapSection.style.display = 'none';
  if (qrSection) qrSection.style.display = 'none';
  if (cashSection) cashSection.style.display = 'none';
  if (portfolioSection) portfolioSection.style.display = 'none';
  if (fastUploadSection) fastUploadSection.style.display = 'none';
  if (locationAssistantSection) locationAssistantSection.style.display = 'none';
  if (draftsReviewSection) draftsReviewSection.style.display = 'none';
  if (internalCatalogSection) internalCatalogSection.style.display = 'none';
  if (webOrdersSection) webOrdersSection.style.display = 'none';
  const expirationsSection = document.getElementById('vendor-expirations-section');
  if (expirationsSection) expirationsSection.style.display = 'none';
  const fulfillmentsSection = document.getElementById('vendor-fulfillments-section');
  if (fulfillmentsSection) fulfillmentsSection.style.display = 'none';
  const nearbyStoresSection = document.getElementById('vendor-nearby-stores-section');
  if (nearbyStoresSection) nearbyStoresSection.style.display = 'none';
  const retiredSection = document.getElementById('vendor-retired-products-section');
  if (retiredSection) retiredSection.style.display = 'none';
  const wmsSection = document.getElementById('vendor-wms-inventory-section');
  if (wmsSection) wmsSection.style.display = 'none';
  const tenantProfileSection = document.getElementById('vendor-tenant-profile-section');
  if (tenantProfileSection) tenantProfileSection.style.display = 'none';
  const migrationSection = document.getElementById('vendor-migration-center-section');
  if (migrationSection) migrationSection.style.display = 'none';
  const onboardingSection = document.getElementById('vendor-tenant-onboarding-section');
  if (onboardingSection) onboardingSection.style.display = 'none';

  let targetSection = null;

  if (tab === 'home') {
    if (dashboardHome) {
      dashboardHome.style.display = 'block';
      targetSection = dashboardHome;
    }
    renderVendorHomeUI();
  } else if (tab === 'catalog' || tab === 'reposicion') {
    if (mainLayout) {
      mainLayout.style.display = 'grid';
      targetSection = mainLayout;
    }
    if (btnCatalog) btnCatalog.classList.add('active');
    if (vcardCatalog) {
      vcardCatalog.style.borderColor = 'var(--color-accent-gold)';
      vcardCatalog.style.transform = 'scale(1.02)';
    }
    fetchB2BProducts(true)
      .then(() => updateCategoryCounts())
      .catch(error => console.error('No se pudo actualizar el catálogo B2B:', error));
  } else if (tab === 'portfolio') {
    if (portfolioSection) {
      portfolioSection.style.display = 'block';
      targetSection = portfolioSection;
    }
    if (vcardPortfolio) {
      vcardPortfolio.style.borderColor = '#ab47bc';
      vcardPortfolio.style.transform = 'scale(1.02)';
    }
    Promise.all([loadCanonicalCurrentAccounts(), loadCanonicalVendorClients()]).then(() => {
      renderCurrentAccountsUI();
      populatePosCurrentAccountDropdown();
      renderVendorPortfolioUI();
    }).catch(error => console.error('No se pudo actualizar la cartera:', error));
    renderVendorPortfolioUI();
  } else if (tab === 'cash') {
    if (cashSection) {
      cashSection.style.display = 'block';
      targetSection = cashSection;
    }
    if (vcardCash) {
      vcardCash.style.borderColor = '#ffb74d';
      vcardCash.style.transform = 'scale(1.02)';
    }
    const cashDashboard = document.getElementById('cash-classic-dashboard');
    if (cashDashboard) cashDashboard.style.display = 'grid';
    renderCashSectionUI();
    Promise.all([refreshCanonicalCashSection(), loadPosRegisters()])
      .catch(error => console.error('No se pudo actualizar la caja central:', error));
  } else if (tab === 'map' || tab === 'estanteria') {
    if (mapSection) {
      mapSection.style.display = 'block';
      targetSection = mapSection;
    }
    if (btnMap) btnMap.classList.add('active');
    if (vcardMap) {
      vcardMap.style.borderColor = '#42a5f5';
      vcardMap.style.transform = 'scale(1.02)';
    }
    renderStoreMapUI(null, null, null, true);
  } else if (tab === 'scan' || tab === 'qr') {
    if (qrSection) {
      qrSection.style.display = 'block';
      targetSection = qrSection;
    }
    if (btnScan) btnScan.classList.add('active');
    if (vcardScan) {
      vcardScan.style.borderColor = '#66bb6a';
      vcardScan.style.transform = 'scale(1.02)';
    }
  } else if (tab === 'fast-upload' || tab === 'ingresar-producto' || tab === 'ingreso') {
    if (fastUploadSection) {
      fastUploadSection.style.display = 'block';
      targetSection = fastUploadSection;
    }
    if (vcardFastUpload) {
      vcardFastUpload.style.borderColor = 'var(--color-accent-gold)';
      vcardFastUpload.style.transform = 'scale(1.02)';
    }
    initializeFastUploadForm();
    startMobileProductAssistant();
  } else if (tab === 'location-assistant' || tab === 'ubicar' || tab === 'ubicar-producto') {
    if (locationAssistantSection) {
      locationAssistantSection.style.display = 'block';
      targetSection = locationAssistantSection;
    }
    if (vcardLocationAssistant) {
      vcardLocationAssistant.style.borderColor = 'var(--vendor-gold)';
      vcardLocationAssistant.style.transform = 'scale(1.02)';
    }
    loadPendingLocationProducts();
  } else if (tab === 'drafts-review') {
    if (draftsReviewSection) {
      draftsReviewSection.style.display = 'block';
      targetSection = draftsReviewSection;
    }
    if (vcardDraftsReview) {
      vcardDraftsReview.style.borderColor = '#2e7d32';
      vcardDraftsReview.style.transform = 'scale(1.02)';
    }
    loadPendingProductDrafts();
  } else if (tab === 'pos' || tab === 'new-sale' || tab === 'vender' || tab === 'vender-producto') {
    const posSection = document.getElementById('vendor-pos-section');
    if (posSection) {
      posSection.style.display = 'block';
      targetSection = posSection;
    }
    if (vcardPos) {
      vcardPos.style.borderColor = 'var(--color-accent-gold)';
      vcardPos.style.transform = 'scale(1.02)';
    }
    initPosWorkspace();
  } else if (tab === 'internal-catalog') {
    if (internalCatalogSection) {
      internalCatalogSection.style.display = 'block';
      targetSection = internalCatalogSection;
    }
    if (vcardInternalCatalog) {
      vcardInternalCatalog.style.borderColor = '#7ea642';
      vcardInternalCatalog.style.transform = 'scale(1.02)';
    }
    loadInternalCatalog();
  } else if (tab === 'web-orders' || tab === 'orders' || tab === 'pedidos') {
    if (webOrdersSection) {
      webOrdersSection.style.display = 'block';
      targetSection = webOrdersSection;
    }
    if (vcardWebOrders) {
      vcardWebOrders.style.borderColor = '#29b6f6';
      vcardWebOrders.style.transform = 'scale(1.02)';
    }
    loadWebOrders();
  } else if (tab === 'fulfillments' || tab === 'entregas' || tab === 'encargos') {
    const fulSection = document.getElementById('vendor-fulfillments-section');
    if (fulSection) {
      fulSection.style.display = 'block';
      targetSection = fulSection;
    }
    if (typeof initFulfillmentsWorkspace === 'function') initFulfillmentsWorkspace();
  } else if (tab === 'expirations' || tab === 'vencimientos') {
    const expSection = document.getElementById('vendor-expirations-section');
    if (expSection) {
      expSection.style.display = 'block';
      targetSection = expSection;
    }
    if (vcardExpirations) {
      vcardExpirations.style.borderColor = '#e65100';
      vcardExpirations.style.transform = 'scale(1.02)';
    }
    renderExpirationsSection();
  } else if (tab === 'nearby-stores' || tab === 'tiendas-cerca') {
    const nearbySection = document.getElementById('vendor-nearby-stores-section');
    if (nearbySection) {
      nearbySection.style.display = 'block';
      targetSection = nearbySection;
    }
    if (vcardNearbyStores) {
      vcardNearbyStores.style.borderColor = '#1565c0';
      vcardNearbyStores.style.transform = 'scale(1.02)';
    }
    renderNearbyStoresSection();
    loadExternalCatalogOffers('', 'LOCAL_STORE')
      .then(() => renderNearbyStoresSection())
      .catch(error => console.error('No se actualizaron las tiendas locales:', error));
  } else if (tab === 'retired-products' || tab === 'retired' || tab === 'mermas') {
    const retSection = document.getElementById('vendor-retired-products-section');
    if (retSection) {
      retSection.style.display = 'block';
      targetSection = retSection;
    }
    const vcardRet = document.getElementById('vcard-retired');
    if (vcardRet) {
      vcardRet.style.borderColor = '#c2a246';
      vcardRet.style.transform = 'scale(1.02)';
    }
    renderRetiredProductsUI();
    loadWmsInventoryData(true)
      .then(() => renderRetiredProductsUI())
      .catch(error => {
        console.error('No se pudo cargar el historial central de ajustes:', error);
        renderRetiredProductsUI();
      });
  } else if (tab === 'wms-inventory' || tab === 'wms') {
    if (wmsSection) {
      wmsSection.style.display = 'block';
      targetSection = wmsSection;
    }
    renderWmsModulesGrid();
  } else if (tab === 'tenant-profile') {
    if (tenantProfileSection) {
      tenantProfileSection.style.display = 'block';
      targetSection = tenantProfileSection;
    }
    const curVert = document.getElementById('tenant-input-vertical')?.value || 'growshop';
    handleTenantVerticalChange(curVert);
  } else if (tab === 'migration-center') {
    if (migrationSection) {
      migrationSection.style.display = 'block';
      targetSection = migrationSection;
    }
    startNewMigrationWizard();
  } else if (tab === 'tenant-onboarding') {
    if (onboardingSection) {
      onboardingSection.style.display = 'block';
      targetSection = onboardingSection;
    }
    startNewTenantOnboardingWizard();
  }

  let activeSidebarTab = tab;
  if (tab === 'reposicion') activeSidebarTab = 'catalog';
  if (tab === 'estanteria') activeSidebarTab = 'map';
  if (tab === 'ubicar' || tab === 'ubicar-producto') activeSidebarTab = 'location-assistant';
  if (tab === 'ingreso' || tab === 'ingresar-producto') activeSidebarTab = 'fast-upload';
  if (tab === 'new-sale' || tab === 'vender' || tab === 'vender-producto') activeSidebarTab = 'pos';
  document.querySelectorAll('.vendor-side-nav-item').forEach(button => {
    button.classList.toggle('active', button.dataset.vendorTab === activeSidebarTab);
  });

  const mobTabMap = {
    'home': 'mob-nav-home',
    'pos': 'mob-nav-pos',
    'new-sale': 'mob-nav-pos',
    'vender': 'mob-nav-pos',
    'vender-producto': 'mob-nav-pos',
    'fast-upload': 'mob-nav-fastupload',
    'ingresar-producto': 'mob-nav-fastupload',
    'ingreso': 'mob-nav-fastupload',
    'location-assistant': 'mob-nav-location',
    'ubicar': 'mob-nav-location',
    'ubicar-producto': 'mob-nav-location'
  };
  const activeMobNavId = mobTabMap[tab] || 'mob-nav-more';
  document.querySelectorAll('.vendor-mobile-nav-item').forEach(item => {
    item.classList.toggle('active', item.id === activeMobNavId);
  });

  if (targetSection) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scrollBehavior = reducedMotion ? 'auto' : 'smooth';
    if (tab === 'home') {
      window.scrollTo({ top: 0, behavior: scrollBehavior });
    } else {
      targetSection.scrollIntoView({ behavior: scrollBehavior, block: 'start' });
    }
  }
}

function updateVendorNotificationCenter() {
  const pendingOrders = (webOrdersList || []).filter(order => {
    const status = String(order.status || '').toUpperCase();
    return !['DELIVERED', 'CANCELLED', 'EXPIRED'].includes(status);
  }).length;
  const pendingDrafts = Array.from(pendingDraftCache.values())
    .filter(draft => String(draft.status || '').toUpperCase() === 'PENDING').length;
  const pendingExpirations = (internalCatalogProducts || []).filter(product => {
    const expiration = product.metadata?.expiration_date || product.metadata?.expiry_date;
    if (!expiration) return false;
    const expiresAt = new Date(`${expiration}T00:00:00`);
    return Number.isFinite(expiresAt.getTime())
      && expiresAt.getTime() - Date.now() <= 30 * 24 * 60 * 60 * 1000;
  }).length;
  const pendingWms = (internalCatalogProducts || []).filter(product =>
    product.track_stock !== false && (!Array.isArray(product.inventory_options) || product.inventory_options.length === 0)
  ).length;

  const totalAlerts = pendingOrders + pendingDrafts + pendingExpirations + pendingWms;

  const bellBadge = document.getElementById('vendor-nav-notifications-badge');
  const sidebarBellBadge = document.getElementById('vendor-sidebar-notifications-badge');
  const countBadge = document.getElementById('vendor-notif-total-count-badge');
  const listEl = document.getElementById('vendor-notif-items-list');

  if (bellBadge) {
    if (totalAlerts > 0) {
      bellBadge.textContent = totalAlerts > 99 ? '99+' : totalAlerts;
      bellBadge.style.display = 'block';
    } else {
      bellBadge.style.display = 'none';
    }
  }

  if (sidebarBellBadge) {
    if (totalAlerts > 0) {
      sidebarBellBadge.textContent = totalAlerts > 99 ? '99+' : totalAlerts;
      sidebarBellBadge.style.display = 'inline-flex';
    } else {
      sidebarBellBadge.style.display = 'none';
    }
  }

  if (countBadge) {
    countBadge.textContent = `${totalAlerts} ${totalAlerts === 1 ? 'activa' : 'activas'}`;
  }

  if (listEl) {
    if (totalAlerts === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 18px 8px; color: var(--color-text-muted, #68756e); font-size: 0.8rem;">
          ✨ No hay alertas operativas pendientes en este turno.
        </div>
      `;
    } else {
      let itemsHtml = '';
      if (pendingOrders > 0) {
        itemsHtml += `
          <div class="vendor-notif-item" onclick="switchVendorTab('web-orders'); toggleVendorNotificationPanel();">
            <span style="font-size: 1.3rem;">📦</span>
            <div style="flex: 1;">
              <strong style="display: block; font-size: 0.82rem; color: var(--color-text-main);">Pedidos Web (${pendingOrders})</strong>
              <small style="color: var(--color-text-muted); font-size: 0.7rem;">Preparar y cobrar compras online</small>
            </div>
            <span style="background: #e53935; color: #fff; font-size: 0.7rem; font-weight: 800; padding: 2px 7px; border-radius: 8px;">${pendingOrders}</span>
          </div>
        `;
      }
      if (pendingDrafts > 0) {
        itemsHtml += `
          <div class="vendor-notif-item" onclick="switchVendorTab('drafts-review'); toggleVendorNotificationPanel();">
            <span style="font-size: 1.3rem;">👑</span>
            <div style="flex: 1;">
              <strong style="display: block; font-size: 0.82rem; color: var(--color-text-main);">Cola de Aprobación (${pendingDrafts})</strong>
              <small style="color: var(--color-text-muted); font-size: 0.7rem;">Borradores pendientes de revisión</small>
            </div>
            <span style="background: #c62828; color: #fff; font-size: 0.7rem; font-weight: 800; padding: 2px 7px; border-radius: 8px;">${pendingDrafts}</span>
          </div>
        `;
      }
      if (pendingExpirations > 0) {
        itemsHtml += `
          <div class="vendor-notif-item" onclick="switchVendorTab('expirations'); toggleVendorNotificationPanel();">
            <span style="font-size: 1.3rem;">⏳</span>
            <div style="flex: 1;">
              <strong style="display: block; font-size: 0.82rem; color: var(--color-text-main);">Vencimientos Críticos (${pendingExpirations})</strong>
              <small style="color: var(--color-text-muted); font-size: 0.7rem;">Lotes próximos a caducar</small>
            </div>
            <span style="background: #e65100; color: #fff; font-size: 0.7rem; font-weight: 800; padding: 2px 7px; border-radius: 8px;">${pendingExpirations}</span>
          </div>
        `;
      }
      if (pendingWms > 0) {
        itemsHtml += `
          <div class="vendor-notif-item" onclick="switchVendorTab('location-assistant'); toggleVendorNotificationPanel();">
            <span style="font-size: 1.3rem;">⌖</span>
            <div style="flex: 1;">
              <strong style="display: block; font-size: 0.82rem; color: var(--color-text-main);">Pendientes WMS (${pendingWms})</strong>
              <small style="color: var(--color-text-muted); font-size: 0.7rem;">Asignar estantería y nivel</small>
            </div>
            <span style="background: #f57c00; color: #fff; font-size: 0.7rem; font-weight: 800; padding: 2px 7px; border-radius: 8px;">${pendingWms}</span>
          </div>
        `;
      }
      listEl.innerHTML = itemsHtml;
    }
  }
}
window.updateVendorNotificationCenter = updateVendorNotificationCenter;

function toggleVendorNotificationPanel() {
  const dropdown = document.getElementById('vendor-notifications-dropdown');
  if (!dropdown) return;
  const isVisible = dropdown.style.display === 'block';
  dropdown.style.display = isVisible ? 'none' : 'block';
  if (!isVisible) {
    updateVendorNotificationCenter();
  }
}
window.toggleVendorNotificationPanel = toggleVendorNotificationPanel;

// Close notifications dropdown on outside click
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('vendor-notifications-dropdown');
  const bellBtn = document.getElementById('vendor-notifications-bell-btn');
  const sidebarBellBtn = document.getElementById('vendor-notifications-bell-btn-sidebar');
  if (!dropdown || dropdown.style.display !== 'block') return;
  if (!dropdown.contains(e.target) && (!bellBtn || !bellBtn.contains(e.target)) && (!sidebarBellBtn || !sidebarBellBtn.contains(e.target))) {
    dropdown.style.display = 'none';
  }
});

function toggleVendorMobileOperationsMenu() {
  const sheet = document.getElementById('vendor-mobile-operations-sheet');
  if (!sheet) return;
  const isVisible = sheet.style.display === 'flex';
  sheet.style.display = isVisible ? 'none' : 'flex';
}
window.toggleVendorMobileOperationsMenu = toggleVendorMobileOperationsMenu;

function closeVendorMobileOperationsMenu(e) {
  const sheet = document.getElementById('vendor-mobile-operations-sheet');
  if (sheet) sheet.style.display = 'none';
}
window.closeVendorMobileOperationsMenu = closeVendorMobileOperationsMenu;

function renderVendorHomeUI() {
  const activeVendor = sessionStorage.getItem('boeweb_vendor_name') || localStorage.getItem('boeweb_vendor_name') || 'vendedor';
  const cashData = getVendorCashData();
  const totals = calculateCashTotals(cashData);
  const cartCount = cart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const cartTotal = cart.reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.quantity) || 0)), 0);
  const stockAlerts = baseProducts.filter(product => (product.supplier_products || []).some(supplier => {
    const stock = Number(supplier.stock);
    return supplier.available && supplier.stock !== null && Number.isFinite(stock) && stock <= 5;
  })).length;
  refreshPendingLocationBadge();
  if (typeof refreshPendingDraftsBadge === 'function') refreshPendingDraftsBadge();
  const localHour = Number(new Intl.DateTimeFormat('es-AR', {
    timeZone: CASH_TIME_ZONE,
    hour: '2-digit',
    hour12: false
  }).format(new Date()));
  const greeting = localHour < 12 ? 'Buen día' : localHour < 20 ? 'Buenas tardes' : 'Buenas noches';
  const formattedDate = new Intl.DateTimeFormat('es-AR', {
    timeZone: CASH_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date());

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  const welcomeAvatar = document.getElementById('vendor-welcome-avatar');
  if (welcomeAvatar) welcomeAvatar.textContent = activeVendor.charAt(0).toUpperCase();
  setText('vendor-welcome-title', `${greeting}, ${activeVendor}`);
  setText('vendor-welcome-subtitle', '¡Espero que tengas un día lleno de ventas! 🌿🚀');
  setText('vendor-kpi-income', formatCashCurrency(totals.recordedIncome));
  setText('vendor-kpi-expected-cash', formatCashCurrency(totals.expectedCash));
  setText('vendor-kpi-movement-count', `${totals.activeCount} ${totals.activeCount === 1 ? 'movimiento activo' : 'movimientos activos'}`);
  setText('vendor-kpi-cart-count', `${cartCount} ${cartCount === 1 ? 'artículo' : 'artículos'}`);
  setText('vendor-kpi-cart-total', cartCount ? formatCashCurrency(cartTotal) : 'Listo para comenzar');
  setText('vendor-kpi-stock-alerts', `${stockAlerts} ${stockAlerts === 1 ? 'alerta' : 'alertas'}`);
  setText('vendor-home-cash-balance', formatCashCurrency(totals.expectedCash));
  setText('vendor-header-date', formattedDate);
  setText('vendor-header-shift', cashData.closed ? 'Caja cerrada' : 'Turno en curso');
  setText('vendor-sidebar-shift-copy', cashData.closed ? 'Caja cerrada' : 'Turno activo');
  if (typeof refreshWebOrdersBadges === 'function') refreshWebOrdersBadges();
  updateVendorNotificationCenter();

  const shiftPill = document.getElementById('vendor-home-shift-pill');
  if (shiftPill) {
    shiftPill.textContent = cashData.closed ? 'Cerrada' : 'En curso';
    shiftPill.dataset.status = cashData.closed ? 'closed' : 'open';
  }

  const movementList = document.getElementById('vendor-home-movement-list');
  if (!movementList) return;
  const activeMovements = cashData.movements.filter(movement => !movement.voided).slice(0, 4);
  if (activeMovements.length === 0) {
    movementList.innerHTML = '<div class="vendor-home-empty-movements">La caja está lista para comenzar.</div>';
    return;
  }

  movementList.innerHTML = activeMovements.map(movement => {
    const config = CASH_TYPE_CONFIG[movement.type] || CASH_TYPE_CONFIG.venta_efectivo;
    const sign = config.flow === 'out' ? '−' : '+';
    return `
      <div class="vendor-home-movement" data-flow="${config.flow}">
        <span>${escapeCashHtml(config.label)} · ${escapeCashHtml(movement.time || '--:--')}</span>
        <strong>${sign}${formatCashCurrency(movement.amount)}</strong>
      </div>`;
  }).join('');
}

function openCashWithType(type) {
  switchVendorTab('cash');
  const typeField = document.getElementById('cash-entry-type');
  const amountField = document.getElementById('cash-entry-amount');
  if (typeField && CASH_TYPE_CONFIG[type]) typeField.value = type;
  if (amountField && !amountField.disabled) amountField.focus();
}

let storeMapDataLoaded = false;
let storeMapDataLoading = false;

function readLocalProductLocations() {
  // Compatibilidad de lectura para vistas antiguas: la fuente sigue siendo el
  // read model central cargado desde inventory_*_v2, nunca localStorage.
  const rows = window.__canonicalWmsProductLocations;
  return Array.isArray(rows) ? rows.slice() : [];
}

function saveLocalProductLocation() {
  console.warn('Se ignoró una mutación local de ubicación: usá una RPC operativa WMS.');
  return false;
}

function mapLocatedDraftToProductLocation(rawDraft) {
  const draft = hydrateProductDraft(rawDraft);
  const shelfCode = String(draft.shelf_code || '').trim();
  if (draft.status !== 'APPROVED' || !shelfCode) return null;
  const productCode = draft.product_code || draft.id;
  return {
    product_id: productCode,
    product_code: productCode,
    name: draft.name || productCode,
    image_url: draft.image_url || '',
    barcode: draft.barcode || null,
    floor_level: Number(draft.floor_level) || 1,
    shelf_code: shelfCode,
    shelf_level: Number(draft.shelf_level) || 2,
    stock: Math.max(0, Number(draft.stock) || 0),
    qr_payload: draft.qr_payload || buildProductQrPayload(productCode),
    area_name: draft.location_area || null,
    wall_side: draft.location_wall || null,
    shelf_position: draft.shelf_position || null,
    placement_photo_url: draft.placement_photo_url || null,
    placement_photo_path: draft.placement_photo_path || null,
    location_label: draft.location_label || draft.location || null,
    updated_at: draft.updated_at || draft.created_at || new Date().toISOString()
  };
}

async function loadStoreMapData(forceReload = false) {
  if (storeMapDataLoading || (storeMapDataLoaded && !forceReload)) return;
  storeMapDataLoading = true;
  try {
    await loadWmsInventoryData(forceReload);
    if (wmsDataLoadError) throw new Error(wmsDataLoadError);
    const shelves = getWmsModules().map(module => ({
      id: module.id,
      code: module.code,
      name: module.sector_name,
      floor_level: Number(module.metadata?.floor_level) || (String(module.code).startsWith('DP') ? 2 : 1),
      x: Number(module.metadata?.map_x) || undefined,
      y: Number(module.metadata?.map_y) || undefined,
      width: Number(module.metadata?.map_width) || undefined,
      height: Number(module.metadata?.map_height) || undefined,
      icon: module.metadata?.map_icon || undefined,
      location_type: module.location_type,
      is_sellable: module.is_sellable,
      is_default: module.is_default,
      is_anchor: false,
      metadata: module.metadata || {}
    }));
    const productLocations = getWmsLocations().map(location => ({
      ...location,
      floor_level: Number(location.location_metadata?.floor_level) || (String(location.module_code).startsWith('DP') ? 2 : 1),
      shelf_code: location.module_code,
      shelf_level: location.human_level,
      stock: location.quantity,
      location_label: location.location_name,
      wms_code: location.module_code
    }));
    if (window.setStoreMapData) {
      window.setStoreMapData(shelves, productLocations, 'Inventario central sincronizado');
    }
    storeMapDataLoaded = true;
  } catch (error) {
    console.error('Error al sincronizar el mapa:', error);
    if (window.setStoreMapData) window.setStoreMapData([], [], 'Inventario central no disponible');
    storeMapDataLoaded = false;
  } finally {
    storeMapDataLoading = false;
  }
}

async function renderStoreMapUI(activeZone = null, activeShelf = null, targetLevel = null, forceReload = false) {
  const container = document.getElementById('store-map-render-container');
  if (container && window.renderStoreMapHTML) {
    container.innerHTML = window.renderStoreMapHTML(activeZone, activeShelf, targetLevel);
  }
  if (!storeMapDataLoaded || forceReload) {
    await loadStoreMapData(forceReload);
    if (container && window.renderStoreMapHTML) {
      container.innerHTML = window.renderStoreMapHTML(activeZone, activeShelf, targetLevel);
    }
  }
}
window.loadStoreMapData = loadStoreMapData;

function decodeHumanWmsLocation(queryOrCode, matchedProduct = null) {
  const currentShelves = (typeof window !== 'undefined' && Array.isArray(window.storeShelves)) ? window.storeShelves : [];
  const activeShelves = currentShelves.filter(s => !s.is_anchor);
  const raw = String(queryOrCode || (matchedProduct?.wms_code || matchedProduct?.location || matchedProduct?.shelf_code || '')).trim();
  const upper = raw.toUpperCase();

  // Match product only against tenant-scoped catalog and server-backed WMS reads.
  let matched = matchedProduct;
  const storeLocs = (typeof window !== 'undefined' && Array.isArray(window.storeLocationProducts)) ? window.storeLocationProducts : [];
  const allProducts = [...storeLocs, ...(internalCatalogProducts || [])];

  if (!matched && raw) {
    // 1. Direct SKU, barcode, name or ID match
    matched = allProducts.find(p => 
      (p.barcode && p.barcode.toUpperCase() === upper) ||
      (p.product_code && p.product_code.toUpperCase() === upper) ||
      (p.id && String(p.id).toUpperCase() === upper) ||
      (p.name && p.name.toUpperCase() === upper) ||
      (p.name && p.name.toLowerCase().includes(raw.toLowerCase()))
    );
  }

  // Determine if query is a direct full WMS code or shelf code
  const fullParts = upper.split('-');
  const isExplicitWmsCode = fullParts.length >= 5 && (fullParts[0] === 'TI' || fullParts[0] === 'DP');

  let rawShelf = '';
  let zoneCode = 'TI';
  let compassCode = 'F';
  let wallCode = 'P1';
  let shelfCode = 'E1';
  let levelNum = 1;
  let sectorCode = 'C';

  if (isExplicitWmsCode) {
    if (fullParts.length >= 6) {
      zoneCode = fullParts[0];
      compassCode = fullParts[1];
      wallCode = fullParts[2];
      shelfCode = fullParts[3];
      levelNum = Number(fullParts[4].replace(/\D/g, '')) || 1;
      sectorCode = fullParts[5];
    } else {
      zoneCode = fullParts[0];
      compassCode = fullParts[1];
      wallCode = fullParts[2];
      shelfCode = fullParts[2];
      levelNum = Number(fullParts[3].replace(/\D/g, '')) || 1;
      sectorCode = fullParts[4];
    }
    rawShelf = shelfCode;
  } else if (matched) {
    // Check if matched product has an actual location
    const pWms = String(matched.wms_code || '').toUpperCase();
    const pWmsParts = pWms.split('-');
    if (pWmsParts.length >= 5 && (pWmsParts[0] === 'TI' || pWmsParts[0] === 'DP')) {
      if (pWmsParts.length >= 6) {
        zoneCode = pWmsParts[0];
        compassCode = pWmsParts[1];
        wallCode = pWmsParts[2];
        shelfCode = pWmsParts[3];
        levelNum = Number(pWmsParts[4].replace(/\D/g, '')) || 1;
        sectorCode = pWmsParts[5];
      } else {
        zoneCode = pWmsParts[0];
        compassCode = pWmsParts[1];
        wallCode = pWmsParts[2];
        shelfCode = pWmsParts[2];
        levelNum = Number(pWmsParts[3].replace(/\D/g, '')) || 1;
        sectorCode = pWmsParts[4];
      }
      rawShelf = shelfCode;
    } else if (matched.shelf_code && matched.shelf_code !== 'Sin ubicación' && matched.shelf_code !== 'SIN_ASIGNAR') {
      rawShelf = String(matched.shelf_code).toUpperCase();
      shelfCode = rawShelf;
      const wallMatch = rawShelf.match(/P([1-4])/);
      if (wallMatch) wallCode = `P${wallMatch[1]}`;
      levelNum = Number(matched.shelf_level ?? matched.level) || 1;
      sectorCode = matched.sector || 'C';
      zoneCode = matched.floor_level === 2 ? 'DP' : 'TI';
    }
  } else {
    // Check if user typed a shelf code directly (e.g. P3-HEL2, HEL2, P1-E1, etc.)
    const matchedShelfDirect = activeShelves.find(s => {
      const sCode = String(s.code).toUpperCase();
      const sClean = sCode.replace(/[-_ ]/g, '');
      const uClean = upper.replace(/[-_ ]/g, '');
      return sCode === upper || sClean === uClean || sCode.endsWith(upper) || sClean.endsWith(uClean);
    });
    if (matchedShelfDirect) {
      rawShelf = matchedShelfDirect.code;
      shelfCode = matchedShelfDirect.code;
      zoneCode = matchedShelfDirect.floor_level === 2 ? 'DP' : 'TI';
      const wallMatch = shelfCode.match(/P([1-4])/);
      if (wallMatch) wallCode = `P${wallMatch[1]}`;
      compassCode = wallCode === 'P3' ? 'D' : wallCode === 'P4' ? 'I' : wallCode === 'P2' ? 'A' : 'F';
    }
  }

  // Physical shelf validation on current map
  const physicalShelfMatch = rawShelf ? activeShelves.find(s => {
    const sCode = String(s.code).toUpperCase();
    const rUpper = String(rawShelf).toUpperCase();
    const sClean = sCode.replace(/[-_ ]/g, '');
    const rClean = rUpper.replace(/[-_ ]/g, '');
    return sCode === rUpper || sClean === rClean || sCode.endsWith(rUpper) || sClean.endsWith(rClean);
  }) : null;

  const isLocated = Boolean(physicalShelfMatch);
  const layoutShelfCode = physicalShelfMatch ? physicalShelfMatch.code : shelfCode;

  // Area & floor
  const floorLevel = physicalShelfMatch ? physicalShelfMatch.floor_level : ((zoneCode === 'DP' || zoneCode === 'DEPÓSITO') ? 2 : 1);
  const areaLabel = floorLevel === 2 ? 'el Depósito General' : 'la Tienda';

  // Wall text
  const wallMap = {
    'P1': 'Pared 1 (Frente / Norte)',
    'P2': 'Pared 2 (Fondo / Sur)',
    'P3': 'Pared 3 (Lateral Derecho / Este)',
    'P4': 'Pared 4 (Lateral Izquierdo / Oeste)'
  };
  const wallLabel = wallMap[wallCode] || `Pared ${wallCode}`;

  // Compass text
  let compassText = 'al frente de la PC central (Norte)';
  if (compassCode === 'D' || wallCode === 'P3') {
    compassText = 'es la pared derecha respecto a la PC central';
  } else if (compassCode === 'I' || wallCode === 'P4') {
    compassText = 'es la pared izquierda respecto a la PC central';
  } else if (compassCode === 'A' || wallCode === 'P2') {
    compassText = 'es la pared del fondo respecto a la PC central';
  } else if (compassCode === 'F' || wallCode === 'P1') {
    compassText = 'es la pared frontal respecto a la PC central';
  }

  // Furniture description
  let furnitureType = 'Estante de pared';
  const cleanShelfUpper = String(layoutShelfCode).toUpperCase();
  if (cleanShelfUpper.includes('HEL')) {
    furnitureType = 'Heladera / Equipo de frío';
  } else if (cleanShelfUpper.includes('VIT')) {
    furnitureType = 'Vitrina / Mostrador vidriado';
  } else if (cleanShelfUpper.includes('PIS')) {
    furnitureType = 'Pallet de piso (sustratos / bultos)';
  } else if (cleanShelfUpper.includes('E')) {
    const num = cleanShelfUpper.replace(/\D/g, '') || '1';
    furnitureType = `Góndola / Estante ${num}`;
  } else {
    furnitureType = `Módulo ${layoutShelfCode}`;
  }

  // Level description
  const levelDescriptions = {
    1: 'nivel 1 piso / abajo',
    2: 'nivel 2 bajo',
    3: 'nivel 3 medio (a la altura de la vista y manos)',
    4: 'nivel 4 medio-alto',
    5: 'nivel 5 alto',
    6: 'tope superior (arriba del todo)'
  };
  const levelLabel = `Nivel ${levelNum}`;
  const levelDesc = levelDescriptions[levelNum] || `Nivel ${levelNum}`;

  // Sector description
  const sectorDescriptions = {
    'I': 'en el sector izquierdo',
    'C': 'en el centro',
    'D': 'en el sector derecho',
    'U': 'sin sector específico'
  };
  const sectorText = sectorDescriptions[sectorCode] || 'en el centro';

  // Stock & product properties
  let stockCount = matched ? Math.max(0, Number(matched.stock ?? matched.on_hand) || 0) : null;
  let productName = matched?.name || null;
  let productBarcode = matched?.barcode || matched?.product_code || null;
  let productImage = matched?.image || matched?.image_url || matched?.placement_photo_url || null;
  let productCategory = matched?.category || '';
  let productPrice = matched?.price || matched?.sale_price || 0;
  let productDesc = matched?.description || '';
  let productBrand = matched?.brand || '';
  let productId = matched?.id || matched?.product_code || '';

  // Photo
  const shelfPhoto = physicalShelfMatch?.metadata?.photo_url
    || matched?.location_metadata?.photo_url
    || matched?.placement_photo_url
    || null;

  return {
    rawCode: raw,
    isLocated,
    hasMatchedProduct: Boolean(matched),
    shelfExists: Boolean(physicalShelfMatch),
    floorLevel,
    zoneCode,
    areaLabel,
    compassCode,
    compassText,
    wallCode,
    wallLabel,
    shelfCode,
    layoutShelfCode,
    furnitureType,
    levelNum,
    levelLabel,
    levelDesc,
    sectorCode,
    sectorText,
    stockCount: stockCount !== null ? stockCount : 0,
    productName,
    productBarcode,
    productImage,
    productCategory,
    productPrice,
    productDesc,
    productBrand,
    productId,
    shelfPhoto
  };
}

function renderStoreMapLocationCard(info) {
  const cardContainer = document.getElementById('store-map-search-result-card');
  if (!cardContainer) return;

  const escapeFn = typeof escapeMapHtml === 'function' ? escapeMapHtml : (v => String(v || ''));
  const currentShelves = (typeof window !== 'undefined' && Array.isArray(window.storeShelves)) ? window.storeShelves.filter(s => !s.is_anchor) : [];

  // STATE 1: Product or Code is LOCATED on an active shelf on the map
  if (info.isLocated) {
    const title = info.productName ? `${escapeFn(info.productName)}` : `Módulo: ${escapeFn(info.layoutShelfCode)}`;
    const isOutOfStock = info.hasMatchedProduct && info.stockCount === 0;
    const stockBadgeHtml = info.hasMatchedProduct
      ? (info.stockCount > 0
          ? `<strong style="color: #81c784; font-size: 1.18rem; font-weight: 900;">${info.stockCount} unidades disponibles</strong>`
          : `<span style="background: #c62828; color: #fff; padding: 4px 10px; border-radius: 8px; font-weight: 900; font-size: 0.95rem;">🔴 AGOTADO / SIN STOCK (0 u.)</span>`
        )
      : `<span style="color: #ffd54f; font-weight: 700;">Espacio físico configurado en el plano</span>`;

    cardContainer.innerHTML = `
      <div class="location-found-card" style="background: linear-gradient(135deg, #152d24 0%, #1c3c30 100%); border: 2px solid #c2a246; border-radius: 20px; padding: 20px; color: #ffffff; box-shadow: 0 14px 40px rgba(0,0,0,0.4);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; border-bottom: 1px solid rgba(194,162,70,0.3); padding-bottom: 12px;">
          <div style="display: flex; gap: 12px; align-items: center; min-width: 0; flex: 1;">
            ${info.productImage ? `
              <img src="${escapeFn(info.productImage)}" alt="${title}" style="width: 58px; height: 58px; border-radius: 12px; border: 1.5px solid #c2a246; object-fit: cover; background: #fff; flex-shrink: 0;">
            ` : `
              <div style="width: 58px; height: 58px; border-radius: 12px; border: 1.5px solid #c2a246; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; font-size: 1.8rem; flex-shrink: 0;">📦</div>
            `}
            <div style="min-width: 0; flex: 1;">
              <span style="background: rgba(194,162,70,0.25); color: #c2a246; border: 1px solid #c2a246; padding: 2px 8px; border-radius: 8px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase;">
                📍 Ubicación Física Confirmada
              </span>
              <h3 style="margin: 4px 0 0 0; font-size: 1.15rem; color: #ffffff; font-weight: 800; line-height: 1.3; word-break: break-word;">
                ${title}
              </h3>
              ${info.productBarcode ? `<small style="color: rgba(247,246,242,0.7); font-size: 0.78rem; font-family: monospace;">SKU / Código: ${escapeFn(info.productBarcode)}</small>` : `<small style="color: #ffd54f; font-size: 0.75rem;">Módulo: ${escapeFn(info.layoutShelfCode)}</small>`}
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button type="button" onclick="if(window.speakLocationVoicePhrase)window.speakLocationVoicePhrase(window.__lastDecodedWmsLocation||null)" style="padding: 7px 12px; border-radius: 10px; background: rgba(46,125,50,0.3); border: 1.5px solid #81c784; color: #81c784; font-size: 0.78rem; font-weight: 800; cursor: pointer; white-space: nowrap; flex-shrink: 0; display: inline-flex; align-items: center; gap: 4px;" title="Escuchar ubicación por voz">
              🔊 Voz
            </button>
            ${info.productId ? `
              <button type="button" onclick="openProductFullInfoModal('${escapeFn(info.productId)}')" style="padding: 7px 12px; border-radius: 10px; background: rgba(194,162,70,0.25); border: 1.5px solid #c2a246; color: #ffd54f; font-size: 0.78rem; font-weight: 800; cursor: pointer; white-space: nowrap; flex-shrink: 0; display: flex; align-items: center; gap: 4px;">
                ℹ️ Info
              </button>
            ` : ''}
          </div>
        </div>

        <div style="background: rgba(0,0,0,0.3); border-radius: 14px; padding: 16px; border: 1px solid rgba(255,255,255,0.12); margin-bottom: 18px; font-size: 0.95rem; line-height: 1.7;">
          <div style="margin-bottom: 10px;">
            🏢 <strong>Lugar:</strong> El producto se encuentra en <span style="color: #c2a246; font-weight: 800;">${escapeFn(info.areaLabel)}</span>.
          </div>
          <div style="margin-bottom: 10px;">
            🧭 <strong>Pared y Orientación:</strong> <span style="color: #a5d6a7; font-weight: 700;">${escapeFn(info.wallLabel)}</span> (${escapeFn(info.compassText)}).
          </div>
          <div style="margin-bottom: 10px;">
            🪵 <strong>Tipo de Mueble:</strong> <span style="color: #ffffff; font-weight: 700;">${escapeFn(info.furnitureType)}</span> (${escapeFn(info.layoutShelfCode)}).
          </div>
          <div style="margin-bottom: 10px;">
            ↕️ <strong>Nivel / Altura:</strong> <span style="color: #ffd54f; font-weight: 800;">${escapeFn(info.levelLabel)}</span> (${escapeFn(info.levelDesc)}).
          </div>
          <div style="margin-bottom: 10px;">
            ↔️ <strong>Posición:</strong> <span style="color: #ffffff; font-weight: 700;">${escapeFn(info.sectorText)}</span>.
          </div>
          <div>
            📦 <strong>Unidades disponibles:</strong> ${stockBadgeHtml}.
          </div>
        </div>

        ${info.shelfPhoto ? `
          <div style="margin-bottom: 18px; text-align: center; background: rgba(0,0,0,0.25); padding: 12px; border-radius: 14px;">
            <span style="display: block; font-size: 0.8rem; color: rgba(255,255,255,0.8); margin-bottom: 8px; font-weight: 600;">📸 Foto de la estantería:</span>
            <img src="${escapeFn(info.shelfPhoto)}" alt="Foto del estante" style="max-height: 180px; width: auto; max-width: 100%; border-radius: 10px; border: 1.5px solid #c2a246; object-fit: cover;">
          </div>
        ` : ''}

        ${info.hasMatchedProduct ? `
          <div style="display: grid; grid-template-columns: ${isOutOfStock ? '1fr' : '1fr 1fr'}; gap: 10px; margin-bottom: 12px;">
            <button type="button" onclick="openStockAdjustmentModal('${escapeFn(info.productId || info.productBarcode || info.productName || info.rawCode)}', 'add')" style="padding: 12px 14px; border-radius: 12px; font-weight: 800; font-size: 0.92rem; background: ${isOutOfStock ? '#2e7d32' : 'rgba(76,175,80,0.25)'}; border: 1.5px solid #81c784; color: #ffffff; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
              ${isOutOfStock ? '🔄 Reponer / Ingresar stock' : '➕ Agregar stock'}
            </button>
            ${!isOutOfStock ? `
              <button type="button" onclick="openStockAdjustmentModal('${escapeFn(info.productId || info.productBarcode || info.productName || info.rawCode)}', 'remove')" style="padding: 12px 14px; border-radius: 12px; font-weight: 800; font-size: 0.88rem; background: rgba(239,83,80,0.25); border: 1.5px solid #ef5350; color: #ef9a9a; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                ➖ Quitar stock
              </button>
            ` : ''}
          </div>
        ` : ''}

        <div>
          <button type="button" onclick="closeStoreMapLocationCard()" style="width: 100%; min-height: 52px; padding: 14px 20px; font-size: 1.05rem; font-weight: 900; background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%); color: #ffffff; border: 2px solid #81c784; border-radius: 14px; cursor: pointer; box-shadow: 0 6px 20px rgba(46,125,50,0.45); display: flex; align-items: center; justify-content: center; gap: 10px;">
            ✅ Encontrado
          </button>
        </div>
      </div>
    `;
    cardContainer.style.display = 'block';
    cardContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  // STATE 2: Product exists in catalog/stock but has NO location assigned in the active map
  if (info.hasMatchedProduct) {
    const title = `${escapeFn(info.productName)}`;
    const shelfOptionsHtml = currentShelves.length
      ? currentShelves.map(s => `<option value="${escapeFn(s.code)}" data-floor="${s.floor_level}">${s.floor_level === 2 ? '📦 Depósito' : '🌿 Tienda'} · Módulo ${escapeFn(s.code)} (${s.icon || '🗄️'})</option>`).join('')
      : '<option value="">(No hay estantes creados en el plano)</option>';

    cardContainer.innerHTML = `
      <div class="location-found-card" style="background: linear-gradient(135deg, #221d15 0%, #332a1c 100%); border: 2px solid #f57c00; border-radius: 20px; padding: 20px; color: #ffffff; box-shadow: 0 14px 40px rgba(0,0,0,0.4);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; border-bottom: 1px solid rgba(245,124,0,0.3); padding-bottom: 12px;">
          <div style="display: flex; gap: 12px; align-items: center; min-width: 0; flex: 1;">
            ${info.productImage ? `
              <img src="${escapeFn(info.productImage)}" alt="${title}" style="width: 58px; height: 58px; border-radius: 12px; border: 1.5px solid #f57c00; object-fit: cover; background: #fff; flex-shrink: 0;">
            ` : `
              <div style="width: 58px; height: 58px; border-radius: 12px; border: 1.5px solid #f57c00; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; font-size: 1.8rem; flex-shrink: 0;">📦</div>
            `}
            <div style="min-width: 0; flex: 1;">
              <span style="background: rgba(245,124,0,0.25); color: #ffb74d; border: 1px solid #f57c00; padding: 2px 8px; border-radius: 8px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase;">
                ⚠️ Sin Ubicación en el Plano
              </span>
              <h3 style="margin: 4px 0 0 0; font-size: 1.15rem; color: #ffffff; font-weight: 800; line-height: 1.3; word-break: break-word;">
                ${title}
              </h3>
              <small style="color: rgba(247,246,242,0.7); font-size: 0.78rem;">Stock: ${info.stockCount} u. · SKU: ${escapeFn(info.productBarcode || info.productId)}</small>
            </div>
          </div>
          <button type="button" onclick="if(window.speakLocationVoicePhrase)window.speakLocationVoicePhrase(window.__lastDecodedWmsLocation||null)" style="padding: 7px 12px; border-radius: 10px; background: rgba(245,124,0,0.25); border: 1.5px solid #f57c00; color: #ffb74d; font-size: 0.78rem; font-weight: 800; cursor: pointer; white-space: nowrap; flex-shrink: 0; display: inline-flex; align-items: center; gap: 4px;">
            🔊 Voz
          </button>
        </div>

        <div style="background: rgba(0,0,0,0.3); border-radius: 14px; padding: 16px; border: 1px solid rgba(245,124,0,0.25); margin-bottom: 16px; font-size: 0.92rem; line-height: 1.6;">
          <p style="margin: 0 0 8px 0; color: #ffb74d; font-weight: 800;">
            📦 El producto está registrado en el inventario comercial (${info.stockCount} unidades), pero todavía no fue asignado a ningún módulo o estante de este local.
          </p>
          <p style="margin: 0; font-size: 0.84rem; color: rgba(246,243,232,0.85);">
            Asignalo a uno de tus módulos activos para que aparezca resaltado en el plano y los vendedores puedan ubicarlo físicamente.
          </p>
        </div>

        ${currentShelves.length ? `
          <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 14px; margin-bottom: 16px;">
            <strong style="display: block; font-size: 0.85rem; color: #c2a246; margin-bottom: 10px;">📍 Ubicación de destino propuesta:</strong>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
              <div>
                <label style="display: block; font-size: 0.72rem; color: rgba(255,255,255,0.7); margin-bottom: 3px;">Módulo del local</label>
                <select id="quick-assign-shelf-select" style="width: 100%; padding: 8px 10px; border-radius: 8px; background: #152d24; border: 1px solid #c2a246; color: #fff; font-size: 0.82rem; font-weight: 700;">
                  ${shelfOptionsHtml}
                </select>
              </div>
              <div>
                <label style="display: block; font-size: 0.72rem; color: rgba(255,255,255,0.7); margin-bottom: 3px;">Nivel / Altura</label>
                <select id="quick-assign-level-select" style="width: 100%; padding: 8px 10px; border-radius: 8px; background: #152d24; border: 1px solid #c2a246; color: #fff; font-size: 0.82rem; font-weight: 700;">
                  <option value="1">Nivel 1 (Piso / Base)</option>
                  <option value="2">Nivel 2 (Bajo)</option>
                  <option value="3" selected>Nivel 3 (Medio / Ojos)</option>
                  <option value="4">Nivel 4 (Medio Alto)</option>
                  <option value="5">Nivel 5 (Alto)</option>
                  <option value="6">Nivel 6 (Tope)</option>
                </select>
              </div>
            </div>

            <button type="button" onclick="switchVendorTab('wms-inventory')" style="width: 100%; padding: 12px; border-radius: 10px; background: #c2a246; color: #152d24; font-weight: 900; border: none; cursor: pointer; font-size: 0.92rem; display: flex; align-items: center; justify-content: center; gap: 6px;">
              ⇄ Abrir inventario físico para transferir
            </button>
          </div>
        ` : `
          <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 12px; margin-bottom: 16px; font-size: 0.82rem; color: #ffd54f;">
            💡 Primero hacé clic en '🛠️ EDITAR PLANO' -> '➕ NUEVO MÓDULO' para crear los estantes o heladeras de tu tienda.
          </div>
        `}

        <div>
          <button type="button" onclick="closeStoreMapLocationCard()" style="width: 100%; padding: 12px; border-radius: 10px; background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.25); cursor: pointer; font-weight: 700;">
            Cerrar
          </button>
        </div>
      </div>
    `;
    cardContainer.style.display = 'block';
    cardContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  // STATE 3: Nothing matched (neither product nor shelf)
  cardContainer.innerHTML = `
    <div class="location-found-card" style="background: linear-gradient(135deg, #2a1515 0%, #3d1c1c 100%); border: 2px solid #e53935; border-radius: 20px; padding: 20px; color: #ffffff; box-shadow: 0 14px 40px rgba(0,0,0,0.4);">
      <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 12px;">
        <span style="font-size: 2rem;">🔍</span>
        <div>
          <span style="background: rgba(229,57,53,0.25); color: #ef9a9a; border: 1px solid #e53935; padding: 2px 8px; border-radius: 8px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase;">
            No Encontrado
          </span>
          <h3 style="margin: 4px 0 0 0; font-size: 1.1rem; color: #ffffff; font-weight: 800;">
            No se encontró "${escapeFn(info.rawCode)}"
          </h3>
        </div>
      </div>
      <p style="margin: 0 0 16px 0; font-size: 0.86rem; color: rgba(247,246,242,0.8); line-height: 1.5;">
        El término ingresado no coincide con ningún producto del catálogo, código de barras ni módulo de guardado activo en el plano.
      </p>
      <button type="button" onclick="closeStoreMapLocationCard()" style="width: 100%; padding: 12px; border-radius: 10px; background: rgba(255,255,255,0.15); color: #fff; border: 1px solid rgba(255,255,255,0.25); cursor: pointer; font-weight: 800;">
        Entendido
      </button>
    </div>
  `;
  cardContainer.style.display = 'block';
  cardContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeStoreMapLocationCard() {
  const cardContainer = document.getElementById('store-map-search-result-card');
  if (cardContainer) {
    cardContainer.style.display = 'none';
    cardContainer.innerHTML = '';
  }
}

function searchShelfOnMap() {
  const input = document.getElementById('map-search-input');
  if (!input) return;
  const rawVal = input.value.trim();
  if (!rawVal) {
    closeStoreMapLocationCard();
    renderStoreMapUI();
    return;
  }

  // 1. Check if it's a product in storeLocationProducts or internalCatalog
  let productMatch = null;
  if (window.findStoreMapProduct) {
    const res = window.findStoreMapProduct(rawVal);
    if (res) productMatch = res.product;
  }
  if (!productMatch && typeof internalCatalogProducts !== 'undefined' && Array.isArray(internalCatalogProducts)) {
    const q = rawVal.toLowerCase();
    productMatch = internalCatalogProducts.find(p => 
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.barcode && p.barcode.toLowerCase() === q) ||
      (p.product_code && p.product_code.toLowerCase() === q) ||
      (p.id && String(p.id).toLowerCase() === q) ||
      (p.wms_code && p.wms_code.toLowerCase() === q) ||
      (p.location && p.location.toLowerCase().includes(q))
    );
  }

  // 2. Decode human location information
  const info = decodeHumanWmsLocation(rawVal, productMatch);
  window.__lastDecodedWmsLocation = info;

  // 3. Render persistent card
  renderStoreMapLocationCard(info);

  // 4. Voice assistance speech output
  if (window.speakLocationVoicePhrase) {
    window.speakLocationVoicePhrase(info);
  }

  // 5. Update the interactive 2D/3D map ONLY if located on an active shelf
  if (info.isLocated) {
    if (window.setFloorLevel) {
      window.setFloorLevel(info.floorLevel);
    }
    if (window.selectShelf) {
      window.selectShelf(info.layoutShelfCode || info.shelfCode, info.levelNum);
    }
    renderStoreMapUI(info.wallCode || info.zoneCode, info.layoutShelfCode || info.shelfCode, info.levelNum);
  }
}

function assignProductToStoreShelf() {
  if (window.showToast) {
    window.showToast('🔒 La asignación rápida local fue desactivada. Usá Inventario físico → Mover para registrar una transferencia central y auditable.');
  }
}
window.assignProductToStoreShelf = assignProductToStoreShelf;

let voiceAssistantActiveRecognition = null;

function speakVoiceAssistantPhrase(text, onEndCallback = null) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    if (onEndCallback) onEndCallback();
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-AR';
    utterance.rate = 1.02;
    utterance.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const esVoice = voices.find(v => v.lang && (v.lang === 'es-AR' || v.lang.startsWith('es-419') || v.lang === 'es-US' || v.lang.startsWith('es')));
    if (esVoice) utterance.voice = esVoice;
    if (onEndCallback) {
      utterance.onend = onEndCallback;
      utterance.onerror = onEndCallback;
    }
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Voice speech error:', err);
    if (onEndCallback) onEndCallback();
  }
}

function startVoiceLocationAssistantFlow() {
  const container = document.getElementById('voice-assistant-hub-container');
  if (!container) return;
  container.style.display = 'block';
  container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // 1. Initial Prompt Audio & UI
  renderVoiceAssistantStep1('', true);

  // 2. Speak initial question: "¿Qué producto estás buscando?"
  speakVoiceAssistantPhrase('¿Qué producto estás buscando?', () => {
    // Start listening once question finishes
    startVoiceAssistantListening();
  });
}

function renderVoiceAssistantStep1(query = '', isListening = true) {
  const container = document.getElementById('voice-assistant-hub-container');
  if (!container) return;

  const escapeFn = typeof escapeMapHtml === 'function' ? escapeMapHtml : (v => String(v || ''));

  container.innerHTML = `
    <div class="voice-assistant-hub" role="region" aria-label="Asistente de Voz WMS">
      <div class="voice-assistant-header">
        <div class="voice-assistant-title-group">
          <span style="font-size: 1.4rem;">🎙️</span>
          <div>
            <strong style="font-size: 0.95rem; color: #ffffff; display: block;">Asistente de Voz WMS</strong>
            <small style="color: #a5d6a7; font-size: 0.74rem;">Reconocimiento y guía presencial</small>
          </div>
        </div>
        <button type="button" onclick="closeVoiceLocationAssistant()" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.25); color: #fff; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-weight: 800;" aria-label="Cerrar asistente">✕</button>
      </div>

      <div class="voice-assistant-prompt-bubble">
        <h3>¿Qué producto estás buscando?</h3>
        <p>${isListening ? '🎙️ Hablá ahora o escribí el nombre/código...' : 'Podés dictar de nuevo o seleccionar una coincidencia.'}</p>
      </div>

      ${isListening ? `
        <div class="voice-wave-container" aria-hidden="true">
          <div class="voice-wave-bar"></div>
          <div class="voice-wave-bar"></div>
          <div class="voice-wave-bar"></div>
          <div class="voice-wave-bar"></div>
          <div class="voice-wave-bar"></div>
          <div class="voice-wave-bar"></div>
        </div>
      ` : ''}

      <div style="display: flex; gap: 8px; margin-bottom: 12px;">
        <input type="text" id="voice-assistant-input" class="b2b-form-input" value="${escapeFn(query)}" placeholder="Decí o escribí el producto..." oninput="handleVoiceAssistantSearchInput(this.value)" style="flex: 1; background: #0f2318; border: 1.5px solid #c2a246; color: #fff; padding: 12px 14px; border-radius: 12px; font-size: 0.95rem;" autofocus>
        <button type="button" class="store-map-mic-btn ${isListening ? 'recording' : ''}" onclick="toggleVoiceAssistantListening()" style="width: 48px; height: 48px; border-radius: 12px;" title="${isListening ? 'Detener micrófono' : 'Iniciar micrófono'}">
          ${isListening ? '🔴' : '🎙️'}
        </button>
      </div>

      <div id="voice-assistant-matches-box"></div>
    </div>
  `;

  if (query) {
    handleVoiceAssistantSearchInput(query);
  }
}

function startVoiceAssistantListening() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (typeof showToast === 'function') showToast('⚠️ Tu navegador no soporta reconocimiento de voz nativo.');
    return;
  }

  try {
    if (voiceAssistantActiveRecognition) {
      voiceAssistantActiveRecognition.abort();
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-AR';
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      const query = final || interim;
      const inputEl = document.getElementById('voice-assistant-input');
      if (inputEl && query) {
        inputEl.value = query;
        handleVoiceAssistantSearchInput(query);
      }
    };

    recognition.onerror = (event) => {
      console.warn('Assistant speech recognition error:', event.error);
    };

    recognition.onend = () => {
      voiceAssistantActiveRecognition = null;
      const micBtn = document.querySelector('.voice-assistant-hub .store-map-mic-btn');
      if (micBtn) {
        micBtn.classList.remove('recording');
        micBtn.innerHTML = '🎙️';
      }
    };

    voiceAssistantActiveRecognition = recognition;
    recognition.start();
  } catch (err) {
    console.warn('Could not start recognition:', err);
  }
}

function toggleVoiceAssistantListening() {
  if (voiceAssistantActiveRecognition) {
    voiceAssistantActiveRecognition.abort();
    voiceAssistantActiveRecognition = null;
    const inputEl = document.getElementById('voice-assistant-input');
    renderVoiceAssistantStep1(inputEl ? inputEl.value : '', false);
  } else {
    renderVoiceAssistantStep1(document.getElementById('voice-assistant-input')?.value || '', true);
    startVoiceAssistantListening();
  }
}

function handleVoiceAssistantSearchInput(query) {
  const box = document.getElementById('voice-assistant-matches-box');
  if (!box) return;
  const q = String(query || '').trim().toLowerCase();
  if (!q) {
    box.innerHTML = '';
    return;
  }

  const escapeFn = typeof escapeMapHtml === 'function' ? escapeMapHtml : (v => String(v || ''));
  const allProds = typeof getAllSearchableProducts === 'function' ? getAllSearchableProducts() : [];

  const unique = new Map();
  allProds.forEach(p => {
    const id = String(p.product_code || p.id || p.name).trim();
    if (!id || unique.has(id)) return;
    const nameMatch = p.name && p.name.toLowerCase().includes(q);
    const barcodeMatch = p.barcode && p.barcode.toLowerCase() === q;
    const codeMatch = (p.product_code && p.product_code.toLowerCase().includes(q)) || (p.wms_code && p.wms_code.toLowerCase().includes(q));
    const catMatch = p.category && p.category.toLowerCase().includes(q);
    if (nameMatch || barcodeMatch || codeMatch || catMatch) {
      unique.set(id, p);
    }
  });

  const matches = Array.from(unique.values()).slice(0, 8);

  if (!matches.length) {
    box.innerHTML = `
      <div style="padding: 16px; background: rgba(0,0,0,0.25); border-radius: 12px; text-align: center; color: rgba(246,243,232,0.7); font-size: 0.84rem;">
        🔍 No se encontraron productos coincidentes con "<strong>${escapeFn(query)}</strong>".
      </div>
    `;
    return;
  }

  box.innerHTML = `
    <div style="margin-top: 10px;">
      <small style="color: #ffd54f; font-weight: 700; display: block; margin-bottom: 8px;">
        ✨ Seleccioná el producto deseado (${matches.length} coincidencia${matches.length > 1 ? 's' : ''}):
      </small>
      <div class="voice-match-list">
        ${matches.map(p => {
          const img = p.image || p.image_url || p.placement_photo_url;
          const stock = Math.max(0, Number(p.stock ?? p.on_hand) || 0);
          const hasLocation = Boolean(p.shelf_code && p.shelf_code !== 'Sin ubicación' && p.shelf_code !== 'SIN_ASIGNAR');
          const pId = escapeFn(p.product_code || p.id || p.name);
          return `
            <button type="button" class="voice-match-card" onclick="selectVoiceAssistantProduct('${pId}')">
              ${img ? `<img src="${escapeFn(img)}" alt="${escapeFn(p.name)}" style="width: 44px; height: 44px; border-radius: 8px; object-fit: cover; background: #fff; flex-shrink: 0;">` : `<div style="width: 44px; height: 44px; border-radius: 8px; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 1.4rem; flex-shrink: 0;">📦</div>`}
              <div style="flex: 1; min-width: 0;">
                <strong style="display: block; font-size: 0.88rem; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeFn(p.name || pId)}</strong>
                <div style="display: flex; gap: 6px; align-items: center; margin-top: 3px; font-size: 0.72rem;">
                  <span style="color: ${stock > 0 ? '#81c784' : '#ef5350'}; font-weight: 700;">${stock > 0 ? `${stock} u.` : 'Sin stock'}</span>
                  <span style="color: rgba(255,255,255,0.4);">•</span>
                  <span style="color: ${hasLocation ? '#c2a246' : 'rgba(255,255,255,0.6)'}; font-weight: 600;">${hasLocation ? `📍 ${escapeFn(p.shelf_code)}` : '⚠️ Sin estante'}</span>
                </div>
              </div>
              <span style="color: #ffd54f; font-size: 1.1rem;">➔</span>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function selectVoiceAssistantProduct(productIdOrCode) {
  if (voiceAssistantActiveRecognition) {
    voiceAssistantActiveRecognition.abort();
    voiceAssistantActiveRecognition = null;
  }

  // 1. Find product
  const allProds = typeof getAllSearchableProducts === 'function' ? getAllSearchableProducts() : [];
  const matched = allProds.find(p => String(p.product_code || p.id).toUpperCase() === String(productIdOrCode).toUpperCase() || String(p.name).toLowerCase() === String(productIdOrCode).toLowerCase());

  // 2. Decode WMS location info
  const info = decodeHumanWmsLocation(productIdOrCode, matched);
  window.__lastDecodedWmsLocation = info;

  // 3. Render Step 3 in Voice Hub
  renderVoiceAssistantStep3(info);

  // 4. Voice narration
  if (window.speakLocationVoicePhrase) {
    window.speakLocationVoicePhrase(info);
  }

  // 5. Update interactive map
  if (info.isLocated) {
    if (window.setFloorLevel) window.setFloorLevel(info.floorLevel);
    if (window.selectShelf) window.selectShelf(info.layoutShelfCode || info.shelfCode, info.levelNum);
    renderStoreMapUI(info.wallCode || info.zoneCode, info.layoutShelfCode || info.shelfCode, info.levelNum);
  }
}

function renderVoiceAssistantStep3(info) {
  const container = document.getElementById('voice-assistant-hub-container');
  if (!container) return;

  const escapeFn = typeof escapeMapHtml === 'function' ? escapeMapHtml : (v => String(v || ''));
  const currentShelves = (typeof window !== 'undefined' && Array.isArray(window.storeShelves)) ? window.storeShelves.filter(s => !s.is_anchor) : [];
  const title = info.productName ? `${escapeFn(info.productName)}` : `Módulo: ${escapeFn(info.layoutShelfCode)}`;

  // Determine shelf photo or visual fallback
  let shelfPhotoSrc = info.shelfPhoto;
  let isRealShelfPhoto = Boolean(shelfPhotoSrc);
  if (!shelfPhotoSrc) {
    shelfPhotoSrc = 'assets/store-shelf-map-gba.jpg';
  }

  container.innerHTML = `
    <div class="voice-assistant-hub" role="region" aria-label="Ubicación encontrada">
      <div class="voice-assistant-header">
        <div class="voice-assistant-title-group">
          <span style="font-size: 1.4rem;">📍</span>
          <div>
            <strong style="font-size: 0.95rem; color: #ffffff; display: block;">Ubicación Física del Producto</strong>
            <small style="color: #c2a246; font-size: 0.74rem;">${escapeFn(info.layoutShelfCode)} · ${escapeFn(info.areaLabel)}</small>
          </div>
        </div>
        <div style="display: flex; gap: 6px;">
          <button type="button" onclick="startVoiceLocationAssistantFlow()" style="background: rgba(194,162,70,0.25); border: 1.5px solid #c2a246; color: #ffd54f; padding: 6px 12px; border-radius: 10px; font-weight: 800; font-size: 0.78rem; cursor: pointer; display: flex; align-items: center; gap: 4px;">
            🎙️ Buscar otro
          </button>
          <button type="button" onclick="closeVoiceLocationAssistant()" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.25); color: #fff; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-weight: 800;" aria-label="Cerrar asistente">✕</button>
        </div>
      </div>

      <!-- 1. FOTO PRINCIPAL DEL ESTANTE DONDE ESTÁ EL PRODUCTO -->
      <div class="voice-shelf-photo-banner">
        <span class="voice-shelf-photo-tag">
          ${isRealShelfPhoto ? `📸 Foto Real: ${escapeFn(info.layoutShelfCode)}` : `🧭 Plano Ilustrado: ${escapeFn(info.wallLabel)}`}
        </span>
        <img src="${escapeFn(shelfPhotoSrc)}" alt="Foto del estante ${escapeFn(info.layoutShelfCode)}">
      </div>

      <!-- 2. DATOS DEL PRODUCTO Y UBICACIÓN FÍSICA DETALLADA -->
      <div style="background: rgba(0,0,0,0.35); border-radius: 16px; padding: 18px; border: 1px solid rgba(194,162,70,0.3); margin-bottom: 16px;">
        
        <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 14px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 12px;">
          ${info.productImage ? `
            <img src="${escapeFn(info.productImage)}" alt="${title}" style="width: 52px; height: 52px; border-radius: 10px; border: 1.5px solid #c2a246; object-fit: cover; background: #fff; flex-shrink: 0;">
          ` : `
            <div style="width: 52px; height: 52px; border-radius: 10px; border: 1.5px solid #c2a246; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 1.6rem; flex-shrink: 0;">📦</div>
          `}
          <div style="flex: 1; min-width: 0;">
            <h3 style="margin: 0 0 3px 0; font-size: 1.12rem; color: #ffffff; font-weight: 800;">${title}</h3>
            <small style="color: rgba(246,243,232,0.7); font-size: 0.76rem; font-family: monospace;">SKU: ${escapeFn(info.productBarcode || info.productId || info.rawCode)}</small>
          </div>
          <button type="button" onclick="if(window.speakLocationVoicePhrase)window.speakLocationVoicePhrase(window.__lastDecodedWmsLocation||null)" style="padding: 8px 12px; border-radius: 10px; background: rgba(46,125,50,0.35); border: 1.5px solid #81c784; color: #81c784; font-size: 0.78rem; font-weight: 800; cursor: pointer; white-space: nowrap; flex-shrink: 0; display: inline-flex; align-items: center; gap: 4px;" title="Repetir locución">
            🔊 Repetir
          </button>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; font-size: 0.88rem; line-height: 1.6;">
          <div style="background: rgba(255,255,255,0.04); padding: 10px 12px; border-radius: 10px; border-left: 3px solid #c2a246;">
            🏢 <strong>Lugar:</strong> <span style="color: #ffd54f;">${escapeFn(info.areaLabel)}</span>
          </div>
          <div style="background: rgba(255,255,255,0.04); padding: 10px 12px; border-radius: 10px; border-left: 3px solid #81c784;">
            🧭 <strong>Pared & Brújula:</strong> <span style="color: #a5d6a7;">${escapeFn(info.wallLabel)}</span> (${escapeFn(info.compassText)})
          </div>
          <div style="background: rgba(255,255,255,0.04); padding: 10px 12px; border-radius: 10px; border-left: 3px solid #64b5f6;">
            🪵 <strong>Tipo de Mueble:</strong> <span style="color: #ffffff;">${escapeFn(info.furnitureType)}</span> (${escapeFn(info.layoutShelfCode)})
          </div>
          <div style="background: rgba(255,255,255,0.04); padding: 10px 12px; border-radius: 10px; border-left: 3px solid #ba68c8;">
            ↕️ <strong>Nivel / Altura:</strong> <span style="color: #ffd54f;">${escapeFn(info.levelLabel)}</span> (${escapeFn(info.levelDesc)})
          </div>
          <div style="background: rgba(255,255,255,0.04); padding: 10px 12px; border-radius: 10px; border-left: 3px solid #4db6ac;">
            ↔️ <strong>Posición:</strong> <span style="color: #ffffff;">${escapeFn(info.sectorText)}</span>
          </div>
          <div style="background: rgba(255,255,255,0.04); padding: 10px 12px; border-radius: 10px; border-left: 3px solid ${info.stockCount > 0 ? '#81c784' : '#e53935'};">
            📦 <strong>Stock disponible:</strong> <strong style="color: ${info.stockCount > 0 ? '#81c784' : '#ef5350'};">${info.stockCount} unidades</strong>
          </div>
        </div>
      </div>

      <!-- BOTONES DE ACCIÓN -->
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <button type="button" onclick="document.getElementById('architectural-map-canvas')?.scrollIntoView({ behavior: 'smooth', block: 'center' })" style="flex: 1.2; min-height: 48px; padding: 12px 18px; font-weight: 800; font-size: 0.92rem; background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%); color: #fff; border: 1.5px solid #81c784; border-radius: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
          🗺️ Ver en el Plano 2D/3D
        </button>
        <button type="button" onclick="startVoiceLocationAssistantFlow()" style="flex: 1; min-height: 48px; padding: 12px 16px; font-weight: 800; font-size: 0.9rem; background: rgba(194,162,70,0.25); color: #ffd54f; border: 1.5px solid #c2a246; border-radius: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
          🎙️ Buscar otro producto
        </button>
      </div>
    </div>
  `;
}

function closeVoiceLocationAssistant() {
  if (voiceAssistantActiveRecognition) {
    voiceAssistantActiveRecognition.abort();
    voiceAssistantActiveRecognition = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  const container = document.getElementById('voice-assistant-hub-container');
  if (container) {
    container.style.display = 'none';
    container.innerHTML = '';
  }
}

function startVoiceSearchOnMap() {
  startVoiceLocationAssistantFlow();
}

window.startVoiceLocationAssistantFlow = startVoiceLocationAssistantFlow;
window.handleVoiceAssistantSearchInput = handleVoiceAssistantSearchInput;
window.selectVoiceAssistantProduct = selectVoiceAssistantProduct;
window.closeVoiceLocationAssistant = closeVoiceLocationAssistant;
window.toggleVoiceAssistantListening = toggleVoiceAssistantListening;
window.startVoiceSearchOnMap = startVoiceSearchOnMap;


async function simulateCustomerQRScan(event) {
  event?.preventDefault?.();
  const resultBox = document.getElementById('customer-scan-result');
  const nameEl = document.getElementById('scanned-customer-name');
  const tierEl = document.getElementById('scanned-customer-tier');
  const seedsEl = document.getElementById('scanned-customer-seeds');
  const contactEl = document.getElementById('scanned-customer-contact');
  const input = document.getElementById('customer-credential-code');
  const credential = input?.value.trim() || '';
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;

  if (!credential) {
    input?.focus();
    return;
  }
  if (!supabaseClient || !context?.isVerified) {
    alert('Iniciá sesión para consultar clientes centrales.');
    return;
  }

  showToast('Buscando cliente en el registro central…');
  try {
    const isCustomerUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(credential);
    const normalizedPhone = credential.replace(/\D/g, '');
    let customerQuery = supabaseClient
      .from('customers')
      .select('id,display_name,tax_id,email,phone,status,metadata')
      .eq('tenant_id', context.tenantId);
    if (isCustomerUuid) customerQuery = customerQuery.eq('id', credential);
    else if (normalizedPhone.length >= 7) customerQuery = customerQuery.eq('phone', normalizedPhone);
    else customerQuery = customerQuery.eq('tax_id', credential);
    const { data: customer, error } = await customerQuery.maybeSingle();
    if (error) throw error;
    if (!customer) throw new Error('No se encontró un cliente con esa credencial.');

    const { data: account, error: accountError } = await supabaseClient
      .from('customer_accounts')
      .select('id,balance,credit_limit,currency,status')
      .eq('tenant_id', context.tenantId)
      .eq('customer_id', customer.id)
      .maybeSingle();
    if (accountError) throw accountError;

    if (nameEl) nameEl.textContent = customer.display_name;
    if (tierEl) tierEl.textContent = customer.status === 'ACTIVE' ? 'CLIENTE ACTIVO' : customer.status;
    if (seedsEl) {
      seedsEl.textContent = account
        ? `${formatCashCurrency(account.balance)} de ${formatCashCurrency(account.credit_limit)}`
        : 'Sin cuenta corriente';
    }
    if (contactEl) contactEl.textContent = [customer.phone, customer.email].filter(Boolean).join(' · ') || 'Sin datos de contacto';
    if (resultBox) resultBox.style.display = 'block';
    showToast('Cliente verificado contra el registro central.');
  } catch (error) {
    console.error('No se pudo identificar al cliente:', error);
    if (resultBox) resultBox.style.display = 'none';
    alert(error.message || 'No se pudo consultar el cliente.');
  }
}

// --- CASH REGISTER & SHIFT CLOSING ENGINE ---
const CASH_TIME_ZONE = 'America/Argentina/Buenos_Aires';
const CASH_SCHEMA_VERSION = 2;
const CASH_TYPE_CONFIG = {
  apertura: { label: 'Fondo inicial', flow: 'in' },
  venta_efectivo: { label: 'Venta en efectivo', flow: 'in' },
  venta_transf: { label: 'Venta por transferencia', flow: 'transfer' },
  venta_tarjeta: { label: 'Venta débito / crédito', flow: 'transfer' },
  venta_mp: { label: 'Venta MercadoPago / QR', flow: 'transfer' },
  cuenta_corriente: { label: 'Venta en cuenta corriente', flow: 'transfer' },
  membresia: { label: 'Membresía en efectivo', flow: 'in' },
  membresia_efectivo: { label: 'Membresía en efectivo', flow: 'in' },
  membresia_transf: { label: 'Membresía por transferencia', flow: 'transfer' },
  gasto: { label: 'Gasto de caja', flow: 'out' },
  retiro: { label: 'Retiro de propietario', flow: 'out' }
};

function getTodayDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CASH_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getEmptyCashData(dateKey = getTodayDateKey()) {
  return {
    schemaVersion: CASH_SCHEMA_VERSION,
    date: dateKey,
    movements: [],
    sales: [],
    closed: false,
    validated: false,
    closedBy: null,
    validatedBy: null,
    updatedAt: null
  };
}

function normalizeCashData(value, dateKey = getTodayDateKey()) {
  const base = value && typeof value === 'object' ? value : {};
  let movements = Array.isArray(base.movements)
    ? base.movements.filter(movement => movement && Number.isFinite(Number(movement.amount))).map(movement => ({
        ...movement,
        id: movement.id || `legacy_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        amount: Number(movement.amount),
        desc: String(movement.desc || movement.itemsSummary || 'Movimiento sin detalle'),
        vendor: String(movement.vendor || movement.seller || 'Vendedor'),
        type: CASH_TYPE_CONFIG[movement.type] ? movement.type : 'venta_efectivo',
        voided: Boolean(movement.voided)
      }))
    : [];

  // Migración y rescate: si hay ventas en base.sales que no estén en movements, sumarlas
  if (Array.isArray(base.sales) && base.sales.length > 0) {
    base.sales.forEach(sale => {
      const exists = movements.some(m => m.id === sale.id || (sale.id && String(m.desc || '').includes(String(sale.id))));
      if (!exists && Number.isFinite(Number(sale.amount))) {
        movements.push({
          id: sale.id || `sale_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          createdAt: sale.createdAt || new Date().toISOString(),
          time: sale.time || '--:--',
          type: sale.paymentMethod === 'TRANSFERENCIA' ? 'venta_transf' : 'venta_efectivo',
          amount: Number(sale.amount),
          desc: sale.itemsSummary ? `Venta #${sale.id} (${sale.itemsSummary})` : `Venta Mostrador #${sale.id}`,
          vendor: String(sale.seller || sale.vendor || 'Vendedor'),
          voided: false
        });
      }
    });
  }

  return {
    ...getEmptyCashData(dateKey),
    ...base,
    schemaVersion: CASH_SCHEMA_VERSION,
    date: base.date || dateKey,
    movements,
    sales: Array.isArray(base.sales) ? base.sales : [],
    closed: Boolean(base.closed),
    validated: Boolean(base.validated)
  };
}

function getVendorCashData(dateKey = getTodayDateKey()) {
  if (dateKey === getTodayDateKey()) {
    if (canonicalCashView) return normalizeCashData(canonicalCashView, dateKey);
  }
  return normalizeCashData({
    ...getEmptyCashData(dateKey),
    authority: 'server',
    authorityUnavailable: true,
    noSession: true
  }, dateKey);
}

function saveVendorCashData(data, dateKey = getTodayDateKey()) {
  throw new Error(`La caja local fue retirada. Usá los comandos centrales de caja (${dateKey}, ${data?.sessionId || 'sin sesión'}).`);
}

function formatCashCurrency(value) {
  return Number(value || 0).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function calculateCashTotals(cashData) {
  if (cashData?.summary) {
    const summary = cashData.summary;
    const openingCash = Number(summary.opening_cash || 0);
    const cashSales = Number(summary.cash_sales || 0);
    const otherCashIncome = Number(summary.other_cash_income || 0);
    const expenses = Number(summary.expenses || 0);
    const withdrawals = Number(summary.withdrawals || 0);
    const transferIncome = Number(summary.transfer_income || 0);
    const cardIncome = Number(summary.card_income || 0);
    const mpIncome = Number(summary.mp_income || 0);
    const accountCreditIncome = Number(summary.account_credit_income || 0);
    return {
      openingCash,
      cashSales,
      cashIncome: cashSales,
      otherCashIncome,
      expenses,
      withdrawals,
      expectedCash: Number(summary.expected_cash || 0),
      transferIncome,
      cardIncome,
      mpIncome,
      accountCreditIncome,
      recordedIncome: cashSales + otherCashIncome + transferIncome + cardIncome + mpIncome + accountCreditIncome,
      cashEntries: openingCash + cashSales + otherCashIncome,
      transfers: transferIncome + cardIncome + mpIncome,
      activeCount: Array.isArray(cashData.movements) ? cashData.movements.length : 0
    };
  }
  const totals = {
    recordedIncome: 0,
    cashEntries: 0,
    transfers: 0,
    expenses: 0,
    expectedCash: 0,
    activeCount: 0
  };

  cashData.movements.forEach(movement => {
    if (movement.voided) return;
    const amount = Number(movement.amount) || 0;
    const config = CASH_TYPE_CONFIG[movement.type] || CASH_TYPE_CONFIG.venta_efectivo;
    totals.activeCount += 1;

    if (movement.type !== 'apertura' && config.flow !== 'out') totals.recordedIncome += amount;
    if (config.flow === 'in') totals.cashEntries += amount;
    if (config.flow === 'transfer') totals.transfers += amount;
    if (config.flow === 'out') totals.expenses += amount;
  });

  totals.expectedCash = totals.cashEntries - totals.expenses;
  return totals;
}

function escapeCashHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[character]));
}

async function addCashMovement(event) {
  if (event) event.preventDefault();
  const typeEl = document.getElementById('cash-entry-type');
  const amountEl = document.getElementById('cash-entry-amount');
  const descEl = document.getElementById('cash-entry-desc');
  const type = typeEl?.value || '';
  const amount = Number.parseFloat(amountEl?.value || '0');
  const desc = descEl?.value.trim() || '';
  const authContext = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;

  if (!window.OperationalApi || !supabaseClient || !authContext?.isVerified) {
    alert('Iniciá sesión para registrar movimientos en la caja central.');
    return;
  }
  if (!['apertura', 'membresia_efectivo', 'gasto', 'retiro'].includes(type)) {
    alert('El tipo de movimiento seleccionado no es válido.');
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0 || !desc) {
    alert('Ingresá un monto mayor a $0 y un detalle válido.');
    return;
  }
  const submitButton = document.getElementById('cash-entry-submit');
  if (submitButton) submitButton.disabled = true;
  try {
    if (type === 'apertura') {
      const registerId = document.getElementById('pos-register-select')?.value || '';
      await window.OperationalApi.openCashSession({
        supabaseClient,
        authContext,
        registerId,
        openingAmount: amount
      });
    } else {
      if (!canonicalCashView?.sessionId || canonicalCashView.closed) {
        throw new Error('No hay un turno OPEN. Registrá primero el fondo inicial de apertura.');
      }
      const typeMap = {
        membresia_efectivo: 'INCOME',
        gasto: 'EXPENSE',
        retiro: 'WITHDRAWAL'
      };
      await window.OperationalApi.recordCashMovement({
        supabaseClient,
        authContext,
        sessionId: canonicalCashView.sessionId,
        type: typeMap[type],
        amount,
        category: type === 'membresia_efectivo' ? 'MEMBERSHIP' : type.toUpperCase(),
        description: desc,
        reference: {
          idempotency_key: `cash-ui:${authContext.userId}:${globalThis.crypto?.randomUUID?.() || Date.now()}`
        }
      });
    }

    if (amountEl) amountEl.value = '';
    if (descEl) {
      descEl.value = '';
      descEl.focus();
    }
    await Promise.all([refreshCanonicalCashSection(), loadPosRegisters()]);
    if (window.showToast) window.showToast(`Movimiento de ${formatCashCurrency(amount)} confirmado.`);
  } catch (error) {
    console.error('No se confirmó el movimiento de caja:', error);
    alert(`No se registró el movimiento.\n\n${error.message || 'Error desconocido'}`);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function toggleCashMovementVoid(movementId) {
  const cashData = getVendorCashData();
  if (cashData.authority === 'server') {
    alert('Los movimientos centrales son inmutables. Registrá un movimiento compensatorio con trazabilidad en lugar de borrar o restaurar el original.');
    return;
  }
  if (cashData.closed) {
    alert('La caja está cerrada y ya no admite correcciones.');
    return;
  }

  const movement = cashData.movements.find(item => String(item.id) === String(movementId));
  if (!movement) return;
  movement.voided = !movement.voided;
  movement.voidedAt = movement.voided ? new Date().toISOString() : null;
  movement.voidedBy = movement.voided ? (localStorage.getItem('boeweb_vendor_name') || 'Vendedor') : null;
  saveVendorCashData(cashData);

  if (typeof logSecureAuditEvent === 'function') {
    logSecureAuditEvent({
      event_type: movement.voided ? 'CASH_MOVEMENT_VOIDED' : 'CASH_MOVEMENT_RESTORED',
      severity: 'WARNING',
      category: 'CASH',
      actor_name: movement.voided ? movement.voidedBy : (localStorage.getItem('boeweb_vendor_name') || 'Vendedor'),
      description: `${movement.voided ? 'Anulación' : 'Restauración'} de movimiento de caja: "${movement.desc || 'Sin descripción'}" por ${formatCashCurrency(movement.amount)} (${movement.type || 'Movimiento'})`,
      entity_type: 'cash_movement',
      entity_id: movement.id,
      details: {
        movement_id: movement.id,
        type: movement.type,
        amount: movement.amount,
        desc: movement.desc,
        voided: movement.voided,
        original_vendor: movement.vendor
      }
    });
  }

  renderCashSectionUI();
  if (window.showToast) window.showToast(movement.voided ? 'Movimiento anulado; permanece en la auditoría.' : 'Movimiento restaurado.');
}

function renderCashMovements(cashData) {
  const listEl = document.getElementById('cash-movements-list');
  const historyCount = document.getElementById('cash-history-count');
  if (historyCount) historyCount.textContent = `${cashData.movements.length} ${cashData.movements.length === 1 ? 'registro' : 'registros'}`;
  if (!listEl) return;

  if (cashData.movements.length === 0) {
    listEl.innerHTML = `
      <div class="cash-empty-state">
        <strong>La caja está lista para comenzar.</strong>
        <p>Registrá primero el fondo inicial o la primera venta del turno.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = cashData.movements.map(movement => {
    const config = CASH_TYPE_CONFIG[movement.type] || CASH_TYPE_CONFIG.venta_efectivo;
    const isOutflow = config.flow === 'out';
    const sign = isOutflow ? '−' : '+';
    return `
      <article class="cash-movement" data-flow="${config.flow}" data-voided="${movement.voided}">
        <div class="cash-movement-copy">
          <span class="cash-movement-type">${escapeCashHtml(config.label)}${movement.voided ? ' · Anulado' : ''}</span>
          <p class="cash-movement-desc">${escapeCashHtml(movement.desc)}</p>
          <span class="cash-movement-meta">${escapeCashHtml(movement.time || '--:--')} · ${escapeCashHtml(movement.vendor || 'Vendedor')}</span>
        </div>
        <strong class="cash-movement-amount">${sign}${formatCashCurrency(movement.amount)}</strong>
        <div style="display: flex; gap: 4px; align-items: center;">
          ${movement.documentNumber ? `<button type="button" class="cash-void-btn" onclick="printCashMovementVoucher('${escapeCashHtml(String(movement.id))}')" style="background: rgba(21,45,36,0.06); border-color: var(--color-border-accent); color: var(--color-text-main);" title="Imprimir ${escapeCashHtml(movement.documentNumber)} con duplicado">
            🖨️ ${escapeCashHtml(movement.documentType === 'CASH_VOUCHER_EXPENSE' ? 'Vale' : 'Recibo')}
          </button>` : ''}
          <button type="button" class="cash-void-btn" data-movement-id="${escapeCashHtml(String(movement.id))}" ${cashData.closed || cashData.authority === 'server' ? 'disabled' : ''}>
            ${cashData.authority === 'server' ? 'Inmutable' : (movement.voided ? 'Restaurar' : 'Anular')}
          </button>
        </div>
      </article>`;
  }).join('');

  listEl.querySelectorAll('.cash-void-btn[data-movement-id]').forEach(button => {
    button.addEventListener('click', () => toggleCashMovementVoid(button.dataset.movementId));
  });
}

function printCashMovementVoucher(movementId) {
  const dateKey = getTodayDateKey();
  const cashData = getVendorCashData(dateKey);
  const movement = (cashData.movements || []).find(m => String(m.id) === String(movementId));
  if (!movement) {
    alert('Movimiento no encontrado.');
    return;
  }
  if (!movement.documentNumber) {
    alert('Este movimiento no posee numeración documental central. No se generará un comprobante informal.');
    return;
  }

  const config = CASH_TYPE_CONFIG[movement.type] || CASH_TYPE_CONFIG.venta_efectivo;
  const isOutflow = config.flow === 'out';
  const flowLabel = isOutflow ? 'EGRESO DE CAJA / VALE DE RETIRO' : 'INGRESO DE CAJA / VALE DE DEPÓSITO';
  const amountStr = `$${Number(movement.amount || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
  const dateStr = new Date(movement.createdAt || Date.now()).toLocaleString('es-AR');
  const responsible = getVerifiedOperatorName(movement.vendor);
  const brandName = window.AppConfig?.get('brand.texts.name', 'BÔ Grow Club') || 'BÔ Grow Club';

  const printWindow = window.open('', '_blank', 'width=420,height=680');
  if (!printWindow) return;

  const voucherTemplate = (copyType) => `
    <div style="border: 1.5px solid #152d24; border-radius: 8px; padding: 12px; margin-bottom: 16px; page-break-inside: avoid;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #152d24; padding-bottom: 6px; margin-bottom: 8px;">
        <strong style="font-size: 13px; color: #152d24;">${escapeCashHtml(brandName)} · CAJA</strong>
        <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; background: #eee; padding: 2px 6px; border-radius: 4px;">${copyType}</span>
      </div>
      <div style="font-size: 11px; font-weight: 800; color: ${isOutflow ? '#c62828' : '#2e7d32'}; margin-bottom: 6px;">${flowLabel}</div>
      <div style="font-size: 11px; margin-bottom: 4px;"><strong>N.º Comprobante:</strong> ${escapeCashHtml(movement.documentNumber)}</div>
      <div style="font-size: 11px; margin-bottom: 4px;"><strong>Fecha / Hora:</strong> ${dateStr}</div>
      <div style="font-size: 11px; margin-bottom: 4px;"><strong>Concepto:</strong> ${escapeCashHtml(movement.desc || config.label)}</div>
      <div style="font-size: 11px; margin-bottom: 6px;"><strong>Responsable:</strong> ${escapeCashHtml(responsible)}</div>
      <div style="font-size: 15px; font-weight: 900; color: ${isOutflow ? '#c62828' : '#2e7d32'}; text-align: right; margin: 8px 0; border-top: 1px dashed #ccc; padding-top: 6px;">
        ${isOutflow ? '−' : '+'}${amountStr}
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; font-size: 9px; text-align: center;">
        <div style="border-top: 1px solid #666; padding-top: 4px;">Firma Responsable</div>
        <div style="border-top: 1px solid #666; padding-top: 4px;">Firma Control / Caja</div>
      </div>
    </div>
  `;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Comprobante de Caja ${escapeCashHtml(movement.documentNumber)}</title>
      <style>
        @page { margin: 10mm; }
        body { font-family: sans-serif; font-size: 11px; margin: 0; padding: 10px; color: #000; }
        .cut-line { border-top: 1px dashed #999; margin: 16px 0; position: relative; text-align: center; }
        .cut-line span { background: #fff; padding: 0 8px; font-size: 9px; color: #666; position: relative; top: -7px; }
      </style>
    </head>
    <body>
      ${voucherTemplate('ORIGINAL · RENDICIÓN DE CAJA')}
      ${shouldPrintDuplicateReceipts() ? `<div class="cut-line"><span>✂ Línea de corte</span></div>${voucherTemplate('DUPLICADO · INTERESADO / CONTROL')}` : ''}
      <script>
        window.onload = function() { window.print(); window.close(); };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
window.printCashMovementVoucher = printCashMovementVoucher;

function updateCashDifferencePreview() {
  const cashData = getVendorCashData();
  const totals = calculateCashTotals(cashData);
  const countedEl = document.getElementById('cash-counted-amount');
  const previewEl = document.getElementById('cash-difference-preview');
  const rowEl = document.getElementById('cash-difference-row');
  const expectedEl = document.getElementById('cash-closure-expected');
  const hasValue = countedEl && countedEl.value !== '';
  const counted = hasValue ? Number.parseFloat(countedEl.value) : totals.expectedCash;
  const difference = Number.isFinite(counted) ? counted - totals.expectedCash : 0;

  if (expectedEl) expectedEl.textContent = formatCashCurrency(totals.expectedCash);
  if (previewEl) previewEl.textContent = `${difference > 0 ? '+' : ''}${formatCashCurrency(difference)}`;
  if (rowEl) {
    if (!hasValue) rowEl.dataset.state = 'neutral';
    else if (Math.abs(difference) < 0.01) rowEl.dataset.state = 'ok';
    else if (Math.abs(difference) <= 1000) rowEl.dataset.state = 'warning';
    else rowEl.dataset.state = 'danger';
  }
}

function renderCashSectionUI() {
  const dateKey = getTodayDateKey();
  const cashData = getVendorCashData(dateKey);
  const totals = calculateCashTotals(cashData);
  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  setText('cash-sum-sales', formatCashCurrency(totals.recordedIncome));
  setText('cash-sum-cash', formatCashCurrency(totals.cashEntries));
  setText('cash-sum-income', formatCashCurrency(totals.transfers));
  setText('cash-sum-expenses', formatCashCurrency(totals.expenses));
  setText('cash-sum-net', formatCashCurrency(totals.expectedCash));
  setText('cash-sum-count', `${totals.activeCount} ${totals.activeCount === 1 ? 'movimiento activo' : 'movimientos activos'}`);
  setText('cash-current-date', new Intl.DateTimeFormat('es-AR', { timeZone: CASH_TIME_ZONE, dateStyle: 'full' }).format(new Date()));
  setText('cash-last-saved', cashData.updatedAt
    ? `Último guardado: ${new Date(cashData.updatedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
    : 'Todavía no hay movimientos guardados');

  const statusBadge = document.getElementById('cash-shift-status-badge');
  if (statusBadge) {
    if (cashData.authorityUnavailable) {
      statusBadge.textContent = 'Caja central no disponible';
      statusBadge.dataset.status = 'closed';
    } else if (cashData.noSession) {
      statusBadge.textContent = 'Sin turno abierto';
      statusBadge.dataset.status = 'closed';
    } else if (cashData.validated) {
      statusBadge.textContent = 'Arqueo validado';
      statusBadge.dataset.status = 'validated';
    } else if (cashData.closed) {
      statusBadge.textContent = `Cerrada por ${cashData.closedBy || 'vendedor'}`;
      statusBadge.dataset.status = 'closed';
    } else {
      statusBadge.textContent = 'Turno en curso';
      statusBadge.dataset.status = 'open';
    }
  }

  const entryForm = document.getElementById('vendor-cash-entry-form');
  entryForm?.querySelectorAll('input, select, button').forEach(control => {
    control.disabled = cashData.closed || cashData.authorityUnavailable;
  });
  const printSheetButton = document.getElementById('btn-print-cash-sheet');
  if (printSheetButton) {
    printSheetButton.disabled = !cashData.closed || !cashData.closureId || !cashData.closureDocumentNumber;
    printSheetButton.title = printSheetButton.disabled
      ? 'La planilla se habilita después del cierre central numerado.'
      : 'Imprimir planilla de cierre con duplicado.';
  }

  const closeButton = document.getElementById('btn-close-shift');
  if (closeButton) {
    closeButton.disabled = cashData.closed;
    closeButton.textContent = cashData.closed ? 'Caja cerrada' : 'Cerrar caja y finalizar turno';
  }

  const countedEl = document.getElementById('cash-counted-amount');
  const notesEl = document.getElementById('cash-closure-notes');
  if (countedEl) {
    countedEl.disabled = cashData.closed;
    if (cashData.closed && Number.isFinite(Number(cashData.countedCash))) countedEl.value = cashData.countedCash;
  }
  if (notesEl) {
    notesEl.disabled = cashData.closed;
    if (cashData.closed) notesEl.value = cashData.closureNotes || '';
  }

  const adminValidation = document.getElementById('cash-admin-validation');
  if (adminValidation) adminValidation.hidden = !cashData.closed || cashData.validated;
  renderCashMovements(cashData);
  updateCashDifferencePreview();
}

async function performShiftClosure() {
  const cashData = getVendorCashData();
  if (cashData.closed) return;

  const countedEl = document.getElementById('cash-counted-amount');
  const notesEl = document.getElementById('cash-closure-notes');
  const countedCash = Number.parseFloat(countedEl?.value || '');
  if (!Number.isFinite(countedCash) || countedCash < 0) {
    alert('Ingresá el efectivo contado antes de cerrar el turno.');
    countedEl?.focus();
    return;
  }

  const authContext = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  if (!window.OperationalApi || !supabaseClient || !authContext?.isVerified || !cashData.sessionId) {
    alert('No hay una sesión central de caja abierta para cerrar.');
    return;
  }

  const closeButton = document.getElementById('btn-close-shift');
  if (closeButton) closeButton.disabled = true;
  try {
    const cashBreakdownResult = calculateBillsBreakdownTotal();
    const hasCashBreakdown = Object.keys(cashBreakdownResult.breakdown).length > 0;
    if (hasCashBreakdown && Math.abs(cashBreakdownResult.total - countedCash) > 0.009) {
      throw new Error('El desglose de billetes no coincide con el efectivo contado. Corregí el conteo antes de cerrar.');
    }
    const closure = await window.OperationalApi.submitCashClosure({
      supabaseClient,
      authContext,
      sessionId: cashData.sessionId,
      countedAmount: countedCash,
      cashBreakdown: hasCashBreakdown ? cashBreakdownResult.breakdown : {},
      notes: notesEl?.value.trim() || ''
    });
    await Promise.all([refreshCanonicalCashSection(), loadPosRegisters()]);
    downloadCashBackup('json');
    const difference = Number(closure?.difference || 0);
    if (window.showToast) window.showToast(`Caja cerrada y enviada a supervisión. Diferencia: ${formatCashCurrency(difference)}.`);
  } catch (error) {
    console.error('No se pudo cerrar la caja:', error);
    alert(`La caja no se cerró.\n\n${error.message || 'Error desconocido'}`);
  } finally {
    if (closeButton) closeButton.disabled = false;
  }
}

async function validateAdminClosurePrompt() {
  const cashData = getVendorCashData();
  if (!cashData.closed || cashData.validated) return;
  const authContext = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  if (!['ADMIN', 'SUPERVISOR', 'SUPERADMIN'].includes(authContext?.role)) {
    alert('Sólo un administrador o supervisor autenticado puede revisar este arqueo.');
    return;
  }
  if (!cashData.closureId || !window.OperationalApi || !supabaseClient) {
    alert('No se encontró el cierre central pendiente de revisión.');
    return;
  }

  const button = document.getElementById('btn-admin-validate');
  if (button) button.disabled = true;
  try {
    await window.OperationalApi.reviewCashClosure({
      supabaseClient,
      authContext,
      closureId: cashData.closureId,
      decision: 'APPROVE',
      reason: 'Arqueo revisado desde el panel operativo.'
    });
    await refreshCanonicalCashSection();
    downloadCashBackup('json');
    if (window.showToast) window.showToast('Arqueo aprobado con identidad de supervisor y auditoría central.');
  } catch (error) {
    console.error('No se pudo revisar el cierre:', error);
    alert(`No se aprobó el arqueo.\n\n${error.message || 'Error desconocido'}`);
  } finally {
    if (button) button.disabled = false;
  }
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadCashBackup(format = 'json') {
  const dateKey = getTodayDateKey();
  const cashData = getVendorCashData(dateKey);
  const totals = calculateCashTotals(cashData);
  const brandName = window.AppConfig?.get('brand.texts.name', 'BÔ Grow Club') || 'BÔ Grow Club';
  const exportData = {
    brand: brandName,
    module: 'Caja y arqueo diario',
    exportedAt: new Date().toISOString(),
    date: dateKey,
    totals,
    cash: cashData
  };

  if (format === 'csv') {
    const escapeCsv = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Fecha', 'Hora', 'Tipo', 'Detalle', 'Vendedor', 'Monto', 'Estado'],
      ...cashData.movements.map(movement => [
        dateKey,
        movement.time || '',
        CASH_TYPE_CONFIG[movement.type]?.label || movement.type,
        movement.desc,
        movement.vendor,
        movement.amount,
        movement.voided ? 'ANULADO' : 'ACTIVO'
      ])
    ];
    const csv = `\uFEFFsep=;\n${rows.map(row => row.map(escapeCsv).join(';')).join('\n')}`;
    downloadTextFile(`caja-bo-${dateKey}.csv`, csv, 'text/csv;charset=utf-8');
  } else {
    downloadTextFile(`caja-bo-${dateKey}.json`, JSON.stringify(exportData, null, 2), 'application/json;charset=utf-8');
  }
}

async function importCashBackup(event) {
  if (event) event.preventDefault();
  alert('La restauración local de caja fue retirada. Los cierres y movimientos se recuperan desde el historial central inmutable.');
  return;

  const fileInput = event?.target;
  const file = fileInput?.files?.[0];
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    const importedCash = parsed.cash && typeof parsed.cash === 'object' ? parsed.cash : parsed;
    if (!importedCash || typeof importedCash !== 'object' || !Array.isArray(importedCash.movements) || !/^\d{4}-\d{2}-\d{2}$/.test(importedCash.date || '')) {
      throw new Error('El archivo no contiene una caja válida.');
    }
    const normalized = normalizeCashData(importedCash, importedCash.date || getTodayDateKey());

    const existing = getVendorCashData(normalized.date);
    localStorage.setItem(`boeweb_cash_${normalized.date}_before_restore_${Date.now()}`, JSON.stringify(existing));
    const existingIds = new Set(existing.movements.map(movement => String(movement.id)));
    const newMovements = normalized.movements.filter(movement => !existingIds.has(String(movement.id)));
    const merged = normalizeCashData({
      ...existing,
      ...normalized,
      movements: [...existing.movements, ...newMovements],
      restoredAt: new Date().toISOString(),
      restoredBy: localStorage.getItem('boeweb_vendor_name') || 'Vendedor'
    }, normalized.date);
    saveVendorCashData(merged, normalized.date);

    if (fileInput) fileInput.value = '';
    if (normalized.date === getTodayDateKey()) renderCashSectionUI();
    if (window.showToast) {
      window.showToast(`Respaldo del ${normalized.date} recuperado: ${newMovements.length} movimientos nuevos.`);
    }
  } catch (error) {
    console.error('No se pudo recuperar el respaldo de caja:', error);
    if (fileInput) fileInput.value = '';
    alert('No se pudo recuperar el respaldo. Verificá que sea un archivo JSON generado por esta Caja.');
  }
}

// Check URL params and vendor auth on load
document.addEventListener('DOMContentLoaded', () => {
  checkVendorAuth();
  const urlParams = new URLSearchParams(window.location.search);
  const targetMember = urlParams.get('member');
  if (targetMember && typeof window.approvePlusUltraMember === 'function') {
    setTimeout(() => window.approvePlusUltraMember(targetMember), 500);
  }
});

// --- VENDOR PORTFOLIO & SOCIAL SELLING ENGINE ---
let canonicalVendorClients = [];

async function loadCanonicalVendorClients() {
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  if (!supabaseClient || !context?.isVerified) {
    canonicalVendorClients = [];
    return canonicalVendorClients;
  }
  const { data, error } = await supabaseClient
    .from('customers')
    .select('id,display_name,email,phone,tax_id,status,metadata,created_at,updated_at')
    .eq('tenant_id', context.tenantId)
    .neq('status', 'ARCHIVED')
    .order('display_name', { ascending: true });
  if (error) throw error;
  canonicalVendorClients = (data || []).map(customer => ({
    id: customer.id,
    name: customer.display_name,
    phone: customer.phone || '',
    email: customer.email || '',
    taxId: customer.tax_id || '',
    tier: customer.metadata?.tier || 'Cliente',
    regDate: customer.created_at ? customer.created_at.slice(0, 10) : '',
    lastSoilDaysAgo: Number(customer.metadata?.last_soil_purchase_days_ago) || 0,
    totalSpent: Number(customer.metadata?.total_spent) || 0,
    assignedSalespersonId: customer.metadata?.salesperson_user_id || null
  }));
  return canonicalVendorClients;
}

function getVendorClients(vendorName) {
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  const role = String(context?.role || '').toUpperCase();
  if (['ADMIN', 'SUPERVISOR', 'SUPERADMIN'].includes(role)) return [...canonicalVendorClients];
  const assigned = canonicalVendorClients.filter(client => client.assignedSalespersonId === context?.userId);
  return assigned;
}

function renderVendorPortfolioUI() {
  const activeVendor = localStorage.getItem('boeweb_vendor_name') || 'Nacho Mina';
  const clients = getVendorClients(activeVendor);
  const searchInput = document.getElementById('portfolio-search-input');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  const filtered = clients.filter(c => 
    c.name.toLowerCase().includes(query) || (c.phone && c.phone.includes(query))
  );

  const totalClientsEl = document.getElementById('portfolio-total-clients');
  const vipClientsEl = document.getElementById('portfolio-vip-clients');
  const soilAlertsEl = document.getElementById('portfolio-soil-alerts');

  if (totalClientsEl) totalClientsEl.textContent = clients.length;
  if (vipClientsEl) vipClientsEl.textContent = clients.filter(c => c.tier && c.tier.includes('ÁRBOL')).length;
  if (soilAlertsEl) soilAlertsEl.textContent = clients.filter(c => (c.lastSoilDaysAgo || 0) >= 60).length;

  const tableBody = document.getElementById('vendor-portfolio-table-body');
  if (tableBody) {
    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 20px; color: var(--color-text-muted);">
            No hay clientes registrados en tu cartera aún. ¡Compartí tu link de recomendación para empezar a sumar!
          </td>
        </tr>
      `;
    } else {
      tableBody.innerHTML = filtered.map(c => {
        const needsSoil = (c.lastSoilDaysAgo || 0) >= 60;
        return `
          <tr style="border-bottom: 1px solid var(--color-border-subtle);">
            <td style="padding: 12px 10px;">
              <strong style="color: var(--color-text-main); font-weight: 700;">${escapeStockHtml(c.name)}</strong>
              <span style="display: block; font-size: 0.72rem; color: var(--color-text-muted);">Registrado/a: ${escapeStockHtml(c.regDate || 'Sin fecha')}</span>
            </td>
            <td style="padding: 12px 10px;">
              <a href="https://wa.me/${String(c.phone || '').replace(/\D/g, '')}" target="_blank" rel="noopener noreferrer" style="color: #25d366; font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                💬 ${escapeStockHtml(c.phone || 'Sin teléfono')}
              </a>
            </td>
            <td style="padding: 12px 10px;">
              <span style="background: rgba(195,155,75,0.15); border: 1px solid var(--color-accent-gold); color: var(--color-accent-gold); padding: 3px 8px; border-radius: 8px; font-size: 0.75rem; font-weight: 700;">
                ${escapeStockHtml(c.tier || 'Cliente')}
              </span>
            </td>
            <td style="padding: 12px 10px;">
              ${needsSoil ? `
                <span style="background: rgba(239,83,80,0.15); border: 1px solid #ef5350; color: #ef5350; padding: 3px 8px; border-radius: 8px; font-size: 0.75rem; font-weight: 800;">
                  ⚠️ Hace ${c.lastSoilDaysAgo} días (Reabastecer)
                </span>
              ` : `
                <span style="background: rgba(102,187,106,0.15); border: 1px solid #66bb6a; color: #66bb6a; padding: 3px 8px; border-radius: 8px; font-size: 0.75rem; font-weight: 700;">
                  🟢 al día (${c.lastSoilDaysAgo || 15} días)
                </span>
              `}
            </td>
            <td style="padding: 12px 10px; text-align: right;">
              <button type="button" class="btn btn-secondary portfolio-promo-button" data-client-id="${escapeStockHtml(String(c.id))}" style="padding: 6px 12px; font-size: 0.78rem; border-color: #25d366; color: #25d366; border-radius: 8px; font-weight: 700;">
                💬 Enviar Promo Sustrato
              </button>
            </td>
          </tr>
        `;
      }).join('');
      tableBody.querySelectorAll('.portfolio-promo-button').forEach(button => {
        button.addEventListener('click', () => {
          const client = canonicalVendorClients.find(item => String(item.id) === button.dataset.clientId);
          if (client) sendVendorWhatsAppPromo(client.phone, client.name, 'sustrato');
        });
      });
    }
  }
}

function copyVendorRefLink() {
  const activeVendor = localStorage.getItem('boeweb_vendor_name') || 'Vendedor';
  const vendorObj = AUTHORIZED_VENDEDORES.find(v => v.name.toLowerCase() === activeVendor.toLowerCase());
  const refCode = vendorObj ? vendorObj.refCode : activeVendor.toLowerCase().replace(/\s+/g, '');
  const url = `${window.location.origin}${window.location.pathname.replace('vendedor.html', 'index.html')}?ref=${refCode}`;
  
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url);
    if (window.showToast) window.showToast(`📋 ¡Link copiado!: ${url}`);
    else alert(`📋 ¡Tu Enlace Personal de Recomendación fue copiado al portapapeles!\n\n${url}`);
  } else {
    prompt('Copiá tu enlace de recomendación:', url);
  }
}

function sendVendorWhatsAppPromo(phone, clientName, promoType) {
  const activeVendor = localStorage.getItem('boeweb_vendor_name') || 'Tu asesor BÔ';
  let message = '';
  if (promoType === 'sustrato') {
    message = `Hola ${clientName}! 👋 Te saluda ${activeVendor} de BÔ GrowClub 🌿. Te contacto porque vi que ya pasaron un par de meses desde tu última compra de sustrato y tus plantas seguro están listas para un reabastecimiento o trasplante. ¡Esta semana tenemos una promo especial en sustrato orgánico + fertilizante con 15% OFF! ¿Te guardo una bolsa?`;
  } else {
    message = `Hola ${clientName}! 👋 Te habla ${activeVendor} de BÔ GrowClub 🌿. Quería contarte que ingresaron novedades exclusivas en cultivo indoor y nutrición orgánica para miembros VIP. ¿En qué etapa está tu cultivo actualmente?`;
  }
  const encodedMsg = encodeURIComponent(message);
  window.open(`https://wa.me/${phone}?text=${encodedMsg}`, '_blank');
}

// ==========================================
// MÓDULO DE INGRESO DE PRODUCTOS, IA, QR Y APROBACIÓN
// ==========================================

let fastUploadSelectedFile = null;
let fastUploadPreviewUrl = '';
let fastUploadProductCode = '';
let fastUploadQrPayload = '';
let fastUploadAiResult = null;
let fastUploadLookupResult = null;
let fastUploadLookupImageShown = false;
let fastUploadPhotoSelectionId = 0;
let heicConverterPromise = null;
let stockLookupInProgress = false;
let stockLookupLastSignature = '';
let stockLookupLastStartedAt = 0;
let stockBarcodeAutoTimer = null;
let stockGlobalScannerTimer = null;
let stockGlobalScannerBuffer = '';
let stockGlobalScannerLastKeyAt = 0;
const pendingDraftCache = new Map();
const FAST_UPLOAD_MAX_FILE_SIZE = 25 * 1024 * 1024;
const FAST_UPLOAD_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);
const STOCK_BARCODE_AUTO_DELAY_MS = 220;
const STOCK_SCANNER_KEY_GAP_MS = 110;
const HEIC_CONVERTER_URL = 'https://cdn.jsdelivr.net/npm/heic-to@1.5.2/dist/iife/heic-to.js';
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);
const MOBILE_PRODUCT_ASSISTANT_STEPS = ['method', 'identify', 'details', 'review'];
const LOCATION_ASSISTANT_STEP_ORDER = ['list', 'zone', 'type', 'compass', 'wall', 'level', 'sector', 'review'];

const LOCATION_ZONE_OPTIONS = [
  { id: 'TI', label: '🏬 Tienda / Salón', help: 'Salón de ventas y mostrador de atención (PC al centro)', prefix: 'TI', floor_level: 1 },
  { id: 'DP', label: '📦 Depósito General', help: 'Área de guardado, reserva y stock general (PC al centro)', prefix: 'DP', floor_level: 2 }
];

const LOCATION_TYPE_OPTIONS = [
  { id: 'EP', label: '🪜 Estante de pared', help: 'Módulos adosados a la pared perimetral' },
  { id: 'HEL', label: '❄️ Heladera / Frío', help: 'Refrigeración para semillas y bioinsumos' },
  { id: 'VIT', label: '💎 Vitrina / Mostrador', help: 'Exhibición cerrada de valor o semillas' },
  { id: 'EST', label: '📦 Estantería / Góndola', help: 'Módulos de pasillo o góndolas' },
  { id: 'PIS', label: '🧱 Piso / Pallet', help: 'Bolsas de sustrato o bultos pesados en piso' }
];

const LOCATION_COMPASS_OPTIONS = [
  { id: 'D', label: '➡️ Derecha de la PC', help: 'Hacia el lateral derecho desde la computadora', compass: 'Derecha' },
  { id: 'I', label: '⬅️ Izquierda de la PC', help: 'Hacia el lateral izquierdo desde la computadora', compass: 'Izquierda' },
  { id: 'F', label: '⬆️ Frente de la PC', help: 'Hacia adelante / frente desde la computadora', compass: 'Frente' },
  { id: 'A', label: '⬇️ Atrás de la PC', help: 'Hacia la parte posterior / fondo desde la computadora', compass: 'Atrás' }
];

const LOCATION_WALL_OPTIONS = [
  { id: 'P1', label: 'Pared 1 (Frente / Norte)', help: 'Pared frontal respecto a la PC central' },
  { id: 'P2', label: 'Pared 2 (Fondo / Sur)', help: 'Pared posterior o fondo respecto a la PC' },
  { id: 'P3', label: 'Pared 3 (Derecha / Este)', help: 'Lateral derecho respecto a la PC' },
  { id: 'P4', label: 'Pared 4 (Izquierda / Oeste)', help: 'Lateral izquierdo respecto a la PC' }
];

const LOCATION_SHELF_OPTIONS = [
  { id: 'E1', label: 'Estante 1', help: 'Primer módulo de la pared' },
  { id: 'E2', label: 'Estante 2', help: 'Segundo módulo de la pared' },
  { id: 'E3', label: 'Estante 3', help: 'Tercer módulo de la pared' },
  { id: 'E4', label: 'Estante 4', help: 'Cuarto módulo de la pared' },
  { id: 'E5', label: 'Estante 5', help: 'Quinto módulo de la pared' },
  { id: 'HEL1', label: '❄️ Heladera 1', help: 'Equipo refrigerado de la pared' },
  { id: 'VIT1', label: '💎 Vitrina 1', help: 'Vitrina vidriada de la pared' }
];

const LOCATION_LEVEL_OPTIONS = [
  { id: 1, label: '1️⃣ Nivel 1 (Piso / Base)', help: 'N1 siempre es abajo' },
  { id: 2, label: '2️⃣ Nivel 2 (Bajo)', help: 'Segunda balda desde abajo' },
  { id: 3, label: '3️⃣ Nivel 3 (Medio)', help: 'A la altura de las manos y vista' },
  { id: 4, label: '4️⃣ Nivel 4 (Medio-Alto)', help: 'Balda superior media' },
  { id: 5, label: '5️⃣ Nivel 5 (Alto)', help: 'Balda superior' },
  { id: 6, label: '6️⃣ Nivel 6 (Tope / Arriba)', help: 'Arriba del todo' }
];

const LOCATION_SECTOR_OPTIONS = [
  { id: 'I', label: '⬅️ Izquierda (I)', help: 'Sector izquierdo de la balda' },
  { id: 'C', label: '⏺️ Centro (C)', help: 'Sector centro de la balda' },
  { id: 'D', label: '➡️ Derecha (D)', help: 'Sector derecho de la balda' },
  { id: 'U', label: '👌 Es chico no hace falta', help: 'Espacio único o mueble chico sin división' }
];

const LOCATION_SHELF_LABELS = {
  'E1': 'Estante 1',
  'E2': 'Estante 2',
  'E3': 'Estante 3',
  'E4': 'Estante 4',
  'E5': 'Estante 5',
  'HEL1': 'Heladera 1',
  'VIT1': 'Vitrina 1',
  'PIS1': 'Pallet 1'
};

let mobileProductAssistantStep = 'method';
let mobileProductEntryMethod = '';
let pendingLocationProducts = [];
let locationAssistantState = createEmptyLocationAssistantState();

function createEmptyLocationAssistantState() {
  return {
    step: 'list',
    product: null,
    zone: null,
    type: null,
    compass: null,
    wall: null,
    shelfCode: 'E1',
    level: null,
    sector: null,
    photoBlob: null,
    photoPreviewUrl: '',
    photoPath: null
  };
}


function escapeStockHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const STOCK_CRITERION_STORAGE_KEY = 'boe_stock_search_criterion';

const STOCK_COUNTRY_METADATA = {
  AR: { code: 'AR', name: 'Argentina', flag: '🇦🇷', lang: 'es-AR', currency: 'ARS' },
  PE: { code: 'PE', name: 'Perú', flag: '🇵🇪', lang: 'es-PE', currency: 'PEN' },
  CL: { code: 'CL', name: 'Chile', flag: '🇨🇱', lang: 'es-CL', currency: 'CLP' },
  CO: { code: 'CO', name: 'Colombia', flag: '🇨🇴', lang: 'es-CO', currency: 'COP' },
  MX: { code: 'MX', name: 'México', flag: '🇲🇽', lang: 'es-MX', currency: 'MXN' },
  UY: { code: 'UY', name: 'Uruguay', flag: '🇺🇾', lang: 'es-UY', currency: 'UYU' },
  ES: { code: 'ES', name: 'España', flag: '🇪🇸', lang: 'es-ES', currency: 'EUR' }
};

const STOCK_VERTICAL_METADATA = {
  growshop: { code: 'growshop', name: 'Growshop', icon: '🌿' },
  farmacia: { code: 'farmacia', name: 'Farmacia', icon: '💊' },
  verduleria: { code: 'verduleria', name: 'Verdulería', icon: '🥦' },
  ferreteria: { code: 'ferreteria', name: 'Ferretería', icon: '🔩' },
  repuestos: { code: 'repuestos', name: 'Repuestos', icon: '🚗' },
  indumentaria: { code: 'indumentaria', name: 'Indumentaria', icon: '👕' },
  almacen: { code: 'almacen', name: 'Almacén', icon: '🛒' }
};

function getActiveStockCriterion() {
  try {
    const raw = localStorage.getItem(STOCK_CRITERION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.country && parsed?.vertical) {
        return {
          country: String(parsed.country).toUpperCase(),
          vertical: String(parsed.vertical).toLowerCase()
        };
      }
    }
  } catch (e) {
    console.warn('Error reading stock criterion:', e);
  }
  const defaultVertical = (typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext().vertical_code : null) || 'growshop';
  return { country: 'AR', vertical: defaultVertical };
}

function saveActiveStockCriterion(country, vertical) {
  const data = {
    country: String(country || 'AR').toUpperCase(),
    vertical: String(vertical || 'growshop').toLowerCase()
  };
  try {
    localStorage.setItem(STOCK_CRITERION_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Error saving stock criterion:', e);
  }
  updateStockCriterionUI();
  return data;
}

function updateStockCriterionUI() {
  const criterion = getActiveStockCriterion();
  const country = STOCK_COUNTRY_METADATA[criterion.country] || STOCK_COUNTRY_METADATA.AR;
  const vertical = STOCK_VERTICAL_METADATA[criterion.vertical] || { name: criterion.vertical, icon: '🏷️' };

  const badge = document.getElementById('stock-criterion-badge');
  if (badge) {
    badge.textContent = `${country.flag} ${country.name} · ${vertical.icon} ${vertical.name}`;
  }
  const sourceLabel = document.getElementById('stock-criterion-source-label');
  if (sourceLabel) {
    sourceLabel.textContent = `Google ${country.name} + Mercado Libre (${country.currency})`;
  }
}

function openStockCriterionModal() {
  const modal = document.getElementById('modal-stock-search-criterion');
  if (!modal) return;
  const criterion = getActiveStockCriterion();
  const countrySelect = document.getElementById('criterion-country-select');
  const verticalSelect = document.getElementById('criterion-vertical-select');
  if (countrySelect) countrySelect.value = criterion.country;
  if (verticalSelect) verticalSelect.value = criterion.vertical;
  modal.style.display = 'flex';
}

function closeStockCriterionModal() {
  const modal = document.getElementById('modal-stock-search-criterion');
  if (modal) modal.style.display = 'none';
}

function handleSaveStockCriterion(event) {
  event.preventDefault();
  const country = document.getElementById('criterion-country-select')?.value || 'AR';
  const vertical = document.getElementById('criterion-vertical-select')?.value || 'growshop';
  saveActiveStockCriterion(country, vertical);
  closeStockCriterionModal();
  if (window.showToast) {
    const cMeta = STOCK_COUNTRY_METADATA[country] || STOCK_COUNTRY_METADATA.AR;
    const vMeta = STOCK_VERTICAL_METADATA[vertical] || { name: vertical, icon: '🏷️' };
    showToast(`✅ Criterio de búsqueda actualizado a ${cMeta.flag} ${cMeta.name} (${vMeta.icon} ${vMeta.name})`);
  }
}

function startFastUploadVoiceDictation() {
  const input = document.getElementById('fastupload-manual-query-input');
  const voiceBtn = document.getElementById('fastupload-voice-btn');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('Tu navegador no soporta dictado por voz.');
    return;
  }
  const criterion = getActiveStockCriterion();
  const countryMeta = STOCK_COUNTRY_METADATA[criterion.country] || STOCK_COUNTRY_METADATA.AR;

  const recognition = new SpeechRecognition();
  recognition.lang = countryMeta.lang || 'es-AR';
  recognition.interimResults = false;

  if (voiceBtn) {
    voiceBtn.style.background = '#c62828';
    voiceBtn.style.color = '#ffffff';
    voiceBtn.textContent = '🔴';
  }
  if (window.showToast) showToast(`🎙️ Escuchando dictado (${countryMeta.name})... Hablá ahora.`);

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    if (input) {
      input.value = transcript;
      lookupFastUploadProductWithoutAi('manual');
    }
    if (window.showToast) showToast(`🎙️ Dictado: "${transcript}"`);
  };

  recognition.onerror = () => {
    if (window.showToast) showToast('⚠️ Error al captar audio.');
  };

  recognition.onend = () => {
    if (voiceBtn) {
      voiceBtn.style.background = '';
      voiceBtn.style.color = '';
      voiceBtn.textContent = '🎙️';
    }
  };

  recognition.start();
}

function createProductCode() {
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const randomPart = crypto.randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase();
  return `BO-${date}-${randomPart}`;
}

function buildProductQrPayload(productCode) {
  if (!productCode) return window.location.origin;
  try {
    const url = new URL(window.location.origin);
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    url.searchParams.set('product', String(productCode).trim());
    return url.toString();
  } catch (e) {
    return `${window.location.origin}/?product=${encodeURIComponent(productCode)}`;
  }
}

function renderFastUploadQr() {
  const preview = document.getElementById('fastupload-qr-preview');
  const codeElement = document.getElementById('fastupload-product-code');
  if (!preview || !fastUploadProductCode) return;
  fastUploadQrPayload = buildProductQrPayload(fastUploadProductCode);
  if (codeElement) codeElement.textContent = fastUploadProductCode;
  preview.innerHTML = '';
  if (window.QRCode) {
    new window.QRCode(preview, {
      text: fastUploadQrPayload,
      width: 90,
      height: 90,
      colorDark: '#152d24',
      colorLight: '#ffffff',
      correctLevel: window.QRCode.CorrectLevel.M
    });
  } else {
    preview.textContent = 'QR';
    preview.title = fastUploadQrPayload;
  }
}

function setStockScannerState(state, message) {
  const scannerState = document.getElementById('fastupload-scanner-state');
  if (!scannerState) return;
  scannerState.dataset.state = state;
  scannerState.innerHTML = '<span aria-hidden="true"></span>';
  scannerState.append(document.createTextNode(` ${message}`));
}

function cleanStockBarcode(value) {
  return String(value || '').replace(/[^\d]/g, '').slice(0, 18);
}

function clearStockBarcodeAutoTimer() {
  if (!stockBarcodeAutoTimer) return;
  window.clearTimeout(stockBarcodeAutoTimer);
  stockBarcodeAutoTimer = null;
}

function runStockBarcodeLookup(source = 'scanner') {
  clearStockBarcodeAutoTimer();
  const barcodeInput = document.getElementById('fastupload-barcode-input');
  const barcode = cleanStockBarcode(barcodeInput?.value);
  if (barcodeInput && barcodeInput.value !== barcode) barcodeInput.value = barcode;
  if (barcode.length < 6 || barcode.length > 18) {
    setStockScannerState('error', 'Código incompleto: deben ser entre 6 y 18 números');
    return;
  }
  setStockScannerState('reading', source === 'button' ? 'Buscando el código ingresado…' : 'Código leído · buscando datos…');
  lookupFastUploadProductWithoutAi('barcode');
}

function scheduleStockBarcodeLookup() {
  const barcodeInput = document.getElementById('fastupload-barcode-input');
  if (!barcodeInput) return;
  const barcode = cleanStockBarcode(barcodeInput.value);
  if (barcodeInput.value !== barcode) barcodeInput.value = barcode;
  clearStockBarcodeAutoTimer();
  if (!barcode) {
    setStockScannerState('ready', 'Lector listo para escanear');
    return;
  }
  if (barcode.length < 6) {
    setStockScannerState('reading', 'Leyendo código…');
    return;
  }
  setStockScannerState('reading', 'Código recibido · esperando fin de lectura…');
  stockBarcodeAutoTimer = window.setTimeout(() => runStockBarcodeLookup('automatic'), STOCK_BARCODE_AUTO_DELAY_MS);
}

function handleStockBarcodeKeydown(event) {
  if (!['Enter', 'Tab'].includes(event.key)) return;
  event.preventDefault();
  runStockBarcodeLookup('scanner');
}

function isFastUploadWorkspaceVisible() {
  const section = document.getElementById('vendor-fast-upload-section');
  return Boolean(section && section.style.display !== 'none' && section.offsetParent !== null);
}

function commitGlobalStockScannerBuffer() {
  if (stockGlobalScannerTimer) window.clearTimeout(stockGlobalScannerTimer);
  stockGlobalScannerTimer = null;
  const barcode = cleanStockBarcode(stockGlobalScannerBuffer);
  stockGlobalScannerBuffer = '';
  if (barcode.length < 6 || barcode.length > 18) return;
  const barcodeInput = document.getElementById('fastupload-barcode-input');
  if (!barcodeInput) return;
  barcodeInput.value = barcode;
  runStockBarcodeLookup('scanner');
}

function handleGlobalStockScannerKeydown(event) {
  if (!isFastUploadWorkspaceVisible()) return;
  const barcodeInput = document.getElementById('fastupload-barcode-input');
  if (!barcodeInput || event.target === barcodeInput) return;
  const tagName = event.target?.tagName?.toLowerCase();
  if (event.target?.isContentEditable || ['input', 'textarea', 'select'].includes(tagName)) return;

  const now = Date.now();
  if (/^\d$/.test(event.key)) {
    if (now - stockGlobalScannerLastKeyAt > STOCK_SCANNER_KEY_GAP_MS) stockGlobalScannerBuffer = '';
    stockGlobalScannerLastKeyAt = now;
    stockGlobalScannerBuffer = `${stockGlobalScannerBuffer}${event.key}`.slice(-18);
    if (stockGlobalScannerTimer) window.clearTimeout(stockGlobalScannerTimer);
    stockGlobalScannerTimer = window.setTimeout(commitGlobalStockScannerBuffer, STOCK_BARCODE_AUTO_DELAY_MS);
    setStockScannerState('reading', 'Recibiendo lectura de la pistola…');
    return;
  }

  if (['Enter', 'Tab'].includes(event.key) && stockGlobalScannerBuffer.length >= 6) {
    event.preventDefault();
    commitGlobalStockScannerBuffer();
  }
}

function initializeFastUploadForm() {
  if (!fastUploadProductCode) fastUploadProductCode = createProductCode();
  updateFastUploadLocationPreview();
  renderFastUploadQr();
  updateStockCriterionUI();
  const barcodeInput = document.getElementById('fastupload-barcode-input');
  if (barcodeInput && !barcodeInput.dataset.scannerReady) {
    barcodeInput.dataset.scannerReady = 'true';
    barcodeInput.addEventListener('keydown', handleStockBarcodeKeydown);
    barcodeInput.addEventListener('input', scheduleStockBarcodeLookup);
  }
  const manualQueryInput = document.getElementById('fastupload-manual-query-input');
  if (manualQueryInput && !manualQueryInput.dataset.lookupReady) {
    manualQueryInput.dataset.lookupReady = 'true';
    manualQueryInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        lookupFastUploadProductWithoutAi('manual');
      }
    });
  }
  if (!document.documentElement.dataset.stockScannerCaptureReady) {
    document.documentElement.dataset.stockScannerCaptureReady = 'true';
    document.addEventListener('keydown', handleGlobalStockScannerKeydown, true);
  }
  setStockScannerState('ready', 'Lector listo para escanear');
}

function isMobileVendorAssistantView() {
  return window.matchMedia('(max-width: 720px)').matches;
}

function startMobileProductAssistant() {
  const assistant = document.getElementById('mobile-product-assistant');
  const form = document.getElementById('fast-upload-form');
  if (!assistant || !form) return;
  if (!isMobileVendorAssistantView()) {
    assistant.hidden = true;
    form.classList.remove('mobile-guided');
    form.removeAttribute('data-mobile-step');
    return;
  }
  mobileProductAssistantStep = 'method';
  mobileProductEntryMethod = '';
  assistant.hidden = false;
  form.classList.add('mobile-guided');
  renderMobileProductAssistant();
}

function setMobileProductAssistantStep(step) {
  if (!MOBILE_PRODUCT_ASSISTANT_STEPS.includes(step)) return;
  mobileProductAssistantStep = step;
  renderMobileProductAssistant();
  if (step === 'details') {
    const detailsPanel = document.querySelector('.stock-entry-details-panel');
    if (detailsPanel) {
      detailsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => {
        const nameInput = document.getElementById('fastupload-name-input');
        const stockInput = document.getElementById('fastupload-stock-input');
        if (nameInput && !nameInput.value.trim()) {
          nameInput.focus();
        } else if (stockInput) {
          stockInput.focus();
          stockInput.select();
        }
      }, 200);
      return;
    }
  }
  document.getElementById('mobile-product-assistant')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderMobileProductMethodChoices() {
  const choices = [
    { id: 'barcode', icon: '▥', title: 'Código de barras', help: 'Escanear con la lectora o escribirlo' },
    { id: 'camera', icon: '◉', title: 'Sacar una foto', help: 'Usar la cámara del teléfono' },
    { id: 'gallery', icon: '▣', title: 'Elegir de galería', help: 'Seleccionar una imagen guardada' },
    { id: 'name', icon: '⌕', title: 'Buscar por nombre', help: 'Consultar el catálogo BÔ' },
    { id: 'manual', icon: '✎', title: 'Ingreso manual', help: 'Completar la ficha personalmente' }
  ];
  return `
    <p class="assistant-question">¿Cómo querés ingresar el producto?</p>
    <p class="assistant-help">Elegí una opción. El asistente te mostrará solamente lo necesario.</p>
    <div class="assistant-choice-grid">
      ${choices.map(choice => `
        <button type="button" class="assistant-choice-card" onclick="chooseMobileProductEntryMethod('${choice.id}')">
          <span class="assistant-choice-icon" aria-hidden="true">${choice.icon}</span>
          <strong>${choice.title}</strong>
          <small>${choice.help}</small>
        </button>`).join('')}
    </div>`;
}

function getMobileProductIdentifyCopy() {
  const copyByMethod = {
    barcode: ['Escaneá o escribí el código', 'Después agregá una foto para documentar el ingreso.'],
    camera: ['Sacá una foto clara del frente', 'La cámara se abrirá automáticamente.'],
    gallery: ['Elegí la foto del producto', 'Usá una imagen donde se lean marca y presentación.'],
    name: ['Buscá el producto por nombre', 'Después agregá una foto para confirmar el ingreso.'],
    manual: ['Completá la información del producto', 'Podés ingresar los datos directamente o buscar en internet.']
  };
  return copyByMethod[mobileProductEntryMethod] || ['Identificá el producto', 'Podés usar foto, código o búsqueda por nombre.'];
}

function renderMobileProductAssistantReview() {
  const name = document.getElementById('fastupload-name-input')?.value.trim() || 'Sin nombre';
  const category = document.getElementById('fastupload-category-input')?.value || 'Sin categoría';
  const stock = document.getElementById('fastupload-stock-input')?.value || '0';
  const salePrice = Number(document.getElementById('fastupload-sale-price-input')?.value || 0);
  const barcode = document.getElementById('fastupload-barcode-input')?.value.trim() || 'No informado';
  return `
    <p class="assistant-question">Revisá antes de finalizar</p>
    <p class="assistant-help">La ubicación queda para el asistente de ubicación y no frena este ingreso.</p>
    <div class="assistant-review-card">
      <div class="assistant-review-row"><span>Producto</span><strong>${escapeStockHtml(name)}</strong></div>
      <div class="assistant-review-row"><span>Categoría</span><strong>${escapeStockHtml(category)}</strong></div>
      <div class="assistant-review-row"><span>Unidades</span><strong>${escapeStockHtml(stock)}</strong></div>
      <div class="assistant-review-row"><span>Precio</span><strong>${salePrice > 0 ? `$ ${salePrice.toLocaleString('es-AR')}` : 'Sin confirmar'}</strong></div>
      <div class="assistant-review-row"><span>Código</span><strong>${escapeStockHtml(barcode)}</strong></div>
      <div class="assistant-review-row"><span>Ubicación</span><strong>Pendiente de ubicar</strong></div>
    </div>`;
}

function renderMobileProductAssistant() {
  const assistant = document.getElementById('mobile-product-assistant');
  const content = document.getElementById('mobile-product-assistant-content');
  const progress = document.getElementById('mobile-product-assistant-progress');
  const backButton = document.getElementById('mobile-product-assistant-back');
  const nextButton = document.getElementById('mobile-product-assistant-next');
  const navigation = backButton?.closest('.mobile-task-assistant-nav');
  const form = document.getElementById('fast-upload-form');
  if (!assistant || !content || !form) return;

  const stepIndex = MOBILE_PRODUCT_ASSISTANT_STEPS.indexOf(mobileProductAssistantStep);
  form.dataset.mobileStep = mobileProductAssistantStep;
  if (progress) progress.textContent = `${stepIndex + 1} de ${MOBILE_PRODUCT_ASSISTANT_STEPS.length}`;
  if (navigation) navigation.hidden = mobileProductAssistantStep === 'method';
  if (backButton) backButton.hidden = mobileProductAssistantStep === 'method';
  if (nextButton) nextButton.hidden = mobileProductAssistantStep === 'method' || mobileProductAssistantStep === 'review';

  if (mobileProductAssistantStep === 'method') {
    content.innerHTML = renderMobileProductMethodChoices();
    return;
  }
  if (mobileProductAssistantStep === 'identify') {
    const [question, help] = getMobileProductIdentifyCopy();
    content.innerHTML = `<p class="assistant-question">${escapeStockHtml(question)}</p><p class="assistant-help">${escapeStockHtml(help)}</p>`;
    if (nextButton) nextButton.textContent = 'Datos del producto ➔';
    return;
  }
  if (mobileProductAssistantStep === 'details') {
    content.innerHTML = fastUploadLookupResult?.found
      ? '<p class="assistant-question">Completá cantidad y precio</p><p class="assistant-help">Los demás datos ya fueron completados. Podés revisarlos si hace falta.</p>'
      : '<p class="assistant-question">Confirmá los datos, la cantidad y el precio</p><p class="assistant-help">Corregí cualquier dato antes de continuar.</p>';
    if (nextButton) nextButton.textContent = 'Revisar ingreso ➔';
    return;
  }
  content.innerHTML = renderMobileProductAssistantReview();
  const submitButton = document.getElementById('fastupload-submit-btn');
  if (submitButton) submitButton.textContent = 'Ingresar y ubicar después';
}

function focusMobileProductMethod(method) {
  window.setTimeout(() => {
    if (method === 'barcode') focusFastUploadBarcode();
    else if (method === 'camera') openFastUploadPhotoPicker('fastupload-camera-input');
    else if (method === 'gallery') openFastUploadPhotoPicker('fastupload-gallery-input');
    else if (method === 'name') document.getElementById('fastupload-manual-query-input')?.focus();
  }, 120);
}

function chooseMobileProductEntryMethod(method) {
  const validMethods = new Set(['barcode', 'camera', 'gallery', 'name', 'manual']);
  if (!validMethods.has(method)) return;
  mobileProductEntryMethod = method;
  setMobileProductAssistantStep('identify');
  focusMobileProductMethod(method);
}

function continueMobileProductAssistant() {
  if (mobileProductAssistantStep === 'identify') {
    const query = document.getElementById('fastupload-manual-query-input')?.value.trim();
    const barcode = document.getElementById('fastupload-barcode-input')?.value.trim();
    const nameInput = document.getElementById('fastupload-name-input');
    const barcodeInput = document.getElementById('fastupload-barcode-input');
    if (query && nameInput && !nameInput.value) {
      nameInput.value = query;
    }
    if (barcode && barcodeInput && !barcodeInput.value) {
      barcodeInput.value = barcode;
    }
    setMobileProductAssistantStep('details');
    return;
  }
  if (mobileProductAssistantStep === 'details') {
    const name = document.getElementById('fastupload-name-input')?.value.trim();
    const category = document.getElementById('fastupload-category-input')?.value;
    const stock = Number.parseInt(document.getElementById('fastupload-stock-input')?.value || '', 10);
    const salePrice = Number(document.getElementById('fastupload-sale-price-input')?.value || 0);
    if (!name) {
      showToast('⚠️ Ingresá el nombre del producto.');
      document.getElementById('fastupload-name-input')?.focus();
      return;
    }
    if (!category) {
      showToast('⚠️ Seleccioná la categoría del producto.');
      document.getElementById('fastupload-category-input')?.focus();
      return;
    }
    if (!Number.isFinite(stock) || stock < 0) {
      showToast('⚠️ Indicá la cantidad de unidades recibidas.');
      document.getElementById('fastupload-stock-input')?.focus();
      return;
    }
    if (!Number.isFinite(salePrice) || salePrice <= 0) {
      showToast('⚠️ Confirmá el precio de venta.');
      document.getElementById('fastupload-sale-price-input')?.focus();
      return;
    }
    setMobileProductAssistantStep('review');
  }
}

function goBackMobileProductAssistant() {
  const index = MOBILE_PRODUCT_ASSISTANT_STEPS.indexOf(mobileProductAssistantStep);
  setMobileProductAssistantStep(MOBILE_PRODUCT_ASSISTANT_STEPS[Math.max(0, index - 1)]);
}

function updateFastUploadLocationPreview() {
  const floor = Number(document.getElementById('fastupload-floor-input')?.value || 1);
  const shelf = document.getElementById('fastupload-shelf-input')?.value || '';
  const level = Number(document.getElementById('fastupload-level-input')?.value || 2);
  const floorNames = { 1: 'Planta baja', 2: 'Entrepiso', 3: 'Depósito alto' };
  const levelNames = { 1: 'Inferior', 2: 'Medio', 3: 'Superior' };
  const label = shelf ? `${floorNames[floor]} · Estante ${shelf} · Nivel ${levelNames[level]}` : 'Ubicación pendiente';
  const preview = document.getElementById('fastupload-location-preview');
  const legacyInput = document.getElementById('fastupload-location-input');
  if (preview) preview.textContent = label;
  if (legacyInput) legacyInput.value = shelf ? label : '';
}

function focusFastUploadBarcode() {
  const input = document.getElementById('fastupload-barcode-input');
  if (!input) return;
  stockGlobalScannerBuffer = '';
  input.focus();
  input.select();
  setStockScannerState('ready', 'Pistola activa · escaneá el código ahora');
  showToast('Lector listo: escaneá ahora o escribí el código.');
}

function openMapForStockEntry() {
  const shelf = document.getElementById('fastupload-shelf-input')?.value;
  const level = Number(document.getElementById('fastupload-level-input')?.value || 2);
  switchVendorTab('map');
  if (shelf) renderStoreMapUI(null, shelf, level);
}

function openFastUploadPhotoPicker(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  // Limpiar el valor permite volver a seleccionar la misma foto en Android e iOS.
  input.value = '';
  input.click();
}

function isSupportedFastUploadImage(file) {
  if (file.type && file.type.startsWith('image/')) return true;
  const extension = file.name.split('.').pop()?.toLowerCase();
  return FAST_UPLOAD_IMAGE_EXTENSIONS.has(extension);
}

function revokeFastUploadPreviewUrl() {
  if (!fastUploadPreviewUrl) return;
  if (fastUploadPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(fastUploadPreviewUrl);
  fastUploadPreviewUrl = '';
}

function getFastUploadPhotoElements() {
  return {
    previewImg: document.getElementById('fastupload-photo-img'),
    trigger: document.getElementById('fastupload-photo-trigger'),
    previewContainer: document.getElementById('fastupload-photo-preview-container'),
    sourceLabel: document.getElementById('fastupload-photo-source'),
    analyzeButton: document.getElementById('fastupload-ai-btn'),
    status: document.getElementById('fastupload-ai-status')
  };
}

function setFastUploadPhotoError(message, elements = getFastUploadPhotoElements()) {
  fastUploadSelectedFile = null;
  revokeFastUploadPreviewUrl();
  if (elements.previewImg) {
    elements.previewImg.removeAttribute('src');
    elements.previewImg.onerror = null;
    elements.previewImg.onload = null;
  }
  if (elements.trigger) elements.trigger.hidden = false;
  if (elements.previewContainer) elements.previewContainer.hidden = true;
  if (elements.sourceLabel) elements.sourceLabel.hidden = true;
  if (elements.analyzeButton) elements.analyzeButton.disabled = true;
  if (elements.status) {
    elements.status.hidden = false;
    elements.status.dataset.state = 'error';
    elements.status.textContent = message;
  }
}

async function hasHeicContainerSignature(file) {
  const mimeType = String(file.type || '').toLowerCase();
  const extension = file.name?.split('.').pop()?.toLowerCase();
  if (mimeType.includes('heic') || mimeType.includes('heif') || extension === 'heic' || extension === 'heif') {
    return true;
  }

  try {
    const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    if (header.length < 12) return false;
    const boxType = String.fromCharCode(...header.slice(4, 8));
    if (boxType !== 'ftyp') return false;
    const majorBrand = String.fromCharCode(...header.slice(8, 12)).toLowerCase();
    if (majorBrand === 'avif' || majorBrand === 'avis') return false;
    // HEIC puede llegar desde Android con nombre .jpg; las marcas del contenedor son más confiables.
    for (let offset = 8; offset + 4 <= header.length; offset += 4) {
      const brand = String.fromCharCode(...header.slice(offset, offset + 4)).toLowerCase();
      if (HEIC_BRANDS.has(brand)) return true;
    }
  } catch (error) {
    console.warn('No se pudo inspeccionar el formato interno de la foto:', error);
  }
  return false;
}

function loadHeicConverter() {
  if (typeof window.HeicTo === 'function') return Promise.resolve(window.HeicTo);
  if (heicConverterPromise) return heicConverterPromise;

  heicConverterPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${HEIC_CONVERTER_URL}"]`);
    const script = existingScript || document.createElement('script');
    const handleLoad = () => {
      if (typeof window.HeicTo === 'function') resolve(window.HeicTo);
      else reject(new Error('El conversor de fotos no quedó disponible.'));
    };
    const handleError = () => reject(new Error('No se pudo cargar el conversor de fotos HEIC.'));
    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    if (!existingScript) {
      script.src = HEIC_CONVERTER_URL;
      script.async = true;
      script.crossOrigin = 'anonymous';
      document.head.appendChild(script);
    }
  }).catch(error => {
    document.querySelector(`script[src="${HEIC_CONVERTER_URL}"]`)?.remove();
    heicConverterPromise = null;
    throw error;
  });
  return heicConverterPromise;
}

async function convertHeicToJpeg(file) {
  const converter = await loadHeicConverter();
  const result = await converter({
    blob: file,
    type: 'image/jpeg',
    quality: 0.86
  });
  const jpegBlob = Array.isArray(result) ? result[0] : result;
  if (!(jpegBlob instanceof Blob) || !jpegBlob.size) {
    throw new Error('La foto HEIC no pudo convertirse a JPG.');
  }
  const baseName = String(file.name || 'foto-producto').replace(/\.(heic|heif)$/i, '');
  return new File([jpegBlob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: file.lastModified || Date.now()
  });
}

async function prepareFastUploadImage(file) {
  const isHeic = await hasHeicContainerSignature(file);
  return isHeic ? await convertHeicToJpeg(file) : file;
}

async function handleFastUploadPhotoChange(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!isSupportedFastUploadImage(file)) {
    showToast('Elegí una foto JPG, PNG, WebP, HEIC o HEIF.');
    event.target.value = '';
    return;
  }
  if (file.size > FAST_UPLOAD_MAX_FILE_SIZE) {
    showToast('La imagen supera 25 MB. Elegí una foto más liviana.');
    event.target.value = '';
    return;
  }

  const selectionId = ++fastUploadPhotoSelectionId;
  fastUploadAiResult = null;
  const elements = getFastUploadPhotoElements();
  if (elements.analyzeButton) elements.analyzeButton.disabled = true;
  if (elements.status) {
    elements.status.hidden = false;
    elements.status.dataset.state = 'loading';
    elements.status.textContent = 'Preparando la foto para este teléfono…';
  }

  try {
    const isHeic = await hasHeicContainerSignature(file);
    const preparedFile = isHeic ? await convertHeicToJpeg(file) : file;
    const decoded = await decodeFastUploadImage(preparedFile);
    if (selectionId !== fastUploadPhotoSelectionId) {
      if (decoded.objectUrl) URL.revokeObjectURL(decoded.objectUrl);
      return;
    }

    revokeFastUploadPreviewUrl();
    fastUploadPreviewUrl = decoded.previewUrl;
    fastUploadSelectedFile = preparedFile;
    fastUploadLookupImageShown = false;
    if (elements.previewImg) {
      elements.previewImg.onerror = () => {
        setFastUploadPhotoError('No pudimos mostrar esta foto. Elegí otra imagen o volvé a sacarla.', elements);
      };
      elements.previewImg.onload = () => {
        elements.previewImg.onerror = null;
        elements.previewImg.onload = null;
      };
      elements.previewImg.src = fastUploadPreviewUrl;
    }
    if (elements.trigger) elements.trigger.hidden = true;
    if (elements.previewContainer) elements.previewContainer.hidden = false;
    if (elements.sourceLabel) elements.sourceLabel.hidden = true;
    if (elements.analyzeButton) elements.analyzeButton.disabled = false;
    if (elements.status) {
      elements.status.hidden = false;
      elements.status.dataset.state = 'ready';
      elements.status.textContent = isHeic
        ? 'Foto HEIC convertida a JPG y lista. Ya podés analizarla o adjuntarla.'
        : 'Foto lista para adjuntar. Podés usar la búsqueda sin IA o analizar el envase como ayuda opcional.';
    }
  } catch (error) {
    console.error('Error al preparar la foto seleccionada:', error);
    if (selectionId !== fastUploadPhotoSelectionId) return;
    setFastUploadPhotoError(
      'No pudimos preparar esta foto. Revisá tu conexión y volvé a elegirla; también podés sacar una nueva.',
      elements
    );
    event.target.value = '';
  }
}

function loadFastUploadImageSource(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('El navegador no pudo decodificar la imagen.'));
    image.src = source;
  });
}

async function decodeFastUploadImage(file) {
  let objectUrl = '';
  try {
    objectUrl = URL.createObjectURL(file);
    const image = await loadFastUploadImageSource(objectUrl);
    return { image, objectUrl, previewUrl: objectUrl };
  } catch (objectUrlError) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    try {
      // Algunos navegadores Android fallan con blob:, pero sí leen el mismo archivo como Data URL.
      const dataUrl = await blobToDataUrl(file);
      const image = await loadFastUploadImageSource(dataUrl);
      return { image, objectUrl: '', previewUrl: dataUrl };
    } catch (dataUrlError) {
      console.warn('Fallaron las dos formas de lectura de la foto:', { objectUrlError, dataUrlError });
      throw new Error('El navegador no pudo leer esta foto aunque el formato sea compatible.');
    }
  }
}

function calculateCompressedImageSize(image, maxWidth, maxHeight) {
  const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  return {
    width: Math.max(1, Math.round(image.naturalWidth * scale)),
    height: Math.max(1, Math.round(image.naturalHeight * scale))
  };
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('No se pudo reducir el tamaño de la imagen.'));
    }, 'image/jpeg', quality);
  });
}

async function compressImageFile(file, maxWidth = 800, maxHeight = 800, quality = 0.70) {
  // Method 1: Hardware-accelerated downscaling via createImageBitmap (ultra-low memory footprint on mobile)
  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: false });
      if (context) {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(bitmap, 0, 0, width, height);
        if (typeof bitmap.close === 'function') bitmap.close();
        return await canvasToJpegBlob(canvas, quality);
      }
      if (typeof bitmap.close === 'function') bitmap.close();
    } catch (bitmapErr) {
      console.warn('createImageBitmap downscale fallback:', bitmapErr);
    }
  }

  // Method 2: Fallback downscaling via HTMLImageElement
  const compatibleFile = await prepareFastUploadImage(file);
  const decoded = await decodeFastUploadImage(compatibleFile);
  try {
    const { width, height } = calculateCompressedImageSize(decoded.image, maxWidth, maxHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('El navegador no permite preparar esta imagen.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded.image, 0, 0, width, height);
    return await canvasToJpegBlob(canvas, quality);
  } finally {
    if (decoded.objectUrl) URL.revokeObjectURL(decoded.objectUrl);
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo preparar la imagen.'));
    reader.readAsDataURL(blob);
  });
}

function setStockFieldValue(id, value, overwrite = false) {
  const field = document.getElementById(id);
  if (!field || value === null || value === undefined || value === '') return;
  if (overwrite || !field.value.trim()) field.value = String(value);
}

async function readStockLookupRows(query, sourceName) {
  try {
    const { data, error } = await query;
    if (error) {
      console.warn(`Consulta BÔ (${sourceName}):`, error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn(`Consulta BÔ (${sourceName}):`, err.message);
    return [];
  }
}

function catalogDescriptionToPlainText(value) {
  if (!value) return null;
  const source = String(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n');
  const documentFragment = new DOMParser().parseFromString(source, 'text/html');
  return (documentFragment.body.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim() || null;
}

function normalizeCatalogLookup(product, fallback = {}) {
  if (!product && !fallback.name) return null;
  const suppliers = product?.supplier_products || [];
  const localSupplier = suppliers.find(item => item.supplier_id === 'local_store');
  const linkedSupplier = suppliers.find(item => item.link);
  const sources = [];
  if (fallback.official_url) sources.push({ label: 'Página oficial guardada en BÔ', url: fallback.official_url });
  if (linkedSupplier?.link) sources.push({ label: 'Ficha del proveedor', url: linkedSupplier.link });
  return {
    found: true,
    product: {
      name: fallback.name || product?.name || null,
      brand: fallback.brand || null,
      presentation: fallback.presentation || null,
      category: fallback.category || product?.category || null,
      description: catalogDescriptionToPlainText(fallback.description || product?.description),
      barcode: fallback.barcode || product?.barcode || null,
      official_url: fallback.official_url || null,
      market_query: fallback.name || product?.name || null,
      image_url: fallback.image_url || product?.image || product?.metadata?.image_url || product?.metadata?.image || null
    },
    sale_price: Number(fallback.sale_price) || Number(product?.price) || Number(localSupplier?.price) || null,
    sources,
    providers: ['Catálogo BÔ'],
    warnings: []
  };
}

async function fetchCatalogProductById(productId) {
  if (!productId) return null;
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  if (!context?.isVerified || !context.tenantId) return null;
  const rows = await readStockLookupRows(
    supabaseClient
      .from('catalog_products')
      .select('id,sku,barcode,name,category,description,price,currency,metadata')
      .eq('tenant_id', context.tenantId)
      .eq('active', true)
      .eq('id', productId)
      .limit(1),
    'Catálogo operativo'
  );
  return rows[0] || null;
}

function normalizeStockMatchToken(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^(\d+(?:[.,]\d+)?)(?:litros?|lts?|lt)$/i, '$1l')
    .replace(/^(\d+(?:[.,]\d+)?)(?:gramos?|grs?|gr)$/i, '$1g')
    .toLowerCase();
}

function stockMatchTokens(value) {
  return String(value || '')
    .match(/[\p{L}\p{N}.,]+/gu)?.map(normalizeStockMatchToken)
    .filter(token => token.length >= 2) || [];
}

function isReliableCatalogNameMatch(productName, requestedName) {
  const requestedTokens = stockMatchTokens(requestedName);
  const productTokens = new Set(stockMatchTokens(productName));
  if (!requestedTokens.length || !productTokens.size) return false;
  if (requestedTokens.length === 1) return productTokens.has(requestedTokens[0]);
  const totalWeight = requestedTokens.reduce((sum, token) => sum + token.length, 0);
  const matchedWeight = requestedTokens
    .filter(token => productTokens.has(token))
    .reduce((sum, token) => sum + token.length, 0);
  return matchedWeight / totalWeight >= 0.78;
}

async function findLocalStockProduct(barcode, query) {
  if (!supabaseClient) return null;
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  if (!context?.isVerified || !context.tenantId) return null;
  if (barcode) {
    const catalogRows = await readStockLookupRows(
      supabaseClient
        .from('catalog_products')
        .select('id,sku,barcode,name,category,description,price,currency,metadata')
        .eq('tenant_id', context.tenantId)
        .eq('active', true)
        .eq('barcode', barcode)
        .limit(1),
      'Catálogo operativo por código de barras'
    );
    if (catalogRows[0]) return normalizeCatalogLookup(catalogRows[0]);
  }

  const safeQuery = String(query || '')
    .replace(/[%_,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  if (safeQuery.length < 2) return null;

  let catalogRows = await readStockLookupRows(
    supabaseClient
      .from('catalog_products')
      .select('id,sku,barcode,name,category,description,price,currency,metadata')
      .eq('tenant_id', context.tenantId)
      .eq('active', true)
      .ilike('name', `%${safeQuery}%`)
      .limit(3),
    'Catálogo operativo'
  );
  if (!catalogRows.length) {
    const mostSpecificTerm = stockMatchTokens(safeQuery)
      .filter(term => term.length >= 4)
      .sort((a, b) => b.length - a.length)[0];
    if (mostSpecificTerm && mostSpecificTerm !== safeQuery.toLowerCase()) {
      catalogRows = await readStockLookupRows(
        supabaseClient
          .from('catalog_products')
          .select('id,sku,barcode,name,category,description,price,currency,metadata')
          .eq('tenant_id', context.tenantId)
          .eq('active', true)
          .ilike('name', `%${mostSpecificTerm}%`)
          .limit(3),
        'Catálogo operativo'
      );
    }
  }
  const reliableMatch = catalogRows.find(product => isReliableCatalogNameMatch(product.name, safeQuery));
  return reliableMatch ? normalizeCatalogLookup(reliableMatch) : null;
}

async function fetchExternalStockLookup(barcode, query) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 30_000);
  const criterion = getActiveStockCriterion();
  try {
    if (!supabaseClient?.auth) throw new Error('Iniciá sesión para consultar fuentes externas.');
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError || !sessionData?.session?.access_token) {
      throw new Error('La sesión segura expiró. Volvé a iniciar sesión.');
    }
    const response = await fetch('/.netlify/functions/lookup-product', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session.access_token}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        barcode: barcode || null,
        query: query || null,
        country: criterion.country,
        vertical: criterion.vertical
      })
    });
    let result = {};
    try {
      result = await response.json();
    } catch (parseError) {
      console.warn('La búsqueda externa devolvió una respuesta sin JSON:', parseError);
    }
    if (!response.ok) throw new Error(result.message || 'Las fuentes externas no respondieron.');
    return result;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function mergeStockLookupResults(localResult, externalResult) {
  const localProduct = localResult?.product || {};
  const externalProduct = externalResult?.product || {};
  const fields = [
    'name', 'brand', 'presentation', 'category', 'description', 'barcode',
    'official_url', 'market_query', 'image_url'
  ];
  const product = {};
  fields.forEach(field => {
    product[field] = localProduct[field] || externalProduct[field] || null;
  });

  const sourcesByUrl = new Map();
  [...(localResult?.sources || []), ...(externalResult?.sources || [])].forEach(source => {
    if (source?.url) sourcesByUrl.set(source.url, source);
  });
  return {
    mode: 'lookup_without_ai',
    found: Boolean(localResult?.found || externalResult?.found),
    product,
    sale_price: localResult?.sale_price || null,
    market: externalResult?.market || null,
    sources: [...sourcesByUrl.values()],
    providers: [...new Set([...(localResult?.providers || []), ...(externalResult?.providers || [])])],
    warnings: [...(localResult?.warnings || []), ...(externalResult?.warnings || [])]
  };
}

function setStockLookupLoading(isLoading) {
  document.querySelectorAll('[data-stock-lookup-button]').forEach(button => {
    button.disabled = isLoading;
  });
}

function resetFastUploadLookupPresentation(clearFields = false) {
  const detailsPanel = document.querySelector('.stock-entry-details-panel');
  const summary = document.getElementById('fastupload-found-summary');
  detailsPanel?.classList.remove('lookup-complete', 'show-lookup-details');
  if (summary) summary.hidden = true;
  if (clearFields) {
    [
      'fastupload-name-input', 'fastupload-brand-input', 'fastupload-presentation-input',
      'fastupload-category-input', 'fastupload-description-input', 'fastupload-official-url-input',
      'fastupload-market-price-input', 'fastupload-sale-price-input'
    ].forEach(id => {
      const field = document.getElementById(id);
      if (field) field.value = '';
    });
    const sourceLinks = document.getElementById('fastupload-source-links');
    if (sourceLinks) sourceLinks.innerHTML = '';
  }
  if (fastUploadLookupImageShown && !fastUploadSelectedFile) {
    const previewImage = document.getElementById('fastupload-photo-img');
    const previewContainer = document.getElementById('fastupload-photo-preview-container');
    const trigger = document.getElementById('fastupload-photo-trigger');
    const sourceLabel = document.getElementById('fastupload-photo-source');
    if (previewImage) previewImage.src = '';
    if (previewContainer) previewContainer.hidden = true;
    if (trigger) trigger.hidden = false;
    if (sourceLabel) sourceLabel.hidden = true;
    fastUploadLookupImageShown = false;
  }
}

function renderFastUploadLookupSummary(result) {
  const product = result.product || {};
  const summary = document.getElementById('fastupload-found-summary');
  const name = document.getElementById('fastupload-found-name');
  const meta = document.getElementById('fastupload-found-meta');
  const image = document.getElementById('fastupload-found-image');
  const detailsPanel = document.querySelector('.stock-entry-details-panel');
  if (!summary || !detailsPanel) return;

  if (name) name.textContent = product.name || 'Producto encontrado';
  const details = [product.brand, product.presentation, product.category].filter(Boolean);
  if (result.market?.average_price) details.push(`Referencia $${Math.round(result.market.average_price).toLocaleString('es-AR')}`);
  if (meta) meta.textContent = details.join(' · ') || `Código ${product.barcode || 'identificado'}`;
  if (image) {
    image.hidden = !product.image_url;
    image.src = product.image_url || '';
    image.alt = product.image_url ? `Imagen encontrada de ${product.name || 'producto'}` : '';
  }
  summary.hidden = false;
  detailsPanel.classList.add('lookup-complete');
  detailsPanel.classList.remove('show-lookup-details');

  if (product.image_url && !fastUploadSelectedFile) {
    const previewImage = document.getElementById('fastupload-photo-img');
    const previewContainer = document.getElementById('fastupload-photo-preview-container');
    const trigger = document.getElementById('fastupload-photo-trigger');
    const sourceLabel = document.getElementById('fastupload-photo-source');
    if (previewImage) {
      previewImage.onerror = () => {
        previewImage.removeAttribute('src');
        previewImage.onerror = null;
        if (previewContainer) previewContainer.hidden = true;
        if (trigger) trigger.hidden = false;
        if (sourceLabel) sourceLabel.hidden = true;
        fastUploadLookupImageShown = false;
      };
      previewImage.onload = () => {
        previewImage.onload = null;
      };
      previewImage.src = product.image_url;
    }
    if (previewContainer) previewContainer.hidden = false;
    if (trigger) trigger.hidden = true;
    if (sourceLabel) sourceLabel.hidden = false;
    fastUploadLookupImageShown = true;
  }
  const photoRequirement = document.getElementById('fastupload-photo-requirement');
  if (photoRequirement) photoRequirement.textContent = 'Foto opcional · código encontrado';
}

function toggleFastUploadLookupDetails() {
  const detailsPanel = document.querySelector('.stock-entry-details-panel');
  if (!detailsPanel) return;
  const showDetails = detailsPanel.classList.toggle('show-lookup-details');
  const button = document.querySelector('#fastupload-found-summary button');
  if (button) button.textContent = showDetails ? 'Ocultar datos' : 'Revisar datos';
}

function applyStockLookupResult(result) {
  const product = result.product || {};
  setStockFieldValue('fastupload-name-input', product.name);
  setStockFieldValue('fastupload-brand-input', product.brand);
  setStockFieldValue('fastupload-presentation-input', product.presentation);
  setStockFieldValue('fastupload-category-input', product.category);
  setStockFieldValue('fastupload-description-input', product.description);
  setStockFieldValue('fastupload-official-url-input', product.official_url);
  setStockFieldValue('fastupload-barcode-input', product.barcode);
  if (result.market?.average_price) {
    setStockFieldValue('fastupload-market-price-input', Math.round(result.market.average_price), true);
  }
  const suggestedPrice = result.sale_price || result.market?.median_price || result.market?.average_price;
  setStockFieldValue('fastupload-sale-price-input', suggestedPrice ? Math.round(suggestedPrice) : null);
  renderAiSourceLinks(result);
  renderFastUploadLookupSummary(result);
}

async function lookupFastUploadProductWithoutAi(mode = 'barcode') {
  const status = document.getElementById('fastupload-lookup-status');
  if (!status) return;
  if (stockLookupInProgress) {
    setStockScannerState('reading', 'Búsqueda en curso…');
    return;
  }
  const barcodeInput = document.getElementById('fastupload-barcode-input');
  const rawBarcode = barcodeInput?.value || '';
  const cleanBarcode = rawBarcode.replace(/[^\d]/g, '');

  if (cleanBarcode && barcodeInput && barcodeInput.value !== cleanBarcode) {
    barcodeInput.value = cleanBarcode;
  }

  const barcode = cleanBarcode;
  const manualQueryInput = document.getElementById('fastupload-manual-query-input');
  const manualQuery = manualQueryInput?.value.trim() || '';
  if (mode === 'barcode' && barcode && manualQueryInput) manualQueryInput.value = '';
  const identityFields = manualQuery ? [manualQuery] : [
    document.getElementById('fastupload-brand-input')?.value.trim(),
    document.getElementById('fastupload-name-input')?.value.trim(),
    document.getElementById('fastupload-presentation-input')?.value.trim()
  ];
  const identityQuery = (mode === 'barcode' ? [] : identityFields)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (rawBarcode.trim() && !barcode && identityQuery.length < 2) {
    status.hidden = false;
    status.dataset.state = 'error';
    status.textContent = 'El código de barras debe contener números (entre 6 y 18 dígitos).';
    setStockScannerState('error', 'No pudimos leer un código numérico válido');
    return;
  }

  if (barcode && (barcode.length < 6 || barcode.length > 18)) {
    status.hidden = false;
    status.dataset.state = 'error';
    status.textContent = `El código ingresado tiene ${barcode.length} números. Debe contener entre 6 y 18 dígitos.`;
    setStockScannerState('error', 'Código incompleto o demasiado largo');
    return;
  }

  if (!barcode && identityQuery.length < 2) {
    status.hidden = false;
    status.dataset.state = 'error';
    status.textContent = 'Escaneá un código o escribí el nombre, la marca o el SKU.';
    return;
  }

  const lookupSignature = `${mode}:${barcode}:${identityQuery.toLocaleLowerCase('es')}`;
  if (lookupSignature === stockLookupLastSignature && Date.now() - stockLookupLastStartedAt < 1600) return;
  if (lookupSignature !== stockLookupLastSignature) {
    resetFastUploadLookupPresentation(Boolean(stockLookupLastSignature));
    fastUploadLookupResult = null;
  }
  stockLookupLastSignature = lookupSignature;
  stockLookupLastStartedAt = Date.now();
  stockLookupInProgress = true;

  setStockLookupLoading(true);
  status.hidden = false;
  status.dataset.state = 'loading';
  status.textContent = 'Buscando en BÔ, Google Argentina y comercios de growshop…';
  if (barcode) setStockScannerState('reading', 'Código leído · completando la ficha…');

  try {
    const [localAttempt, externalAttempt] = await Promise.allSettled([
      findLocalStockProduct(barcode, identityQuery),
      fetchExternalStockLookup(barcode, identityQuery)
    ]);
    const localResult = localAttempt.status === 'fulfilled' ? localAttempt.value : null;
    const externalResult = externalAttempt.status === 'fulfilled' ? externalAttempt.value : null;

    if (!localResult && !externalResult) {
      const reason = externalAttempt.status === 'rejected' ? externalAttempt.reason : localAttempt.reason;
      throw reason || new Error('No se pudo completar la búsqueda.');
    }

    const result = mergeStockLookupResults(localResult, externalResult);
    fastUploadLookupResult = result;
    if (!result.found) {
      renderAiSourceLinks(result);
      status.dataset.state = 'error';
      status.innerHTML = `
        <div style="margin-bottom: 8px;">No encontramos una coincidencia automática confiable. Podés abrir Google Argentina desde las fuentes o completar los datos manualmente.</div>
        <button type="button" class="stock-inline-action-btn" onclick="continueMobileProductAssistant()" style="width: 100%; min-height: 42px; background: #c2a246; color: #152d24; border: none; font-weight: 800; border-radius: 10px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); font-size: 0.85rem;">
          ✏️ Completar datos manualmente ahora ➔
        </button>
      `;
      if (barcode) setStockScannerState('error', 'Código leído, pero sin datos disponibles');
      return;
    }

    applyStockLookupResult(result);
    const providers = result.providers.length ? result.providers.join(', ') : 'fuentes disponibles';
    const marketCopy = result.market?.sample_size
      ? ` Precio estimado con ${result.market.sample_size} publicaciones comparables.`
      : (result.warnings.length ? '' : ' El precio puede completarse manualmente.');
    const warningCopy = result.warnings.length ? ` ${result.warnings.join(' ')}` : '';
    status.dataset.state = 'success';
    status.innerHTML = `
      <div style="margin-bottom: 8px;">Datos encontrados en ${providers}.${marketCopy}${warningCopy} Ahora completá cantidad y precio.</div>
      <button type="button" class="stock-inline-action-btn" onclick="continueMobileProductAssistant()" style="width: 100%; min-height: 42px; background: #2e7d32; color: #ffffff; border: none; font-weight: 800; border-radius: 10px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); font-size: 0.85rem;">
        ✓ Usar datos y continuar ➔
      </button>
    `;
    if (barcode) setStockScannerState('found', 'Producto encontrado · ficha completada');
    if (isMobileVendorAssistantView() && mobileProductAssistantStep === 'identify') {
      setMobileProductAssistantStep('details');
    }
    window.setTimeout(() => {
      const stockInput = document.getElementById('fastupload-stock-input');
      if (stockInput && stockInput.offsetParent !== null) {
        stockInput.focus();
        stockInput.select();
      }
    }, 180);
  } catch (error) {
    console.error('Error en búsqueda de producto sin IA:', error);
    status.dataset.state = 'error';
    status.textContent = `${error.name === 'AbortError' ? 'La búsqueda tardó demasiado.' : error.message} Podés continuar manualmente o usar la foto con IA.`;
    if (barcode) setStockScannerState('error', 'No se pudo consultar; podés reintentar');
  } finally {
    stockLookupInProgress = false;
    setStockLookupLoading(false);
  }
}

function renderAiSourceLinks(result) {
  const container = document.getElementById('fastupload-source-links');
  if (!container) return;
  container.innerHTML = '';
  const candidates = [];
  if (result.product?.official_url) candidates.push({ label: 'Página oficial', url: result.product.official_url });
  (result.sources || []).forEach(source => candidates.push({ label: source.title || source.label || 'Fuente consultada', url: source.url }));
  (result.market?.results || []).slice(0, 3).forEach(item => candidates.push({
    label: `Ver referencia en ${item.source || result.market?.provider || 'internet'}`,
    url: item.permalink
  }));
  const valid = candidates.filter(item => {
    try {
      const url = new URL(item.url);
      return ['https:', 'http:'].includes(url.protocol);
    } catch (error) {
      return false;
    }
  });
  valid.slice(0, 5).forEach(item => {
    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = item.label;
    container.appendChild(link);
  });
}

async function analyzeFastUploadPhoto() {
  const button = document.getElementById('fastupload-ai-btn');
  const status = document.getElementById('fastupload-ai-status');
  if (!fastUploadSelectedFile || !button || !status) return;
  button.disabled = true;
  button.innerHTML = '<span aria-hidden="true">✦</span> Analizando envase y mercado…';
  status.hidden = false;
  status.dataset.state = 'loading';
  status.textContent = 'Leyendo marca, presentación y datos visibles. Después contrastamos fuentes públicas.';

  try {
    const compressed = await compressImageFile(fastUploadSelectedFile, 1280, 1280, 0.78);
    const imageDataUrl = await blobToDataUrl(compressed);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 65_000);
    let response;
    const criterion = getActiveStockCriterion();
    try {
      if (!supabaseClient?.auth) throw new Error('Iniciá sesión para usar el análisis de productos.');
      const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) {
        throw new Error('La sesión segura expiró. Volvé a iniciar sesión.');
      }
      response = await fetch('/.netlify/functions/analyze-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session.access_token}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          imageDataUrl,
          barcode: document.getElementById('fastupload-barcode-input')?.value.trim() || null,
          country: criterion.country,
          vertical: criterion.vertical,
          hints: {
            name: document.getElementById('fastupload-name-input')?.value.trim() || null,
            brand: document.getElementById('fastupload-brand-input')?.value.trim() || null
          }
        })
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
    let result = {};
    try {
      result = await response.json();
    } catch (parseError) {
      console.warn('El servicio de análisis devolvió una respuesta sin JSON:', parseError);
    }
    if (!response.ok) {
      const message = response.status === 429
        ? 'Hay muchos análisis en curso. Esperá un minuto y volvé a intentar.'
        : result.message || 'La IA está ocupada. Tocá “Volver a analizar” para reintentar.';
      throw new Error(message);
    }
    fastUploadAiResult = result;
    const product = result.product || {};
    setStockFieldValue('fastupload-name-input', product.name);
    setStockFieldValue('fastupload-brand-input', product.brand);
    setStockFieldValue('fastupload-presentation-input', product.presentation);
    setStockFieldValue('fastupload-category-input', product.category);
    setStockFieldValue('fastupload-description-input', product.description);
    setStockFieldValue('fastupload-official-url-input', product.official_url);
    setStockFieldValue('fastupload-barcode-input', product.barcode);
    if (result.market?.average_price) {
      setStockFieldValue('fastupload-market-price-input', Math.round(result.market.average_price), true);
      setStockFieldValue('fastupload-sale-price-input', Math.round(result.market.median_price || result.market.average_price));
    }
    const confidence = document.getElementById('fastupload-ai-confidence');
    if (confidence && Number.isFinite(Number(product.confidence))) {
      confidence.textContent = `Confianza IA ${Math.round(Number(product.confidence) * 100)}%`;
      confidence.hidden = false;
    }
    renderAiSourceLinks(result);
    const marketCopy = result.market?.sample_size
      ? ` Precio de referencia calculado con ${result.market.sample_size} publicaciones en ARS.`
      : ' No encontramos una muestra suficiente de precios; completalo manualmente.';
    status.dataset.state = 'success';
    status.innerHTML = `
      <div style="margin-bottom: 8px;">Sugerencias completadas. Revisá los datos antes de enviar.${marketCopy}</div>
      <button type="button" class="stock-inline-action-btn" onclick="continueMobileProductAssistant()" style="width: 100%; min-height: 42px; background: #2e7d32; color: #ffffff; border: none; font-weight: 800; border-radius: 10px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); font-size: 0.85rem;">
        ✓ Continuar con estos datos ➔
      </button>
    `;
  } catch (error) {
    console.error('Error al analizar el producto:', error);
    status.dataset.state = 'error';
    const errorMessage = error.name === 'AbortError'
      ? 'La conexión tardó demasiado. Revisá la señal del teléfono y volvé a intentar.'
      : error.message;
    status.textContent = `${errorMessage} También podés completar los campos manualmente.`;
  } finally {
    button.disabled = false;
    button.innerHTML = '<span aria-hidden="true">✦</span> Volver a analizar con IA';
  }
}

// Submit Fast Upload Draft (Vendedor)
async function submitProductDraft(event) {
  event.preventDefault();
  const submitBtn = document.getElementById('fastupload-submit-btn');

  try {
    const authContext = await ensureVendorOperationalSession({ showLogin: true });
    if (!window.OperationalApi || !authContext) {
      throw new Error('Iniciá sesión nuevamente para ingresar el producto en la cola central.');
    }
    const nameVal = document.getElementById('fastupload-name-input')?.value.trim();
    const categoryVal = document.getElementById('fastupload-category-input')?.value;
    const stockVal = Number.parseInt(document.getElementById('fastupload-stock-input')?.value || '', 10);
    const salePriceVal = Number(document.getElementById('fastupload-sale-price-input')?.value || 0);

    if (!nameVal || !categoryVal) {
      showToast('⚠️ Completá el nombre y la categoría del producto.');
      return;
    }
    if (!Number.isFinite(stockVal) || stockVal < 0) {
      showToast('⚠️ La cantidad de unidades debe ser 0 o más.');
      return;
    }
    if (!Number.isFinite(salePriceVal) || salePriceVal <= 0) {
      showToast('⚠️ Completá el precio de venta del producto.');
      document.getElementById('fastupload-sale-price-input')?.focus();
      return;
    }

    const shelfVal = document.getElementById('fastupload-shelf-input').value;
    const floorVal = shelfVal ? Number(document.getElementById('fastupload-floor-input').value || 1) : null;
    const shelfLevelVal = shelfVal ? Number(document.getElementById('fastupload-level-input').value || 2) : null;
    const locationVal = document.getElementById('fastupload-location-input').value.trim();
    const obsVal = document.getElementById('fastupload-obs-input').value.trim();
    const activeVendor = localStorage.getItem('boeweb_vendor_name') || 'Vendedor Local';

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = fastUploadSelectedFile ? '⏳ Comprimiendo y subiendo foto...' : '⏳ Guardando producto...';
    }

    // La foto es opcional. La tabla histórica exige un texto en image_path,
    // por eso usamos una cadena vacía cuando el ingreso se hizo por código.
    let filePath = '';
    let imageUrl = fastUploadLookupResult?.product?.image_url || '';
    if (fastUploadSelectedFile) {
      const compressedBlob = await compressImageFile(fastUploadSelectedFile, 1000, 1000, 0.75);
      filePath = `drafts/${fastUploadProductCode}_${Date.now()}.jpg`;
      const { error: uploadError } = await supabaseClient
        .storage
        .from('product-images')
        .upload(filePath, compressedBlob, { contentType: 'image/jpeg', upsert: false });

      if (uploadError) {
        throw new Error(`Error al subir imagen a Supabase Storage: ${uploadError.message}`);
      }

      const { data: urlData } = supabaseClient
        .storage
        .from('product-images')
        .getPublicUrl(filePath);
      imageUrl = urlData ? urlData.publicUrl : imageUrl;
    }
    const marketResult = fastUploadAiResult?.market || fastUploadLookupResult?.market || {};
    const metadata = {
      product_code: fastUploadProductCode,
      name: nameVal,
      brand: document.getElementById('fastupload-brand-input').value.trim() || null,
      presentation: document.getElementById('fastupload-presentation-input').value.trim() || null,
      category: categoryVal,
      description: document.getElementById('fastupload-description-input').value.trim() || null,
      barcode: document.getElementById('fastupload-barcode-input').value.trim() || null,
      official_url: document.getElementById('fastupload-official-url-input').value.trim() || null,
      market_reference_url: marketResult.search_url || null,
      market_average_price: Number(document.getElementById('fastupload-market-price-input').value) || null,
      sale_price: salePriceVal,
      expiration_date: document.getElementById('fastupload-expiry-input')?.value || null,
      floor_level: floorVal,
      shelf_code: shelfVal || null,
      shelf_level: shelfLevelVal,
      ai_confidence: Number(fastUploadAiResult?.product?.confidence) || null,
      ai_payload: (fastUploadAiResult || fastUploadLookupResult) ? {
        ai: fastUploadAiResult,
        lookup_without_ai: fastUploadLookupResult
      } : null,
      qr_payload: fastUploadQrPayload
    };
    const fullDraft = {
      sku: fastUploadProductCode,
      name: nameVal,
      barcode: metadata.barcode,
      description: metadata.description,
      brand: metadata.brand,
      presentation: metadata.presentation,
      category: categoryVal,
      image_url: imageUrl,
      image_path: filePath,
      sale_price: salePriceVal,
      currency: 'ARS',
      stock_quantity: stockVal,
      location: shelfVal ? {
        code: shelfVal,
        name: locationVal || shelfVal,
        location_type: 'SHELF',
        is_sellable: true,
        is_default: false,
        metadata: {
          floor_level: floorVal,
          shelf_code: shelfVal,
          shelf_level: shelfLevelVal
        }
      } : {},
      metadata: {
        ...metadata,
        observations: obsVal || null,
        seller_name: activeVendor
      }
    };
    await window.OperationalApi.submitCatalogProductDraft({
      supabaseClient,
      authContext,
      draft: fullDraft,
      idempotencyKey: `product-draft:${authContext.userId}:${globalThis.crypto?.randomUUID?.() || Date.now()}`
    });

    showToast(shelfVal
      ? `Producto ${fastUploadProductCode} enviado a revisión con ubicación ${shelfVal}.`
      : `Producto ${fastUploadProductCode} ingresado y agregado a pendientes de ubicación.`);

    fastUploadSelectedFile = null;
    fastUploadAiResult = null;
    resetFastUploadLookupPresentation();
    fastUploadLookupResult = null;
    fastUploadLookupImageShown = false;
    stockLookupLastSignature = '';
    stockLookupLastStartedAt = 0;
    revokeFastUploadPreviewUrl();
    fastUploadProductCode = createProductCode();
    document.getElementById('fast-upload-form').reset();
    document.getElementById('fastupload-photo-trigger').hidden = false;
    document.getElementById('fastupload-photo-preview-container').hidden = true;
    document.getElementById('fastupload-photo-source').hidden = true;
    document.getElementById('fastupload-ai-btn').disabled = true;
    document.getElementById('fastupload-ai-status').hidden = true;
    document.getElementById('fastupload-lookup-status').hidden = true;
    document.getElementById('fastupload-ai-confidence').hidden = true;
    document.getElementById('fastupload-source-links').innerHTML = '';
    const photoRequirement = document.getElementById('fastupload-photo-requirement');
    if (photoRequirement) photoRequirement.textContent = 'Foto opcional con código';
    initializeFastUploadForm();

    loadPendingProductDrafts();
    await refreshPendingLocationBadge();
    if (isMobileVendorAssistantView()) switchVendorTab('home');
    else switchVendorTab('drafts-review');

  } catch (err) {
    console.error('Error en submitProductDraft:', err);
    showToast(`❌ Error: ${err.message}`);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = isMobileVendorAssistantView() && mobileProductAssistantStep === 'review'
        ? 'Ingresar y ubicar después'
        : 'Ingresar producto al stock';
    }
  }
}

function hydrateProductDraft(rawDraft) {
  let metadata = rawDraft.metadata && typeof rawDraft.metadata === 'object' ? rawDraft.metadata : {};
  let cleanObservations = rawDraft.observations || '';
  if (cleanObservations.startsWith('[BÔ_META]')) {
    const separatorIndex = cleanObservations.indexOf('\n');
    const jsonText = cleanObservations.slice(9, separatorIndex === -1 ? undefined : separatorIndex);
    try {
      metadata = JSON.parse(jsonText);
      cleanObservations = separatorIndex === -1 ? '' : cleanObservations.slice(separatorIndex + 1);
    } catch (error) {
      console.warn('No se pudo leer la metadata del borrador anterior:', error);
    }
  }
  const merged = { ...metadata, ...rawDraft, observations: cleanObservations };
  Object.keys(metadata).forEach(key => {
    if (rawDraft[key] === null || rawDraft[key] === undefined || rawDraft[key] === '') merged[key] = metadata[key];
  });
  const locationData = rawDraft.location_data && typeof rawDraft.location_data === 'object'
    ? rawDraft.location_data
    : {};
  const locationMetadata = locationData.metadata && typeof locationData.metadata === 'object'
    ? locationData.metadata
    : {};
  return {
    ...merged,
    product_code: rawDraft.sku || merged.product_code || '',
    stock: rawDraft.stock_quantity ?? merged.stock ?? 0,
    sale_price: rawDraft.sale_price ?? merged.sale_price ?? 0,
    observations: metadata.observations || cleanObservations,
    seller_name: metadata.seller_name || merged.seller_name || 'Usuario operativo',
    location_label: locationData.name || merged.location_label || merged.location || '',
    location: locationData.name || merged.location || '',
    wms_code: locationData.code || merged.wms_code || '',
    shelf_code: locationMetadata.shelf_code || locationData.code || merged.shelf_code || '',
    shelf_level: locationMetadata.shelf_level ?? merged.shelf_level ?? null,
    floor_level: locationMetadata.floor_level ?? merged.floor_level ?? null
  };
}

function isPendingLocationProduct(draft) {
  return draft && draft.status !== 'REJECTED' && !String(draft.shelf_code || '').trim();
}
function updatePendingLocationIndicators(count) {
  document.querySelectorAll('[data-pending-location-count]').forEach(element => {
    element.textContent = String(count);
    element.hidden = count === 0;
  });
  const quickCopy = document.getElementById('vendor-location-quick-copy');
  if (quickCopy) quickCopy.textContent = count ? `${count} producto${count === 1 ? '' : 's'} esperando ubicación` : 'No hay productos pendientes';
}

function togglePendingLocationSelection(draftId, isChecked) {
  const idStr = String(draftId);
  if (isChecked) {
    locationAssistantSelectedDraftIds.add(idStr);
  } else {
    locationAssistantSelectedDraftIds.delete(idStr);
  }
  renderLocationAssistant();
}

function toggleAllPendingLocations(isChecked) {
  if (isChecked) {
    pendingLocationProducts.forEach(p => locationAssistantSelectedDraftIds.add(String(p.id)));
  } else {
    locationAssistantSelectedDraftIds.clear();
  }
  renderLocationAssistant();
}

function startBulkLocationAssignment() {
  const selected = pendingLocationProducts.filter(p => locationAssistantSelectedDraftIds.has(String(p.id)));
  if (!selected.length) {
    showToast('Seleccioná al menos un producto para ubicar masivamente.');
    return;
  }
  locationAssistantState = {
    ...createEmptyLocationAssistantState(),
    step: 'zone',
    product: selected[0],
    products: selected,
    isBulk: true
  };
  renderLocationAssistant();
}

function jumpToLocationAssistantStep(stepName) {
  if (LOCATION_ASSISTANT_STEP_ORDER.includes(stepName)) {
    locationAssistantState.step = stepName;
    renderLocationAssistant();
  }
}

function renderPendingLocationList() {
  if (!pendingLocationProducts.length) {
    return `
      <div class="location-empty-state">
        <strong>Todo está ubicado</strong>
        <span>Cuando ingreses un producto sin estante aparecerá en esta lista.</span>
      </div>`;
  }
  const totalSelected = locationAssistantSelectedDraftIds.size;
  const allSelected = pendingLocationProducts.length > 0 && pendingLocationProducts.every(p => locationAssistantSelectedDraftIds.has(String(p.id)));

  return `
    <p class="assistant-question">¿Qué producto vas a ubicar?</p>
    <p class="assistant-help">Podés seleccionar varios para ubicarlos en la misma góndola o avanzar uno por uno.</p>

    <!-- Barra de Selección Masiva -->
    <div style="display: flex; justify-content: space-between; align-items: center; background: #fdfbf7; border: 1.5px solid var(--vendor-gold); border-radius: 12px; padding: 10px 14px; margin-bottom: 14px; gap: 10px; flex-wrap: wrap;">
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.88rem; font-weight: 700; color: var(--vendor-forest);">
        <input type="checkbox" ${allSelected ? 'checked' : ''} onchange="toggleAllPendingLocations(this.checked)" style="width: 18px; height: 18px; accent-color: var(--vendor-forest); cursor: pointer;">
        <span>Seleccionar todos (${pendingLocationProducts.length})</span>
      </label>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 0.82rem; font-weight: 800; color: var(--vendor-muted);">${totalSelected} seleccionado${totalSelected === 1 ? '' : 's'}</span>
        ${totalSelected > 0 ? `
          <button type="button" onclick="startBulkLocationAssignment()" style="background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%); color: #fff; border: 1px solid #81c784; padding: 6px 14px; border-radius: 10px; font-weight: 800; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(46,125,50,0.25);">
            🚀 Ubicar seleccionados (${totalSelected})
          </button>
        ` : ''}
      </div>
    </div>

    <div class="location-pending-list">
      ${pendingLocationProducts.map(product => {
        const isSelected = locationAssistantSelectedDraftIds.has(String(product.id));
        return `
          <div class="location-pending-card" style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: ${isSelected ? 'rgba(194,162,70,0.12)' : '#fff'}; border: 1.5px solid ${isSelected ? 'var(--vendor-gold)' : '#e2d7c0'}; border-radius: 12px; margin-bottom: 8px;">
            <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="togglePendingLocationSelection('${escapeStockHtml(product.id)}', this.checked)" style="width: 20px; height: 20px; accent-color: var(--vendor-forest); cursor: pointer;" aria-label="Seleccionar ${escapeStockHtml(product.name || 'producto')}">
            <div style="display: flex; align-items: center; gap: 10px; flex: 1; cursor: pointer;" onclick="selectPendingLocationProduct('${escapeStockHtml(product.id)}')">
              ${product.image_url
                ? `<img src="${escapeStockHtml(product.image_url)}" alt="${escapeStockHtml(product.name || 'Producto pendiente')}" style="width: 44px; height: 44px; object-fit: cover; border-radius: 8px; border: 1px solid #e0d5c1;">`
                : '<span class="location-pending-placeholder" aria-hidden="true" style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: #f5f2e8; border-radius: 8px; font-size: 1.2rem;">📦</span>'}
              <div style="display: flex; flex-direction: column;">
                <strong style="font-size: 0.92rem; color: var(--vendor-ink);">${escapeStockHtml(product.name || product.product_code || 'Producto sin nombre')}</strong>
                <small style="font-size: 0.78rem; color: var(--vendor-muted);">${Number(product.stock) || 0} unidades · ${product.status === 'APPROVED' ? 'Aprobado' : 'En revisión'}</small>
              </div>
            </div>
            <button type="button" onclick="selectPendingLocationProduct('${escapeStockHtml(product.id)}')" style="background: none; border: 1px solid var(--vendor-gold); color: var(--vendor-forest); font-weight: 800; font-size: 0.78rem; padding: 6px 10px; border-radius: 8px; cursor: pointer;">
              Ubicar ›
            </button>
          </div>`;
      }).join('')}
    </div>`;
}

function renderLocationAssistantProductHeader() {
  const state = locationAssistantState;
  if (state.isBulk && state.products && state.products.length > 1) {
    return `
      <div style="background: rgba(46,125,50,0.08); border: 1.5px solid #81c784; border-radius: 12px; padding: 10px 14px; margin-bottom: 14px;">
        <span style="font-size: 0.72rem; font-weight: 800; color: #1b5e20; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">🚀 Ubicación Masiva de Productos (${state.products.length})</span>
        <div style="display: flex; gap: 6px; flex-wrap: wrap; max-height: 80px; overflow-y: auto;">
          ${state.products.map(p => `
            <span style="background: #fff; border: 1px solid #a5d6a7; border-radius: 6px; padding: 2px 8px; font-size: 0.78rem; font-weight: 700; color: #152d24;">
              ${escapeStockHtml(p.name || p.product_code || 'Producto')} (${Number(p.stock) || 0}u)
            </span>
          `).join('')}
        </div>
      </div>`;
  }
  const product = state.product;
  if (!product) return '';
  const isEditing = state.isEditing;
  return `
    <div class="location-assistant-product" style="display: flex; align-items: center; gap: 12px; background: #fffdfa; border: 1.5px solid ${isEditing ? 'var(--vendor-gold)' : 'rgba(194,162,70,0.3)'}; border-radius: 12px; padding: 10px 14px; margin-bottom: 14px;">
      ${product.image_url ? `<img src="${escapeStockHtml(product.image_url)}" alt="${escapeStockHtml(product.name || 'Producto')}" style="width: 44px; height: 44px; object-fit: cover; border-radius: 8px;">` : ''}
      <div style="flex: 1;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <strong style="font-size: 0.95rem; color: var(--vendor-ink);">${escapeStockHtml(product.name || product.product_code || 'Producto')}</strong>
          ${isEditing ? '<span style="background: rgba(194,162,70,0.2); color: #5c3b1e; font-size: 0.72rem; font-weight: 800; padding: 2px 8px; border-radius: 6px;">✏️ Reubicación</span>' : ''}
        </div>
        <small style="font-size: 0.8rem; color: var(--vendor-muted);">${Number(product.stock) || 0} unidades · ${escapeStockHtml(product.product_code || '')}</small>
      </div>
    </div>`;
}

function openEditProductLocation(productIdentifier, isMultiSlot = false) {
  const query = String(productIdentifier || '').trim().toUpperCase();
  if (!query) return;

  const storeLocs = (typeof window !== 'undefined' && Array.isArray(window.storeLocationProducts)) ? window.storeLocationProducts : [];
  const allCandidates = [
    ...storeLocs,
    ...(internalCatalogProducts || []),
    ...(pendingLocationProducts || [])
  ];

  let targetProduct = allCandidates.find(p => 
    (p.product_code && p.product_code.toUpperCase() === query) ||
    (p.id && String(p.id).toUpperCase() === query) ||
    (p.barcode && p.barcode.toUpperCase() === query) ||
    (p.name && p.name.toUpperCase() === query)
  );

  if (!targetProduct && typeof getCatalogProductByCode === 'function') {
    targetProduct = getCatalogProductByCode(query);
  }

  if (!targetProduct) {
    showToast(`No se encontró el producto ${productIdentifier} para reubicar.`);
    return;
  }

  const decoded = decodeHumanWmsLocation(targetProduct.wms_code || targetProduct.shelf_code || targetProduct.location || '', targetProduct);
  const zoneObj = LOCATION_ZONE_OPTIONS.find(z => z.id === decoded.zoneCode) || LOCATION_ZONE_OPTIONS[0];
  const typeObj = LOCATION_TYPE_OPTIONS.find(t => t.id === decoded.typeCode) || LOCATION_TYPE_OPTIONS[0];
  const compassObj = LOCATION_COMPASS_OPTIONS.find(c => c.id === decoded.compassCode) || LOCATION_COMPASS_OPTIONS[0];
  const wallObj = LOCATION_WALL_OPTIONS.find(w => w.id === decoded.wallCode) || LOCATION_WALL_OPTIONS[0];
  const levelObj = LOCATION_LEVEL_OPTIONS.find(l => Number(l.id) === Number(decoded.levelNum)) || LOCATION_LEVEL_OPTIONS[0];
  const sectorObj = LOCATION_SECTOR_OPTIONS.find(s => s.id === decoded.sectorCode) || LOCATION_SECTOR_OPTIONS[0];

  locationAssistantState = {
    ...createEmptyLocationAssistantState(),
    step: 'review',
    product: targetProduct,
    products: [targetProduct],
    isEditing: true,
    isMultiSlot: Boolean(isMultiSlot),
    isBulk: false,
    zone: zoneObj,
    type: typeObj,
    compass: compassObj,
    wall: wallObj,
    level: levelObj,
    sector: sectorObj,
    photoPreviewUrl: targetProduct.placement_photo_url || targetProduct.image_url || '',
    photoPath: targetProduct.placement_photo_path || null
  };

  switchVendorTab('location-assistant');
  renderLocationAssistant();
  showToast(`📍 Reubicando "${targetProduct.name || targetProduct.product_code}". Cambiá de estante o nivel.`);
}
window.openEditProductLocation = openEditProductLocation;

function renderLocationChoiceCards(question, help, choices, handlerName) {
  return `
    ${renderLocationAssistantProductHeader()}
    <p class="assistant-question">${escapeStockHtml(question)}</p>
    <p class="assistant-help">${escapeStockHtml(help)}</p>
    <div class="assistant-choice-grid">
      ${choices.map(choice => `
        <button type="button" class="assistant-choice-card" onclick="${handlerName}('${escapeStockHtml(choice.id)}')">
          <strong>${escapeStockHtml(choice.label)}</strong>
          <small>${escapeStockHtml(choice.help || '')}</small>
        </button>`).join('')}
    </div>`;
}

function getLocationZoneById(zoneId) {
  return LOCATION_ZONE_OPTIONS.find(option => option.id === zoneId) || null;
}

function getLocationShelfChoices() {
  return LOCATION_SHELF_OPTIONS;
}

function getLocationRouteLabels() {
  const state = locationAssistantState;
  return [
    state.zone?.label,
    state.type?.label,
    state.compass?.label,
    state.wall?.label,
    state.level?.label || (state.level?.id ? `Nivel ${state.level.id}` : null),
    state.sector?.label
  ].filter(Boolean);
}

function printLocationQrLabel(wmsCode, locationLabel) {
  const qrSvgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(wmsCode)}`;
  const win = window.open('', '_blank', 'width=450,height=550');
  if (!win) {
    showToast('Habilitá las ventanas emergentes para imprimir la etiqueta.');
    return;
  }
  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <title>Etiqueta WMS · ${escapeStockHtml(wmsCode)}</title>
      <style>
        @page { size: 60mm 60mm; margin: 4mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; margin: 0; padding: 6px; }
        .label-card { border: 2.5px solid #152d24; border-radius: 10px; padding: 8px; }
        .brand { font-size: 0.75rem; font-weight: 800; color: #152d24; text-transform: uppercase; letter-spacing: 0.5px; }
        .wms-code { font-size: 1.25rem; font-weight: 900; color: #152d24; margin: 6px 0; font-family: monospace; letter-spacing: 1px; border: 1.5px dashed #c2a246; padding: 4px; border-radius: 6px; background: #fdfbf7; }
        .qr-img { width: 130px; height: 130px; display: block; margin: 6px auto; }
        .loc-desc { font-size: 0.75rem; font-weight: 600; color: #5c3b1e; margin-top: 4px; line-height: 1.2; }
      </style>
    </head>
    <body onload="window.print();">
      <div class="label-card">
        <div class="brand">🌿 BÔ GROW CLUB · ESTANTERÍAS</div>
        <div class="wms-code">${escapeStockHtml(wmsCode)}</div>
        <img class="qr-img" src="${qrSvgUrl}" alt="QR ${escapeStockHtml(wmsCode)}">
        <div class="loc-desc">${escapeStockHtml(locationLabel)}</div>
      </div>
    </body>
    </html>
  `);
  win.document.close();
}

function renderLocationReviewStep() {
  const state = locationAssistantState;
  const zone = state.zone || LOCATION_ZONE_OPTIONS[0];
  const type = state.type || LOCATION_TYPE_OPTIONS[0];
  const compass = state.compass || LOCATION_COMPASS_OPTIONS[0];
  const wall = state.wall || LOCATION_WALL_OPTIONS[0];
  const level = state.level || LOCATION_LEVEL_OPTIONS[0];
  const sector = state.sector || LOCATION_SECTOR_OPTIONS[0];

  const zonePrefix = zone.prefix || 'TI';
  const compassCode = compass.id || 'D';
  const wallCode = wall.id || 'P1';
  const levelNum = Number(level.id) || 1;
  const sectorCode = sector.id || 'C';
  const isChico = sectorCode === 'U' || (sector.label && (sector.label.toLowerCase().includes('chico') || sector.label.toLowerCase().includes('no hace falta')));

  // Código estándar: TI-D-P1-N3-C (o TI-D-P1-N3-U)
  const wmsCode = `${zonePrefix}-${compassCode}-${wallCode}-N${levelNum}-${sectorCode}`;
  const locationLabel = isChico
    ? `📍 ${zone.label} · ${compass.compass} de la PC · ${wall.label} · Nivel ${levelNum}`
    : `📍 ${zone.label} · ${compass.compass} de la PC · ${wall.label} · Nivel ${levelNum} · Sector ${sector.label}`;
  
  const zoneNoun = zonePrefix === 'DP' ? 'el depósito' : 'la tienda';
  const sectorPhrase = isChico ? '' : `, sector ${sector.label.toLowerCase()}`;
  const voicePhrase = `Está en ${zoneNoun}, a la ${compass.compass.toLowerCase()} de la PC, ${wall.label.toLowerCase()}, nivel ${levelNum}${sectorPhrase}.`;

  const isBulk = state.isBulk && state.products && state.products.length > 1;
  const isEditing = state.isEditing;

  return `
    ${renderLocationAssistantProductHeader()}
    <p class="assistant-question">Paso 6: Revisión y código generado</p>
    <p class="assistant-help">Tocá cualquier casilla para cambiar ese dato puntual (ej. Nivel o Góndola) antes de guardar.</p>
    
    <div style="background: rgba(255, 253, 246, 0.98); border: 2px solid var(--vendor-gold); border-radius: 16px; padding: 18px; margin-bottom: 16px; box-shadow: 0 4px 14px rgba(92,59,30,0.08);">
      
      <!-- Código WMS Destacado -->
      <div style="text-align: center; padding: 14px; background: #152d24; border-radius: 12px; margin-bottom: 14px; border: 2px solid var(--vendor-gold);">
        <small style="color: var(--vendor-gold); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 4px;">Código de Estantería Generado</small>
        <span style="font-size: 1.5rem; font-family: monospace; font-weight: 900; color: #ffffff; letter-spacing: 2px;">${escapeStockHtml(wmsCode)}</span>
      </div>

      <!-- Cuadrícula Desglosada con Salto Directo a Pasos -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; margin-bottom: 14px;">
        <div onclick="jumpToLocationAssistantStep('zone')" style="background: #f7f4ea; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(194,162,70,0.3); cursor: pointer;" title="Hacé clic para cambiar la zona">
          <small style="color: var(--vendor-muted); display: block; font-size: 0.68rem; text-transform: uppercase; font-weight: 800;">1. Zona ✏️</small>
          <strong style="color: var(--vendor-forest); font-size: 0.85rem;">${escapeStockHtml(zone.label || '-')}</strong>
        </div>
        <div onclick="jumpToLocationAssistantStep('type')" style="background: #f7f4ea; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(194,162,70,0.3); cursor: pointer;" title="Hacé clic para cambiar el tipo">
          <small style="color: var(--vendor-muted); display: block; font-size: 0.68rem; text-transform: uppercase; font-weight: 800;">2. Tipo ✏️</small>
          <strong style="color: var(--vendor-forest); font-size: 0.85rem;">${escapeStockHtml(type.label || '-')}</strong>
        </div>
        <div onclick="jumpToLocationAssistantStep('compass')" style="background: #f7f4ea; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(194,162,70,0.3); cursor: pointer;" title="Hacé clic para cambiar la orientación respecto a la PC">
          <small style="color: var(--vendor-muted); display: block; font-size: 0.68rem; text-transform: uppercase; font-weight: 800;">3. Brújula PC ✏️</small>
          <strong style="color: var(--vendor-forest); font-size: 0.85rem;">${escapeStockHtml(compass.label || '-')}</strong>
        </div>
        <div onclick="jumpToLocationAssistantStep('wall')" style="background: #f7f4ea; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(194,162,70,0.3); cursor: pointer;" title="Hacé clic para cambiar la pared o góndola">
          <small style="color: var(--vendor-muted); display: block; font-size: 0.68rem; text-transform: uppercase; font-weight: 800;">4. Pared ✏️</small>
          <strong style="color: var(--vendor-forest); font-size: 0.85rem;">${escapeStockHtml(wall.label || '-')}</strong>
        </div>
        <div onclick="jumpToLocationAssistantStep('level')" style="background: #f7f4ea; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(194,162,70,0.3); cursor: pointer;" title="Hacé clic para cambiar el nivel de altura">
          <small style="color: var(--vendor-muted); display: block; font-size: 0.68rem; text-transform: uppercase; font-weight: 800;">5. Nivel ✏️</small>
          <strong style="color: var(--vendor-forest); font-size: 0.85rem;">Nivel ${levelNum}</strong>
        </div>
        <div onclick="jumpToLocationAssistantStep('sector')" style="background: #f7f4ea; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(194,162,70,0.3); cursor: pointer;" title="Hacé clic para cambiar el sector dentro del nivel">
          <small style="color: var(--vendor-muted); display: block; font-size: 0.68rem; text-transform: uppercase; font-weight: 800;">6. Sector ✏️</small>
          <strong style="color: var(--vendor-forest); font-size: 0.85rem;">${escapeStockHtml(sector.label || '-')}</strong>
        </div>
      </div>

      <!-- Tarjeta Guía por Voz -->
      <div style="padding: 12px; background: rgba(30, 70, 32, 0.08); border-radius: 12px; border-left: 4px solid var(--vendor-forest); margin-bottom: 12px;">
        <span style="font-size: 0.75rem; color: var(--vendor-forest); font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; display: block;">🎙️ Búsqueda por Voz / Guía Asistente</span>
        <strong style="font-size: 0.95rem; color: var(--vendor-ink); display: block; margin: 4px 0; font-style: italic;">“${escapeStockHtml(voicePhrase)}”</strong>
      </div>

    </div>

    <div style="display: flex; flex-direction: column; gap: 10px;">
      <button type="button" class="mobile-assistant-primary" onclick="persistLocationAssistant(false)" style="width: 100%; padding: 16px; font-size: 1.05rem; font-weight: 800; border-radius: 14px; background: var(--vendor-forest); color: #ffffff; cursor: pointer; border: none; box-shadow: 0 4px 14px rgba(21,45,36,0.2);">
        ${isBulk ? `💾 Guardar Ubicación para los ${state.products.length} productos` : isEditing ? '💾 Guardar Nueva Ubicación' : '💾 Guardar Ubicación'}
      </button>

      ${isEditing && !isBulk ? `
        <button type="button" onclick="persistLocationAssistant(true)" style="width: 100%; padding: 12px; font-size: 0.92rem; font-weight: 800; border-radius: 12px; background: rgba(194,162,70,0.18); border: 1.5px solid var(--vendor-gold); color: #5c3b1e; cursor: pointer;">
          ➕ Guardar como Ubicación Adicional (Multi-Slot WMS)
        </button>
      ` : ''}

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <button type="button" class="assistant-choice-card" onclick="printLocationQrLabel('${escapeStockHtml(wmsCode)}', '${escapeStockHtml(locationLabel)}')" style="padding: 10px; justify-content: center; align-items: center; text-align: center; background: #fffdfa; border: 1.5px solid var(--vendor-gold);">
          <span style="font-size: 1.2rem;">🖨️</span>
          <strong style="font-size: 0.82rem; color: var(--vendor-forest);">Imprimir Etiqueta QR</strong>
        </button>
        <button type="button" class="assistant-choice-card" onclick="openLocationAssistantPhotoPicker('location-assistant-camera-input')" style="padding: 10px; justify-content: center; align-items: center; text-align: center;">
          <span style="font-size: 1.2rem;">📸</span>
          <strong style="font-size: 0.82rem; color: var(--vendor-forest);">Foto de Referencia</strong>
        </button>
      </div>
    </div>`;
}

function renderLocationAssistant() {
  const content = document.getElementById('location-assistant-content');
  const title = document.getElementById('location-assistant-step-title');
  const count = document.getElementById('location-assistant-count');
  const nav = document.getElementById('location-assistant-nav');
  if (!content) return;
  const step = locationAssistantState.step;
  const choiceSteps = ['zone', 'type', 'compass', 'wall', 'level', 'sector'];
  const primaryButton = nav?.querySelector('.mobile-assistant-primary');
  if (count) count.textContent = `${pendingLocationProducts.length} pendiente${pendingLocationProducts.length === 1 ? '' : 's'}`;
  if (nav) nav.hidden = step === 'list' || step === 'review';
  if (primaryButton) {
    primaryButton.hidden = choiceSteps.includes(step);
    primaryButton.textContent = step === 'review' ? 'Guardar ubicación' : 'Continuar';
  }

  if (step === 'list') {
    if (title) title.textContent = 'Elegí un producto a ubicar';
    content.innerHTML = renderPendingLocationList();
  } else if (step === 'zone') {
    if (title) title.textContent = 'Paso 1: ¿Está en TIENDA o en DEPÓSITO?';
    content.innerHTML = renderLocationChoiceCards('1. Elegí la zona', '¿Está en TIENDA o en DEPÓSITO? (Ambos tienen la PC al centro)', LOCATION_ZONE_OPTIONS, 'chooseLocationAssistantZone');
  } else if (step === 'type') {
    if (title) title.textContent = 'Paso 2: ¿Dónde lo guardaste? (Tipo de ubicación)';
    content.innerHTML = renderLocationChoiceCards('2. Elegí el tipo de ubicación', '¿Dónde lo guardaste? (Estante, Heladera, Vitrina, Góndola o Piso)', LOCATION_TYPE_OPTIONS, 'chooseLocationAssistantType');
  } else if (step === 'compass') {
    if (title) title.textContent = 'Paso 3: La PC es la brújula';
    content.innerHTML = renderLocationChoiceCards('3. La PC es la brújula', '¿Está a la derecha, izquierda, frente o atrás de la PC central?', LOCATION_COMPASS_OPTIONS, 'chooseLocationAssistantCompass');
  } else if (step === 'wall') {
    if (title) title.textContent = 'Paso 4: Elegí la pared';
    content.innerHTML = renderLocationChoiceCards('4. Elegí la pared', 'Pared 1 (Frente), Pared 2 (Fondo), Pared 3 (Derecha) o Pared 4 (Izquierda)', LOCATION_WALL_OPTIONS, 'chooseLocationAssistantWall');
  } else if (step === 'level') {
    if (title) title.textContent = 'Paso 5: Elegí el nivel de altura (N1 al N6)';
    content.innerHTML = renderLocationChoiceCards('5. Elegí el nivel (N1 siempre es abajo)', 'Desde Nivel 1 (Piso/Base) hasta Nivel 6 (Tope superior)', LOCATION_LEVEL_OPTIONS, 'chooseLocationAssistantLevel');
  } else if (step === 'sector') {
    if (title) title.textContent = 'Paso 5b: Elegí el sector dentro del nivel';
    content.innerHTML = renderLocationChoiceCards('5b. Elegí el sector horizontal', 'En cada nivel elegí el sector: Izquierda (I), Centro (C), Derecha (D) o Es chico no hace falta', LOCATION_SECTOR_OPTIONS, 'chooseLocationAssistantSector');
  } else {
    if (title) title.textContent = 'Paso 6: El sistema genera el código';
    content.innerHTML = renderLocationReviewStep();
  }
}

async function loadPendingLocationProducts() {
  const status = document.getElementById('location-assistant-status');
  try {
    if (status) {
      status.hidden = false;
      status.dataset.state = 'loading';
      status.textContent = 'Buscando productos pendientes de ubicación…';
    }
    pendingLocationProducts = await fetchPendingLocationProducts();
    updatePendingLocationIndicators(pendingLocationProducts.length);
    locationAssistantSelectedDraftIds.clear();
    locationAssistantState = createEmptyLocationAssistantState();
    renderLocationAssistant();
    if (status) status.hidden = true;
  } catch (error) {
    console.error('Error al cargar pendientes de ubicación:', error);
    if (status) {
      status.hidden = false;
      status.dataset.state = 'error';
      status.textContent = error.message;
    }
  }
}

function selectPendingLocationProduct(draftId) {
  const product = pendingLocationProducts.find(item => String(item.id) === String(draftId));
  if (!product) {
    showToast('Ese producto ya no está pendiente. Actualizá la lista.');
    return;
  }
  locationAssistantState = {
    ...createEmptyLocationAssistantState(),
    step: 'zone',
    product,
    products: [product],
    isBulk: false
  };
  renderLocationAssistant();
}

function chooseLocationAssistantZone(zoneId) {
  const zone = getLocationZoneById(zoneId);
  if (!zone) return;
  locationAssistantState.zone = zone;
  locationAssistantState.step = 'type';
  renderLocationAssistant();
}

function chooseLocationAssistantType(typeId) {
  const type = LOCATION_TYPE_OPTIONS.find(option => option.id === typeId);
  if (!type) return;
  locationAssistantState.type = type;
  locationAssistantState.step = 'compass';
  renderLocationAssistant();
}

function chooseLocationAssistantCompass(compassId) {
  const compass = LOCATION_COMPASS_OPTIONS.find(option => option.id === compassId);
  if (!compass) return;
  locationAssistantState.compass = compass;
  locationAssistantState.step = 'wall';
  renderLocationAssistant();
}

function chooseLocationAssistantWall(wallId) {
  const wall = LOCATION_WALL_OPTIONS.find(option => option.id === wallId);
  if (!wall) return;
  locationAssistantState.wall = wall;
  locationAssistantState.step = 'level';
  renderLocationAssistant();
}

function chooseLocationAssistantShelf(shelfCode) {
  const shelf = LOCATION_SHELF_OPTIONS.find(option => option.id === shelfCode);
  if (!shelf) return;
  locationAssistantState.shelfCode = shelf.id;
  locationAssistantState.step = 'level';
  renderLocationAssistant();
}

function chooseLocationAssistantLevel(levelId) {
  const level = LOCATION_LEVEL_OPTIONS.find(option => String(option.id) === String(levelId));
  if (!level) return;
  locationAssistantState.level = level;
  locationAssistantState.step = 'sector';
  renderLocationAssistant();
}

function chooseLocationAssistantSector(sectorId) {
  const sector = LOCATION_SECTOR_OPTIONS.find(option => option.id === sectorId);
  if (!sector) return;
  locationAssistantState.sector = sector;
  locationAssistantState.step = 'review';
  renderLocationAssistant();
}

function openLocationAssistantPhotoPicker(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = '';
  input.click();
}

async function handleLocationAssistantPhotoChange(event) {
  const file = event.target.files && event.target.files[0];
  const status = document.getElementById('location-assistant-status');
  if (!file) return;
  if (!isSupportedFastUploadImage(file) || file.size > FAST_UPLOAD_MAX_FILE_SIZE) {
    showToast('Elegí una foto JPG, PNG, WebP, HEIC o HEIF de hasta 25 MB.');
    event.target.value = '';
    return;
  }
  try {
    if (status) {
      status.hidden = false;
      status.dataset.state = 'loading';
      status.textContent = 'Comprimiendo la foto para que ocupe menos espacio…';
    }
    const compressed = await compressImageFile(file, 800, 800, 0.70);
    if (locationAssistantState.photoPreviewUrl && locationAssistantState.photoPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(locationAssistantState.photoPreviewUrl);
    }
    const previewUrl = URL.createObjectURL(compressed);
    locationAssistantState.photoBlob = compressed;
    locationAssistantState.photoPreviewUrl = previewUrl;
    locationAssistantState.photoPath = null;
    renderLocationAssistant();
    if (status) {
      status.hidden = false;
      status.dataset.state = 'ready';
      status.textContent = `Foto comprimida y lista · ${Math.max(1, Math.round(compressed.size / 1024))} KB.`;
    }
  } catch (error) {
    console.error('Error al preparar foto de ubicación:', error);
    if (status) {
      status.hidden = false;
      status.dataset.state = 'error';
      status.textContent = `No pudimos preparar la foto: ${error.message}`;
    }
  }
}

function useExistingProductPhotoForLocation() {
  const imageUrl = locationAssistantState.product?.image_url;
  if (!imageUrl) return;
  locationAssistantState.photoBlob = null;
  locationAssistantState.photoPreviewUrl = imageUrl;
  locationAssistantState.photoPath = null;
  locationAssistantState.step = 'review';
  renderLocationAssistant();
}

function buildLocationAssistantMetadata(draft, overrides) {
  const fields = [
    'product_code', 'name', 'brand', 'presentation', 'category', 'description', 'barcode',
    'official_url', 'market_reference_url', 'market_average_price', 'sale_price', 'floor_level',
    'shelf_code', 'shelf_level', 'ai_confidence', 'ai_payload', 'qr_payload'
  ];
  const metadata = {};
  fields.forEach(field => {
    if (draft[field] !== undefined) metadata[field] = draft[field];
  });
  return { ...metadata, ...overrides };
}

async function uploadLocationAssistantPhoto(productCode) {
  if (!locationAssistantState.photoBlob) {
    return { url: locationAssistantState.photoPreviewUrl || locationAssistantState.product?.image_url || '', path: null };
  }
  const photoPath = `placements/${String(productCode).toLowerCase()}_${Date.now()}.jpg`;
  const { error: uploadError } = await supabaseClient.storage
    .from('product-images')
    .upload(photoPath, locationAssistantState.photoBlob, { contentType: 'image/jpeg', upsert: false });
  if (uploadError) throw new Error(`No se pudo subir la foto de ubicación: ${uploadError.message}`);
  const { data } = supabaseClient.storage.from('product-images').getPublicUrl(photoPath);
  return { url: data?.publicUrl || '', path: photoPath };
}

async function upsertProductLocationWithFallback(location) {
  const authContext = await ensureVendorOperationalSession({ showLogin: true });
  if (!window.OperationalApi || !authContext) {
    throw new Error('Se requiere una sesión verificada para guardar una ubicación central.');
  }
  const code = String(location.wms_code || location.shelf_code || '').trim().toUpperCase();
  if (!code) throw new Error('La ubicación no tiene un código WMS válido.');
  const result = await window.OperationalApi.upsertInventoryLocation({
    supabaseClient,
    authContext,
    location: {
      id: location.location_id || null,
      code,
      name: location.location_label || location.name || code,
      location_type: 'SHELF',
      is_sellable: true,
      is_default: location.is_default === true,
      metadata: {
        floor_level: location.floor_level || null,
        shelf_code: location.shelf_code || null,
        shelf_level: location.shelf_level || null,
        area_name: location.area_name || null,
        wall_side: location.wall_side || null,
        shelf_position: location.shelf_position || null,
        placement_photo_url: location.placement_photo_url || null,
        placement_photo_path: location.placement_photo_path || null
      }
    }
  });
  const cachedLocation = { ...location, location_id: result.location_id, wms_code: result.code };
  saveLocalProductLocation(cachedLocation);
  return cachedLocation;
}

async function persistLocationAssistant(saveAsMultiSlot = false) {
  const state = locationAssistantState;
  const productsToPersist = (state.isBulk && Array.isArray(state.products) && state.products.length > 0)
    ? state.products
    : (state.product ? [state.product] : []);

  const status = document.getElementById('location-assistant-status');
  if (!productsToPersist.length || !state.zone || !state.compass || !state.wall || !state.level || !state.sector) {
    showToast('Completá todos los pasos antes de guardar.');
    return;
  }
  try {
    const authContext = await ensureVendorOperationalSession({ showLogin: true });
    if (!window.OperationalApi || !authContext) {
      throw new Error('Iniciá sesión para ubicar productos en la base central.');
    }
    if (status) {
      status.hidden = false;
      status.dataset.state = 'loading';
      status.textContent = `Guardando ubicación para ${productsToPersist.length} producto${productsToPersist.length === 1 ? '' : 's'}…`;
    }

    const zone = state.zone;
    const wall = state.wall;
    const level = state.level;
    const sector = state.sector;
    const levelNum = Number(level.id) || 1;
    const floorLevel = zone.floor_level || (zone.id === 'DP' ? 2 : 1);
    const zonePrefix = zone.prefix || 'TI';
    const compassCode = state.compass.id || 'D';
    const wallCode = wall.id || 'P1';
    const sectorCode = sector.id || 'C';
    const isChico = sectorCode === 'U' || (sector.label && (sector.label.toLowerCase().includes('chico') || sector.label.toLowerCase().includes('no hace falta')));

    // Código estándar oficial: TI-D-P1-N3-C (o TI-D-P1-N3-U)
    const wmsCode = `${zonePrefix}-${compassCode}-${wallCode}-N${levelNum}-${sectorCode}`;
    const locationLabel = isChico
      ? `📍 ${zone.label} · ${state.compass.compass} de la PC · ${wall.label} · Nivel ${levelNum}`
      : `📍 ${zone.label} · ${state.compass.compass} de la PC · ${wall.label} · Nivel ${levelNum} · Sector ${sector.label}`;

    // Subir foto una sola vez si aplica
    const leadCode = productsToPersist[0].product_code || productsToPersist[0].id;
    const photo = await uploadLocationAssistantPhoto(leadCode);

    // Asegurar existencia del módulo en el mapa si aplica
    if (window.ensureShelfExistsForLocation) {
      window.ensureShelfExistsForLocation(wallCode, floorLevel, locationLabel);
    }

    for (const draft of productsToPersist) {
      const productCode = draft.product_code || draft.id;
      const overrides = {
        floor_level: floorLevel,
        shelf_code: wallCode,
        shelf_level: levelNum,
        location_area: zone.label,
        location_wall: wall.label,
        shelf_position: sector.label,
        placement_photo_url: photo.url,
        placement_photo_path: photo.path,
        location_label: locationLabel,
        location_status: 'LOCATED'
      };
      const metadata = buildLocationAssistantMetadata(draft, overrides);
      const productLocation = {
        product_id: productCode,
        product_code: productCode,
        name: draft.name || productCode,
        image_url: draft.image_url || photo.url,
        barcode: draft.barcode || null,
        floor_level: floorLevel,
        shelf_code: wallCode,
        shelf_level: levelNum,
        stock: Math.max(0, Number(draft.stock) || 0),
        qr_payload: draft.qr_payload || buildProductQrPayload(productCode),
        area_name: zone.label,
        wall_side: wall.label,
        shelf_position: sector.label,
        placement_photo_url: photo.url,
        placement_photo_path: photo.path,
        location_label: locationLabel,
        wms_code: wmsCode,
        updated_at: new Date().toISOString()
      };

      if (draft.id && (draft.status === 'PENDING_LOCATION' || draft.status === 'PENDING_REVIEW')) {
        await window.OperationalApi.locateCatalogProductDraft({
          supabaseClient,
          authContext,
          draftId: draft.id,
          location: {
            code: wmsCode,
            name: locationLabel,
            location_type: 'SHELF',
            is_sellable: true,
            is_default: false,
            metadata: {
              ...metadata,
              placement_photo_url: photo.url,
              placement_photo_path: photo.path
            }
          },
          idempotencyKey: `locate-draft:${draft.id}:${globalThis.crypto?.randomUUID?.() || Date.now()}`
        });
      } else {
        // Producto ya aprobado o existente en inventario: registrar ubicación central
        await window.OperationalApi.upsertInventoryLocation({
          supabaseClient,
          authContext,
          location: {
            code: wmsCode,
            name: locationLabel,
            location_type: 'SHELF',
            is_sellable: true,
            is_default: false,
            metadata: {
              ...metadata,
              product_code: productCode,
              placement_photo_url: photo.url,
              placement_photo_path: photo.path
            }
          }
        });
      }

      saveLocalProductLocation(productLocation);

      if (window.logMapHistoryAction) {
        window.logMapHistoryAction(
          state.isEditing ? 'REUBICACION_PRODUCTO' : 'ASISTENTE_UBICACION',
          state.isEditing ? 'Producto reubicado' : 'Ubicación asignada',
          `Producto "${draft.name || productCode}" -> ${wmsCode}${saveAsMultiSlot ? ' (Multi-Slot)' : ''}`,
          wallCode,
          floorLevel
        );
      }
    }

    storeMapDataLoaded = false;
    if (typeof loadStoreMapData === 'function') {
      loadStoreMapData(true).catch(e => console.warn('Recarga de mapa en segundo plano:', e));
    }
    if (typeof loadInternalCatalog === 'function') {
      loadInternalCatalog().catch(e => console.warn('Recarga de catálogo en segundo plano:', e));
    }

    const successMsg = productsToPersist.length > 1
      ? `✅ ${productsToPersist.length} productos ubicados en ${wmsCode}`
      : `✅ Ubicación guardada: ${wmsCode}`;

    showToast(successMsg);
    if (status) {
      status.hidden = false;
      status.dataset.state = 'success';
      status.textContent = `${successMsg}. Actualizando lista…`;
    }

    locationAssistantSelectedDraftIds.clear();
    await loadPendingLocationProducts();
  } catch (error) {
    console.error('Error al guardar ubicación asistida:', error);
    if (status) {
      status.hidden = false;
      status.dataset.state = 'error';
      status.textContent = error.message;
    }
  }
}

function continueLocationAssistant() {
  if (locationAssistantState.step === 'photo') {
    locationAssistantState.step = 'review';
    renderLocationAssistant();
  } else if (locationAssistantState.step === 'review') {

    persistLocationAssistant();
  }
}

function goBackLocationAssistant() {
  const currentIndex = LOCATION_ASSISTANT_STEP_ORDER.indexOf(locationAssistantState.step);
  if (currentIndex <= 1) {
    locationAssistantState = createEmptyLocationAssistantState();
  } else {
    locationAssistantState.step = LOCATION_ASSISTANT_STEP_ORDER[currentIndex - 1];
  }
  renderLocationAssistant();
}

async function refreshPendingDraftsBadge() {
  const badge = document.getElementById('drafts-pending-count-badge');
  const homeBadge = document.getElementById('drafts-pending-count-home-badge');
  const sidebarBadge = document.getElementById('vendor-sidebar-drafts-badge');
  const catalogCount = document.getElementById('drafts-pending-catalog-count');

  try {
    let count = 0;
    if (supabaseClient) {
      const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
      const { count: c, error } = await supabaseClient
        .from('catalog_product_drafts_v2')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', context?.tenantId || '')
        .eq('status', 'PENDING_REVIEW');
      if (!error && Number.isFinite(c)) count = c;
    }

    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline-block' : 'none';
    }
    if (homeBadge) {
      homeBadge.textContent = `${count} pend.`;
      homeBadge.style.display = count > 0 ? 'inline-block' : 'none';
    }
    if (sidebarBadge) {
      sidebarBadge.textContent = count;
      sidebarBadge.hidden = count === 0;
      sidebarBadge.style.display = count > 0 ? 'inline-block' : 'none';
    }
    if (catalogCount) {
      catalogCount.textContent = count;
      catalogCount.style.display = count > 0 ? 'inline-block' : 'none';
    }
    return count;
  } catch (_) {
    return 0;
  }
}
window.refreshPendingDraftsBadge = refreshPendingDraftsBadge;

function renderPendingDraftsList(drafts) {
  const container = document.getElementById('pending-drafts-grid');
  if (!container) return;

  if (!Array.isArray(drafts) || drafts.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; background: rgba(0,0,0,0.2); border: 1px dashed var(--color-border-accent); border-radius: 16px; color: var(--color-text-muted);">
        <div style="font-size: 2.5rem; margin-bottom: 8px;">✨</div>
        <p style="font-weight: 700; font-size: 1.1rem; color: #66bb6a; margin: 0 0 4px 0;">¡No hay borradores pendientes!</p>
        <p style="font-size: 0.85rem; margin: 0;">Los productos cargados por los vendedores aparecerán acá para su revisión y publicación.</p>
      </div>
    `;
    return;
  }

  const categoriesList = ['Semillas', 'Sustratos', 'Fertilizantes', 'Indoor', 'Vaporizadores', 'Macetas', 'Medición y Riego', 'Parafernalia', 'Otros'];

  container.innerHTML = drafts.map(draft => {
    const dateStr = draft.created_at ? new Date(draft.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : 'Reciente';
    const imgSrc = draft.image_url || 'assets/logo.jpg';
    return `
      <div style="background: #ffffff; border: 1.5px solid #d4c5a9; border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 4px 14px rgba(92,59,30,0.08);">
        <div style="aspect-ratio: 1/1; max-height: 200px; background: #152d24; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center;">
          <img src="${escapeStockHtml(imgSrc)}" alt="${escapeStockHtml(draft.name || 'Foto del producto')}" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.onerror=null;this.src='assets/logo.jpg';">
          <span style="position: absolute; top: 8px; left: 8px; background: rgba(21,45,36,0.9); border: 1px solid var(--color-accent-gold); color: var(--color-accent-gold); font-size: 0.7rem; font-weight: 700; padding: 3px 8px; border-radius: 8px;">
            ${escapeStockHtml(draft.seller_name || 'Vendedor')} · ${escapeStockHtml(dateStr)}
          </span>
        </div>

        <div style="padding: 16px; flex: 1; display: flex; flex-direction: column; gap: 10px;">
          <div style="background: #f7f4ea; border: 1px solid rgba(194,162,70,0.4); border-radius: 12px; padding: 10px 14px; font-size: 0.82rem; color: #5c3b1e;">
            <p style="margin: 0 0 4px 0; color: #5c3b1e;"><strong>📦 Stock Cargado:</strong> ${draft.stock || 0} unidades</p>
            <p style="margin: 0 0 4px 0; color: #5c3b1e;"><strong>📍 Ubicación:</strong> ${escapeStockHtml(draft.location_label || draft.location || draft.shelf_code || 'No especificada')}</p>
            ${draft.product_code ? `<p style="margin: 0 0 4px; color: #5c3b1e;"><strong>SKU / Código:</strong> ${escapeStockHtml(draft.product_code)}</p>` : ''}
            ${draft.barcode ? `<p style="margin: 0 0 4px; color: #5c3b1e;"><strong>Barra:</strong> ${escapeStockHtml(draft.barcode)}</p>` : ''}
            ${draft.market_average_price ? `<p style="margin: 0 0 4px; color: #5c3b1e;"><strong>Promedio ML:</strong> $${Number(draft.market_average_price).toLocaleString('es-AR')}</p>` : ''}
            ${draft.observations ? `<p style="margin: 0; color: #6b4e2e; font-style: italic;">${escapeStockHtml(draft.observations)}</p>` : ''}
          </div>

          <div>
            <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #5c3b1e; margin-bottom: 2px;">Nombre del Producto (Requerido) *</label>
            <input type="text" id="draft-name-${draft.id}" value="${escapeStockHtml(draft.name || '')}" placeholder="Ej: Sustrato Klasmann 50L" class="b2b-form-input" style="width: 100%; padding: 8px; font-size: 0.9rem; border-radius: 8px; color: #3e2723; background: #fffdfa; border: 1.5px solid #d4c5a9;">
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div>
              <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #5c3b1e; margin-bottom: 2px;">Categoría *</label>
              <select id="draft-cat-${draft.id}" class="b2b-form-input" style="width: 100%; padding: 8px; font-size: 0.85rem; border-radius: 8px; color: #3e2723; background: #fffdfa; border: 1.5px solid #d4c5a9;">
                ${categoriesList.map(cat => `<option value="${cat}" ${draft.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
              </select>
            </div>

            <div>
              <label style="display: block; font-size: 0.78rem; font-weight: 700; color: #5c3b1e; margin-bottom: 2px;">Costo de Compra ($)</label>
              <input type="number" step="0.01" id="draft-cost-${draft.id}" placeholder="Ej: 15000" class="b2b-form-input" style="width: 100%; padding: 8px; font-size: 0.85rem; border-radius: 8px; color: #3e2723; background: #fffdfa; border: 1.5px solid #d4c5a9;">
            </div>
          </div>

          <div>
            <label style="display: block; font-size: 0.78rem; font-weight: 800; color: #2e7d32; margin-bottom: 2px;">PRECIO FINAL AL PÚBLICO ($ ARS) *</label>
            <input type="number" step="0.01" id="draft-price-${draft.id}" value="${Number(draft.sale_price) || ''}" placeholder="Ej: 22500" required class="b2b-form-input" style="width: 100%; padding: 8px; font-size: 1rem; font-weight: 800; border-radius: 8px; border-color: #2e7d32; color: #1b5e20; background: #f1f8e9;">
          </div>

          <div style="display: flex; gap: 8px; margin-top: 6px;">
            <button type="button" onclick="approveProductDraft('${draft.id}')" style="flex: 1; background: #2e7d32; color: #fff; border: none; padding: 10px; border-radius: 10px; font-weight: 800; cursor: pointer; font-size: 0.88rem;">
              ✅ Aprobar y Publicar
            </button>
            <button type="button" onclick="rejectProductDraft('${draft.id}')" style="background: rgba(239,83,80,0.2); color: #ef5350; border: 1px solid #ef5350; padding: 10px 14px; border-radius: 10px; font-weight: 700; cursor: pointer; font-size: 0.85rem;">
              ❌ Rechazar
            </button>
          </div>

        </div>
      </div>
    `;
  }).join('');
}

// Cargar y mostrar borradores pendientes de revisión.
async function loadPendingProductDrafts() {
  const container = document.getElementById('pending-drafts-grid');
  if (!container) return;

  try {
    let drafts = [];
    if (supabaseClient) {
      const context = await ensureVendorOperationalSession();
      if (!context) {
        pendingDraftCache.clear();
        refreshPendingDraftsBadge();
        renderPendingDraftsList([]);
        return;
      }
      const { data, error } = await supabaseClient
        .from('catalog_product_drafts_v2')
        .select('*')
        .eq('tenant_id', context?.tenantId || '')
        .eq('status', 'PENDING_REVIEW')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        drafts = data;
      }
    }

    const normalizedDrafts = (drafts || []).map(hydrateProductDraft);
    pendingDraftCache.clear();
    normalizedDrafts.forEach(draft => pendingDraftCache.set(draft.id, draft));
    
    refreshPendingDraftsBadge();
    renderPendingDraftsList(normalizedDrafts);

  } catch (err) {
    console.error('Error al cargar borradores pendientes:', err);
    container.innerHTML = `<p style="color: #ef5350;">Error al cargar borradores: ${err.message}</p>`;
  }
}

function filterPendingProductDrafts(query) {
  const q = String(query || '').trim().toLowerCase();
  const allDrafts = Array.from(pendingDraftCache.values());
  if (!q) {
    renderPendingDraftsList(allDrafts);
    return;
  }
  const filtered = allDrafts.filter(d => 
    (d.name && d.name.toLowerCase().includes(q)) ||
    (d.product_code && d.product_code.toLowerCase().includes(q)) ||
    (d.barcode && d.barcode.toLowerCase().includes(q)) ||
    (d.brand && d.brand.toLowerCase().includes(q)) ||
    (d.category && d.category.toLowerCase().includes(q)) ||
    (d.seller_name && d.seller_name.toLowerCase().includes(q))
  );
  renderPendingDraftsList(filtered);
}
window.filterPendingProductDrafts = filterPendingProductDrafts;

async function approveAllPendingProductDrafts() {
  const drafts = Array.from(pendingDraftCache.values());
  if (!drafts.length) {
    showToast('No hay borradores pendientes para aprobar.');
    return;
  }
  if (!confirm(`¿Aprobar y publicar todos los ${drafts.length} productos pendientes de la cola?`)) {
    return;
  }
  showToast(`⏳ Aprobando ${drafts.length} productos en lote...`);
  let approvedCount = 0;
  for (const draft of drafts) {
    try {
      await approveProductDraft(draft.id);
      approvedCount++;
    } catch (e) {
      console.warn('Error aprobando draft', draft.id, e);
    }
  }
  showToast(`✅ ${approvedCount} productos aprobados y publicados con éxito.`);
  loadPendingProductDrafts();
}
window.approveAllPendingProductDrafts = approveAllPendingProductDrafts;

async function ensureLocalStoreSupplierExists() {
  if (!supabaseClient) return;
  const { error } = await supabaseClient
    .from('suppliers')
    .upsert([{
      id: 'local_store',
      name: 'BÔ Grow Club (Stock Propio)',
      website: 'https://boeweb.netlify.app'
    }], { onConflict: 'id' });
  if (error) console.warn('Aviso al asegurar el proveedor local_store:', error.message);
}

// Aprobar el borrador, publicar y vincularlo a su ubicación física.
async function approveProductDraft(draftId) {
  try {
    const draft = pendingDraftCache.get(draftId);
    if (!draft) throw new Error('El borrador ya no está disponible. Actualizá la lista.');
    const nameInput = document.getElementById(`draft-name-${draftId}`);
    const catInput = document.getElementById(`draft-cat-${draftId}`);
    const costInput = document.getElementById(`draft-cost-${draftId}`);
    const priceInput = document.getElementById(`draft-price-${draftId}`);

    const nameVal = nameInput ? nameInput.value.trim() : (draft.name || 'Producto BÔ');
    const catVal = catInput ? catInput.value : (draft.category || 'Otros');
    const costVal = costInput ? parseFloat(costInput.value) || 0 : 0;
    const priceVal = priceInput ? parseFloat(priceInput.value) || 0 : (Number(draft.sale_price) || Number(draft.price) || 0);

    if (!nameVal) {
      showToast('⚠️ Por favor ingresá un nombre para el producto.');
      if (nameInput) nameInput.focus();
      return;
    }

    if (isNaN(priceVal) || priceVal <= 0) {
      showToast('⚠️ Por favor ingresá un precio final válido mayor a 0.');
      if (priceInput) priceInput.focus();
      return;
    }

    const authContext = await ensureVendorOperationalSession({ showLogin: true });
    if (!window.OperationalApi || !authContext) {
      throw new Error('Iniciá sesión para aprobar el producto en el catálogo central.');
    }
    const approval = await window.OperationalApi.approveCatalogProductDraft({
      supabaseClient,
      authContext,
      draftId,
      overrides: {
        name: nameVal,
        category: catVal,
        cost_price: costVal,
        sale_price: priceVal,
        metadata: {
          approved_from: 'vendor-drafts-review'
        }
      },
      idempotencyKey: `approve-draft:${draftId}`
    });
    pendingDraftCache.delete(draftId);
    storeMapDataLoaded = false;
    showToast(`Producto "${nameVal}" aprobado con stock y ubicación vinculados.`);
    await Promise.all([
      loadPendingProductDrafts(),
      refreshPendingLocationBadge(),
      refreshPendingDraftsBadge(),
      loadInternalCatalog()
    ]);
    if (typeof loadStoreMapData === 'function') await loadStoreMapData(true);
    if (typeof rerenderStoreMap === 'function') rerenderStoreMap();
    if (window.fetchB2BProducts) window.fetchB2BProducts(true);
    return approval;

  } catch (err) {
    console.error('Error al aprobar borrador:', err);
    showToast(`❌ Error al aprobar: ${err.message}`);
  }
}

async function handleShelfPhotoChange(event, shelfCode) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
    if (!window.OperationalApi || !supabaseClient || !context?.isVerified || !['ADMIN', 'SUPERVISOR'].includes(context.role)) {
      throw new Error('Sólo administración o supervisión pueden actualizar una ubicación central.');
    }
    await loadWmsInventoryData(true);
    const location = getWmsModules().find(module => module.code === shelfCode);
    if (!location) throw new Error('La ubicación no existe en el inventario central.');
    showToast(`Preparando foto del estante ${shelfCode}…`);
    const compressed = await compressImageFile(file, 800, 800, 0.70);
    const photoPath = `shelves/${location.id}_${Date.now()}.jpg`;
    const { error: uploadError } = await supabaseClient.storage
      .from('product-images')
      .upload(photoPath, compressed, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) throw uploadError;
    const { data: urlData } = supabaseClient.storage.from('product-images').getPublicUrl(photoPath);
    const photoUrl = urlData?.publicUrl;
    if (!photoUrl) throw new Error('El almacenamiento no devolvió una URL pública para la foto.');
    await window.OperationalApi.upsertInventoryLocation({
      supabaseClient,
      authContext: context,
      location: {
        id: location.id,
        code: location.code,
        name: location.sector_name,
        location_type: location.location_type,
        is_sellable: location.is_sellable,
        is_default: location.is_default,
        metadata: { ...location.metadata, photo_url: photoUrl, photo_path: photoPath }
      }
    });
    storeMapDataLoaded = false;
    await renderStoreMapUI(null, shelfCode, null, true);
    showToast(`Foto del estante ${shelfCode} guardada.`);
  } catch (error) {
    console.error('Error al guardar la foto del estante:', error);
    showToast(`No pudimos guardar la foto: ${error.message}`);
  }
}

function getQrImageFromElement(element) {
  const canvas = element?.querySelector('canvas');
  if (canvas) return canvas.toDataURL('image/png');
  return element?.querySelector('img')?.src || '';
}

function openQrPrintWindow(productCode, productName, qrPayload, existingElement = null) {
  const printWindow = window.open('', '_blank', 'width=480,height=620');
  if (!printWindow) {
    showToast('El navegador bloqueó la ventana de impresión. Habilitá ventanas emergentes.');
    return;
  }
  const temp = document.createElement('div');
  temp.style.position = 'fixed';
  temp.style.left = '-9999px';
  document.body.appendChild(temp);
  if (existingElement) {
    const imageUrl = getQrImageFromElement(existingElement);
    if (imageUrl) temp.innerHTML = `<img src="${escapeStockHtml(imageUrl)}" alt="QR">`;
  } else if (window.QRCode) {
    new window.QRCode(temp, { text: qrPayload, width: 220, height: 220, correctLevel: window.QRCode.CorrectLevel.M });
  }
  window.setTimeout(() => {
    const qrImage = getQrImageFromElement(temp) || getQrImageFromElement(existingElement);
    printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR ${escapeStockHtml(productCode)}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:34px;color:#152d24}.label{width:300px;margin:auto;border:2px solid #152d24;border-radius:18px;padding:22px}img{width:220px;height:220px}.brand{font-weight:900;letter-spacing:.16em}.name{font-size:18px;font-weight:800;margin:14px 0 4px}.code{font:14px monospace;overflow-wrap:anywhere}</style></head><body><div class="label"><div class="brand">BÔ GROW CLUB</div>${qrImage ? `<img src="${escapeStockHtml(qrImage)}" alt="Código QR">` : ''}<div class="name">${escapeStockHtml(productName || 'Producto')}</div><div class="code">${escapeStockHtml(productCode)}</div></div><script>window.onload=()=>window.print()<\/script></body></html>`);
    printWindow.document.close();
    temp.remove();
  }, 120);
}

function printCurrentProductQr() {
  initializeFastUploadForm();
  const productName = document.getElementById('fastupload-name-input')?.value.trim() || 'Producto nuevo';
  openQrPrintWindow(fastUploadProductCode, productName, fastUploadQrPayload, document.getElementById('fastupload-qr-preview'));
}

let currentModalQrProduct = null;

function openProductQrModal(productCode, productName, price) {
  const modal = document.getElementById('modal-product-qr-view');
  const container = document.getElementById('product-modal-qr-container');
  const nameEl = document.getElementById('product-modal-qr-name');
  const codeEl = document.getElementById('product-modal-qr-code');
  const priceEl = document.getElementById('product-modal-qr-price');
  if (!modal || !productCode) return;

  currentModalQrProduct = {
    code: productCode,
    name: productName || productCode,
    price: price || null,
    url: buildProductQrPayload(productCode)
  };

  if (nameEl) nameEl.textContent = currentModalQrProduct.name;
  if (codeEl) codeEl.textContent = currentModalQrProduct.code;
  if (priceEl) priceEl.textContent = price ? `$ ${Number(price).toLocaleString('es-AR')}` : '';

  if (container) {
    container.innerHTML = '';
    if (window.QRCode) {
      new window.QRCode(container, {
        text: currentModalQrProduct.url,
        width: 160,
        height: 160,
        colorDark: '#152d24',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
      });
    } else {
      container.textContent = currentModalQrProduct.code;
    }
  }

  modal.style.display = 'flex';
}

function closeProductQrModal() {
  const modal = document.getElementById('modal-product-qr-view');
  if (modal) modal.style.display = 'none';
  currentModalQrProduct = null;
}

function printCurrentModalQr() {
  if (!currentModalQrProduct) return;
  openQrPrintWindow(
    currentModalQrProduct.code,
    currentModalQrProduct.name,
    currentModalQrProduct.url,
    document.getElementById('product-modal-qr-container')
  );
}

function printProductQrByCode(productCode) {
  const mapMatch = window.findStoreMapProduct ? window.findStoreMapProduct(productCode) : null;
  const product = mapMatch?.product
    || readLocalProductLocations().find(item => item.product_code === productCode)
    || { product_code: productCode, name: productCode, qr_payload: buildProductQrPayload(productCode) };
  openProductQrModal(productCode, product.name, product.price || product.sale_price);
}

function handleProductLocationDeepLink() {
  const productCode = new URLSearchParams(window.location.search).get('product');
  if (!productCode) return;
  window.setTimeout(async () => {
    switchVendorTab('map');
    await renderStoreMapUI(null, null, null, true);
    const found = window.focusStoreMapProduct && window.focusStoreMapProduct(productCode);
    const search = document.getElementById('map-search-input');
    if (search) search.value = productCode;
    if (!found) showToast(`El QR ${productCode} todavía no tiene una ubicación aprobada.`);
  }, 300);
}

// Rechazar Borrador
async function rejectProductDraft(draftId) {
  if (!confirm('¿Estás seguro de que querés rechazar este borrador?')) return;

  try {
    const authContext = await ensureVendorOperationalSession({ showLogin: true });
    if (!window.OperationalApi || !authContext) {
      throw new Error('Iniciá sesión para revisar borradores.');
    }
    await window.OperationalApi.rejectCatalogProductDraft({
      supabaseClient,
      authContext,
      draftId,
      reason: 'Rechazado por supervisor desde la revisión de catálogo.'
    });
    showToast('🚫 Borrador rechazado.');
    await Promise.all([loadPendingProductDrafts(), refreshPendingDraftsBadge(), refreshPendingLocationBadge()]);
  } catch (err) {
    console.error('Error al rechazar borrador:', err);
    showToast(`❌ Error al rechazar borrador: ${err.message}`);
  }
}

// Global exposure
window.selectVendorCard = selectVendorCard;
window.toggleVendorPasswordVisibility = toggleVendorPasswordVisibility;
window.checkVendorAuth = checkVendorAuth;
window.handleVendorLogin = handleVendorLogin;
window.reconnectVendorSession = reconnectVendorSession;
window.vendorLogout = vendorLogout;
window.switchVendorTab = switchVendorTab;
window.openStockCriterionModal = openStockCriterionModal;
window.closeStockCriterionModal = closeStockCriterionModal;
window.handleSaveStockCriterion = handleSaveStockCriterion;
window.startFastUploadVoiceDictation = startFastUploadVoiceDictation;
window.openProductQrModal = openProductQrModal;
window.closeProductQrModal = closeProductQrModal;
window.printCurrentModalQr = printCurrentModalQr;
window.renderVendorHomeUI = renderVendorHomeUI;
window.openCashWithType = openCashWithType;
window.searchShelfOnMap = searchShelfOnMap;
window.simulateCustomerQRScan = simulateCustomerQRScan;
window.addCashMovement = addCashMovement;
window.toggleCashMovementVoid = toggleCashMovementVoid;
window.performShiftClosure = performShiftClosure;
window.validateAdminClosurePrompt = validateAdminClosurePrompt;
window.updateCashDifferencePreview = updateCashDifferencePreview;
window.downloadCashBackup = downloadCashBackup;
window.renderVendorPortfolioUI = renderVendorPortfolioUI;
window.copyVendorRefLink = copyVendorRefLink;
window.sendVendorWhatsAppPromo = sendVendorWhatsAppPromo;
window.openFastUploadPhotoPicker = openFastUploadPhotoPicker;
window.handleFastUploadPhotoChange = handleFastUploadPhotoChange;
window.analyzeFastUploadPhoto = analyzeFastUploadPhoto;
window.initializeFastUploadForm = initializeFastUploadForm;
window.startMobileProductAssistant = startMobileProductAssistant;
window.chooseMobileProductEntryMethod = chooseMobileProductEntryMethod;
window.continueMobileProductAssistant = continueMobileProductAssistant;
window.goBackMobileProductAssistant = goBackMobileProductAssistant;
window.updateFastUploadLocationPreview = updateFastUploadLocationPreview;
window.focusFastUploadBarcode = focusFastUploadBarcode;
window.openMapForStockEntry = openMapForStockEntry;
window.printCurrentProductQr = printCurrentProductQr;
window.printProductQrByCode = printProductQrByCode;
window.handleShelfPhotoChange = handleShelfPhotoChange;
window.loadPendingLocationProducts = loadPendingLocationProducts;
window.selectPendingLocationProduct = selectPendingLocationProduct;
window.chooseLocationAssistantZone = chooseLocationAssistantZone;
window.chooseLocationAssistantType = chooseLocationAssistantType;
window.chooseLocationAssistantCompass = chooseLocationAssistantCompass;
window.chooseLocationAssistantWall = chooseLocationAssistantWall;
window.chooseLocationAssistantShelf = chooseLocationAssistantShelf;
window.chooseLocationAssistantLevel = chooseLocationAssistantLevel;
window.chooseLocationAssistantSector = chooseLocationAssistantSector;
window.chooseLocationAssistantPosition = chooseLocationAssistantSector;
window.openLocationAssistantPhotoPicker = openLocationAssistantPhotoPicker;
window.handleLocationAssistantPhotoChange = handleLocationAssistantPhotoChange;
window.useExistingProductPhotoForLocation = useExistingProductPhotoForLocation;
window.continueLocationAssistant = continueLocationAssistant;
window.goBackLocationAssistant = goBackLocationAssistant;
window.submitProductDraft = submitProductDraft;
window.loadPendingProductDrafts = loadPendingProductDrafts;
window.approveProductDraft = approveProductDraft;
window.rejectProductDraft = rejectProductDraft;
// internalCatalog state vars — declared at top of file

function revokeInternalCatalogImagePreview() {
  if (internalCatalogImagePreviewUrl && internalCatalogImagePreviewUrl.startsWith('blob:')) {
    URL.revokeObjectURL(internalCatalogImagePreviewUrl);
  }
  internalCatalogImagePreviewUrl = null;
}

function clearInternalCatalogImageState() {
  internalCatalogImageFile = null;
  revokeInternalCatalogImagePreview();
}

function setInternalCatalogStatus(message, state = 'info') {
  const status = document.getElementById('internal-catalog-status');
  if (!status) return;
  status.hidden = !message;
  status.dataset.state = state;
  status.textContent = message || '';
}

function internalCatalogProductIds(supplierRows) {
  return [...new Set(supplierRows.map(row => row.mapped_product_id || row.supplier_product_id).filter(Boolean))];
}

async function fetchInternalCatalogRelations(productIds) {
  if (!productIds.length) return { products: [], drafts: [] };
  const [productsResult, draftsResult] = await Promise.all([
    supabaseClient.from('products').select('*').in('id', productIds),
    supabaseClient.from('product_drafts').select('*').eq('status', 'APPROVED').in('product_code', productIds)
  ]);
  if (productsResult.error) throw new Error(`No se pudo leer el catálogo interno: ${productsResult.error.message}`);
  return {
    products: productsResult.data || [],
    drafts: draftsResult.error ? [] : (draftsResult.data || []).map(hydrateProductDraft)
  };
}

function normalizeInternalCatalogProduct(supplier, product, draft, location) {
  const productId = supplier.mapped_product_id || supplier.supplier_product_id;
  return {
    id: productId,
    supplierRowId: supplier.id,
    draftId: draft?.id || null,
    name: product?.name || supplier.name || draft?.name || productId,
    brand: draft?.brand || product?.brand || '',
    presentation: draft?.presentation || product?.presentation || '',
    category: product?.category || draft?.category || 'Otros',
    description: product?.description || draft?.description || '',
    barcode: draft?.barcode || location?.barcode || product?.barcode || supplier?.barcode || '',
    image: product?.image || supplier.image || draft?.image_url || location?.image_url || '',
    imagePath: draft?.image_path || '',
    price: Number(supplier.price) || Number(draft?.sale_price) || 0,
    stock: Math.max(0, Number(supplier.stock ?? draft?.stock ?? location?.stock) || 0),
    available: supplier.available !== false,
    supplier
  };
}

function getVerifiedOperatorName(userId = null) {
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  const targetId = String(userId || context?.userId || '').trim();
  const users = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantUsers() : [];
  const user = users.find(item => String(item.id || item.user_id) === targetId);
  if (user) return user.name || user.display_name || user.email || 'Usuario autenticado';
  if (targetId && targetId === String(context?.userId || '')) return context.userName || 'Usuario autenticado';
  if (targetId && !/^[0-9a-f-]{36}$/i.test(targetId)) return targetId;
  return 'Usuario autenticado';
}

function shouldPrintDuplicateReceipts() {
  return window.AppConfig?.get('rules.pos.printDuplicateReceipts', true) !== false;
}

function mapCanonicalCashMovement(movement) {
  const typeMap = {
    SALE: 'venta_efectivo',
    INCOME: 'membresia_efectivo',
    EXPENSE: 'gasto',
    WITHDRAWAL: 'retiro',
    REFUND: 'gasto',
    ADJUSTMENT: movement.direction === 'OUT' ? 'gasto' : 'membresia_efectivo',
    REVERSAL: movement.direction === 'OUT' ? 'gasto' : 'membresia_efectivo'
  };
  return {
    id: movement.id,
    createdAt: movement.created_at,
    time: movement.created_at
      ? new Date(movement.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      : '--:--',
    type: typeMap[movement.movement_type] || (movement.direction === 'OUT' ? 'gasto' : 'membresia_efectivo'),
    amount: Number(movement.amount) || 0,
    desc: movement.description || movement.category || movement.movement_type,
    vendor: getVerifiedOperatorName(movement.actor_user_id),
    documentNumber: movement.document_number || null,
    documentType: movement.document_type || null,
    voided: false
  };
}

async function loadCanonicalCashClosureHistory() {
  const list = document.getElementById('cash-closure-history-list');
  const count = document.getElementById('cash-closure-history-count');
  if (!list) return [];
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  if (!supabaseClient || !context?.isVerified) {
    list.innerHTML = '<div class="cash-empty-state"><p>Iniciá sesión para consultar cierres.</p></div>';
    if (count) count.textContent = '0 cierres';
    return [];
  }
  try {
    const { data, error } = await supabaseClient
      .from('cash_closures')
      .select('id,session_id,document_number,expected_amount,counted_amount,difference,review_status,closed_by,closed_at,reviewed_by,reviewed_at,notes')
      .eq('tenant_id', context.tenantId)
      .order('closed_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    const closures = data || [];
    const canReview = ['ADMIN', 'SUPERVISOR', 'SUPERADMIN'].includes(context.role);
    if (count) count.textContent = `${closures.length} ${closures.length === 1 ? 'cierre' : 'cierres'}`;
    if (closures.length === 0) {
      list.innerHTML = '<div class="cash-empty-state"><p>Todavía no hay cierres centrales registrados.</p></div>';
      return closures;
    }
    list.innerHTML = closures.map(closure => {
      const difference = Number(closure.difference) || 0;
      const status = closure.review_status === 'APPROVED'
        ? 'Aprobado'
        : (closure.review_status === 'REJECTED' ? 'Observado' : 'Pendiente de revisión');
      const closedAt = closure.closed_at
        ? new Date(closure.closed_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
        : 'Sin fecha';
      return `
        <article class="cash-movement" data-flow="${difference === 0 ? 'in' : 'out'}">
          <div class="cash-movement-copy">
            <span class="cash-movement-type">${escapeCashHtml(closure.document_number || closure.id)} · ${escapeCashHtml(status)} · ${escapeCashHtml(closedAt)}</span>
            <p class="cash-movement-desc">Esperado ${formatCashCurrency(closure.expected_amount)} · Contado ${formatCashCurrency(closure.counted_amount)}</p>
            <span class="cash-movement-meta">Cerró: ${escapeCashHtml(closure.closed_by || 'usuario')} · Revisó: ${escapeCashHtml(closure.reviewed_by || 'pendiente')}</span>
            ${closure.notes ? `<small>${escapeCashHtml(closure.notes)}</small>` : ''}
            ${closure.review_status === 'PENDING_REVIEW' && canReview
              ? `<button type="button" class="cash-secondary-btn cash-history-review" data-closure-id="${escapeCashHtml(closure.id)}">Aprobar arqueo</button>`
              : ''}
          </div>
          <strong class="cash-movement-amount">${difference > 0 ? '+' : ''}${formatCashCurrency(difference)}</strong>
        </article>`;
    }).join('');
    list.querySelectorAll('.cash-history-review').forEach(button => {
      button.addEventListener('click', async () => {
        if (!confirm('¿Confirmás que revisaste el arqueo y querés aprobarlo?')) return;
        button.disabled = true;
        try {
          await window.OperationalApi.reviewCashClosure({
            supabaseClient,
            authContext: context,
            closureId: button.dataset.closureId,
            decision: 'APPROVE',
            reason: 'Arqueo revisado desde el historial central.'
          });
          await Promise.all([loadCanonicalCashClosureHistory(), refreshCanonicalCashSection()]);
        } catch (error) {
          console.error('No se pudo aprobar el cierre histórico:', error);
          alert(`El cierre no fue aprobado.\n\n${error.message || 'Error desconocido'}`);
          button.disabled = false;
        }
      });
    });
    return closures;
  } catch (error) {
    console.error('No se pudo cargar el historial de cierres:', error);
    list.innerHTML = `<div class="cash-empty-state"><p>No se cargó el historial: ${escapeCashHtml(error.message || 'Error desconocido')}</p></div>`;
    if (count) count.textContent = 'Error';
    return [];
  }
}

async function refreshCanonicalCashSection() {
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  if (!supabaseClient || !context?.isVerified || !context.tenantId) {
    canonicalCashView = { ...getEmptyCashData(), closed: true, authorityUnavailable: true };
    renderCashSectionUI();
    return canonicalCashView;
  }

  try {
    loadCanonicalCashClosureHistory().catch(error => {
      console.error('No se pudo abrir el historial de cierres:', error);
    });
    const selectedRegisterId = document.getElementById('pos-register-select')?.value || null;
    let sessionQuery = supabaseClient
      .from('cash_sessions_v2')
      .select('id,register_id,status,opened_by,opened_at,opening_amount,closed_by,closed_at,version')
      .eq('tenant_id', context.tenantId)
      .gte('opened_at', `${getTodayDateKey()}T00:00:00-03:00`)
      .order('opened_at', { ascending: false })
      .limit(1);
    if (selectedRegisterId) sessionQuery = sessionQuery.eq('register_id', selectedRegisterId);
    const { data: session, error: sessionError } = await sessionQuery.maybeSingle();
    if (sessionError) throw sessionError;

    if (!session) {
      canonicalCashView = { ...getEmptyCashData(), authority: 'server', noSession: true };
      renderCashSectionUI();
      return canonicalCashView;
    }

    const [movementsResult, sheet] = await Promise.all([
      supabaseClient
        .from('cash_movements_v2')
        .select('id,document_number,document_type,movement_type,direction,amount,currency,category,description,actor_user_id,created_at')
        .eq('tenant_id', context.tenantId)
        .eq('session_id', session.id)
        .order('created_at', { ascending: false }),
      window.OperationalApi.fetchCashSessionSheet({
        supabaseClient,
        authContext: context,
        sessionId: session.id
      })
    ]);
    if (movementsResult.error) throw movementsResult.error;

    const openingMovement = Number(session.opening_amount) > 0 ? [{
      id: `${session.id}:opening`,
      createdAt: session.opened_at,
      time: new Date(session.opened_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      type: 'apertura',
      amount: Number(session.opening_amount),
      desc: 'Fondo inicial de caja',
      vendor: session.opened_by,
      voided: false
    }] : [];
    const movements = openingMovement.concat((movementsResult.data || []).map(mapCanonicalCashMovement));
    canonicalCashView = {
      ...getEmptyCashData(),
      authority: 'server',
      sessionId: session.id,
      registerId: session.register_id,
      movements,
      sales: movements.filter(movement => movement.type === 'venta_efectivo'),
      summary: sheet,
      closed: session.status !== 'OPEN',
      validated: sheet?.review_status === 'APPROVED',
      closureId: sheet?.closure_id || null,
      closureDocumentNumber: sheet?.closure_document_number || null,
      reviewStatus: sheet?.review_status || null,
      closedBy: session.closed_by,
      validatedBy: null,
      closedAt: sheet?.closed_at || session.closed_at,
      countedCash: sheet?.counted_cash === null ? null : Number(sheet.counted_cash),
      expectedCash: Number(sheet?.expected_cash || 0),
      difference: sheet?.difference === null ? null : Number(sheet.difference),
      closureNotes: sheet?.closure_notes || '',
      cashBreakdown: sheet?.cash_breakdown || {},
      updatedAt: session.closed_at || session.opened_at
    };
    renderCashSectionUI();
    return canonicalCashView;
  } catch (error) {
    console.error('No se pudo sincronizar la caja central:', error);
    canonicalCashView = { ...getEmptyCashData(), closed: true, authorityUnavailable: true, loadError: error.message };
    renderCashSectionUI();
    return canonicalCashView;
  }
}

async function fetchCanonicalInternalCatalog() {
  const context = await ensureVendorOperationalSession();
  if (!supabaseClient || !context) {
    throw new Error('Se requiere una sesión verificada para consultar el catálogo operativo.');
  }

  const [productsResult, balancesResult, locationsResult] = await Promise.all([
    supabaseClient
      .from('catalog_products')
      .select('id,sku,barcode,name,description,category,price,currency,active,track_stock,metadata')
      .eq('tenant_id', context.tenantId)
      .eq('active', true)
      .order('name', { ascending: true }),
    supabaseClient
      .from('inventory_balances_v2')
      .select('product_id,location_id,on_hand,reserved,available')
      .eq('tenant_id', context.tenantId),
    supabaseClient
      .from('inventory_locations_v2')
      .select('id,code,name,is_sellable,is_default,active')
      .eq('tenant_id', context.tenantId)
      .eq('active', true)
      .eq('is_sellable', true)
  ]);

  if (productsResult.error) throw productsResult.error;
  if (balancesResult.error) throw balancesResult.error;
  if (locationsResult.error) throw locationsResult.error;

  const locations = new Map((locationsResult.data || []).map(location => [location.id, location]));
  const bestBalanceByProduct = new Map();
  const inventoryOptionsByProduct = new Map();
  (balancesResult.data || []).forEach(balance => {
    const location = locations.get(balance.location_id);
    if (!location) return;
    const available = Math.max(0, Number(balance.available ?? (Number(balance.on_hand) - Number(balance.reserved))) || 0);
    const options = inventoryOptionsByProduct.get(balance.product_id) || [];
    options.push({
      location_id: balance.location_id,
      code: location.code,
      name: location.name,
      is_default: location.is_default,
      available
    });
    inventoryOptionsByProduct.set(balance.product_id, options);
    const current = bestBalanceByProduct.get(balance.product_id);
    if (!current || (location.is_default && !current.location?.is_default) || available > current.available) {
      bestBalanceByProduct.set(balance.product_id, { ...balance, available, location });
    }
  });

  return (productsResult.data || []).map(product => {
    const balance = bestBalanceByProduct.get(product.id);
    const inventoryOptions = (inventoryOptionsByProduct.get(product.id) || [])
      .sort((left, right) => Number(right.is_default) - Number(left.is_default) || right.available - left.available);
    const image = product.metadata?.image_url || product.metadata?.image || 'assets/logo.jpg';
    return {
      id: product.id,
      product_id: product.id,
      product_code: product.sku,
      barcode: product.barcode || '',
      name: product.name,
      description: product.description || '',
      category: product.category || 'Otros',
      brand: product.metadata?.brand || '',
      presentation: product.metadata?.presentation || '',
      price: Number(product.price) || 0,
      currency: product.currency || 'ARS',
      track_stock: product.track_stock,
      stock: product.track_stock ? (balance?.available || 0) : Number.MAX_SAFE_INTEGER,
      available_quantity: product.track_stock ? (balance?.available || 0) : null,
      location_id: balance?.location_id || null,
      shelf_code: product.metadata?.shelf_code || balance?.location?.code || '',
      inventory_options: inventoryOptions,
      image,
      image_url: image,
      metadata: product.metadata || {},
      available: true,
      source: 'catalog_products'
    };
  });
}

const DELETED_INTERNAL_PRODUCTS_KEY = 'boeweb_deleted_internal_product_ids_v1';

function getDeletedInternalProductIds() {
  try {
    const list = JSON.parse(localStorage.getItem(DELETED_INTERNAL_PRODUCTS_KEY) || '[]');
    return new Set(Array.isArray(list) ? list.map(s => String(s).trim().toLowerCase()) : []);
  } catch (_) {
    return new Set();
  }
}

function addDeletedInternalProductIds(ids) {
  try {
    const set = getDeletedInternalProductIds();
    (Array.isArray(ids) ? ids : [ids]).filter(Boolean).forEach(id => set.add(String(id).trim().toLowerCase()));
    localStorage.setItem(DELETED_INTERNAL_PRODUCTS_KEY, JSON.stringify(Array.from(set)));
  } catch (_) {}
}

function isProductTombstoned(idOrCode) {
  if (!idOrCode) return false;
  const clean = String(idOrCode).trim().toLowerCase();
  const set = getDeletedInternalProductIds();
  return set.has(clean);
}


async function loadInternalCatalog() {
  const grid = document.getElementById('internal-catalog-grid');
  if (grid) {
    setInternalCatalogStatus('Cargando los productos propios de la tienda…', 'loading');
    grid.innerHTML = '';
  }
  try {
    internalCatalogProducts = await fetchCanonicalInternalCatalog();

    if (grid) {
      populateInternalCatalogCategoryFilter();
      renderInternalCatalogGrid();
      setInternalCatalogStatus('');
    }
  } catch (error) {
    console.error('Error al cargar el catálogo interno:', error);
    internalCatalogProducts = [];
    if (grid) {
      populateInternalCatalogCategoryFilter();
      renderInternalCatalogGrid();
      setInternalCatalogStatus(`Catálogo central no disponible: ${error.message}`, 'error');
    }
  }
}

function populateInternalCatalogCategoryFilter() {
  const select = document.getElementById('internal-catalog-category');
  if (!select) return;
  const currentValue = select.value || 'all';
  const categories = [...new Set(internalCatalogProducts.map(p => p.category).filter(Boolean))].sort();
  select.innerHTML = '<option value="all">Todas</option>' +
    categories.map(cat => `<option value="${escapeStockHtml(cat)}" ${cat === currentValue ? 'selected' : ''}>${escapeStockHtml(cat)}</option>`).join('');
  internalCatalogFilterCategory = select.value;
}

function filterInternalCatalog() {
  const searchInput = document.getElementById('internal-catalog-search');
  const categorySelect = document.getElementById('internal-catalog-category');
  internalCatalogFilterQuery = searchInput?.value.trim().toLowerCase() || '';
  internalCatalogFilterCategory = categorySelect?.value || 'all';
  renderInternalCatalogGrid();
}

// --- INTERNAL CATALOG BATCH SELECTION & USER DELETION QUOTA (MAX 5) ---
const MAX_USER_CATALOG_DELETIONS = 5;
const selectedInternalCatalogIds = new Set();
let isAdminAuditUnlocked = false;

function isVendorAdmin(vendorName) {
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : { isVerified: false };
  return context.isVerified && (context.role === 'ADMIN' || context.role === 'SUPERADMIN');
}

function getUserCatalogDeletionCount(vendorName) {
  if (!vendorName) return 0;
  const cleanName = String(vendorName).trim().toLowerCase();
  try {
    const quotaMap = JSON.parse(localStorage.getItem('boeweb_user_deletion_quotas') || '{}');
    return Number(quotaMap[cleanName] || 0);
  } catch (_) {
    return 0;
  }
}

function getUserDeletionRemainingQuota(vendorName) {
  if (isVendorAdmin(vendorName)) return 9999;
  const used = getUserCatalogDeletionCount(vendorName);
  return Math.max(0, MAX_USER_CATALOG_DELETIONS - used);
}

function incrementUserCatalogDeletionCount(vendorName, count = 1) {
  if (!vendorName || isVendorAdmin(vendorName)) return;
  const cleanName = String(vendorName).trim().toLowerCase();
  try {
    const quotaMap = JSON.parse(localStorage.getItem('boeweb_user_deletion_quotas') || '{}');
    quotaMap[cleanName] = (Number(quotaMap[cleanName] || 0)) + count;
    localStorage.setItem('boeweb_user_deletion_quotas', JSON.stringify(quotaMap));
  } catch (_) {}
}

function logSecureAuditEvent({
  event_type,
  severity = 'INFO',
  category = 'GENERAL',
  actor_name = null,
  description,
  entity_type = null,
  entity_id = null,
  details = {}
}) {
  // Compatibilidad de UI: las acciones autoritativas escriben su auditoría en
  // la misma transacción backend. Nunca fingir persistencia segura en el browser.
  return {
    timestamp: new Date().toISOString(),
    actor: actor_name || 'Sesión autenticada',
    event_type,
    category,
    severity,
    description,
    entity_type,
    entity_id,
    details,
    authority: 'server'
  };
}
window.logSecureAuditEvent = logSecureAuditEvent;

function getFilteredInternalCatalogProducts() {
  return internalCatalogProducts.filter(product => {
    const matchesCategory = internalCatalogFilterCategory === 'all' || product.category === internalCatalogFilterCategory;
    const searchText = [product.name, product.brand, product.presentation, product.category, product.id, product.barcode].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = !internalCatalogFilterQuery || searchText.includes(internalCatalogFilterQuery);
    return matchesCategory && matchesSearch;
  });
}

function toggleSelectInternalCatalogItem(productId, checked) {
  if (checked) {
    selectedInternalCatalogIds.add(String(productId));
  } else {
    selectedInternalCatalogIds.delete(String(productId));
  }
  updateInternalCatalogBatchToolbar();
}

function toggleSelectAllInternalCatalog(checked) {
  const filtered = getFilteredInternalCatalogProducts();
  if (checked) {
    filtered.forEach(p => selectedInternalCatalogIds.add(String(p.id)));
  } else {
    selectedInternalCatalogIds.clear();
  }
  renderInternalCatalogGrid();
  updateInternalCatalogBatchToolbar();
}

function updateInternalCatalogBatchToolbar() {
  const activeVendor = sessionStorage.getItem('boeweb_vendor_name') || localStorage.getItem('boeweb_vendor_name') || 'Vendedor';
  const remaining = getUserDeletionRemainingQuota(activeVendor);
  const isAdmin = isVendorAdmin(activeVendor);
  const count = selectedInternalCatalogIds.size;

  const quotaLeft = document.getElementById('internal-catalog-quota-left');
  const selectedInd = document.getElementById('internal-catalog-selected-indicator');
  const selectedNum = document.getElementById('internal-catalog-selected-number');
  const bulkBtn = document.getElementById('btn-internal-catalog-bulk-delete');
  const bulkCount = document.getElementById('internal-catalog-bulk-btn-count');
  const selectAllCheck = document.getElementById('internal-catalog-select-all');

  if (quotaLeft) {
    quotaLeft.textContent = isAdmin ? 'Admin (Sin límite)' : remaining;
    quotaLeft.style.color = remaining <= 1 ? '#ef5350' : (remaining <= 3 ? '#ff9800' : '#2e7d32');
  }

  if (selectedInd && selectedNum) {
    if (count > 0) {
      selectedInd.style.display = 'inline';
      selectedNum.textContent = count;
    } else {
      selectedInd.style.display = 'none';
    }
  }

  if (bulkBtn && bulkCount) {
    if (count > 0) {
      bulkBtn.style.display = 'inline-flex';
      bulkCount.textContent = count;
    } else {
      bulkBtn.style.display = 'none';
    }
  }

  if (selectAllCheck) {
    const filtered = getFilteredInternalCatalogProducts();
    selectAllCheck.checked = filtered.length > 0 && filtered.every(p => selectedInternalCatalogIds.has(String(p.id)));
  }
}

async function deleteSingleInternalCatalogProduct(productId) {
  const protectedProduct = internalCatalogProducts.find(p => String(p.id) === String(productId) || String(p.supplierRowId) === String(productId));
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  if (protectedProduct) {
    if (!context?.isVerified || !['ADMIN', 'SUPERVISOR', 'SUPERADMIN'].includes(context.role)) {
      alert('Sólo un administrador o supervisor autenticado puede archivar productos.');
      return;
    }
    if (protectedProduct.source !== 'catalog_products') {
      alert('Este producto pertenece al catálogo heredado. Migrálo al catálogo central antes de archivarlo; no se permiten borrados locales destructivos.');
      return;
    }
    if (!confirm(`¿Archivar "${protectedProduct.name}"?\n\nDejará de ofrecerse, pero conservará ventas, stock y auditoría histórica.`)) return;
    try {
      await window.OperationalApi.archiveCatalogProduct({
        supabaseClient,
        authContext: context,
        productId: protectedProduct.id,
        reason: 'Archivado desde el catálogo interno por un supervisor.'
      });
      selectedInternalCatalogIds.delete(String(protectedProduct.id));
      await loadInternalCatalog();
      showToast(`Producto "${protectedProduct.name}" archivado sin borrar su historial.`);
    } catch (error) {
      console.error('No se pudo archivar el producto:', error);
      alert(`No se archivó el producto.\n\n${error.message || 'Error desconocido'}`);
    }
    return;
  }

  alert('El producto no existe en el catálogo central. No se ejecutó ninguna eliminación heredada.');
  return;

  const activeVendor = sessionStorage.getItem('boeweb_vendor_name') || localStorage.getItem('boeweb_vendor_name') || 'Vendedor';
  const remaining = getUserDeletionRemainingQuota(activeVendor);
  const isAdmin = isVendorAdmin(activeVendor);

  if (!isAdmin && remaining < 1) {
    alert(`⚠️ Límite de seguridad alcanzado:\n\nCada usuario tiene un cupo máximo de 5 eliminaciones del catálogo interno.\nHas alcanzado tu límite (0 disponibles).\n\nPara solicitar la baja de productos adicionales, contactá a un Administrador.`);
    return;
  }

  const product = internalCatalogProducts.find(p => String(p.id) === String(productId) || String(p.supplierRowId) === String(productId));
  if (!product) {
    showToast('❌ Producto no encontrado en el catálogo.');
    return;
  }

  const confirmMsg = `¿Confirmás la eliminación de "${product.name}"?\n\nEsta acción quitará el producto del catálogo y quedará registrada en la bitácora de auditoría.${!isAdmin ? `\n(Te quedarán ${remaining - 1} eliminaciones de tu cupo).` : ''}`;
  if (!confirm(confirmMsg)) return;

  const targetId = String(product.id);
  const supplierRowId = product.supplierRowId ? String(product.supplierRowId) : null;
  const draftId = product.draftId ? String(product.draftId) : null;
  const barcode = product.barcode ? String(product.barcode) : null;

  // 1. Guardar en Tombstone permanente
  addDeletedInternalProductIds([targetId, supplierRowId, draftId, barcode]);

  // 2. Quitar del array local y cache
  internalCatalogProducts = internalCatalogProducts.filter(p => 
    String(p.id) !== targetId && 
    String(p.supplierRowId || '') !== targetId &&
    (!supplierRowId || String(p.supplierRowId || '') !== supplierRowId)
  );
  selectedInternalCatalogIds.delete(targetId);
  localStorage.setItem('boeweb_internal_catalog', JSON.stringify(internalCatalogProducts));

  // 3. Quitar sólo de la proyección visual. El inventario central se modifica
  // exclusivamente mediante las RPC operativas.
  if (typeof window !== 'undefined' && Array.isArray(window.storeLocationProducts)) {
    window.storeLocationProducts = window.storeLocationProducts.filter(l => 
      String(l.product_code || '') !== targetId && 
      String(l.product_id || '') !== targetId &&
      (!barcode || String(l.barcode || '') !== barcode)
    );
  }

  // 5. Quitar de Supabase en todas las tablas vinculadas
  if (supabaseClient) {
    try {
      // a. supplier_products (es de donde lee el catálogo interno)
      await supabaseClient
        .from('supplier_products')
        .delete()
        .eq('supplier_id', 'local_store')
        .or(`supplier_product_id.eq.${targetId},mapped_product_id.eq.${targetId}${supplierRowId ? `,id.eq.${supplierRowId}` : ''}`);

      // b. product_drafts
      if (draftId) {
        await supabaseClient.from('product_drafts').delete().eq('id', draftId);
      }
      await supabaseClient.from('product_drafts').delete().eq('product_code', targetId);

      // c. products
      await supabaseClient.from('products').delete().eq('id', targetId);
    } catch (err) {
      console.warn('Aviso eliminando en Supabase:', err);
    }
  }

  // 6. Incrementar cuota del usuario
  if (!isAdmin) {
    incrementUserCatalogDeletionCount(activeVendor, 1);
  }

  // 7. Registrar en la Bitácora de Auditoría
  logSecureAuditEvent({
    event_type: 'PRODUCT_DELETED',
    category: 'CATALOG',
    severity: 'CRITICAL',
    actor_name: activeVendor,
    description: `Eliminación de producto individual: "${product.name}" (${product.category || 'Sin categoría'}, $${product.price}, Stock: ${product.stock} u.)`,
    entity_type: 'product',
    entity_id: targetId,
    details: {
      id: targetId,
      supplierRowId,
      draftId,
      name: product.name,
      brand: product.brand,
      category: product.category,
      price: product.price,
      stock: product.stock,
      barcode: product.barcode,
      deleted_by: activeVendor,
      quota_remaining_after: isAdmin ? 'ADMIN_UNLIMITED' : Math.max(0, remaining - 1)
    }
  });

  renderInternalCatalogGrid();
  updateInternalCatalogBatchToolbar();
  showToast(`🗑️ "${product.name}" eliminado del catálogo.`);
}

async function deleteSelectedInternalCatalogProducts() {
  const selectedList = Array.from(selectedInternalCatalogIds);
  if (selectedList.length === 0) {
    alert('Seleccioná al menos un producto para eliminar.');
    return;
  }

  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  const selectedProducts = selectedList.map(id => internalCatalogProducts.find(product => String(product.id) === String(id)));
  if (!context?.isVerified || !['ADMIN', 'SUPERVISOR', 'SUPERADMIN'].includes(context.role)) {
    alert('Sólo un administrador o supervisor autenticado puede archivar productos.');
    return;
  }
  if (!window.OperationalApi || !supabaseClient || selectedProducts.some(product => !product || product.source !== 'catalog_products')) {
    alert('La selección contiene productos heredados o inválidos. Migrálos al catálogo central antes de archivarlos.');
    return;
  }
  if (!confirm(`¿Archivar los ${selectedProducts.length} productos seleccionados?\n\nSe conservarán stock, ventas y auditoría histórica.`)) return;
  try {
    for (const product of selectedProducts) {
      await window.OperationalApi.archiveCatalogProduct({
        supabaseClient,
        authContext: context,
        productId: product.id,
        reason: 'Archivado por lote desde el catálogo interno.'
      });
    }
    selectedInternalCatalogIds.clear();
    await loadInternalCatalog();
    showToast(`${selectedProducts.length} productos archivados sin borrar su historial.`);
  } catch (error) {
    console.error('No se pudo completar el archivo por lote:', error);
    alert(`El lote no se completó. Revisá el estado de cada producto.\n\n${error.message || 'Error desconocido'}`);
  }
  return;

  /* Ruta legacy retenida temporalmente sólo como referencia de migración. */
  const activeVendor = sessionStorage.getItem('boeweb_vendor_name') || localStorage.getItem('boeweb_vendor_name') || 'Vendedor';

  const remaining = getUserDeletionRemainingQuota(activeVendor);
  const isAdmin = isVendorAdmin(activeVendor);

  if (!isAdmin && selectedList.length > remaining) {
    alert(`⚠️ Límite de seguridad excedido:\n\nIntentás eliminar ${selectedList.length} productos, pero tu cupo restante es de ${remaining} eliminación${remaining === 1 ? '' : 'es'} (máximo 5 por usuario).\n\nReducí la selección o contactá a un Administrador.`);
    return;
  }

  const confirmMsg = `¿Confirmás la eliminación de los ${selectedList.length} productos seleccionados?\n\nEsta acción quitará los productos del catálogo y generará un registro inmutable en la bitácora de auditoría.${!isAdmin ? `\n(Te quedarán ${remaining - selectedList.length} eliminaciones de tu cupo).` : ''}`;
  if (!confirm(confirmMsg)) return;

  const deletedProductsDetails = [];
  const targetIdsToDelete = [];
  const supplierRowIdsToDelete = [];
  const draftIdsToDelete = [];
  const barcodesToDelete = [];

  // 1. Filtrar y recolectar identificadores
  internalCatalogProducts = internalCatalogProducts.filter(p => {
    const pId = String(p.id);
    const sId = p.supplierRowId ? String(p.supplierRowId) : null;
    if (selectedInternalCatalogIds.has(pId) || (sId && selectedInternalCatalogIds.has(sId))) {
      deletedProductsDetails.push({
        id: p.id,
        supplierRowId: p.supplierRowId,
        draftId: p.draftId,
        name: p.name,
        brand: p.brand,
        category: p.category,
        price: p.price,
        stock: p.stock,
        barcode: p.barcode
      });
      targetIdsToDelete.push(pId);
      if (sId) supplierRowIdsToDelete.push(sId);
      if (p.draftId) draftIdsToDelete.push(String(p.draftId));
      if (p.barcode) barcodesToDelete.push(String(p.barcode));
      return false;
    }
    return true;
  });

  const allTombstoneIds = [...targetIdsToDelete, ...supplierRowIdsToDelete, ...draftIdsToDelete, ...barcodesToDelete];
  addDeletedInternalProductIds(allTombstoneIds);

  localStorage.setItem('boeweb_internal_catalog', JSON.stringify(internalCatalogProducts));

  // 2. Limpiar sólo la proyección visual; no hay escritura WMS local.
  if (typeof window !== 'undefined' && Array.isArray(window.storeLocationProducts)) {
    const delSet = new Set(allTombstoneIds.map(s => s.toLowerCase()));
    window.storeLocationProducts = window.storeLocationProducts.filter(l => 
      !delSet.has(String(l.product_code || '').toLowerCase()) && 
      !delSet.has(String(l.product_id || '').toLowerCase()) &&
      (!l.barcode || !delSet.has(String(l.barcode).toLowerCase()))
    );
  }

  // 4. Borrar en Supabase en todas las tablas
  if (supabaseClient) {
    try {
      // a. supplier_products
      if (targetIdsToDelete.length > 0) {
        await supabaseClient
          .from('supplier_products')
          .delete()
          .eq('supplier_id', 'local_store')
          .in('supplier_product_id', targetIdsToDelete);

        await supabaseClient
          .from('supplier_products')
          .delete()
          .eq('supplier_id', 'local_store')
          .in('mapped_product_id', targetIdsToDelete);
      }
      if (supplierRowIdsToDelete.length > 0) {
        await supabaseClient
          .from('supplier_products')
          .delete()
          .eq('supplier_id', 'local_store')
          .in('id', supplierRowIdsToDelete);
      }

      // b. product_drafts
      if (draftIdsToDelete.length > 0) {
        await supabaseClient.from('product_drafts').delete().in('id', draftIdsToDelete);
      }
      if (targetIdsToDelete.length > 0) {
        await supabaseClient.from('product_drafts').delete().in('product_code', targetIdsToDelete);
      }

      // c. products
      if (targetIdsToDelete.length > 0) {
        await supabaseClient.from('products').delete().in('id', targetIdsToDelete);
      }
    } catch (err) {
      console.warn('Error bulk deleting from Supabase:', err);
    }
  }

  // 5. Incrementar cuota
  if (!isAdmin) {
    incrementUserCatalogDeletionCount(activeVendor, selectedList.length);
  }

  // 6. Registrar en Auditoría
  logSecureAuditEvent({
    event_type: 'PRODUCT_BULK_DELETED',
    category: 'CATALOG',
    severity: 'CRITICAL',
    actor_name: activeVendor,
    description: `Eliminación múltiple de ${deletedProductsDetails.length} productos por lote: ${deletedProductsDetails.map(p => `"${p.name}"`).join(', ')}`,
    entity_type: 'product_batch',
    entity_id: `batch_${Date.now()}`,
    details: {
      count: deletedProductsDetails.length,
      deleted_items: deletedProductsDetails,
      deleted_by: activeVendor,
      quota_remaining_after: isAdmin ? 'ADMIN_UNLIMITED' : Math.max(0, remaining - selectedList.length)
    }
  });

  selectedInternalCatalogIds.clear();
  renderInternalCatalogGrid();
  updateInternalCatalogBatchToolbar();
  showToast(`🗑️ ${deletedProductsDetails.length} productos eliminados correctamente.`);
}

function openAdminAuditInvestigationModal() {
  const modal = document.getElementById('modal-admin-investigation-audit');
  if (!modal) return;

  const authScreen = document.getElementById('admin-audit-auth-screen');
  const contentScreen = document.getElementById('admin-audit-content-screen');
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : { isVerified: false };

  modal.style.display = 'flex';

  if (isAdminAuditUnlocked || (context.isVerified && ['ADMIN', 'SUPERVISOR', 'SUPERADMIN'].includes(context.role))) {
    isAdminAuditUnlocked = true;
    if (authScreen) authScreen.style.display = 'none';
    if (contentScreen) contentScreen.style.display = 'flex';
    renderAdminAuditLogs({ refresh: true });
  } else {
    if (authScreen) authScreen.style.display = 'flex';
    if (contentScreen) contentScreen.style.display = 'none';
  }
}

function closeAdminAuditModal() {
  const modal = document.getElementById('modal-admin-investigation-audit');
  if (modal) modal.style.display = 'none';
}

async function handleAdminAuditUnlock(event) {
  if (event) event.preventDefault();
  const errorEl = document.getElementById('admin-audit-auth-error');
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : { isVerified: false };
  const isValid = context.isVerified && ['ADMIN', 'SUPERVISOR', 'SUPERADMIN'].includes(context.role);

  if (!isValid) {
    if (errorEl) {
      errorEl.textContent = '❌ Tu sesión no tiene permisos de administración.';
      errorEl.style.display = 'block';
    }
    return;
  }

  isAdminAuditUnlocked = true;
  if (errorEl) errorEl.style.display = 'none';

  const authScreen = document.getElementById('admin-audit-auth-screen');
  const contentScreen = document.getElementById('admin-audit-content-screen');
  if (authScreen) authScreen.style.display = 'none';
  if (contentScreen) contentScreen.style.display = 'flex';

  await renderAdminAuditLogs({ refresh: true });
}

async function loadCanonicalAdminAuditLogs({ refresh = false } = {}) {
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  if (!supabaseClient || !context?.isVerified || !context.tenantId
      || !['ADMIN', 'SUPERVISOR', 'SUPERADMIN'].includes(context.role)) {
    throw new Error('La sesión no tiene permiso para consultar la auditoría central.');
  }
  if (!refresh && canonicalAdminAuditLogs.length > 0 && Date.now() - canonicalAdminAuditLoadedAt < 30_000) {
    return canonicalAdminAuditLogs;
  }
  const { data, error } = await supabaseClient
    .from('operational_audit_log')
    .select('id,actor_user_id,action,entity_type,entity_id,before_data,after_data,correlation_id,metadata,created_at')
    .eq('tenant_id', context.tenantId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message || 'No se pudo consultar operational_audit_log.');
  canonicalAdminAuditLogs = (data || []).map(entry => {
    const createdAt = new Date(entry.created_at);
    const metadata = entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
    return {
      id: entry.id,
      timestamp: entry.created_at,
      formatted_date: Number.isNaN(createdAt.getTime()) ? '' : createdAt.toLocaleDateString('es-AR'),
      formatted_time: Number.isNaN(createdAt.getTime()) ? '' : createdAt.toLocaleTimeString('es-AR'),
      actor: entry.actor_user_id || 'Backend verificado',
      event_type: entry.action,
      category: String(metadata.category || entry.entity_type || 'GENERAL').toUpperCase(),
      severity: String(metadata.severity || 'INFO').toUpperCase(),
      description: metadata.description || `${entry.action} · ${entry.entity_type}`,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      details: {
        before_data: entry.before_data,
        after_data: entry.after_data,
        metadata,
        correlation_id: entry.correlation_id
      },
      authority: 'server'
    };
  });
  canonicalAdminAuditLoadedAt = Date.now();
  return canonicalAdminAuditLogs;
}

async function renderAdminAuditLogs({ refresh = false } = {}) {
  const listEl = document.getElementById('admin-audit-entries-list');
  const kpiTotal = document.getElementById('audit-kpi-total');
  const kpiDeleted = document.getElementById('audit-kpi-deleted');
  const kpiCashVoids = document.getElementById('audit-kpi-cash-voids');
  const kpiStockRetires = document.getElementById('audit-kpi-stock-retires');
  const kpiOrdersCancel = document.getElementById('audit-kpi-orders-cancel');

  if (!listEl) return;

  listEl.innerHTML = '<div style="padding: 24px; text-align: center; color: rgba(255,255,255,0.7);">Consultando auditoría central…</div>';
  let rawLogs;
  try {
    rawLogs = await loadCanonicalAdminAuditLogs({ refresh });
  } catch (error) {
    console.error('No se pudo cargar la auditoría central:', error);
    listEl.innerHTML = `<div style="padding: 24px; text-align: center; color: #ef5350;">${escapeStockHtml(error.message || 'Auditoría central no disponible.')}</div>`;
    return;
  }
  const filterType = document.getElementById('admin-audit-filter-type')?.value || 'all';
  const searchQuery = document.getElementById('admin-audit-search')?.value.trim().toLowerCase() || '';

  if (kpiTotal) kpiTotal.textContent = rawLogs.length;
  if (kpiDeleted) kpiDeleted.textContent = rawLogs.filter(l => (l.event_type || '').includes('DELETED')).length;
  if (kpiCashVoids) kpiCashVoids.textContent = rawLogs.filter(l => (l.event_type || '').includes('CASH') || l.category === 'CASH').length;
  if (kpiStockRetires) kpiStockRetires.textContent = rawLogs.filter(l => (l.event_type || '').includes('STOCK') || (l.event_type || '').includes('RETIRED') || l.category === 'WMS').length;
  if (kpiOrdersCancel) kpiOrdersCancel.textContent = rawLogs.filter(l => (l.event_type || '').includes('ORDER') || l.category === 'ORDERS').length;

  const filteredLogs = rawLogs.filter(entry => {
    if (filterType !== 'all') {
      if (filterType === 'PRODUCT_DELETED' && !(entry.event_type || '').includes('DELETED')) return false;
      if (filterType === 'CASH' && !(entry.event_type || '').includes('CASH') && entry.category !== 'CASH') return false;
      if (filterType === 'WMS' && !(entry.event_type || '').includes('STOCK') && !(entry.event_type || '').includes('RETIRED') && entry.category !== 'WMS') return false;
      if (filterType === 'ORDERS' && !(entry.event_type || '').includes('ORDER') && entry.category !== 'ORDERS') return false;
      if (filterType === 'CATALOG' && entry.category !== 'CATALOG') return false;
    }
    if (searchQuery) {
      const fullText = `${entry.actor || ''} ${entry.event_type || ''} ${entry.description || ''} ${JSON.stringify(entry.details || {})}`.toLowerCase();
      if (!fullText.includes(searchQuery)) return false;
    }
    return true;
  });

  if (filteredLogs.length === 0) {
    listEl.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: rgba(255,255,255,0.5); font-size: 0.88rem;">
        🛡️ No se encontraron registros de auditoría que coincidan con la búsqueda.
      </div>
    `;
    return;
  }

  listEl.innerHTML = filteredLogs.map(entry => {
    const isCritical = entry.severity === 'CRITICAL' || (entry.event_type || '').includes('DELETED');
    const isWarning = entry.severity === 'WARNING' || (entry.event_type || '').includes('VOID') || (entry.event_type || '').includes('CANCEL');
    const badgeBg = isCritical ? 'rgba(239,83,80,0.2)' : (isWarning ? 'rgba(255,167,38,0.2)' : 'rgba(41,182,246,0.2)');
    const badgeColor = isCritical ? '#ef5350' : (isWarning ? '#ffa726' : '#29b6f6');
    const borderCol = isCritical ? 'rgba(239,83,80,0.35)' : 'rgba(255,255,255,0.12)';

    return `
      <div style="background: rgba(255,255,255,0.035); border: 1px solid ${borderCol}; border-radius: 12px; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeColor}; font-size: 0.7rem; font-weight: 800; padding: 2px 8px; border-radius: 6px; text-transform: uppercase;">
              ${escapeStockHtml(entry.event_type || 'EVENTO')}
            </span>
            <span style="font-weight: 800; font-size: 0.85rem; color: #ffd54f;">🧑‍💼 ${escapeStockHtml(entry.actor || 'Desconocido')}</span>
          </div>
          <span style="font-size: 0.75rem; color: rgba(255,255,255,0.5); font-family: monospace;">
            🕒 ${escapeStockHtml(entry.formatted_date || '')} ${escapeStockHtml(entry.formatted_time || '')}
          </span>
        </div>
        <div style="font-size: 0.86rem; color: rgba(255,255,255,0.9); line-height: 1.4;">
          ${escapeStockHtml(entry.description || '')}
        </div>
        <details style="margin-top: 4px; font-size: 0.76rem;">
          <summary style="cursor: pointer; color: var(--vendor-gold-soft, #e6d49b); font-weight: 700;">🔍 Ver detalle técnico / Evidencia forense (JSON)</summary>
          <pre style="margin-top: 6px; padding: 10px; border-radius: 8px; background: rgba(0,0,0,0.6); color: #81c784; font-family: monospace; font-size: 0.72rem; overflow-x: auto; white-space: pre-wrap;">${escapeStockHtml(JSON.stringify(entry, null, 2))}</pre>
        </details>
      </div>
    `;
  }).join('');
}

function filterAdminAuditLogs() {
  renderAdminAuditLogs();
}

async function exportAdminAuditLogJSON() {
  let rawLogs;
  try {
    rawLogs = await loadCanonicalAdminAuditLogs({ refresh: true });
  } catch (error) {
    alert(error.message || 'No se pudo exportar la auditoría central.');
    return;
  }
  const blob = new Blob([JSON.stringify(rawLogs, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `boeweb_audit_forensic_log_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 Bitácora de auditoría exportada exitosamente.');
}

window.deleteSingleInternalCatalogProduct = deleteSingleInternalCatalogProduct;
window.deleteSelectedInternalCatalogProducts = deleteSelectedInternalCatalogProducts;
window.toggleSelectAllInternalCatalog = toggleSelectAllInternalCatalog;
window.toggleSelectInternalCatalogItem = toggleSelectInternalCatalogItem;
window.openAdminAuditInvestigationModal = openAdminAuditInvestigationModal;
window.closeAdminAuditModal = closeAdminAuditModal;
window.handleAdminAuditUnlock = handleAdminAuditUnlock;
window.filterAdminAuditLogs = filterAdminAuditLogs;
window.exportAdminAuditLogJSON = exportAdminAuditLogJSON;
window.isVendorAdmin = isVendorAdmin;

function renderInternalCatalogGrid() {
  const grid = document.getElementById('internal-catalog-grid');
  const countEl = document.getElementById('internal-catalog-count');
  if (!grid) return;

  const filtered = getFilteredInternalCatalogProducts();

  if (countEl) countEl.textContent = filtered.length;

  if (!filtered.length) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 48px 20px; background: rgba(0,0,0,0.2); border: 1px dashed var(--color-border-accent); border-radius: 16px; color: var(--color-text-muted);">
        <p style="font-weight: 700; font-size: 1.1rem; color: var(--color-accent-gold); margin: 0 0 6px 0;">No encontramos productos con ese filtro</p>
        <p style="font-size: 0.88rem; margin: 0;">Probá cambiando la búsqueda o agregá un producto nuevo desde Ingresar producto.</p>
      </div>
    `;
    updateInternalCatalogBatchToolbar();
    return;
  }

  grid.innerHTML = filtered.map(product => {
    const isSelected = selectedInternalCatalogIds.has(String(product.id));
    return `
    <article class="internal-catalog-card" style="background: var(--color-card-bg-alt); border: 1.5px solid ${isSelected ? '#2e7d32' : 'var(--color-border-accent)'}; border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; box-shadow: var(--shadow-sm); position: relative; transition: all 0.2s ease;">
      <!-- Selection Checkbox -->
      <div style="position: absolute; top: 10px; left: 10px; z-index: 10; background: rgba(0,0,0,0.65); backdrop-filter: blur(4px); padding: 4px 8px; border-radius: 8px; display: flex; align-items: center; gap: 5px;">
        <input type="checkbox" class="internal-catalog-item-check" data-product-id="${product.id}" onchange="toggleSelectInternalCatalogItem('${product.id}', this.checked)" ${isSelected ? 'checked' : ''} style="width: 17px; height: 17px; cursor: pointer; accent-color: #2e7d32;">
        <span style="font-size: 0.68rem; color: #fff; font-weight: 700;">Elegir</span>
      </div>

      <div style="aspect-ratio: 1/1; max-height: 200px; background: #000; position: relative; overflow: hidden;">
        <img src="${escapeStockHtml(product.image || 'assets/logo.jpg')}" alt="${escapeStockHtml(product.name)}" style="width: 100%; height: 100%; object-fit: contain;">
        <span style="position: absolute; top: 8px; right: 8px; background: ${product.stock > 0 ? 'rgba(46,125,50,0.9)' : 'rgba(198,40,40,0.9)'}; color: #fff; font-size: 0.72rem; font-weight: 800; padding: 3px 8px; border-radius: 8px;">
          ${product.stock > 0 ? `${product.stock} u. en stock` : 'Sin stock'}
        </span>
      </div>
      <div style="padding: 16px; flex: 1; display: flex; flex-direction: column; gap: 8px;">
        <div style="font-size: 0.75rem; color: var(--color-accent-gold); font-weight: 700;">${escapeStockHtml(product.category)}</div>
        <h4 style="margin: 0; font-size: 1rem; font-weight: 800; color: var(--color-text-main); line-height: 1.3;">${escapeStockHtml(product.name)}</h4>
        ${product.barcode ? `<div style="font-size: 0.78rem; font-family: monospace; color: var(--color-text-muted);">Barra: ${escapeStockHtml(product.barcode)}</div>` : ''}
        <div style="margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08);">
          <span style="font-size: 1.1rem; font-weight: 900; color: #66bb6a;">$${Number(product.price).toLocaleString('es-AR')}</span>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button type="button" onclick="openEditProductLocation('${escapeStockHtml(product.id)}')" style="background: rgba(46,125,50,0.15); border: 1px solid #66bb6a; color: #81c784; padding: 6px 10px; border-radius: 8px; font-weight: 700; font-size: 0.8rem; cursor: pointer;" title="Reubicar o cambiar nivel en estantería">
              📍 Ubicación
            </button>
            <button type="button" onclick="openProductQrModal('${escapeStockHtml(product.product_code || product.barcode || product.id)}', '${escapeStockHtml(product.name)}', ${product.price || 0})" style="background: rgba(46,125,50,0.15); border: 1px solid #66bb6a; color: #66bb6a; padding: 6px 10px; border-radius: 8px; font-weight: 700; font-size: 0.8rem; cursor: pointer;" title="Ver e imprimir código QR">
              🔲 QR
            </button>
            <button type="button" onclick="openInternalCatalogEditor('${product.id}')" style="background: rgba(195,155,75,0.15); border: 1px solid var(--color-accent-gold); color: var(--color-accent-gold); padding: 6px 10px; border-radius: 8px; font-weight: 700; font-size: 0.8rem; cursor: pointer;" title="Editar producto">
              ✏️ Editar
            </button>
            <button type="button" onclick="deleteSingleInternalCatalogProduct('${product.id}')" style="background: rgba(239,83,80,0.12); border: 1px solid #ef5350; color: #ef5350; padding: 6px 10px; border-radius: 8px; font-weight: 700; font-size: 0.8rem; cursor: pointer;" title="Eliminar del catálogo">
              🗑️
            </button>
          </div>
        </div>
      </div>
    </article>
  `;}).join('');

  updateInternalCatalogBatchToolbar();
}

function openInternalCatalogEditor(productId) {
  const product = internalCatalogProducts.find(item => String(item.id) === String(productId));
  const editor = document.getElementById('internal-catalog-editor');
  if (!product || !editor) return;

  internalCatalogEditingId = product.id;
  clearInternalCatalogImageState();

  document.getElementById('internal-editor-name').value = product.name || '';
  document.getElementById('internal-editor-brand').value = product.brand || '';
  document.getElementById('internal-editor-presentation').value = product.presentation || '';
  document.getElementById('internal-editor-category').value = product.category || 'Otros';
  document.getElementById('internal-editor-barcode').value = product.barcode || '';
  document.getElementById('internal-editor-price').value = product.price || '';
  document.getElementById('internal-editor-stock').value = product.stock || 0;
  document.getElementById('internal-editor-description').value = product.description || '';

  const imageEl = document.getElementById('internal-editor-image');
  if (imageEl) imageEl.src = product.image || 'assets/logo.jpg';

  editor.hidden = false;
  editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeInternalCatalogEditor() {
  const editor = document.getElementById('internal-catalog-editor');
  if (editor) editor.hidden = true;
  internalCatalogEditingId = null;
  clearInternalCatalogImageState();
}

function openInternalCatalogImagePicker() {
  const input = document.getElementById('internal-editor-image-file');
  if (!input) return;
  input.value = '';
  input.click();
}

async function handleInternalCatalogImageChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!isSupportedFastUploadImage(file) || file.size > FAST_UPLOAD_MAX_FILE_SIZE) {
    showToast('Elegí una imagen JPG, PNG, WebP, HEIC o HEIF de hasta 25 MB.');
    return;
  }
  try {
    const prepared = await prepareFastUploadImage(file);
    const decoded = await decodeFastUploadImage(prepared);
    revokeInternalCatalogImagePreview();
    internalCatalogImageFile = prepared;
    internalCatalogImagePreviewUrl = decoded.previewUrl;
    const image = document.getElementById('internal-editor-image');
    if (image) image.src = decoded.previewUrl;
  } catch (error) {
    console.error('Error al preparar la imagen del catálogo:', error);
    showToast(`No se pudo preparar la imagen: ${error.message}`);
  }
}

async function uploadInternalCatalogImage(productId, currentImage) {
  if (!internalCatalogImageFile) return { url: currentImage || '', path: null };
  const compressed = await compressImageFile(internalCatalogImageFile, 1100, 1100, 0.78);
  const path = `catalog/${String(productId).toLowerCase()}_${Date.now()}.jpg`;
  const { error } = await supabaseClient.storage
    .from('product-images')
    .upload(path, compressed, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(`No se pudo subir la imagen: ${error.message}`);
  const { data } = supabaseClient.storage.from('product-images').getPublicUrl(path);
  return { url: data?.publicUrl || currentImage || '', path };
}

function internalCatalogFormValues() {
  const rawBarcode = (document.getElementById('internal-editor-barcode')?.value || '').trim();
  return {
    name: document.getElementById('internal-editor-name')?.value.trim() || '',
    brand: document.getElementById('internal-editor-brand')?.value.trim() || null,
    presentation: document.getElementById('internal-editor-presentation')?.value.trim() || null,
    category: document.getElementById('internal-editor-category')?.value || 'Otros',
    barcode: rawBarcode || null,
    price: Number(document.getElementById('internal-editor-price')?.value || 0),
    stock: Number.parseInt(document.getElementById('internal-editor-stock')?.value || '0', 10),
    description: document.getElementById('internal-editor-description')?.value.trim() || null
  };
}

async function updateInternalCatalogRelations(product, values, image) {
  if (!supabaseClient) return;

  const productPayload = {
    name: values.name,
    category: values.category,
    description: values.description,
    image: image.url
  };

  try {
    let productResult = await supabaseClient.from('products').update({ ...productPayload, barcode: values.barcode }).eq('id', product.id);
    if (productResult.error && /column.*barcode|schema/i.test(productResult.error.message || '')) {
      productResult = await supabaseClient.from('products').update(productPayload).eq('id', product.id);
    }
    if (productResult.error) throw new Error(`No se pudo actualizar la ficha: ${productResult.error.message}`);
  } catch (prodErr) {
    console.warn('Ficha de producto notice:', prodErr.message);
  }

  if (product.supplierRowId) {
    const supplierPayload = {
      name: values.name,
      price: values.price,
      stock: values.stock,
      available: values.stock > 0,
      image: image.url
    };
    try {
      let supplierResult = await supabaseClient.from('supplier_products').update({ ...supplierPayload, barcode: values.barcode }).eq('id', product.supplierRowId);
      if (supplierResult.error && /column.*barcode|schema/i.test(supplierResult.error.message || '')) {
        supplierResult = await supabaseClient.from('supplier_products').update(supplierPayload).eq('id', product.supplierRowId);
      }
      if (supplierResult.error) throw new Error(`No se pudo actualizar precio y stock: ${supplierResult.error.message}`);
    } catch (supErr) {
      console.warn('Proveedor de producto notice:', supErr.message);
    }
  }

  const draftPayload = {
    product_code: String(product.id),
    name: values.name,
    brand: values.brand,
    presentation: values.presentation,
    category: values.category,
    description: values.description,
    barcode: values.barcode,
    image_url: image.url,
    stock: values.stock,
    sale_price: values.price,
    status: 'APPROVED',
    updated_at: new Date().toISOString()
  };
  if (image.path) draftPayload.image_path = image.path;

  try {
    if (product.draftId) {
      const draftResult = await supabaseClient.from('product_drafts').update(draftPayload).eq('id', product.draftId);
      if (draftResult.error) {
        console.warn('No se pudo actualizar por draftId, buscando por product_code:', draftResult.error.message);
        await supabaseClient.from('product_drafts').update(draftPayload).eq('product_code', String(product.id));
      }
    } else {
      const { data: existingDrafts } = await supabaseClient.from('product_drafts').select('id').eq('product_code', String(product.id)).limit(1);
      if (existingDrafts && existingDrafts.length > 0) {
        product.draftId = existingDrafts[0].id;
        await supabaseClient.from('product_drafts').update(draftPayload).eq('id', existingDrafts[0].id);
      } else {
        const { data: insertedDrafts } = await supabaseClient.from('product_drafts').insert([draftPayload]).select('id');
        if (insertedDrafts && insertedDrafts.length > 0) {
          product.draftId = insertedDrafts[0].id;
        }
      }
    }
  } catch (draftErr) {
    console.warn('Product draft sync notice:', draftErr.message);
  }
}

function updateInternalCatalogLocalLocation(product, values, imageUrl) {
  const locations = readLocalProductLocations();
  const existing = locations.find(item => String(item.product_code) === String(product.id));
  if (existing) {
    saveLocalProductLocation({
      ...existing,
      name: values.name,
      barcode: values.barcode,
      image_url: imageUrl || existing.image_url,
      stock: values.stock,
      updated_at: new Date().toISOString()
    });
  } else {
    saveLocalProductLocation({
      product_id: product.id,
      product_code: product.id,
      name: values.name,
      barcode: values.barcode,
      image_url: imageUrl || product.image || '',
      stock: values.stock,
      updated_at: new Date().toISOString()
    });
  }
}

async function saveInternalCatalogProduct(event) {
  event.preventDefault();
  const product = internalCatalogProducts.find(item => String(item.id) === String(internalCatalogEditingId));
  const saveButton = document.getElementById('internal-editor-save');
  if (!product) return;
  const values = internalCatalogFormValues();
  if (!values.name || values.price <= 0 || !Number.isInteger(values.stock) || values.stock < 0) {
    showToast('Completá nombre, precio y stock con valores válidos.');
    return;
  }
  const authContext = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  if (!window.OperationalApi || !supabaseClient || !authContext?.isVerified
      || !['ADMIN', 'SUPERVISOR', 'SUPERADMIN'].includes(authContext.role)) {
    showToast('Sólo un administrador o supervisor puede editar la ficha y corregir stock.');
    return;
  }
  if (product.source !== 'catalog_products') {
    showToast('Migrá este producto heredado antes de editarlo.');
    return;
  }
  const stockDelta = values.stock - Math.max(0, Number(product.stock) || 0);
  if (stockDelta !== 0 && !product.location_id) {
    showToast('No se puede corregir stock sin una ubicación central vinculada.');
    return;
  }
  try {
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = 'Guardando…';
    }
    const image = await uploadInternalCatalogImage(product.id, product.image);
    await window.OperationalApi.upsertCatalogProduct({
      supabaseClient,
      authContext,
      product: {
        id: product.id,
        sku: product.product_code,
        name: values.name,
        price: values.price,
        currency: product.currency || 'ARS',
        track_stock: true,
        metadata: {
          ...(product.metadata || {}),
          barcode: values.barcode,
          description: values.description,
          category: values.category,
          brand: values.brand,
          presentation: values.presentation,
          image_url: image.url
        }
      }
    });
    if (stockDelta !== 0) {
      await window.OperationalApi.adjustInventory({
        supabaseClient,
        authContext,
        productId: product.id,
        locationId: product.location_id,
        quantityDelta: stockDelta,
        reason: 'CATALOG_CORRECTION',
        notes: 'Corrección explícita desde el editor de catálogo.',
        idempotencyKey: `catalog-stock-correction:${product.id}:${globalThis.crypto?.randomUUID?.() || Date.now()}`
      });
    }

    storeMapDataLoaded = false;
    closeInternalCatalogEditor();
    await loadInternalCatalog();
    if (window.fetchB2BProducts) window.fetchB2BProducts(true);

    showToast(`Producto “${values.name}” actualizado en el catálogo interno.`);
  } catch (error) {
    console.error('Error al guardar el producto interno:', error);
    showToast(`❌ ${error.message}`);
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = 'Guardar cambios';
    }
  }
}

window.loadInternalCatalog = loadInternalCatalog;
window.filterInternalCatalog = filterInternalCatalog;
window.openInternalCatalogEditor = openInternalCatalogEditor;
window.closeInternalCatalogEditor = closeInternalCatalogEditor;
window.openInternalCatalogImagePicker = openInternalCatalogImagePicker;
window.handleInternalCatalogImageChange = handleInternalCatalogImageChange;
window.saveInternalCatalogProduct = saveInternalCatalogProduct;

/* ==========================================================================
   BÔ GROW CLUB — SISTEMA WMS (INVENTARIO FÍSICO & QR) - FASES 1 A 5
   ========================================================================== */

let canonicalWmsLocations = [];
let canonicalWmsModules = [];
let canonicalWmsMovements = [];
let canonicalWmsCounts = [];
let wmsDataLoading = false;
let wmsDataLoaded = false;
let wmsDataLoadError = null;

// currentWmsModuleCode — declared at top of file

function getHumanLevelLabel(level) {
  const num = Number(level) || 3;
  const labels = {
    1: 'Nivel 1 — abajo',
    2: 'Nivel 2 — bajo',
    3: 'Nivel 3 — altura media',
    4: 'Nivel 4 — alto',
    5: 'Nivel 5 — arriba'
  };
  return labels[num] || `Nivel ${num}`;
}

function getHumanSectorLabel(sector) {
  const code = String(sector || 'C').toUpperCase();
  const labels = { 'I': 'Izquierda', 'C': 'Centro', 'D': 'Derecha' };
  return labels[code] || code;
}

function canOperateWms(context = null) {
  const activeContext = context || (typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null);
  return Boolean(activeContext?.isVerified && ['ADMIN', 'SUPERVISOR', 'DEPOSITO'].includes(activeContext.role));
}

function parseWmsLevel(location) {
  const metadataLevel = Number(location?.metadata?.shelf_level ?? location?.metadata?.human_level);
  if (Number.isInteger(metadataLevel) && metadataLevel > 0) return metadataLevel;
  const codeMatch = String(location?.code || '').toUpperCase().match(/(?:^|-)N(\d+)(?:-|$)/);
  return codeMatch ? Number(codeMatch[1]) : 1;
}

function parseWmsSector(location) {
  const metadataSector = String(location?.metadata?.sector_position || location?.metadata?.sector || '').trim().toUpperCase();
  if (metadataSector) return metadataSector;
  const codeMatch = String(location?.code || '').toUpperCase().match(/-([ICDU])$/);
  return codeMatch ? codeMatch[1] : 'C';
}

function mapCanonicalWmsData(locations, balances, products, ledgerEntries, countEntries) {
  const locationsById = new Map((locations || []).map(location => [location.id, location]));
  const productsById = new Map((products || []).map(product => [product.id, product]));

  canonicalWmsModules = (locations || []).map(location => ({
    id: location.id,
    code: location.code,
    sector_name: location.name,
    wall_code: String(location.metadata?.wall_code || location.metadata?.wall_side || location.location_type || 'WMS'),
    module_number: 1,
    max_levels: 1,
    description: `${location.name} · ${location.location_type || 'Ubicación'}`,
    location_type: location.location_type,
    is_sellable: location.is_sellable === true,
    is_default: location.is_default === true,
    active: location.active !== false,
    metadata: location.metadata || {}
  }));

  canonicalWmsLocations = (balances || []).map(balance => {
    const location = locationsById.get(balance.location_id);
    const product = productsById.get(balance.product_id);
    if (!location || !product) return null;
    return {
      id: `${balance.product_id}:${balance.location_id}`,
      location_id: balance.location_id,
      module_code: location.code,
      location_name: location.name,
      location_metadata: location.metadata || {},
      product_id: balance.product_id,
      product_code: product.sku,
      name: product.name,
      barcode: product.barcode || '',
      human_level: parseWmsLevel(location),
      sector_position: parseWmsSector(location),
      quantity: Math.max(0, Number(balance.on_hand) || 0),
      reserved: Math.max(0, Number(balance.reserved) || 0),
      available: Math.max(0, Number(balance.available) || 0),
      image_url: product.metadata?.image_url || product.metadata?.image || ''
    };
  }).filter(Boolean);
  window.__canonicalWmsProductLocations = canonicalWmsLocations.map(location => ({
    ...location,
    product_code: location.product_code,
    stock: location.quantity,
    shelf_code: location.module_code,
    shelf_level: location.human_level,
    location_label: location.location_name,
    wms_code: location.module_code
  }));

  canonicalWmsMovements = (ledgerEntries || []).map(entry => {
    const location = locationsById.get(entry.location_id);
    const product = productsById.get(entry.product_id);
    return {
      id: entry.id,
      movement_type: entry.event_type,
      event_type: entry.event_type,
      product_id: entry.product_id,
      product_code: product?.sku || '',
      product_name: product?.name || entry.product_id,
      quantity: Math.abs(Number(entry.quantity_delta) || Number(entry.reserved_delta) || 0),
      quantity_delta: Number(entry.quantity_delta) || 0,
      on_hand_after: Number(entry.on_hand_after),
      location_id: entry.location_id,
      origin_module_code: entry.metadata?.origin_location_code || (entry.event_type === 'TRANSFER_OUT' ? location?.code : null),
      destination_module_code: entry.metadata?.destination_location_code || (entry.event_type === 'TRANSFER_IN' ? location?.code : null),
      user_name: entry.actor_user_id || 'Sistema',
      timestamp: entry.created_at,
      notes: entry.metadata?.notes || '',
      reason: entry.metadata?.reason || '',
      metadata: entry.metadata || {}
    };
  });

  canonicalWmsCounts = (countEntries || []).map(count => ({
    ...count,
    product_name: productsById.get(count.product_id)?.name || count.product_id,
    location_code: locationsById.get(count.location_id)?.code || count.location_id
  }));
}

async function loadWmsInventoryData(forceReload = false) {
  if (wmsDataLoading || (wmsDataLoaded && !forceReload)) return getWmsLocations();
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  if (!supabaseClient || !context?.isVerified || !context.tenantId) {
    canonicalWmsLocations = [];
    canonicalWmsModules = [];
    canonicalWmsMovements = [];
    canonicalWmsCounts = [];
    window.__canonicalWmsProductLocations = [];
    wmsDataLoadError = 'Iniciá sesión para consultar el inventario físico.';
    renderWmsModulesGrid();
    void loadWmsInventoryData(true);
    return [];
  }

  wmsDataLoading = true;
  wmsDataLoadError = null;
  try {
    const [locationsResult, balancesResult, productsResult, ledgerResult, countsResult] = await Promise.all([
      supabaseClient
        .from('inventory_locations_v2')
        .select('id,code,name,location_type,is_sellable,is_default,active,metadata')
        .eq('tenant_id', context.tenantId)
        .eq('active', true)
        .order('code', { ascending: true }),
      supabaseClient
        .from('inventory_balances_v2')
        .select('product_id,location_id,on_hand,reserved,available')
        .eq('tenant_id', context.tenantId),
      supabaseClient
        .from('catalog_products')
        .select('id,sku,barcode,name,metadata')
        .eq('tenant_id', context.tenantId)
        .eq('active', true),
      supabaseClient
        .from('inventory_ledger_v2')
        .select('id,product_id,location_id,event_type,quantity_delta,reserved_delta,on_hand_after,actor_user_id,metadata,created_at')
        .eq('tenant_id', context.tenantId)
        .order('created_at', { ascending: false })
        .limit(200),
      supabaseClient
        .from('inventory_count_status_v2')
        .select('count_id,product_id,location_id,expected_on_hand,expected_reserved,counted_quantity,difference,notes,submitted_by,submitted_at,review_status,reviewed_by,reviewed_at,review_reason')
        .eq('tenant_id', context.tenantId)
        .order('submitted_at', { ascending: false })
        .limit(200)
    ]);
    const failedResult = [locationsResult, balancesResult, productsResult, ledgerResult, countsResult].find(result => result.error);
    if (failedResult?.error) throw failedResult.error;
    mapCanonicalWmsData(locationsResult.data, balancesResult.data, productsResult.data, ledgerResult.data, countsResult.data);
    wmsDataLoaded = true;
    return getWmsLocations();
  } catch (error) {
    canonicalWmsLocations = [];
    canonicalWmsModules = [];
    canonicalWmsMovements = [];
    canonicalWmsCounts = [];
    window.__canonicalWmsProductLocations = [];
    wmsDataLoaded = false;
    wmsDataLoadError = error.message || 'No se pudo leer el inventario físico central.';
    console.error('No se pudo cargar el WMS central:', error);
    return [];
  } finally {
    wmsDataLoading = false;
    renderWmsModulesGrid();
  }
}

function getWmsModules() {
  return canonicalWmsModules.slice();
}

function getWmsLocations() {
  return canonicalWmsLocations.slice();
}

function getWmsMovements() {
  return canonicalWmsMovements.slice();
}

function closeWmsModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'none';
}

function renderWmsModulesGrid() {
  const container = document.getElementById('wms-modules-grid');
  const filterWall = (document.getElementById('wms-filter-wall-select')?.value || 'all').toUpperCase();
  if (!container) return;

  if (wmsDataLoading) {
    container.innerHTML = `<div class="location-empty-state"><p>Sincronizando ubicaciones y saldos con el servidor…</p></div>`;
    return;
  }
  if (wmsDataLoadError) {
    container.innerHTML = `<div class="location-empty-state"><strong>Inventario central no disponible</strong><p>${escapeStockHtml(wmsDataLoadError)}</p><button type="button" class="wms-btn wms-btn-primary" onclick="loadWmsInventoryData(true)">Reintentar</button></div>`;
    return;
  }

  const modules = getWmsModules();
  const locations = getWmsLocations();

  const filtered = filterWall === 'ALL' ? modules : modules.filter(m => String(m.wall_code).toUpperCase() === filterWall);

  if (filtered.length === 0) {
    container.innerHTML = `<div class="location-empty-state"><p>No hay ubicaciones centrales activas para este filtro.</p></div>`;
    return;
  }

  container.innerHTML = filtered.map(m => {
    const itemsInModule = locations.filter(loc => loc.module_code === m.code && loc.quantity > 0);
    const totalQty = itemsInModule.reduce((acc, curr) => acc + Number(curr.quantity), 0);
    const uniqueSkus = new Set(itemsInModule.map(loc => loc.product_id)).size;

    return `
      <div class="wms-module-card">
        <div class="wms-module-card-header">
          <span class="wms-module-code">${m.code}</span>
          <span class="wms-sector-badge">${m.sector_name}</span>
        </div>
        <p style="font-size:0.86rem; color:var(--vendor-muted); margin:0 0 10px 0;">${m.description}</p>
        <div style="font-size:0.88rem; font-weight:700; color:var(--vendor-forest); margin-bottom:12px;">
          📦 ${uniqueSkus} SKUs · ${totalQty} unidades almacenadas
        </div>
        <div class="wms-module-btn-group">
          <button type="button" class="wms-btn wms-btn-primary" onclick="openWmsModuleModal('${m.code}')">👁️ Ver Contenido</button>
          ${canOperateWms() ? `<button type="button" class="wms-btn wms-btn-warning" onclick="openWmsAuditModal('${m.code}')">📋 Auditar</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function openWmsQrScannerModal() {
  await loadWmsInventoryData(true);
  const select = document.getElementById('wms-demo-module-select');
  if (select) {
    const modules = getWmsModules();
    select.innerHTML = modules.length
      ? modules.map(module => `<option value="${escapeStockHtml(module.code)}">${escapeStockHtml(module.code)} — ${escapeStockHtml(module.sector_name)}</option>`).join('')
      : '<option value="">No hay ubicaciones centrales activas</option>';
  }
  const modal = document.getElementById('wms-qr-modal');
  if (modal) modal.style.display = 'flex';
}

function confirmWmsQrScanFromSelect() {
  const select = document.getElementById('wms-demo-module-select');
  const code = select?.value || '';
  if (!code) {
    showToast('No hay una ubicación central seleccionada.');
    return;
  }
  closeWmsModal('wms-qr-modal');
  void openWmsModuleModal(code);
}

async function openWmsModuleModal(moduleCode) {
  if (!wmsDataLoaded) await loadWmsInventoryData();
  currentWmsModuleCode = moduleCode;
  const modal = document.getElementById('wms-module-detail-modal');
  const title = document.getElementById('wms-detail-title');
  const wallBadge = document.getElementById('wms-detail-wall');
  const container = document.getElementById('wms-module-items-container');

  const modules = getWmsModules();
  const mod = modules.find(m => m.code === moduleCode);
  if (!mod) {
    showToast('La ubicación solicitada no existe o ya no está activa.');
    return;
  }

  if (title) title.textContent = `Módulo ${mod.code}`;
  if (wallBadge) wallBadge.textContent = `${mod.sector_name} (${mod.wall_code})`;

  renderWmsModuleDetails(moduleCode, container);

  if (modal) modal.style.display = 'flex';
}

function renderWmsModuleDetails(moduleCode, container) {
  if (!container) container = document.getElementById('wms-module-items-container');
  if (!container) return;

  const locations = getWmsLocations().filter(loc => loc.module_code === moduleCode && loc.quantity > 0);

  if (locations.length === 0) {
    container.innerHTML = `
      <div class="location-empty-state">
        <strong>Módulo Vacío</strong>
        <p>No hay productos almacenados en ${moduleCode}. Podés ingresar o transferir stock hacia este módulo.</p>
      </div>
    `;
    return;
  }

  // Group by Human Level (5 to 1)
  const levelGroups = {};
  for (let lvl = 5; lvl >= 1; lvl--) {
    levelGroups[lvl] = locations.filter(loc => Number(loc.human_level) === lvl);
  }

  let html = '';
  for (let lvl = 5; lvl >= 1; lvl--) {
    const items = levelGroups[lvl];
    if (!items || items.length === 0) continue;

    html += `
      <div style="margin-bottom: 16px; border: 1px solid var(--vendor-line); border-radius: 14px; overflow: hidden; background: #fff;">
        <div style="background: rgba(62,95,31,0.08); padding: 10px 16px; border-bottom: 1px solid var(--vendor-line); display: flex; justify-content: space-between; align-items: center;">
          <span class="wms-level-badge">
            🏢 ${getHumanLevelLabel(lvl)}
          </span>
          <span style="font-size: 0.8rem; font-weight: 700; color: var(--vendor-muted);">${items.length} ítem(s) en este nivel</span>
        </div>
        <div style="padding: 12px; display: grid; gap: 10px;">
          ${items.map(item => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border: 1px solid rgba(0,0,0,0.06); border-radius: 12px; background: #faf8f2; gap: 12px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <img src="${item.image_url || 'assets/logo.jpg'}" alt="${item.name}" style="width: 48px; height: 48px; object-fit: contain; border-radius: 8px; background: #fff; border: 1px solid var(--vendor-line);">
                <div>
                  <h5 style="margin:0 0 4px 0; color: var(--vendor-forest); font-size: 0.98rem; font-weight: 700;">${item.name}</h5>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="wms-sector-badge">Sector ${getHumanSectorLabel(item.sector_position)}</span>
                    <span style="font-size: 0.78rem; color: var(--vendor-muted);">SKU: ${item.product_code}</span>
                  </div>
                </div>
              </div>
              <div style="text-align: right; display: flex; align-items: center; gap: 14px;">
                <div>
                  <span style="font-size: 1.2rem; font-weight: 800; color: var(--vendor-forest); display: block;">${item.available} u.</span>
                  <small style="color: var(--vendor-muted); font-size: 0.75rem;">Disponibles · ${item.quantity} físicas · ${item.reserved} reservadas</small>
                </div>
                ${item.available > 0 && canOperateWms() ? `
                  <button type="button" class="wms-btn wms-btn-primary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="openWmsTransferModal('${moduleCode}', '${item.product_id}', ${item.human_level}, '${item.sector_position}')">
                    ⇄ Mover
                  </button>
                ` : '<span class="wms-sector-badge">Sin saldo transferible</span>'}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function openWmsTransferModal(originModuleCode, productId, humanLevel, sectorPos) {
  if (!canOperateWms()) {
    showToast('🔒 Sólo administración, supervisión o depósito pueden transferir stock.');
    return;
  }
  const modal = document.getElementById('wms-transfer-modal');
  const productNameEl = document.getElementById('wms-tr-product-name');
  const originLabelEl = document.getElementById('wms-tr-origin-label');
  const availableLabelEl = document.getElementById('wms-tr-available-label');
  const qtyInput = document.getElementById('wms-tr-qty');
  const destSelect = document.getElementById('wms-tr-dest-module');

  const locations = getWmsLocations();
  const targetLoc = locations.find(loc => 
    loc.module_code === originModuleCode &&
    loc.product_id === productId &&
    Number(loc.human_level) === Number(humanLevel) &&
    String(loc.sector_position).toUpperCase() === String(sectorPos).toUpperCase()
  );

  if (!targetLoc) {
    showToast('❌ No se encontró el ítem origen en la ubicación seleccionada.');
    return;
  }

  if (productNameEl) productNameEl.textContent = targetLoc.name;
  if (originLabelEl) originLabelEl.textContent = `Origen: ${originModuleCode} (${getHumanLevelLabel(targetLoc.human_level)} / Sector ${getHumanSectorLabel(targetLoc.sector_position)})`;
  if (availableLabelEl) availableLabelEl.textContent = `Disponible para mover: ${targetLoc.available} u. (${targetLoc.reserved} reservadas)`;

  if (qtyInput) {
    qtyInput.max = targetLoc.available;
    qtyInput.value = 1;
  }

  // Populate Destination Modules
  if (destSelect) {
    const modules = getWmsModules();
    destSelect.innerHTML = modules.map(m => `
      <option value="${m.id}" ${m.id === targetLoc.location_id ? 'disabled' : ''}>${m.code} — ${m.sector_name} (${m.wall_code})</option>
    `).join('');

    const availableModule = modules.find(m => m.id !== targetLoc.location_id);
    if (availableModule) destSelect.value = availableModule.id;
  }

  window._wmsCurrentTransferOrigin = {
    originModuleCode,
    productId,
    humanLevel: Number(humanLevel),
    sectorPos: String(sectorPos).toUpperCase(),
    originLocationId: targetLoc.location_id,
    maxQty: targetLoc.available,
    item: targetLoc,
    idempotencyKey: `inventory-transfer:${targetLoc.product_id}:${globalThis.crypto?.randomUUID?.() || Date.now()}`
  };

  const resultCard = document.getElementById('wms-transfer-result-card');
  const form = document.getElementById('wms-transfer-form');
  if (resultCard) resultCard.style.display = 'none';
  if (form) form.style.display = 'block';

  if (modal) modal.style.display = 'flex';
}

function triggerWmsTransferFromCurrentModule() {
  const locations = getWmsLocations().filter(loc => loc.module_code === currentWmsModuleCode && loc.available > 0);
  if (locations.length === 0) {
    showToast('El módulo actual está vacío.');
    return;
  }
  const first = locations[0];
  openWmsTransferModal(currentWmsModuleCode, first.product_id, first.human_level, first.sector_position);
}

async function handleWmsTransferSubmit(event) {
  event.preventDefault();
  const originState = window._wmsCurrentTransferOrigin;
  if (!originState) return;

  const qtyInput = document.getElementById('wms-tr-qty');
  const destSelect = document.getElementById('wms-tr-dest-module');
  const transferQty = Number(qtyInput?.value) || 0;
  const destinationLocationId = String(destSelect?.value || '').trim();
  const destination = getWmsModules().find(module => module.id === destinationLocationId);
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;

  if (transferQty <= 0) {
    showToast('❌ La cantidad a mover debe ser mayor a cero.');
    return;
  }

  if (transferQty > originState.maxQty) {
    showToast(`❌ Stock insuficiente en origen: sólo quedan ${originState.maxQty} unidades.`);
    return;
  }

  if (!destination || destinationLocationId === originState.originLocationId) {
    showToast('❌ Seleccioná una ubicación central de destino distinta del origen.');
    return;
  }

  if (!window.OperationalApi || !supabaseClient || !canOperateWms(context)) {
    showToast('🔒 Sólo administración, supervisión o depósito pueden registrar transferencias.');
    return;
  }

  const submitButton = event.currentTarget?.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
    await window.OperationalApi.transferInventory({
      supabaseClient,
      authContext: context,
      productId: originState.productId,
      originLocationId: originState.originLocationId,
      destinationLocationId,
      quantity: transferQty,
      notes: `Transferencia WMS ${originState.originModuleCode} → ${destination.code}`,
      idempotencyKey: originState.idempotencyKey
    });
    await loadWmsInventoryData(true);

    const form = document.getElementById('wms-transfer-form');
    const resultCard = document.getElementById('wms-transfer-result-card');
    if (form) form.style.display = 'none';

    if (resultCard) {
      resultCard.style.display = 'block';
      resultCard.innerHTML = `
        <div class="wms-receipt-card">
          <div class="wms-receipt-title">✅ MOVIMIENTO COMPLETADO</div>
          <div class="wms-receipt-row"><span>Producto:</span><strong>${originState.item.name}</strong></div>
          <div class="wms-receipt-row"><span>Cantidad:</span><strong>${transferQty} unidades</strong></div>
          <div class="wms-receipt-row"><span>Origen:</span><strong>${originState.originModuleCode} (${getHumanLevelLabel(originState.humanLevel)})</strong></div>
          <div class="wms-receipt-row"><span>Destino:</span><strong>${destination.code}</strong></div>
          <div class="wms-receipt-row"><span>Operador:</span><strong>${context.userId}</strong></div>
          <div class="wms-receipt-row"><span>Fecha / Hora:</span><strong>${new Date().toLocaleTimeString()}</strong></div>
          <button type="button" class="wms-btn wms-btn-primary" style="width: 100%; margin-top: 16px;" onclick="closeWmsModal('wms-transfer-modal'); openWmsModuleModal('${destination.code}');">
            👁️ VER CONTENIDO DEL DESTINO (${destination.code})
          </button>
        </div>
      `;
    }

    showToast(`✅ Transferidos ${transferQty} u. a ${destination.code}`);
  } catch (error) {
    console.error('Error al ejecutar transferencia WMS:', error);
    showToast(`❌ Error: ${error.message}`);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function openWmsReverseSearchModal() {
  const modal = document.getElementById('wms-reverse-search-modal');
  if (modal) modal.style.display = 'flex';
  runWmsReverseSearch();
}

function runWmsReverseSearch() {
  const input = document.getElementById('wms-rev-input');
  const container = document.getElementById('wms-rev-results-container');
  if (!container) return;

  const query = String(input?.value || '').trim().toLowerCase();
  const locations = getWmsLocations().filter(loc => loc.quantity > 0);

  let filtered = locations;
  if (query) {
    filtered = locations.filter(loc => 
      loc.name.toLowerCase().includes(query) ||
      loc.product_code.toLowerCase().includes(query) ||
      (loc.barcode && loc.barcode.includes(query)) ||
      loc.module_code.toLowerCase().includes(query)
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="location-empty-state">
        <p>No se encontraron ubicaciones físicas para "${query}".</p>
      </div>
    `;
    return;
  }

  // Group by Product
  const groupedByProduct = new Map();
  filtered.forEach(loc => {
    if (!groupedByProduct.has(loc.product_id)) {
      groupedByProduct.set(loc.product_id, {
        productId: loc.product_id,
        name: loc.name,
        code: loc.product_code,
        image: loc.image_url,
        locations: []
      });
    }
    groupedByProduct.get(loc.product_id).locations.push(loc);
  });

  container.innerHTML = Array.from(groupedByProduct.values()).map(prod => {
    const totalPhysicalStock = prod.locations.reduce((acc, curr) => acc + Number(curr.quantity), 0);
    return `
      <div style="border: 1px solid var(--vendor-line); border-radius: 16px; padding: 16px; margin-bottom: 14px; background: #fff;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(0,0,0,0.06); padding-bottom: 10px; margin-bottom: 12px;">
          <div>
            <h4 style="margin: 0 0 4px 0; color: var(--vendor-forest); font-size: 1.1rem; font-weight: 800;">${prod.name}</h4>
            <span style="font-size: 0.8rem; color: var(--vendor-muted);">SKU: ${prod.code}</span>
          </div>
          <div style="text-align: right;">
            <span class="wms-sync-badge" style="font-size: 0.85rem; padding: 6px 12px;">
              📦 STOCK FÍSICO LOCALIZADO: ${totalPhysicalStock} u.
            </span>
          </div>
        </div>

        <div style="display: grid; gap: 8px;">
          ${prod.locations.map(loc => `
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,253,246,0.9); padding: 8px 12px; border-radius: 10px; border: 1px solid rgba(0,0,0,0.05);">
              <div>
                <strong style="color: var(--vendor-forest); font-size: 0.95rem;">${loc.module_code}</strong>
                <span class="wms-level-badge" style="margin-left: 8px; font-size: 0.76rem;">${getHumanLevelLabel(loc.human_level)}</span>
                <span class="wms-sector-badge" style="margin-left: 4px; font-size: 0.74rem;">Sector ${getHumanSectorLabel(loc.sector_position)}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <strong style="font-size: 1.05rem; color: var(--vendor-forest);">${loc.quantity} u.</strong>
                <button type="button" class="wms-btn" style="padding: 4px 8px; font-size: 0.78rem;" onclick="closeWmsModal('wms-reverse-search-modal'); openWmsModuleModal('${loc.module_code}');">
                  Ir al módulo
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function openWmsAuditModal(moduleCode) {
  currentWmsModuleCode = moduleCode;
  const modal = document.getElementById('wms-audit-modal');
  const title = document.getElementById('wms-audit-title');
  const container = document.getElementById('wms-audit-items-list');
  window._wmsCurrentAuditBatchId = globalThis.crypto?.randomUUID?.() || `${Date.now()}`;

  if (title) title.textContent = `Auditando Módulo ${moduleCode}`;

  const locations = getWmsLocations().filter(loc => loc.module_code === moduleCode && loc.quantity > 0);

  if (!container) return;

  if (locations.length === 0) {
    container.innerHTML = `
      <div class="location-empty-state">
        <p>No hay productos esperados en este módulo para auditar.</p>
      </div>
    `;
  } else {
    container.innerHTML = locations.map((loc, idx) => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border: 1px solid var(--vendor-line); border-radius: 12px; margin-bottom: 8px; background: #fff;">
        <div>
          <strong style="color: var(--vendor-forest); display: block; font-size: 0.95rem;">${loc.name}</strong>
          <span style="font-size: 0.78rem; color: var(--vendor-muted);">${getHumanLevelLabel(loc.human_level)} (${getHumanSectorLabel(loc.sector_position)})</span>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 0.85rem; color: var(--vendor-muted);">Esperado: <strong>${loc.quantity} u.</strong></span>
          <label style="font-size: 0.8rem; font-weight: 700;">Real:
            <input type="number" id="wms-audit-qty-${idx}" data-product-id="${loc.product_id}" data-expected="${loc.quantity}" data-level="${loc.human_level}" data-sector="${loc.sector_position}" value="${loc.quantity}" min="0" step="1" style="width: 70px; padding: 4px 8px; border-radius: 8px; border: 1px solid var(--vendor-line); font-weight: 800; text-align: center;">
          </label>
        </div>
      </div>
    `).join('');
  }

  const notice = document.getElementById('wms-audit-result-notice');
  if (notice) notice.style.display = 'none';

  if (modal) modal.style.display = 'flex';
}

function triggerWmsAuditFromCurrentModule() {
  openWmsAuditModal(currentWmsModuleCode);
}

async function submitWmsAuditWithStatus(forcedStatus) {
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  const locations = getWmsLocations().filter(loc => loc.module_code === currentWmsModuleCode && loc.quantity > 0);
  if (!window.OperationalApi || !supabaseClient || !canOperateWms(context)) {
    showToast('🔒 Sólo administración, supervisión o depósito pueden registrar conteos.');
    return;
  }
  if (locations.length === 0) {
    showToast('No hay saldos centrales en esta ubicación para contar.');
    return;
  }

  const items = locations.map((location, index) => {
    const input = document.getElementById(`wms-audit-qty-${index}`);
    const countedQuantity = input ? Number(input.value) : location.quantity;
    return { location, countedQuantity };
  });
  if (items.some(item => !Number.isFinite(item.countedQuantity) || item.countedQuantity < 0)) {
    showToast('❌ Todos los conteos deben ser números iguales o mayores que cero.');
    return;
  }

  const batchId = window._wmsCurrentAuditBatchId || globalThis.crypto?.randomUUID?.() || `${Date.now()}`;
  try {
    await Promise.all(items.map(({ location, countedQuantity }, index) => window.OperationalApi.submitInventoryCount({
      supabaseClient,
      authContext: context,
      productId: location.product_id,
      locationId: location.location_id,
      countedQuantity,
      notes: `Conteo WMS ${currentWmsModuleCode} · declaración ${forcedStatus || 'PENDIENTE_APROBACION'}`,
      idempotencyKey: `inventory-count:${batchId}:${index}`
    })));

    const notice = document.getElementById('wms-audit-result-notice');
    if (notice) {
      notice.style.display = 'block';
      notice.innerHTML = `
        <strong>📋 Conteo central registrado:</strong>
        Se enviaron ${items.length} controles de ${currentWmsModuleCode} para revisión.
        <br><small><strong>REGLA DE SEGURIDAD:</strong> el conteo no modifica stock; un supervisor debe revisarlo y cualquier ajuste queda en el ledger.</small>
      `;
    }
    showToast(`📋 Conteo de ${currentWmsModuleCode} enviado a supervisión.`);
  } catch (error) {
    console.error('No se pudo registrar el conteo WMS:', error);
    showToast(`❌ No se pudo registrar el conteo: ${error.message}`);
  }
}

async function handleWmsAuditSubmit(event) {
  event.preventDefault();
  await submitWmsAuditWithStatus('PENDIENTE_APROBACION');
}

async function reviewWmsInventoryCount(countId, decision) {
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  const normalizedDecision = String(decision || '').trim().toUpperCase();
  if (!window.OperationalApi || !supabaseClient || !context?.isVerified || !['ADMIN', 'SUPERVISOR'].includes(context.role)) {
    showToast('🔒 Sólo administración o supervisión pueden resolver conteos.');
    return;
  }
  const count = canonicalWmsCounts.find(item => item.count_id === countId && item.review_status === 'PENDING_REVIEW');
  if (!count || !['APPROVE', 'REJECT'].includes(normalizedDecision)) {
    showToast('El conteo ya fue resuelto o no es válido.');
    return;
  }
  const reason = window.prompt(
    normalizedDecision === 'APPROVE'
      ? `Motivo de aprobación. La diferencia ${count.difference} se aplicará al stock central:`
      : 'Motivo del rechazo del conteo:'
  );
  if (!String(reason || '').trim()) {
    showToast('La revisión requiere un motivo auditable.');
    return;
  }
  try {
    await window.OperationalApi.reviewInventoryCount({
      supabaseClient,
      authContext: context,
      countId,
      decision: normalizedDecision,
      reason,
      idempotencyKey: `inventory-count-review:${countId}:${globalThis.crypto?.randomUUID?.() || Date.now()}`
    });
    showToast(normalizedDecision === 'APPROVE' ? '✅ Conteo aprobado y conciliado.' : 'Conteo rechazado sin modificar stock.');
    await openWmsMovementsHistoryModal();
    await loadStoreMapData(true);
  } catch (error) {
    console.error('No se pudo revisar el conteo WMS:', error);
    showToast(`❌ No se pudo resolver el conteo: ${error.message}`);
  }
}

async function openWmsMovementsHistoryModal() {
  const modal = document.getElementById('wms-history-modal');
  const container = document.getElementById('wms-history-table-container');

  await loadWmsInventoryData(true);

  const movements = getWmsMovements();

  if (!container) return;

  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  const canReviewCounts = ['ADMIN', 'SUPERVISOR'].includes(context?.role);
  const countsHtml = canonicalWmsCounts.length ? `
    <section style="margin-bottom: 22px;">
      <h4 style="margin: 0 0 10px; color: var(--vendor-forest);">Conteos y supervisión</h4>
      <div style="display: grid; gap: 8px;">
        ${canonicalWmsCounts.map(count => `
          <article style="border: 1px solid var(--vendor-line); border-radius: 12px; padding: 12px; background: #fff;">
            <div style="display: flex; justify-content: space-between; gap: 12px; align-items: center;">
              <div>
                <strong>${escapeStockHtml(count.product_name)}</strong>
                <small style="display: block; color: var(--vendor-muted);">${escapeStockHtml(count.location_code)} · esperado ${count.expected_on_hand} · contado ${count.counted_quantity} · diferencia ${count.difference}</small>
                <small style="display: block; color: var(--vendor-muted);">${new Date(count.submitted_at).toLocaleString()} · ${escapeStockHtml(count.review_status)}</small>
              </div>
              ${count.review_status === 'PENDING_REVIEW' && canReviewCounts ? `
                <div style="display: flex; gap: 6px;">
                  <button type="button" class="wms-btn wms-btn-primary" onclick="reviewWmsInventoryCount('${count.count_id}', 'APPROVE')">Aprobar</button>
                  <button type="button" class="wms-btn wms-btn-warning" onclick="reviewWmsInventoryCount('${count.count_id}', 'REJECT')">Rechazar</button>
                </div>
              ` : ''}
            </div>
          </article>
        `).join('')}
      </div>
    </section>
  ` : '<div class="location-empty-state"><p>No hay conteos centrales registrados.</p></div>';

  const movementsHtml = movements.length ? `
    <section>
      <h4 style="margin: 0 0 10px; color: var(--vendor-forest);">Ledger de inventario</h4>
      <table style="width: 100%; border-collapse: collapse; font-size: 0.86rem; text-align: left;">
        <thead>
          <tr style="background: rgba(62,95,31,0.1); border-bottom: 2px solid var(--vendor-line); color: var(--vendor-forest);">
            <th style="padding: 10px;">Fecha / Hora</th>
            <th style="padding: 10px;">Tipo</th>
            <th style="padding: 10px;">Producto</th>
            <th style="padding: 10px;">Cantidad</th>
            <th style="padding: 10px;">Origen ➔ Destino</th>
            <th style="padding: 10px;">Operador</th>
          </tr>
        </thead>
        <tbody>
          ${movements.map(m => `
            <tr style="border-bottom: 1px solid rgba(0,0,0,0.05);">
              <td style="padding: 10px; color: var(--vendor-muted);">${new Date(m.timestamp || Date.now()).toLocaleTimeString()}</td>
              <td style="padding: 10px;"><span class="wms-level-badge" style="font-size: 0.72rem;">${m.movement_type}</span></td>
              <td style="padding: 10px; font-weight: 700; color: var(--vendor-forest);">${m.product_name}</td>
              <td style="padding: 10px; font-weight: 800;">${m.quantity} u.</td>
              <td style="padding: 10px;">${m.origin_module_code || '-'} ➔ ${m.destination_module_code || '-'}</td>
              <td style="padding: 10px;">${m.user_name}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>
  ` : '<div class="location-empty-state"><p>No hay movimientos centrales registrados.</p></div>';

  container.innerHTML = countsHtml + movementsHtml;

  if (modal) modal.style.display = 'flex';
}

// Global WMS Exports
window.getHumanLevelLabel = getHumanLevelLabel;
window.getHumanSectorLabel = getHumanSectorLabel;
window.renderWmsModulesGrid = renderWmsModulesGrid;
window.openWmsQrScannerModal = openWmsQrScannerModal;
window.confirmWmsQrScanFromSelect = confirmWmsQrScanFromSelect;
window.openWmsModuleModal = openWmsModuleModal;
window.openWmsTransferModal = openWmsTransferModal;
window.triggerWmsTransferFromCurrentModule = triggerWmsTransferFromCurrentModule;
window.handleWmsTransferSubmit = handleWmsTransferSubmit;
window.openWmsReverseSearchModal = openWmsReverseSearchModal;
window.runWmsReverseSearch = runWmsReverseSearch;
window.openWmsAuditModal = openWmsAuditModal;
window.triggerWmsAuditFromCurrentModule = triggerWmsAuditFromCurrentModule;
window.submitWmsAuditWithStatus = submitWmsAuditWithStatus;
window.handleWmsAuditSubmit = handleWmsAuditSubmit;
window.reviewWmsInventoryCount = reviewWmsInventoryCount;
window.openWmsMovementsHistoryModal = openWmsMovementsHistoryModal;
window.openMovementsHistoryModal = openWmsMovementsHistoryModal;
window.closeWmsModal = closeWmsModal;

/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — FASE 7 UI INTEGRATION
   ========================================================================== */

function updateSaasHeaderUI() {
  if (typeof SaasAuth === 'undefined') return;
  const ctx = SaasAuth.getTenantContext();

  const tenantNameEl = document.getElementById('saas-active-tenant-name');
  const tenantSelectEl = document.getElementById('saas-tenant-switcher');
  const userNameEl = document.getElementById('saas-active-user-name');
  const userRoleEl = document.getElementById('saas-active-user-role');
  const activeVendorBadge = document.getElementById('active-vendor-display-name');

  if (tenantNameEl) {
    if (ctx.isSuperadmin && tenantSelectEl) {
      tenantNameEl.style.display = 'none';
      tenantSelectEl.style.display = 'inline-block';
      tenantSelectEl.value = ctx.tenantId;
    } else {
      tenantNameEl.style.display = 'inline-block';
      if (tenantSelectEl) tenantSelectEl.style.display = 'none';
      tenantNameEl.textContent = ctx.tenantName;
    }
  }

  if (userNameEl) userNameEl.textContent = ctx.userName;
  if (userRoleEl) {
    userRoleEl.textContent = ctx.role;
    userRoleEl.style.background = ctx.isSuperadmin ? '#7b1fa2' : 'var(--vendor-forest)';
  }

  if (activeVendorBadge) {
    activeVendorBadge.textContent = `🧑‍💼 ${ctx.userName} (${ctx.tenantName})`;
  }

  // Aplicación limpia de tema, colores y terminología del tenant activo
  if (typeof TenantTheme !== 'undefined') {
    TenantTheme.applyTenantTheme(ctx.tenantId);
  }
}

async function openSaasLoginModal() {
  return reconnectVendorSession();
}

async function handleSaasLoginSubmit(event) {
  event.preventDefault();
  closeWmsModal('saas-login-modal');
  return reconnectVendorSession();
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    updateSaasHeaderUI();
  }, 300);
});

window.updateSaasHeaderUI = updateSaasHeaderUI;
window.openSaasLoginModal = openSaasLoginModal;
window.handleSaasLoginSubmit = handleSaasLoginSubmit;

/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — FASE 8 UI INTEGRATION (WHITE-LABEL & RUBROS)
   ========================================================================== */

function handleTenantVerticalChange(verticalCode) {
  const container = document.getElementById('tenant-dynamic-schema-container');
  const titleEl = document.getElementById('tenant-dynamic-vertical-title');
  const previewVerticalEl = document.getElementById('tenant-preview-vertical-name');

  if (typeof BusinessVerticals !== 'undefined') {
    const vertical = BusinessVerticals.getVertical(verticalCode);
    if (container) {
      container.innerHTML = BusinessVerticals.renderDynamicFormFields(verticalCode);
    }
    if (titleEl) titleEl.textContent = vertical.name;
    if (previewVerticalEl) previewVerticalEl.textContent = vertical.name;
  }
  handleTenantProfileDraftPreview();
}

function handleTenantProfileDraftPreview() {
  const brandName = document.getElementById('tenant-input-brand-name')?.value || 'BÔ Grow Club';
  const slogan = document.getElementById('tenant-input-slogan')?.value || '';
  const primaryColor = document.getElementById('tenant-input-primary-color')?.value || '#152D24';
  const accentColor = document.getElementById('tenant-input-accent-color')?.value || '#C2A246';
  const verticalCode = document.getElementById('tenant-input-vertical')?.value || 'growshop';

  const previewCard = document.getElementById('tenant-preview-card');
  const previewName = document.getElementById('tenant-preview-brand-name');
  const previewSlogan = document.getElementById('tenant-preview-slogan');
  const previewBadge = document.getElementById('tenant-preview-badge');

  if (previewCard) {
    previewCard.style.background = primaryColor;
    previewCard.style.borderColor = accentColor;
  }
  if (previewName) {
    previewName.textContent = brandName;
    previewName.style.color = accentColor;
  }
  if (previewSlogan) previewSlogan.textContent = slogan;
  if (previewBadge) previewBadge.textContent = 'ESTADO: BORRADOR EN PREVIEW';

  if (typeof TenantTheme !== 'undefined') {
    TenantTheme.previewDraftTheme({ brand_name: brandName, primary_color: primaryColor, accent_color: accentColor, vertical_code: verticalCode });
  }
}

function handleTenantLogoFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const previewImg = document.getElementById('tenant-preview-logo');
    if (previewImg) previewImg.src = e.target.result;
    showToast(`📁 Archivo de logo cargado: ${file.name}`);
  };
  reader.readAsDataURL(file);
}

function handleTenantProfileSubmit(event) {
  event.preventDefault();
  const ctx = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : { tenantId: '11111111-1111-1111-1111-111111111111' };

  const brandName = document.getElementById('tenant-input-brand-name')?.value;
  const primaryColor = document.getElementById('tenant-input-primary-color')?.value;
  const accentColor = document.getElementById('tenant-input-accent-color')?.value;
  const verticalCode = document.getElementById('tenant-input-vertical')?.value;

  if (typeof TenantTheme !== 'undefined') {
    TenantTheme.saveDraft(ctx.tenantId, { brand_name: brandName, primary_color: primaryColor, accent_color: accentColor, vertical_code: verticalCode });
    TenantTheme.publishBranding(ctx.tenantId);
  }

  const previewBadge = document.getElementById('tenant-preview-badge');
  if (previewBadge) previewBadge.textContent = 'ESTADO: PUBLICADO EN PRODUCCIÓN';

  showToast(`⚡ Cambios de marca y rubro (${verticalCode.toUpperCase()}) publicados correctamente para ${brandName}!`);
}

window.handleTenantVerticalChange = handleTenantVerticalChange;
window.handleTenantProfileDraftPreview = handleTenantProfileDraftPreview;
window.handleTenantLogoFileSelect = handleTenantLogoFileSelect;
window.handleTenantProfileSubmit = handleTenantProfileSubmit;

/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — FASE 9 UI INTEGRATION (MIGRATION WIZARD)
   ========================================================================== */

function startNewMigrationWizard() {
  if (typeof MigrationCenter === 'undefined') return;
  const ctx = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : { tenantId: '11111111-1111-1111-1111-111111111111', userName: 'Profesor Franco' };
  MigrationCenter.initWizard(ctx.tenantId, ctx.userName);
  renderMigrationWizardStep(1);
}

function selectMigrationType(type) {
  if (typeof MigrationCenter === 'undefined' || !MigrationCenter.activeJob) return;
  MigrationCenter.activeJob.type = type;
  showToast(`📁 Tipo de migración seleccionado: ${type}`);
  navigateWizardStep(1);
}

function renderMigrationWizardStep(step) {
  if (typeof MigrationCenter === 'undefined') return;
  MigrationCenter.currentStep = step;

  const badgeEl = document.getElementById('wizard-step-badge');
  const titleEl = document.getElementById('wizard-step-title');
  const bodyEl = document.getElementById('wizard-step-body');
  const prevBtn = document.getElementById('wizard-btn-prev');

  if (badgeEl) badgeEl.textContent = `PASO ${step} DE 8`;
  if (prevBtn) prevBtn.style.display = step > 1 ? 'inline-block' : 'none';

  if (!bodyEl) return;

  if (step === 1) {
    if (titleEl) titleEl.textContent = 'Selección del Tipo de Migración';
    bodyEl.innerHTML = `
      <p style="font-size: 0.9rem; color: var(--vendor-muted); margin-bottom: 16px;">Seleccioná qué tipo de información querés importar a tu empresa:</p>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div style="border: 2px solid var(--vendor-gold); border-radius: 14px; padding: 18px; cursor: pointer; background: #faf8f2;" onclick="selectMigrationType('CATALOG_INTERNAL')">
          <div style="font-size: 1.8rem; margin-bottom: 8px;">📦</div>
          <h4 style="margin: 0 0 6px 0; color: var(--vendor-forest);">Catálogo Interno de Productos</h4>
          <p style="margin: 0; font-size: 0.82rem; color: var(--vendor-muted);">Alta masiva de SKUs, precios públicos, marcas, presentaciones y descripciones.</p>
        </div>
        <div style="border: 1px solid var(--vendor-line); border-radius: 14px; padding: 18px; cursor: pointer;" onclick="selectMigrationType('CATALOG_B2B')">
          <div style="font-size: 1.8rem; margin-bottom: 8px;">🏢</div>
          <h4 style="margin: 0 0 6px 0; color: var(--vendor-forest);">Catálogo Proveedor B2B</h4>
          <p style="margin: 0; font-size: 0.82rem; color: var(--vendor-muted);">Listas de costo, productos aislados por supplier_id sin mezclar proveedores.</p>
        </div>
      </div>
    `;
  } else if (step === 2) {
    if (titleEl) titleEl.textContent = 'Carga de Archivos de Origen (Sources)';
    bodyEl.innerHTML = `
      <p style="font-size: 0.9rem; color: var(--vendor-muted); margin-bottom: 16px;">Arrastrá o seleccioná tu archivo de origen (CSV, XLSX, JSON, PDF o Imagen):</p>
      <div style="border: 2px dashed var(--vendor-gold); border-radius: 16px; padding: 32px; text-align: center; background: #faf8f2;">
        <div style="font-size: 2.5rem; margin-bottom: 8px;">📄</div>
        <h4 style="margin: 0 0 8px 0; color: var(--vendor-forest);">Subir archivo de catálogo</h4>
        <p style="font-size: 0.82rem; color: var(--vendor-muted); margin-bottom: 16px;">Soporta .csv, .xlsx, .json, .pdf, .png, .jpg (Máx 5MB). Inmunizado contra macros de Excel o scripts PDF.</p>
        <input type="file" id="migration-file-input" accept=".csv,.json,.xlsx,.pdf,image/*" onchange="handleMigrationSourceFile(event)" style="display: none;">
        <button type="button" class="wms-btn wms-btn-primary" onclick="document.getElementById('migration-file-input').click()">
          📁 Seleccionar Archivo desde la PC
        </button>
      </div>
    `;
  } else if (step === 3 || step === 4) {
    if (titleEl) titleEl.textContent = 'Análisis & Mapeo de Columnas con IA';
    const mappings = MigrationCenter.columnMappings || [];
    const rowsHtml = mappings.map((m, i) => `
      <tr>
        <td style="padding: 8px; font-weight: 700; color: var(--vendor-forest);">${m.source_column}</td>
        <td style="padding: 8px;">➔</td>
        <td style="padding: 8px;">
          <select class="b2b-search-input" style="width: 100%;">
            <option value="${m.target_column}" selected>${m.target_column.toUpperCase()}</option>
            <option value="name">NAME (Nombre Producto)</option>
            <option value="brand">BRAND (Marca)</option>
            <option value="price">PRICE (Precio)</option>
            <option value="stock">STOCK (Stock)</option>
          </select>
        </td>
      </tr>
    `).join('');

    bodyEl.innerHTML = `
      <p style="font-size: 0.9rem; color: var(--vendor-muted); margin-bottom: 12px;">La IA detectó las siguientes columnas en tu archivo y sugiere su mapeo al esquema de ${MigrationCenter.activeJob.vertical_code.toUpperCase()}:</p>
      <table class="wms-table" style="width: 100%;">
        <thead><tr style="background: rgba(21,45,36,0.06);"><th>Columna Archivo Origen</th><th>Mapeo</th><th>Atributo Destino</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
  } else if (step === 5 || step === 6) {
    if (titleEl) titleEl.textContent = 'Staging, Validación & Detección de Duplicados';
    const stagedRes = MigrationCenter.processStagingValidation(typeof currentProducts !== 'undefined' ? currentProducts : []);
    const stagedRows = stagedRes.stagedRows || [];

    const rowsHtml = stagedRows.slice(0, 5).map(r => `
      <tr>
        <td style="padding: 8px;">${r.row_number}</td>
        <td style="padding: 8px; font-weight: 700;">${r.normalized_data.name || r.normalized_data.product_code || 'Item'}</td>
        <td style="padding: 8px;">$${r.normalized_data.price || 0}</td>
        <td style="padding: 8px;"><span class="wms-level-badge" style="background: ${r.confidence >= 0.85 ? '#e8f5e9' : '#fff3e0'}; color: ${r.confidence >= 0.85 ? '#2e7d32' : '#e65100'};">${(r.confidence * 100).toFixed(0)}% Confianza</span></td>
        <td style="padding: 8px;"><span class="wms-level-badge" style="background: ${r.action === 'UPDATE' ? '#e1f5fe' : '#e8f5e9'}; color: ${r.action === 'UPDATE' ? '#0288d1' : '#2e7d32'};">${r.action}</span></td>
      </tr>
    `).join('');

    bodyEl.innerHTML = `
      <div style="display: flex; gap: 14px; margin-bottom: 16px;">
        <div style="background: #e8f5e9; border: 1px solid #c8e6c9; border-radius: 10px; padding: 12px; flex: 1;">
          <small style="color: #2e7d32; font-weight: 700;">Filas Válidas</small>
          <div style="font-size: 1.4rem; font-weight: 800; color: #2e7d32;">${stagedRes.valid}</div>
        </div>
        <div style="background: #fff3e0; border: 1px solid #ffe0b2; border-radius: 10px; padding: 12px; flex: 1;">
          <small style="color: #e65100; font-weight: 700;">Duplicados / Advertencias</small>
          <div style="font-size: 1.4rem; font-weight: 800; color: #e65100;">${stagedRes.warning}</div>
        </div>
      </div>
      <table class="wms-table" style="width: 100%;">
        <thead><tr style="background: rgba(21,45,36,0.06);"><th>Fila</th><th>Producto</th><th>Precio</th><th>Confianza IA</th><th>Acción Registrada</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
  } else if (step === 7) {
    if (titleEl) titleEl.textContent = '🔒 Puerta de Aprobación Humana (Human Approval Gatekeeper)';
    bodyEl.innerHTML = `
      <div style="background: #fff8e1; border: 2px solid #ffa000; border-radius: 14px; padding: 20px; text-align: center;">
        <div style="font-size: 2.2rem; margin-bottom: 8px;">🛡️</div>
        <h4 style="margin: 0 0 8px 0; color: #b78103;">Revisión de Seguridad Final Obligatoria</h4>
        <p style="font-size: 0.88rem; color: #5d4037; margin-bottom: 16px;">
          Estás por autorizar la importación de <strong>${MigrationCenter.stagedRows.length} filas</strong> en el catálogo de producción de tu empresa. La operación registrará un Snapshot antes de modificar la base de datos para permitir Rollback Atómico en cualquier momento.
        </p>
        <button type="button" class="wms-btn wms-btn-primary" style="padding: 12px 24px; font-size: 1rem;" onclick="executeMigrationImportApproved()">
          ⚡ APROBAR E IMPORTAR DENTRO DE PRODUCCIÓN
        </button>
      </div>
    `;
  } else if (step === 8) {
    if (titleEl) titleEl.textContent = '🎉 Importación Ejecutada con Éxito';
    bodyEl.innerHTML = `
      <div style="background: #e8f5e9; border: 2px solid #4caf50; border-radius: 14px; padding: 20px; text-align: center;">
        <div style="font-size: 2.5rem; margin-bottom: 8px;">✅</div>
        <h4 style="margin: 0 0 8px 0; color: #2e7d32;">Migración Completada</h4>
        <p style="font-size: 0.88rem; color: #1b5e20; margin-bottom: 16px;">
          Se importaron correctamente los datos en producción. Se creó la versión <strong>${MigrationCenter.activeJob.version_id || 'ver-01'}</strong>.
        </p>
        <button type="button" class="wms-btn" style="padding: 8px 16px;" onclick="triggerDemoRollback('${MigrationCenter.activeJob.version_id}')">
          ↩️ Ejecutar Rollback Atómico si fue un error
        </button>
      </div>
    `;
  }
}

function navigateWizardStep(delta) {
  if (typeof MigrationCenter === 'undefined') return;
  const nextStep = Math.min(Math.max(1, MigrationCenter.currentStep + delta), 8);
  renderMigrationWizardStep(nextStep);
}

function handleMigrationSourceFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const res = MigrationCenter.loadSourceContent(e.target.result, 'FILE_CSV', file.name);
    showToast(`📄 Archivo cargado: ${file.name} (${res.totalRows} filas detectadas)`);
    navigateWizardStep(1);
  };
  reader.readAsText(file);
}

function demoSampleCsvImport() {
  const sampleCsv = `COD_ART,DESCRIPCION,MARCA,PVP,CANT\nFER-01,Taladro Bosch GSB 13 RE 750W,Bosch,150.00,30\nFER-02,Amoladora Angular Bosch GWS 7-115,Bosch,85.00,25\nFER-03,Rotomartillo Bosch GBH 2-20 D,Bosch,210.00,20`;
  const res = MigrationCenter.loadSourceContent(sampleCsv, 'FILE_CSV', 'ferreteria_sample.csv');
  showToast(`🧪 Carga demo completada: ${res.totalRows} filas de ferretería en Staging`);
  navigateWizardStep(1);
}

function executeMigrationImportApproved() {
  const catalog = typeof currentProducts !== 'undefined' ? currentProducts : [];
  const res = MigrationCenter.approveAndExecuteImport(catalog);
  if (res.success) {
    showToast(`⚡ Importación ejecutada en producción: ${res.createdCount} creados, ${res.updatedCount} actualizados!`);
    navigateWizardStep(1);
  } else {
    showToast(`🚨 Error al importar: ${res.error}`);
  }
}

function triggerDemoRollback(versionId) {
  const catalog = typeof currentProducts !== 'undefined' ? currentProducts : [];
  const ctx = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : { tenantId: '11111111-1111-1111-1111-111111111111' };
  const res = MigrationRollback.executeRollback(versionId, ctx.tenantId, catalog);

  if (res.success) {
    showToast(`↩️ Rollback ejecutado correctamente para la versión ${versionId}`);
  } else {
    showToast(`ℹ️ ${res.error}`);
  }
}

window.startNewMigrationWizard = startNewMigrationWizard;
window.selectMigrationType = selectMigrationType;
window.navigateWizardStep = navigateWizardStep;
window.handleMigrationSourceFile = handleMigrationSourceFile;
window.demoSampleCsvImport = demoSampleCsvImport;
window.executeMigrationImportApproved = executeMigrationImportApproved;
window.triggerDemoRollback = triggerDemoRollback;

/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — FASE 10 UI INTEGRATION (ONBOARDING WIZARD)
   ========================================================================== */

function startNewTenantOnboardingWizard() {
  if (typeof TenantOnboarding === 'undefined') return;
  const ctx = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : { userName: 'Profesor Franco' };
  TenantOnboarding.initSession(ctx.userName);
  renderOnboardingWizardStep(1);
}

function autoGenerateOnboardingSlug(val) {
  const slugInput = document.getElementById('onb-input-slug');
  if (slugInput) {
    slugInput.value = String(val || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  }
}

function renderOnboardingWizardStep(step) {
  if (typeof TenantOnboarding === 'undefined') return;
  const sess = TenantOnboarding.activeSession;
  if (!sess) return;

  sess.step_current = step;

  const badgeEl = document.getElementById('onb-step-badge');
  const titleEl = document.getElementById('onb-step-title');
  const bodyEl = document.getElementById('onb-step-body');
  const prevBtn = document.getElementById('onb-btn-prev');

  if (badgeEl) badgeEl.textContent = `PASO ${step} DE 10`;
  if (prevBtn) prevBtn.style.display = step > 1 ? 'inline-block' : 'none';

  if (!bodyEl) return;

  if (step === 1) {
    if (titleEl) titleEl.textContent = 'Paso 1: Datos de la Empresa';
    bodyEl.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div>
          <label class="b2b-field-label">Nombre Comercial del Negocio *</label>
          <input type="text" id="onb-input-name" class="b2b-search-input" value="${sess.company_data.name || ''}" placeholder="Ej: Ferretería San Martín" oninput="autoGenerateOnboardingSlug(this.value)">
        </div>
        <div>
          <label class="b2b-field-label">Slug Comercial (Único) *</label>
          <input type="text" id="onb-input-slug" class="b2b-search-input" value="${sess.company_data.slug || ''}" placeholder="ferreteria-san-martin">
        </div>
        <div>
          <label class="b2b-field-label">Email de Contacto *</label>
          <input type="email" id="onb-input-email" class="b2b-search-input" value="${sess.company_data.email || ''}" placeholder="contacto@ferreteriasanmartin.com">
        </div>
        <div>
          <label class="b2b-field-label">Moneda Principal</label>
          <select id="onb-input-currency" class="b2b-search-input">
            <option value="ARS" ${sess.company_data.currency === 'ARS' ? 'selected' : ''}>Pesos Argentinos (ARS $)</option>
            <option value="USD" ${sess.company_data.currency === 'USD' ? 'selected' : ''}>Dólares Estadounidenses (USD $)</option>
          </select>
        </div>
      </div>
    `;
  } else if (step === 2) {
    if (titleEl) titleEl.textContent = 'Paso 2: Selección de Rubro (Business Vertical)';
    bodyEl.innerHTML = `
      <p style="font-size: 0.9rem; color: var(--vendor-muted); margin-bottom: 16px;">Seleccioná el rubro comercial almacenado dinámicamente en PostgreSQL:</p>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div style="border: 2px solid ${sess.vertical_data.code === 'growshop' ? 'var(--vendor-gold)' : 'var(--vendor-line)'}; border-radius: 14px; padding: 18px; cursor: pointer; background: #faf8f2;" onclick="setOnboardingVertical('growshop', 'Growshop')">
          <div style="font-size: 1.8rem; margin-bottom: 8px;">🌱</div>
          <h4 style="margin: 0 0 6px 0; color: var(--vendor-forest);">Growshop & Cultivo</h4>
          <p style="margin: 0; font-size: 0.82rem; color: var(--vendor-muted);">Medición en Watts, Volts, volumen L/ml y compatibilidad con semillas/sustratos.</p>
        </div>
        <div style="border: 2px solid ${sess.vertical_data.code === 'ferreteria' ? 'var(--vendor-gold)' : 'var(--vendor-line)'}; border-radius: 14px; padding: 18px; cursor: pointer;" onclick="setOnboardingVertical('ferreteria', 'Ferretería')">
          <div style="font-size: 1.8rem; margin-bottom: 8px;">🔧</div>
          <h4 style="margin: 0 0 6px 0; color: var(--vendor-forest);">Ferretería & Herramientas</h4>
          <p style="margin: 0; font-size: 0.82rem; color: var(--vendor-muted);">Medición en mm/pulgadas, torque Nm, voltaje y marcas industriales.</p>
        </div>
      </div>
    `;
  } else if (step === 3) {
    if (titleEl) titleEl.textContent = 'Paso 3: Branding & Perfil White-Label';
    bodyEl.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div>
          <label class="b2b-field-label">Slogan o Subtítulo del Negocio</label>
          <input type="text" id="onb-input-slogan" class="b2b-search-input" value="${sess.identity_data.slogan || ''}" placeholder="Ej: Calidad y precisión profesional">
        </div>
        <div>
          <label class="b2b-field-label">Color Primario de la Marca</label>
          <input type="color" id="onb-input-color" class="b2b-search-input" value="${sess.identity_data.theme_color || '#152d24'}" style="height: 42px; padding: 4px;">
        </div>
      </div>
    `;
  } else if (step === 4) {
    if (titleEl) titleEl.textContent = 'Paso 4: Carga de Catálogo Inicial';
    bodyEl.innerHTML = `
      <p style="font-size: 0.9rem; color: var(--vendor-muted); margin-bottom: 16px;">Elegí cómo querés inicializar el catálogo de productos:</p>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div style="border: 1px solid var(--vendor-line); border-radius: 14px; padding: 18px; cursor: pointer;" onclick="setOnboardingCatalogMode('EMPTY')">
          <div style="font-size: 1.8rem; margin-bottom: 8px;">📝</div>
          <h4 style="margin: 0 0 6px 0; color: var(--vendor-forest);">Empezar Catálogo Vacío</h4>
          <p style="margin: 0; font-size: 0.82rem; color: var(--vendor-muted);">Crear productos manualmente más adelante.</p>
        </div>
        <div style="border: 2px solid var(--vendor-gold); border-radius: 14px; padding: 18px; cursor: pointer; background: #faf8f2;" onclick="switchVendorTab('migration-center')">
          <div style="font-size: 1.8rem; margin-bottom: 8px;">🤖</div>
          <h4 style="margin: 0 0 6px 0; color: var(--vendor-forest);">Importar con Migration Center IA</h4>
          <p style="margin: 0; font-size: 0.82rem; color: var(--vendor-muted);">Usar CSV, XLSX, PDF o Imágenes escaneadas.</p>
        </div>
      </div>
    `;
  } else if (step === 7) {
    if (titleEl) titleEl.textContent = 'Paso 7: Provisión de Usuarios & Roles RBAC';
    bodyEl.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div>
          <label class="b2b-field-label">Nombre del Administrador Principal *</label>
          <input type="text" id="onb-input-admin-name" class="b2b-search-input" value="${sess.users_data.admin_name || ''}" placeholder="Ej: Juan Pérez">
        </div>
        <div>
          <label class="b2b-field-label">Email del Administrador Principal *</label>
          <input type="email" id="onb-input-admin-email" class="b2b-search-input" value="${sess.users_data.admin_email || ''}" placeholder="admin@empresa.com">
        </div>
      </div>
    `;
  } else if (step === 8) {
    if (titleEl) titleEl.textContent = 'Paso 8: Configuración del WMS & Depósito Físico';
    bodyEl.innerHTML = `
      <p style="font-size: 0.9rem; color: var(--vendor-muted); margin-bottom: 16px;">¿Este comercio requiere gestión de ubicaciones físicas por estantería / módulo / nivel?</p>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div style="border: 2px solid ${!sess.wms_data.enabled ? 'var(--vendor-gold)' : 'var(--vendor-line)'}; border-radius: 14px; padding: 18px; cursor: pointer;" onclick="setOnboardingWmsToggle(false)">
          <div style="font-size: 1.8rem; margin-bottom: 8px;">🏬</div>
          <h4 style="margin: 0 0 6px 0; color: var(--vendor-forest);">NO (Sin WMS Físico)</h4>
          <p style="margin: 0; font-size: 0.82rem; color: var(--vendor-muted);">Operación comercial simple sin mapa de depósito.</p>
        </div>
        <div style="border: 2px solid ${sess.wms_data.enabled ? 'var(--vendor-gold)' : 'var(--vendor-line)'}; border-radius: 14px; padding: 18px; cursor: pointer; background: #faf8f2;" onclick="setOnboardingWmsToggle(true)">
          <div style="font-size: 1.8rem; margin-bottom: 8px;">📦</div>
          <h4 style="margin: 0 0 6px 0; color: var(--vendor-forest);">SÍ (Habilitar WMS Físico)</h4>
          <p style="margin: 0; font-size: 0.82rem; color: var(--vendor-muted);">Crear depósitos, sectores, módulos y niveles físicos.</p>
        </div>
      </div>
    `;
  } else if (step === 9 || step === 10) {
    if (titleEl) titleEl.textContent = 'Paso 9 & 10: Checklist Pre-Activación & Confirmación Idempotente';
    const checkRes = TenantOnboarding.runPreactivationChecklist(typeof window.saasTenants !== 'undefined' ? window.saasTenants : []);
    
    bodyEl.innerHTML = `
      <div style="background: ${checkRes.valid ? '#e8f5e9' : '#ffebee'}; border: 2px solid ${checkRes.valid ? '#4caf50' : '#ef5350'}; border-radius: 14px; padding: 20px; text-align: center;">
        <div style="font-size: 2.5rem; margin-bottom: 8px;">${checkRes.valid ? '✅' : '🚨'}</div>
        <h4 style="margin: 0 0 8px 0; color: ${checkRes.valid ? '#2e7d32' : '#c62828'};">${checkRes.valid ? 'Checklist de Activación Exitoso' : 'Se encontraron bloqueos para activar'}</h4>
        <p style="font-size: 0.88rem; color: var(--vendor-muted); margin-bottom: 16px;">
          ${checkRes.valid ? 'El negocio está 100% configurado y listo para pasar de SETUP a ACTIVE.' : checkRes.errors.join('<br>')}
        </p>
        ${checkRes.valid ? `
          <button type="button" class="wms-btn wms-btn-primary" style="padding: 12px 24px; font-size: 1rem;" onclick="executeTenantActivationApproved()">
            🚀 ACTIVAR NEGOCIO EN PRODUCCIÓN
          </button>
        ` : ''}
      </div>
    `;
  }
}

function navigateOnboardingStep(delta) {
  if (typeof TenantOnboarding === 'undefined') return;
  const sess = TenantOnboarding.activeSession;
  if (!sess) return;

  // Recoger inputs del paso actual
  if (sess.step_current === 1) {
    const name = document.getElementById('onb-input-name')?.value;
    const slug = document.getElementById('onb-input-slug')?.value;
    const email = document.getElementById('onb-input-email')?.value;
  } else {
    showToast(`🚨 Error al importar: ${res.error}`);
  }
}

function triggerDemoRollback(versionId) {
  const catalog = typeof currentProducts !== 'undefined' ? currentProducts : [];
  const ctx = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : { tenantId: '11111111-1111-1111-1111-111111111111' };
  const res = MigrationRollback.executeRollback(versionId, ctx.tenantId, catalog);

  if (res.success) {
    showToast(`↩️ Rollback ejecutado correctamente para la versión ${versionId}`);
  } else {
    showToast(`ℹ️ ${res.error}`);
  }
}

window.startNewMigrationWizard = startNewMigrationWizard;
window.selectMigrationType = selectMigrationType;
window.navigateWizardStep = navigateWizardStep;
window.handleMigrationSourceFile = handleMigrationSourceFile;
window.demoSampleCsvImport = demoSampleCsvImport;
window.executeMigrationImportApproved = executeMigrationImportApproved;
window.triggerDemoRollback = triggerDemoRollback;

/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — FASE 10 UI INTEGRATION (ONBOARDING WIZARD)
   ========================================================================== */

function startNewTenantOnboardingWizard() {
  if (typeof TenantOnboarding === 'undefined') return;
  const ctx = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : { userName: 'Profesor Franco' };
  TenantOnboarding.initSession(ctx.userName);
  renderOnboardingWizardStep(1);
}

function autoGenerateOnboardingSlug(val) {
  const slugInput = document.getElementById('onb-input-slug');
  if (slugInput) {
    slugInput.value = String(val || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  }
}

function renderOnboardingWizardStep(step) {
  if (typeof TenantOnboarding === 'undefined') return;
  const sess = TenantOnboarding.activeSession;
  if (!sess) return;

  sess.step_current = step;

  const badgeEl = document.getElementById('onb-step-badge');
  const titleEl = document.getElementById('onb-step-title');
  const bodyEl = document.getElementById('onb-step-body');
  const prevBtn = document.getElementById('onb-btn-prev');

  if (badgeEl) badgeEl.textContent = `PASO ${step} DE 10`;
  if (prevBtn) prevBtn.style.display = step > 1 ? 'inline-block' : 'none';

  if (!bodyEl) return;

  if (step === 1) {
    if (titleEl) titleEl.textContent = 'Paso 1: Datos de la Empresa';
    bodyEl.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div>
          <label class="b2b-field-label">Nombre Comercial del Negocio *</label>
          <input type="text" id="onb-input-name" class="b2b-search-input" value="${sess.company_data.name || ''}" placeholder="Ej: Ferretería San Martín" oninput="autoGenerateOnboardingSlug(this.value)">
        </div>
        <div>
          <label class="b2b-field-label">Slug Comercial (Único) *</label>
          <input type="text" id="onb-input-slug" class="b2b-search-input" value="${sess.company_data.slug || ''}" placeholder="ferreteria-san-martin">
        </div>
        <div>
          <label class="b2b-field-label">Email de Contacto *</label>
          <input type="email" id="onb-input-email" class="b2b-search-input" value="${sess.company_data.email || ''}" placeholder="contacto@ferreteriasanmartin.com">
        </div>
        <div>
          <label class="b2b-field-label">Moneda Principal</label>
          <select id="onb-input-currency" class="b2b-search-input">
            <option value="ARS" ${sess.company_data.currency === 'ARS' ? 'selected' : ''}>Pesos Argentinos (ARS $)</option>
            <option value="USD" ${sess.company_data.currency === 'USD' ? 'selected' : ''}>Dólares Estadounidenses (USD $)</option>
          </select>
        </div>
      </div>
    `;
  } else if (step === 2) {
    if (titleEl) titleEl.textContent = 'Paso 2: Selección de Rubro (Business Vertical)';
    bodyEl.innerHTML = `
      <p style="font-size: 0.9rem; color: var(--vendor-muted); margin-bottom: 16px;">Seleccioná el rubro comercial almacenado dinámicamente en PostgreSQL:</p>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div style="border: 2px solid ${sess.vertical_data.code === 'growshop' ? 'var(--vendor-gold)' : 'var(--vendor-line)'}; border-radius: 14px; padding: 18px; cursor: pointer; background: #faf8f2;" onclick="setOnboardingVertical('growshop', 'Growshop')">
          <div style="font-size: 1.8rem; margin-bottom: 8px;">🌱</div>
          <h4 style="margin: 0 0 6px 0; color: var(--vendor-forest);">Growshop & Cultivo</h4>
          <p style="margin: 0; font-size: 0.82rem; color: var(--vendor-muted);">Medición en Watts, Volts, volumen L/ml y compatibilidad con semillas/sustratos.</p>
        </div>
        <div style="border: 2px solid ${sess.vertical_data.code === 'ferreteria' ? 'var(--vendor-gold)' : 'var(--vendor-line)'}; border-radius: 14px; padding: 18px; cursor: pointer;" onclick="setOnboardingVertical('ferreteria', 'Ferretería')">
          <div style="font-size: 1.8rem; margin-bottom: 8px;">🔧</div>
          <h4 style="margin: 0 0 6px 0; color: var(--vendor-forest);">Ferretería & Herramientas</h4>
          <p style="margin: 0; font-size: 0.82rem; color: var(--vendor-muted);">Medición en mm/pulgadas, torque Nm, voltaje y marcas industriales.</p>
        </div>
      </div>
    `;
  } else if (step === 3) {
    if (titleEl) titleEl.textContent = 'Paso 3: Branding & Perfil White-Label';
    bodyEl.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div>
          <label class="b2b-field-label">Slogan o Subtítulo del Negocio</label>
          <input type="text" id="onb-input-slogan" class="b2b-search-input" value="${sess.identity_data.slogan || ''}" placeholder="Ej: Calidad y precisión profesional">
        </div>
        <div>
          <label class="b2b-field-label">Color Primario de la Marca</label>
          <input type="color" id="onb-input-color" class="b2b-search-input" value="${sess.identity_data.theme_color || '#152d24'}" style="height: 42px; padding: 4px;">
        </div>
      </div>
    `;
  } else if (step === 4) {
    if (titleEl) titleEl.textContent = 'Paso 4: Carga de Catálogo Inicial';
    bodyEl.innerHTML = `
      <p style="font-size: 0.9rem; color: var(--vendor-muted); margin-bottom: 16px;">Elegí cómo querés inicializar el catálogo de productos:</p>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div style="border: 1px solid var(--vendor-line); border-radius: 14px; padding: 18px; cursor: pointer;" onclick="setOnboardingCatalogMode('EMPTY')">
          <div style="font-size: 1.8rem; margin-bottom: 8px;">📝</div>
          <h4 style="margin: 0 0 6px 0; color: var(--vendor-forest);">Empezar Catálogo Vacío</h4>
          <p style="margin: 0; font-size: 0.82rem; color: var(--vendor-muted);">Crear productos manualmente más adelante.</p>
        </div>
        <div style="border: 2px solid var(--vendor-gold); border-radius: 14px; padding: 18px; cursor: pointer; background: #faf8f2;" onclick="switchVendorTab('migration-center')">
          <div style="font-size: 1.8rem; margin-bottom: 8px;">🤖</div>
          <h4 style="margin: 0 0 6px 0; color: var(--vendor-forest);">Importar con Migration Center IA</h4>
          <p style="margin: 0; font-size: 0.82rem; color: var(--vendor-muted);">Usar CSV, XLSX, PDF o Imágenes escaneadas.</p>
        </div>
      </div>
    `;
  } else if (step === 7) {
    if (titleEl) titleEl.textContent = 'Paso 7: Provisión de Usuarios & Roles RBAC';
    bodyEl.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div>
          <label class="b2b-field-label">Nombre del Administrador Principal *</label>
          <input type="text" id="onb-input-admin-name" class="b2b-search-input" value="${sess.users_data.admin_name || ''}" placeholder="Ej: Juan Pérez">
        </div>
        <div>
          <label class="b2b-field-label">Email del Administrador Principal *</label>
          <input type="email" id="onb-input-admin-email" class="b2b-search-input" value="${sess.users_data.admin_email || ''}" placeholder="admin@empresa.com">
        </div>
      </div>
    `;
  } else if (step === 8) {
    if (titleEl) titleEl.textContent = 'Paso 8: Configuración del WMS & Depósito Físico';
    bodyEl.innerHTML = `
      <p style="font-size: 0.9rem; color: var(--vendor-muted); margin-bottom: 16px;">¿Este comercio requiere gestión de ubicaciones físicas por estantería / módulo / nivel?</p>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div style="border: 2px solid ${!sess.wms_data.enabled ? 'var(--vendor-gold)' : 'var(--vendor-line)'}; border-radius: 14px; padding: 18px; cursor: pointer;" onclick="setOnboardingWmsToggle(false)">
          <div style="font-size: 1.8rem; margin-bottom: 8px;">🏬</div>
          <h4 style="margin: 0 0 6px 0; color: var(--vendor-forest);">NO (Sin WMS Físico)</h4>
          <p style="margin: 0; font-size: 0.82rem; color: var(--vendor-muted);">Operación comercial simple sin mapa de depósito.</p>
        </div>
        <div style="border: 2px solid ${sess.wms_data.enabled ? 'var(--vendor-gold)' : 'var(--vendor-line)'}; border-radius: 14px; padding: 18px; cursor: pointer; background: #faf8f2;" onclick="setOnboardingWmsToggle(true)">
          <div style="font-size: 1.8rem; margin-bottom: 8px;">📦</div>
          <h4 style="margin: 0 0 6px 0; color: var(--vendor-forest);">SÍ (Habilitar WMS Físico)</h4>
          <p style="margin: 0; font-size: 0.82rem; color: var(--vendor-muted);">Crear depósitos, sectores, módulos y niveles físicos.</p>
        </div>
      </div>
    `;
  } else if (step === 9 || step === 10) {
    if (titleEl) titleEl.textContent = 'Paso 9 & 10: Checklist Pre-Activación & Confirmación Idempotente';
    const checkRes = TenantOnboarding.runPreactivationChecklist(typeof window.saasTenants !== 'undefined' ? window.saasTenants : []);
    
    bodyEl.innerHTML = `
      <div style="background: ${checkRes.valid ? '#e8f5e9' : '#ffebee'}; border: 2px solid ${checkRes.valid ? '#4caf50' : '#ef5350'}; border-radius: 14px; padding: 20px; text-align: center;">
        <div style="font-size: 2.5rem; margin-bottom: 8px;">${checkRes.valid ? '✅' : '🚨'}</div>
        <h4 style="margin: 0 0 8px 0; color: ${checkRes.valid ? '#2e7d32' : '#c62828'};">${checkRes.valid ? 'Checklist de Activación Exitoso' : 'Se encontraron bloqueos para activar'}</h4>
        <p style="font-size: 0.88rem; color: var(--vendor-muted); margin-bottom: 16px;">
          ${checkRes.valid ? 'El negocio está 100% configurado y listo para pasar de SETUP a ACTIVE.' : checkRes.errors.join('<br>')}
        </p>
        ${checkRes.valid ? `
          <button type="button" class="wms-btn wms-btn-primary" style="padding: 12px 24px; font-size: 1rem;" onclick="executeTenantActivationApproved()">
            🚀 ACTIVAR NEGOCIO EN PRODUCCIÓN
          </button>
        ` : ''}
      </div>
    `;
  }
}

function navigateOnboardingStep(delta) {
  if (typeof TenantOnboarding === 'undefined') return;
  const sess = TenantOnboarding.activeSession;
  if (!sess) return;

  // Recoger inputs del paso actual
  if (sess.step_current === 1) {
    const name = document.getElementById('onb-input-name')?.value;
    const slug = document.getElementById('onb-input-slug')?.value;
    const email = document.getElementById('onb-input-email')?.value;
    const currency = document.getElementById('onb-input-currency')?.value;
    TenantOnboarding.saveStepData(1, { name, slug, email, currency });
  } else if (sess.step_current === 3) {
    const slogan = document.getElementById('onb-input-slogan')?.value;
    const theme_color = document.getElementById('onb-input-color')?.value;
    TenantOnboarding.saveStepData(3, { slogan, theme_color });
  } else if (sess.step_current === 7) {
    const admin_name = document.getElementById('onb-input-admin-name')?.value;
    const admin_email = document.getElementById('onb-input-admin-email')?.value;
    TenantOnboarding.saveStepData(7, { admin_name, admin_email });
  }

  const nextStep = Math.min(Math.max(1, sess.step_current + delta), 10);
  renderOnboardingWizardStep(nextStep);
}

function setOnboardingVertical(code, name) {
  if (typeof TenantOnboarding === 'undefined') return;
  TenantOnboarding.saveStepData(2, { code, name });
  showToast(`🏬 Rubro seleccionado: ${name}`);
  renderOnboardingWizardStep(2);
}

function setOnboardingCatalogMode(mode) {
  if (typeof TenantOnboarding === 'undefined') return;
  TenantOnboarding.saveStepData(4, { mode });
  showToast(`📦 Catálogo configurado en modo: ${mode}`);
  renderOnboardingWizardStep(4);
}

function setOnboardingWmsToggle(enabled) {
  if (typeof TenantOnboarding === 'undefined') return;
  TenantOnboarding.saveStepData(8, { enabled });
  showToast(`📦 WMS Físico: ${enabled ? 'HABILITADO' : 'DESHABILITADO'}`);
  renderOnboardingWizardStep(8);
}

function saveOnboardingDraft() {
  if (typeof TenantOnboarding === 'undefined' || !TenantOnboarding.activeSession) return;
  showToast(`💾 Borrador de onboarding guardado (ID: ${TenantOnboarding.activeSession.id})`);
}

function executeTenantActivationApproved() {
  if (typeof TenantOnboarding === 'undefined') return;
  const tenantsList = typeof window.saasTenants !== 'undefined' ? window.saasTenants : [];
  const res = TenantOnboarding.activateTenant(tenantsList);

  if (res.success) {
    showToast(`🚀 Negocio "${res.tenant.name}" activado en producción correctamente!`);
    renderOnboardingWizardStep(10);
  } else {
    showToast(`🚨 Error al activar: ${res.errors ? res.errors.join(', ') : res.error}`);
  }
}

function impersonateTenantSuperadmin(tenantId) {
  if (typeof SaasAuth !== 'undefined') {
    const ok = SaasAuth.switchActiveTenant(tenantId);
    if (ok) showToast(`👁️ Superadmin impersonando Tenant ${tenantId}`);
  }
}

window.startNewTenantOnboardingWizard = startNewTenantOnboardingWizard;
window.autoGenerateOnboardingSlug = autoGenerateOnboardingSlug;
window.navigateOnboardingStep = navigateOnboardingStep;
window.setOnboardingVertical = setOnboardingVertical;
window.setOnboardingCatalogMode = setOnboardingCatalogMode;
window.setOnboardingWmsToggle = setOnboardingWmsToggle;
window.saveOnboardingDraft = saveOnboardingDraft;
window.executeTenantActivationApproved = executeTenantActivationApproved;
window.impersonateTenantSuperadmin = impersonateTenantSuperadmin;

// --- POS ITEMIZADO (VENDER UN PRODUCTO · CATÁLOGO INTERNO) ---
// POS state vars — declared at top of file

function getPosCartEngine() {
  if (!globalPosCart) {
    const EngineClass = typeof PosCartEngine !== 'undefined' ? PosCartEngine : (typeof global !== 'undefined' ? global.PosCartEngine : null);
    if (EngineClass) {
      globalPosCart = new EngineClass('POS');
    }
  }
  return globalPosCart;
}

async function loadPosRegisters() {
  const select = document.getElementById('pos-register-select');
  const status = document.getElementById('pos-register-status');
  const context = await ensureVendorOperationalSession();
  if (!select) return [];
  if (!supabaseClient || !context) {
    select.innerHTML = '<option value="">Sesión operativa requerida</option>';
    select.disabled = true;
    if (status) status.innerHTML = 'La sesión no está verificada. <button type="button" onclick="reconnectVendorSession()" style="min-height: 44px; margin-top: 6px; padding: 8px 12px; border: 1px solid #C2A246; border-radius: 10px; background: #F6F3E8; color: #152D24; font-weight: 800; cursor: pointer;">Reconectar sesión</button>';
    return [];
  }

  try {
    const [registersResult, sessionsResult] = await Promise.all([
      supabaseClient
        .from('cash_registers')
        .select('id,code,name,currency,active')
        .eq('tenant_id', context.tenantId)
        .eq('active', true)
        .order('name', { ascending: true }),
      supabaseClient
        .from('cash_sessions_v2')
        .select('id,register_id,opened_by,opened_at,status')
        .eq('tenant_id', context.tenantId)
        .eq('status', 'OPEN')
    ]);
    if (registersResult.error) throw registersResult.error;
    if (sessionsResult.error) throw sessionsResult.error;

    const openByRegister = new Map((sessionsResult.data || []).map(session => [session.register_id, session]));
    const registers = (registersResult.data || []).map(register => ({
      ...register,
      session: openByRegister.get(register.id) || null
    }));
    select.innerHTML = '<option value="">-- Seleccionar caja --</option>' + registers.map(register => {
      const sessionLabel = register.session ? 'abierta' : 'cerrada';
      return `<option value="${escapeStockHtml(register.id)}" data-session-id="${escapeStockHtml(register.session?.id || '')}">${escapeStockHtml(register.name || register.code)} · ${sessionLabel}</option>`;
    }).join('');
    const preferred = registers.find(register => register.session?.opened_by === context.userId)
      || registers.find(register => register.session)
      || registers[0];
    if (preferred) select.value = preferred.id;
    select.disabled = registers.length === 0;
    if (status) {
      status.textContent = preferred?.session
        ? `Turno abierto desde ${new Date(preferred.session.opened_at).toLocaleString('es-AR')}.`
        : 'La caja seleccionada no tiene un turno abierto; abrilo desde Caja & Arqueo antes de cobrar efectivo.';
    }
    select.onchange = () => {
      const selected = registers.find(register => register.id === select.value);
      if (status) status.textContent = selected?.session
        ? `Turno abierto desde ${new Date(selected.session.opened_at).toLocaleString('es-AR')}.`
        : 'Esta caja no tiene un turno abierto.';
    };
    return registers;
  } catch (error) {
    console.error('No se pudieron cargar las cajas operativas:', error);
    select.innerHTML = '<option value="">Cajas no disponibles</option>';
    select.disabled = true;
    if (status) status.textContent = error.message || 'No se pudieron cargar las cajas.';
    return [];
  }
}

async function initPosWorkspace() {
  const operationalContext = await ensureVendorOperationalSession({ showLogin: true });
  if (!operationalContext) return;
  populatePosSalespeople();
  await Promise.all([loadPosRegisters(), loadCanonicalCurrentAccounts(), loadExternalCatalogOffers()]);
  populatePosCurrentAccountDropdown();
  const parkedTicketsEnabled = window.AppConfig?.get('rules.pos.parkedTicketsEnabled', true) !== false;
  const parkSaleButton = document.getElementById('pos-park-sale-btn');
  if (parkSaleButton) parkSaleButton.hidden = !parkedTicketsEnabled;

  const cashierDisplay = document.getElementById('pos-cashier-display');
  if (cashierDisplay) {
    const ctx = operationalContext;
    cashierDisplay.textContent = `${ctx.userName} (${ctx.roleName})`;
    const syncB2BButton = document.getElementById('pos-sync-b2b-btn');
    if (syncB2BButton) syncB2BButton.hidden = !['ADMIN', 'SUPERVISOR', 'SUPERADMIN'].includes(String(ctx.role || '').toUpperCase());
  }

  // Carga previa o reactiva del catálogo interno
  if (!internalCatalogProducts || internalCatalogProducts.length === 0) {
    await loadInternalCatalog();
  }

  const unifiedInput = document.getElementById('pos-unified-search');
  if (unifiedInput) {
    if (!unifiedInput.dataset.listenerAttached) {
      unifiedInput.dataset.listenerAttached = 'true';

      let inputDebounce;
      unifiedInput.addEventListener('input', (e) => {
        clearTimeout(inputDebounce);
        const query = e.target.value;
        const clearBtn = document.getElementById('pos-search-clear-btn');
        if (clearBtn) clearBtn.style.display = query ? 'block' : 'none';
        renderPosSearchResults(query.trim());
        inputDebounce = setTimeout(() => {
          refreshPosExternalCatalogSearch(query, getPosExternalSourceType(), () => {
            if ((document.getElementById('pos-unified-search')?.value || '') === query) {
              renderPosSearchResults(query.trim());
            }
          }).catch(error => console.error('No se completó la búsqueda externa del POS:', error));
        }, 280);
      });

      unifiedInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          clearTimeout(inputDebounce);
          handlePosBarcodeOrDirectSearch(unifiedInput.value.trim())
            .catch(error => console.error('No se completó la búsqueda directa del POS:', error));
        }
      });
    }

    unifiedInput.value = '';
    const clearBtn = document.getElementById('pos-search-clear-btn');
    if (clearBtn) clearBtn.style.display = 'none';
    setTimeout(() => {
      unifiedInput.focus();
    }, 100);
  }

  renderPosCartItems();
  renderPosSearchResults('');
  if (typeof renderPosCashDenominations === 'function') renderPosCashDenominations();
  if (parkedTicketsEnabled && typeof loadParkedPosTickets === 'function') await loadParkedPosTickets();
  if (typeof setPosOriginFilter === 'function') setPosOriginFilter('ALL');
  if (typeof updatePosCashChangeDisplay === 'function') updatePosCashChangeDisplay();

  if (window.innerWidth <= 991) {
    switchPosWorkspaceMode('assistant');
  } else {
    switchPosWorkspaceMode('classic');
  }
}

/* ==========================================================================
   ASISTENTE GUIADO DE VENTAS MÓVIL (MODO CONVERSACIONAL Y POR VOZ)
   ========================================================================== */

let mobilePosAssistantState = {
  step: 'mode', // 'mode' | 'search' | 'quantity' | 'cart-summary' | 'payment' | 'adjustment' | 'confirm'
  mode: 'stock', // 'stock' | 'nostock' | 'express'
  selectedProduct: null,
  expressData: { name: '', category: 'Otros', price: 0 },
  nostockData: { deliveryDate: '48_hs', customDate: '', isDeposit: false, depositAmount: 0 },
  quantity: 1,
  paymentMethod: 'EFECTIVO',
  mixedCashAmount: 0,
  mixedSecondaryMethod: 'TRANSFERENCIA',
  mixedSecondaryAmount: 0,
  customerAccountId: '',
  customerAccountName: '',
  adjustmentType: 'NONE', // 'NONE' | 'DISCOUNT_PERCENT' | 'DISCOUNT_FIXED' | 'INCREASE_PERCENT' | 'INCREASE_FIXED'
  adjustmentValue: 0,
  salespersonId: '',
  salespersonName: '',
  customerWhatsApp: '',
  notes: '',
  voiceActive: false
};

const MOBILE_POS_ASSISTANT_STEPS = ['mode', 'search', 'quantity', 'cart-summary', 'payment', 'adjustment', 'confirm'];
let posVoiceRecognitionInstance = null;

function switchPosWorkspaceMode(mode) {
  const assistantEl = document.getElementById('mobile-pos-assistant');
  const classicNav = document.getElementById('pos-mobile-tabs-nav');
  const classicGrid = document.getElementById('pos-workspace-grid');
  const btnAssistant = document.getElementById('pos-mode-btn-assistant');
  const btnClassic = document.getElementById('pos-mode-btn-classic');

  if (btnAssistant) btnAssistant.classList.toggle('active', mode === 'assistant');
  if (btnClassic) btnClassic.classList.toggle('active', mode === 'classic');

  if (mode === 'assistant') {
    if (assistantEl) assistantEl.style.display = 'block';
    if (classicNav) classicNav.style.display = 'none';
    if (classicGrid) classicGrid.style.display = 'none';
    startMobilePosAssistant();
  } else {
    if (assistantEl) assistantEl.style.display = 'none';
    if (classicNav && window.innerWidth <= 991) classicNav.style.display = 'flex';
    if (classicGrid) classicGrid.style.display = 'grid';
    if (mobilePosAssistantState.voiceActive) {
      stopMobilePosVoiceAssistant();
    }
  }
}
window.switchPosWorkspaceMode = switchPosWorkspaceMode;

function startMobilePosAssistant() {
  const cart = getPosCartEngine();
  const hasItems = cart && cart.getItemCount() > 0;
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : {};
  if (!mobilePosAssistantState.salespersonId && context.userId) {
    setMobilePosSalesperson(context.userId);
  }
  mobilePosAssistantState.step = hasItems ? 'cart-summary' : 'mode';
  mobilePosAssistantState.selectedProduct = null;
  mobilePosAssistantState.quantity = 1;
  renderMobilePosAssistant();
}
window.startMobilePosAssistant = startMobilePosAssistant;

function setMobilePosAssistantStep(step) {
  if (!MOBILE_POS_ASSISTANT_STEPS.includes(step)) return;
  mobilePosAssistantState.step = step;
  renderMobilePosAssistant();
  document.getElementById('mobile-pos-assistant')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.setMobilePosAssistantStep = setMobilePosAssistantStep;

function getAllSearchableProducts() {
  const canonicalProducts = Array.isArray(internalCatalogProducts)
    ? internalCatalogProducts.filter(product => product?.source === 'catalog_products')
    : [];
  const rawList = canonicalProducts.flatMap(product => {
    if (product.track_stock === false) return [{
      ...product,
      product_id: product.id,
      line_type: 'OWN_STOCK',
      available_quantity: null
    }];
    const options = Array.isArray(product.inventory_options) ? product.inventory_options : [];
    if (options.length === 0) return [{ ...product, stock: 0, available_quantity: 0 }];
    return options.map(option => ({
      ...product,
      cart_key: `${product.id}::${option.location_id}`,
      location_id: option.location_id,
      shelf_code: option.code,
      location_name: option.name,
      stock: option.available,
      available_quantity: option.available,
      product_id: product.id,
      line_type: 'OWN_STOCK'
    }));
  });

  externalCatalogOffers.forEach(offer => {
    const lineType = offer.source_type === 'LOCAL_STORE' ? 'LOCAL_STORE_BACKORDER' : 'B2B_BACKORDER';
    rawList.push({
      id: offer.id,
      cart_key: `external::${offer.id}`,
      product_id: null,
      name: offer.name,
      price: Number(offer.retail_price || 0),
      stock: Number(offer.available_units || 0),
      available_quantity: null,
      category: offer.category || 'Catálogo Externo',
      image: offer.metadata?.image_url || 'assets/logo.jpg',
      barcode: offer.metadata?.barcode || offer.external_sku || '',
      brand: offer.metadata?.brand || '',
      presentation: offer.metadata?.presentation || '',
      product_code: offer.external_sku,
      line_type: lineType,
      source_type: offer.source_type,
      source_id: offer.id,
      catalog_source_id: offer.source_id,
      source_name: offer.source_name,
      estimated_days: Number(offer.estimated_days || 2),
      metadata: offer.metadata || {}
    });
  });

  const unique = new Map();
  rawList.forEach(p => {
    if (!p) return;
    const id = String(p.cart_key || p.product_code || p.id || p.barcode || p.name || '').trim();
    if (!id) return;
    const existing = unique.get(id);
    const stockVal = Math.max(0, Number(p.stock !== undefined ? p.stock : (p.own_stock !== undefined ? p.own_stock : (p.on_hand || 0))));
    const priceVal = Math.max(0, Number(p.price || p.sale_price || p.regular_price || 0));
    const nameVal = String(p.name || p.title || id).trim();
    const barcodeVal = String(p.barcode || '').trim();
    const codeVal = String(p.product_code || p.wms_code || id).trim();
    const categoryVal = String(p.category || 'General').trim();
    const imageVal = p.image || p.image_url || p.placement_photo_url || 'assets/logo.jpg';
    const shelfCode = p.shelf_code || p.location || '';

    if (!existing) {
      unique.set(id, {
        ...p,
        id: p.id || id,
        product_code: codeVal,
        barcode: barcodeVal,
        name: nameVal,
        price: priceVal,
        stock: stockVal,
        category: categoryVal,
        image: imageVal,
        shelf_code: shelfCode
      });
    } else {
      if (!existing.stock && stockVal > 0) existing.stock = stockVal;
      if (!existing.price && priceVal > 0) existing.price = priceVal;
      if (!existing.shelf_code && shelfCode) existing.shelf_code = shelfCode;
      if (existing.image === 'assets/logo.jpg' && imageVal !== 'assets/logo.jpg') existing.image = imageVal;
    }
  });

  return Array.from(unique.values());
}
window.getAllSearchableProducts = getAllSearchableProducts;

async function loadExternalCatalogOffers(query = '', sourceType = null) {
  const authContext = await ensureVendorOperationalSession();
  const requestId = ++externalCatalogSearchSequence;
  const normalizedQuery = String(query || '').trim().slice(0, 120);
  const normalizedSourceType = sourceType ? String(sourceType).trim().toUpperCase() : null;
  if (!window.OperationalApi?.fetchExternalCatalogOffers || !supabaseClient || !authContext) {
    if (requestId === externalCatalogSearchSequence) {
      externalCatalogOffers = [];
      externalCatalogSearchQuery = normalizedQuery;
      externalCatalogSearchSourceType = normalizedSourceType;
      externalCatalogLoadError = 'Iniciá sesión para consultar el catálogo B2B y las tiendas locales.';
    }
    return externalCatalogOffers;
  }
  try {
    const response = await window.OperationalApi.fetchExternalCatalogOffers({
      supabaseClient,
      authContext,
      query: normalizedQuery,
      sourceType: normalizedSourceType,
      limit: 120
    });
    if (requestId !== externalCatalogSearchSequence) return externalCatalogOffers;
    externalCatalogOffers = Array.isArray(response) ? response : [];
    externalCatalogSearchQuery = normalizedQuery;
    externalCatalogSearchSourceType = normalizedSourceType;
    externalCatalogLoadError = '';
    return externalCatalogOffers;
  } catch (error) {
    if (requestId !== externalCatalogSearchSequence) return externalCatalogOffers;
    externalCatalogOffers = [];
    externalCatalogSearchQuery = normalizedQuery;
    externalCatalogSearchSourceType = normalizedSourceType;
    externalCatalogLoadError = error.message || 'No se pudo cargar el catálogo externo.';
    console.error('No se pudo cargar el catálogo externo central:', error);
    return externalCatalogOffers;
  }
}
window.loadExternalCatalogOffers = loadExternalCatalogOffers;

function getExternalCatalogErrorFor(query = '', sourceType = null) {
  const normalizedQuery = String(query || '').trim().slice(0, 120);
  const normalizedSourceType = sourceType ? String(sourceType).trim().toUpperCase() : null;
  return externalCatalogSearchQuery.toLocaleLowerCase('es') === normalizedQuery.toLocaleLowerCase('es')
    && externalCatalogSearchSourceType === normalizedSourceType
    ? externalCatalogLoadError
    : '';
}

async function refreshPosExternalCatalogSearch(query, sourceType, renderer) {
  const normalizedQuery = String(query || '').trim().slice(0, 120);
  const normalizedSourceType = sourceType ? String(sourceType).trim().toUpperCase() : null;
  await loadExternalCatalogOffers(normalizedQuery, normalizedSourceType);
  if (externalCatalogSearchQuery !== normalizedQuery
      || externalCatalogSearchSourceType !== normalizedSourceType) return;
  renderer();
}

function getPosExternalSourceType() {
  if (posActiveOriginFilter === 'B2B') return 'B2B_SUPPLIER';
  if (posActiveOriginFilter === 'LOCAL_STORE') return 'LOCAL_STORE';
  return null;
}

async function syncLegacyB2BCatalogToPos(triggerButton = null) {
  if (catalogRecoveryInFlight) return;
  const authContext = await ensureVendorOperationalSession({ showLogin: true });
  if (!window.OperationalApi?.recoverLegacyCatalogs || !supabaseClient || !authContext) {
    alert('Iniciá sesión para recuperar los catálogos centrales.');
    return;
  }
  if (!['ADMIN', 'SUPERVISOR', 'SUPERADMIN'].includes(String(authContext.role || '').toUpperCase())) {
    alert('Sólo administración o supervisión puede recuperar productos y proveedores.');
    return;
  }
  catalogRecoveryInFlight = true;
  const buttons = [...new Set([document.getElementById('pos-sync-b2b-btn'), triggerButton].filter(Boolean))];
  const originalLabels = new Map(buttons.map(button => [button, button.textContent]));
  buttons.forEach(button => {
    button.disabled = true;
    button.textContent = 'Recuperando…';
  });
  try {
    const summary = await window.OperationalApi.recoverLegacyCatalogs({
      supabaseClient,
      authContext
    });
    await Promise.all([loadInternalCatalog(), loadExternalCatalogOffers('', null)]);
    if (externalCatalogLoadError) throw new Error(externalCatalogLoadError);
    if (Number(summary?.offers || 0) > 0 && externalCatalogOffers.length === 0) {
      throw new Error('La recuperación terminó, pero el catálogo B2B no pudo verificarse desde esta sesión.');
    }

    const desktopQuery = document.getElementById('pos-unified-search')?.value || '';
    const mobileQuery = document.getElementById('pos-assistant-search-input')?.value || '';
    const activeQuery = mobilePosAssistantState.mode === 'nostock' && mobilePosAssistantState.step === 'search'
      ? mobileQuery
      : desktopQuery;
    if (String(activeQuery).trim() || getPosExternalSourceType()) {
      await loadExternalCatalogOffers(activeQuery, getPosExternalSourceType());
    }
    renderPosSearchResults(desktopQuery);
    if (mobilePosAssistantState.mode === 'nostock' && mobilePosAssistantState.step === 'search') {
      renderMobilePosAssistantSearchResults(mobileQuery);
    }
    const importedCount = Number(summary?.offers || externalCatalogOffers.length || 0);
    if (window.showToast) {
      const ownCount = Number(summary?.catalog_products || 0);
      window.showToast(`✓ ${ownCount} productos físicos y ${importedCount.toLocaleString('es-AR')} ofertas B2B recuperados.`);
    }
    if (summary?.local?.reason === 'DEFAULT_LOCATION_REQUIRED') {
      alert('El B2B quedó recuperado, pero el catálogo físico necesita una ubicación principal activa antes de importar su stock.');
    }
  } catch (error) {
    console.error('No se recuperaron los catálogos:', error);
    alert(`No se recuperaron los catálogos.\n\n${error.message || 'Error desconocido'}`);
  } finally {
    catalogRecoveryInFlight = false;
    buttons.forEach(button => {
      button.disabled = false;
      button.textContent = originalLabels.get(button) || '↻ Actualizar catálogos';
    });
  }
}
window.syncLegacyB2BCatalogToPos = syncLegacyB2BCatalogToPos;

function canManageLegacyCatalogSync() {
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  return Boolean(context?.isVerified
    && ['ADMIN', 'SUPERVISOR', 'SUPERADMIN'].includes(String(context.role || '').toUpperCase()));
}

function renderLegacyCatalogSyncAction(label = 'Sincronizar catálogo B2B') {
  if (!canManageLegacyCatalogSync()) return '';
  return `
    <button type="button" class="stock-entry-secondary-btn" onclick="syncLegacyB2BCatalogToPos(this)"
      style="min-height: 44px; padding: 8px 14px; border-color: #c2a246; color: #152d24; font-weight: 800;">
      ↻ ${escapeStockHtml(label)}
    </button>
  `;
}

function renderMobilePosAssistantSearchResults(query = '') {
  const container = document.getElementById('pos-assistant-results-container');
  if (!container) return;

  const prods = getAllSearchableProducts();
  const q = String(query || '').trim().toLowerCase();
  const isNoStockMode = mobilePosAssistantState.mode === 'nostock';

  const filtered = prods.filter(p => {
    const lineType = String(p.line_type || 'OWN_STOCK').toUpperCase();
    const isExternal = lineType === 'B2B_BACKORDER' || lineType === 'LOCAL_STORE_BACKORDER';
    const hasOwnStock = !isExternal && (p.track_stock === false || Number(p.stock || 0) > 0);
    if (isNoStockMode && (hasOwnStock || (!isExternal && p.track_stock === false))) return false;
    if (!isNoStockMode && (isExternal || !hasOwnStock)) return false;
    if (!q) return true;
    const nameMatch = p.name && p.name.toLowerCase().includes(q);
    const barcodeMatch = p.barcode && p.barcode.toLowerCase() === q;
    const codeMatch = p.product_code && p.product_code.toLowerCase().includes(q);
    const catMatch = p.category && p.category.toLowerCase().includes(q);
    return nameMatch || barcodeMatch || codeMatch || catMatch;
  }).slice(0, 15);

  if (filtered.length === 0) {
    const currentExternalError = isNoStockMode ? getExternalCatalogErrorFor(query, null) : '';
    const missingExternalCatalog = isNoStockMode && !q && externalCatalogOffers.length === 0;
    const title = currentExternalError
      ? 'El catálogo externo no está disponible'
      : (missingExternalCatalog
      ? 'El catálogo para encargos todavía no está sincronizado'
      : `No se encontraron coincidencias para "${escapeStockHtml(query)}"`);
    const description = currentExternalError
      || (missingExternalCatalog
        ? 'Actualizá las fuentes históricas para recuperar proveedores y productos físicos sin duplicar datos.'
        : 'Probá escribiendo parte del nombre o ingresá el producto al catálogo central.');
    const primaryAction = currentExternalError
      ? '<button type="button" class="stock-entry-secondary-btn" onclick="retryPosExternalCatalogSearch(\'mobile\')" style="min-height: 44px; padding: 8px 14px;">&#8635; Reintentar catálogo</button>'
      : (missingExternalCatalog
      ? renderLegacyCatalogSyncAction('Recuperar catálogos')
      : `<button type="button" class="stock-entry-secondary-btn" onclick="switchVendorTab('fast-upload')" style="min-height: 44px; font-size: 0.8rem; padding: 8px 12px;">＋ Ingresar producto</button>`);
    container.innerHTML = `
      <div style="padding: 24px 16px; text-align: center; color: #6b4e2e; background: #f6f3e8; border-radius: 14px; border: 1.5px dashed #c2a246; margin-top: 10px;">
        <span style="font-size: 1.8rem; display: block; margin-bottom: 6px;">${currentExternalError ? '⚠️' : (missingExternalCatalog ? '📦' : '🔍')}</span>
        <strong style="color: #152d24; font-size: 0.92rem; display: block;">${title}</strong>
        <p style="font-size: 0.78rem; margin: 6px 0 12px 0; line-height: 1.45;">${escapeStockHtml(description)}</p>
        ${primaryAction}
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="margin-top: 10px; display: grid; gap: 8px;">
      <small style="font-size: 0.74rem; font-weight: 800; color: var(--color-accent-gold); text-transform: uppercase;">
        ${filtered.length} producto${filtered.length > 1 ? 's' : ''} visible${filtered.length > 1 ? 's' : ''} · ${q ? 'resultado de la búsqueda' : 'escribí para buscar en todo el catálogo'}:
      </small>
      ${filtered.map((p, idx) => {
        const pId = escapeStockHtml(String(p.cart_key || p.id || p.product_code));
        const safeName = escapeStockHtml(p.name || 'Producto');
        const price = Number(p.price || 0);
        const stock = Number(p.stock || 0);
        const img = p.image || 'assets/logo.jpg';
        const hasLocation = Boolean(p.shelf_code && p.shelf_code !== 'Sin ubicación' && p.shelf_code !== 'SIN_ASIGNAR');
        const lineType = String(p.line_type || 'OWN_STOCK').toUpperCase();
        const isExternal = lineType === 'B2B_BACKORDER' || lineType === 'LOCAL_STORE_BACKORDER';
        const originLabel = lineType === 'B2B_BACKORDER'
          ? `🏭 ${p.source_name || 'Proveedor B2B'}`
          : (lineType === 'LOCAL_STORE_BACKORDER' ? `🏪 ${p.source_name || 'Tienda local'}` : '🏷 Producto propio');

        return `
          <button type="button" 
                  class="pos-assistant-result-item" 
                  onclick="selectMobilePosAssistantProduct('${pId}')"
                  style="display: flex; gap: 12px; align-items: center; padding: 12px; border-radius: 14px; background: var(--color-card-bg); border: 1.5px solid var(--color-border-subtle); text-align: left; cursor: pointer; transition: all 0.2s ease; width: 100%; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
            <img src="${img}" alt="${safeName}" style="width: 48px; height: 48px; border-radius: 10px; object-fit: cover; background: #fff; flex-shrink: 0;" onerror="this.src='assets/logo.jpg'">
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                <span style="font-size: 0.72rem; color: var(--color-text-muted); font-weight: 700; text-transform: uppercase;">${escapeStockHtml(p.category || 'General')}</span>
                <span style="font-size: 0.92rem; font-weight: 900; color: var(--color-accent-gold);">$${price.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <strong style="display: block; font-size: 0.88rem; color: var(--color-text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px;">
                ${idx + 1}. ${safeName}
              </strong>
              <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px; font-size: 0.72rem;">
                <span style="color: ${isExternal ? '#1565c0' : (stock > 0 ? '#2e7d32' : '#c62828')}; font-weight: 800;">
                  ${isExternal ? `${escapeStockHtml(originLabel)} · ${Number(p.estimated_days || 2)} días` : (stock > 0 ? `🟢 ${stock} u.` : '📦 Propio sin stock')}
                </span>
                ${hasLocation ? `<span style="color: var(--color-accent-gold); font-weight: 700;">📍 ${escapeStockHtml(p.shelf_code)}</span>` : ''}
              </div>
            </div>
            <span style="color: var(--color-accent-gold); font-size: 1.2rem; font-weight: 800;">➔</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}
window.renderMobilePosAssistantSearchResults = renderMobilePosAssistantSearchResults;

function handleMobilePosAssistantSearch(query) {
  renderMobilePosAssistantSearchResults(query);
  clearTimeout(mobileExternalCatalogSearchTimer);
  mobileExternalCatalogSearchTimer = setTimeout(() => {
    refreshPosExternalCatalogSearch(query, null, () => {
      if ((document.getElementById('pos-assistant-search-input')?.value || '') === query) {
        renderMobilePosAssistantSearchResults(query);
      }
    }).catch(error => console.error('No se completó la búsqueda externa móvil:', error));
  }, 280);
}
window.handleMobilePosAssistantSearch = handleMobilePosAssistantSearch;

async function retryPosExternalCatalogSearch(target = 'desktop') {
  try {
    const isMobile = target === 'mobile';
    const inputId = isMobile ? 'pos-assistant-search-input' : 'pos-unified-search';
    const query = document.getElementById(inputId)?.value || '';
    const sourceType = isMobile ? null : getPosExternalSourceType();
    await loadExternalCatalogOffers(query, sourceType);
    if (isMobile) renderMobilePosAssistantSearchResults(query);
    else renderPosSearchResults(query);
  } catch (error) {
    console.error('No se pudo reintentar el catálogo externo:', error);
  }
}
window.retryPosExternalCatalogSearch = retryPosExternalCatalogSearch;

function selectMobilePosAssistantProduct(productId) {
  const prods = getAllSearchableProducts();
  const product = prods.find(p => String(p.cart_key) === String(productId)
    || String(p.id) === String(productId)
    || String(p.product_code) === String(productId));
  if (!product) return;

  mobilePosAssistantState.selectedProduct = product;
  mobilePosAssistantState.quantity = 1;
  setMobilePosAssistantStep('quantity');

  if (mobilePosAssistantState.voiceActive) {
    speakPosAssistant(`Elegiste ${product.name}. ¿Qué cantidad vas a vender?`);
  }
}
window.selectMobilePosAssistantProduct = selectMobilePosAssistantProduct;

function updateMobilePosQty(delta) {
  const current = mobilePosAssistantState.quantity || 1;
  const next = Math.max(1, current + delta);
  setMobilePosQtyValue(next);
}
window.updateMobilePosQty = updateMobilePosQty;

function setMobilePosQtyValue(val) {
  const available = Math.max(0, Number(mobilePosAssistantState.selectedProduct?.stock || 0));
  const requested = Math.min(Math.max(1, parseInt(val, 10) || 1), 999);
  const parsed = mobilePosAssistantState.mode === 'stock'
    ? Math.min(requested, Math.max(1, available))
    : requested;
  mobilePosAssistantState.quantity = parsed;

  const input = document.getElementById('mobile-pos-qty-input');
  if (input) input.value = parsed;

  const prod = mobilePosAssistantState.selectedProduct || {};
  const unitPrice = Number(prod.price || prod.sale_price || 0);
  const subtotal = unitPrice * parsed;

  const subtotalDisplay = document.querySelector('#mobile-pos-assistant-content strong[style*="color: var(--color-accent-gold)"]');
  if (subtotalDisplay) {
    subtotalDisplay.textContent = `$${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
  }
}
window.setMobilePosQtyValue = setMobilePosQtyValue;

function setMobilePosDeliveryDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + Number(days));
  const iso = date.toISOString().split('T')[0];
  mobilePosAssistantState.nostockData.customDate = iso;
  const input = document.getElementById('pos-nostock-delivery-date');
  if (input) input.value = iso;
}
window.setMobilePosDeliveryDays = setMobilePosDeliveryDays;

function confirmMobilePosItem() {
  const prod = mobilePosAssistantState.selectedProduct;
  if (!prod) return;

  const qty = mobilePosAssistantState.quantity || 1;
  const available = Math.max(0, Number(prod.stock || 0));
  const isNoStock = mobilePosAssistantState.mode === 'nostock';
  const isExpress = mobilePosAssistantState.mode === 'express';
  if (!isNoStock && !isExpress && prod.track_stock !== false && (available <= 0 || qty > available)) {
    alert(`Stock insuficiente. Disponibilidad central: ${available} u.`);
    return;
  }
  const originalLineType = String(prod.line_type || 'OWN_STOCK').toUpperCase();
  const lineType = isExpress
    ? 'QUICK_ENTRY'
    : (isNoStock
      ? (['B2B_BACKORDER', 'LOCAL_STORE_BACKORDER'].includes(originalLineType) ? originalLineType : 'OWN_BACKORDER')
      : 'OWN_STOCK');
  const expectedDate = isNoStock
    ? (mobilePosAssistantState.nostockData.customDate || (() => {
      const date = new Date();
      date.setDate(date.getDate() + Number(prod.estimated_days || 2));
      return date.toISOString().slice(0, 10);
    })())
    : null;
  const cart = getPosCartEngine();
  if (cart) {
    const added = cart.addItem({
      ...prod,
      quantity: qty,
      line_type: lineType,
      expected_delivery_date: expectedDate,
      available_quantity: isNoStock ? null : prod.available_quantity
    });
    if (!added) {
      alert('No se agregó el producto: la cantidad acumulada supera el stock disponible en esa ubicación.');
      return;
    }
    renderPosCartItems();
  }

  setMobilePosAssistantStep('cart-summary');

  if (mobilePosAssistantState.voiceActive) {
    const total = cart ? cart.getTotal() : 0;
    speakPosAssistant(`Agregado al ticket. Total $${total.toLocaleString('es-AR')}. ¿Agregamos otro producto o pasamos a cobrar?`);
  }
}
window.confirmMobilePosItem = confirmMobilePosItem;

function confirmMobilePosExpressItem() {
  const name = document.getElementById('mobile-pos-express-name')?.value.trim() || '';
  const category = document.getElementById('mobile-pos-express-category')?.value || 'Otros';
  const price = Number(document.getElementById('mobile-pos-express-price')?.value || 0);
  if (name.length < 3 || !Number.isFinite(price) || price <= 0) {
    alert('Ingresá un nombre de al menos 3 caracteres y un precio mayor a cero.');
    return;
  }
  mobilePosAssistantState.expressData = { name, category, price };
  mobilePosAssistantState.selectedProduct = {
    id: `quick-${Date.now()}`,
    product_code: `QUICK-${Date.now()}`,
    name,
    category,
    price,
    stock: 0,
    line_type: 'QUICK_ENTRY',
    is_express: true,
    image: 'assets/logo.jpg'
  };
  mobilePosAssistantState.quantity = 1;
  setMobilePosAssistantStep('quantity');
}
window.confirmMobilePosExpressItem = confirmMobilePosExpressItem;

function chooseMobilePosMode(mode) {
  if (!['stock', 'nostock', 'express'].includes(mode)) return;
  if (mode === 'nostock' && window.AppConfig?.get('catalog.allowBackorders', true) === false) {
    alert('La venta por encargo está deshabilitada en la configuración publicada del negocio.');
    return;
  }
  mobilePosAssistantState.mode = mode;
  mobilePosAssistantState.selectedProduct = null;
  mobilePosAssistantState.quantity = 1;
  setMobilePosAssistantStep('search');
}
window.chooseMobilePosMode = chooseMobilePosMode;

function renderMobilePosAssistant() {
  const container = document.getElementById('mobile-pos-assistant-content');
  const titleEl = document.getElementById('mobile-pos-assistant-title');
  const progressEl = document.getElementById('mobile-pos-assistant-progress');
  const backBtn = document.getElementById('mobile-pos-assistant-back');
  const nextBtn = document.getElementById('mobile-pos-assistant-next');
  const navEl = document.getElementById('mobile-pos-assistant-nav');

  if (!container) return;

  const step = mobilePosAssistantState.step;
  const stepIdx = MOBILE_POS_ASSISTANT_STEPS.indexOf(step);

  if (progressEl) progressEl.textContent = `Paso ${stepIdx + 1} de ${MOBILE_POS_ASSISTANT_STEPS.length}`;
  if (navEl) navEl.style.display = 'grid';
  if (backBtn) backBtn.style.display = (step === 'mode' || step === 'confirm') ? 'none' : 'block';
  if (nextBtn) nextBtn.style.display = (step === 'mode' || step === 'search' || step === 'confirm') ? 'none' : 'block';

  if (step === 'mode') {
    if (titleEl) titleEl.textContent = '¿Qué deseás vender?';
    if (mobilePosAssistantState.voiceActive) {
      speakPosAssistant('¿Qué deseás vender?');
    }
    container.innerHTML = `
      <p class="assistant-question">Elegí la modalidad de la venta:</p>
      <p class="assistant-help">Podés entregar ahora, registrar un encargo o cobrar un artículo recién llegado.</p>
      <div class="pos-assistant-mode-grid">
        <button type="button" class="pos-assistant-mode-card featured" onclick="chooseMobilePosMode('stock')">
          <span class="pos-mode-icon">🌿</span>
          <div class="pos-mode-info">
            <strong>1. Producto en Stock</strong>
            <small>Stock disponible en el local · Entrega y cobro en el acto</small>
          </div>
        </button>
        <button type="button" class="pos-assistant-mode-card" onclick="chooseMobilePosMode('nostock')">
          <span class="pos-mode-icon">📦</span>
          <div class="pos-mode-info">
            <strong>2. Venta sin stock</strong>
            <small>Producto propio, catálogo B2B o tienda local · queda como encargo</small>
          </div>
        </button>
        <button type="button" class="pos-assistant-mode-card" onclick="chooseMobilePosMode('express')">
          <span class="pos-mode-icon">⚡</span>
          <div class="pos-mode-info">
            <strong>3. Venta rápida</strong>
            <small>Nombre y precio en el momento · genera un borrador para catalogar después</small>
          </div>
        </button>
      </div>
    `;
    return;
  }

  if (step === 'search') {
    if (mobilePosAssistantState.mode === 'express') {
      if (titleEl) titleEl.textContent = '⚡ Venta Express (Carga rápida)';
      if (mobilePosAssistantState.voiceActive) {
        speakPosAssistant('¿Qué producto express deseás vender y cómo se cobrará?');
      }
      container.innerHTML = `
        <p class="assistant-question">Dictá la venta en una frase (ej: "Dos sustratos a 36000 cada uno en efectivo"):</p>
        <div style="display: grid; gap: 12px; margin-top: 10px;">
          <div>
            <label style="display: block; font-size: 0.8rem; font-weight: 800; color: var(--color-text-main); margin-bottom: 4px;">Nombre del producto *</label>
            <div style="display: flex; gap: 8px;">
              <input type="text" id="mobile-pos-express-name" class="b2b-form-input" placeholder="Ej: Sustrato Profesional 50L" value="${escapeStockHtml(mobilePosAssistantState.expressData.name)}" style="flex: 1;">
              <button type="button" class="stock-entry-secondary-btn" onclick="dictatePosExpressField('mobile-pos-express-name')" title="Dictar por voz" style="font-size: 1.1rem; padding: 0 12px; min-height: 44px;">🎙️</button>
            </div>
          </div>
          <div>
            <label style="display: block; font-size: 0.8rem; font-weight: 800; color: var(--color-text-main); margin-bottom: 4px;">Categoría</label>
            <select id="mobile-pos-express-category" class="b2b-form-input">
              <option value="Sustratos">Sustratos</option>
              <option value="Fertilizantes">Fertilizantes</option>
              <option value="Semillas">Semillas</option>
              <option value="Indoor">Indoor</option>
              <option value="Parafernalia">Parafernalia</option>
              <option value="Vaporizadores">Vaporizadores</option>
              <option value="Otros" selected>Otros</option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 0.8rem; font-weight: 800; color: var(--color-text-main); margin-bottom: 4px;">Precio de venta ($) *</label>
            <input type="number" id="mobile-pos-express-price" class="b2b-form-input" placeholder="0.00" step="0.01" min="1" value="${mobilePosAssistantState.expressData.price || ''}">
          </div>
        </div>
        <div style="margin-top: 18px;">
          <button type="button" class="mobile-assistant-primary" style="width: 100%;" onclick="confirmMobilePosExpressItem()">
            Continuar a Cantidad ➔
          </button>
        </div>
      `;
      return;
    }

    const modeLabel = mobilePosAssistantState.mode === 'nostock' ? '📦 Producto sin Stock' : '🌿 Producto en Stock';
    if (titleEl) titleEl.textContent = `Buscar: ${modeLabel}`;
    if (mobilePosAssistantState.voiceActive) {
      speakPosAssistant('¿Qué producto buscamos?');
    }
    container.innerHTML = `
      <p class="assistant-question">Buscá el producto por nombre o código:</p>
      <div style="display: flex; gap: 8px; margin-top: 8px;">
        <input type="text" id="pos-assistant-search-input" class="b2b-form-input" placeholder="Escribir nombre o escanear..." oninput="handleMobilePosAssistantSearch(this.value)" autocomplete="off" style="flex: 1;">
        <button type="button" class="stock-entry-secondary-btn" onclick="dictateMobilePosSearch()" title="Dictar búsqueda por voz" style="font-size: 1.1rem; padding: 0 12px;">🎙️</button>
        <button type="button" class="stock-camera-scan-btn" onclick="openUniversalCameraScanner('pos')" title="Escanear con cámara" style="padding: 0 12px;">📷</button>
      </div>
      <div id="pos-assistant-results-container" class="pos-assistant-results-list">
        <!-- Rendered live below -->
      </div>
    `;
    handleMobilePosAssistantSearch('');
    return;
  }

  if (step === 'quantity') {
    const prod = mobilePosAssistantState.selectedProduct || {};
    const unitPrice = Number(prod.price || prod.sale_price || 0);
    const subtotal = unitPrice * mobilePosAssistantState.quantity;
    const isNoStock = mobilePosAssistantState.mode === 'nostock';

    if (titleEl) titleEl.textContent = 'Indicar Cantidad';
    if (mobilePosAssistantState.voiceActive) {
      speakPosAssistant('¿Qué cantidad vas a vender?');
    }

    let noStockFieldsHtml = '';
    if (isNoStock) {
      noStockFieldsHtml = `
        <div style="margin: 14px 0; padding: 12px; border-radius: 12px; background: rgba(194, 162, 70, 0.1); border: 1px solid rgba(194, 162, 70, 0.3);">
          <label style="display: block; font-size: 0.78rem; font-weight: 800; color: #76591f; text-transform: uppercase; margin-bottom: 6px;">📅 Fecha estimada de entrega</label>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 8px;">
            <button type="button" class="stock-entry-secondary-btn" onclick="setMobilePosDeliveryDays(2)" style="font-size: 0.75rem; padding: 6px 4px;">48 hs</button>
            <button type="button" class="stock-entry-secondary-btn" onclick="setMobilePosDeliveryDays(7)" style="font-size: 0.75rem; padding: 6px 4px;">7 días</button>
            <button type="button" class="stock-entry-secondary-btn" onclick="setMobilePosDeliveryDays(15)" style="font-size: 0.75rem; padding: 6px 4px;">15 días</button>
          </div>
          <input type="date" id="pos-nostock-delivery-date" class="b2b-form-input" value="${mobilePosAssistantState.nostockData.customDate || ''}" onchange="mobilePosAssistantState.nostockData.customDate = this.value">
        </div>
      `;
    }

    container.innerHTML = `
      <div style="display: flex; gap: 12px; align-items: center; padding: 12px; border-radius: 14px; background: rgba(21, 45, 36, 0.04); border: 1px solid var(--color-border-subtle); margin-bottom: 14px;">
        <img src="${prod.image || prod.image_url || 'assets/logo.jpg'}" alt="" style="width: 54px; height: 54px; border-radius: 10px; object-fit: cover;">
        <div style="flex: 1; min-width: 0;">
          <strong style="display: block; font-size: 0.92rem; color: var(--color-text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeStockHtml(prod.name || 'Producto')}</strong>
          <span style="font-size: 0.8rem; color: var(--color-accent-gold); font-weight: 800;">$${unitPrice.toLocaleString('es-AR', { minimumFractionDigits: 2 })} c/u</span>
        </div>
      </div>

      ${noStockFieldsHtml}

      <div style="text-align: center; margin: 16px 0;">
        <label style="display: block; font-size: 0.82rem; font-weight: 800; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 8px;">Cantidad a Vender:</label>
        <div class="pos-qty-stepper" style="max-width: 200px; margin: 0 auto;">
          <button type="button" class="pos-qty-btn" onclick="updateMobilePosQty(-1)">-</button>
          <input type="number" id="mobile-pos-qty-input" value="${mobilePosAssistantState.quantity}" min="1" max="999" class="pos-qty-input" onchange="setMobilePosQtyValue(this.value)">
          <button type="button" class="pos-qty-btn" onclick="updateMobilePosQty(1)">+</button>
        </div>
        <div style="margin-top: 14px; font-size: 1.1rem; font-weight: 800; color: var(--color-text-main);">
          Subtotal: <strong style="color: var(--color-accent-gold);">$${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong>
        </div>
      </div>

      <button type="button" class="mobile-assistant-primary" style="width: 100%; min-height: 48px; margin-top: 10px;" onclick="confirmMobilePosItem()">
        ✓ Agregar al ticket ➔
      </button>
    `;
    return;
  }

  if (step === 'cart-summary') {
    const cart = getPosCartEngine();
    const items = cart ? cart.getItems() : [];
    const total = cart ? cart.getTotal() : 0;

    if (titleEl) titleEl.textContent = 'Ticket de Venta';
    if (mobilePosAssistantState.voiceActive) {
      speakPosAssistant(`Total acumulado $${total.toLocaleString('es-AR')}. ¿Agregamos otro producto o pasamos a cobrar?`);
    }

    container.innerHTML = `
      <div style="padding: 12px; border-radius: 14px; background: rgba(21, 45, 36, 0.04); border: 1px solid var(--color-border-subtle); margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border-subtle); padding-bottom: 8px; margin-bottom: 8px;">
          <span style="font-size: 0.85rem; font-weight: 800; color: var(--color-text-main);">Ítems en el ticket (${items.length}):</span>
          <span style="font-size: 1.05rem; font-weight: 900; color: var(--color-accent-gold);">$${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
        </div>
        <ul style="list-style: none; padding: 0; margin: 0; max-height: 180px; overflow-y: auto;">
          ${items.map(item => `
            <li style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: 0.82rem; border-bottom: 1px dashed rgba(21,45,36,0.08);">
              <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 6px;">
                ${item.quantity}x <strong>${escapeStockHtml(item.name)}</strong>
              </span>
              <span style="font-weight: 700; color: var(--color-text-main);">$${(Number(item.price) * item.quantity).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
            </li>
          `).join('')}
        </ul>
      </div>

      <p class="assistant-question" style="text-align: center; margin-bottom: 12px;">¿Deseás agregar otro producto a esta venta?</p>

      <div style="display: grid; gap: 10px;">
        <button type="button" class="stock-entry-secondary-btn" style="min-height: 46px; font-weight: 800; font-size: 0.88rem;" onclick="setMobilePosAssistantStep('mode')">
          + Sí, agregar otro producto
        </button>
        <button type="button" class="mobile-assistant-primary" style="min-height: 48px; font-size: 0.92rem;" onclick="setMobilePosAssistantStep('payment')">
          ✓ No, pasar a cobrar ($${total.toLocaleString('es-AR')}) ➔
        </button>
      </div>
    `;
    return;
  }

  if (step === 'payment') {
    const cart = getPosCartEngine();
    const total = cart ? cart.getTotal() : 0;
    const activeVendor = sessionStorage.getItem('boeweb_vendor_name') || localStorage.getItem('boeweb_vendor_name') || 'Vendedor';
    const accounts = typeof getCurrentAccounts === 'function' ? getCurrentAccounts() : [];

    if (titleEl) titleEl.textContent = 'Medio de Pago';
    if (mobilePosAssistantState.voiceActive) {
      speakPosAssistant(`Total $${total.toLocaleString('es-AR')}. ¿Cómo abona el cliente?`);
    }

    const methods = [
      { id: 'EFECTIVO', label: 'Efectivo', icon: '💵' },
      { id: 'TRANSFERENCIA', label: 'Mercado Pago / Transf.', icon: '📱' },
      { id: 'DEBITO', label: 'Débito', icon: '💳' },
      { id: 'TARJETA', label: 'Crédito', icon: '💳' },
      { id: 'CUENTA_CORRIENTE', label: 'Cuenta Corriente', icon: '👥' },
      { id: 'MIXTO', label: 'Pago Mixto', icon: '🔀' }
    ];

    let extraPaymentConfigHtml = '';

    // Configuración para Cuenta Corriente
    if (mobilePosAssistantState.paymentMethod === 'CUENTA_CORRIENTE') {
      extraPaymentConfigHtml = `
        <div style="margin-top: 14px; padding: 14px; border-radius: 14px; background: rgba(21, 45, 36, 0.04); border: 1.5px solid var(--color-border-subtle);">
          <label style="display: block; font-size: 0.82rem; font-weight: 800; color: var(--color-text-main); margin-bottom: 6px;">
            👥 Seleccionar Cliente con Cuenta Corriente *
          </label>
          <select id="mobile-pos-cc-select" class="b2b-form-input" onchange="handleMobilePosCcSelect(this.value)" style="margin-bottom: 8px;">
            <option value="">-- Elegir cliente registrado --</option>
            ${accounts.map(acc => `
              <option value="${acc.id}" ${mobilePosAssistantState.customerAccountId === acc.id ? 'selected' : ''}>
                ${escapeStockHtml(acc.customer_name)} (Saldo: $${(acc.current_balance || 0).toLocaleString('es-AR')})
              </option>
            `).join('')}
          </select>
          <input type="text" id="mobile-pos-cc-custom-name" class="b2b-form-input" placeholder="O escribir nombre del cliente..." value="${escapeStockHtml(mobilePosAssistantState.customerAccountName)}" oninput="handleMobilePosCcCustomName(this.value)">
        </div>
      `;
    }

    // Configuración para Pago Mixto
    if (mobilePosAssistantState.paymentMethod === 'MIXTO') {
      if (!mobilePosAssistantState.mixedCashAmount) {
        mobilePosAssistantState.mixedCashAmount = Math.round(total / 2);
      }
      mobilePosAssistantState.mixedSecondaryAmount = Math.max(0, total - mobilePosAssistantState.mixedCashAmount);

      extraPaymentConfigHtml = `
        <div style="margin-top: 14px; padding: 14px; border-radius: 14px; background: rgba(21, 45, 36, 0.04); border: 1.5px solid var(--color-accent-gold);">
          <h4 style="margin: 0 0 10px 0; font-size: 0.9rem; color: var(--color-text-main);">🔀 Desglose de Pago Mixto</h4>
          
          <div style="display: grid; gap: 10px;">
            <div>
              <label style="display: block; font-size: 0.78rem; font-weight: 800; color: var(--color-text-main); margin-bottom: 4px;">
                💵 1. Monto en Efectivo ($)
              </label>
              <input type="number" id="mobile-pos-mixed-cash-amount" class="b2b-form-input" value="${mobilePosAssistantState.mixedCashAmount}" step="100" min="0" max="${total}" oninput="updateMobilePosMixedCash(this.value)">
            </div>

            <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 8px;">
              <div>
                <label style="display: block; font-size: 0.78rem; font-weight: 800; color: var(--color-text-main); margin-bottom: 4px;">
                  💳 2. Método Secundario
                </label>
                <select id="mobile-pos-mixed-sec-method" class="b2b-form-input" onchange="setMobilePosMixedSecondaryMethod(this.value)">
                  <option value="TRANSFERENCIA" ${mobilePosAssistantState.mixedSecondaryMethod === 'TRANSFERENCIA' ? 'selected' : ''}>Transferencia</option>
                  <option value="DEBITO" ${mobilePosAssistantState.mixedSecondaryMethod === 'DEBITO' ? 'selected' : ''}>Débito</option>
                  <option value="TARJETA" ${mobilePosAssistantState.mixedSecondaryMethod === 'TARJETA' ? 'selected' : ''}>Crédito</option>
                  <option value="CUENTA_CORRIENTE" ${mobilePosAssistantState.mixedSecondaryMethod === 'CUENTA_CORRIENTE' ? 'selected' : ''}>Cta Cte</option>
                </select>
              </div>
              <div>
                <label style="display: block; font-size: 0.78rem; font-weight: 800; color: var(--color-text-main); margin-bottom: 4px;">
                  Monto Restante ($)
                </label>
                <input type="number" id="mobile-pos-mixed-sec-amount" class="b2b-form-input" value="${mobilePosAssistantState.mixedSecondaryAmount}" readonly style="background: rgba(0,0,0,0.04); font-weight: 800; color: var(--color-accent-gold);">
              </div>
            </div>

            ${mobilePosAssistantState.mixedSecondaryMethod === 'CUENTA_CORRIENTE' ? `
              <div>
                <label style="display: block; font-size: 0.78rem; font-weight: 800; color: var(--color-text-main); margin-bottom: 4px;">
                  Cliente para saldo en Cta Cte:
                </label>
                <select class="b2b-form-input" onchange="handleMobilePosCcSelect(this.value)">
                  <option value="">-- Seleccionar cliente --</option>
                  ${accounts.map(acc => `<option value="${acc.id}" ${mobilePosAssistantState.customerAccountId === acc.id ? 'selected' : ''}>${escapeStockHtml(acc.customer_name)}</option>`).join('')}
                </select>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div style="text-align: center; margin-bottom: 14px;">
        <span style="font-size: 0.8rem; font-weight: 800; color: var(--color-text-muted); text-transform: uppercase;">Total ticket:</span>
        <div style="font-size: 1.8rem; font-weight: 900; color: var(--color-accent-gold);">$${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
      </div>

      <p class="assistant-question">Seleccioná cómo abona el cliente:</p>
      <div class="pos-assistant-payment-grid">
        ${methods.map(m => `
          <button type="button" class="pos-assistant-payment-btn ${mobilePosAssistantState.paymentMethod === m.id ? 'active' : ''}" onclick="setMobilePosPaymentMethod('${m.id}')">
            <span class="pay-icon">${m.icon}</span>
            <span>${m.label}</span>
          </button>
        `).join('')}
      </div>

      ${extraPaymentConfigHtml}

      <div style="margin-top: 14px; padding: 10px; border-radius: 12px; background: rgba(21, 45, 36, 0.04);">
        <div style="font-size: 0.75rem; color: var(--color-text-muted);">Vendedor activo: <strong>${escapeStockHtml(mobilePosAssistantState.salespersonName || activeVendor)}</strong></div>
      </div>

      <button type="button" class="mobile-assistant-primary" style="width: 100%; min-height: 48px; margin-top: 16px;" onclick="setMobilePosAssistantStep('adjustment')">
        Continuar a Descuento o Recargo ➔
      </button>
    `;
    return;
  }

  if (step === 'adjustment') {
    const cart = getPosCartEngine();
    const subtotal = cart ? cart.getSubtotal() : 0;
    const currentTotal = cart ? cart.getTotal() : 0;

    if (titleEl) titleEl.textContent = 'Ajuste de Precio (Descuento / Recargo)';
    if (mobilePosAssistantState.voiceActive) {
      speakPosAssistant('¿Deseás aplicar algún descuento o recargo al precio?');
    }

    const currentType = mobilePosAssistantState.adjustmentType || 'NONE';
    const currentVal = mobilePosAssistantState.adjustmentValue || 0;

    let adjustmentDiff = currentTotal - subtotal;

    container.innerHTML = `
      <div style="text-align: center; margin-bottom: 14px;">
        <span style="font-size: 0.8rem; font-weight: 800; color: var(--color-text-muted); text-transform: uppercase;">Subtotal sin ajuste:</span>
        <div style="font-size: 1.4rem; font-weight: 800; color: var(--color-text-main);">$${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
        ${currentType !== 'NONE' && currentVal > 0 ? `
          <div style="font-size: 0.85rem; font-weight: 800; color: ${adjustmentDiff >= 0 ? '#2e7d32' : '#c62828'}; margin-top: 4px;">
            ${adjustmentDiff > 0 ? `+ Inflado / Recargo: +$${adjustmentDiff.toLocaleString('es-AR')}` : `- Descuento: -$${Math.abs(adjustmentDiff).toLocaleString('es-AR')}`}
          </div>
          <div style="font-size: 1.7rem; font-weight: 900; color: var(--color-accent-gold); margin-top: 2px;">
            Total Final: $${currentTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </div>
        ` : ''}
      </div>

      <p class="assistant-question">¿Deseás inflar o descontar el precio?</p>

      <div style="display: grid; gap: 12px; margin-top: 10px;">
        <!-- Opción 1: Sin ajuste -->
        <button type="button" class="pos-assistant-payment-btn ${currentType === 'NONE' ? 'active' : ''}" style="justify-content: flex-start; padding: 12px 14px;" onclick="setMobilePosAdjustment('NONE', 0)">
          <span style="font-size: 1.3rem; margin-right: 8px;">🟢</span>
          <div style="text-align: left;">
            <strong style="display: block; font-size: 0.88rem;">Precio Normal (Sin ajuste)</strong>
            <small style="color: var(--color-text-muted); font-size: 0.74rem;">Mantener el total exacto de lista</small>
          </div>
        </button>

        <!-- Opción 2: Descuento -->
        <div style="padding: 12px; border-radius: 14px; background: rgba(46, 125, 50, 0.05); border: 1.5px solid ${currentType.startsWith('DISCOUNT') ? '#2e7d32' : 'var(--color-border-subtle)'};">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <strong style="font-size: 0.88rem; color: #2e7d32;">🏷️ Aplicar Descuento</strong>
            <span style="font-size: 0.75rem; color: var(--color-text-muted);">% o $ fijo</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 8px;">
            <button type="button" class="stock-entry-secondary-btn" onclick="setMobilePosAdjustment('DISCOUNT_PERCENT', 5)" style="font-size: 0.78rem; padding: 6px 2px;">-5%</button>
            <button type="button" class="stock-entry-secondary-btn" onclick="setMobilePosAdjustment('DISCOUNT_PERCENT', 10)" style="font-size: 0.78rem; padding: 6px 2px;">-10%</button>
            <button type="button" class="stock-entry-secondary-btn" onclick="setMobilePosAdjustment('DISCOUNT_PERCENT', 15)" style="font-size: 0.78rem; padding: 6px 2px;">-15%</button>
            <button type="button" class="stock-entry-secondary-btn" onclick="setMobilePosAdjustment('DISCOUNT_PERCENT', 20)" style="font-size: 0.78rem; padding: 6px 2px;">-20%</button>
          </div>
          <div style="display: flex; gap: 6px;">
            <select id="mobile-pos-disc-type" class="b2b-form-input" style="max-width: 90px;" onchange="setMobilePosAdjustment(this.value, document.getElementById('mobile-pos-disc-val')?.value || 0)">
              <option value="DISCOUNT_PERCENT" ${currentType === 'DISCOUNT_PERCENT' ? 'selected' : ''}>%</option>
              <option value="DISCOUNT_FIXED" ${currentType === 'DISCOUNT_FIXED' ? 'selected' : ''}>$</option>
            </select>
            <input type="number" id="mobile-pos-disc-val" class="b2b-form-input" placeholder="Valor personalizado" value="${currentType.startsWith('DISCOUNT') ? currentVal : ''}" oninput="setMobilePosAdjustment(document.getElementById('mobile-pos-disc-type')?.value, this.value)">
          </div>
        </div>

        <!-- Opción 3: Inflar / Recargo -->
        <div style="padding: 12px; border-radius: 14px; background: rgba(198, 40, 40, 0.05); border: 1.5px solid ${currentType.startsWith('INCREASE') ? '#c62828' : 'var(--color-border-subtle)'};">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <strong style="font-size: 0.88rem; color: #c62828;">📈 Inflar / Recargo al precio</strong>
            <span style="font-size: 0.75rem; color: var(--color-text-muted);">% o $ fijo</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 8px;">
            <button type="button" class="stock-entry-secondary-btn" onclick="setMobilePosAdjustment('INCREASE_PERCENT', 10)" style="font-size: 0.78rem; padding: 6px 2px;">+10%</button>
            <button type="button" class="stock-entry-secondary-btn" onclick="setMobilePosAdjustment('INCREASE_PERCENT', 15)" style="font-size: 0.78rem; padding: 6px 2px;">+15%</button>
            <button type="button" class="stock-entry-secondary-btn" onclick="setMobilePosAdjustment('INCREASE_PERCENT', 20)" style="font-size: 0.78rem; padding: 6px 2px;">+20%</button>
            <button type="button" class="stock-entry-secondary-btn" onclick="setMobilePosAdjustment('INCREASE_PERCENT', 10)" style="font-size: 0.78rem; padding: 6px 2px;" title="Recargo estándar tarjeta">💳 Tarj 10%</button>
          </div>
          <div style="display: flex; gap: 6px;">
            <select id="mobile-pos-inc-type" class="b2b-form-input" style="max-width: 90px;" onchange="setMobilePosAdjustment(this.value, document.getElementById('mobile-pos-inc-val')?.value || 0)">
              <option value="INCREASE_PERCENT" ${currentType === 'INCREASE_PERCENT' ? 'selected' : ''}>%</option>
              <option value="INCREASE_FIXED" ${currentType === 'INCREASE_FIXED' ? 'selected' : ''}>$</option>
            </select>
            <input type="number" id="mobile-pos-inc-val" class="b2b-form-input" placeholder="Valor personalizado" value="${currentType.startsWith('INCREASE') ? currentVal : ''}" oninput="setMobilePosAdjustment(document.getElementById('mobile-pos-inc-type')?.value, this.value)">
          </div>
        </div>
      </div>

      <button type="button" class="mobile-assistant-primary" style="width: 100%; min-height: 48px; margin-top: 18px;" onclick="setMobilePosAssistantStep('confirm')">
        Continuar al Resumen Final ➔
      </button>
    `;
    return;
  }

  if (step === 'confirm') {
    const cart = getPosCartEngine();
    const total = cart ? cart.getTotal() : 0;
    const subtotal = cart ? cart.getSubtotal() : 0;
    const items = cart ? cart.getItems() : [];
    const authContext = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : {};
    const salespeople = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantUsers() : [];
    const currentSalespersonId = mobilePosAssistantState.salespersonId || authContext.userId || '';
    const currentSalesperson = salespeople.find(user => (user.id || user.user_id) === currentSalespersonId);
    const currentVendor = currentSalesperson?.name || mobilePosAssistantState.salespersonName || authContext.userName || 'Vendedor';

    if (titleEl) titleEl.textContent = 'Resumen Final & Confirmar';
    if (mobilePosAssistantState.voiceActive) {
      speakPosAssistant('Venta lista para confirmar.');
    }

    const currentType = mobilePosAssistantState.adjustmentType || 'NONE';
    const currentVal = mobilePosAssistantState.adjustmentValue || 0;

    let paymentLabel = mobilePosAssistantState.paymentMethod;
    if (mobilePosAssistantState.paymentMethod === 'CUENTA_CORRIENTE') {
      paymentLabel = `Cuenta Corriente (${mobilePosAssistantState.customerAccountName || 'Cliente'})`;
    } else if (mobilePosAssistantState.paymentMethod === 'MIXTO') {
      paymentLabel = `Pago Mixto ($${mobilePosAssistantState.mixedCashAmount.toLocaleString('es-AR')} Efvo + $${mobilePosAssistantState.mixedSecondaryAmount.toLocaleString('es-AR')} ${mobilePosAssistantState.mixedSecondaryMethod})`;
    }

    container.innerHTML = `
      <div style="padding: 14px; border-radius: 16px; background: var(--color-card-bg); border: 1.5px solid var(--color-accent-gold); margin-bottom: 16px;">
        <span class="vendor-section-eyebrow">Resumen de Venta</span>
        <h4 style="margin: 4px 0 8px 0; font-size: 1.1rem; color: var(--color-text-main);">Venta de Mostrador (${items.length} ítems)</h4>
        
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.85rem;">
          <span>Subtotal:</span>
          <span>$${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
        </div>

        ${currentType !== 'NONE' && currentVal > 0 ? `
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.85rem; font-weight: 800; color: ${currentType.startsWith('INCREASE') ? '#c62828' : '#2e7d32'};">
            <span>${currentType.startsWith('INCREASE') ? 'Recargo / Inflado:' : 'Descuento:'}</span>
            <span>${currentType.endsWith('PERCENT') ? `${currentVal}%` : `$${currentVal.toLocaleString('es-AR')}`}</span>
          </div>
        ` : ''}

        <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.85rem;">
          <span>Medio de pago:</span>
          <strong style="color: var(--color-accent-gold);">${escapeStockHtml(paymentLabel)}</strong>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 1.25rem; font-weight: 900; color: var(--color-accent-gold); border-top: 1px solid var(--color-border-subtle); padding-top: 6px; margin-top: 6px;">
          <span>Total Final:</span>
          <span>$${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      <!-- Selector para cambiar de Vendedor -->
      <div style="margin-bottom: 14px; padding: 12px; border-radius: 12px; background: rgba(21, 45, 36, 0.04); border: 1px solid var(--color-border-subtle);">
        <label style="display: block; font-size: 0.78rem; font-weight: 800; color: var(--color-text-main); margin-bottom: 4px;">
          🧑‍💼 Vendedor a cargo de la venta (Comisión):
        </label>
        <select id="mobile-pos-salesperson-select" class="b2b-form-input" onchange="setMobilePosSalesperson(this.value)">
          ${salespeople.map(user => {
            const userId = user.id || user.user_id;
            return `
            <option value="${escapeStockHtml(userId)}" ${userId === currentSalespersonId ? 'selected' : ''}>
              ${escapeStockHtml(user.name || user.email || 'Vendedor')}
            </option>
          `; }).join('')}
        </select>
      </div>

      <div class="pos-assistant-whatsapp-box">
        <label style="display: block; font-size: 0.82rem; font-weight: 800; color: #152d24; margin-bottom: 6px;">
          📲 WhatsApp del Cliente (Comprobante PDF):
        </label>
        <input type="tel" id="mobile-pos-whatsapp-input" class="b2b-form-input" placeholder="Ej: 1123456789" value="${escapeStockHtml(mobilePosAssistantState.customerWhatsApp)}" style="background: #ffffff;" oninput="mobilePosAssistantState.customerWhatsApp = this.value">
        <button type="button" class="pos-whatsapp-btn" onclick="completeMobilePosSale(true)">
          <span>📲 Finalizar y Enviar Comprobante</span>
        </button>
      </div>

      <div style="margin-top: 12px;">
        <button type="button" class="mobile-assistant-primary" style="width: 100%; min-height: 48px;" onclick="completeMobilePosSale(false)">
          ✓ Finalizar Venta sin enviar WhatsApp
        </button>
      </div>
    `;
  }
}
window.renderMobilePosAssistant = renderMobilePosAssistant;

function setMobilePosSalesperson(userId) {
  const users = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantUsers() : [];
  const user = users.find(item => (item.id || item.user_id) === userId);
  mobilePosAssistantState.salespersonId = user ? userId : '';
  mobilePosAssistantState.salespersonName = user?.name || user?.email || '';
}
window.setMobilePosSalesperson = setMobilePosSalesperson;

function setMobilePosPaymentMethod(method) {
  mobilePosAssistantState.paymentMethod = method;
  const cart = getPosCartEngine();
  const total = cart ? cart.getTotal() : 0;

  if (method === 'MIXTO') {
    if (!mobilePosAssistantState.mixedCashAmount) {
      mobilePosAssistantState.mixedCashAmount = Math.round(total / 2);
    }
    mobilePosAssistantState.mixedSecondaryAmount = Math.max(0, total - mobilePosAssistantState.mixedCashAmount);
  }

  if (method === 'CUENTA_CORRIENTE') {
    const accounts = typeof getCurrentAccounts === 'function' ? getCurrentAccounts() : [];
    if (!mobilePosAssistantState.customerAccountId && accounts.length > 0) {
      mobilePosAssistantState.customerAccountId = accounts[0].id;
      mobilePosAssistantState.customerAccountName = accounts[0].customer_name;
      if (accounts[0].phone) mobilePosAssistantState.customerWhatsApp = accounts[0].phone;
    }
  }

  if (typeof populatePosCurrentAccountDropdown === 'function') {
    populatePosCurrentAccountDropdown();
  }

  renderMobilePosAssistant();
}
window.setMobilePosPaymentMethod = setMobilePosPaymentMethod;

function updateMobilePosMixedCash(val) {
  const cart = getPosCartEngine();
  const total = cart ? cart.getTotal() : 0;
  const cash = Math.max(0, Math.min(total, parseFloat(val) || 0));
  mobilePosAssistantState.mixedCashAmount = cash;
  mobilePosAssistantState.mixedSecondaryAmount = Math.max(0, total - cash);
  const secInput = document.getElementById('mobile-pos-mixed-sec-amount');
  if (secInput) secInput.value = mobilePosAssistantState.mixedSecondaryAmount;
}
window.updateMobilePosMixedCash = updateMobilePosMixedCash;

function setMobilePosMixedSecondaryMethod(method) {
  mobilePosAssistantState.mixedSecondaryMethod = method;
  renderMobilePosAssistant();
}
window.setMobilePosMixedSecondaryMethod = setMobilePosMixedSecondaryMethod;

function handleMobilePosCcSelect(accountId) {
  mobilePosAssistantState.customerAccountId = accountId;
  const accounts = typeof getCurrentAccounts === 'function' ? getCurrentAccounts() : [];
  const found = accounts.find(a => a.id === accountId);
  if (found) {
    mobilePosAssistantState.customerAccountName = found.customer_name;
    if (found.phone) {
      mobilePosAssistantState.customerWhatsApp = found.phone;
    }
  } else {
    mobilePosAssistantState.customerAccountName = '';
  }
  const customInput = document.getElementById('mobile-pos-cc-custom-name');
  if (customInput) customInput.value = mobilePosAssistantState.customerAccountName;
}
window.handleMobilePosCcSelect = handleMobilePosCcSelect;

function handleMobilePosCcCustomName(name) {
  mobilePosAssistantState.customerAccountName = name;
  const accounts = typeof getCurrentAccounts === 'function' ? getCurrentAccounts() : [];
  const found = accounts.find(a => a.customer_name && a.customer_name.toLowerCase() === (name || '').trim().toLowerCase());
  if (found) {
    mobilePosAssistantState.customerAccountId = found.id;
    if (found.phone) mobilePosAssistantState.customerWhatsApp = found.phone;
  }
}
window.handleMobilePosCcCustomName = handleMobilePosCcCustomName;

function setMobilePosAdjustment(type, value) {
  mobilePosAssistantState.adjustmentType = type;
  mobilePosAssistantState.adjustmentValue = Math.max(0, parseFloat(value) || 0);

  const cart = getPosCartEngine();
  if (cart) {
    if (typeof cart.setAdjustment === 'function') {
      cart.setAdjustment(type, mobilePosAssistantState.adjustmentValue);
    } else {
      cart.setDiscount(type, mobilePosAssistantState.adjustmentValue);
    }
    renderPosCartItems();
  }
  renderMobilePosAssistant();
}
window.setMobilePosAdjustment = setMobilePosAdjustment;

async function completeMobilePosSale(sendWhatsApp = false) {
  const cart = getPosCartEngine();
  if (!cart || cart.getItemCount() === 0) {
    showToast('⚠️ No hay productos en el ticket.');
    return;
  }

  const phoneInput = document.getElementById('mobile-pos-whatsapp-input');
  const phone = phoneInput?.value.trim() || mobilePosAssistantState.customerWhatsApp || '';

  // Sincronizar vendedor seleccionado
  const salespersonSelect = document.getElementById('mobile-pos-salesperson-select');
  const authContext = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : {};
  const selectedSalespersonId = salespersonSelect?.value || mobilePosAssistantState.salespersonId || authContext.userId || '';
  const selectedSalespersonUser = (typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantUsers() : [])
    .find(user => (user.id || user.user_id) === selectedSalespersonId);
  if (!selectedSalespersonUser) {
    showToast('⚠️ Seleccioná un vendedor válido del equipo activo.');
    return;
  }
  const selectedSalesperson = selectedSalespersonUser.name || selectedSalespersonUser.email || 'Vendedor';
  setMobilePosSalesperson(selectedSalespersonId);

  const globalSalespersonSelect = document.getElementById('pos-salesperson-select');
  if (globalSalespersonSelect) globalSalespersonSelect.value = selectedSalespersonId;

  // Sincronizar medio de pago y configuraciones en el motor POS principal
  const paymentSelect = document.getElementById('pos-payment-method-select');
  if (paymentSelect) paymentSelect.value = mobilePosAssistantState.paymentMethod;

  if (mobilePosAssistantState.paymentMethod === 'MIXTO') {
    const cashInput = document.getElementById('pos-mixed-cash-amount');
    const secMethodSelect = document.getElementById('pos-mixed-secondary-method');
    const secAmountInput = document.getElementById('pos-mixed-secondary-amount');
    if (cashInput) cashInput.value = mobilePosAssistantState.mixedCashAmount;
    if (secMethodSelect) secMethodSelect.value = mobilePosAssistantState.mixedSecondaryMethod;
    if (secAmountInput) secAmountInput.value = mobilePosAssistantState.mixedSecondaryAmount;
  }

  if (typeof populatePosCurrentAccountDropdown === 'function') {
    populatePosCurrentAccountDropdown();
  }

  if (mobilePosAssistantState.paymentMethod === 'CUENTA_CORRIENTE' || (mobilePosAssistantState.paymentMethod === 'MIXTO' && mobilePosAssistantState.mixedSecondaryMethod === 'CUENTA_CORRIENTE')) {
    const ccSelect = document.getElementById('pos-current-account-select');
    if (ccSelect && mobilePosAssistantState.customerAccountId) {
      ccSelect.value = mobilePosAssistantState.customerAccountId;
    }
  }

  let saleSucceeded = false;
  try {
    const res = await submitPosSaleDraft();
    if (res !== false) {
      saleSucceeded = true;
    }
  } catch (error) {
    console.error('Error al registrar venta POS:', error);
  }

  if (!saleSucceeded) return;

  if (sendWhatsApp && phone) {
    const cleanPhone = phone.replace(/[^\d]/g, '');
    let paymentDesc = mobilePosAssistantState.paymentMethod;
    if (mobilePosAssistantState.paymentMethod === 'MIXTO') {
      paymentDesc = `Mixto ($${mobilePosAssistantState.mixedCashAmount.toLocaleString('es-AR')} Efectivo + $${mobilePosAssistantState.mixedSecondaryAmount.toLocaleString('es-AR')} ${mobilePosAssistantState.mixedSecondaryMethod})`;
    } else if (mobilePosAssistantState.paymentMethod === 'CUENTA_CORRIENTE') {
      paymentDesc = `Cuenta Corriente (${mobilePosAssistantState.customerAccountName || 'Cliente'})`;
    }

    const msg = `*BÔ GROW CLUB - COMPROBANTE DE VENTA*%0A%0A¡Hola! Gracias por tu compra.%0A🧑‍💼 Vendedor: ${encodeURIComponent(selectedSalesperson)}%0A💳 Forma de Pago: ${encodeURIComponent(paymentDesc)}%0A%0A🌿 *BÔ Grow Club · Cultivo y Café de Especialidad*`;
    window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');
  }

  speakPosAssistant('¡Venta confirmada con éxito!');
  showToast('🎉 ¡Venta registrada y completada con éxito!');
  startMobilePosAssistant();
}
window.completeMobilePosSale = completeMobilePosSale;

function goBackMobilePosAssistant() {
  const step = mobilePosAssistantState.step;
  if (step === 'search') setMobilePosAssistantStep('mode');
  else if (step === 'quantity') setMobilePosAssistantStep('search');
  else if (step === 'cart-summary') setMobilePosAssistantStep('mode');
  else if (step === 'payment') setMobilePosAssistantStep('cart-summary');
  else if (step === 'adjustment') setMobilePosAssistantStep('payment');
  else if (step === 'confirm') setMobilePosAssistantStep('adjustment');
}
window.goBackMobilePosAssistant = goBackMobilePosAssistant;

function continueMobilePosAssistant() {
  const step = mobilePosAssistantState.step;
  if (step === 'cart-summary') setMobilePosAssistantStep('payment');
  else if (step === 'payment') setMobilePosAssistantStep('adjustment');
  else if (step === 'adjustment') setMobilePosAssistantStep('confirm');
}
window.continueMobilePosAssistant = continueMobilePosAssistant;

/* Voice Synthesis & Voice Command Recognition Engine */
let isPosAssistantSpeaking = false;
let posAssistantSpeakingTimer = null;

function speakPosAssistant(text) {
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    if (posAssistantSpeakingTimer) clearTimeout(posAssistantSpeakingTimer);
    isPosAssistantSpeaking = true;

    // Pausar micrófono mientras habla para bloqueo total de eco
    if (posVoiceRecognitionInstance) {
      try { posVoiceRecognitionInstance.stop(); } catch (_) {}
    }

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'es-AR';
    utter.rate = 1.38;
    utter.pitch = 0.94;

    const voices = window.speechSynthesis.getVoices();
    const esVoice = voices.find(v => v.lang && (v.lang === 'es-AR' || v.lang.startsWith('es-419') || v.lang === 'es-US' || v.lang.startsWith('es')));
    if (esVoice) utter.voice = esVoice;

    utter.onend = () => {
      posAssistantSpeakingTimer = setTimeout(() => {
        isPosAssistantSpeaking = false;
        if (mobilePosAssistantState.voiceActive && posVoiceRecognitionInstance) {
          try { posVoiceRecognitionInstance.start(); } catch (_) {}
        }
      }, 250);
    };

    utter.onerror = () => {
      isPosAssistantSpeaking = false;
      if (mobilePosAssistantState.voiceActive && posVoiceRecognitionInstance) {
        try { posVoiceRecognitionInstance.start(); } catch (_) {}
      }
    };

    window.speechSynthesis.speak(utter);
  } catch (_) {
    isPosAssistantSpeaking = false;
  }
}

function toggleMobilePosVoiceAssistant() {
  if (mobilePosAssistantState.voiceActive) {
    stopMobilePosVoiceAssistant();
  } else {
    startMobilePosVoiceAssistant();
  }
}
window.toggleMobilePosVoiceAssistant = toggleMobilePosVoiceAssistant;

function startMobilePosVoiceAssistant() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    showToast('Tu navegador no soporta reconocimiento de voz continuo.');
    return;
  }

  mobilePosAssistantState.voiceActive = true;
  const fab = document.getElementById('mobile-pos-voice-assistant-btn');
  const feedback = document.getElementById('mobile-pos-voice-feedback');
  const textEl = document.getElementById('mobile-pos-voice-text');

  if (fab) fab.classList.add('listening');
  if (feedback) feedback.hidden = false;
  if (textEl) textEl.textContent = '🎙️ Asistente escuchando...';

  try {
    posVoiceRecognitionInstance = new SpeechRec();
    posVoiceRecognitionInstance.lang = 'es-AR';
    posVoiceRecognitionInstance.continuous = true;
    posVoiceRecognitionInstance.interimResults = false;

    posVoiceRecognitionInstance.onresult = (e) => {
      if (isPosAssistantSpeaking || (window.speechSynthesis && window.speechSynthesis.speaking)) {
        return;
      }

      const last = e.results[e.results.length - 1];
      const transcript = (last[0]?.transcript || '').trim();
      if (!transcript) return;

      const lower = transcript.toLowerCase();
      if (lower.includes('qué producto buscamos') || lower.includes('asistente de voz') || lower.includes('qué deseás vender')) {
        return;
      }

      if (textEl) textEl.textContent = `🗣️ "${transcript}"`;
      handlePosVoiceCommand(transcript);
    };

    posVoiceRecognitionInstance.onerror = (err) => {
      console.warn('Pos voice error:', err);
    };

    posVoiceRecognitionInstance.onend = () => {
      if (mobilePosAssistantState.voiceActive && !isPosAssistantSpeaking && posVoiceRecognitionInstance) {
        try { posVoiceRecognitionInstance.start(); } catch (_) {}
      }
    };

    posVoiceRecognitionInstance.start();
    speakPosAssistant('¿Qué deseás vender?');
  } catch (err) {
    console.error('Error starting pos voice recognition:', err);
  }
}

function stopMobilePosVoiceAssistant() {
  mobilePosAssistantState.voiceActive = false;
  const fab = document.getElementById('mobile-pos-voice-assistant-btn');
  const feedback = document.getElementById('mobile-pos-voice-feedback');
  if (fab) fab.classList.remove('listening');
  if (feedback) feedback.hidden = true;
  if (posVoiceRecognitionInstance) {
    try { posVoiceRecognitionInstance.stop(); } catch (_) {}
    posVoiceRecognitionInstance = null;
  }
}

function handlePosVoiceCommand(raw) {
  const text = raw.toLowerCase().trim();
  const step = mobilePosAssistantState.step;

  // Global command: Atrás
  if (text.includes('atrás') || text.includes('volver')) {
    goBackMobilePosAssistant();
    return;
  }

  if (step === 'mode') {
    if (text.includes('stock') && !text.includes('sin')) {
      chooseMobilePosMode('stock');
    } else if (text.includes('sin stock') || text.includes('futuro') || text.includes('pedido') || text.includes('encargo')) {
      chooseMobilePosMode('nostock');
    } else if (text.includes('express') || text.includes('rapida') || text.includes('rápida')) {
      chooseMobilePosMode('express');
    }
    return;
  }

  if (step === 'search') {
    // 1. MODO EXPRESS: Procesar frase completa de venta con NLP (ej: "dos sustratos 36000 cada uno en efectivo")
    if (mobilePosAssistantState.mode === 'express') {
      const parsed = parseExpressVoiceInput(text);
      if (parsed && parsed.name && parsed.price > 0) {
        mobilePosAssistantState.expressData = {
          name: parsed.name,
          category: parsed.category,
          price: parsed.price
        };
        mobilePosAssistantState.quantity = parsed.quantity;
        mobilePosAssistantState.selectedProduct = {
          id: `express_${Date.now()}`,
          product_code: `EXP-${Date.now().toString().slice(-4)}`,
          name: parsed.name,
          category: parsed.category,
          price: parsed.price,
          is_express: true,
          image: 'assets/logo.jpg'
        };

        const cart = getPosCartEngine();
        if (cart) {
          cart.addItem({
            ...mobilePosAssistantState.selectedProduct,
            quantity: parsed.quantity
          });
          renderPosCartItems();
        }

        if (parsed.paymentMethod) {
          mobilePosAssistantState.paymentMethod = parsed.paymentMethod;
          const paymentSelect = document.getElementById('pos-payment-method-select');
          if (paymentSelect) paymentSelect.value = parsed.paymentMethod;
          setMobilePosAssistantStep('confirm');
          speakPosAssistant(`Se ingresará venta por ${parsed.quantity} ${parsed.name} a $${parsed.price.toLocaleString('es-AR')} cada uno en ${parsed.paymentMethod.toLowerCase()}. Venta lista para confirmar.`);
        } else {
          setMobilePosAssistantStep('payment');
          speakPosAssistant(`Se ingresará venta por ${parsed.quantity} ${parsed.name} a $${parsed.price.toLocaleString('es-AR')} cada uno. ¿Cómo abona el cliente?`);
        }
        return;
      }
    }

    // 2. MODO STOCK / NOSTOCK: Selección numérica si ya hay productos mostrándose
    const visibleItems = document.querySelectorAll('.pos-assistant-result-item');
    if (visibleItems.length > 0) {
      if (text === 'uno' || text === 'primero' || text === 'el primero' || text === 'opción 1' || text === 'opcion 1' || text === '1') {
        visibleItems[0]?.click();
        return;
      }
      if (text === 'dos' || text === 'segundo' || text === 'el segundo' || text === 'opción 2' || text === 'opcion 2' || text === '2') {
        if (visibleItems[1]) { visibleItems[1].click(); return; }
      }
      if (text === 'tres' || text === 'tercero' || text === 'el tercero' || text === 'opción 3' || text === 'opcion 3' || text === '3') {
        if (visibleItems[2]) { visibleItems[2].click(); return; }
      }
      if (text === 'cuatro' || text === 'cuarto' || text === 'el cuarto' || text === 'opción 4' || text === 'opcion 4' || text === '4') {
        if (visibleItems[3]) { visibleItems[3].click(); return; }
      }
    }

    const cleanQuery = text.replace(/^(buscar|buscá|quiero|poner|producto)\s+/i, '').trim();
    if (!cleanQuery) return;

    const input = document.getElementById('pos-assistant-search-input');
    if (input) {
      input.value = cleanQuery;
      handleMobilePosAssistantSearch(cleanQuery);
    }
    return;
  }

  if (step === 'quantity') {
    const matchDigits = text.match(/\d+/);
    if (matchDigits) {
      setMobilePosQtyValue(parseInt(matchDigits[0], 10));
      return;
    }
    if (text.includes('uno')) setMobilePosQtyValue(1);
    else if (text.includes('dos')) setMobilePosQtyValue(2);
    else if (text.includes('tres')) setMobilePosQtyValue(3);
    else if (text.includes('cuatro')) setMobilePosQtyValue(4);
    else if (text.includes('cinco')) setMobilePosQtyValue(5);
    else if (text.includes('diez')) setMobilePosQtyValue(10);
    else if (text.includes('sí') || text.includes('agregar') || text.includes('confirmar') || text.includes('dale')) {
      confirmMobilePosItem();
    }
    return;
  }

  if (step === 'cart-summary') {
    if (text.includes('sí') || text.includes('otro') || text.includes('agregar') || text.includes('sumar')) {
      setMobilePosAssistantStep('mode');
    } else if (text.includes('no') || text.includes('cobrar') || text.includes('pagar') || text.includes('cerrar') || text.includes('finalizar')) {
      setMobilePosAssistantStep('payment');
    }
    return;
  }

  if (step === 'payment') {
    if (text.includes('efectivo')) setMobilePosPaymentMethod('EFECTIVO');
    else if (text.includes('transferencia') || text.includes('mercado pago') || text.includes('mp')) setMobilePosPaymentMethod('TRANSFERENCIA');
    else if (text.includes('débito') || text.includes('debito')) setMobilePosPaymentMethod('DEBITO');
    else if (text.includes('tarjeta') || text.includes('crédito') || text.includes('credito')) setMobilePosPaymentMethod('TARJETA');
    else if (text.includes('cuenta corriente') || text.includes('fiar') || text.includes('corriente')) setMobilePosPaymentMethod('CUENTA_CORRIENTE');
    else if (text.includes('mixto') || text.includes('pago mixto') || text.includes('dividido') || text.includes('partido')) setMobilePosPaymentMethod('MIXTO');
    else if (text.includes('continuar') || text.includes('siguiente') || text.includes('confirmar') || text.includes('descuento') || text.includes('ajuste')) setMobilePosAssistantStep('adjustment');
    return;
  }

  if (step === 'adjustment') {
    if (text.includes('sin ajuste') || text.includes('sin descuento') || text.includes('normal') || text.includes('ninguno') || text.includes('no')) {
      setMobilePosAdjustment('NONE', 0);
      setMobilePosAssistantStep('confirm');
      return;
    }
    if (text.includes('descuento')) {
      const match = text.match(/\d+/);
      const val = match ? parseInt(match[0], 10) : 10;
      setMobilePosAdjustment('DISCOUNT_PERCENT', val);
      return;
    }
    if (text.includes('inflar') || text.includes('recargo') || text.includes('aumento')) {
      const match = text.match(/\d+/);
      const val = match ? parseInt(match[0], 10) : 10;
      setMobilePosAdjustment('INCREASE_PERCENT', val);
      return;
    }
    if (text.includes('continuar') || text.includes('siguiente') || text.includes('confirmar') || text.includes('listo')) {
      setMobilePosAssistantStep('confirm');
    }
    return;
  }

  if (step === 'confirm') {
    if (text.includes('confirmar') || text.includes('finalizar') || text.includes('listo') || text.includes('cerrar venta')) {
      completeMobilePosSale(false);
    }
  }
}

function dictateMobilePosSearch() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    showToast('Dictado por voz no disponible.');
    return;
  }
  const rec = new SpeechRec();
  rec.lang = 'es-AR';
  rec.onresult = (e) => {
    const val = e.results[0][0].transcript;
    const input = document.getElementById('pos-assistant-search-input');
    if (input) {
      input.value = val;
      handleMobilePosAssistantSearch(val);
    }
  };
  rec.start();
}
window.dictateMobilePosSearch = dictateMobilePosSearch;

function dictatePosExpressField(fieldId) {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) return;
  const rec = new SpeechRec();
  rec.lang = 'es-AR';
  rec.onresult = (e) => {
    const val = e.results[0][0].transcript;
    const el = document.getElementById(fieldId);
    if (el) el.value = val;
  };
  rec.start();
}
window.dictatePosExpressField = dictatePosExpressField;

function populatePosSalespeople() {
  const select = document.getElementById('pos-salesperson-select');
  if (!select) return;

  const verifiedUsers = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantUsers() : [];
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : {};
  const users = verifiedUsers;

  if (users.length === 0) {
    select.innerHTML = '<option value="">Sesión de equipo requerida</option>';
    select.disabled = true;
    return;
  }

  select.innerHTML = users.map(user => {
    const id = escapeStockHtml(user.id || user.user_id || 'vendedor');
    const name = escapeStockHtml(user.name || 'Vendedor');
    const role = escapeStockHtml(user.role || 'VENDEDOR');
    return `<option value="${id}">${name} (${role})</option>`;
  }).join('');
  select.disabled = false;
  if (users.some(user => (user.id || user.user_id) === context.userId)) select.value = context.userId;
}

function clearPosUnifiedSearch() {
  const unifiedInput = document.getElementById('pos-unified-search');
  const clearBtn = document.getElementById('pos-search-clear-btn');
  if (unifiedInput) {
    unifiedInput.value = '';
    unifiedInput.focus();
  }
  if (clearBtn) clearBtn.style.display = 'none';
  renderPosSearchResults('');
  refreshPosExternalCatalogSearch('', getPosExternalSourceType(), () => renderPosSearchResults(''))
    .catch(error => console.error('No se restableció el catálogo externo del POS:', error));
}

function parsePosScanCommand(rawQuery) {
  return window.PosDeskUtils?.parsePosScanCommand(rawQuery)
    || { quantity: 1, code: String(rawQuery || '').trim() };
}
window.parsePosScanCommand = parsePosScanCommand;

let posActiveOriginFilter = 'ALL';

function setPosOriginFilter(filter) {
  const normalizedFilters = {
    all: 'ALL',
    own_stock: 'OWN_STOCK',
    backorder: 'BACKORDER',
    b2b: 'B2B',
    local_store: 'LOCAL_STORE'
  };
  posActiveOriginFilter = normalizedFilters[String(filter || 'all').toLowerCase()] || 'ALL';
  const tabs = [
    { id: 'pos-origin-all', key: 'ALL' },
    { id: 'pos-origin-own', key: 'OWN_STOCK' },
    { id: 'pos-origin-backorder', key: 'BACKORDER' },
    { id: 'pos-origin-b2b', key: 'B2B' },
    { id: 'pos-origin-local', key: 'LOCAL_STORE' }
  ];

  tabs.forEach(t => {
    const tabEl = document.getElementById(t.id);
    if (tabEl) {
      const isActive = t.key === posActiveOriginFilter;
      tabEl.classList.toggle('active', isActive);
      tabEl.style.borderBottomColor = isActive ? 'var(--color-accent-gold)' : 'transparent';
      tabEl.style.color = isActive ? 'var(--color-accent-gold)' : 'var(--color-text-muted)';
    }
  });

  const query = document.getElementById('pos-unified-search')?.value || '';
  renderPosSearchResults(query);
  refreshPosExternalCatalogSearch(query, getPosExternalSourceType(), () => {
    if (posActiveOriginFilter === (normalizedFilters[String(filter || 'all').toLowerCase()] || 'ALL')) {
      renderPosSearchResults(document.getElementById('pos-unified-search')?.value || '');
    }
  }).catch(error => console.error('No se actualizó el origen externo seleccionado:', error));
}
window.setPosOriginFilter = setPosOriginFilter;

async function handlePosBarcodeOrDirectSearch(rawQuery) {
  if (!rawQuery) return;
  const parsed = parsePosScanCommand(rawQuery);
  const cleanCode = parsed.code.toLowerCase().trim();
  const quantity = parsed.quantity;

  let prods = getAllSearchableProducts();

  // 1. Coincidencia exacta por código de barras, SKU, product_code o ID
  const findExactMatch = products => products.find(p =>
    (p.barcode && String(p.barcode).trim().toLowerCase() === cleanCode) ||
    (p.product_code && String(p.product_code).trim().toLowerCase() === cleanCode) ||
    (p.id && String(p.id).trim().toLowerCase() === cleanCode) ||
    (p.cart_key && String(p.cart_key).trim().toLowerCase() === cleanCode)
  );
  let exactMatch = findExactMatch(prods);

  // Un código fuera de la primera página B2B se resuelve en el servidor antes
  // de informar que no existe. Esto cubre Enter, lector USB y cámara móvil.
  if (!exactMatch) {
    await loadExternalCatalogOffers(cleanCode, getPosExternalSourceType());
    prods = getAllSearchableProducts();
    exactMatch = findExactMatch(prods);
    const externalError = getExternalCatalogErrorFor(cleanCode, getPosExternalSourceType());
    if (!exactMatch && externalError) {
      if (typeof showToast === 'function') {
        showToast('⚠️ El catálogo externo no está disponible. Reintentá la búsqueda.', true);
      }
      renderPosSearchResults(rawQuery);
      return;
    }
  }

  if (exactMatch) {
    const directAdd = typeof AppConfig !== 'undefined' ? AppConfig.get('rules.pos.barcodeDirectAdd', true) : true;
    const stockVal = Number(exactMatch.stock !== undefined ? exactMatch.stock : (exactMatch.own_stock || 0));
    const canonicalLineType = String(exactMatch.line_type || 'OWN_STOCK').toUpperCase();
    const lineType = ['B2B_BACKORDER', 'LOCAL_STORE_BACKORDER'].includes(canonicalLineType)
      ? canonicalLineType
      : (stockVal >= quantity || exactMatch.track_stock === false ? 'OWN_STOCK' : 'OWN_BACKORDER');

    if (directAdd && lineType === 'OWN_STOCK') {
      const cart = getPosCartEngine();
      if (cart) {
        const added = cart.addItem({
          ...exactMatch,
          quantity: quantity,
          line_type: lineType
        });
        if (!added) {
          alert('No se agregó el producto: la cantidad acumulada supera el stock disponible.');
          return;
        }
        renderPosCartItems();
        if (typeof playScannerBeep === 'function') playScannerBeep();
        if (typeof showToast === 'function') {
          showToast(`✓ Agregado: ${quantity}x ${exactMatch.name}${lineType === 'OWN_BACKORDER' ? ' (Por Encargo)' : ''}`);
        }
      }
    } else {
      showPosProductConfirmModal({ ...exactMatch, initial_qty: quantity, line_type: lineType });
    }

    const unifiedInput = document.getElementById('pos-unified-search');
    if (unifiedInput) {
      unifiedInput.value = '';
      const clearBtn = document.getElementById('pos-search-clear-btn');
      if (clearBtn) clearBtn.style.display = 'none';
      renderPosSearchResults('');
      refreshPosExternalCatalogSearch('', getPosExternalSourceType(), () => renderPosSearchResults(''))
        .catch(error => console.error('No se restableció el catálogo tras el escaneo:', error));
      unifiedInput.focus();
    }
    return;
  }

  // 2. Búsqueda en catálogo activo
  const matches = prods.filter(p => {
    const text = [p.name, p.brand, p.presentation, p.category, p.id, p.barcode, p.product_code].filter(Boolean).join(' ').toLowerCase();
    return text.includes(cleanCode);
  });

  if (matches.length === 1) {
    const singleMatch = matches[0];
    const stockVal = Number(singleMatch.stock !== undefined ? singleMatch.stock : (singleMatch.own_stock || 0));
    const canonicalLineType = String(singleMatch.line_type || 'OWN_STOCK').toUpperCase();
    const lineType = ['B2B_BACKORDER', 'LOCAL_STORE_BACKORDER'].includes(canonicalLineType)
      ? canonicalLineType
      : (stockVal >= quantity || singleMatch.track_stock === false ? 'OWN_STOCK' : 'OWN_BACKORDER');

    const directAdd = typeof AppConfig !== 'undefined' ? AppConfig.get('rules.pos.barcodeDirectAdd', true) : true;
    if (directAdd && lineType === 'OWN_STOCK') {
      const cart = getPosCartEngine();
      if (cart) {
        const added = cart.addItem({
          ...singleMatch,
          quantity: quantity,
          line_type: lineType
        });
        if (!added) {
          alert('No se agregó el producto: la cantidad acumulada supera el stock disponible.');
          return;
        }
        renderPosCartItems();
        if (typeof playScannerBeep === 'function') playScannerBeep();
        if (typeof showToast === 'function') {
          showToast(`✓ Agregado: ${quantity}x ${singleMatch.name}${lineType === 'OWN_BACKORDER' ? ' (Por Encargo)' : ''}`);
        }
      }
    } else {
      showPosProductConfirmModal({ ...singleMatch, initial_qty: quantity, line_type: lineType });
    }

    const unifiedInput = document.getElementById('pos-unified-search');
    if (unifiedInput) {
      unifiedInput.value = '';
      const clearBtn = document.getElementById('pos-search-clear-btn');
      if (clearBtn) clearBtn.style.display = 'none';
      renderPosSearchResults('');
      refreshPosExternalCatalogSearch('', getPosExternalSourceType(), () => renderPosSearchResults(''))
        .catch(error => console.error('No se restableció el catálogo tras la búsqueda:', error));
      unifiedInput.focus();
    }
  } else if (matches.length === 0) {
    if (typeof showToast === 'function') {
      showToast(`🔍 Sin coincidencias para "${rawQuery}". Podés agregarlo como Ítem Libre ⚡`, true);
    }
    renderPosSearchResults(rawQuery);
  } else {
    renderPosSearchResults(rawQuery);
  }
}

function togglePosVoiceSearch() {
  const statusEl = document.getElementById('pos-voice-status');
  const voiceBtn = document.getElementById('pos-voice-search-btn');
  const unifiedInput = document.getElementById('pos-unified-search');

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('Tu navegador no soporta dictado por voz. Podés usar el teclado o la máquina escaneadora.');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'es-AR';
  recognition.interimResults = false;

  if (statusEl) statusEl.textContent = '🎙️ Escuchando dictado... Hablá ahora.';
  if (voiceBtn) voiceBtn.classList.add('recording');

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    if (statusEl) statusEl.textContent = `Dictado: "${transcript}"`;
    if (voiceBtn) voiceBtn.classList.remove('recording');
    if (unifiedInput) {
      unifiedInput.value = transcript;
      const clearBtn = document.getElementById('pos-search-clear-btn');
      if (clearBtn) clearBtn.style.display = 'block';
      renderPosSearchResults(transcript);
      refreshPosExternalCatalogSearch(transcript, getPosExternalSourceType(), () => {
        if ((document.getElementById('pos-unified-search')?.value || '') === transcript) {
          renderPosSearchResults(transcript);
        }
      }).catch(error => console.error('No se completó la búsqueda externa por voz:', error));
    }
  };

  recognition.onerror = () => {
    if (statusEl) statusEl.textContent = '⚠️ Error en dictado por voz.';
    if (voiceBtn) voiceBtn.classList.remove('recording');
  };

  recognition.onend = () => {
    if (voiceBtn) voiceBtn.classList.remove('recording');
    setTimeout(() => {
      if (statusEl && statusEl.textContent.includes('Escuchando')) {
        statusEl.textContent = '';
      }
    }, 3000);
  };

  recognition.start();
}

function renderPosSearchResults(query = '') {
  const grid = document.getElementById('pos-search-results-grid');
  const countBadge = document.getElementById('pos-search-count-badge');
  if (!grid) return;

  let prods = getAllSearchableProducts();
  if (window.AppConfig?.get('catalog.allowBackorders', true) === false) {
    prods = prods.filter(product => {
      const lineType = String(product.line_type || 'OWN_STOCK').toUpperCase();
      return lineType === 'OWN_STOCK' && (product.track_stock === false || Number(product.stock || 0) > 0);
    });
  }

  // Filtro por pestaña de origen
  if (posActiveOriginFilter === 'OWN_STOCK') {
    prods = prods.filter(p => !p.source_type && (p.track_stock === false || Number(p.stock || 0) > 0));
  } else if (posActiveOriginFilter === 'BACKORDER') {
    prods = prods.filter(p => !p.source_type && p.track_stock !== false && Number(p.stock || 0) <= 0);
  } else if (posActiveOriginFilter === 'B2B') {
    prods = prods.filter(p => p.source_type === 'B2B_SUPPLIER' || p.line_type === 'B2B_BACKORDER');
  } else if (posActiveOriginFilter === 'LOCAL_STORE') {
    prods = prods.filter(p => p.source_type === 'LOCAL_STORE' || p.line_type === 'LOCAL_STORE_BACKORDER');
  }

  const cleanQuery = (query || '').toLowerCase().trim();
  const externalSourceType = getPosExternalSourceType();
  const externalError = ['OWN_STOCK', 'BACKORDER'].includes(posActiveOriginFilter)
    ? ''
    : getExternalCatalogErrorFor(query, externalSourceType);

  const filtered = prods.filter(p => {
    if (!cleanQuery) return true;
    const text = [p.name, p.brand, p.presentation, p.category, p.id, p.barcode, p.product_code].filter(Boolean).join(' ').toLowerCase();
    return text.includes(cleanQuery);
  });

  if (countBadge) {
    const isLimitedExternalPage = externalCatalogOffers.length >= 120
      && !['OWN_STOCK', 'BACKORDER'].includes(posActiveOriginFilter);
    countBadge.textContent = cleanQuery
      ? `${filtered.length} coincidencias${isLimitedExternalPage ? ' visibles' : ''}${externalError ? ' · externo no disponible' : ''}`
      : (isLimitedExternalPage
        ? `Mostrando ${prods.length} · escribí para buscar en todo el catálogo`
        : `${prods.length} productos disponibles para venta${externalError ? ' · externo no disponible' : ''}`);
  }

  if (filtered.length === 0) {
    const isCatalogRecoveryState = !cleanQuery && (
      (posActiveOriginFilter === 'B2B' && !externalCatalogOffers.some(product => product.source_type === 'B2B_SUPPLIER'))
      || (posActiveOriginFilter === 'LOCAL_STORE' && !externalCatalogOffers.some(product => product.source_type === 'LOCAL_STORE'))
      || (posActiveOriginFilter === 'ALL' && getAllSearchableProducts().length === 0)
    );
    const emptyTitle = externalError
      ? 'El catálogo externo no está disponible'
      : (isCatalogRecoveryState
      ? 'Este catálogo todavía no fue recuperado'
      : 'Sin coincidencias en este catálogo');
    const emptyDescription = externalError
      || (isCatalogRecoveryState
        ? 'Administración puede recuperar ahora los productos históricos y proveedores, sin borrar ni duplicar datos.'
        : '¿Es un producto recién llegado? Podés agregarlo inmediatamente como Ítem Libre / Venta Rápida.');
    const recoveryAction = externalError
      ? '<button type="button" class="stock-entry-secondary-btn" onclick="retryPosExternalCatalogSearch()" style="min-height: 44px; padding: 8px 14px; font-weight: 800;">&#8635; Reintentar catálogo</button>'
      : (isCatalogRecoveryState
      ? renderLegacyCatalogSyncAction('Recuperar catálogo B2B')
      : '');
    const quickEntryAction = externalError
      ? ''
      : '<button type="button" class="stock-entry-secondary-btn" onclick="openPosExpressItemModal()" style="min-height: 44px; padding: 8px 14px; font-weight: 800;">⚡ Venta Rápida / Ítem Libre</button>';
    grid.innerHTML = `
      <section role="status" style="grid-column: 1 / -1; text-align: center; padding: 30px 15px; color: #6b4e2e; background: #f6f3e8; border-radius: 14px; border: 1.5px dashed #c2a246;">
        <span aria-hidden="true" style="font-size: 2rem; display: block; margin-bottom: 6px;">${externalError ? '⚠️' : (isCatalogRecoveryState ? '📦' : '🔍')}</span>
        <strong style="display: block; font-size: 0.95rem; margin-bottom: 4px; color: #152d24;">${emptyTitle}</strong>
        <p style="margin: 0 0 12px 0; font-size: 0.8rem; line-height: 1.45;">${escapeStockHtml(emptyDescription)}</p>
        <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 8px;">
          ${recoveryAction}
          ${quickEntryAction}
        </div>
      </section>
    `;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const stockVal = Number(p.stock !== undefined ? p.stock : (p.own_stock || 0));
    const lineType = String(p.line_type || 'OWN_STOCK').toUpperCase();
    const isDeferred = lineType !== 'OWN_STOCK' || (p.track_stock !== false && stockVal <= 0);
    const prodImg = p.image || p.image_url || 'assets/logo.jpg';
    const prodPrice = Number(p.price || 0);
    const prodId = escapeStockHtml(String(p.cart_key || p.id || p.product_code));
    const safeName = escapeStockHtml(p.name || 'Producto');
    const safeCat = escapeStockHtml(p.category || 'Venta mostrador');

    let originBadge = '';
    if (p.source_type === 'B2B_SUPPLIER' || p.line_type === 'B2B_BACKORDER') {
      originBadge = '<span style="font-size: 0.68rem; font-weight: 800; padding: 2px 6px; border-radius: 4px; background: #e3f2fd; color: #1565c0; margin-bottom: 2px; display: inline-block;">🏭 Catálogo B2B</span>';
    } else if (p.source_type === 'LOCAL_STORE' || p.line_type === 'LOCAL_STORE_BACKORDER') {
      originBadge = '<span style="font-size: 0.68rem; font-weight: 800; padding: 2px 6px; border-radius: 4px; background: #f3e5f5; color: #7b1fa2; margin-bottom: 2px; display: inline-block;">🏪 Tienda Vecina</span>';
    }

    return `
      <div class="pos-product-card ${isDeferred ? 'pos-product-card-backorder' : ''}">
        <div>
          <img src="${prodImg}" alt="${safeName}" class="pos-product-img" loading="lazy" onerror="this.src='assets/logo.jpg'">
          ${originBadge}
          <span class="pos-product-category">${safeCat}</span>
          <strong class="pos-product-name" title="${safeName}">${safeName}</strong>
          <div class="pos-product-meta">
            ${p.barcode ? `<span>Cód: ${p.barcode}</span>` : `<span>ID: ${prodId}</span>`}
          </div>
        </div>

        <div>
          <div class="pos-product-price">$${prodPrice.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
          <div class="pos-stock-badge ${isDeferred ? 'pos-stock-badge-backorder' : 'pos-stock-badge-available'}" style="${isDeferred ? 'background: rgba(255,152,0,0.12); color: #e65100; border: 1px solid #ffb74d;' : ''}">
            ${isDeferred ? `📦 Por encargo${p.source_name ? ` · ${escapeStockHtml(p.source_name)}` : ''}` : `🟢 ${stockVal} u. disponibles`}
          </div>

          <button type="button" 
                  class="pos-add-btn" 
                  onclick="openPosProductModalById('${prodId}')"
                  style="${isDeferred ? 'background: #fff; border: 1.5px solid #ff9800; color: #e65100;' : ''}">
            ${isDeferred ? '＋ Vender Por Encargo' : '+ Seleccionar'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function openPosProductModalById(productId) {
  const prods = getAllSearchableProducts();

  const product = prods.find(p => String(p.cart_key) === String(productId)
    || String(p.id) === String(productId)
    || String(p.product_code) === String(productId));
  if (product) {
    showPosProductConfirmModal(product);
  }
}

function showPosProductConfirmModal(product) {
  if (!product) return;
  posScanPendingProduct = product;

  const stockVal = Number(product.stock !== undefined ? product.stock : (product.own_stock || 0));
  const lineType = String(product.line_type || 'OWN_STOCK').toUpperCase();
  const isDeferred = lineType !== 'OWN_STOCK' || (product.track_stock !== false && stockVal <= 0);

  const modal = document.getElementById('pos-scan-confirm-modal');
  if (!modal) {
    addPosProductToCart(product);
    return;
  }

  const imgEl = document.getElementById('pos-scan-confirm-img');
  const catEl = document.getElementById('pos-scan-confirm-category');
  const nameEl = document.getElementById('pos-scan-confirm-name');
  const codeEl = document.getElementById('pos-scan-confirm-code');
  const stockEl = document.getElementById('pos-scan-confirm-stock');
  const locationEl = document.getElementById('pos-scan-confirm-location');
  const priceEl = document.getElementById('pos-scan-confirm-price');
  const qtyInput = document.getElementById('pos-scan-confirm-qty');
  const qtyError = document.getElementById('pos-modal-qty-error');
  const deliveryContainer = document.getElementById('pos-scan-delivery-container');
  const deliveryDateInput = document.getElementById('pos-scan-delivery-date');

  if (imgEl) imgEl.src = product.image || product.image_url || 'assets/logo.jpg';
  if (catEl) catEl.textContent = product.category || 'Catálogo';
  if (nameEl) nameEl.textContent = product.name || 'Producto';
  if (codeEl) codeEl.textContent = product.barcode || product.product_code || product.id || 'N/A';

  if (stockEl) {
    if (isDeferred) {
      stockEl.textContent = `📦 Venta por encargo${product.source_name ? ` · ${product.source_name}` : ''}`;
      stockEl.className = 'pos-stock-badge pos-stock-badge-backorder';
      stockEl.style.background = 'rgba(255,152,0,0.12)';
      stockEl.style.color = '#e65100';
    } else {
      stockEl.textContent = `${stockVal} u. disponibles`;
      stockEl.className = 'pos-stock-badge pos-stock-badge-available';
      stockEl.style.background = '';
      stockEl.style.color = '';
    }
  }

  if (priceEl) priceEl.textContent = `$${Number(product.price || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
  if (qtyInput) {
    qtyInput.value = String(product.initial_qty || 1);
    qtyInput.max = 999;
  }
  if (qtyError) {
    qtyError.style.display = 'none';
    qtyError.textContent = '';
  }
  if (deliveryContainer && deliveryDateInput) {
    deliveryContainer.style.display = isDeferred ? 'block' : 'none';
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + Math.max(1, Number(product.estimated_days || 7)));
    deliveryDateInput.min = new Date().toISOString().slice(0, 10);
    deliveryDateInput.value = product.expected_delivery_date || defaultDate.toISOString().slice(0, 10);
    deliveryDateInput.required = isDeferred;
  }

  const locLabel = product.shelf_code
    ? `📍 Estante: ${product.shelf_code}`
    : '📍 Sin ubicación asignada';
  if (locationEl) locationEl.textContent = locLabel;

  modal.style.display = 'flex';
  if (qtyInput) {
    setTimeout(() => {
      qtyInput.focus();
      qtyInput.select();
    }, 100);
  }
}

function stepPosModalQty(delta) {
  if (!posScanPendingProduct) return;
  const qtyInput = document.getElementById('pos-scan-confirm-qty');
  if (!qtyInput) return;

  const current = parseInt(qtyInput.value, 10) || 1;
  const stockVal = Number(posScanPendingProduct.stock !== undefined ? posScanPendingProduct.stock : (posScanPendingProduct.own_stock || 0));
  const nextVal = Math.min(999, Math.max(1, current + delta));

  qtyInput.value = nextVal;
  validatePosModalQty(qtyInput);
}

function validatePosModalQty(input) {
  if (!posScanPendingProduct || !input) return;
  const stockVal = Number(posScanPendingProduct.stock !== undefined ? posScanPendingProduct.stock : (posScanPendingProduct.own_stock || 0));
  const qtyError = document.getElementById('pos-modal-qty-error');
  const confirmBtn = document.getElementById('pos-confirm-add-btn');
  const current = parseInt(input.value, 10);

  if (isNaN(current) || current < 1) {
    if (qtyError) {
      qtyError.textContent = 'La cantidad mínima es 1 unidad.';
      qtyError.style.display = 'block';
    }
    if (confirmBtn) confirmBtn.disabled = true;
    return;
  }

  if (stockVal > 0 && current > stockVal) {
    if (qtyError) {
      qtyError.textContent = `Aviso: Supera el stock local (${stockVal} u.). Se registrará el excedente por encargo.`;
      qtyError.style.display = 'block';
      qtyError.style.color = '#e65100';
    }
    if (confirmBtn) confirmBtn.disabled = false;
    return;
  }

  if (qtyError) {
    qtyError.style.display = 'none';
    qtyError.textContent = '';
  }
  if (confirmBtn) confirmBtn.disabled = false;
}

function closePosScanConfirmModal() {
  const modal = document.getElementById('pos-scan-confirm-modal');
  if (modal) modal.style.display = 'none';
  posScanPendingProduct = null;

  const unifiedInput = document.getElementById('pos-unified-search');
  if (unifiedInput) unifiedInput.focus();
}

function confirmAddPosProductToCart() {
  if (!posScanPendingProduct) return;
  const qtyInput = document.getElementById('pos-scan-confirm-qty');
  const qty = Math.max(1, parseInt(qtyInput?.value, 10) || 1);
  const stockVal = Number(posScanPendingProduct.stock !== undefined ? posScanPendingProduct.stock : (posScanPendingProduct.own_stock || 0));

  const originalLineType = String(posScanPendingProduct.line_type || 'OWN_STOCK').toUpperCase();
  let lineType;
  if (originalLineType === 'B2B_BACKORDER' || posScanPendingProduct.source_type === 'B2B_SUPPLIER') lineType = 'B2B_BACKORDER';
  else if (originalLineType === 'LOCAL_STORE_BACKORDER' || posScanPendingProduct.source_type === 'LOCAL_STORE') lineType = 'LOCAL_STORE_BACKORDER';
  else lineType = posScanPendingProduct.track_stock === false || stockVal >= qty ? 'OWN_STOCK' : 'OWN_BACKORDER';
  const isDeferred = lineType !== 'OWN_STOCK';
  const expectedDeliveryDate = document.getElementById('pos-scan-delivery-date')?.value || null;
  if (isDeferred && !expectedDeliveryDate) {
    alert('Indicá la fecha estimada de entrega antes de agregar el encargo.');
    document.getElementById('pos-scan-delivery-date')?.focus();
    return;
  }

  const cart = getPosCartEngine();
  if (cart) {
    const added = cart.addItem({
      ...posScanPendingProduct,
      quantity: qty,
      line_type: lineType,
      expected_delivery_date: isDeferred ? expectedDeliveryDate : null
    });
    if (!added) {
      alert('No se agregó el producto. Revisá la cantidad y la disponibilidad central.');
      return;
    }
    renderPosCartItems();
    if (typeof showToast === 'function') {
      showToast(`✓ Agregado al ticket: ${qty}x ${posScanPendingProduct.name}${lineType !== 'OWN_STOCK' ? ' (Por Encargo)' : ''}`);
    }
  }

  closePosScanConfirmModal();

  const unifiedInput = document.getElementById('pos-unified-search');
  if (unifiedInput) {
    unifiedInput.value = '';
    const clearBtn = document.getElementById('pos-search-clear-btn');
    if (clearBtn) clearBtn.style.display = 'none';
    renderPosSearchResults('');
    unifiedInput.focus();
  }
}

function addPosProductToCart(product) {
  const cart = getPosCartEngine();
  if (cart) {
    const added = cart.addItem(product);
    if (!added) {
      alert('No se agregó el producto: verificá precio, stock y ubicación central.');
      return false;
    }
    renderPosCartItems();
    return true;
  }
  return false;
}

let currentPosMobileView = 'catalog';

function switchPosMobileView(view) {
  currentPosMobileView = view || 'catalog';
  const grid = document.getElementById('pos-workspace-grid');
  const btnCatalog = document.getElementById('pos-tab-btn-catalog');
  const btnTicket = document.getElementById('pos-tab-btn-ticket');
  const floatingBar = document.getElementById('pos-mobile-floating-bar');
  const backToCatalogBtn = document.getElementById('pos-back-to-catalog-btn');

  if (grid) {
    grid.dataset.mobileView = currentPosMobileView;
  }
  if (btnCatalog) {
    btnCatalog.classList.toggle('active', currentPosMobileView === 'catalog');
    btnCatalog.setAttribute('aria-selected', currentPosMobileView === 'catalog' ? 'true' : 'false');
  }
  if (btnTicket) {
    btnTicket.classList.toggle('active', currentPosMobileView === 'ticket');
    btnTicket.setAttribute('aria-selected', currentPosMobileView === 'ticket' ? 'true' : 'false');
  }
  if (backToCatalogBtn) {
    backToCatalogBtn.style.display = (window.innerWidth <= 991 && currentPosMobileView === 'ticket') ? 'inline-block' : 'none';
  }

  if (floatingBar) {
    const cart = typeof getPosCartEngine === 'function' ? getPosCartEngine() : null;
    const count = cart ? cart.getItemCount() : 0;
    floatingBar.style.display = (window.innerWidth <= 991 && count > 0 && currentPosMobileView === 'catalog')
      ? 'flex'
      : 'none';
  }

  const posSection = document.getElementById('vendor-pos-section');
  if (posSection && window.innerWidth <= 991) {
    posSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
window.switchPosMobileView = switchPosMobileView;

function renderPosCartItems() {
  const cart = getPosCartEngine();
  const body = document.getElementById('pos-cart-items-body');
  const emptyState = document.getElementById('pos-cart-empty-state');
  const subtotalEl = document.getElementById('pos-summary-subtotal');
  const discountRow = document.getElementById('pos-summary-discount-row');
  const discountLabelEl = document.getElementById('pos-summary-discount-label');
  const discountEl = document.getElementById('pos-summary-discount');
  const totalEl = document.getElementById('pos-summary-total');
  const tabCountEl = document.getElementById('pos-mobile-tab-count');
  const floatingItemsCount = document.getElementById('pos-floating-items-count');
  const floatingTotal = document.getElementById('pos-floating-total');
  const floatingBar = document.getElementById('pos-mobile-floating-bar');
  const backToCatalogBtn = document.getElementById('pos-back-to-catalog-btn');

  if (!cart || !body) return;

  const items = cart.getItems();
  const itemCount = cart.getItemCount();

  if (tabCountEl) tabCountEl.textContent = itemCount;
  if (floatingItemsCount) floatingItemsCount.textContent = `${itemCount} ${itemCount === 1 ? 'ítem' : 'ítems'}`;

  if (items.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    body.innerHTML = '';
    if (subtotalEl) subtotalEl.textContent = '$0,00';
    if (discountRow) discountRow.style.display = 'none';
    if (totalEl) totalEl.textContent = '$0,00';
    if (floatingTotal) floatingTotal.textContent = '$0,00';
    if (floatingBar) floatingBar.style.display = 'none';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  body.innerHTML = items.map(item => `
    <li style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--color-border-subtle); font-size: 0.88rem;">
      <div style="flex: 1; min-width: 0; padding-right: 8px;">
        <strong style="display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--color-text-main);">${escapeStockHtml(item.name)}</strong>
        <small style="color: var(--color-text-muted);">$${Number(item.price).toLocaleString('es-AR', { minimumFractionDigits: 2 })} c/u</small>
        ${item.shelf_code ? `<small style="display: block; color: var(--color-accent-gold);">📍 ${escapeStockHtml(item.shelf_code)}</small>` : ''}
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <button type="button" onclick="updatePosCartItemQty('${item.id}', ${item.quantity - 1})" style="min-width: 28px; min-height: 28px; border-radius: 6px; border: 1px solid var(--color-border-accent); background: #fff; font-weight: 800; cursor: pointer;">-</button>
        <span style="font-weight: 800; min-width: 20px; text-align: center;">${item.quantity}</span>
        <button type="button" onclick="updatePosCartItemQty('${item.id}', ${item.quantity + 1})" style="min-width: 28px; min-height: 28px; border-radius: 6px; border: 1px solid var(--color-border-accent); background: #fff; font-weight: 800; cursor: pointer;">+</button>
        <button type="button" onclick="removePosCartItem('${item.id}')" style="color: #c62828; margin-left: 4px; background: none; border: none; font-size: 1.1rem; cursor: pointer; padding: 4px;" aria-label="Quitar item">✕</button>
      </div>
    </li>
  `).join('');

  const subtotal = cart.getSubtotal();
  const adj = typeof cart.getAdjustment === 'function' ? cart.getAdjustment() : { type: 'NONE', value: 0 };
  const adjAmt = typeof cart.getAdjustmentAmount === 'function' ? cart.getAdjustmentAmount() : -cart.getDiscountAmount();
  const total = cart.getTotal();

  if (subtotalEl) subtotalEl.textContent = `$${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

  const feedbackEl = document.getElementById('pos-adjustment-feedback');
  const unitBadgeEl = document.getElementById('pos-adjustment-unit-badge');

  if (unitBadgeEl) {
    unitBadgeEl.textContent = (adj.type === 'DISCOUNT_FIXED' || adj.type === 'INCREASE_FIXED') ? '$' : '%';
  }

  if (discountRow) {
    if (adjAmt !== 0) {
      discountRow.style.display = 'flex';
      if (adjAmt < 0) {
        const absAmt = Math.abs(adjAmt);
        if (discountLabelEl) {
          discountLabelEl.innerHTML = `<span style="color: #2e7d32; font-weight: 700;">📉 Descuento (${adj.type === 'DISCOUNT_PERCENT' ? `${adj.value}%` : '$'}):</span>`;
        }
        if (discountEl) {
          discountEl.innerHTML = `<strong style="color: #2e7d32; font-weight: 800;">-$${absAmt.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong>`;
        }
        if (feedbackEl) {
          feedbackEl.style.display = 'block';
          feedbackEl.style.color = '#2e7d32';
          feedbackEl.textContent = `✓ Descuento aplicado: -$${absAmt.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
        }
      } else {
        if (discountLabelEl) {
          discountLabelEl.innerHTML = `<span style="color: #e65100; font-weight: 700;">📈 Aumento / Recargo (${adj.type === 'INCREASE_PERCENT' ? `${adj.value}%` : '$'}):</span>`;
        }
        if (discountEl) {
          discountEl.innerHTML = `<strong style="color: #e65100; font-weight: 800;">+$${adjAmt.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong>`;
        }
        if (feedbackEl) {
          feedbackEl.style.display = 'block';
          feedbackEl.style.color = '#e65100';
          feedbackEl.textContent = `✓ Aumento/Recargo aplicado: +$${adjAmt.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
        }
      }
    } else {
      discountRow.style.display = 'none';
      if (feedbackEl) feedbackEl.style.display = 'none';
    }
  }

  if (totalEl) totalEl.textContent = `$${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
  if (floatingTotal) floatingTotal.textContent = `$${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

  if (floatingBar) {
    floatingBar.style.display = (window.innerWidth <= 991 && itemCount > 0 && currentPosMobileView === 'catalog')
      ? 'flex'
      : 'none';
  }
  if (backToCatalogBtn) {
    backToCatalogBtn.style.display = (window.innerWidth <= 991 && currentPosMobileView === 'ticket') ? 'inline-block' : 'none';
  }
}

function updatePosCartItemQty(id, qty) {
  const cart = getPosCartEngine();
  if (cart) {
    const updated = cart.updateQuantity(id, qty);
    if (!updated) {
      showToast('La cantidad supera el stock conocido. Actualizá inventario o elegí una cantidad menor.', true);
    }
    renderPosCartItems();
  }
}

function removePosPosCartItem(id) {
  const cart = getPosCartEngine();
  if (cart) {
    cart.removeItem(id);
    renderPosCartItems();
  }
}
window.removePosCartItem = removePosPosCartItem;

function handlePosAdjustmentChange() {
  const cart = getPosCartEngine();
  if (!cart) return;

  const typeSelect = document.getElementById('pos-adjustment-type');
  const valueInput = document.getElementById('pos-adjustment-value');
  const unitBadge = document.getElementById('pos-adjustment-unit-badge');

  const adjType = typeSelect?.value || 'NONE';
  const adjValue = Math.max(0, parseFloat(valueInput?.value) || 0);

  if (unitBadge) {
    unitBadge.textContent = (adjType === 'DISCOUNT_FIXED' || adjType === 'INCREASE_FIXED') ? '$' : '%';
  }

  if (typeof cart.setAdjustment === 'function') {
    cart.setAdjustment(adjType, adjValue);
  } else {
    cart.setDiscount(adjType, adjValue);
  }

  renderPosCartItems();
}
window.handlePosAdjustmentChange = handlePosAdjustmentChange;

function handlePosDiscountChange() {
  handlePosAdjustmentChange();
}
window.handlePosDiscountChange = handlePosDiscountChange;

function clearPosDiscount() {
  const cart = getPosCartEngine();
  if (!cart) return;

  const typeSelect = document.getElementById('pos-adjustment-type') || document.getElementById('pos-discount-type');
  const valueInput = document.getElementById('pos-adjustment-value') || document.getElementById('pos-discount-value');

  if (typeSelect) typeSelect.value = 'NONE';
  if (valueInput) valueInput.value = '';

  if (typeof cart.setAdjustment === 'function') {
    cart.setAdjustment('NONE', 0);
  } else {
    cart.setDiscount('PERCENT', 0);
  }

  renderPosCartItems();
}
window.clearPosDiscount = clearPosDiscount;

// Referencia de migración aislada en un binding léxico e imposible de ejecutar.
// Se conserva sólo hasta poder retirar el bloque legacy en una limpieza mecánica.
const submitPosSaleDraftLegacyUnsafe = false ? async function legacyUnsafeSaleReference() {
  const cart = getPosCartEngine();
  if (!cart || cart.getItemCount() === 0) {
    alert('Agregá al menos un producto al ticket antes de confirmar la venta.');
    return;
  }

  const salespersonSelect = document.getElementById('pos-salesperson-select');
  const paymentMethodSelect = document.getElementById('pos-payment-method-select');
  const notesInput = document.getElementById('pos-notes-input');

  const cashierUser = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : { id: 'usr-cajero', userName: 'Cajero Auth' };
  const users = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantUsers() : [];
  const selectedSalespersonId = salespersonSelect?.value;
  const salespersonObj = users.find(u => (u.id || u.user_id) === selectedSalespersonId) || { id: selectedSalespersonId || 'usr-vendedor', name: salespersonSelect?.options[salespersonSelect.selectedIndex]?.text || 'Vendedor' };

  const selectedPaymentMethod = paymentMethodSelect?.value || 'EFECTIVO';
  let paymentBreakdown = null;

  if (selectedPaymentMethod === 'MIXTO') {
    const cashAmount = Number(document.getElementById('pos-mixed-cash-amount')?.value || 0);
    const secMethod = document.getElementById('pos-mixed-secondary-method')?.value || 'TRANSFERENCIA';
    const secAmount = Number(document.getElementById('pos-mixed-secondary-amount')?.value || 0);
    const totalTicket = cart.calculateTotal();

    if (Math.abs((cashAmount + secAmount) - totalTicket) > 0.01) {
      alert(`⚠️ En Pago Mixto, la suma de Efectivo ($${cashAmount.toLocaleString('es-AR')}) y ${secMethod} ($${secAmount.toLocaleString('es-AR')}) debe ser igual al total del ticket ($${totalTicket.toLocaleString('es-AR')}).`);
      return;
    }

    paymentBreakdown = {
      cash_amount: cashAmount,
      secondary_method: secMethod,
      secondary_amount: secAmount
    };
  }

  const draft = cart.createSaleDraft({
    tenantId: cashierUser.tenantId || '11111111-1111-1111-1111-111111111111',
    cashierUser: { id: cashierUser.userId || cashierUser.id, name: cashierUser.userName },
    salespersonUser: { id: salespersonObj.id || salespersonObj.user_id, name: salespersonObj.name },
    paymentMethod: selectedPaymentMethod,
    paymentBreakdown: paymentBreakdown,
    notes: notesInput?.value || ''
  });

  const isDirectCc = draft.payment_method === 'CUENTA_CORRIENTE';
  const isMixedCc = draft.payment_method === 'MIXTO' && draft.payment_breakdown?.secondary_method === 'CUENTA_CORRIENTE';

  if (isDirectCc || isMixedCc) {
    const ccSelect = document.getElementById('pos-current-account-select');
    let ccId = ccSelect?.value || (typeof mobilePosAssistantState !== 'undefined' ? mobilePosAssistantState.customerAccountId : '');
    let accounts = typeof getCurrentAccounts === 'function' ? getCurrentAccounts() : [];
    let account = accounts.find(a => a.id === ccId);

    // Si aún no se encontró la cuenta por ID, buscar o crear a partir del nombre ingresado
    const customName = typeof mobilePosAssistantState !== 'undefined' ? (mobilePosAssistantState.customerAccountName || '').trim() : '';
    if (!account && customName) {
      account = accounts.find(a => a.customer_name && a.customer_name.toLowerCase() === customName.toLowerCase());
      if (!account) {
        account = {
          id: `CC-${Date.now().toString().slice(-4)}`,
          customer_name: customName,
          dni: '',
          phone: mobilePosAssistantState.customerWhatsApp || '',
          credit_limit: 300000,
          current_balance: 0,
          first_payment_due: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          ledger: []
        };
        accounts.push(account);
        localStorage.setItem('boeweb_current_accounts', JSON.stringify(accounts));
      }
      ccId = account.id;
      if (typeof mobilePosAssistantState !== 'undefined') {
        mobilePosAssistantState.customerAccountId = account.id;
        mobilePosAssistantState.customerAccountName = account.customer_name;
      }
    }

    // Si todavía no hay cuenta pero existen cuentas registradas, tomar la primera
    if (!account && accounts.length > 0) {
      account = accounts[0];
      ccId = account.id;
      if (typeof mobilePosAssistantState !== 'undefined') {
        mobilePosAssistantState.customerAccountId = account.id;
        mobilePosAssistantState.customerAccountName = account.customer_name;
      }
    }

    if (!account) {
      alert('⚠️ Debés seleccionar o ingresar un cliente para confirmar la venta en Cuenta Corriente.');
      return false;
    }
    const dueDateInput = document.getElementById('pos-cc-due-date');
    if (dueDateInput?.value) {
      account.first_payment_due = dueDateInput.value;
    }

    const ccDebitAmount = isMixedCc ? draft.payment_breakdown.secondary_amount : draft.total;
    const saleConcept = isMixedCc
      ? `Venta Mostrador #${draft.draft_id} (Pago Mixto: $${draft.payment_breakdown.cash_amount.toLocaleString('es-AR')} Efvo + $${ccDebitAmount.toLocaleString('es-AR')} Cta Cte)`
      : `Venta Mostrador #${draft.draft_id} (${draft.items.map(i => `${i.quantity}x ${i.name}`).join(', ')})`;

    account.current_balance = (account.current_balance || 0) + ccDebitAmount;
    if (!account.ledger) account.ledger = [];

    const recordedItems = draft.items.map(item => {
      let img = item.image_url || item.image || '';
      if (!img && typeof internalCatalogProducts !== 'undefined' && Array.isArray(internalCatalogProducts)) {
        const match = internalCatalogProducts.find(p => String(p.id) === String(item.product_id || item.id) || String(p.product_code) === String(item.product_id || item.id) || p.barcode === String(item.product_id || item.id));
        if (match) img = match.image || match.image_url || '';
      }
      return {
        id: item.product_id || item.id,
        product_code: item.product_code || item.sku || item.id,
        name: item.name,
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.price || item.unit_price) || 0,
        subtotal: (Number(item.price || item.unit_price) || 0) * (Number(item.quantity) || 1),
        image: img || 'assets/logo.jpg'
      };
    });

    account.ledger.push({
      id: 'MOV-' + Date.now(),
      date: new Date().toISOString().slice(0, 10),
      concept: saleConcept,
      amount: ccDebitAmount,
      type: 'DEBIT',
      balance_after: account.current_balance,
      sale_draft_id: draft.draft_id,
      items: recordedItems
    });
    if (typeof saveCurrentAccount === 'function') {
      saveCurrentAccount(account);
    }
    draft.customer_account_id = account.id;
    draft.customer_account_name = account.customer_name;
    draft.customer_account_due = account.first_payment_due || null;
  }

  const stockChanges = [];
  draft.items.forEach(soldItem => {
    if (soldItem.is_express || soldItem.availability === 'EXPRESS_UNMAPPED') {
      return;
    }
    const code = String(soldItem.product_id || soldItem.id || soldItem.product_code || '');
    const barcode = String(soldItem.barcode || '');
    const name = String(soldItem.name || '').toLowerCase();
    const qty = Math.max(1, Number(soldItem.quantity) || 1);

    // 1. Catálogo interno
    if (typeof internalCatalogProducts !== 'undefined' && Array.isArray(internalCatalogProducts)) {
      const intP = internalCatalogProducts.find(prod => 
        (code && (String(prod.id) === code || String(prod.product_code) === code)) ||
        (barcode && prod.barcode === barcode) ||
        (name && prod.name && prod.name.toLowerCase() === name)
      );
      if (intP) {
        const prev = Number(intP.stock || 0);
        intP.stock = Math.max(0, prev - qty);
        intP.own_stock = intP.stock;
        stockChanges.push(`${intP.name}: de ${prev} u. a ${intP.stock} u.`);
      }
    }

    // 2. Ubicaciones físicas locales
    if (typeof readLocalProductLocations === 'function' && typeof saveLocalProductLocation === 'function') {
      const locs = readLocalProductLocations();
      const loc = locs.find(l => 
        (code && (String(l.product_code) === code || String(l.product_id) === code)) ||
        (barcode && l.barcode === barcode) ||
        (name && l.name && l.name.toLowerCase() === name)
      );
      if (loc) {
        loc.stock = Math.max(0, Number(loc.stock || 0) - qty);
        saveLocalProductLocation(loc);
      }
    }

    // 3. Mapa interactivo
    if (typeof window !== 'undefined' && Array.isArray(window.storeLocationProducts)) {
      const mapItem = window.storeLocationProducts.find(l => 
        (code && (String(l.product_code) === code || String(l.product_id) === code)) ||
        (barcode && l.barcode === barcode) ||
        (name && l.name && l.name.toLowerCase() === name)
      );
      if (mapItem) {
        mapItem.stock = Math.max(0, Number(mapItem.stock || 0) - qty);
      }
    }

    // 4. Sincronizar tabla supplier_products en Supabase (tienda local)
    if (supabaseClient && code) {
      try {
        const targetSku = code;
        supabaseClient.from('supplier_products')
          .update({ stock: Math.max(0, Number(soldItem.stock || 0) - qty), updated_at: new Date().toISOString() })
          .eq('supplier_id', 'local_store')
          .or(`mapped_product_id.eq.${targetSku},supplier_product_id.eq.${targetSku}`)
          .then();
      } catch (_) {}
    }
  });

  try {
    localStorage.setItem('boeweb_internal_catalog', JSON.stringify(internalCatalogProducts));
  } catch (_) {}

  // 5. Registrar en el historial de retiros/ventas de auditoría
  draft.items.forEach(soldItem => {
    saveRetiredProductAdjustment({
      id: `pos_sale_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      date: new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
      product_id: soldItem.product_id || soldItem.id || '',
      product_code: soldItem.product_code || '',
      product_name: soldItem.name || 'Producto Mostrador',
      barcode: soldItem.barcode || '',
      type: 'remove',
      quantity: Math.max(1, Number(soldItem.quantity) || 1),
      reason: 'vendido',
      reason_label: `Venta Mostrador POS #${draft.draft_id}`,
      notes: `Venta presencial (${draft.payment_method})`,
      vendor_name: draft.salesperson_name_snapshot || localStorage.getItem('boeweb_vendor_name') || 'Vendedor'
    });
  });

  // 6. Registrar movimiento de caja en turno de hoy
  try {
    const today = getTodayDateKey();
    const cashData = getVendorCashData(today);
    const now = new Date();
    const paymentMethod = draft.payment_method || 'EFECTIVO';
    let movementType = 'venta_efectivo';
    if (paymentMethod === 'TRANSFERENCIA' || paymentMethod === 'DIGITAL') movementType = 'venta_transf';
    else if (paymentMethod === 'TARJETA' || paymentMethod === 'DEBITO' || paymentMethod === 'CREDITO') movementType = 'venta_tarjeta';
    else if (paymentMethod === 'MERCADOPAGO' || paymentMethod === 'QR') movementType = 'venta_mp';
    else if (paymentMethod === 'CUENTA_CORRIENTE') movementType = 'cuenta_corriente';

    const saleEntry = {
      id: `cash_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: now.toISOString(),
      time: now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      type: movementType,
      amount: Number(draft.total) || 0,
      desc: `Venta Mostrador #${draft.draft_id} (${draft.items.map(i => `${i.quantity}x ${i.name}`).join(', ')})`,
      vendor: draft.salesperson_name_snapshot || localStorage.getItem('boeweb_vendor_name') || 'Vendedor',
      paymentMethod: draft.payment_method,
      seller: draft.salesperson_name_snapshot,
      itemsSummary: draft.items.map(i => `${i.quantity}x ${i.name}`).join(', '),
      voided: false
    };

    if (!Array.isArray(cashData.movements)) cashData.movements = [];
    cashData.movements.unshift(saleEntry);
    if (!Array.isArray(cashData.sales)) cashData.sales = [];
    cashData.sales.push(saleEntry);

    saveVendorCashData(cashData, today);
  } catch (cashErr) {
    console.warn('Aviso registrando caja local:', cashErr);
  }

  const existingDrafts = JSON.parse(localStorage.getItem('boeweb_pos_sale_drafts') || '[]');
  existingDrafts.unshift(draft);
  localStorage.setItem('boeweb_pos_sale_drafts', JSON.stringify(existingDrafts));

  const authContext = typeof SaasAuth !== 'undefined'
    ? SaasAuth.getTenantContext()
    : { isVerified: false };

  if (!supabaseClient || !authContext.isVerified) {
    alert(`💾 Venta registrada en este dispositivo (Modo Mostrador Offline).\nLa venta todavía NO fue confirmada en la nube porque falta una sesión segura de Supabase.\n\nComprobante: ${draft.draft_id}\nTotal: $${Number(draft.total || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}\nDescuento: $${Number(draft.discount || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}\n\n📦 Stock local actualizado:\n${stockChanges.join('\n') || 'Stock descontado correctamente.'}\n\n💰 Caja BÔ: Dinero ingresado al arqueo del turno.`);
  } else {
    try {
      const rpcItems = draft.items.map(item => ({
        product_id: item.product_code || item.id,
        quantity: item.quantity,
        unit_price: item.price
      }));
      const { data, error } = await supabaseClient.rpc('rpc_process_sale_checkout_saas', {
        p_tenant_id: draft.tenant_id,
        p_idempotency_key: draft.idempotency_key,
        p_items: rpcItems,
        p_cashier_user_id: draft.cashier_user_id,
        p_salesperson_user_id: draft.salesperson_user_id,
        p_payment_method: draft.payment_method,
        p_discount_amount: draft.discount || 0
      });
      if (error) throw error;
      alert(`✅ ¡Venta confirmada en la base de datos!\n\nN.º: ${data?.sale_id || draft.draft_id}\nTotal: $${Number(draft.total || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}\n\n📦 Stock interno actualizado:\n${stockChanges.join('\n') || 'Stock descontado correctamente.'}`);
    } catch (rpcErr) {
      console.warn('Aviso sincronizando venta remota en Supabase:', rpcErr);
      alert(`Venta registrada localmente. Pendiente sincronizar en la nube:\n${rpcErr.message}`);
    }
  }

  cart.clear();
  activeParkedTicketId = null;
  clearPosDiscount();
  renderPosCartItems();
  renderPosSearchResults('');
  if (typeof renderStockProducts === 'function') renderStockProducts();
  if (typeof renderInternalCatalogGrid === 'function') renderInternalCatalogGrid();
  if (typeof renderRetiredProductsUI === 'function') renderRetiredProductsUI();
  if (typeof renderCashSectionUI === 'function') renderCashSectionUI();
  if (typeof loadStoreMapData === 'function') await loadStoreMapData(true);
  if (typeof rerenderStoreMap === 'function') rerenderStoreMap();

  if (document.getElementById('store-map-search-result-card')?.style.display !== 'none') {
    const firstItem = draft.items[0];
    if (firstItem) {
      const info = decodeHumanWmsLocation(firstItem.product_code || firstItem.name, firstItem);
      renderStoreMapLocationCard(info);
    }
  }

  if (typeof renderVendorHomeUI === 'function') renderVendorHomeUI();
  switchVendorTab('home');
} : null;

async function submitPosSaleDraft() {
  const cart = getPosCartEngine();
  if (!cart || cart.getItemCount() === 0) {
    alert('Agregá al menos un producto al ticket antes de confirmar la venta.');
    return false;
  }

  const authContext = await ensureVendorOperationalSession({ showLogin: true });
  if (!supabaseClient || !authContext) {
    alert('🔒 Para vender necesitás iniciar sesión con tu usuario seguro de Supabase. No se modificó stock, caja ni cuenta corriente.');
    return false;
  }
  if (!window.OperationalApi) {
    alert('No se pudo cargar el servicio transaccional de ventas. Recargá la página antes de continuar.');
    return false;
  }

  const pendingRecords = window.OperationalApi
    .readOutbox(authContext.tenantId, authContext.userId)
    .filter(record => record.state === 'PENDING' || record.state === 'FAILED');
  if (pendingRecords.length > 0) {
    const retryResults = await window.OperationalApi.retryPending({ supabaseClient, authContext });
    const stillPending = window.OperationalApi
      .readOutbox(authContext.tenantId, authContext.userId)
      .filter(record => record.state === 'PENDING' || record.state === 'FAILED');
    if (stillPending.length > 0) {
      alert('⚠️ Hay una venta anterior pendiente de confirmación. No se permite iniciar otra hasta resolverla para evitar cobros o descuentos duplicados.');
      return false;
    }
    if (retryResults.some(result => result.state === 'SYNCED')) {
      cart.clear();
      clearPosDiscount();
      renderPosCartItems();
      alert('✅ La venta pendiente anterior quedó confirmada. El carrito fue limpiado; revisá el comprobante antes de iniciar otra venta.');
      return true;
    }
  }

  const salespersonSelect = document.getElementById('pos-salesperson-select');
  const tenantUsers = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantUsers() : [];
  const selectedSalespersonId = salespersonSelect?.value || authContext.userId;
  const salesperson = tenantUsers.find(user => (user.id || user.user_id) === selectedSalespersonId)
    || (selectedSalespersonId === authContext.userId
      ? { id: authContext.userId, name: authContext.userName }
      : null);
  if (!salesperson) {
    alert('El vendedor seleccionado no pertenece al equipo activo. Volvé a elegirlo antes de cobrar.');
    return false;
  }

  const paymentMethod = document.getElementById('pos-payment-method-select')?.value || 'EFECTIVO';
  let paymentBreakdown = null;
  if (paymentMethod === 'MIXTO') {
    const cashAmount = Number(document.getElementById('pos-mixed-cash-amount')?.value || 0);
    const secondaryMethod = document.getElementById('pos-mixed-secondary-method')?.value || 'TRANSFERENCIA';
    const secondaryAmount = Number(document.getElementById('pos-mixed-secondary-amount')?.value || 0);
    if (Math.abs((cashAmount + secondaryAmount) - cart.calculateTotal()) > 0.01) {
      alert('La suma de las formas de pago no coincide con el total del ticket.');
      return false;
    }
    paymentBreakdown = {
      cash_amount: cashAmount,
      secondary_method: secondaryMethod,
      secondary_amount: secondaryAmount
    };
  }

  const registerSelect = document.getElementById('pos-register-select');
  const selectedRegisterId = registerSelect?.value || null;
  const selectedRegisterOption = registerSelect?.selectedOptions?.[0];
  if (!selectedRegisterId || !selectedRegisterOption?.dataset.sessionId) {
    alert('Toda venta debe quedar asociada a una caja con turno abierto. Podés abrirla desde Caja & Arqueo.');
    return false;
  }

  const draft = cart.createSaleDraft({
    tenantId: authContext.tenantId,
    cashierUser: { id: authContext.userId, name: authContext.userName },
    salespersonUser: {
      id: salesperson.id || salesperson.user_id,
      name: salesperson.name || salesperson.email || 'Vendedor'
    },
    paymentMethod,
    paymentBreakdown,
    notes: document.getElementById('pos-notes-input')?.value || ''
  });
  if (paymentMethod === 'EFECTIVO') {
    const cashTenderedInput = document.getElementById('pos-cash-tendered-input');
    const rawTendered = String(cashTenderedInput?.value || '').trim();
    if (rawTendered) {
      const cashResult = window.PosDeskUtils?.calculateCashChange(draft.total, rawTendered);
      if (!cashResult || !cashResult.sufficient) {
        alert('El efectivo recibido es insuficiente para cubrir el total de la venta.');
        cashTenderedInput?.focus();
        return false;
      }
      draft.cash_tendered = cashResult.tendered;
    }
  }
  if (activeParkedTicketId) draft.parked_ticket_id = activeParkedTicketId;

  const usesCurrentAccount = paymentMethod === 'CUENTA_CORRIENTE'
    || (paymentMethod === 'MIXTO' && paymentBreakdown?.secondary_method === 'CUENTA_CORRIENTE');
  if (usesCurrentAccount) {
    const customerId = document.getElementById('pos-current-account-select')?.value || '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(customerId)) {
      alert('Seleccioná un cliente centralizado y habilitado para cuenta corriente. Las cuentas locales antiguas no pueden utilizarse en una venta nueva.');
      return false;
    }
    draft.customer_id = customerId;
    draft.customer_account_due = document.getElementById('pos-cc-due-date')?.value || null;
  }

  const submitButton = document.getElementById('pos-create-draft-btn');
  const originalLabel = submitButton?.textContent || '';
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Confirmando operación…';
  }

  try {
    const result = await window.OperationalApi.checkoutSale({
      supabaseClient,
      authContext,
      draft,
      registerId: selectedRegisterId,
      allowQueue: true
    });

    if (result.state === 'PENDING') {
      alert('⚠️ La venta quedó PENDIENTE por falta de conexión. No se descontó stock ni se registró dinero todavía. No entregues mercadería hasta que aparezca como confirmada.');
      return false;
    }

    const receipt = result.receipt || {};
    activeParkedTicketId = null;
    await loadParkedPosTickets();
    try {
      localStorage.setItem(
        `boeweb:last-sale-receipt:v2:${authContext.tenantId}:${authContext.userId}`,
        JSON.stringify({ ...receipt, cached_at: new Date().toISOString() })
      );
    } catch (storageError) {
      console.warn('No se pudo guardar la copia local del comprobante:', storageError);
    }

    cart.clear();
    clearPosDiscount();
    renderPosCartItems();
    renderPosSearchResults('');
    if (typeof fetchB2BProducts === 'function') await fetchB2BProducts(true);
    if (typeof loadStoreMapData === 'function') await loadStoreMapData(true);
    if (typeof renderInternalCatalogGrid === 'function') renderInternalCatalogGrid();
    if (typeof renderCashSectionUI === 'function') renderCashSectionUI();
    if (typeof renderVendorHomeUI === 'function') renderVendorHomeUI();

    const saleNumber = receipt.sale_number || receipt.sale_id || draft.draft_id;
    const confirmedTotal = Number(receipt.total ?? draft.total);
    showPosPostSaleModal(receipt, draft);
    return true;
  } catch (error) {
    console.error('La venta fue rechazada sin modificar el estado operativo:', error);
    alert(`No se confirmó la venta. No se modificó stock, caja ni deuda.\n\n${error.message || 'Error desconocido'}`);
    return false;
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalLabel;
    }
  }
}


// ==========================================
// 💵 CÁLCULO DE VUELTO & BILLETES ARS
// ==========================================

function renderPosCashDenominations() {
  const container = document.getElementById('pos-cash-denominations-chips');
  if (!container) return;
  const denominations = typeof AppConfig !== 'undefined'
    ? AppConfig.get('rules.pos.billDenominations', [20000, 10000, 2000, 1000, 500, 200, 100])
    : [20000, 10000, 2000, 1000, 500, 200, 100];

  container.innerHTML = denominations.map(denom => `
    <button type="button" class="btn btn-secondary" onclick="addPosCashTenderedDenomination(${denom})" style="padding: 3px 8px; font-size: 0.72rem; font-weight: 800; border-radius: 6px; border-color: #81c784; background: #fff; color: #2e7d32; cursor: pointer;">
      +${denom.toLocaleString('es-AR')}
    </button>
  `).join('');
}
window.renderPosCashDenominations = renderPosCashDenominations;

function setPosExactCashTendered() {
  const cart = getPosCartEngine();
  const total = cart ? cart.calculateTotal() : 0;
  const input = document.getElementById('pos-cash-tendered-input');
  if (input) {
    input.value = total;
    updatePosCashChangeDisplay();
  }
}
window.setPosExactCashTendered = setPosExactCashTendered;

function addPosCashTenderedDenomination(amount) {
  const input = document.getElementById('pos-cash-tendered-input');
  if (!input) return;
  const current = Number(input.value || 0);
  input.value = current + Number(amount);
  updatePosCashChangeDisplay();
}
window.addPosCashTenderedDenomination = addPosCashTenderedDenomination;

function updatePosCashChangeDisplay() {
  const cart = getPosCartEngine();
  const total = cart ? cart.calculateTotal() : 0;
  const input = document.getElementById('pos-cash-tendered-input');
  const display = document.getElementById('pos-cash-change-display');
  if (!display) return;

  const tendered = Number(input?.value || 0);
  if (tendered <= 0) {
    display.textContent = 'Vuelto al cliente: $0,00';
    display.style.background = '#fff';
    display.style.color = '#2e7d32';
    display.style.borderColor = '#c8e6c9';
    return;
  }

  const cashResult = window.PosDeskUtils?.calculateCashChange(total, tendered);
  if (!cashResult) {
    display.textContent = 'Ingresá un importe de efectivo válido.';
    display.style.background = 'rgba(211,47,47,0.08)';
    display.style.color = '#d32f2f';
    display.style.borderColor = '#ef9a9a';
    return;
  }
  if (cashResult.sufficient) {
    display.textContent = `✓ Vuelto al cliente: $${cashResult.change.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
    display.style.background = 'rgba(46,125,50,0.1)';
    display.style.color = '#2e7d32';
    display.style.borderColor = '#81c784';
  } else {
    display.textContent = `⚠️ Falta abonar: $${Math.abs(cashResult.change).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
    display.style.background = 'rgba(211,47,47,0.08)';
    display.style.color = '#d32f2f';
    display.style.borderColor = '#ef9a9a';
  }
}
window.updatePosCashChangeDisplay = updatePosCashChangeDisplay;

// ==========================================
// ⏸️ VENTAS EN ESPERA (PARKED TICKETS)
// ==========================================

function getParkedPosTickets() {
  return parkedPosTickets;
}

async function loadParkedPosTickets() {
  if (window.AppConfig?.get('rules.pos.parkedTicketsEnabled', true) === false) {
    parkedPosTickets = [];
    renderPosParkedTicketsBar();
    return parkedPosTickets;
  }
  const authContext = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  if (!window.OperationalApi?.fetchParkedPosTickets || !supabaseClient || !authContext?.isVerified) {
    parkedPosTickets = [];
    renderPosParkedTicketsBar();
    return parkedPosTickets;
  }
  try {
    const response = await window.OperationalApi.fetchParkedPosTickets({ supabaseClient, authContext });
    parkedPosTickets = Array.isArray(response) ? response : [];
  } catch (error) {
    parkedPosTickets = [];
    console.error('No se cargaron los tickets en espera:', error);
  }
  renderPosParkedTicketsBar();
  return parkedPosTickets;
}
window.loadParkedPosTickets = loadParkedPosTickets;

function renderPosParkedTicketsBar() {
  const tickets = getParkedPosTickets();
  const bar = document.getElementById('pos-parked-tickets-bar');
  const count = document.getElementById('pos-parked-count-text');
  if (count) count.textContent = `${tickets.length} venta${tickets.length === 1 ? '' : 's'} en espera`;
  const enabled = window.AppConfig?.get('rules.pos.parkedTicketsEnabled', true) !== false;
  if (bar) bar.style.display = enabled && tickets.length > 0 ? 'block' : 'none';
}
window.renderPosParkedTicketsBar = renderPosParkedTicketsBar;

async function parkCurrentPosSale() {
  if (window.AppConfig?.get('rules.pos.parkedTicketsEnabled', true) === false) {
    alert('Las ventas en espera están deshabilitadas en la configuración publicada.');
    return;
  }
  const cart = getPosCartEngine();
  if (!cart || cart.getItemCount() === 0) {
    alert('No hay productos en el ticket para poner en espera.');
    return;
  }

  const notes = document.getElementById('pos-notes-input')?.value || '';
  const customerAccount = document.getElementById('pos-current-account-select')?.value || '';
  const salespersonSelect = document.getElementById('pos-salesperson-select');
  const salespersonId = salespersonSelect?.value || '';
  const salesperson = salespersonSelect?.options[salespersonSelect.selectedIndex]?.text || 'Vendedor';
  const authContext = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  if (!window.OperationalApi?.parkPosTicket || !supabaseClient || !authContext?.isVerified || !salespersonId) {
    alert('Iniciá sesión y seleccioná un vendedor para poner la venta en espera.');
    return;
  }

  const payload = {
    items: cart.getItems(),
    adjustment: cart.getAdjustment ? cart.getAdjustment() : { type: 'NONE', value: 0 },
    notes,
    customer_id: customerAccount || null,
    salesperson_user_id: salespersonId,
    salesperson_name: salesperson,
    total: cart.calculateTotal()
  };
  try {
    const parkedTicket = await window.OperationalApi.parkPosTicket({ supabaseClient, authContext, draft: payload });
    await loadParkedPosTickets();
    activeParkedTicketId = null;
    cart.clear();
    const cashTenderedInput = document.getElementById('pos-cash-tendered-input');
    if (cashTenderedInput) cashTenderedInput.value = '';
    updatePosCashChangeDisplay();
    clearPosDiscount();
    renderPosCartItems();
    if (document.getElementById('pos-notes-input')) document.getElementById('pos-notes-input').value = '';
    if (typeof showToast === 'function') {
      const parkedNumber = parkedTicket?.document_number || `#${parkedTicket?.ticket_number || ''}`;
      showToast(`⏸️ Venta ${parkedNumber} por $${payload.total.toLocaleString('es-AR')} puesta en espera.`);
    }
  } catch (error) {
    console.error('No se pausó la venta:', error);
    alert(`No se puso la venta en espera.\n\n${error.message || 'Error desconocido'}`);
  }
}
window.parkCurrentPosSale = parkCurrentPosSale;

function clearPosCartItems() {
  const cart = getPosCartEngine();
  if (!cart || cart.getItemCount() === 0) return;
  if (!confirm('¿Deseás vaciar todos los productos del ticket actual?')) return;
  cart.clear();
  activeParkedTicketId = null;
  clearPosDiscount();
  renderPosCartItems();
  if (document.getElementById('pos-notes-input')) document.getElementById('pos-notes-input').value = '';
}
window.clearPosCartItems = clearPosCartItems;

async function openPosParkedTicketsModal() {
  if (window.AppConfig?.get('rules.pos.parkedTicketsEnabled', true) === false) return;
  const modal = document.getElementById('pos-parked-tickets-modal');
  const list = document.getElementById('pos-parked-tickets-list');
  if (!modal || !list) return;

  await loadParkedPosTickets();
  const tickets = getParkedPosTickets();
  if (tickets.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; padding: 24px; color: var(--color-text-muted);">
        No hay ventas en espera actualmente.
      </div>
    `;
  } else {
    list.innerHTML = tickets.map(t => {
      const timeStr = new Date(t.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      const payload = t.payload || {};
      const items = Array.isArray(payload.items) ? payload.items : [];
      const itemsSummary = items.map(i => `${i.quantity}x ${i.name}`).join(', ');
      return `
        <div style="background: rgba(255,152,0,0.06); border: 1.5px solid #ffe082; border-radius: 10px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center;">
          <div style="flex: 1; min-width: 0; padding-right: 8px;">
            <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 2px;">
              <span style="font-size: 0.75rem; font-weight: 800; color: #e65100;">🕒 ${timeStr}</span>
              <span style="font-size: 0.75rem; font-weight: 800; color: var(--color-accent-gold);">· ${escapeStockHtml(t.document_number || `Ticket #${t.ticket_number}`)}</span>
              <span style="font-size: 0.75rem; color: var(--color-text-muted);">· ${escapeStockHtml(payload.salesperson_name || 'Vendedor')}</span>
            </div>
            <p style="margin: 0 0 2px 0; font-size: 0.82rem; font-weight: 600; color: var(--color-text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeStockHtml(itemsSummary)}
            </p>
            <strong style="font-size: 0.95rem; color: var(--color-accent-gold);">${Number(payload.total || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <button type="button" class="btn btn-primary" onclick="resumeParkedPosSale('${t.id}')" style="padding: 6px 10px; font-size: 0.78rem; font-weight: 800; background: #2e7d32; border-radius: 6px; color: #fff; border: none; cursor: pointer;">
              ▶ Recuperar
            </button>
            <button type="button" class="btn btn-secondary" onclick="cancelParkedPosSale('${t.id}')" style="padding: 6px 8px; font-size: 0.78rem; color: #c62828; border-color: #ef9a9a; border-radius: 6px; cursor: pointer;" title="Cancelar ticket">
              ✕
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  modal.style.display = 'flex';
}
window.openPosParkedTicketsModal = openPosParkedTicketsModal;

function closePosParkedTicketsModal() {
  const modal = document.getElementById('pos-parked-tickets-modal');
  if (modal) modal.style.display = 'none';
}
window.closePosParkedTicketsModal = closePosParkedTicketsModal;

function resumeParkedPosSale(ticketId) {
  const tickets = getParkedPosTickets();
  const index = tickets.findIndex(t => t.id === ticketId);
  if (index === -1) return;

  const ticket = tickets[index];
  const payload = ticket.payload || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const cart = getPosCartEngine();
  if (cart) {
    if (cart.getItemCount() > 0) {
      if (!confirm('El ticket actual tiene ítems. ¿Deseás reemplazarlos con la venta recuperada?')) {
        return;
      }
    }
    cart.clear();
    const restored = items.every(item => cart.addItem(item));
    if (!restored) {
      cart.clear();
      renderPosCartItems();
      alert('No se pudo reconstruir el ticket completo. La venta sigue guardada en espera y no fue modificada.');
      return;
    }
    if (payload.adjustment && typeof cart.setAdjustment === 'function') {
      cart.setAdjustment(payload.adjustment.type, payload.adjustment.value);
    }
    renderPosCartItems();
  }

  if (payload.notes && document.getElementById('pos-notes-input')) {
    document.getElementById('pos-notes-input').value = payload.notes;
  }
  const salespersonSelect = document.getElementById('pos-salesperson-select');
  if (salespersonSelect && payload.salesperson_user_id) salespersonSelect.value = payload.salesperson_user_id;
  const accountSelect = document.getElementById('pos-current-account-select');
  if (accountSelect && payload.customer_id) accountSelect.value = payload.customer_id;
  activeParkedTicketId = ticket.id;
  closePosParkedTicketsModal();

  if (typeof showToast === 'function') {
    showToast('✓ Venta recuperada al ticket.');
  }
}
window.resumeParkedPosSale = resumeParkedPosSale;

async function cancelParkedPosSale(ticketId) {
  if (!confirm('¿Seguro que deseás descartar esta venta en espera?')) return;
  const authContext = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  try {
    await window.OperationalApi.cancelParkedPosTicket({ supabaseClient, authContext, ticketId });
    if (activeParkedTicketId === ticketId) activeParkedTicketId = null;
    await openPosParkedTicketsModal();
  } catch (error) {
    console.error('No se canceló el ticket en espera:', error);
    alert(`No se canceló el ticket.\n\n${error.message || 'Error desconocido'}`);
  }
}
window.cancelParkedPosSale = cancelParkedPosSale;

// ==========================================
// 📲 MODAL POST-VENTA MULTICANAL & COMPROBANTES
// ==========================================

let posLastCompletedReceipt = null;

function getCompletedSalePresentation() {
  if (!posLastCompletedReceipt) return null;
  const { receipt = {}, draft = {} } = posLastCompletedReceipt;
  const authoritativeItems = Array.isArray(receipt.items) && receipt.items.length > 0
    ? receipt.items.map(item => ({
      name: item.name,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unit_price || 0),
      lineTotal: Number(item.line_total || 0),
      lineType: item.line_type || 'OWN_STOCK'
    }))
    : (draft.items || []).map(item => ({
      name: item.name,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unit_price ?? item.price ?? 0),
      lineTotal: Number(item.subtotal ?? ((item.unit_price ?? item.price ?? 0) * item.quantity)),
      lineType: item.line_type || 'OWN_STOCK'
    }));
  return {
    receipt,
    draft,
    saleNumber: receipt.document_number || receipt.sale_number || receipt.sale_id || draft.draft_id || 'TICKET',
    total: Number(receipt.total ?? draft.total ?? 0),
    items: authoritativeItems,
    payments: Array.isArray(receipt.payments) ? receipt.payments : [],
    brandName: window.AppConfig?.get('brand.texts.name', 'BÔ Grow Club') || 'BÔ Grow Club',
    brandAddress: window.AppConfig?.get('brand.texts.address', '') || '',
    salesperson: draft.salesperson_name_snapshot || 'Vendedor'
  };
}

function showPosPostSaleModal(receipt, draft) {
  posLastCompletedReceipt = { receipt, draft };
  const modal = document.getElementById('pos-post-sale-modal');
  const docNumEl = document.getElementById('pos-post-sale-doc-num');
  const summaryEl = document.getElementById('pos-post-sale-summary-card');
  if (!modal) return;

  const presentation = getCompletedSalePresentation();
  const saleNumber = presentation.saleNumber;
  const total = presentation.total;
  const items = presentation.items;
  const paymentMethod = draft?.payment_method || 'EFECTIVO';

  if (docNumEl) docNumEl.textContent = `Comprobante #${saleNumber}`;
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span>Medio de cobro:</span>
        <strong>${escapeStockHtml(paymentMethod)}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span>Ítems vendidos:</span>
        <strong>${items.length} (${items.reduce((s, i) => s + Number(i.quantity || 0), 0)} u.)</strong>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span>Atendido por:</span>
        <strong>${escapeStockHtml(draft?.salesperson_name_snapshot || 'Vendedor')}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 1.15rem; font-weight: 900; color: #152d24; border-top: 1px dashed rgba(0,0,0,0.1); padding-top: 6px; margin-top: 6px;">
        <span>Total abonado:</span>
        <strong style="color: #2e7d32;">${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong>
      </div>
    `;
  }

  modal.style.display = 'flex';
}
window.showPosPostSaleModal = showPosPostSaleModal;

function closePosPostSaleModalAndNewSale() {
  const modal = document.getElementById('pos-post-sale-modal');
  if (modal) modal.style.display = 'none';
  const unifiedInput = document.getElementById('pos-unified-search');
  if (unifiedInput) {
    unifiedInput.value = '';
    unifiedInput.focus();
  }
}
window.closePosPostSaleModalAndNewSale = closePosPostSaleModalAndNewSale;

function printCurrentSaleThermalTicket() {
  const data = getCompletedSalePresentation();
  if (!data) return;
  const { saleNumber, total, items, brandName, brandAddress, salesperson, draft } = data;
  const dateStr = new Date().toLocaleString('es-AR');
  const printWindow = window.open('', '_blank', 'width=380,height=600');
  if (!printWindow) return;
  const ticketCopy = copyType => `
    <section class="ticket-copy">
      <div class="center bold brand">${escapeStockHtml(brandName)}</div>
      ${brandAddress ? `<div class="center">${escapeStockHtml(brandAddress)}</div>` : ''}
      <div class="center copy-type">${copyType}</div>
      <div class="divider"></div>
      <div><strong>COMPROBANTE NO FISCAL</strong></div>
      <div>N.º: ${escapeStockHtml(String(saleNumber))}</div>
      <div>Fecha: ${dateStr}</div>
      <div>Vendedor: ${escapeStockHtml(salesperson)}</div>
      <div class="divider"></div>
      <table>
        <thead><tr><th align="left">Cant.</th><th align="left">Desc.</th><th align="right">Total</th></tr></thead>
        <tbody>${items.map(item => `
          <tr><td>${item.quantity}x</td><td>${escapeStockHtml(item.name)}</td><td class="right">$${item.lineTotal.toLocaleString('es-AR')}</td></tr>
        `).join('')}</tbody>
      </table>
      <div class="divider"></div>
      <div class="total"><span>TOTAL:</span><span>$${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></div>
      <div>Forma de pago: ${escapeStockHtml(draft.payment_method || 'EFECTIVO')}</div>
      <div class="divider"></div>
      <div class="center thanks">¡Gracias por tu compra!</div>
    </section>`;
  printWindow.document.write(`
    <!DOCTYPE html><html lang="es">
    <head>
      <meta charset="utf-8">
      <title>Ticket ${escapeStockHtml(String(saleNumber))}</title>
      <style>
        @page { margin: 0; size: 80mm auto; }
        body { font-family: monospace; font-size: 12px; margin: 0; padding: 10px; width: 72mm; color: #000; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .divider { border-top: 1px dashed #000; margin: 6px 0; }
        table { width: 100%; font-size: 11px; border-collapse: collapse; }
        td { padding: 2px 0; }
        .right { text-align: right; }
        .brand { font-size: 14px; }
        .copy-type { margin-top: 5px; font-weight: bold; }
        .total { display:flex; justify-content:space-between; font-size:14px; font-weight:bold; }
        .thanks { font-size:10px; }
        .ticket-copy { page-break-inside: avoid; }
        .cut-line { border-top: 1px dashed #000; margin: 16px 0; text-align:center; font-size:9px; padding-top:3px; }
      </style>
    </head>
    <body>
      ${ticketCopy('ORIGINAL · CLIENTE')}
      ${shouldPrintDuplicateReceipts() ? `<div class="cut-line">✂ CORTE</div>${ticketCopy('DUPLICADO · LOCAL')}` : ''}
      <script>
        window.onload = function() { window.print(); window.close(); };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
window.printCurrentSaleThermalTicket = printCurrentSaleThermalTicket;

function sendCurrentSaleWhatsApp() {
  const data = getCompletedSalePresentation();
  if (!data) return;
  const { saleNumber, total, items, brandName, draft } = data;

  const text = encodeURIComponent(
    `🌱 *${brandName} - Comprobante de Compra*\n` +
    `📄 *Ticket:* #${saleNumber}\n` +
    `📅 *Fecha:* ${new Date().toLocaleDateString('es-AR')}\n\n` +
    `*Detalle:*\n` +
    items.map(item => `• ${item.quantity}x ${item.name} ($${item.lineTotal.toLocaleString('es-AR')})`).join('\n') +
    `\n\n*TOTAL ABONADO:* ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}\n` +
    `💳 *Medio de Pago:* ${draft?.payment_method || 'Efectivo'}\n\n` +
    `¡Muchas gracias por elegirnos! 🌱`
  );

  window.open(`https://wa.me/?text=${text}`, '_blank');
}
window.sendCurrentSaleWhatsApp = sendCurrentSaleWhatsApp;

function printCurrentSaleA4Pdf() {
  const data = getCompletedSalePresentation();
  if (!data) return;
  const { saleNumber, total, items, brandName, brandAddress, salesperson, draft } = data;
  const printWindow = window.open('', '_blank', 'width=900,height=900');
  if (!printWindow) return;
  const copy = copyType => `
    <section class="copy">
      <header><div><h1>${escapeStockHtml(brandName)}</h1>${brandAddress ? `<p>${escapeStockHtml(brandAddress)}</p>` : ''}</div><strong>${copyType}</strong></header>
      <div class="meta"><span>Comprobante no fiscal: ${escapeStockHtml(String(saleNumber))}</span><span>${new Date().toLocaleString('es-AR')}</span><span>Vendedor: ${escapeStockHtml(salesperson)}</span></div>
      <table><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Total</th></tr></thead><tbody>
        ${items.map(item => `<tr><td>${escapeStockHtml(item.name)}</td><td>${item.quantity}</td><td>$${item.unitPrice.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td><td>$${item.lineTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td></tr>`).join('')}
      </tbody></table>
      <div class="footer"><span>Medio de cobro: ${escapeStockHtml(draft.payment_method || 'EFECTIVO')}</span><strong>TOTAL: $${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong></div>
    </section>`;
  printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante ${escapeStockHtml(String(saleNumber))}</title><style>
    @page{size:A4 portrait;margin:10mm}body{font-family:Arial,sans-serif;color:#152d24;margin:0}.copy{border:1.5px solid #152d24;border-radius:10px;padding:15px;margin-bottom:16px;page-break-inside:avoid}.copy header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #c2a246;padding-bottom:8px}.copy h1{font-size:20px;margin:0}.copy p{font-size:10px;color:#555;margin:3px 0 0}.copy header>strong{font-size:11px;background:#152d24;color:#fff;padding:5px 8px;border-radius:5px}.meta{display:flex;justify-content:space-between;gap:10px;font-size:10px;padding:8px 0}.copy table{width:100%;border-collapse:collapse;font-size:11px}.copy th,.copy td{padding:6px;border-bottom:1px solid #ddd;text-align:right}.copy th:first-child,.copy td:first-child{text-align:left}.footer{display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:11px}.footer strong{font-size:15px}.cut{border-top:1px dashed #777;text-align:center;font-size:9px;padding-top:3px;margin:4px 0 12px}
  </style></head><body>${copy('ORIGINAL · CLIENTE')}${shouldPrintDuplicateReceipts() ? `<div class="cut">✂ LÍNEA DE CORTE</div>${copy('DUPLICADO · LOCAL')}` : ''}<script>window.onload=()=>{window.print();window.close()}<\/script></body></html>`);
  printWindow.document.close();
}
window.printCurrentSaleA4Pdf = printCurrentSaleA4Pdf;

function sendCurrentSaleEmail() {
  const data = getCompletedSalePresentation();
  if (!data) return;
  const { saleNumber, total, brandName } = data;
  const formattedTotal = total.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
  const subject = encodeURIComponent(`Comprobante de compra ${brandName} #${saleNumber}`);
  const body = encodeURIComponent(`Hola:\n\nTe compartimos los datos de tu compra #${saleNumber}, por un total de ${formattedTotal}.\n\nEste correo se preparó desde el sistema; podés adjuntar el comprobante guardado en PDF antes de enviarlo.\n\n¡Gracias por elegir ${brandName}!`);
  window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
}
window.sendCurrentSaleEmail = sendCurrentSaleEmail;


// ============================================================================
// 🚚 HUB DE ENTREGAS Y SEGUIMIENTO DE ENCARGOS (FULFILLMENT HUB)
// ============================================================================

let fulfillmentsHubData = [];
let fulfillmentsStatusFilter = 'ALL';
let fulfillmentsSearchQuery = '';
let activeFulfillmentForModal = null;

async function initFulfillmentsWorkspace() {
  await loadFulfillmentsData(true);
}
window.initFulfillmentsWorkspace = initFulfillmentsWorkspace;

async function loadFulfillmentsData(forceRefresh = false) {
  const tbody = document.getElementById('vendor-fulfillments-table-body');
  if (tbody && fulfillmentsHubData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--color-text-muted);">Cargando seguimiento de encargos y entregas...</td></tr>';
  }

  try {
    const authContext = (typeof SaasAuth !== 'undefined' && SaasAuth.getTenantContext) ? SaasAuth.getTenantContext() : null;
    const client = (typeof supabaseClient !== 'undefined') ? supabaseClient : null;

    if (!client || !authContext?.isVerified || typeof OperationalApi === 'undefined' || !OperationalApi.fetchSaleFulfillments) {
      throw new Error('Iniciá sesión para consultar el seguimiento central de encargos.');
    }
    const response = await OperationalApi.fetchSaleFulfillments({
      supabaseClient: client,
      authContext,
      statusFilter: fulfillmentsStatusFilter === 'ALL' ? null : fulfillmentsStatusFilter,
      query: fulfillmentsSearchQuery || null
    });
    const items = response?.items || [];

    fulfillmentsHubData = items;
    renderFulfillmentsKPIs();
    renderFulfillmentsTable();
  } catch (error) {
    console.error('Error al cargar entregas y encargos:', error);
    fulfillmentsHubData = [];
    renderFulfillmentsKPIs();
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:28px;color:#c62828;">${escapeStockHtml(error.message || 'No se pudo cargar el seguimiento central.')}</td></tr>`;
    }
  }
}
window.loadFulfillmentsData = loadFulfillmentsData;

function renderFulfillmentsKPIs() {
  const pending = fulfillmentsHubData.filter(i => i.status === 'PENDING' || i.status === 'ORDERED').length;
  const inTransit = fulfillmentsHubData.filter(i => i.status === 'IN_TRANSIT').length;
  const ready = fulfillmentsHubData.filter(i => i.status === 'READY_FOR_PICKUP').length;
  const fulfilled = fulfillmentsHubData.filter(i => i.status === 'FULFILLED').length;

  const pendingEl = document.getElementById('fulfillments-kpi-pending');
  const transitEl = document.getElementById('fulfillments-kpi-in-transit');
  const readyEl = document.getElementById('fulfillments-kpi-ready');
  const fulfilledEl = document.getElementById('fulfillments-kpi-fulfilled');
  const sidebarBadge = document.getElementById('vendor-sidebar-fulfillments-badge');

  if (pendingEl) pendingEl.textContent = `${pending} u.`;
  if (transitEl) transitEl.textContent = `${inTransit} u.`;
  if (readyEl) readyEl.textContent = `${ready} u.`;
  if (fulfilledEl) fulfilledEl.textContent = `${fulfilled} u.`;

  const activeAlerts = pending + ready;
  if (sidebarBadge) {
    sidebarBadge.textContent = String(activeAlerts);
    sidebarBadge.hidden = activeAlerts === 0;
  }
}

function setFulfillmentsStatusFilter(status) {
  fulfillmentsStatusFilter = status || 'ALL';
  const filterMap = {
    ALL: 'ful-filter-all',
    PENDING: 'ful-filter-pending',
    ORDERED: 'ful-filter-ordered',
    IN_TRANSIT: 'ful-filter-transit',
    READY_FOR_PICKUP: 'ful-filter-ready',
    FULFILLED: 'ful-filter-fulfilled'
  };

  Object.entries(filterMap).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', key === fulfillmentsStatusFilter);
  });

  renderFulfillmentsTable();
}
window.setFulfillmentsStatusFilter = setFulfillmentsStatusFilter;

function handleFulfillmentsSearchInput(query) {
  fulfillmentsSearchQuery = (query || '').toLowerCase().trim();
  renderFulfillmentsTable();
}
window.handleFulfillmentsSearchInput = handleFulfillmentsSearchInput;

function renderFulfillmentsTable() {
  const tbody = document.getElementById('vendor-fulfillments-table-body');
  if (!tbody) return;

  let filtered = [...fulfillmentsHubData];

  if (fulfillmentsStatusFilter !== 'ALL') {
    filtered = filtered.filter(i => i.status === fulfillmentsStatusFilter);
  }

  if (fulfillmentsSearchQuery) {
    filtered = filtered.filter(i => {
      const matchText = [
        i.customer_name,
        i.customer_phone,
        i.product_name,
        i.product_sku,
        i.sale_number,
        i.source_name,
        i.notes
      ].filter(Boolean).join(' ').toLowerCase();
      return matchText.includes(fulfillmentsSearchQuery);
    });
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 32px; color: var(--color-text-muted);">
          <span style="font-size: 2rem; display: block; margin-bottom: 6px;">🚚</span>
          <strong>No hay encargos o entregas en esta sección</strong>
          <p style="margin: 4px 0 0 0; font-size: 0.82rem;">Cuando vendas un producto sin stock físico o del catálogo B2B, aparecerá automáticamente aquí.</p>
        </td>
      </tr>
    `;
    return;
  }

  const statusConfig = {
    PENDING: { label: '🕒 Pendiente Compra', bg: 'rgba(255,152,0,0.12)', color: '#e65100', border: '#ffb74d' },
    ORDERED: { label: '🛒 Pedido Proveedor', bg: 'rgba(33,150,243,0.12)', color: '#1565c0', border: '#90caf9' },
    IN_TRANSIT: { label: '🚚 En Camino', bg: 'rgba(0,150,136,0.12)', color: '#00695c', border: '#80cbc4' },
    READY_FOR_PICKUP: { label: '📦 Listo en Local', bg: 'rgba(76,175,80,0.14)', color: '#2e7d32', border: '#81c784' },
    FULFILLED: { label: '✅ Entregado', bg: 'rgba(0,0,0,0.06)', color: 'var(--color-text-muted)', border: 'var(--color-border-subtle)' },
    CANCELLED: { label: '✕ Cancelado', bg: 'rgba(211,47,47,0.1)', color: '#c62828', border: '#ef9a9a' }
  };

  const lineTypeConfig = {
    OWN_BACKORDER: { label: 'Propio (Por Encargo)', bg: 'rgba(194,162,70,0.15)', color: '#8d701f' },
    B2B_BACKORDER: { label: '🏭 Catálogo B2B', bg: 'rgba(33,150,243,0.12)', color: '#1565c0' },
    LOCAL_STORE_BACKORDER: { label: '🏪 Tienda Vecina', bg: 'rgba(156,39,176,0.12)', color: '#7b1fa2' },
    QUICK_ENTRY: { label: '⚡ Venta Rápida', bg: 'rgba(76,175,80,0.12)', color: '#2e7d32' }
  };

  tbody.innerHTML = filtered.map(item => {
    const st = statusConfig[item.status] || statusConfig.PENDING;
    const lt = lineTypeConfig[item.line_type] || lineTypeConfig.OWN_BACKORDER;
    const dateStr = item.sale_created_at ? new Date(item.sale_created_at).toLocaleDateString('es-AR') : '--/--';
    const expDateStr = item.expected_delivery_date || 'A coordinar';

    return `
      <tr style="border-bottom: 1px solid var(--color-border-subtle); vertical-align: middle;">
        <td style="padding: 10px;">
          <strong style="display: block; color: var(--color-accent-gold);">#${escapeStockHtml(String(item.sale_number || 'TICKET'))}</strong>
          <small style="color: var(--color-text-muted);">${dateStr}</small>
        </td>
        <td style="padding: 10px;">
          <strong style="display: block; color: var(--color-text-main);">${escapeStockHtml(item.customer_name || 'Consumidor Final')}</strong>
          ${item.customer_phone ? `<small style="color: var(--color-text-muted);">📞 ${escapeStockHtml(item.customer_phone)}</small>` : '<small style="color: var(--color-text-muted);">Sin teléfono</small>'}
        </td>
        <td style="padding: 10px;">
          <div style="font-weight: 700; color: var(--color-text-main);">${escapeStockHtml(item.product_name)}</div>
          <span style="font-size: 0.78rem; font-weight: 800; color: var(--color-accent-gold);">${item.quantity} u.</span> · <small style="color: var(--color-text-muted);">${Number(item.line_total || 0).toLocaleString('es-AR')}</small>
        </td>
        <td style="padding: 10px;">
          <span style="display: inline-block; font-size: 0.72rem; font-weight: 800; padding: 2px 8px; border-radius: 6px; background: ${lt.bg}; color: ${lt.color}; margin-bottom: 2px;">
            ${lt.label}
          </span>
          ${item.source_name ? `<div style="font-size: 0.75rem; color: var(--color-text-muted);">${escapeStockHtml(item.source_name)}</div>` : ''}
        </td>
        <td style="padding: 10px;">
          <strong style="color: var(--color-text-main); font-size: 0.85rem;">${expDateStr}</strong>
        </td>
        <td style="padding: 10px;">
          <span style="display: inline-block; font-size: 0.76rem; font-weight: 800; padding: 3px 10px; border-radius: 8px; background: ${st.bg}; color: ${st.color}; border: 1px solid ${st.border};">
            ${st.label}
          </span>
        </td>
        <td style="padding: 10px; text-align: right;">
          <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
            <button type="button" class="btn btn-secondary" onclick="openFulfillmentStatusModal('${item.id}')" style="padding: 5px 10px; font-size: 0.78rem; font-weight: 700; border-radius: 6px; cursor: pointer;" title="Cambiar Estado">
              🔄 Estado
            </button>
            <button type="button" class="btn btn-primary" onclick="sendFulfillmentWhatsApp('${item.id}')" style="padding: 5px 10px; font-size: 0.78rem; font-weight: 800; background: #25d366; border-color: #25d366; color: #fff; border-radius: 6px; cursor: pointer;" title="Enviar WhatsApp al cliente">
              📲 WhatsApp
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openFulfillmentStatusModal(fulfillmentId) {
  const item = fulfillmentsHubData.find(i => String(i.id) === String(fulfillmentId));
  if (!item) return;

  activeFulfillmentForModal = item;
  const modal = document.getElementById('fulfillments-status-modal');
  const summaryEl = document.getElementById('fulfillments-modal-product-summary');
  const selectEl = document.getElementById('fulfillments-modal-status-select');
  const notesEl = document.getElementById('fulfillments-modal-notes-input');

  if (summaryEl) {
    summaryEl.innerHTML = `
      <div style="font-size: 0.85rem; margin-bottom: 2px;"><strong>Ticket:</strong> #${escapeStockHtml(String(item.sale_number || 'N/A'))} · <strong>Cliente:</strong> ${escapeStockHtml(item.customer_name)}</div>
      <div style="font-size: 0.85rem; margin-bottom: 2px;"><strong>Producto:</strong> ${escapeStockHtml(item.product_name)} (${item.quantity} u.)</div>
      <div style="font-size: 0.8rem; color: var(--color-text-muted);"><strong>Proveedor / Origen:</strong> ${escapeStockHtml(item.source_name || 'Propio')}</div>
    `;
  }

  const allowedTransitions = {
    PENDING: ['ORDERED', 'CANCELLED'],
    ORDERED: ['IN_TRANSIT', 'CANCELLED'],
    IN_TRANSIT: ['READY_FOR_PICKUP', 'CANCELLED'],
    READY_FOR_PICKUP: ['FULFILLED', 'CANCELLED'],
    FULFILLED: [],
    CANCELLED: []
  };
  if (selectEl) {
    const nextStatuses = allowedTransitions[item.status] || [];
    selectEl.innerHTML = nextStatuses.length > 0
      ? nextStatuses.map(status => `<option value="${status}">${status}</option>`).join('')
      : `<option value="${item.status}">${item.status} · Estado final</option>`;
    selectEl.disabled = nextStatuses.length === 0;
  }
  if (notesEl) notesEl.value = item.notes || '';

  if (modal) modal.style.display = 'flex';
}
window.openFulfillmentStatusModal = openFulfillmentStatusModal;

function closeFulfillmentStatusModal() {
  const modal = document.getElementById('fulfillments-status-modal');
  if (modal) modal.style.display = 'none';
  activeFulfillmentForModal = null;
}
window.closeFulfillmentStatusModal = closeFulfillmentStatusModal;

async function handleFulfillmentStatusSubmit(event) {
  if (event) event.preventDefault();
  if (!activeFulfillmentForModal) return;

  const selectEl = document.getElementById('fulfillments-modal-status-select');
  const notesEl = document.getElementById('fulfillments-modal-notes-input');
  const newStatus = selectEl?.value || 'PENDING';
  const notes = (notesEl?.value || '').trim();
  const updatedItem = { ...activeFulfillmentForModal };

  try {
    const authContext = (typeof SaasAuth !== 'undefined' && SaasAuth.getTenantContext) ? SaasAuth.getTenantContext() : null;
    const client = (typeof supabaseClient !== 'undefined') ? supabaseClient : null;

    if (!client || !authContext?.isVerified || typeof OperationalApi === 'undefined' || !OperationalApi.updateSaleFulfillment) {
      throw new Error('Iniciá sesión para actualizar el encargo central.');
    }
    await OperationalApi.updateSaleFulfillment({
      supabaseClient: client,
      authContext,
      fulfillmentId: updatedItem.id,
      status: newStatus,
      notes: notes || null
    });

    closeFulfillmentStatusModal();
    await loadFulfillmentsData(true);

    if (typeof showToast === 'function') {
      showToast(`✓ Estado de encargo actualizado a ${newStatus}.`);
    }

    // Si pasó a listo para retirar, preguntar si desea enviar WhatsApp
    if (newStatus === 'READY_FOR_PICKUP') {
      setTimeout(() => {
        if (confirm(`¿Deseás avisar a ${updatedItem.customer_name} por WhatsApp que su pedido está listo para retirar en el local?`)) {
          sendFulfillmentWhatsApp(updatedItem.id, { ...updatedItem, status: newStatus });
        }
      }, 300);
    }
  } catch (error) {
    console.error('Error al actualizar estado:', error);
    alert(`No se pudo actualizar el estado: ${error.message || 'Error de conexión'}`);
  }
}
window.handleFulfillmentStatusSubmit = handleFulfillmentStatusSubmit;

function sendFulfillmentWhatsApp(fulfillmentId, itemOverride = null) {
  const item = itemOverride || fulfillmentsHubData.find(i => String(i.id) === String(fulfillmentId));
  if (!item) return;

  const phone = (item.customer_phone || '').replace(/[^0-9]/g, '');
  const customerName = item.customer_name || 'Cliente';
  const saleNum = item.sale_number || 'N/A';
  const productName = item.product_name || 'tu producto';
  const qty = item.quantity || 1;
  const brandName = window.AppConfig?.get('brand.texts.name', 'BÔ Grow Club') || 'BÔ Grow Club';

  let msgText = '';

  if (item.status === 'READY_FOR_PICKUP') {
    msgText = `¡Hola ${customerName}! 🌱 Te escribimos de *${brandName}*.\n\n¡Tu encargo ya está *LISTO PARA RETIRAR* en nuestro local! 📦✨\n\n📄 *Ticket:* #${saleNum}\n🛍️ *Detalle:* ${qty}x ${productName}\n\n📍 Podés pasar a retirarlo en nuestro horario habitual.\n¡Muchas gracias por elegirnos!`;
  } else if (item.status === 'IN_TRANSIT') {
    msgText = `¡Hola ${customerName}! 🌱 Te escribimos de *${brandName}*.\n\nTe contamos que tu encargo de *${qty}x ${productName}* (Ticket #${saleNum}) ya fue despachado por el proveedor y está en camino al local 🚚.\nTe avisamos apenas ingrese. ¡Gracias!`;
  } else {
    msgText = `¡Hola ${customerName}! 🌱 Te escribimos de *${brandName}* para comentarte sobre tu encargo (Ticket #${saleNum}): *${qty}x ${productName}*.\n\nEstado actual: *${item.status}*.\nCualquier consulta estamos a tu disposición.`;
  }

  const encoded = encodeURIComponent(msgText);
  const waUrl = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  window.open(waUrl, '_blank');
}
window.sendFulfillmentWhatsApp = sendFulfillmentWhatsApp;


// ============================================================================
// 🧮 CALCULADORA DE BILLETES ARS & PLANILLA FORMAL DE ARQUEO CON DUPLICADO
// ============================================================================

function openCashBillsCalculatorModal() {
  const modal = document.getElementById('cash-bills-calculator-modal');
  if (!modal) return;

  const savedBreakdown = cashData.cashBreakdown && typeof cashData.cashBreakdown === 'object'
    ? cashData.cashBreakdown
    : {};
  const denoms = [20000, 10000, 2000, 1000, 500, 200, 100];
  denoms.forEach(d => {
    const input = document.getElementById(`bill-qty-${d}`);
    if (input) input.value = savedBreakdown[d] !== undefined ? savedBreakdown[d] : '';
  });
  const coinsInput = document.getElementById('bill-qty-coins');
  if (coinsInput) coinsInput.value = savedBreakdown.coins !== undefined ? savedBreakdown.coins : '';

  updateBillsCalculatorTotal();
  modal.style.display = 'block';
  modal.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const firstInput = document.getElementById('bill-qty-20000');
  if (firstInput) setTimeout(() => firstInput.focus(), 60);
}
window.openCashBillsCalculatorModal = openCashBillsCalculatorModal;

function closeCashBillsCalculatorModal() {
  const modal = document.getElementById('cash-bills-calculator-modal');
  if (modal) modal.style.display = 'none';
}
window.closeCashBillsCalculatorModal = closeCashBillsCalculatorModal;

function getCashBillsStorageKey() {
  return `boeweb:cash-bills:v2:${canonicalCashView?.sessionId || 'no-session'}`;
}

function calculateBillsBreakdownTotal() {
  const denoms = [20000, 10000, 2000, 1000, 500, 200, 100];
  let total = 0;
  const breakdown = {};

  denoms.forEach(d => {
    const input = document.getElementById(`bill-qty-${d}`);
    const qty = parseInt(input?.value, 10) || 0;
    if (qty > 0) {
      breakdown[d] = qty;
      total += qty * d;
    }
  });

  const coinsInput = document.getElementById('bill-qty-coins');
  const coins = parseFloat(coinsInput?.value) || 0;
  if (coins > 0) {
    breakdown.coins = coins;
    total += coins;
  }

  return { total, breakdown };
}

function updateBillsCalculatorTotal() {
  const { total } = calculateBillsBreakdownTotal();
  const display = document.getElementById('bills-calculator-total-display');
  if (display) {
    display.textContent = `${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
  }
}
window.updateBillsCalculatorTotal = updateBillsCalculatorTotal;

function applyBillsCalculatorTotal() {
  const { total, breakdown } = calculateBillsBreakdownTotal();
  const countedEl = document.getElementById('cash-counted-amount');
  if (countedEl) {
    countedEl.value = total;
    updateCashDifferencePreview();
  }
  localStorage.setItem(getCashBillsStorageKey(), JSON.stringify(breakdown));
  closeCashBillsCalculatorModal();
  if (typeof showToast === 'function') {
    showToast(`✓ Conteo de billetes aplicado: ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`);
  }
}
window.applyBillsCalculatorTotal = applyBillsCalculatorTotal;

function printCashClosureSheet(dateKey = null) {
  const targetDateKey = dateKey || getTodayDateKey();
  const cashData = getVendorCashData(targetDateKey);
  if (!cashData.closed || !cashData.closureId || !cashData.closureDocumentNumber) {
    alert('La planilla se imprime únicamente después de un cierre central con numeración documental.');
    return;
  }
  const totals = calculateCashTotals(cashData);
  const dateStr = new Date().toLocaleString('es-AR');
  const vendorName = getVerifiedOperatorName(cashData.closedBy);
  const savedBreakdown = JSON.parse(localStorage.getItem(getCashBillsStorageKey()) || '{}');
  const brandName = window.AppConfig?.get('brand.texts.name', 'BÔ Grow Club') || 'BÔ Grow Club';
  const brandAddress = window.AppConfig?.get('brand.texts.address', '') || '';
  const breakdownRows = Object.entries(savedBreakdown)
    .filter(([, quantity]) => Number(quantity) > 0)
    .map(([denomination, quantity]) => denomination === 'coins'
      ? `<span>Monedas: <strong>$${Number(quantity).toLocaleString('es-AR')}</strong></span>`
      : `<span>$${Number(denomination).toLocaleString('es-AR')} × <strong>${Number(quantity)}</strong></span>`)
    .join(' · ');

  const countedAmount = Number(cashData.countedCash || 0);
  const difference = Number(cashData.difference ?? (countedAmount - totals.expectedCash));
  const notes = cashData.closureNotes || 'Cierre de turno habitual';

  const diffLabel = Math.abs(difference) < 0.01
    ? '✓ CAJA CUADRADA EXACTA ($0,00)'
    : (difference > 0
      ? `▲ SOBRANTE DE CAJA: +${difference.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
      : `▼ FALTANTE DE CAJA: -${Math.abs(difference).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`);

  const diffColor = Math.abs(difference) < 0.01 ? '#2e7d32' : (difference > 0 ? '#1565c0' : '#c62828');

  const printWindow = window.open('', '_blank', 'width=800,height=900');
  if (!printWindow) return;

  const closureTemplate = (copyType) => `
    <div style="border: 2px solid #152d24; border-radius: 10px; padding: 16px; margin-bottom: 20px; page-break-inside: avoid; font-family: sans-serif; font-size: 11px;">

      <!-- Encabezado Institucional -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #152d24; padding-bottom: 8px; margin-bottom: 10px;">
        <div>
          <strong style="font-size: 16px; color: #152d24; display: block;">${escapeCashHtml(brandName)}</strong>
          ${brandAddress ? `<small style="color: #666; font-size: 9px;">${escapeCashHtml(brandAddress)}</small>` : ''}
        </div>
        <div style="text-align: right;">
          <span style="font-size: 10px; font-weight: 800; background: #152d24; color: #fff; padding: 3px 8px; border-radius: 4px; text-transform: uppercase;">${copyType}</span>
          <div style="font-size: 9px; color: #666; margin-top: 3px;">Fecha: ${dateStr}</div>
        </div>
      </div>

      <div style="text-align: center; font-size: 13px; font-weight: 900; color: #152d24; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">
        Planilla de Arqueo y Cierre de Turno · ${escapeCashHtml(cashData.closureDocumentNumber)}
      </div>

      <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 10px; background: #f5f5f5; padding: 6px 10px; border-radius: 6px;">
        <span><strong>Cajero / Turno:</strong> ${escapeCashHtml(vendorName)}</span>
        <span><strong>Estado:</strong> ${cashData.closed ? 'CERRADA' : 'EN CURSO'}</span>
        <span><strong>ID Sesión:</strong> ${escapeCashHtml(String(cashData.sessionId || 'SESS-LOCAL'))}</span>
      </div>

      <!-- Cuadro de Conciliación Contable -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px;">
        <thead>
          <tr style="background: #e8f5e9; border-bottom: 1.5px solid #2e7d32;">
            <th align="left" style="padding: 5px;">Concepto Financiero</th>
            <th align="right" style="padding: 5px;">Subtotal</th>
            <th align="right" style="padding: 5px;">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 4px;">(+) Fondo Inicial de Apertura</td>
            <td align="right" style="padding: 4px;">${Number(totals.openingCash || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
            <td align="right" style="padding: 4px;"></td>
          </tr>
          <tr>
            <td style="padding: 4px;">(+) Ventas en Efectivo del Turno</td>
            <td align="right" style="padding: 4px;">${Number(totals.cashSales || totals.cashIncome || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
            <td align="right" style="padding: 4px;"></td>
          </tr>
          <tr>
            <td style="padding: 4px;">(+) Otros Ingresos / Cobranzas Efectivo</td>
            <td align="right" style="padding: 4px;">${Number(totals.otherCashIncome || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
            <td align="right" style="padding: 4px;"><strong>${Number((totals.openingCash || 0) + (totals.cashSales || totals.cashIncome || 0) + (totals.otherCashIncome || 0)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong></td>
          </tr>
          <tr style="color: #c62828;">
            <td style="padding: 4px;">(−) Gastos Operativos de Caja</td>
            <td align="right" style="padding: 4px;">−${Number(totals.expenses || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
            <td align="right" style="padding: 4px;"></td>
          </tr>
          <tr style="color: #c62828;">
            <td style="padding: 4px;">(−) Retiros de Propietario / Tesorería</td>
            <td align="right" style="padding: 4px;">−${Number(totals.withdrawals || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
            <td align="right" style="padding: 4px;"><strong>−${Number((totals.expenses || 0) + (totals.withdrawals || 0)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong></td>
          </tr>
          <tr style="border-top: 1.5px solid #152d24; font-weight: bold; background: #fafafa;">
            <td style="padding: 6px;">(=) EFECTIVO TEÓRICO ESPERADO EN CAJA</td>
            <td></td>
            <td align="right" style="padding: 6px; font-size: 12px; color: #152d24;">${totals.expectedCash.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
          </tr>
          <tr style="font-weight: bold; background: #e8f5e9;">
            <td style="padding: 6px;">(•) EFECTIVO FÍSICO CONTADO (DECLARADO)</td>
            <td></td>
            <td align="right" style="padding: 6px; font-size: 12px; color: #2e7d32;">${countedAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
          </tr>
          <tr style="border-top: 1px dashed #ccc; font-weight: 900; background: #fff;">
            <td style="padding: 6px; color: ${diffColor};">${diffLabel}</td>
            <td></td>
            <td align="right" style="padding: 6px; font-size: 12px; color: ${diffColor};">
              ${difference > 0 ? '+' : ''}${difference.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </td>
          </tr>
        </tbody>
      </table>

      <div style="font-size:10px;background:#f5f5f5;border:1px solid #ddd;border-radius:6px;padding:7px 9px;margin-bottom:10px;">
        <strong>Desglose físico declarado:</strong> ${breakdownRows || 'Sin desglose por denominación'}
      </div>

      <!-- Desglose de Medios Digitales / No Físicos -->
      <div style="background: #f9fbe7; border: 1px solid #c0ca33; border-radius: 6px; padding: 8px 10px; margin-bottom: 10px;">
        <strong style="font-size: 10px; color: #827717; text-transform: uppercase;">Resumen de Medios Digitales & Externos (No afectan efectivo en gaveta):</strong>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 4px; font-size: 10px;">
          <div>📱 <strong>MercadoPago:</strong> ${Number(totals.mpIncome || 0).toLocaleString('es-AR')}</div>
          <div>🏦 <strong>Transferencia:</strong> ${Number(totals.transferIncome || 0).toLocaleString('es-AR')}</div>
          <div>💳 <strong>Tarjetas:</strong> ${Number(totals.cardIncome || 0).toLocaleString('es-AR')}</div>
          <div>📝 <strong>Cuenta Cte:</strong> ${Number(totals.accountCreditIncome || 0).toLocaleString('es-AR')}</div>
        </div>
      </div>

      <!-- Observaciones -->
      <div style="font-size: 10px; margin-bottom: 12px; border-top: 1px dashed #ccc; padding-top: 6px;">
        <strong>Observaciones del Cierre:</strong> ${escapeCashHtml(notes)}
      </div>

      <!-- Firmas de Responsabilidad -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 30px; text-align: center; font-size: 10px;">
        <div style="border-top: 1px solid #152d24; padding-top: 4px;">
          <strong>Firma y Aclaración del Cajero</strong><br>
          <small style="color: #666;">Declaración jurada de valores contados</small>
        </div>
        <div style="border-top: 1px solid #152d24; padding-top: 4px;">
          <strong>Firma y Aclaración de Supervisor</strong><br>
          <small style="color: #666;">Conformidad de arqueo y control central</small>
        </div>
      </div>

    </div>
  `;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Planilla de Arqueo ${escapeCashHtml(brandName)} - ${targetDateKey}</title>
      <style>
        @page { margin: 8mm; size: A4 portrait; }
        body { font-family: sans-serif; margin: 0; padding: 10px; color: #000; background: #fff; }
        .cut-line { border-top: 1.5px dashed #888; margin: 20px 0; position: relative; text-align: center; }
        .cut-line span { background: #fff; padding: 0 10px; font-size: 9px; color: #666; position: relative; top: -8px; }
      </style>
    </head>
    <body>
      ${closureTemplate('ORIGINAL · ADMINISTRACIÓN / TESORERÍA')}
      ${shouldPrintDuplicateReceipts() ? `<div class="cut-line"><span>✂ Línea de corte · Segundo ejemplar</span></div>${closureTemplate('DUPLICADO · CAJERO / CONSTANCIA DE TURNO')}` : ''}
      <script>
        window.onload = function() { window.print(); window.close(); };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
window.printCashClosureSheet = printCashClosureSheet;


// ============================================================================
// 🧾 RECIBOS OFICIALES DE COBRANZA EN CUENTA CORRIENTE CON DUPLICADO
// ============================================================================

function printCustomerPaymentReceipt(paymentData) {
  if (!paymentData || !paymentData.account) return;
  const { account, amount, method, notes, previousBalance, balance, receiptId, date } = paymentData;
  if (!receiptId) {
    alert('Esta cobranza no posee numeración documental central. No se generará un recibo informal.');
    return;
  }
  const vendorName = getVerifiedOperatorName();
  const brandName = window.AppConfig?.get('brand.texts.name', 'BÔ Grow Club') || 'BÔ Grow Club';
  const brandAddress = window.AppConfig?.get('brand.texts.address', '') || '';
  const dateStr = new Date(date || Date.now()).toLocaleString('es-AR');

  const printWindow = window.open('', '_blank', 'width=420,height=720');
  if (!printWindow) return;

  const receiptTemplate = (copyType) => `
    <div style="border: 1.5px solid #152d24; border-radius: 8px; padding: 12px; margin-bottom: 16px; page-break-inside: avoid; font-family: sans-serif; font-size: 11px;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #152d24; padding-bottom: 6px; margin-bottom: 8px;">
        <div>
          <strong style="font-size: 13px; color: #152d24; display: block;">${escapeStockHtml(brandName)}</strong>
          ${brandAddress ? `<small style="font-size: 9px; color: #666;">${escapeStockHtml(brandAddress)}</small>` : ''}
        </div>
        <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; background: #eee; padding: 2px 6px; border-radius: 4px;">${copyType}</span>
      </div>

      <div style="font-size: 11px; font-weight: 800; color: #2e7d32; text-align: center; margin-bottom: 8px; text-transform: uppercase;">
        Recibo de Cobranza en Cuenta Corriente · Comprobante interno no fiscal
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 10px; margin-bottom: 8px; background: #f9f9f9; padding: 6px; border-radius: 4px;">
        <div><strong>Recibo N.º:</strong> ${escapeStockHtml(String(receiptId))}</div>
        <div><strong>Fecha:</strong> ${dateStr}</div>
        <div><strong>Cliente:</strong> ${escapeStockHtml(account.customer_name)}</div>
        <div><strong>DNI / CUIT:</strong> ${escapeStockHtml(account.dni || 'S/D')}</div>
        <div><strong>Medio de Pago:</strong> ${escapeStockHtml(method || 'EFECTIVO')}</div>
        <div><strong>Cobrador:</strong> ${escapeStockHtml(vendorName)}</div>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11px;">
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 4px 0;">Saldo Anterior:</td>
          <td align="right" style="padding: 4px 0;">${Number(previousBalance || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr style="border-bottom: 1px solid #152d24; font-weight: bold; color: #2e7d32;">
          <td style="padding: 4px 0;">Importe Abonado:</td>
          <td align="right" style="padding: 4px 0;">-${Number(amount || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr style="font-weight: 900; font-size: 12px; background: #e8f5e9;">
          <td style="padding: 6px 4px; color: #152d24;">SALDO REMANENTE:</td>
          <td align="right" style="padding: 6px 4px; color: ${balance > 0 ? '#c62828' : '#2e7d32'};">${Number(balance || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
        </tr>
      </table>

      ${notes ? `<div style="font-size: 9px; color: #666; margin-bottom: 8px;"><strong>Concepto:</strong> ${escapeStockHtml(notes)}</div>` : ''}

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; font-size: 9px; text-align: center;">
        <div style="border-top: 1px solid #666; padding-top: 4px;">Firma y Aclaración Cliente</div>
        <div style="border-top: 1px solid #666; padding-top: 4px;">Firma y Sello ${escapeStockHtml(brandName)}</div>
      </div>
    </div>
  `;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Recibo de Cobranza #${receiptId}</title>
      <style>
        @page { margin: 10mm; }
        body { font-family: sans-serif; font-size: 11px; margin: 0; padding: 10px; color: #000; }
        .cut-line { border-top: 1px dashed #999; margin: 16px 0; position: relative; text-align: center; }
        .cut-line span { background: #fff; padding: 0 8px; font-size: 9px; color: #666; position: relative; top: -7px; }
      </style>
    </head>
    <body>
      ${receiptTemplate('ORIGINAL · CLIENTE / CONSTANCIA DE PAGO')}
      ${shouldPrintDuplicateReceipts() ? `<div class="cut-line"><span>✂ Línea de corte</span></div>${receiptTemplate('DUPLICADO · ADMINISTRACIÓN / CONTROL')}` : ''}
      <script>
        window.onload = function() { window.print(); window.close(); };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
window.printCustomerPaymentReceipt = printCustomerPaymentReceipt;

function sendCustomerPaymentWhatsApp(paymentData) {
  if (!paymentData || !paymentData.account) return;
  const { account, amount, method, receiptId, balance } = paymentData;
  const phone = (account.phone || '').replace(/\D/g, '');
  if (!phone) {
    alert('Esta cuenta corriente no tiene un teléfono celular registrado.');
    return;
  }

  if (!receiptId) {
    alert('Esta cobranza no posee numeración documental central para compartir.');
    return;
  }
  const vendorName = getVerifiedOperatorName();
  const brandName = window.AppConfig?.get('brand.texts.name', 'BÔ Grow Club') || 'BÔ Grow Club';
  const amountStr = Number(amount || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });
  const balanceStr = Number(balance || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });
  const receiptNum = receiptId;

  const msg =
    `🌱 *${brandName} — Constancia de Pago*

` +
    `¡Hola ${account.customer_name}! 👋 Te saluda ${vendorName} de *${brandName}*.

` +
    `Te confirmamos la correcta recepción de tu pago:

` +
    `📄 *Recibo N.º:* #${receiptNum}
` +
    `💵 *Importe Abonado:* *${amountStr}* (${method || 'Efectivo'})
` +
    `💰 *Saldo Remanente en Cuenta Corriente:* *${balanceStr}*

` +
    `¡Muchas gracias por tu compromiso y por elegirnos! 🌱✨`;

  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}
window.sendCustomerPaymentWhatsApp = sendCustomerPaymentWhatsApp;

function printSingleMovementPaymentReceipt(accountId, movIdentifier) {
  const accounts = getCurrentAccounts();
  const account = accounts.find(a => a.id === accountId);
  if (!account) return;

  const mov = (account.ledger || []).find(m => String(m.id || m.date) === String(movIdentifier) && m.type === 'CREDIT');
  if (!mov) {
    alert('Movimiento de pago no encontrado.');
    return;
  }

  const paymentData = {
    account,
    amount: Number(mov.amount || 0),
    method: mov.method || 'EFECTIVO',
    notes: mov.concept || 'Pago a cuenta',
    previousBalance: Number(mov.balance_after || 0) + Number(mov.amount || 0),
    balance: Number(mov.balance_after || 0),
    receiptId: mov.documentNumber || null,
    date: mov.date || new Date().toISOString()
  };

  printCustomerPaymentReceipt(paymentData);
}
window.printSingleMovementPaymentReceipt = printSingleMovementPaymentReceipt;

function sendSingleMovementPaymentWhatsApp(accountId, movIdentifier) {
  const accounts = getCurrentAccounts();
  const account = accounts.find(a => a.id === accountId);
  if (!account) return;

  const mov = (account.ledger || []).find(m => String(m.id || m.date) === String(movIdentifier) && m.type === 'CREDIT');
  if (!mov) {
    alert('Movimiento de pago no encontrado.');
    return;
  }

  const paymentData = {
    account,
    amount: Number(mov.amount || 0),
    method: mov.method || 'EFECTIVO',
    receiptId: mov.documentNumber || null,
    balance: Number(mov.balance_after || 0)
  };

  sendCustomerPaymentWhatsApp(paymentData);
}
window.sendSingleMovementPaymentWhatsApp = sendSingleMovementPaymentWhatsApp;

window.initPosWorkspace = initPosWorkspace;
window.clearPosUnifiedSearch = clearPosUnifiedSearch;
window.handlePosBarcodeOrDirectSearch = handlePosBarcodeOrDirectSearch;
window.togglePosVoiceSearch = togglePosVoiceSearch;
window.renderPosSearchResults = renderPosSearchResults;
window.openPosProductModalById = openPosProductModalById;
window.addPosProductToCart = addPosProductToCart;
window.updatePosCartItemQty = updatePosCartItemQty;
window.submitPosSaleDraft = submitPosSaleDraft;
window.showPosProductConfirmModal = showPosProductConfirmModal;
window.closePosScanConfirmModal = closePosScanConfirmModal;
window.confirmAddPosProductToCart = confirmAddPosProductToCart;
window.stepPosModalQty = stepPosModalQty;
window.validatePosModalQty = validatePosModalQty;
window.handlePosDiscountChange = handlePosDiscountChange;
window.clearPosDiscount = clearPosDiscount;

/* ==========================================================================
   BÔ GROW CLUB — MEDIACIÓN DE PEDIDOS WEB & E-COMMERCE (WEB + VENDEDOR)
   ========================================================================== */

// webOrdersList, webOrdersFilterStatus, webOrdersFilterQuery — declared at top of file

function setWebOrdersStatus(message, state = 'info') {
  const statusEl = document.getElementById('web-orders-status');
  if (!statusEl) return;
  statusEl.hidden = !message;
  statusEl.dataset.state = state;
  statusEl.textContent = message || '';
}

function refreshWebOrdersBadges() {
  const pendingCount = webOrdersList.filter(order => {
    const status = String(order.status || '').toUpperCase();
    return !['DELIVERED', 'CANCELLED', 'EXPIRED'].includes(status);
  }).length;

  const kpiCountEl = document.getElementById('vendor-kpi-web-orders-count');
  const navBadge = document.getElementById('vendor-sidebar-web-orders-badge');
  const actionBadge = document.getElementById('vendor-pending-web-orders-badge-action');

  if (kpiCountEl) kpiCountEl.textContent = `${pendingCount} ${pendingCount === 1 ? 'pendiente' : 'pendientes'}`;
  if (navBadge) {
    navBadge.textContent = pendingCount;
    navBadge.hidden = pendingCount === 0;
  }
  if (actionBadge) {
    actionBadge.textContent = pendingCount;
    actionBadge.hidden = pendingCount === 0;
  }
  if (typeof updateVendorNotificationCenter === 'function') {
    updateVendorNotificationCenter();
  }
}

async function loadWebOrders(forceReload = false) {
  const listEl = document.getElementById('web-orders-list');
  if (!listEl) return;

  setWebOrdersStatus('Cargando pedidos de la tienda online...', 'loading');
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  if (!supabaseClient || !context?.isVerified) {
    webOrdersList = [];
    renderWebOrders();
    setWebOrdersStatus('Iniciá sesión para ver los pedidos centrales.', 'error');
    return;
  }
  try {
    const { data, error } = await supabaseClient
      .from('public_orders_v2')
      .select('id,order_number,customer_name,customer_email,customer_phone,delivery_type,delivery_address,notes,items,subtotal,discount,total,currency,status,payment_status,payment_provider,created_at,updated_at')
      .eq('tenant_id', context.tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    webOrdersList = (data || []).map(order => ({
      ...order,
      order_id: order.id,
      total_amount: Number(order.total) || 0,
      payment_method: order.payment_provider || (order.payment_status === 'APPROVED' ? 'Pago online aprobado' : 'Pendiente de confirmación'),
      address: order.delivery_address || ''
    }));
    refreshWebOrdersBadges();
    renderWebOrders();
    setWebOrdersStatus('');
  } catch (error) {
    console.error('No se pudieron leer los pedidos centrales:', error);
    webOrdersList = [];
    renderWebOrders();
    setWebOrdersStatus(`No se cargaron los pedidos: ${error.message}`, 'error');
  }
}

const PUBLIC_ORDER_STATUS_LABELS = Object.freeze({
  PENDING_PAYMENT: 'Pendiente de pago',
  CONFIRMED: 'Pago aprobado',
  PREPARING: 'En preparación',
  READY: 'Listo para retiro/entrega',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Expirado'
});

function filterWebOrders() {
  const searchInput = document.getElementById('web-orders-search');
  const statusSelect = document.getElementById('web-orders-filter-status');
  webOrdersFilterQuery = searchInput?.value.trim().toLowerCase() || '';
  webOrdersFilterStatus = statusSelect?.value || 'all';
  renderWebOrders();
}

function renderWebOrders() {
  const listEl = document.getElementById('web-orders-list');
  const countEl = document.getElementById('web-orders-count');
  if (!listEl) return;

  const locations = Array.isArray(internalCatalogProducts) ? internalCatalogProducts : [];

  const filtered = webOrdersList.filter(order => {
    const query = webOrdersFilterQuery;
    const matchesQuery = !query ||
      String(order.id || order.order_id || '').toLowerCase().includes(query) ||
      String(order.customer_name || order.name || '').toLowerCase().includes(query) ||
      String(order.customer_phone || order.phone || '').toLowerCase().includes(query);

    const st = String(order.status || '').toUpperCase();
    let matchesStatus = true;
    if (webOrdersFilterStatus === 'PENDING') {
      matchesStatus = ['PENDING_PAYMENT', 'CONFIRMED'].includes(st);
    } else if (webOrdersFilterStatus === 'IN_PREPARATION') {
      matchesStatus = st === 'PREPARING';
    } else if (webOrdersFilterStatus === 'READY') {
      matchesStatus = st === 'READY';
    } else if (webOrdersFilterStatus === 'COMPLETED') {
      matchesStatus = ['DELIVERED', 'CANCELLED', 'EXPIRED'].includes(st);
    }

    return matchesQuery && matchesStatus;
  });

  if (countEl) countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; background: rgba(0,0,0,0.2); border: 1px dashed var(--color-border-accent); border-radius: 16px; color: var(--color-text-muted);">
        <p style="font-weight: 700; font-size: 1.1rem; color: var(--color-accent-gold); margin: 0 0 6px 0;">No se encontraron pedidos web</p>
        <p style="font-size: 0.88rem; margin: 0;">Cuando un cliente compre desde la tienda online aparecerá acá automáticamente para su preparación y cobro.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = filtered.map(order => {
    const orderId = order.id || order.order_id || 'BO-000000';
    const customerName = order.customer_name || order.name || 'Cliente Anónimo';
    const customerPhone = order.customer_phone || order.phone || '';
    const cleanPhone = customerPhone.replace(/\D/g, '');
    const delivery = String(order.delivery_type || order.deliveryType || '').toUpperCase() !== 'PICKUP'
      ? `🚚 Envío a domicilio: ${order.address || 'Sin dirección'}`
      : '🏬 Retiro por el local';
    const payment = order.payment_method || order.paymentMethod || 'Efectivo / Transferencia';
    const total = Number(order.total_amount || order.total || 0);
    const dateStr = order.created_at || order.date
      ? new Date(order.created_at || order.date).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
      : 'Reciente';
    const statusCode = String(order.status || 'PENDING_PAYMENT').toUpperCase();
    const status = PUBLIC_ORDER_STATUS_LABELS[statusCode] || statusCode;
    const escapedOrderId = escapeStockHtml(orderId);
    const orderIdArgument = escapeStockHtml(JSON.stringify(String(orderId)))
      .replace(/&lt;/g, '\\u003c')
      .replace(/&gt;/g, '\\u003e');
    const escapedCustomerName = escapeStockHtml(customerName);
    const escapedCustomerPhone = escapeStockHtml(customerPhone);
    const escapedDelivery = escapeStockHtml(delivery);
    const escapedPayment = escapeStockHtml(payment);
    const escapedStatus = escapeStockHtml(status);
    const escapedDate = escapeStockHtml(dateStr);

    let statusBadgeColor = '#ffb74d';
    let statusBg = 'rgba(255,183,77,0.15)';
    const statusLower = status.toLowerCase();
    const isCancelled = statusCode === 'CANCELLED' || statusCode === 'EXPIRED';

    if (isCancelled) {
      statusBadgeColor = '#ef5350';
      statusBg = 'rgba(239,83,80,0.18)';
    } else if (statusCode === 'CONFIRMED') {
      statusBadgeColor = '#25d366';
      statusBg = 'rgba(37,211,102,0.18)';
    } else if (statusCode === 'DELIVERED') {
      statusBadgeColor = '#66bb6a';
      statusBg = 'rgba(102,187,106,0.15)';
    } else if (statusCode === 'PREPARING') {
      statusBadgeColor = '#42a5f5';
      statusBg = 'rgba(66,165,245,0.15)';
    } else if (statusCode === 'READY') {
      statusBadgeColor = '#ab47bc';
      statusBg = 'rgba(171,71,188,0.15)';
    }

    const items = order.items || order.items_json || [];

    const itemsHtml = items.map(item => {
      const pCode = item.product_id || item.sku || item.product_code || item.id || '';
      const foundLoc = locations.find(l => String(l.product_code) === String(pCode) || String(l.barcode) === String(pCode));
      const locText = foundLoc && (foundLoc.shelf_code || foundLoc.wms_code)
        ? `📍 ${foundLoc.shelf_code || foundLoc.wms_code}`
        : '📍 Sin ubicación asignada';

      return `
        <li style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px dashed rgba(255,255,255,0.08); font-size: 0.85rem;">
          <div style="flex: 1;">
            <strong>${escapeStockHtml(item.quantity)}x ${escapeStockHtml(item.name || 'Producto')}</strong>
            <div style="font-size: 0.74rem; color: #42a5f5; margin-top: 2px;">${escapeStockHtml(locText)}</div>
          </div>
          <span style="font-weight: 700; color: var(--color-accent-gold);">$${Number(item.line_total ?? ((item.unit_price || item.price || 0) * (item.quantity || 1))).toLocaleString('es-AR')}</span>
        </li>
      `;
    }).join('');

    const waLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`¡Hola ${customerName}! Te escribimos de BÔ Grow Club respecto a tu pedido #${orderId}.`)}` : '#';

    return `
      <article class="web-order-card" style="background: var(--color-card-bg); border: 1.5px solid ${isCancelled ? 'rgba(239,83,80,0.4)' : 'var(--color-border-subtle)'}; border-radius: 16px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between; gap: 14px; box-shadow: var(--shadow-sm); transition: transform 0.2s ease;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
            <div>
              <span style="font-size: 0.75rem; color: var(--color-text-muted); font-weight: 700;">ORDEN WEB</span>
              <h3 style="margin: 0; font-size: 1.15rem; color: var(--color-accent-gold); font-family: var(--font-display);">${escapedOrderId}</h3>
              <small style="color: var(--color-text-muted); font-size: 0.75rem;">📅 ${escapedDate}</small>
            </div>
            <span style="font-size: 0.75rem; font-weight: 800; color: ${statusBadgeColor}; background: ${statusBg}; border: 1px solid ${statusBadgeColor}; padding: 4px 10px; border-radius: 12px; text-transform: uppercase;">
              ${escapedStatus}
            </span>
          </div>

          <div style="background: rgba(0,0,0,0.15); border-radius: 10px; padding: 10px 12px; margin-bottom: 12px; font-size: 0.85rem; line-height: 1.4;">
            <div>👤 <strong>${escapedCustomerName}</strong></div>
            ${customerPhone ? `<div>📞 <a href="${escapeStockHtml(waLink)}" target="_blank" rel="noopener noreferrer" style="color: #25d366; text-decoration: none; font-weight: 700;">${escapedCustomerPhone} (WhatsApp)</a></div>` : ''}
            <div>${escapedDelivery}</div>
            <div>💳 Método: <strong>${escapedPayment}</strong></div>
            ${order.notes ? `<div style="margin-top: 4px; color: var(--color-accent-gold); font-style: italic;">💬 "${escapeStockHtml(order.notes)}"</div>` : ''}
          </div>

          <div style="margin-bottom: 10px;">
            <span style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--color-accent-gold); display: block; margin-bottom: 4px;">📦 Artículos & Picking:</span>
            <ul style="list-style: none; padding: 0; margin: 0;">
              ${itemsHtml}
            </ul>
          </div>

          ${isCancelled ? `
            <div style="background: rgba(239,83,80,0.12); border: 1px solid #ef5350; border-radius: 10px; padding: 10px 12px; font-size: 0.82rem; color: #ffcdd2; margin-top: 6px;">
              <strong style="color: #ef5350; display: block; margin-bottom: 2px;">🚫 Pedido Cancelado (reserva liberada)</strong>
              <div><strong>Motivo:</strong> ${escapeStockHtml(order.cancellation_reason || order.notes || 'Registrado en auditoría')}</div>
              ${order.cancellation_notes ? `<div><strong>Detalle:</strong> "${escapeStockHtml(order.cancellation_notes)}"</div>` : ''}
              ${order.cancelled_by ? `<small style="color: rgba(255,255,255,0.6); display: block; margin-top: 2px;">Por: ${escapeStockHtml(order.cancelled_by)}</small>` : ''}
            </div>
          ` : ''}
        </div>

        <div style="border-top: 1px solid var(--color-border-accent); padding-top: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <span style="font-size: 0.9rem; font-weight: 700;">Total a Cobrar:</span>
            <strong style="font-size: 1.3rem; color: var(--color-accent-gold); font-weight: 900;">$${total.toLocaleString('es-AR')}</strong>
          </div>

          ${!['DELIVERED', 'CANCELLED', 'EXPIRED'].includes(statusCode) ? `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              ${statusCode === 'CONFIRMED' ? `<button type="button" class="btn btn-primary" onclick="updateWebOrderStatus(${orderIdArgument}, 'PREPARING')" style="grid-column: 1 / -1; padding: 10px; font-weight: 800;">📋 Comenzar preparación</button>` : ''}
              ${statusCode === 'PREPARING' ? `<button type="button" class="btn btn-primary" onclick="updateWebOrderStatus(${orderIdArgument}, 'READY')" style="grid-column: 1 / -1; padding: 10px; font-weight: 800;">🟢 Marcar listo</button>` : ''}
              ${statusCode === 'READY' ? `<button type="button" class="btn btn-primary" onclick="updateWebOrderStatus(${orderIdArgument}, 'DELIVERED')" style="grid-column: 1 / -1; padding: 10px; font-weight: 800;">✓ Confirmar entrega</button>` : ''}
              ${statusCode === 'PENDING_PAYMENT' ? `<p style="grid-column: 1 / -1; margin: 0; font-size: 0.8rem; color: var(--color-text-muted);">El pago se valida desde el backend/webhook. No puede aprobarse manualmente.</p>` : ''}
              <button type="button" class="btn btn-secondary" onclick="sendWebOrderWhatsApp(${orderIdArgument})" style="padding: 6px 8px; font-size: 0.75rem; border-radius: 8px; cursor: pointer; color: #25d366; border-color: #25d366;">
                💬 Notificar WhatsApp
              </button>
              ${statusCode === 'PENDING_PAYMENT' ? `<button type="button" class="btn btn-secondary" onclick="openCancelWebOrderModal(${orderIdArgument})" style="padding: 6px 8px; font-size: 0.75rem; border-radius: 8px; cursor: pointer; color: #ef5350; border-color: #ef5350; font-weight: 800;">
                🚫 Cancelar Pedido
              </button>` : ''}
            </div>
          ` : `
            <div style="display: flex; gap: 8px;">
              <button type="button" class="btn btn-secondary" onclick="sendWebOrderWhatsApp(${orderIdArgument})" style="flex: 1; padding: 8px; font-size: 0.78rem; border-radius: 8px; cursor: pointer; color: #25d366; border-color: #25d366;">
                💬 Avisar por WhatsApp
              </button>
            </div>
          `}
        </div>
      </article>
    `;
  }).join('');
}

let currentCancelOrderId = null;

function openCancelWebOrderModal(orderId) {
  const order = webOrdersList.find(o => (o.id || o.order_id) === orderId);
  if (!order) {
    if (window.showToast) window.showToast('⚠️ Pedido no encontrado.');
    return;
  }

  currentCancelOrderId = orderId;
  const modal = document.getElementById('modal-cancel-web-order');
  if (!modal) return;

  const idEl = document.getElementById('cancel-order-id-display');
  const clientEl = document.getElementById('cancel-order-client-display');
  const totalEl = document.getElementById('cancel-order-total-display');
  const itemsListEl = document.getElementById('cancel-order-items-list');
  const reasonSelect = document.getElementById('cancel-order-reason-select');
  const notesTextarea = document.getElementById('cancel-order-notes-input');

  if (idEl) idEl.textContent = order.id || order.order_id;
  if (clientEl) clientEl.textContent = order.customer_name || order.name || 'Cliente';
  if (totalEl) totalEl.textContent = `$${Number(order.total_amount || order.total || 0).toLocaleString('es-AR')}`;
  
  if (reasonSelect) reasonSelect.value = 'Cliente no respondió / no envió comprobante';
  if (notesTextarea) notesTextarea.value = '';

  const items = order.items || order.items_json || [];
  if (itemsListEl) {
    itemsListEl.innerHTML = items.map(it => `
      <li style="display: flex; justify-content: space-between; font-size: 0.85rem; padding: 4px 0; border-bottom: 1px dashed rgba(255,255,255,0.1);">
        <span>📦 <strong>${escapeStockHtml(it.quantity)}x</strong> ${escapeStockHtml(it.name || 'Producto')}</span>
        <span style="color: #81c784; font-weight: 700;">+${escapeStockHtml(it.quantity)} u. al stock</span>
      </li>
    `).join('');
  }

  modal.style.display = 'flex';
}
window.openCancelWebOrderModal = openCancelWebOrderModal;

function closeCancelWebOrderModal() {
  const modal = document.getElementById('modal-cancel-web-order');
  if (modal) modal.style.display = 'none';
  currentCancelOrderId = null;
}
window.closeCancelWebOrderModal = closeCancelWebOrderModal;

// Dictado por voz para el motivo de cancelación
function startCancelVoiceDictation() {
  const notesTextarea = document.getElementById('cancel-order-notes-input');
  const voiceBtn = document.getElementById('btn-cancel-voice');
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    if (window.showToast) window.showToast('⚠️ Tu navegador no soporta reconocimiento de voz.');
    return;
  }
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRec();
  recognition.lang = 'es-AR';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  if (voiceBtn) {
    voiceBtn.style.background = '#c62828';
    voiceBtn.textContent = '🔴 Escuchando...';
  }

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    if (notesTextarea) {
      notesTextarea.value = notesTextarea.value ? `${notesTextarea.value} ${transcript}` : transcript;
    }
    if (window.showToast) window.showToast(`🎙️ Motivo captado: "${transcript}"`);
  };

  recognition.onerror = () => {
    if (window.showToast) window.showToast('⚠️ Error al captar audio.');
  };

  recognition.onend = () => {
    if (voiceBtn) {
      voiceBtn.style.background = '';
      voiceBtn.textContent = '🎙️ Dictar por voz';
    }
  };

  recognition.start();
}
window.startCancelVoiceDictation = startCancelVoiceDictation;

async function confirmCancelWebOrder() {
  if (!currentCancelOrderId) return;
  const order = webOrdersList.find(o => (o.id || o.order_id) === currentCancelOrderId);
  if (!order) return;

  const reasonSelect = document.getElementById('cancel-order-reason-select');
  const notesTextarea = document.getElementById('cancel-order-notes-input');
  const reason = reasonSelect?.value || 'Cancelado por el vendedor';
  const notes = notesTextarea?.value.trim() || '';

  if (reason.includes('Otro') && !notes) {
    if (window.showToast) window.showToast('⚠️ Por favor especificá el motivo obligatorio en el campo de texto.');
    notesTextarea?.focus();
    return;
  }

  const authContext = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  if (!window.OperationalApi || !supabaseClient || !authContext?.isVerified) {
    alert('Iniciá sesión para cancelar el pedido central.');
    return;
  }
  const cancelledOrderId = currentCancelOrderId;
  try {
    await window.OperationalApi.transitionPublicOrder({
      supabaseClient,
      authContext,
      orderId: cancelledOrderId,
      status: 'CANCELLED',
      notes: `${reason}${notes ? `: ${notes}` : ''}`,
      idempotencyKey: `cancel-public-order:${cancelledOrderId}`
    });
    closeCancelWebOrderModal();
    await Promise.all([loadWebOrders(true), loadInternalCatalog()]);
    storeMapDataLoaded = false;
    if (typeof loadStoreMapData === 'function') await loadStoreMapData(true);
    if (window.showToast) window.showToast(`Pedido #${order.order_number || cancelledOrderId} cancelado; la reserva fue liberada por el servidor.`);
  } catch (error) {
    console.error('No se pudo cancelar el pedido central:', error);
    alert(`El pedido no fue cancelado.\n\n${error.message || 'Error desconocido'}`);
  }
  return;

  /* Ruta legacy inaccesible; no debe volver a habilitarse. */
  const vendorName = (typeof getCurrentMapUser === 'function') ? getCurrentMapUser() : (sessionStorage.getItem('boeweb_vendor_name') || localStorage.getItem('boeweb_vendor_name') || 'Vendedor');

  // Restituir stock si estaba descontado (o por defecto si fue generado en la web)
  if (order.stock_deducted !== false) {
    const items = order.items || order.items_json || [];
    items.forEach(item => {
      const code = String(item.product_id || item.id || item.product_code || '');
      const barcode = String(item.barcode || '');
      const name = String(item.name || '').toLowerCase();
      const qty = Math.max(1, Number(item.quantity) || 1);

      // 1. Catálogo interno
      if (typeof internalCatalogProducts !== 'undefined' && Array.isArray(internalCatalogProducts)) {
        const intP = internalCatalogProducts.find(p => 
          (code && (String(p.id) === code || String(p.product_code) === code)) ||
          (barcode && p.barcode === barcode) ||
          (name && p.name && p.name.toLowerCase() === name)
        );
        if (intP) {
          intP.stock = (Number(intP.stock) || 0) + qty;
          intP.available = true;
        }
      }

      // 2. Ubicaciones físicas locales
      if (typeof readLocalProductLocations === 'function' && typeof saveLocalProductLocation === 'function') {
        const locs = readLocalProductLocations();
        const loc = locs.find(l => 
          (code && (String(l.product_code) === code || String(l.product_id) === code)) ||
          (barcode && l.barcode === barcode) ||
          (name && l.name && l.name.toLowerCase() === name)
        );
        if (loc) {
          loc.stock = (Number(loc.stock) || 0) + qty;
          saveLocalProductLocation(loc);
        }
      }

      // 3. Mapa interactivo
      if (typeof window !== 'undefined' && Array.isArray(window.storeLocationProducts)) {
        const mapLoc = window.storeLocationProducts.find(l => 
          (code && (String(l.product_code) === code || String(l.product_id) === code)) ||
          (barcode && l.barcode === barcode) ||
          (name && l.name && l.name.toLowerCase() === name)
        );
        if (mapLoc) {
          mapLoc.stock = (Number(mapLoc.stock) || 0) + qty;
        }
      }

      // Registrar auditoría de restitución
      if (typeof saveRetiredProductAdjustment === 'function') {
        saveRetiredProductAdjustment({
          id: `restock_cancel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          date: new Date().toISOString().slice(0, 10),
          created_at: new Date().toISOString(),
          product_id: item.product_id || item.id || '',
          product_code: item.product_code || '',
          product_name: item.name || 'Producto Web',
          barcode: item.barcode || '',
          type: 'add',
          quantity: qty,
          reason: 'restitucion',
          reason_label: `Restitución: Cancelación Pedido #${order.id || order.order_id}`,
          notes: `Motivo: ${reason}. Aclaración: ${notes || 'Sin notas'} (Vendedor: ${vendorName})`,
          vendor_name: vendorName
        });
      }
    });

    order.stock_deducted = false;
    order.stock_restored = true;

    try {
      localStorage.setItem('boeweb_internal_catalog', JSON.stringify(internalCatalogProducts));
    } catch (_) {}
  }

  order.status = 'Cancelado';
  order.cancellation_reason = reason;
  order.cancellation_notes = notes;
  order.cancelled_at = new Date().toISOString();
  order.cancelled_by = vendorName;

  try {
    localStorage.setItem('boeweb_web_orders', JSON.stringify(webOrdersList));
  } catch (_) {}

  if (supabaseClient) {
    try {
      await supabaseClient
        .from('orders')
        .update({
          status: 'Cancelado',
          notes: order.notes ? `${order.notes}\n[CANCELADO]: ${reason} - ${notes}` : `[CANCELADO]: ${reason} - ${notes}`,
          updated_at: new Date().toISOString()
        })
        .eq('order_id', currentCancelOrderId);
    } catch (sbErr) {
      console.warn('Aviso al actualizar orden cancelada en Supabase:', sbErr);
    }
  }

  closeCancelWebOrderModal();

  if (typeof logSecureAuditEvent === 'function') {
    logSecureAuditEvent({
      event_type: 'WEB_ORDER_CANCELLED',
      category: 'ORDERS',
      severity: 'WARNING',
      actor_name: vendorName,
      description: `Cancelación de pedido web #${currentCancelOrderId} (${order.client || 'Cliente'}) con restitución automática de stock. Motivo: ${reason}`,
      entity_type: 'web_order',
      entity_id: currentCancelOrderId,
      details: {
        order_id: currentCancelOrderId,
        client: order.client,
        phone: order.phone,
        total: order.total,
        reason,
        notes,
        items: order.items || order.items_json || []
      }
    });
  }

  if (window.showToast) window.showToast(`🚫 Pedido #${currentCancelOrderId} cancelado. Stock restituido al inventario.`);

  refreshWebOrdersBadges();
  renderWebOrders();
  if (typeof renderInternalCatalogGrid === 'function') renderInternalCatalogGrid();
  if (typeof renderStockProducts === 'function') renderStockProducts();
  if (typeof loadStoreMapData === 'function') await loadStoreMapData(true);
  if (typeof rerenderStoreMap === 'function') rerenderStoreMap();
}
window.confirmCancelWebOrder = confirmCancelWebOrder;

function loadWebOrderToPos(orderId) {
  alert(`El pedido #${orderId} ya tiene reserva y ciclo de pago propios. No puede copiarse al POS porque duplicaría stock e ingresos.`);
}

async function updateWebOrderStatus(orderId, newStatus) {
  const order = webOrdersList.find(o => (o.id || o.order_id) === orderId);
  if (order) {
    const statusMap = {
      'EN PREPARACIÓN': 'PREPARING',
      'LISTO PARA RETIRO': 'READY',
      COMPLETADO: 'DELIVERED',
      PREPARING: 'PREPARING',
      READY: 'READY',
      DELIVERED: 'DELIVERED'
    };
    const targetStatus = statusMap[String(newStatus || '').toUpperCase()];
    const authContext = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
    if (!targetStatus || !window.OperationalApi || !supabaseClient || !authContext?.isVerified) {
      alert('La transición solicitada no es válida o no hay una sesión verificada.');
      return;
    }
    try {
      await window.OperationalApi.transitionPublicOrder({
        supabaseClient,
        authContext,
        orderId,
        status: targetStatus,
        notes: `Actualizado desde el panel operativo a ${targetStatus}.`,
        idempotencyKey: `public-order-transition:${orderId}:${targetStatus}`
      });
      await loadWebOrders(true);
      if (window.showToast) window.showToast(`Pedido #${order.order_number || orderId}: ${PUBLIC_ORDER_STATUS_LABELS[targetStatus]}.`);
    } catch (error) {
      console.error('No se actualizó el pedido central:', error);
      alert(`El estado no cambió.\n\n${error.message || 'Error desconocido'}`);
    }
    return;

    /* Ruta legacy inaccesible; el stock de e-commerce se mueve en sus RPC. */
    const isNowCompleted = (newStatus.toLowerCase().includes('completado') || newStatus.toLowerCase().includes('entregado'));
    
    // Si se pasa a Completado / Entregado y aún no se descontó el stock:
    if (isNowCompleted && !order.stock_deducted) {
      const items = order.items || order.items_json || [];
      const stockChanges = [];

      items.forEach(soldItem => {
        const code = String(soldItem.product_id || soldItem.id || soldItem.product_code || '');
        const barcode = String(soldItem.barcode || '');
        const name = String(soldItem.name || '').toLowerCase();
        const qty = Math.max(1, Number(soldItem.quantity) || 1);

        // 1. Actualizar catálogo interno
        if (typeof internalCatalogProducts !== 'undefined' && Array.isArray(internalCatalogProducts)) {
          const intP = internalCatalogProducts.find(p => 
            (code && (String(p.id) === code || String(p.product_code) === code)) ||
            (barcode && p.barcode === barcode) ||
            (name && p.name && p.name.toLowerCase() === name)
          );
          if (intP) {
            const prev = Number(intP.stock || 0);
            intP.stock = Math.max(0, prev - qty);
            stockChanges.push(`${intP.name}: ${prev} u. ➔ ${intP.stock} u.`);
          }
        }

        // 2. Actualizar ubicaciones físicas locales
        if (typeof readLocalProductLocations === 'function' && typeof saveLocalProductLocation === 'function') {
          const locs = readLocalProductLocations();
          const loc = locs.find(l => 
            (code && (String(l.product_code) === code || String(l.product_id) === code)) ||
            (barcode && l.barcode === barcode) ||
            (name && l.name && l.name.toLowerCase() === name)
          );
          if (loc) {
            loc.stock = Math.max(0, Number(loc.stock || 0) - qty);
            saveLocalProductLocation(loc);
          }
        }

        // 3. Actualizar productos del mapa interactivo
        if (typeof window !== 'undefined' && Array.isArray(window.storeLocationProducts)) {
          const mapLoc = window.storeLocationProducts.find(l => 
            (code && (String(l.product_code) === code || String(l.product_id) === code)) ||
            (barcode && l.barcode === barcode) ||
            (name && l.name && l.name.toLowerCase() === name)
          );
          if (mapLoc) {
            mapLoc.stock = Math.max(0, Number(mapLoc.stock || 0) - qty);
          }
        }
      });

      order.stock_deducted = true;
      try {
        localStorage.setItem('boeweb_internal_catalog', JSON.stringify(internalCatalogProducts));
      } catch (_) {}

      // Registrar salida en el historial de retiros/ventas
      items.forEach(soldItem => {
        saveRetiredProductAdjustment({
          id: `web_sale_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          date: new Date().toISOString().slice(0, 10),
          created_at: new Date().toISOString(),
          product_id: soldItem.product_id || soldItem.id || '',
          product_code: soldItem.product_code || '',
          product_name: soldItem.name || 'Producto Web',
          barcode: soldItem.barcode || '',
          type: 'remove',
          quantity: Math.max(1, Number(soldItem.quantity) || 1),
          reason: 'vendido',
          reason_label: `Pedido Web #${orderId}`,
          notes: `Venta online completada por ${order.customer_name || 'Cliente'}`,
          vendor_name: (typeof getCurrentMapUser === 'function') ? getCurrentMapUser() : 'Vendedor'
        });
      });
    }

    order.status = newStatus;
    try {
      localStorage.setItem('boeweb_web_orders', JSON.stringify(webOrdersList));
    } catch (_) {}

    if (supabaseClient) {
      try {
        await supabaseClient
          .from('orders')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('order_id', orderId);
      } catch (err) {
        console.warn('Aviso al actualizar estado remoto:', err);
      }
    }

    refreshWebOrdersBadges();
    renderWebOrders();
    if (typeof renderInternalCatalog === 'function') renderInternalCatalog();
    if (typeof loadStoreMapData === 'function') await loadStoreMapData(true);
    if (typeof rerenderStoreMap === 'function') rerenderStoreMap();

    const toastMsg = isNowCompleted
      ? `✓ Pedido #${orderId} completado y stock descontado del inventario.`
      : `✓ Estado actualizado: ${newStatus}`;
    if (window.showToast) window.showToast(toastMsg);
  }
}

function sendWebOrderWhatsApp(orderId) {
  const order = webOrdersList.find(o => (o.id || o.order_id) === orderId);
  if (!order) return;

  const phone = (order.customer_phone || order.phone || '').replace(/\D/g, '');
  if (!phone) {
    alert('Este pedido no cuenta con número de teléfono registrado.');
    return;
  }

  const name = order.customer_name || order.name || 'Cliente';
  const status = order.status || 'Listo para Retiro';
  const total = Number(order.total_amount || order.total || 0).toLocaleString('es-AR');

  const msg = `🌿 *BÔ Grow Club — Estado de tu Pedido*\n\n¡Hola ${name}! Te avisamos que tu pedido *#${orderId}* está en estado: *${status}*.\n\n💰 Total: *$${total}*\n📍 Dirección del local: BÔ Grow Club\n\n¡Cualquier duda avisanos por este medio! 🙏`;

  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

window.loadWebOrders = loadWebOrders;
window.filterWebOrders = filterWebOrders;
window.renderWebOrders = renderWebOrders;
window.loadWebOrderToPos = loadWebOrderToPos;
window.updateWebOrderStatus = updateWebOrderStatus;
window.sendWebOrderWhatsApp = sendWebOrderWhatsApp;
window.refreshWebOrdersBadges = refreshWebOrdersBadges;

/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — MÓDULO 1: VENCIMIENTOS & ROTACIÓN DE STOCK
   ==========================================================================
   Monitoreo de caducidad desde 3 meses (90 días), 1 mes (30 días), 1 semana (7 días)
   y días críticos (<= 3 días o vencidos).
   ========================================================================== */

// currentExpirationsFilter — declared at top of file

function calculateExpirationStatus(expirationDateStr) {
  if (!expirationDateStr) {
    return { status: 'NONE', daysLeft: null, label: 'Sin fecha', badgeClass: '', level: 0 };
  }
  const expDate = new Date(expirationDateStr + 'T00:00:00');
  if (isNaN(expDate.getTime())) {
    return { status: 'NONE', daysLeft: null, label: 'Fecha inválida', badgeClass: '', level: 0 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = expDate.getTime() - today.getTime();
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (daysLeft <= 0) {
    return { status: 'EXPIRED', daysLeft, label: '🔴 VENCIDO', badgeClass: 'exp-badge-critical', level: 4 };
  } else if (daysLeft <= 3) {
    return { status: 'CRITICAL', daysLeft, label: `🔴 Vence en ${daysLeft}d (Crítico)`, badgeClass: 'exp-badge-critical', level: 4 };
  } else if (daysLeft <= 7) {
    return { status: 'WEEK', daysLeft, label: `🟠 Vence en ${daysLeft}d (1 semana)`, badgeClass: 'exp-badge-week', level: 3 };
  } else if (daysLeft <= 30) {
    return { status: 'MONTH', daysLeft, label: `🟡 Vence en ${daysLeft}d (1 mes)`, badgeClass: 'exp-badge-month', level: 2 };
  } else if (daysLeft <= 90) {
    return { status: 'THREE_MONTHS', daysLeft, label: `🟢 Vence en ${daysLeft}d (3 meses)`, badgeClass: 'exp-badge-three-months', level: 1 };
  } else {
    return { status: 'OK', daysLeft, label: `Vence en ${daysLeft}d`, badgeClass: 'exp-badge-ok', level: 0 };
  }
}

function getAllProductsWithExpirations() {
  const list = [];
  const ownList = typeof internalCatalogProducts !== 'undefined' && Array.isArray(internalCatalogProducts)
    ? internalCatalogProducts
    : [];

  ownList.forEach(p => {
    const exp = p.expiration_date || p.expiry_date;
    if (exp) {
      const statusObj = calculateExpirationStatus(exp);
      list.push({
        ...p,
        expirationStatus: statusObj
      });
    }
  });

  // Sort by days left ascending (most urgent first)
  list.sort((a, b) => (a.expirationStatus.daysLeft || 999) - (b.expirationStatus.daysLeft || 999));
  return list;
}

function renderExpirationsSection() {
  const tableBody = document.getElementById('vendor-expirations-table-body');
  if (!tableBody) return;

  const allExpirations = getAllProductsWithExpirations();
  const badgeSidebar = document.getElementById('vendor-sidebar-expirations-badge');
  const badgeKpi = document.getElementById('expirations-badge-kpi');

  const alertCount = allExpirations.filter(p => p.expirationStatus.level >= 1).length;
  if (badgeSidebar) {
    badgeSidebar.textContent = alertCount;
    badgeSidebar.hidden = alertCount === 0;
  }
  if (badgeKpi) {
    badgeKpi.textContent = alertCount;
    badgeKpi.style.display = alertCount > 0 ? 'inline-block' : 'none';
  }

  let filtered = allExpirations;
  if (currentExpirationsFilter === 'critical') {
    filtered = allExpirations.filter(p => p.expirationStatus.level === 4);
  } else if (currentExpirationsFilter === 'week') {
    filtered = allExpirations.filter(p => p.expirationStatus.level === 3 || p.expirationStatus.level === 4);
  } else if (currentExpirationsFilter === 'month') {
    filtered = allExpirations.filter(p => p.expirationStatus.level >= 2);
  } else if (currentExpirationsFilter === 'three-months') {
    filtered = allExpirations.filter(p => p.expirationStatus.level >= 1);
  }

  if (filtered.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 24px; color: var(--color-text-muted);">
          No se encontraron productos en el rango de vencimiento seleccionado. ¡Inventario al día! 🌿
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filtered.map(p => {
    const exp = p.expirationStatus;
    let badgeColor = '#4caf50';
    let badgeBg = 'rgba(76,175,80,0.15)';
    if (exp.level === 4) { badgeColor = '#ef5350'; badgeBg = 'rgba(239,83,80,0.18)'; }
    else if (exp.level === 3) { badgeColor = '#ff9800'; badgeBg = 'rgba(255,152,0,0.18)'; }
    else if (exp.level === 2) { badgeColor = '#fbc02d'; badgeBg = 'rgba(251,192,45,0.18)'; }

    return `
      <tr style="border-bottom: 1px solid var(--color-border-subtle);">
        <td style="padding: 12px 10px;">
          <strong style="color: var(--color-text-main); font-weight: 700;">${escapeStockHtml(p.name)}</strong>
          <span style="display: block; font-size: 0.72rem; color: var(--color-text-muted);">SKU: ${escapeStockHtml(p.product_code || p.id)}</span>
        </td>
        <td style="padding: 12px 10px;">
          <span style="background: rgba(255,255,255,0.06); padding: 3px 8px; border-radius: 8px; font-size: 0.75rem;">${escapeStockHtml(p.category || 'Varios')}</span>
        </td>
        <td style="padding: 12px 10px; font-weight: 700;">
          ${Number(p.stock || 0)} u.
        </td>
        <td style="padding: 12px 10px; color: #2e7d32; font-weight: 600;">
          📍 ${escapeStockHtml(p.location || 'Salón')}
        </td>
        <td style="padding: 12px 10px; font-family: monospace; font-weight: 700;">
          ${p.expiration_date || p.expiry_date}
        </td>
        <td style="padding: 12px 10px;">
          <span style="background: ${badgeBg}; border: 1px solid ${badgeColor}; color: ${badgeColor}; padding: 4px 10px; border-radius: 10px; font-size: 0.75rem; font-weight: 800;">
            ${exp.label}
          </span>
        </td>
        <td style="padding: 12px 10px; text-align: right;">
          <button type="button" class="btn btn-secondary" onclick="applyPromoForExpiringProduct('${p.id}')" style="padding: 6px 12px; font-size: 0.78rem; border-color: var(--color-accent-gold); color: var(--color-accent-gold); border-radius: 8px; font-weight: 700;">
            🏷️ Liquidar / Promo
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterExpirationsByTime(timeframe) {
  currentExpirationsFilter = timeframe;
  const chipIds = ['all', 'critical', 'week', 'month', 'three-months'];
  chipIds.forEach(id => {
    const chip = document.getElementById(`exp-filter-${id}`);
    if (chip) {
      if (id === timeframe) chip.classList.add('active');
      else chip.classList.remove('active');
    }
  });
  renderExpirationsSection();
}

async function applyPromoForExpiringProduct(productId) {
  const p = (internalCatalogProducts || []).find(prod => String(prod.id) === String(productId));
  if (!p) return;
  const promoDiscount = 20; // 20% liquidación
  const originalPrice = Number(p.price || 0);
  const newPrice = Math.round(originalPrice * (1 - promoDiscount / 100));

  const authContext = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  if (!window.OperationalApi || !supabaseClient || !authContext?.isVerified) {
    showToast('Iniciá sesión para modificar el precio en el catálogo central.');
    return;
  }
  if (!['ADMIN', 'SUPERVISOR', 'SUPERADMIN'].includes(String(authContext.role || '').toUpperCase())) {
    showToast('La liquidación requiere autorización de un administrador o supervisor.');
    return;
  }

  if (confirm(`¿Aplicar descuento de liquidación por vencimiento del ${promoDiscount}% a "${p.name}"?\nPrecio actual: $${originalPrice} -> Nuevo precio: $${newPrice}`)) {
    try {
      await window.OperationalApi.upsertCatalogProduct({
        supabaseClient,
        authContext,
        product: {
          id: p.id,
          sku: p.product_code,
          name: p.name,
          price: newPrice,
          currency: p.currency || 'ARS',
          track_stock: p.track_stock !== false,
          metadata: {
            ...(p.metadata || {}),
            barcode: p.barcode || p.metadata?.barcode || null,
            description: p.description || p.metadata?.description || null,
            category: p.category || p.metadata?.category || null,
            last_price_adjustment: {
              type: 'EXPIRATION_PROMO',
              percent: promoDiscount,
              previous_price: originalPrice,
              actor_user_id: authContext.userId,
              at: new Date().toISOString()
            }
          }
        }
      });
      await loadInternalCatalog();
      renderExpirationsSection();
      showToast(`✓ Promo central confirmada ($${newPrice})`);
    } catch (error) {
      console.error('No se pudo confirmar la liquidación en el catálogo central:', error);
      alert(`El precio no fue modificado.\n\n${error.message || 'Error desconocido'}`);
    }
  }
}

/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — MÓDULO 2: OTRAS TIENDAS CERCA & INGESTA IA
   ==========================================================================
   Red de alianzas con growshops y proveedores locales para entregas en 2 días.
   ========================================================================== */

function getNearbyStores() {
  const grouped = new Map();
  externalCatalogOffers
    .filter(offer => offer.source_type === 'LOCAL_STORE')
    .forEach(offer => {
      if (!grouped.has(offer.source_id)) {
        grouped.set(offer.source_id, {
          id: offer.source_id,
          name: offer.source_name,
          phone: String(offer.source_phone || String(offer.source_contact_info || '').split('·')[0]).replace(/\D/g, ''),
          address: offer.source_address || '',
          estimated_days: Number(offer.estimated_days || 2),
          catalog: []
        });
      }
      grouped.get(offer.source_id).catalog.push({
        id: offer.id,
        product_code: offer.external_sku,
        name: offer.name,
        price: Number(offer.retail_price || 0),
        public_price: Number(offer.retail_price || 0),
        stock: Number(offer.available_units || 0),
        category: offer.category || 'Otros'
      });
    });
  return Array.from(grouped.values());
}

function saveNearbyStore(store) {
  console.warn('Las tiendas locales se guardan únicamente mediante el catálogo externo central.', store);
  return false;
}

// activeNearbyStoreFilter — declared at top of file

function renderNearbyStoresSection() {
  const tabsContainer = document.getElementById('nearby-stores-tabs-container');
  const grid = document.getElementById('nearby-stores-products-grid');
  if (!grid) return;

  const stores = getNearbyStores();

  if (tabsContainer) {
    tabsContainer.innerHTML = `
      <button type="button" class="b2b-filter-chip ${activeNearbyStoreFilter === 'all' ? 'active' : ''}" onclick="filterNearbyProductsByStore('all')">
        Todas las Tiendas (${stores.length})
      </button>
      ${stores.map(s => `
        <button type="button" class="b2b-filter-chip ${activeNearbyStoreFilter === s.id ? 'active' : ''}" onclick="filterNearbyProductsByStore('${s.id}')">
          🏪 ${escapeStockHtml(s.name)}
        </button>
      `).join('')}
    `;
  }

  let products = [];
  stores.forEach(s => {
    if (activeNearbyStoreFilter === 'all' || activeNearbyStoreFilter === s.id) {
      (s.catalog || []).forEach(p => {
        products.push({ ...p, storeName: s.name, storePhone: s.phone });
      });
    }
  });

  if (products.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--color-text-muted);">
        <span style="font-size: 2.5rem; display: block; margin-bottom: 8px;">🏪</span>
        <p>${escapeStockHtml(externalCatalogLoadError || 'No hay productos cargados en tiendas locales aún.')}</p>
        <button type="button" class="btn btn-secondary" onclick="openAddNearbyStoreModal()" style="margin-top: 10px;">
          ＋ Cargar Lista con Ingesta IA
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = products.map(p => `
    <article class="b2b-product-card" style="border: 1.5px solid #1565c0; border-radius: 16px; padding: 16px; background: var(--color-card-bg);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
        <span style="background: rgba(21,101,192,0.15); border: 1px solid #1565c0; color: #1565c0; font-size: 0.72rem; font-weight: 800; padding: 3px 8px; border-radius: 8px;">
          📦 LLEGA EN 2 DÍAS
        </span>
        <small style="color: var(--color-text-muted); font-size: 0.72rem;">🏪 ${escapeStockHtml(p.storeName)}</small>
      </div>
      <h4 style="margin: 0 0 6px 0; font-size: 1rem; color: var(--color-text-main); line-height: 1.3;">${escapeStockHtml(p.name)}</h4>
      <div style="font-size: 0.82rem; color: var(--color-text-muted); margin-bottom: 12px;">
        <span>Precio de venta: <strong style="color: var(--color-accent-gold);">$${Number(p.public_price || p.price || 0).toLocaleString('es-AR')}</strong></span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 0.8rem; color: #2e7d32; font-weight: 700;">Stock: ${p.stock || 0} u.</span>
        <button type="button" class="btn btn-secondary nearby-store-wa-btn"
          data-product-id="${escapeStockHtml(p.id)}"
          data-store-phone="${escapeStockHtml(p.storePhone)}"
          data-product-name="${escapeStockHtml(p.name)}"
          style="padding: 6px 12px; font-size: 0.78rem; border-color: #25d366; color: #25d366; font-weight: 700; border-radius: 8px;">
          💬 Pedir por WA
        </button>
      </div>
    </article>
  `).join('');
  grid.querySelectorAll('.nearby-store-wa-btn').forEach(button => {
    button.addEventListener('click', () => {
      orderNearbyProductViaWa(
        button.dataset.productId,
        button.dataset.storePhone,
        button.dataset.productName
      );
    });
  });
}

function filterNearbyProductsByStore(storeId) {
  activeNearbyStoreFilter = storeId;
  renderNearbyStoresSection();
}

function openAddNearbyStoreModal() {
  const modal = document.getElementById('modal-add-nearby-store');
  if (modal) modal.style.display = 'flex';
}

function closeAddNearbyStoreModal() {
  const modal = document.getElementById('modal-add-nearby-store');
  if (modal) modal.style.display = 'none';
}

async function handleSaveNearbyStore(event) {
  event.preventDefault();
  const name = document.getElementById('nearby-store-name').value.trim();
  const phone = document.getElementById('nearby-store-phone').value.replace(/\D/g, '');
  const address = document.getElementById('nearby-store-address').value.trim();
  const markup = Number(document.getElementById('nearby-store-markup').value) || 30;
  const rawText = document.getElementById('nearby-store-raw-catalog').value.trim();

  const authContext = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  if (!window.OperationalApi || !supabaseClient || !authContext?.isVerified) {
    alert('Iniciá sesión para guardar la tienda y sus ofertas en el catálogo central.');
    return;
  }
  const parsedCatalog = parseNearbyStoreCatalogWithAi(rawText, markup, 'central', name, phone);
  if (!name || parsedCatalog.length === 0) {
    alert('Ingresá el nombre de la tienda y al menos una línea de producto con precio.');
    return;
  }
  const submitButton = event.submitter;
  if (submitButton) submitButton.disabled = true;
  try {
    const source = await window.OperationalApi.upsertExternalCatalogSource({
      supabaseClient,
      authContext,
      source: {
        source_type: 'LOCAL_STORE',
        name,
        contact_info: phone || null,
        estimated_days: 2,
        active: true,
        metadata: {
          address: address || null,
          imported_from: 'nearby-store-text'
        }
      }
    });
    await Promise.all(parsedCatalog.map((product, index) => window.OperationalApi.upsertExternalCatalogOffer({
      supabaseClient,
      authContext,
      offer: {
        source_id: source.id,
        external_sku: product.product_code || `LOCAL-${index + 1}`,
        name: product.name,
        category: product.category || 'Otros',
        cost_price: product.price,
        retail_price: product.public_price,
        available_units: product.stock,
        active: true,
        metadata: { imported_from: 'nearby-store-text' }
      }
    })));
    await loadExternalCatalogOffers('', 'LOCAL_STORE');
    closeAddNearbyStoreModal();
    renderNearbyStoresSection();
    renderPosSearchResults(document.getElementById('pos-unified-search')?.value || '');
    if (window.showToast) window.showToast(`✓ Tienda "${name}" sincronizada con ${parsedCatalog.length} productos`);
  } catch (error) {
    console.error('No se sincronizó la tienda local:', error);
    alert(`No se guardó la tienda.\n\n${error.message || 'Error desconocido'}`);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function parseNearbyStoreCatalogWithAi(rawText, markupPercent, storeId, storeName, phone) {
  if (!rawText) return [];
  const lines = rawText.split(/\r?\n/).filter(l => l.trim().length > 0);
  const products = [];

  lines.forEach((line, idx) => {
    // Parser inteligente: busca nombre, precio ($123 o 12300) y stock opcional (Stock: 5 o 5 u)
    const priceMatch = line.match(/\$?(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+)/g);
    if (!priceMatch || priceMatch.length === 0) return;
    const cleanPrice = priceMatch[priceMatch.length - 1].replace(/\./g, '').replace(/,/g, '.');
    const price = Number.parseFloat(cleanPrice);
    if (!Number.isFinite(price) || price <= 0) return;

    const stockMatch = line.match(/stock[:\s]+(\d+)/i) || line.match(/(\d+)\s*(?:u|unidades|disp)/i);
    const stock = stockMatch ? Number.parseInt(stockMatch[1], 10) : 5;

    // Limpiar nombre
    let prodName = line
      .replace(/stock[:\s]+\d+/i, '')
      .replace(/(\d+)\s*(?:u|unidades|disp)/i, '')
      .replace(/\$?(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+)/g, '')
      .replace(/[-–—]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!prodName || prodName.length < 3) {
      prodName = `Producto Aliado #${idx + 1}`;
    }

    const publicPrice = Math.round(price * (1 + markupPercent / 100));

    products.push({
      id: `loc_p_${storeId}_${idx + 1}`,
      product_code: `LOC-${idx + 1}`,
      name: prodName,
      price,
      public_price: publicPrice,
      stock,
      category: 'Otros'
    });
  });

  return products;
}

function orderNearbyProductViaWa(productId, storePhone, productName) {
  const cleanPhone = (storePhone || '').replace(/\D/g, '');
  const activeVendor = localStorage.getItem('boeweb_vendor_name') || 'BÔ Grow Club';
  const msg = `¡Hola! 👋 Te escribo de *BÔ Grow Club* (${activeVendor}). Queremos hacer un pedido rápido del producto: *${productName}* para coordinar entrega en 2 días. ¿Tienen disponibilidad confirmada? ¡Muchas gracias! 🌿`;
  window.open(cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — MÓDULO 3: LÍMITE DIARIO DE PRECIOS
   ==========================================================================
   El vendedor puede ajustar/descontar precios hasta 5 veces por día.
   ========================================================================== */

function getVendorPriceAdjustmentKey(vendorName) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const safeName = (vendorName || 'vendedor').toLowerCase().replace(/\s+/g, '_');
  return `boeweb_price_adjustments_${safeName}_${dateStr}`;
}

function getVendorPriceAdjustmentCount(vendorName) {
  const key = getVendorPriceAdjustmentKey(vendorName);
  return Number.parseInt(localStorage.getItem(key) || '0', 10);
}

function canVendorAdjustPrice(vendorName, isSuperadmin = false) {
  if (isSuperadmin) return { allowed: true, count: 0, max: Infinity, remaining: Infinity };
  const count = getVendorPriceAdjustmentCount(vendorName);
  const max = 5;
  return {
    allowed: count < max,
    count,
    max,
    remaining: Math.max(0, max - count)
  };
}

function recordVendorPriceAdjustment(vendorName, isSuperadmin = false) {
  if (isSuperadmin) return true;
  const key = getVendorPriceAdjustmentKey(vendorName);
  const count = getVendorPriceAdjustmentCount(vendorName);
  localStorage.setItem(key, String(count + 1));
  return count + 1;
}

/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — MÓDULO 4: CUENTAS CORRIENTES & FIADOS EN POS
   ==========================================================================
   Gestión de crédito comercial, libro mayor de deudas y vencimiento de pagos.
   ========================================================================== */

function getCurrentAccounts() {
  return canonicalCurrentAccounts.map(account => ({
    ...account,
    ledger: Array.isArray(account.ledger) ? account.ledger.map(entry => ({ ...entry })) : []
  }));
}

async function loadCanonicalCurrentAccounts() {
  const context = await ensureVendorOperationalSession();
  if (!supabaseClient || !context) {
    canonicalCurrentAccounts = [];
    return canonicalCurrentAccounts;
  }

  try {
    const [accountsResult, customersResult, ledgerResult] = await Promise.all([
      supabaseClient
        .from('customer_accounts')
        .select('id,customer_id,currency,credit_limit,balance,status,payment_terms_days,updated_at')
        .eq('tenant_id', context.tenantId)
        .neq('status', 'CLOSED'),
      supabaseClient
        .from('customers')
        .select('id,display_name,tax_id,email,phone,status')
        .eq('tenant_id', context.tenantId)
        .neq('status', 'ARCHIVED'),
      supabaseClient
        .from('accounts_receivable_ledger')
        .select('id,document_number,account_id,customer_id,entry_type,direction,amount,balance_after,currency,sale_id,due_date,description,metadata,created_at')
        .eq('tenant_id', context.tenantId)
        .order('created_at', { ascending: false })
        .limit(500)
    ]);
    if (accountsResult.error) throw accountsResult.error;
    if (customersResult.error) throw customersResult.error;
    if (ledgerResult.error) throw ledgerResult.error;

    const customers = new Map((customersResult.data || []).map(customer => [customer.id, customer]));
    const ledgerByAccount = new Map();
    (ledgerResult.data || []).forEach(entry => {
      const entries = ledgerByAccount.get(entry.account_id) || [];
      entries.push({
        id: entry.id,
        documentNumber: entry.document_number || null,
        date: entry.created_at,
        concept: entry.description || entry.entry_type,
        amount: Number(entry.amount) || 0,
        type: entry.direction === 'DEBIT' ? 'DEBIT' : 'CREDIT',
        balance_after: Number(entry.balance_after) || 0,
        sale_id: entry.sale_id,
        due_date: entry.due_date,
        method: entry.metadata?.method || '',
        items: []
      });
      ledgerByAccount.set(entry.account_id, entries);
    });

    canonicalCurrentAccounts = (accountsResult.data || []).map(account => {
      const customer = customers.get(account.customer_id) || {};
      return {
        id: account.customer_id,
        account_id: account.id,
        customer_name: customer.display_name || 'Cliente',
        dni: customer.tax_id || '',
        phone: customer.phone || '',
        email: customer.email || '',
        currency: account.currency || 'ARS',
        credit_limit: Number(account.credit_limit) || 0,
        current_balance: Number(account.balance) || 0,
        first_payment_due: ledgerByAccount.get(account.id)?.find(entry => entry.due_date)?.due_date || '',
        status: account.status,
        payment_terms_days: Number(account.payment_terms_days) || 0,
        ledger: ledgerByAccount.get(account.id) || []
      };
    });
    return getCurrentAccounts();
  } catch (error) {
    console.error('No se pudieron cargar las cuentas corrientes centralizadas:', error);
    canonicalCurrentAccounts = [];
    return [];
  }
}

function saveCurrentAccount(account) {
  throw new Error(`La cuenta corriente local fue retirada. Usá los comandos centrales (${account?.id || 'sin cliente'}).`);
}

function switchPortfolioSubtab(subtab) {
  const btnCc = document.getElementById('portfolio-subtab-btn-cc');
  const btnGeneral = document.getElementById('portfolio-subtab-btn-general');
  const panelCc = document.getElementById('portfolio-subtab-cc');
  const panelGeneral = document.getElementById('portfolio-subtab-general');

  if (subtab === 'cc') {
    if (btnCc) btnCc.classList.add('active');
    if (btnGeneral) btnGeneral.classList.remove('active');
    if (panelCc) panelCc.style.display = 'block';
    if (panelGeneral) panelGeneral.style.display = 'none';
    renderCurrentAccountsUI();
  } else {
    if (btnCc) btnCc.classList.remove('active');
    if (btnGeneral) btnGeneral.classList.add('active');
    if (panelCc) panelCc.style.display = 'none';
    if (panelGeneral) panelGeneral.style.display = 'block';
    loadCanonicalVendorClients()
      .then(renderVendorPortfolioUI)
      .catch(error => {
        console.error('No se pudo cargar la cartera central:', error);
        renderVendorPortfolioUI();
      });
  }
}

function renderCurrentAccountsUI() {
  const tableBody = document.getElementById('vendor-cc-table-body');
  const totalDebtEl = document.getElementById('cc-total-debt');
  const activeCountEl = document.getElementById('cc-active-count');
  const dueAlertsEl = document.getElementById('cc-due-alerts');
  if (!tableBody) return;

  const accounts = getCurrentAccounts();
  const search = (document.getElementById('cc-search-input')?.value || '').toLowerCase();

  const totalDebt = accounts.reduce((sum, a) => sum + (Number(a.current_balance) || 0), 0);
  const activeCount = accounts.filter(a => (a.current_balance || 0) > 0).length;

  // Due alerts: accounts with balance > 0 and due date within 7 days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let dueAlertCount = 0;
  accounts.forEach(a => {
    if ((a.current_balance || 0) > 0 && a.first_payment_due) {
      const dueDate = new Date(a.first_payment_due + 'T00:00:00');
      const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 7) dueAlertCount++;
    }
  });

  if (totalDebtEl) totalDebtEl.textContent = `$${totalDebt.toLocaleString('es-AR')}`;
  if (activeCountEl) activeCountEl.textContent = activeCount;
  if (dueAlertsEl) dueAlertsEl.textContent = dueAlertCount;

  const filtered = accounts.filter(a =>
    a.customer_name.toLowerCase().includes(search) ||
    (a.dni && a.dni.includes(search)) ||
    (a.phone && a.phone.includes(search))
  );

  if (filtered.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 20px; color: var(--color-text-muted);">
          No se encontraron cuentas corrientes con ese criterio.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filtered.map(a => {
    const debt = Number(a.current_balance || 0);
    const limit = Number(a.credit_limit || 0);
    let dueHtml = `<span style="color: var(--color-text-muted);">Sin vencimiento</span>`;

    if (a.first_payment_due) {
      const dueDate = new Date(a.first_payment_due + 'T00:00:00');
      const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        dueHtml = `<span style="background: rgba(239,83,80,0.18); color: #ef5350; border: 1px solid #ef5350; padding: 3px 8px; border-radius: 8px; font-weight: 800; font-size: 0.75rem;">🔴 VENCIDO (${Math.abs(diffDays)}d)</span>`;
      } else if (diffDays <= 7) {
        dueHtml = `<span style="background: rgba(255,152,0,0.18); color: #ff9800; border: 1px solid #ff9800; padding: 3px 8px; border-radius: 8px; font-weight: 800; font-size: 0.75rem;">🟠 Vence en ${diffDays}d (${a.first_payment_due})</span>`;
      } else {
        dueHtml = `<span style="color: #2e7d32; font-weight: 700; font-size: 0.8rem;">🟢 ${a.first_payment_due} (${diffDays}d)</span>`;
      }
    }

    return `
      <tr style="border-bottom: 1px solid var(--color-border-subtle);">
        <td style="padding: 12px 10px;">
          <strong style="color: var(--color-text-main); font-weight: 700;">${escapeStockHtml(a.customer_name)}</strong>
          <span style="display: block; font-size: 0.72rem; color: var(--color-text-muted);">DNI/CUIT: ${escapeStockHtml(a.dni || '-')}</span>
        </td>
        <td style="padding: 12px 10px;">
          <a href="https://wa.me/${a.phone}" target="_blank" style="color: #25d366; font-weight: 700; text-decoration: none;">
            💬 ${a.phone}
          </a>
        </td>
        <td style="padding: 12px 10px; font-size: 1.05rem; font-weight: 800; color: ${debt > 0 ? '#ef5350' : '#2e7d32'};">
          $${debt.toLocaleString('es-AR')}
        </td>
        <td style="padding: 12px 10px; font-size: 0.85rem; color: var(--color-text-muted);">
          $${limit.toLocaleString('es-AR')}
        </td>
        <td style="padding: 12px 10px;">
          ${dueHtml}
        </td>
        <td style="padding: 12px 10px; text-align: right; white-space: nowrap;">
          <button type="button" class="btn btn-secondary" onclick="openCcDetailsModal('${a.id}')" title="Ver detalle de productos con fotos" style="padding: 6px 10px; font-size: 0.75rem; border-color: var(--vendor-forest); color: var(--vendor-forest); border-radius: 8px; font-weight: 700; margin-right: 4px;">
            🔍 Detalle
          </button>
          <button type="button" class="btn btn-secondary" onclick="generateAndPrintCcPdf('${a.id}')" title="Descargar / Imprimir PDF con fotos" style="padding: 6px 10px; font-size: 0.75rem; border-color: #1565c0; color: #1565c0; border-radius: 8px; font-weight: 700; margin-right: 4px;">
            📄 PDF
          </button>
          <button type="button" class="btn btn-secondary" onclick="openRecordCcPaymentModal('${a.id}')" title="Registrar Cobro" style="padding: 6px 10px; font-size: 0.75rem; border-color: #4caf50; color: #4caf50; border-radius: 8px; font-weight: 700; margin-right: 4px;">
            💵 Cobrar
          </button>
          <button type="button" class="btn btn-secondary" onclick="sendCcDetailedWhatsApp('${a.id}')" title="Enviar recordatorio y detalle por WhatsApp" style="padding: 6px 10px; font-size: 0.75rem; border-color: #25d366; color: #25d366; border-radius: 8px; font-weight: 700;">
            💬 WA
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// currentSelectedCcId — declared at top of file

function openCcDetailsModal(ccId) {
  currentSelectedCcId = ccId;
  const accounts = getCurrentAccounts();
  const account = accounts.find(a => a.id === ccId);
  if (!account) return;

  const headerEl = document.getElementById('cc-details-customer-header');
  const debtEl = document.getElementById('cc-details-debt-badge');
  const limitEl = document.getElementById('cc-details-limit-badge');
  const dueEl = document.getElementById('cc-details-due-badge');

  if (headerEl) headerEl.textContent = `${account.customer_name} · DNI: ${account.dni || '-'} · Tel: ${account.phone || '-'}`;
  if (debtEl) debtEl.textContent = `$${Number(account.current_balance || 0).toLocaleString('es-AR')}`;
  if (limitEl) limitEl.textContent = `$${Number(account.credit_limit || 0).toLocaleString('es-AR')}`;
  if (dueEl) dueEl.textContent = account.first_payment_due || 'Sin fecha fijada';

  renderCcDetailsMovements(account);

  const modal = document.getElementById('modal-cc-details');
  if (modal) modal.style.display = 'flex';
}

function closeCcDetailsModal() {
  const modal = document.getElementById('modal-cc-details');
  if (modal) modal.style.display = 'none';
}

function renderCcDetailsMovements(account) {
  const container = document.getElementById('cc-details-movements-container');
  if (!container) return;

  const ledger = Array.isArray(account.ledger) ? [...account.ledger].reverse() : [];

  if (ledger.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px; color: var(--color-text-muted);">
        No hay compras ni pagos registrados aún en esta cuenta corriente.
      </div>
    `;
    return;
  }

  container.innerHTML = ledger.map((mov, idx) => {
    const isDebit = mov.type === 'DEBIT';
    const movDate = mov.date || '-';
    const amountFormatted = Number(mov.amount || 0).toLocaleString('es-AR');
    const balanceAfterFormatted = Number(mov.balance_after || 0).toLocaleString('es-AR');

    if (isDebit) {
      const items = Array.isArray(mov.items) && mov.items.length > 0
        ? mov.items
        : [
            { name: mov.concept || 'Productos varios', quantity: 1, unit_price: mov.amount || 0, subtotal: mov.amount || 0, image: 'assets/logo.jpg' }
          ];

      return `
        <div style="border: 1px solid var(--color-border-subtle); border-radius: 12px; padding: 14px; background: rgba(255,255,255,0.02);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px dashed var(--color-border-subtle); padding-bottom: 8px;">
            <div>
              <span style="background: rgba(239,83,80,0.15); color: #ef5350; border: 1px solid #ef5350; padding: 2px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 800; margin-right: 6px;">
                📦 COMPRA FIADA (${movDate})
              </span>
              <strong style="color: var(--color-text-main); font-size: 0.9rem;">${escapeStockHtml(mov.concept)}</strong>
            </div>
            <div style="text-align: right;">
              <strong style="color: #ef5350; font-size: 1.1rem;">+$${amountFormatted}</strong>
              <span style="display: block; font-size: 0.72rem; color: var(--color-text-muted);">Saldo posterior: $${balanceAfterFormatted}</span>
            </div>
          </div>

          <!-- Product Details with Photos -->
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${items.map(item => {
              const imgUrl = item.image || 'assets/logo.jpg';
              const itemQty = Number(item.quantity) || 1;
              const unitPrice = Number(item.unit_price) || 0;
              const itemSub = Number(item.subtotal) || (unitPrice * itemQty);

              return `
                <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(21,45,36,0.03); border: 1px solid var(--color-border-subtle); border-radius: 10px; padding: 8px 12px;">
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="${imgUrl}" alt="${escapeStockHtml(item.name)}" style="width: 44px; height: 44px; object-fit: cover; border-radius: 8px; border: 1px solid var(--color-border-subtle); background: #fff;" onerror="this.src='assets/logo.jpg'">
                    <div>
                      <strong style="color: var(--color-text-main); font-size: 0.88rem; display: block;">${escapeStockHtml(item.name)}</strong>
                      <span style="font-size: 0.75rem; color: var(--color-text-muted);">
                        ${itemQty} u. × $${unitPrice.toLocaleString('es-AR')}
                      </span>
                    </div>
                  </div>
                  <strong style="color: var(--vendor-forest); font-size: 0.95rem;">
                    $${itemSub.toLocaleString('es-AR')}
                  </strong>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    } else {
      // CREDIT / PAYMENT
      return `
        <div style="border: 1px solid rgba(76,175,80,0.3); border-radius: 12px; padding: 14px; background: rgba(76,175,80,0.04);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div>
              <span style="background: rgba(76,175,80,0.18); color: #2e7d32; border: 1px solid #4caf50; padding: 2px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 800; margin-right: 6px;">
                💵 COBRO / PAGO (${movDate})
              </span>
              <strong style="color: var(--color-text-main); font-size: 0.9rem;">${escapeStockHtml(mov.concept)}</strong>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="text-align: right;">
                <strong style="color: #2e7d32; font-size: 1.1rem;">-${amountFormatted}</strong>
                <span style="display: block; font-size: 0.72rem; color: var(--color-text-muted);">Saldo posterior: ${balanceAfterFormatted}</span>
              </div>
              ${mov.documentNumber ? `<div style="display: flex; gap: 6px;">
                <button type="button" class="btn btn-secondary" onclick="printSingleMovementPaymentReceipt('${escapeStockHtml(account.id)}', '${escapeStockHtml(mov.id || mov.date)}')" style="padding: 4px 8px; font-size: 0.75rem; font-weight: 700; border-radius: 6px; background: #fff; border: 1px solid #81c784; color: #2e7d32; cursor: pointer;" title="Imprimir ${escapeStockHtml(mov.documentNumber)} con duplicado">
                  🖨️ ${escapeStockHtml(mov.documentNumber)}
                </button>
                <button type="button" class="btn btn-primary" onclick="sendSingleMovementPaymentWhatsApp('${escapeStockHtml(account.id)}', '${escapeStockHtml(mov.id || mov.date)}')" style="padding: 4px 8px; font-size: 0.75rem; font-weight: 800; background: #25d366; border: none; color: #fff; border-radius: 6px; cursor: pointer;" title="Compartir constancia por WhatsApp">
                  📲 WA
                </button>
              </div>` : '<small style="color: var(--color-text-muted);">Registro histórico sin numeración</small>'}
            </div>
          </div>
        </div>
      `;
    }
  }).join('');
}

function generateAndPrintCcPdf(ccId = null) {
  const targetId = ccId || currentSelectedCcId;
  const accounts = getCurrentAccounts();
  const account = accounts.find(a => a.id === targetId);
  if (!account) {
    alert('Seleccioná una cuenta corriente válida para generar el comprobante PDF.');
    return;
  }

  const vendorName = localStorage.getItem('boeweb_vendor_name') || 'BÔ Grow Club';
  const emitDate = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const balance = Number(account.current_balance || 0).toLocaleString('es-AR');
  const limit = Number(account.credit_limit || 0).toLocaleString('es-AR');
  const dueDate = account.first_payment_due || 'A convenir';

  // Gather all items from DEBIT movements
  const allDebits = (account.ledger || []).filter(m => m.type === 'DEBIT');
  const allCredits = (account.ledger || []).filter(m => m.type === 'CREDIT');

  const totalPurchases = allDebits.reduce((s, m) => s + Number(m.amount || 0), 0);
  const totalPaid = allCredits.reduce((s, m) => s + Number(m.amount || 0), 0);

  const printWindow = window.open('', '_blank', 'width=900,height=850');
  if (!printWindow) {
    alert('El navegador bloqueó la ventana emergente para imprimir el PDF. Por favor habilitala.');
    return;
  }

  const printHtml = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Estado de Cuenta Corriente — ${escapeStockHtml(account.customer_name)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 15mm 15mm 15mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1a2e26;
      background: #fff;
      margin: 0;
      padding: 10px;
      font-size: 12px;
      line-height: 1.4;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #152D24;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .brand-title {
      font-size: 22px;
      font-weight: 900;
      color: #152D24;
      letter-spacing: 0.5px;
      margin: 0;
    }
    .brand-sub {
      font-size: 11px;
      color: #555;
      margin: 2px 0 0 0;
    }
    .doc-badge {
      text-align: right;
    }
    .doc-badge h2 {
      margin: 0;
      font-size: 16px;
      color: #C2A246;
    }
    .customer-card {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      background: #fbf9f4;
      border: 1px solid #e0d8c3;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 16px;
    }
    .customer-card h4 {
      margin: 0 0 6px 0;
      font-size: 13px;
      color: #152D24;
    }
    .table-products {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    .table-products th {
      background: #152D24;
      color: #fff;
      text-align: left;
      padding: 8px 10px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .table-products td {
      padding: 8px 10px;
      border-bottom: 1px solid #eee;
      vertical-align: middle;
    }
    .prod-img {
      width: 46px;
      height: 46px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid #ddd;
      background: #fff;
      display: block;
    }
    .financial-summary {
      display: flex;
      justify-content: space-between;
      background: #fbf9f4;
      border: 1.5px solid #152D24;
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 16px;
    }
    .balance-highlight {
      font-size: 20px;
      font-weight: 900;
      color: #d32f2f;
    }
    .payment-instructions {
      border: 1px dashed #1565c0;
      background: #f0f7ff;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 16px;
      font-size: 11px;
    }
    .footer-note {
      text-align: center;
      font-size: 10px;
      color: #888;
      margin-top: 15px;
      border-top: 1px solid #eee;
      padding-top: 8px;
    }
    @media print {
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="background: #152D24; color: #fff; padding: 10px 14px; border-radius: 8px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
    <span>📄 Vista Previa de Impresión / Guardar como PDF</span>
    <button onclick="window.print()" style="background: #C2A246; color: #152D24; border: none; font-weight: 800; padding: 8px 16px; border-radius: 6px; cursor: pointer;">
      🖨️ IMPRIMIR / GUARDAR PDF
    </button>
  </div>

  <div class="header">
    <div>
      <h1 class="brand-title">🌿 BÔ GROW CLUB</h1>
      <p class="brand-sub">Cultivo Indoor · Nutrición Orgánica · Asesoramiento Profesional</p>
      <p class="brand-sub">Paraná, Entre Ríos · Tel: +54 9 343 467-5428</p>
    </div>
    <div class="doc-badge">
      <h2>ESTADO DE CUENTA CORRIENTE</h2>
      <p style="margin: 3px 0 0 0; font-size: 11px; color: #666;">Fecha de Emisión: <strong>${emitDate}</strong></p>
      <p style="margin: 2px 0 0 0; font-size: 11px; color: #666;">Asesor: <strong>${escapeStockHtml(vendorName)}</strong></p>
    </div>
  </div>

  <div class="customer-card">
    <div>
      <h4>👤 Datos del Cliente</h4>
      <p style="margin: 2px 0;"><strong>Nombre:</strong> ${escapeStockHtml(account.customer_name)}</p>
      <p style="margin: 2px 0;"><strong>DNI / CUIT:</strong> ${escapeStockHtml(account.dni || 'No registrado')}</p>
      <p style="margin: 2px 0;"><strong>WhatsApp / Tel:</strong> ${escapeStockHtml(account.phone || '-')}</p>
    </div>
    <div>
      <h4>📋 Condiciones del Crédito</h4>
      <p style="margin: 2px 0;"><strong>Límite de Crédito:</strong> $${limit}</p>
      <p style="margin: 2px 0;"><strong>Fecha Límite 1.° Pago:</strong> <strong style="color: #d32f2f;">${dueDate}</strong></p>
      <p style="margin: 2px 0;"><strong>Estado:</strong> ${Number(account.current_balance || 0) > 0 ? '⚠️ Saldo Pendiente de Pago' : '🟢 Al día'}</p>
    </div>
  </div>

  <h3 style="color: #152D24; font-size: 13px; margin: 0 0 8px 0;">📦 Detalle de Productos Retirados de la Tienda</h3>
  <table class="table-products">
    <thead>
      <tr>
        <th style="width: 55px;">Foto</th>
        <th>Fecha / Comprobante</th>
        <th>Producto / Descripción</th>
        <th style="text-align: center;">Cant.</th>
        <th style="text-align: right;">P. Unitario</th>
        <th style="text-align: right;">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${allDebits.flatMap(mov => {
        const items = Array.isArray(mov.items) && mov.items.length > 0
          ? mov.items
          : [{ name: mov.concept, quantity: 1, unit_price: mov.amount, subtotal: mov.amount, image: 'assets/logo.jpg' }];

        return items.map((item, i) => `
          <tr>
            <td>
              <img class="prod-img" src="${item.image || 'assets/logo.jpg'}" alt="${escapeStockHtml(item.name)}" onerror="this.src='assets/logo.jpg'">
            </td>
            <td style="font-size: 11px;">
              <strong>${mov.date}</strong>
              <span style="display: block; color: #777; font-size: 10px;">${escapeStockHtml(mov.concept || '')}</span>
            </td>
            <td>
              <strong style="color: #152D24; font-size: 12px;">${escapeStockHtml(item.name)}</strong>
              ${item.product_code ? `<span style="display: block; font-size: 10px; color: #888;">SKU: ${escapeStockHtml(item.product_code)}</span>` : ''}
            </td>
            <td style="text-align: center; font-weight: 700;">${item.quantity} u.</td>
            <td style="text-align: right;">$${Number(item.unit_price || 0).toLocaleString('es-AR')}</td>
            <td style="text-align: right; font-weight: 700; color: #152D24;">$${Number(item.subtotal || 0).toLocaleString('es-AR')}</td>
          </tr>
        `);
      }).join('')}
    </tbody>
  </table>

  <div class="financial-summary">
    <div>
      <span style="font-size: 11px; color: #666; display: block;">Total Compras Realizadas:</span>
      <strong style="font-size: 14px;">$${totalPurchases.toLocaleString('es-AR')}</strong>
      <span style="font-size: 11px; color: #2e7d32; display: block; margin-top: 4px;">Total Pagos / Entregas:</span>
      <strong style="font-size: 14px; color: #2e7d32;">-$${totalPaid.toLocaleString('es-AR')}</strong>
    </div>
    <div style="text-align: right;">
      <span style="font-size: 12px; color: #555; display: block;">TOTAL SALDO PENDIENTE A ABONAR:</span>
      <div class="balance-highlight">$${balance}</div>
      <small style="color: #e65100; font-weight: 700;">Vencimiento acordado: ${dueDate}</small>
    </div>
  </div>

  <div class="payment-instructions">
    <strong style="color: #1565c0; font-size: 12px; display: block; margin-bottom: 4px;">🏦 Datos Bancarios para Cancelación / Transferencia:</strong>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
      <div>• <strong>Alias:</strong> BOGROWCLUB.OFICIAL</div>
      <div>• <strong>CBU:</strong> 0000003100012345678901</div>
      <div>• <strong>Titular:</strong> BÔ Grow Club</div>
      <div>• <strong>Banco:</strong> Banco de Entre Ríos / Santander</div>
    </div>
    <small style="display: block; margin-top: 6px; color: #555;">Una vez realizada la transferencia, enviar el comprobante a este WhatsApp para asentar la acreditación de saldo.</small>
  </div>

  <div class="footer-note">
    Documento informativo no válido como factura fiscal. BÔ Grow Club — Pasión por el Cultivo y la Excelencia.
  </div>

  <script>
    window.onload = function() {
      // Auto-trigger print dialog after images render
      setTimeout(function() {
        window.print();
      }, 400);
    };
  </script>
</body>
</html>
  `;

  printWindow.document.open();
  printWindow.document.write(printHtml);
  printWindow.document.close();
}

function sendCcDetailedWhatsApp(ccId) {
  const accounts = getCurrentAccounts();
  const account = accounts.find(a => a.id === ccId);
  if (!account) return;

  const phone = (account.phone || '').replace(/\D/g, '');
  if (!phone) {
    alert('Esta cuenta corriente no tiene un teléfono celular registrado.');
    return;
  }

  const balance = Number(account.current_balance || 0).toLocaleString('es-AR');
  const dueDate = account.first_payment_due || 'a convenir';
  const vendorName = localStorage.getItem('boeweb_vendor_name') || 'BÔ Grow Club';

  // Extract products taken
  const allDebits = (account.ledger || []).filter(m => m.type === 'DEBIT');
  const itemsSummary = allDebits.flatMap(m => {
    if (Array.isArray(m.items) && m.items.length > 0) {
      return m.items.map(it => `• ${it.quantity}x *${it.name}* — $${Number(it.subtotal || 0).toLocaleString('es-AR')}`);
    }
    return [`• 1x *${m.concept}* — $${Number(m.amount || 0).toLocaleString('es-AR')}`];
  });

  const msg = `🌿 *BÔ Grow Club — Resumen de Cuenta Corriente*\n\n¡Hola ${account.customer_name}! 👋 Te saluda ${vendorName} de *BÔ Grow Club*.\n\nTe compartimos el detalle de los productos retirados de la tienda y el saldo pendiente:\n\n📦 *Productos Retirados:*\n${itemsSummary.slice(0, 10).join('\n')}\n\n💰 *Total Saldo Adeudado:* *$${balance}*\n📅 *Fecha Límite Acordada:* *${dueDate}*\n\n💳 *Datos para Transferencia:*\n• Alias: *BOGROWCLUB.OFICIAL*\n• CBU: *0000003100012345678901*\n• Titular: *BÔ Grow Club*\n\n*(Podés solicitar el comprobante PDF con fotos de tus productos por este medio)*. ¡Muchas gracias por tu confianza! 🙏`;

  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

function sendCcDetailedWhatsAppFromModal() {
  if (currentSelectedCcId) {
    sendCcDetailedWhatsApp(currentSelectedCcId);
  }
}

function openNewCurrentAccountModal(mode = 'credit') {
  const modal = document.getElementById('modal-new-current-account');
  if (!modal) return;
  const isGeneral = mode === 'general';
  modal.dataset.mode = isGeneral ? 'general' : 'credit';
  const title = document.getElementById('modal-cc-title');
  const creditFields = document.getElementById('cc-new-credit-fields');
  const submitButton = document.getElementById('cc-new-submit-button');
  if (title) title.textContent = isGeneral ? '👤 Alta de cliente' : '📋 Alta de Cuenta Corriente';
  if (creditFields) creditFields.style.display = isGeneral ? 'none' : 'grid';
  if (submitButton) submitButton.textContent = isGeneral ? 'Guardar cliente' : 'Guardar Cuenta';
  modal.style.display = 'flex';
}

function closeNewCurrentAccountModal() {
  const modal = document.getElementById('modal-new-current-account');
  if (modal) modal.style.display = 'none';
}

async function handleCreateCurrentAccount(event) {
  event.preventDefault();
  const name = document.getElementById('cc-new-name').value.trim();
  const dni = document.getElementById('cc-new-dni').value.trim();
  const phone = document.getElementById('cc-new-phone').value.replace(/\D/g, '');
  const isGeneralCustomer = document.getElementById('modal-new-current-account')?.dataset.mode === 'general';
  const limit = isGeneralCustomer ? 0 : (Number(document.getElementById('cc-new-limit').value) || 300000);
  const dueDate = document.getElementById('cc-new-due-date').value || null;

  const authContext = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  if (!window.OperationalApi || !supabaseClient || !authContext?.isVerified) {
    alert('Iniciá sesión para crear clientes centrales.');
    return;
  }

  const submitButton = event.submitter;
  if (submitButton) submitButton.disabled = true;
  try {
    await window.OperationalApi.upsertCustomer({
      supabaseClient,
      authContext,
      customer: {
        display_name: name,
        dni,
        phone,
        credit_limit: limit,
        currency: 'ARS',
        metadata: {
          preferred_first_due_date: dueDate,
          salesperson_user_id: authContext.userId,
          source: isGeneralCustomer ? 'customer-form' : 'current-account-form'
        }
      }
    });
    await Promise.all([loadCanonicalCurrentAccounts(), loadCanonicalVendorClients()]);
    closeNewCurrentAccountModal();
    renderCurrentAccountsUI();
    renderVendorPortfolioUI();
    populatePosCurrentAccountDropdown();
    if (window.showToast) window.showToast(isGeneralCustomer
      ? `Cliente "${name}" creado en el registro central.`
      : `Cuenta corriente de "${name}" creada en el registro central.`);
  } catch (error) {
    console.error('No se pudo crear la cuenta corriente:', error);
    alert(`No se creó el cliente.\n\n${error.message || 'Error desconocido'}`);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function openRecordCcPaymentModal(ccId) {
  const accounts = getCurrentAccounts();
  const account = accounts.find(a => a.id === ccId);
  if (!account) return;

  document.getElementById('cc-pay-account-id').value = ccId;
  document.getElementById('cc-pay-customer-name').textContent = account.customer_name;
  document.getElementById('cc-pay-current-debt').textContent = `$${Number(account.current_balance || 0).toLocaleString('es-AR')}`;
  document.getElementById('cc-pay-amount').value = account.current_balance || '';

  const modal = document.getElementById('modal-record-cc-payment');
  if (modal) modal.style.display = 'flex';
}

function closeRecordCcPaymentModal() {
  const modal = document.getElementById('modal-record-cc-payment');
  if (modal) modal.style.display = 'none';
}

async function handleRecordCcPaymentSubmit(event) {
  event.preventDefault();
  const ccId = document.getElementById('cc-pay-account-id').value;
  const amount = Number(document.getElementById('cc-pay-amount').value);
  const method = document.getElementById('cc-pay-method').value;
  const note = document.getElementById('cc-pay-note').value.trim();

  if (!amount || amount <= 0) {
    alert('Ingresá un monto válido para el cobro.');
    return;
  }

  const accounts = getCurrentAccounts();
  const account = accounts.find(a => a.id === ccId);
  if (!account) return;
  if (amount > Number(account.current_balance || 0)) {
    alert(`El cobro no puede superar la deuda actual de ${formatCashCurrency(account.current_balance)}.`);
    return;
  }

  const authContext = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  if (!window.OperationalApi || !supabaseClient || !authContext?.isVerified) {
    alert('Iniciá sesión para registrar la cobranza central.');
    return;
  }
  const registerId = method === 'EFECTIVO' ? (document.getElementById('pos-register-select')?.value || null) : null;
  if (method === 'EFECTIVO' && !registerId) {
    alert('Seleccioná una caja con turno abierto antes de cobrar en efectivo.');
    return;
  }

  const submitButton = event.submitter;
  if (submitButton) submitButton.disabled = true;
  try {
    const result = await window.OperationalApi.recordCustomerAccountPayment({
      supabaseClient,
      authContext,
      customerId: account.id,
      amount,
      method,
      registerId,
      notes: note || 'Pago a cuenta',
      idempotencyKey: `ar-payment:${authContext.userId}:${globalThis.crypto?.randomUUID?.() || Date.now()}`
    });
    await Promise.all([loadCanonicalCurrentAccounts(), refreshCanonicalCashSection(), loadPosRegisters()]);
    const refreshedAccount = getCurrentAccounts().find(item => item.id === ccId);
    const paymentMovement = refreshedAccount?.ledger?.find(item => String(item.id) === String(result.entry_id));
    const receiptNumber = paymentMovement?.documentNumber || null;
    closeRecordCcPaymentModal();
    renderCurrentAccountsUI();
    populatePosCurrentAccountDropdown();
    if (modalCcDetailsIsOpen()) {
      if (refreshedAccount) renderCcDetailsMovements(refreshedAccount);
      const debtEl = document.getElementById('cc-details-debt-badge');
      if (debtEl) debtEl.textContent = formatCashCurrency(result.balance);
    }
    if (window.showToast) window.showToast(`Pago de ${formatCashCurrency(amount)} confirmado. Saldo: ${formatCashCurrency(result.balance)}.`);

    const paymentReceiptData = {
      account,
      amount,
      method,
      notes: note || 'Pago a cuenta corriente',
      previousBalance: Number(account.current_balance || 0),
      balance: Number(result.balance || 0),
      receiptId: receiptNumber,
      date: new Date().toISOString()
    };

    setTimeout(() => {
      if (!receiptNumber) {
        alert('La cobranza quedó registrada, pero no se obtuvo una numeración documental. No se emitirá un recibo informal.');
        return;
      }
      if (confirm(`¿Deseás imprimir el recibo de cobranza ${receiptNumber} (con duplicado) por ${formatCashCurrency(amount)}?`)) {
        printCustomerPaymentReceipt(paymentReceiptData);
      }
      if (account.phone && confirm(`¿Deseás enviar la constancia de pago por WhatsApp a ${account.customer_name}?`)) {
        sendCustomerPaymentWhatsApp(paymentReceiptData);
      }
    }, 250);
  } catch (error) {
    console.error('No se confirmó la cobranza:', error);
    alert(`No se registró el pago.\n\n${error.message || 'Error desconocido'}`);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function modalCcDetailsIsOpen() {
  const modal = document.getElementById('modal-cc-details');
  return modal && modal.style.display !== 'none';
}

function sendCcWhatsAppReminder(ccId) {
  sendCcDetailedWhatsApp(ccId);
}

function openPosExpressItemModal() {
  const modal = document.getElementById('pos-express-item-modal');
  if (modal) {
    modal.style.display = 'block';
    modal.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const nameInput = document.getElementById('pos-express-name');
    if (nameInput) {
      nameInput.value = '';
      setTimeout(() => nameInput.focus(), 80);
    }
    const priceInput = document.getElementById('pos-express-price');
    if (priceInput) priceInput.value = '';
    const qtyInput = document.getElementById('pos-express-qty');
    if (qtyInput) qtyInput.value = '1';
    const skuInput = document.getElementById('pos-express-sku');
    if (skuInput) skuInput.value = '';
  }
}

function closePosExpressItemModal() {
  const modal = document.getElementById('pos-express-item-modal');
  if (modal) modal.style.display = 'none';
  const unifiedInput = document.getElementById('pos-unified-search');
  if (unifiedInput) unifiedInput.focus();
}

function handlePosExpressItemSubmit(e) {
  if (e) e.preventDefault();
  const nameInput = document.getElementById('pos-express-name');
  const priceInput = document.getElementById('pos-express-price');
  const qtyInput = document.getElementById('pos-express-qty');
  const skuInput = document.getElementById('pos-express-sku');

  const name = (nameInput?.value || '').trim();
  const price = Number(priceInput?.value || 0);
  const qty = Number(qtyInput?.value || 1);
  const sku = (skuInput?.value || '').trim().slice(0, 120);

  if (name.length < 3) {
    alert('Ingresá una descripción o nombre para el ítem libre.');
    nameInput?.focus();
    return;
  }
  if (price <= 0) {
    alert('El precio unitario debe ser mayor a $0.');
    priceInput?.focus();
    return;
  }
  if (!Number.isInteger(qty) || qty <= 0 || qty > 999) {
    alert('La cantidad debe ser un número entero entre 1 y 999.');
    qtyInput?.focus();
    return;
  }

  const cart = getPosCartEngine();
  const expressId = `QUICK-${Date.now()}`;
  const added = cart.addItem({
    id: expressId,
    product_code: expressId,
    name: name,
    price: price,
    quantity: qty,
    line_type: 'QUICK_ENTRY',
    product_id: null,
    sku: sku || expressId,
    metadata: { entered_from: 'pos-quick-entry' },
    image_url: 'assets/logo.jpg'
  });
  if (!added) {
    alert('No se pudo agregar el ítem rápido al ticket. Revisá nombre, precio y cantidad.');
    return;
  }

  renderPosCartItems();
  closePosExpressItemModal();
  if (typeof showToast === 'function') {
    showToast(`⚡ Ítem libre '${name}' ($${price.toLocaleString('es-AR')}) agregado al ticket.`);
  }
}

function handlePosPaymentMethodChange() {
  const methodSelect = document.getElementById('pos-payment-method-select');
  const ccContainer = document.getElementById('pos-current-account-container');
  const mixedContainer = document.getElementById('pos-mixed-payment-container');
  const cashChangePanel = document.getElementById('pos-cash-change-panel');
  
  if (!methodSelect) return;
  const val = methodSelect.value;

  if (cashChangePanel) cashChangePanel.style.display = val === 'EFECTIVO' ? 'block' : 'none';

  if (mixedContainer) {
    mixedContainer.style.display = val === 'MIXTO' ? 'block' : 'none';
    if (val === 'MIXTO') {
      const cart = getPosCartEngine();
      const total = cart ? cart.calculateTotal() : 0;
      const cashInput = document.getElementById('pos-mixed-cash-amount');
      const secInput = document.getElementById('pos-mixed-secondary-amount');
      if (cashInput && !cashInput.value) {
        cashInput.value = '';
      }
      if (secInput && !secInput.value) {
        secInput.value = total > 0 ? total : '';
      }
      handlePosMixedPaymentInputChange('init');
    }
  }

  if (ccContainer) {
    const isCcDirect = val === 'CUENTA_CORRIENTE';
    const isCcMixed = val === 'MIXTO' && document.getElementById('pos-mixed-secondary-method')?.value === 'CUENTA_CORRIENTE';
    if (isCcDirect || isCcMixed) {
      ccContainer.style.display = 'block';
      populatePosCurrentAccountDropdown();
    } else {
      ccContainer.style.display = 'none';
    }
  }
}

function handlePosMixedSecondaryMethodChange() {
  const secSelect = document.getElementById('pos-mixed-secondary-method');
  const ccContainer = document.getElementById('pos-current-account-container');
  if (secSelect && ccContainer) {
    if (secSelect.value === 'CUENTA_CORRIENTE') {
      ccContainer.style.display = 'block';
      populatePosCurrentAccountDropdown();
    } else {
      ccContainer.style.display = 'none';
    }
  }
  handlePosMixedPaymentInputChange('change_method');
}

function handlePosMixedPaymentInputChange(source) {
  const cart = getPosCartEngine();
  const total = cart ? cart.calculateTotal() : 0;
  const cashInput = document.getElementById('pos-mixed-cash-amount');
  const secInput = document.getElementById('pos-mixed-secondary-amount');
  const secSelect = document.getElementById('pos-mixed-secondary-method');
  const feedback = document.getElementById('pos-mixed-validation-feedback');

  let cash = Number(cashInput?.value || 0);
  let sec = Number(secInput?.value || 0);

  if (source === 'cash' && cashInput?.value !== '') {
    sec = Math.max(0, total - cash);
    if (secInput) secInput.value = sec > 0 ? sec : (cash >= total ? 0 : sec);
  } else if (source === 'secondary' && secInput?.value !== '') {
    cash = Math.max(0, total - sec);
    if (cashInput) cashInput.value = cash > 0 ? cash : (sec >= total ? 0 : cash);
  }

  const sum = cash + sec;
  const secName = secSelect?.options[secSelect.selectedIndex]?.text || 'Otro medio';

  if (!feedback) return;

  if (total <= 0) {
    feedback.style.background = 'rgba(0,0,0,0.04)';
    feedback.style.color = 'var(--color-text-muted)';
    feedback.textContent = 'El ticket está vacío ($0)';
    return;
  }

  if (Math.abs(sum - total) < 0.01) {
    feedback.style.background = 'rgba(46,125,50,0.12)';
    feedback.style.color = '#2e7d32';
    feedback.textContent = `✅ Efectivo $${cash.toLocaleString('es-AR')} + ${secName} $${sec.toLocaleString('es-AR')} = $${total.toLocaleString('es-AR')}`;
  } else {
    feedback.style.background = 'rgba(211,47,47,0.1)';
    feedback.style.color = '#d32f2f';
    const diff = total - sum;
    if (diff > 0) {
      feedback.textContent = `⚠️ Faltan $${diff.toLocaleString('es-AR')} para completar el total de $${total.toLocaleString('es-AR')}`;
    } else {
      feedback.textContent = `⚠️ La suma supera el total por $${Math.abs(diff).toLocaleString('es-AR')}`;
    }
  }
}

function populatePosCurrentAccountDropdown() {
  const select = document.getElementById('pos-current-account-select');
  if (!select) return;
  const accounts = getCurrentAccounts();
  select.innerHTML = `
    <option value="">-- Elegir cliente registrado --</option>
    ${accounts.map(a => `
      <option value="${a.id}">
        ${escapeStockHtml(a.customer_name)} (Saldo: $${Number(a.current_balance || 0).toLocaleString('es-AR')})
      </option>
    `).join('')}
  `;
}

function updatePosCurrentAccountInfo() {
  const select = document.getElementById('pos-current-account-select');
  const infoEl = document.getElementById('pos-current-account-info');
  const dueDateInput = document.getElementById('pos-cc-due-date');
  if (!select || !infoEl) return;

  const ccId = select.value;
  if (!ccId) {
    infoEl.innerHTML = '';
    return;
  }

  const accounts = getCurrentAccounts();
  const account = accounts.find(a => a.id === ccId);
  if (!account) return;

  const debt = Number(account.current_balance || 0);
  const limit = Number(account.credit_limit || 300000);
  const available = Math.max(0, limit - debt);

  infoEl.innerHTML = `
    <span>💳 Límite total: <strong>$${limit.toLocaleString('es-AR')}</strong></span>
    <span>🔴 Saldo adeudado actual: <strong style="color: #ef5350;">$${debt.toLocaleString('es-AR')}</strong></span>
    <span>🟢 Crédito disponible: <strong style="color: #2e7d32;">$${available.toLocaleString('es-AR')}</strong></span>
  `;

  if (dueDateInput && account.first_payment_due) {
    dueDateInput.value = account.first_payment_due;
  }
}

// ==========================================
// 📷 ESCÁNER UNIVERSAL POR CÁMARA (CELULARES Y PC)
// ==========================================

// universalCameraScanner state — declared at top of file

function playScannerBeep() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, ctx.currentTime);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch (err) {
    console.warn('Audio feedback not available:', err);
  }
}

async function openUniversalCameraScanner(mode = 'pos') {
  universalCameraActiveMode = mode;

  // Detect mobile: touchscreen + small viewport or mobile user agent
  const isMobile = (('ontouchstart' in window) || navigator.maxTouchPoints > 0) &&
    (window.innerWidth < 900 || /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));

  if (isMobile) {
    // On mobile, skip the modal entirely and trigger the native camera app
    // This is the most reliable way — no WebRTC permissions, no getUserMedia, no CDN dependency
    let fileInput = document.getElementById('mobile-camera-barcode-input');
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.id = 'mobile-camera-barcode-input';
      fileInput.accept = 'image/*';
      fileInput.capture = 'environment';
      fileInput.style.display = 'none';
      fileInput.addEventListener('change', (evt) => {
        handleCameraScannerFile(evt);
      });
      document.body.appendChild(fileInput);
    }
    fileInput.value = '';
    fileInput.click();
    return;
  }

  // Desktop: show the full modal with live video stream
  const modal = document.getElementById('modal-universal-camera-scanner');
  const titleEl = document.getElementById('camera-scanner-modal-title');
  const hintEl = document.getElementById('camera-scanner-modal-hint');
  const feedbackEl = document.getElementById('camera-scanner-feedback');

  if (titleEl) {
    if (mode === 'pos') titleEl.textContent = '📷 Escanear Producto para Venta';
    else if (mode === 'stock') titleEl.textContent = '📷 Escanear Código para Ingreso de Stock';
    else if (mode === 'wms') titleEl.textContent = '📷 Escanear Ubicación / Módulo WMS';
    else if (mode === 'customer') titleEl.textContent = '📷 Escanear Pase Digital VIP del Cliente';
  }

  if (hintEl) {
    hintEl.textContent = 'Apuntá la cámara al código de barras o QR. Se detectará automáticamente.';
  }

  if (feedbackEl) {
    feedbackEl.innerHTML = '<span style="color: #81c784;">⚡ Iniciando cámara en vivo…</span>';
  }

  if (modal) {
    modal.style.display = 'flex';
  }

  try {
    await startUniversalCameraReader();
  } catch (err) {
    console.error('Error starting camera reader:', err);
    if (feedbackEl) {
      feedbackEl.innerHTML = '<span style="color: #ff8a80;">⚠️ No se pudo iniciar la cámara. Probá con el botón "📸 Sacar foto al código".</span>';
    }
  }
}

async function startUniversalCameraReader() {
  const viewportId = 'universal-camera-reader-viewport';
  const feedbackEl = document.getElementById('camera-scanner-feedback');

  if (universalCameraScannerInstance) {
    try {
      await universalCameraScannerInstance.stop();
      universalCameraScannerInstance.clear();
    } catch {
      // Ignorar errores al detener
    }
    universalCameraScannerInstance = null;
  }

  if (universalCameraStream) {
    universalCameraStream.getTracks().forEach(track => track.stop());
    universalCameraStream = null;
  }

  // 1. Si Html5Qrcode está disponible (CDN)
  if (window.Html5Qrcode) {
    try {
      universalCameraScannerInstance = new window.Html5Qrcode(viewportId, {
        formatsToSupport: [
          window.Html5QrcodeSupportedFormats.EAN_13,
          window.Html5QrcodeSupportedFormats.EAN_8,
          window.Html5QrcodeSupportedFormats.CODE_128,
          window.Html5QrcodeSupportedFormats.CODE_39,
          window.Html5QrcodeSupportedFormats.UPC_A,
          window.Html5QrcodeSupportedFormats.UPC_E,
          window.Html5QrcodeSupportedFormats.QR_CODE,
          window.Html5QrcodeSupportedFormats.DATA_MATRIX
        ],
        verbose: false
      });

      const config = {
        fps: 15,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const qrboxSize = Math.floor(minEdge * 0.8);
          return { width: qrboxSize, height: qrboxSize };
        },
        aspectRatio: 1.333333
      };

      await universalCameraScannerInstance.start(
        { facingMode: universalCameraFacingMode },
        config,
        (decodedText, decodedResult) => {
          handleUniversalCameraScanSuccess(decodedText, decodedResult);
        },
        () => {
          // Escaneo continuo sin código detectado
        }
      );

      if (feedbackEl) {
        feedbackEl.innerHTML = '<span style="color: #a5d6a7;">🟢 Cámara activa · Apuntá al código de barras o QR</span>';
      }
      return;
    } catch (err) {
      console.warn('Html5Qrcode camera start failed, fallback to native video:', err);
    }
  }

  // 2. Fallback nativo con getUserMedia y BarcodeDetector
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: universalCameraFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    universalCameraStream = stream;
    const viewport = document.getElementById(viewportId);
    if (viewport) {
      viewport.innerHTML = '';
      const video = document.createElement('video');
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.autoplay = true;
      video.muted = true;
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';
      viewport.appendChild(video);
      await video.play();

      if ('BarcodeDetector' in window) {
        const barcodeDetector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e']
        });
        const scanInterval = setInterval(async () => {
          const modal = document.getElementById('modal-universal-camera-scanner');
          if (!modal || modal.style.display === 'none') {
            clearInterval(scanInterval);
            return;
          }
          try {
            const barcodes = await barcodeDetector.detect(video);
            if (barcodes.length > 0) {
              clearInterval(scanInterval);
              handleUniversalCameraScanSuccess(barcodes[0].rawValue);
            }
          } catch {
            // Frame skip
          }
        }, 150);
      }

      if (feedbackEl) {
        feedbackEl.innerHTML = '<span style="color: #a5d6a7;">🟢 Cámara activa</span>';
      }
    }
  } catch (nativeErr) {
    console.error('No se pudo acceder a la cámara:', nativeErr);
    if (feedbackEl) {
      feedbackEl.innerHTML = '<span style="color: #ff8a80;">⚠️ Cámara bloqueada o sin permisos. Podés presionar "📁 Subir foto" para capturar el código.</span>';
    }
  }
}

function handleUniversalCameraScanSuccess(decodedText) {
  if (!decodedText) return;
  const cleanCode = String(decodedText).trim();

  playScannerBeep();
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(80);
  }

  const feedbackEl = document.getElementById('camera-scanner-feedback');
  if (feedbackEl) {
    feedbackEl.innerHTML = `<span style="color: #ffd54f;">✅ ¡Código detectado: <strong>${cleanCode}</strong>!</span>`;
  }

  setTimeout(() => {
    closeUniversalCameraScanner();

    if (universalCameraActiveMode === 'pos') {
      const unifiedInput = document.getElementById('pos-unified-search');
      if (unifiedInput) {
        unifiedInput.value = cleanCode;
        const clearBtn = document.getElementById('pos-search-clear-btn');
        if (clearBtn) clearBtn.style.display = 'block';
      }
      handlePosBarcodeOrDirectSearch(cleanCode)
        .catch(error => console.error('No se completó la lectura del producto:', error));
    } else if (universalCameraActiveMode === 'stock') {
      const stockBarcodeInput = document.getElementById('fastupload-barcode-input');
      if (stockBarcodeInput) {
        stockBarcodeInput.value = cleanCode;
      }
      lookupFastUploadProductWithoutAi('barcode');
    } else if (universalCameraActiveMode === 'wms') {
      const mapSearchInput = document.getElementById('map-search-input');
      if (mapSearchInput) {
        mapSearchInput.value = cleanCode;
      }
      if (typeof searchShelfOnMap === 'function') {
        searchShelfOnMap();
      }
    } else if (universalCameraActiveMode === 'customer') {
      if (typeof handleScannedCustomerData === 'function') {
        handleScannedCustomerData(cleanCode);
      } else if (typeof simulateCustomerQRScan === 'function') {
        simulateCustomerQRScan();
      }
    }
  }, 400);
}

async function closeUniversalCameraScanner() {
  const modal = document.getElementById('modal-universal-camera-scanner');
  if (modal) modal.style.display = 'none';

  if (universalCameraScannerInstance) {
    try {
      await universalCameraScannerInstance.stop();
      universalCameraScannerInstance.clear();
    } catch {
      // Ignorar errores al detener
    }
    universalCameraScannerInstance = null;
  }

  if (universalCameraStream) {
    universalCameraStream.getTracks().forEach(track => track.stop());
    universalCameraStream = null;
  }

  const viewport = document.getElementById('universal-camera-reader-viewport');
  if (viewport) viewport.innerHTML = '';
}

async function switchUniversalCamera() {
  universalCameraFacingMode = (universalCameraFacingMode === 'environment') ? 'user' : 'environment';
  await startUniversalCameraReader();
}

async function toggleUniversalCameraTorch() {
  if (!universalCameraScannerInstance) return;
  universalCameraTorchOn = !universalCameraTorchOn;
  try {
    await universalCameraScannerInstance.applyVideoConstraints({
      advanced: [{ torch: universalCameraTorchOn }]
    });
  } catch (err) {
    console.warn('Flashlight not supported on this device/camera:', err);
  }
}

function triggerNativeMobileCamera() {
  const fileInput = document.getElementById('universal-camera-native-file-input');
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
}

async function handleCameraScannerFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const feedbackEl = document.getElementById('camera-scanner-feedback');
  if (feedbackEl) {
    feedbackEl.innerHTML = '<span style="color: #ffd54f;">⌛ Procesando foto…</span>';
  }

  try {
    // Step 1: Resize the photo to max 1200px to prevent out-of-memory on mobile
    const resizedBlob = await resizeImageForBarcode(file, 1200);

    // Step 2: Try BarcodeDetector (native, available on Android Chrome)
    if ('BarcodeDetector' in window) {
      try {
        const bitmap = await createImageBitmap(resizedBlob);
        const detector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e', 'data_matrix']
        });
        const results = await detector.detect(bitmap);
        bitmap.close();
        if (results && results.length > 0) {
          handleUniversalCameraScanSuccess(results[0].rawValue);
          return;
        }
      } catch (detErr) {
        console.warn('BarcodeDetector on resized image:', detErr);
      }
    }

    // Step 3: Try Html5Qrcode.scanFile with the resized file
    if (window.Html5Qrcode) {
      try {
        const resizedFile = new File([resizedBlob], 'scan.jpg', { type: 'image/jpeg' });
        const html5QrCode = new window.Html5Qrcode('universal-camera-reader-viewport');
        const result = await html5QrCode.scanFile(resizedFile, true);
        html5QrCode.clear();
        handleUniversalCameraScanSuccess(result);
        return;
      } catch (err) {
        console.warn('Html5Qrcode scanFile on resized image:', err);
      }
    }

    if (feedbackEl) {
      feedbackEl.innerHTML = '<span style="color: #ff8a80;">⚠️ No se pudo leer el código. Sacá la foto más cerca del código de barras, con buena luz.</span>';
    }
  } catch (resizeErr) {
    console.error('Image resize failed:', resizeErr);
    if (feedbackEl) {
      feedbackEl.innerHTML = '<span style="color: #ff8a80;">⚠️ Error al procesar la foto. Intentá de nuevo.</span>';
    }
  }
}

/**
 * Resize an image file/blob to fit within maxPx on its longest side.
 * Returns a JPEG Blob suitable for barcode detection.
 */
function resizeImageForBarcode(fileOrBlob, maxPx) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(fileOrBlob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      // Only downscale, never upscale
      if (width > maxPx || height > maxPx) {
        const ratio = Math.min(maxPx / width, maxPx / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas toBlob returned null'));
          }
        },
        'image/jpeg',
        0.85
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for resizing'));
    };

    img.src = url;
  });
}

// Exports
window.calculateExpirationStatus = calculateExpirationStatus;
window.getAllProductsWithExpirations = getAllProductsWithExpirations;
window.renderExpirationsSection = renderExpirationsSection;
window.filterExpirationsByTime = filterExpirationsByTime;
window.applyPromoForExpiringProduct = applyPromoForExpiringProduct;

window.getNearbyStores = getNearbyStores;
window.saveNearbyStore = saveNearbyStore;
window.renderNearbyStoresSection = renderNearbyStoresSection;
window.filterNearbyProductsByStore = filterNearbyProductsByStore;
window.openAddNearbyStoreModal = openAddNearbyStoreModal;
window.closeAddNearbyStoreModal = closeAddNearbyStoreModal;
window.handleSaveNearbyStore = handleSaveNearbyStore;
window.orderNearbyProductViaWa = orderNearbyProductViaWa;

window.getVendorPriceAdjustmentCount = getVendorPriceAdjustmentCount;
window.canVendorAdjustPrice = canVendorAdjustPrice;
window.recordVendorPriceAdjustment = recordVendorPriceAdjustment;

window.getCurrentAccounts = getCurrentAccounts;
window.switchPortfolioSubtab = switchPortfolioSubtab;
window.renderCurrentAccountsUI = renderCurrentAccountsUI;
window.openNewCurrentAccountModal = openNewCurrentAccountModal;
window.closeNewCurrentAccountModal = closeNewCurrentAccountModal;
window.handleCreateCurrentAccount = handleCreateCurrentAccount;
window.openRecordCcPaymentModal = openRecordCcPaymentModal;
window.closeRecordCcPaymentModal = closeRecordCcPaymentModal;
window.handleRecordCcPaymentSubmit = handleRecordCcPaymentSubmit;
window.sendCcWhatsAppReminder = sendCcWhatsAppReminder;
window.sendCcDetailedWhatsApp = sendCcDetailedWhatsApp;
window.sendCcDetailedWhatsAppFromModal = sendCcDetailedWhatsAppFromModal;
window.openCcDetailsModal = openCcDetailsModal;
window.closeCcDetailsModal = closeCcDetailsModal;
window.generateAndPrintCcPdf = generateAndPrintCcPdf;
window.handlePosPaymentMethodChange = handlePosPaymentMethodChange;
window.updatePosCurrentAccountInfo = updatePosCurrentAccountInfo;
window.openPosExpressItemModal = openPosExpressItemModal;
window.closePosExpressItemModal = closePosExpressItemModal;
window.handlePosExpressItemSubmit = handlePosExpressItemSubmit;
window.handlePosMixedSecondaryMethodChange = handlePosMixedSecondaryMethodChange;
window.handlePosMixedPaymentInputChange = handlePosMixedPaymentInputChange;

window.openUniversalCameraScanner = openUniversalCameraScanner;
window.startUniversalCameraReader = startUniversalCameraReader;
window.handleUniversalCameraScanSuccess = handleUniversalCameraScanSuccess;
window.closeUniversalCameraScanner = closeUniversalCameraScanner;
window.switchUniversalCamera = switchUniversalCamera;
window.toggleUniversalCameraTorch = toggleUniversalCameraTorch;
window.handleCameraScannerFile = handleCameraScannerFile;
window.triggerNativeMobileCamera = triggerNativeMobileCamera;
window.playScannerBeep = playScannerBeep;
window.getNearbyStores = getNearbyStores;
window.saveNearbyStore = saveNearbyStore;
window.renderNearbyStoresSection = renderNearbyStoresSection;
window.filterNearbyProductsByStore = filterNearbyProductsByStore;
window.openAddNearbyStoreModal = openAddNearbyStoreModal;
window.closeAddNearbyStoreModal = closeAddNearbyStoreModal;
window.handleSaveNearbyStore = handleSaveNearbyStore;
window.orderNearbyProductViaWa = orderNearbyProductViaWa;

window.getVendorPriceAdjustmentCount = getVendorPriceAdjustmentCount;
window.canVendorAdjustPrice = canVendorAdjustPrice;
window.recordVendorPriceAdjustment = recordVendorPriceAdjustment;

window.getCurrentAccounts = getCurrentAccounts;
window.switchPortfolioSubtab = switchPortfolioSubtab;
window.renderCurrentAccountsUI = renderCurrentAccountsUI;
window.openNewCurrentAccountModal = openNewCurrentAccountModal;
window.closeNewCurrentAccountModal = closeNewCurrentAccountModal;
window.handleCreateCurrentAccount = handleCreateCurrentAccount;
window.openRecordCcPaymentModal = openRecordCcPaymentModal;
window.closeRecordCcPaymentModal = closeRecordCcPaymentModal;
window.handleRecordCcPaymentSubmit = handleRecordCcPaymentSubmit;
window.sendCcWhatsAppReminder = sendCcWhatsAppReminder;
window.sendCcDetailedWhatsApp = sendCcDetailedWhatsApp;
window.sendCcDetailedWhatsAppFromModal = sendCcDetailedWhatsAppFromModal;
window.openCcDetailsModal = openCcDetailsModal;
window.closeCcDetailsModal = closeCcDetailsModal;
window.generateAndPrintCcPdf = generateAndPrintCcPdf;
window.handlePosPaymentMethodChange = handlePosPaymentMethodChange;
window.updatePosCurrentAccountInfo = updatePosCurrentAccountInfo;

/* ==========================================================================
   PRODUCTOS RETIRADOS & AJUSTES DE STOCK (MERMAS, ROTURAS, VENCIMIENTOS)
   ========================================================================== */

function getRetiredProductsHistory() {
  const adjustmentEvents = new Set(['ADJUSTMENT_POSITIVE', 'ADJUSTMENT_NEGATIVE', 'COUNT_ADJUSTMENT']);
  const movements = canonicalWmsMovements.filter(entry => adjustmentEvents.has(entry.event_type || entry.movement_type));
  const reversalTargets = new Set(movements.map(entry => {
    const match = String(entry.notes || '').match(/^Reversión compensatoria del ajuste ([0-9a-f-]{36})$/i);
    return match?.[1] || null;
  }).filter(Boolean));
  const reasonMap = {
    DAMAGE: ['defectuoso', 'Defectuoso / roto'],
    SHRINKAGE: ['vencido', 'Vencido / merma'],
    INTERNAL_USE: ['otro', 'Uso interno'],
    RESTOCK: ['otro', 'Reposición'],
    CORRECTION: ['otro', 'Corrección']
  };

  return movements.map(entry => {
    const quantityDelta = Number(entry.quantity_delta) || 0;
    const reason = String(entry.reason || entry.metadata?.reason || 'CORRECTION').toUpperCase();
    const [reasonKey, reasonLabel] = reasonMap[reason] || ['otro', reason];
    const timestamp = entry.timestamp || new Date(0).toISOString();
    const onHandAfter = Number.isFinite(entry.on_hand_after) ? entry.on_hand_after : null;
    return {
      id: entry.id,
      date: timestamp.slice(0, 10),
      created_at: timestamp,
      product_id: entry.product_id,
      product_code: entry.product_code || '',
      product_name: entry.product_name,
      location_id: entry.location_id,
      type: quantityDelta < 0 ? 'remove' : 'add',
      quantity: Math.abs(quantityDelta),
      previous_stock: onHandAfter === null ? null : onHandAfter - quantityDelta,
      new_stock: onHandAfter,
      reason: reasonKey,
      reason_code: reason,
      reason_label: reasonLabel,
      notes: entry.notes || '',
      vendor_name: entry.user_name || 'Sistema',
      reversed_at: reversalTargets.has(entry.id) ? 'central' : null
    };
  });
}

function saveRetiredProductAdjustment(adjustment) {
  throw new Error(`La escritura local de ajustes fue retirada. Usá adjust_inventory_v2 (${adjustment?.id || 'sin id'}).`);
}

function openStockAdjustmentModal(productIdentifier = null, actionType = 'remove') {
  currentStockAdjustmentAction = actionType === 'add' ? 'add' : 'remove';
  const modal = document.getElementById('modal-stock-adjustment');
  const form = document.getElementById('stock-adjustment-form');
  if (form) form.reset();

  const dateInput = document.getElementById('adjustment-date');
  if (dateInput) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }

  setAdjustmentAction(currentStockAdjustmentAction);

  const reasonSelect = document.getElementById('adjustment-reason');
  if (reasonSelect) {
    reasonSelect.value = currentStockAdjustmentAction === 'add' ? 'otro' : 'vendido';
  }

  const voiceStatus = document.getElementById('adjustment-voice-status');
  if (voiceStatus) voiceStatus.textContent = '';

  const storeLocs = (typeof window !== 'undefined' && Array.isArray(window.storeLocationProducts)) ? window.storeLocationProducts : [];
  const localLocs = typeof readLocalProductLocations === 'function' ? readLocalProductLocations() : [];
  const allProducts = [...(internalCatalogProducts || []), ...storeLocs, ...localLocs, ...(baseProducts || [])];
  
  let found = null;
  let availableDropdownProducts = allProducts;

  if (productIdentifier) {
    const raw = String(productIdentifier).trim().toLowerCase();
    const upper = raw.toUpperCase();

    // 1. Check exact product code, SKU, barcode, id, name or wms_code
    found = allProducts.find(p => 
      (p.barcode && p.barcode.toLowerCase() === raw) ||
      (p.product_code && p.product_code.toLowerCase() === raw) ||
      (p.id && String(p.id).toLowerCase() === raw) ||
      (p.name && p.name.toLowerCase() === raw) ||
      (p.wms_code && p.wms_code.toLowerCase() === raw)
    );

    // 2. If not exact, check if it matches a shelf/level location (e.g. DP-D-P3-E3-N3-D or P3-E3)
    if (!found) {
      const shelfMatch = upper.match(/(E[1-5]|HEL\d*|VIT\d*|PIS\d*|[A-E][-_]?[1-5])/);
      const wallMatch = upper.match(/P([1-4])/);
      const levelMatch = upper.match(/N([1-6])/);
      
      if (shelfMatch) {
        const sCode = shelfMatch[1].replace('-', '');
        const wCode = wallMatch ? `P${wallMatch[1]}` : '';
        const lNum = levelMatch ? Number(levelMatch[1]) : null;

        const locationProducts = allProducts.filter(p => {
          const pShelf = String(p.shelf_code || '').toUpperCase();
          const pWms = String(p.wms_code || '').toUpperCase();
          const pLoc = String(p.location_label || p.location || '').toUpperCase();
          const shelfOk = pShelf.includes(sCode) || pWms.includes(sCode) || pLoc.includes(sCode);
          const levelOk = !lNum || Number(p.shelf_level ?? p.level) === lNum;
          return shelfOk && levelOk;
        });

        if (locationProducts.length === 1) {
          found = locationProducts[0];
        } else if (locationProducts.length > 1) {
          availableDropdownProducts = locationProducts;
        }
      }
    }
  }

  window.currentModalAvailableProducts = availableDropdownProducts;

  const nameEl = document.getElementById('adjustment-product-name');
  const metaEl = document.getElementById('adjustment-product-meta');
  const stockEl = document.getElementById('adjustment-product-current-stock');
  const imgEl = document.getElementById('adjustment-product-img');
  const moreInfoBtn = document.getElementById('adjustment-product-moreinfo-btn');
  const idInput = document.getElementById('adjustment-product-id');
  const codeInput = document.getElementById('adjustment-product-code');
  const dropdownContainer = document.getElementById('adjustment-product-selector-container');
  const dropdown = document.getElementById('adjustment-product-select-dropdown');
  const searchFilter = document.getElementById('adjustment-product-search-filter');
  if (searchFilter) searchFilter.value = '';

  if (found) {
    currentStockAdjustmentProduct = found;
    if (imgEl) {
      const imgSrc = found.image || found.image_url || found.placement_photo_url;
      if (imgSrc) {
        imgEl.src = imgSrc;
        imgEl.style.display = 'block';
      } else {
        imgEl.style.display = 'none';
      }
    }
    if (moreInfoBtn) moreInfoBtn.style.display = 'inline-block';
    if (nameEl) nameEl.textContent = found.name;
    if (metaEl) metaEl.textContent = `SKU: ${found.product_code || found.id} · Ubicación: ${found.location_label || found.location || found.shelf_code || 'Sin asignar'}`;
    const currentStock = Math.max(0, Number(found.stock ?? found.on_hand) || 0);
    if (stockEl) stockEl.textContent = `${currentStock} u.`;
    if (idInput) idInput.value = found.id || '';
    if (codeInput) codeInput.value = found.product_code || found.barcode || '';
    if (dropdownContainer) dropdownContainer.style.display = 'none';

    const qtyInput = document.getElementById('adjustment-quantity');
    if (qtyInput) {
      if (currentStockAdjustmentAction === 'remove') {
        qtyInput.max = currentStock || 1;
        qtyInput.value = currentStock > 0 ? 1 : 0;
      } else {
        qtyInput.removeAttribute('max');
        qtyInput.value = 1;
      }
    }
  } else {
    currentStockAdjustmentProduct = null;
    if (imgEl) imgEl.style.display = 'none';
    if (moreInfoBtn) moreInfoBtn.style.display = 'none';
    if (dropdownContainer) {
      dropdownContainer.style.display = 'block';
      if (dropdown) {
        dropdown.innerHTML = `<option value="">-- Seleccionar producto (${availableDropdownProducts.length} disponibles) --</option>` + 
          availableDropdownProducts.map(p => `<option value="${p.id || p.product_code}">${p.name} (Stock: ${p.stock || 0} u. | ${p.shelf_code || 'Sin ubic.'})</option>`).join('');
      }
    }
    if (nameEl) nameEl.textContent = productIdentifier ? `Asignar producto a: ${productIdentifier}` : 'Seleccioná un producto de la lista';
    if (metaEl) metaEl.textContent = `SKU: - · Ubicación: ${productIdentifier || '-'}`;
    if (stockEl) stockEl.textContent = '0 u.';
    if (idInput) idInput.value = '';
    if (codeInput) codeInput.value = '';
  }

  if (modal) modal.style.display = 'flex';
}

function filterAdjustmentProductDropdown(query) {
  const dropdown = document.getElementById('adjustment-product-select-dropdown');
  const prods = window.currentModalAvailableProducts || internalCatalogProducts || [];
  if (!dropdown || !Array.isArray(prods)) return;

  const q = String(query || '').trim().toLowerCase();
  const filtered = q
    ? prods.filter(p => 
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.product_code && p.product_code.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.shelf_code && p.shelf_code.toLowerCase().includes(q))
      )
    : prods;

  dropdown.innerHTML = `<option value="">-- Seleccionar producto (${filtered.length} encontrados) --</option>` + 
    filtered.map(p => `<option value="${p.id || p.product_code}">${p.name} (Stock: ${p.stock || 0} u. | ${p.shelf_code || 'Sin ubic.'})</option>`).join('');

  if (filtered.length === 1) {
    dropdown.value = filtered[0].id || filtered[0].product_code;
    handleAdjustmentProductDropdownChange(dropdown.value);
  }
}
window.filterAdjustmentProductDropdown = filterAdjustmentProductDropdown;


function handleAdjustmentProductDropdownChange(val) {
  if (!val) return;
  const storeLocs = (typeof window !== 'undefined' && Array.isArray(window.storeLocationProducts)) ? window.storeLocationProducts : [];
  const allProducts = [...(internalCatalogProducts || []), ...storeLocs, ...(baseProducts || [])];
  const found = allProducts.find(p => String(p.id) === String(val) || p.product_code === val);
  if (found) {
    currentStockAdjustmentProduct = found;
    const nameEl = document.getElementById('adjustment-product-name');
    const metaEl = document.getElementById('adjustment-product-meta');
    const stockEl = document.getElementById('adjustment-product-current-stock');
    const imgEl = document.getElementById('adjustment-product-img');
    const moreInfoBtn = document.getElementById('adjustment-product-moreinfo-btn');
    const idInput = document.getElementById('adjustment-product-id');
    const codeInput = document.getElementById('adjustment-product-code');
    if (imgEl) {
      const imgSrc = found.image || found.image_url || found.placement_photo_url;
      if (imgSrc) {
        imgEl.src = imgSrc;
        imgEl.style.display = 'block';
      } else {
        imgEl.style.display = 'none';
      }
    }
    if (moreInfoBtn) moreInfoBtn.style.display = 'inline-block';
    if (nameEl) nameEl.textContent = found.name;
    if (metaEl) metaEl.textContent = `SKU: ${found.product_code || found.id} · Ubicación: ${found.location_label || found.location || found.shelf_code || 'Sin asignar'}`;
    const currentStock = Math.max(0, Number(found.stock ?? found.on_hand) || 0);
    if (stockEl) stockEl.textContent = `${currentStock} u.`;
    if (idInput) idInput.value = found.id || '';
    if (codeInput) codeInput.value = found.product_code || found.barcode || '';

    const qtyInput = document.getElementById('adjustment-quantity');
    if (qtyInput) {
      if (currentStockAdjustmentAction === 'remove') {
        qtyInput.max = currentStock || 1;
        qtyInput.value = currentStock > 0 ? 1 : 0;
      } else {
        qtyInput.removeAttribute('max');
        qtyInput.value = 1;
      }
    }
  }
}

function closeStockAdjustmentModal() {
  const modal = document.getElementById('modal-stock-adjustment');
  if (modal) modal.style.display = 'none';
  currentStockAdjustmentProduct = null;
}

function setAdjustmentAction(action) {
  currentStockAdjustmentAction = action === 'add' ? 'add' : 'remove';
  const typeInput = document.getElementById('adjustment-action-type');
  if (typeInput) typeInput.value = currentStockAdjustmentAction;

  const btnRemove = document.getElementById('adj-btn-remove');
  const btnAdd = document.getElementById('adj-btn-add');
  const title = document.getElementById('adjustment-modal-title');
  const subtitle = document.getElementById('adjustment-modal-subtitle');
  const icon = document.getElementById('adjustment-modal-icon');
  const submitBtn = document.getElementById('adjustment-submit-btn');
  const qtyInput = document.getElementById('adjustment-quantity');

  if (currentStockAdjustmentAction === 'remove') {
    if (btnRemove) {
      btnRemove.style.border = '2px solid #ef5350';
      btnRemove.style.background = 'rgba(239,83,80,0.25)';
      btnRemove.style.color = '#ffffff';
    }
    if (btnAdd) {
      btnAdd.style.border = '2px solid rgba(255,255,255,0.2)';
      btnAdd.style.background = 'rgba(0,0,0,0.2)';
      btnAdd.style.color = 'rgba(255,255,255,0.7)';
    }
    if (title) title.textContent = 'Retirar Producto / Baja de Stock';
    if (subtitle) subtitle.textContent = 'Registrar salida por venta, rotura, vencimiento u otro';
    if (icon) icon.textContent = '🗑️';
    if (submitBtn) {
      submitBtn.textContent = '💾 Confirmar Retiro';
      submitBtn.style.background = 'linear-gradient(135deg, #c62828 0%, #8e0000 100%)';
      submitBtn.style.borderColor = '#ef5350';
      submitBtn.style.color = '#ffffff';
    }
    if (qtyInput && currentStockAdjustmentProduct) {
      const currStock = Math.max(0, Number(currentStockAdjustmentProduct.stock ?? currentStockAdjustmentProduct.on_hand) || 0);
      qtyInput.max = currStock || 1;
      qtyInput.value = currStock > 0 ? 1 : 0;
    }
  } else {
    if (btnAdd) {
      btnAdd.style.border = '2px solid #81c784';
      btnAdd.style.background = 'rgba(76,175,80,0.25)';
      btnAdd.style.color = '#ffffff';
    }
    if (btnRemove) {
      btnRemove.style.border = '2px solid rgba(255,255,255,0.2)';
      btnRemove.style.background = 'rgba(0,0,0,0.2)';
      btnRemove.style.color = 'rgba(255,255,255,0.7)';
    }
    if (title) title.textContent = 'Agregar Más Stock al Inventario';
    if (subtitle) subtitle.textContent = 'Ingresar unidades por reposición, conteo o devolución';
    if (icon) icon.textContent = '📥';
    if (submitBtn) {
      submitBtn.textContent = '💾 Confirmar Ingreso de Stock';
      submitBtn.style.background = 'linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%)';
      submitBtn.style.borderColor = '#81c784';
      submitBtn.style.color = '#ffffff';
    }
    if (qtyInput) {
      qtyInput.removeAttribute('max');
      qtyInput.value = 1;
    }
  }
}

function adjustAdjustmentQty(delta) {
  const input = document.getElementById('adjustment-quantity');
  if (!input) return;
  const current = Math.max(1, parseInt(input.value, 10) || 1);
  const actionType = document.getElementById('adjustment-action-type')?.value || currentStockAdjustmentAction;

  let next = current + delta;
  if (actionType === 'remove' && currentStockAdjustmentProduct) {
    const maxStock = Math.max(0, Number(currentStockAdjustmentProduct.stock ?? currentStockAdjustmentProduct.on_hand) || 0);
    if (maxStock > 0) {
      next = Math.min(maxStock, Math.max(1, next));
    } else {
      next = 0;
    }
  } else {
    next = Math.max(1, next);
  }
  input.value = next;
}

function handleAdjustmentReasonChange() {
  const reasonSelect = document.getElementById('adjustment-reason');
  const notesTextarea = document.getElementById('adjustment-notes');
  if (!reasonSelect || !notesTextarea) return;
  const val = reasonSelect.value;
  if (val === 'otro' && !notesTextarea.value.trim()) {
    notesTextarea.placeholder = 'Especificá el motivo aquí (ej: donación, muestra comercial, consumo del local)...';
    notesTextarea.focus();
  }
}

function startStockAdjustmentDictation() {
  const statusEl = document.getElementById('adjustment-voice-status');
  const voiceBtn = document.getElementById('adjustment-voice-btn');
  const textarea = document.getElementById('adjustment-notes');

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('Tu navegador no tiene activado el dictado por voz. Podés escribir en el cuadro de texto.');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'es-AR';
  recognition.interimResults = false;

  if (statusEl) statusEl.textContent = '🎙️ Escuchando... Hablá ahora con claridad.';
  if (voiceBtn) {
    voiceBtn.style.background = '#ef5350';
    voiceBtn.style.color = '#fff';
  }

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    if (textarea) {
      const existing = textarea.value.trim();
      textarea.value = existing ? `${existing}. ${transcript}` : transcript;
    }
    if (statusEl) statusEl.textContent = `✅ Dictado: "${transcript}"`;
  };

  recognition.onerror = () => {
    if (statusEl) statusEl.textContent = '⚠️ No pudimos capturar el audio. Intentá de nuevo.';
  };

  recognition.onend = () => {
    if (voiceBtn) {
      voiceBtn.style.background = 'rgba(194,162,70,0.2)';
      voiceBtn.style.color = '#ffd54f';
    }
    setTimeout(() => {
      if (statusEl && statusEl.textContent.includes('Escuchando')) {
        statusEl.textContent = '';
      }
    }, 4000);
  };

  recognition.start();
}

async function handleStockAdjustmentSubmit(event) {
  event.preventDefault();
  const actionType = document.getElementById('adjustment-action-type')?.value || 'remove';
  const qty = Math.max(1, parseInt(document.getElementById('adjustment-quantity')?.value, 10) || 1);
  const reason = document.getElementById('adjustment-reason')?.value || 'otro';
  const notes = document.getElementById('adjustment-notes')?.value.trim() || '';

  const prodId = document.getElementById('adjustment-product-id')?.value;
  const prodCode = document.getElementById('adjustment-product-code')?.value;

  const storeLocs = (typeof window !== 'undefined' && Array.isArray(window.storeLocationProducts)) ? window.storeLocationProducts : [];
  const localLocs = typeof readLocalProductLocations === 'function' ? readLocalProductLocations() : [];
  const allProducts = [...(internalCatalogProducts || []), ...storeLocs, ...localLocs, ...(baseProducts || [])];
  const product = currentStockAdjustmentProduct || allProducts.find(p => String(p.id) === String(prodId) || p.product_code === prodCode);

  if (!product) {
    showToast('Seleccioná un producto válido antes de guardar.');
    return;
  }

  const authContext = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  if (!window.OperationalApi || !supabaseClient || !authContext?.isVerified) {
    showToast('Iniciá sesión para registrar el ajuste en el inventario central.');
    return;
  }
  if (product.source !== 'catalog_products') {
    showToast('Este producto todavía pertenece al catálogo heredado. Migrálo antes de ajustar stock.');
    return;
  }
  if (!product.location_id) {
    showToast('El producto no tiene una ubicación central asignada. Ubicalo antes de ajustar stock.');
    return;
  }

  const prevStock = Math.max(0, Number(product.stock ?? product.on_hand) || 0);

  // Validación estricta: No permitir retirar más unidades que las disponibles ni cuando el stock es 0
  if (actionType === 'remove') {
    if (prevStock <= 0) {
      showToast(`⚠️ "${product.name}" no tiene unidades en stock para retirar.`);
      return;
    }
    if (qty > prevStock) {
      showToast(`⚠️ No podés retirar ${qty} u. porque solo hay ${prevStock} u. disponibles.`);
      return;
    }
  }

  if (reason === 'vendido') {
    showToast('Las salidas por venta sólo se registran desde el POS para vincular stock, pago, vendedor y caja.');
    return;
  }
  if (reason === 'otro' && !notes) {
    showToast('Describí el motivo del ajuste para mantener una auditoría útil.');
    return;
  }

  const reasonMap = {
    defectuoso: 'DAMAGE',
    vencido: 'SHRINKAGE',
    otro: actionType === 'add' ? 'RESTOCK' : 'INTERNAL_USE'
  };
  const quantityDelta = actionType === 'remove' ? -qty : qty;
  const submitButton = event.submitter || event.currentTarget?.querySelector('[type="submit"]');
  if (submitButton) submitButton.disabled = true;

  try {
    const result = await window.OperationalApi.adjustInventory({
      supabaseClient,
      authContext,
      productId: product.id,
      locationId: product.location_id,
      quantityDelta,
      reason: reasonMap[reason] || 'INTERNAL_USE',
      notes,
      idempotencyKey: `inventory-adjust:${authContext.userId}:${globalThis.crypto?.randomUUID?.() || Date.now()}`
    });
    closeStockAdjustmentModal();
    await Promise.all([loadInternalCatalog(), loadWmsInventoryData(true)]);
    storeMapDataLoaded = false;
    if (typeof loadStoreMapData === 'function') await loadStoreMapData(true);
    if (typeof rerenderStoreMap === 'function') rerenderStoreMap();
    const newStock = Number(result?.on_hand);
    const suffix = Number.isFinite(newStock) ? ` Nuevo stock físico: ${newStock} u.` : '';
    showToast(quantityDelta < 0
      ? `Retiro central confirmado: ${quantityDelta} u. de "${product.name}".${suffix}`
      : `Ingreso central confirmado: +${quantityDelta} u. de "${product.name}".${suffix}`);
  } catch (error) {
    console.error('No se confirmó el ajuste central de inventario:', error);
    alert(`El stock no fue modificado.\n\n${error.message || 'Error desconocido'}`);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function renderRetiredProductsUI() {
  const tbody = document.getElementById('retired-products-table-body');
  const history = getRetiredProductsHistory();
  const authContext = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  const canReverse = ['ADMIN', 'SUPERVISOR', 'SUPERADMIN'].includes(authContext?.role);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

  let totalRemoved = 0;
  let damagedUnits = 0;
  let expiredUnits = 0;
  let positiveUnits = 0;

  history.forEach(item => {
    const itemDate = new Date(item.date + 'T00:00:00');
    if (item.type === 'remove') {
      if (itemDate >= thirtyDaysAgo) totalRemoved += item.quantity;
      if (item.reason === 'defectuoso') damagedUnits += item.quantity;
      else if (item.reason === 'vencido') expiredUnits += item.quantity;
    } else if (itemDate >= thirtyDaysAgo) positiveUnits += item.quantity;
  });

  const kpiTotal = document.getElementById('retired-kpi-total-units');
  const kpiDamaged = document.getElementById('retired-kpi-damaged-units');
  const kpiExpired = document.getElementById('retired-kpi-expired-units');
  const kpiPositive = document.getElementById('retired-kpi-positive-units');

  if (kpiTotal) kpiTotal.textContent = `${totalRemoved} u.`;
  if (kpiDamaged) kpiDamaged.textContent = `${damagedUnits} u.`;
  if (kpiExpired) kpiExpired.textContent = `${expiredUnits} u.`;
  if (kpiPositive) kpiPositive.textContent = `${positiveUnits} u.`;

  if (!tbody) return;

  const filtered = history.filter(item => {
    const matchesReason = (retiredProductsFilterReason === 'all') || (item.reason === retiredProductsFilterReason);
    const q = retiredProductsSearchQuery.toLowerCase();
    const matchesQuery = !q || 
      (item.product_name && item.product_name.toLowerCase().includes(q)) ||
      (item.product_code && item.product_code.toLowerCase().includes(q)) ||
      (item.barcode && item.barcode.toLowerCase().includes(q)) ||
      (item.notes && item.notes.toLowerCase().includes(q)) ||
      (item.vendor_name && item.vendor_name.toLowerCase().includes(q));
    return matchesReason && matchesQuery;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 32px 10px; color: var(--color-text-muted);">
          <span style="font-size: 2rem; display: block; margin-bottom: 8px;">📦</span>
          <strong>No hay registros de productos retirados o ajustes que coincidan.</strong><br>
          <small>Podés registrar un nuevo retiro o ajuste tocando en "+ Nuevo Retiro / Ajuste".</small>
        </td>
      </tr>
    `;
    return;
  }

  const reasonBadgeStyles = {
    'vendido': 'background: rgba(76,175,80,0.2); color: #81c784; border: 1px solid #81c784;',
    'defectuoso': 'background: rgba(239,83,80,0.2); color: #ef5350; border: 1px solid #ef5350;',
    'vencido': 'background: rgba(255,193,7,0.2); color: #ffd54f; border: 1px solid #ffd54f;',
    'otro': 'background: rgba(158,158,158,0.2); color: #e0e0e0; border: 1px solid #9e9e9e;'
  };

  const escapeFn = typeof escapeMapHtml === 'function' ? escapeMapHtml : (v => String(v || ''));

  tbody.innerHTML = filtered.map(item => {
    const isRemove = item.type === 'remove';
    const stockTrace = item.previous_stock === null || item.new_stock === null
      ? ''
      : ` <small style="color: var(--color-text-muted);">(${item.previous_stock} → ${item.new_stock})</small>`;
    const movementBadge = isRemove
      ? `<span style="color: #ef5350; font-weight: 800;">-${item.quantity} u.</span>${stockTrace}`
      : `<span style="color: #81c784; font-weight: 800;">+${item.quantity} u.</span>${stockTrace}`;

    const badgeStyle = reasonBadgeStyles[item.reason] || reasonBadgeStyles['otro'];

    return `
      <tr style="border-bottom: 1px solid var(--color-border-subtle);">
        <td style="padding: 12px 10px; white-space: nowrap;">
          <strong style="color: var(--color-text-main);">${escapeFn(item.date)}</strong>
        </td>
        <td style="padding: 12px 10px;">
          <strong style="display: block; color: var(--color-text-main);">${escapeFn(item.product_name)}</strong>
          <small style="color: var(--color-text-muted); font-family: monospace;">SKU: ${escapeFn(item.product_code || item.barcode || '-')}</small>
        </td>
        <td style="padding: 12px 10px;">
          ${movementBadge}
        </td>
        <td style="padding: 12px 10px;">
          <span style="padding: 3px 8px; border-radius: 8px; font-size: 0.76rem; font-weight: 700; display: inline-block; ${badgeStyle}">
            ${escapeFn(item.reason_label || item.reason)}
          </span>
        </td>
        <td style="padding: 12px 10px; max-width: 250px;">
          ${item.notes ? `<span style="font-size: 0.85rem; color: var(--color-text-main);">${escapeFn(item.notes)}</span>` : '<span style="color: var(--color-text-muted); font-size: 0.8rem;">-</span>'}
        </td>
        <td style="padding: 12px 10px; white-space: nowrap; color: var(--color-text-muted); font-size: 0.82rem;">
          🧑‍💼 ${escapeFn(item.vendor_name || 'Vendedor')}
        </td>
        <td style="padding: 12px 10px; text-align: right; white-space: nowrap;">
          <button type="button" onclick="revertRetiredProductAdjustment('${item.id}')" ${item.reversed_at || !canReverse ? 'disabled' : ''} style="padding: 4px 8px; border-radius: 6px; background: rgba(255,255,255,0.08); border: 1px solid var(--color-border-subtle); color: var(--color-text-muted); font-size: 0.76rem; cursor: ${item.reversed_at || !canReverse ? 'not-allowed' : 'pointer'};" title="${item.reversed_at ? 'Reversión compensatoria ya registrada' : (!canReverse ? 'Requiere supervisor' : 'Registrar una reversión compensatoria auditada')}">
            ${item.reversed_at ? '✓ Revertido' : (canReverse ? '↩ Revertir' : 'Supervisor')}
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterRetiredProducts(reason) {
  retiredProductsFilterReason = reason;
  const chips = document.querySelectorAll('#retired-filter-chips .b2b-filter-chip');
  chips.forEach(chip => chip.classList.remove('active'));
  const activeBtn = document.getElementById(`ret-filter-${reason}`);
  if (activeBtn) activeBtn.classList.add('active');
  renderRetiredProductsUI();
}

function handleRetiredSearchInput(val) {
  retiredProductsSearchQuery = String(val || '').trim();
  renderRetiredProductsUI();
}

async function revertRetiredProductAdjustment(adjustmentId) {
  if (!confirm('¿Deseás deshacer este ajuste de stock y restaurar las unidades?')) return;
  const item = getRetiredProductsHistory().find(entry => entry.id === adjustmentId);
  if (!item) return;
  if (item.reversed_at) {
    showToast('Este ajuste ya posee una reversión registrada.');
    return;
  }
  const product = (internalCatalogProducts || []).find(p =>
    String(p.id) === String(item.product_id) || p.product_code === item.product_code
  );
  const locationId = item.location_id || product?.location_id;
  const authContext = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  if (!['ADMIN', 'SUPERVISOR', 'SUPERADMIN'].includes(authContext?.role)) {
    showToast('La reversión compensatoria requiere aprobación de un supervisor autenticado.');
    return;
  }
  if (!window.OperationalApi || !supabaseClient || !authContext?.isVerified || !product?.id || !locationId) {
    showToast('No se puede revertir: falta la operación o ubicación central vinculada.');
    return;
  }

  const inverseDelta = item.type === 'remove' ? Number(item.quantity) : -Number(item.quantity);
  try {
    await window.OperationalApi.adjustInventory({
      supabaseClient,
      authContext,
      productId: product.id,
      locationId,
      quantityDelta: inverseDelta,
      reason: 'CORRECTION',
      notes: `Reversión compensatoria del ajuste ${item.id}`,
      idempotencyKey: `inventory-reversal:${item.id}`
    });
    await Promise.all([loadInternalCatalog(), loadWmsInventoryData(true)]);
    showToast('↩ Reversión compensatoria confirmada y auditada.');
    renderRetiredProductsUI();
  } catch (error) {
    console.error('No se pudo confirmar la reversión de inventario:', error);
    alert(`El ajuste original se conserva y no fue revertido.\n\n${error.message || 'Error desconocido'}`);
  }
}

function exportRetiredProductsCsv() {
  const history = getRetiredProductsHistory();
  if (!history.length) {
    showToast('No hay registros para exportar.');
    return;
  }
  const headers = ['ID', 'Fecha', 'Producto', 'SKU', 'Codigo_Barra', 'Tipo', 'Cantidad', 'Stock_Anterior', 'Stock_Nuevo', 'Motivo', 'Aclaracion', 'Vendedor'];
  const rows = history.map(h => [
    h.id,
    h.date,
    `"${(h.product_name || '').replace(/"/g, '""')}"`,
    h.product_code || '',
    h.barcode || '',
    h.type === 'remove' ? 'RETIRO' : 'INGRESO',
    h.quantity,
    h.previous_stock,
    h.new_stock,
    `"${(h.reason_label || h.reason || '').replace(/"/g, '""')}"`,
    `"${(h.notes || '').replace(/"/g, '""')}"`,
    h.vendor_name || ''
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `boeweb_productos_retirados_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('📥 Reporte CSV descargado con éxito.');
}

function openProductFullInfoModal(productIdentifier) {
  const modal = document.getElementById('modal-product-full-info');
  const body = document.getElementById('pinfo-modal-body');
  const footer = document.getElementById('pinfo-modal-footer');
  if (!modal || !body || !footer) return;

  const storeLocs = (typeof window !== 'undefined' && Array.isArray(window.storeLocationProducts)) ? window.storeLocationProducts : [];
  const allProducts = [...(internalCatalogProducts || []), ...storeLocs, ...(baseProducts || [])];
  const raw = String(productIdentifier || '').trim().toLowerCase();
  const found = allProducts.find(p => 
    (p.id && String(p.id).toLowerCase() === raw) ||
    (p.product_code && p.product_code.toLowerCase() === raw) ||
    (p.barcode && p.barcode.toLowerCase() === raw) ||
    (p.name && p.name.toLowerCase().includes(raw)) ||
    (p.wms_code && p.wms_code.toLowerCase() === raw)
  );

  if (!found) {
    showToast('No se encontraron detalles completos para este producto.');
    return;
  }

  const escapeFn = typeof escapeMapHtml === 'function' ? escapeMapHtml : (v => String(v || ''));
  const currentStock = Math.max(0, Number(found.stock ?? found.on_hand) || 0);
  const priceFormatted = typeof formatCurrency === 'function' 
    ? formatCurrency(Number(found.price || found.sale_price) || 0) 
    : `$${Number(found.price || found.sale_price || 0).toLocaleString('es-AR')}`;

  const imageSrc = found.image || found.image_url || found.placement_photo_url || '';

  body.innerHTML = `
    <div style="display: flex; gap: 16px; align-items: center; background: rgba(0,0,0,0.3); padding: 14px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.12);">
      ${imageSrc ? `
        <img src="${escapeFn(imageSrc)}" alt="${escapeFn(found.name)}" style="width: 90px; height: 90px; border-radius: 12px; border: 2px solid #c2a246; object-fit: cover; background: #fff; flex-shrink: 0;">
      ` : `
        <div style="width: 90px; height: 90px; border-radius: 12px; border: 2px solid #c2a246; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 2.5rem; flex-shrink: 0;">📦</div>
      `}
      <div style="min-width: 0; flex: 1;">
        <span style="background: rgba(194,162,70,0.25); color: #c2a246; border: 1px solid #c2a246; padding: 2px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase;">
          ${escapeFn(found.category || 'Catálogo Interno')}
        </span>
        <h3 style="margin: 6px 0 2px 0; font-size: 1.15rem; color: #ffffff; font-weight: 800; line-height: 1.3;">
          ${escapeFn(found.name)}
        </h3>
        ${found.brand ? `<small style="color: #ffd54f; display: block; font-weight: 700; font-size: 0.8rem;">Marca: ${escapeFn(found.brand)}</small>` : ''}
        ${found.presentation ? `<small style="color: rgba(255,255,255,0.7); display: block; font-size: 0.78rem;">Presentación: ${escapeFn(found.presentation)}</small>` : ''}
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
      <div style="background: rgba(0,0,0,0.25); padding: 10px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1);">
        <small style="color: rgba(255,255,255,0.6); display: block; font-size: 0.72rem; text-transform: uppercase;">Precio de Venta</small>
        <strong style="color: #81c784; font-size: 1.25rem; font-weight: 900;">${priceFormatted}</strong>
      </div>
      <div style="background: rgba(0,0,0,0.25); padding: 10px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1);">
        <small style="color: rgba(255,255,255,0.6); display: block; font-size: 0.72rem; text-transform: uppercase;">Stock en Tienda</small>
        <strong style="color: #ffd54f; font-size: 1.25rem; font-weight: 900;">${currentStock} u.</strong>
      </div>
    </div>

    <div style="background: rgba(0,0,0,0.25); padding: 12px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); font-size: 0.86rem; line-height: 1.6;">
      <div style="margin-bottom: 6px;">
        🏷️ <strong>Código / SKU:</strong> <span style="font-family: monospace; color: #c2a246;">${escapeFn(found.product_code || found.id || '-')}</span>
      </div>
      ${found.barcode ? `
        <div style="margin-bottom: 6px;">
          📊 <strong>Código de Barras:</strong> <span style="font-family: monospace; color: #a5d6a7;">${escapeFn(found.barcode)}</span>
        </div>
      ` : ''}
      <div style="margin-bottom: 6px;">
        📍 <strong>Ubicación WMS:</strong> <span style="color: #ffffff; font-weight: 700;">${escapeFn(found.location_label || found.location || found.shelf_code || found.wms_code || 'Sin asignar')}</span>
      </div>
    </div>

    ${found.description ? `
      <div style="background: rgba(0,0,0,0.25); padding: 12px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1);">
        <strong style="color: #c2a246; font-size: 0.82rem; text-transform: uppercase; display: block; margin-bottom: 4px;">📝 Descripción / Especificaciones</strong>
        <p style="margin: 0; font-size: 0.86rem; color: rgba(255,255,255,0.85); line-height: 1.5; white-space: pre-line;">${escapeFn(found.description)}</p>
      </div>
    ` : ''}
  `;

  footer.innerHTML = `
    <button type="button" onclick="closeProductFullInfoModal(); openStockAdjustmentModal('${escapeFn(found.product_code || found.id)}', 'add')" style="flex: 1; min-height: 42px; padding: 8px 10px; border-radius: 10px; font-weight: 800; font-size: 0.85rem; background: rgba(76,175,80,0.25); border: 1.5px solid #81c784; color: #a5d6a7; cursor: pointer;">
      ➕ Agregar Stock
    </button>
    <button type="button" onclick="closeProductFullInfoModal(); openStockAdjustmentModal('${escapeFn(found.product_code || found.id)}', 'remove')" style="flex: 1; min-height: 42px; padding: 8px 10px; border-radius: 10px; font-weight: 800; font-size: 0.85rem; background: rgba(239,83,80,0.25); border: 1.5px solid #ef5350; color: #ef9a9a; cursor: pointer;">
      ➖ Retirar / Quitar
    </button>
    <button type="button" onclick="closeProductFullInfoModal()" style="min-height: 42px; padding: 8px 16px; border-radius: 10px; font-size: 0.85rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; cursor: pointer;">
      Cerrar
    </button>
  `;

  modal.style.display = 'flex';
}

function closeProductFullInfoModal() {
  const modal = document.getElementById('modal-product-full-info');
  if (modal) modal.style.display = 'none';
}

window.openProductFullInfoModal = openProductFullInfoModal;
window.closeProductFullInfoModal = closeProductFullInfoModal;

window.openVendorPasswordModal = openVendorPasswordModal;
window.closeVendorPasswordModal = closeVendorPasswordModal;
window.handleVendorChangePassword = handleVendorChangePassword;

window.decodeHumanWmsLocation = decodeHumanWmsLocation;
window.renderStoreMapLocationCard = renderStoreMapLocationCard;
window.closeStoreMapLocationCard = closeStoreMapLocationCard;

window.getRetiredProductsHistory = getRetiredProductsHistory;
window.openStockAdjustmentModal = openStockAdjustmentModal;
window.handleAdjustmentProductDropdownChange = handleAdjustmentProductDropdownChange;
window.closeStockAdjustmentModal = closeStockAdjustmentModal;
window.setAdjustmentAction = setAdjustmentAction;
window.adjustAdjustmentQty = adjustAdjustmentQty;
window.handleAdjustmentReasonChange = handleAdjustmentReasonChange;
window.startStockAdjustmentDictation = startStockAdjustmentDictation;
window.handleStockAdjustmentSubmit = handleStockAdjustmentSubmit;
window.renderRetiredProductsUI = renderRetiredProductsUI;
window.filterRetiredProducts = filterRetiredProducts;
window.handleRetiredSearchInput = handleRetiredSearchInput;
window.revertRetiredProductAdjustment = revertRetiredProductAdjustment;
window.exportRetiredProductsCsv = exportRetiredProductsCsv;
