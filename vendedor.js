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

// Expirations, Nearby Stores & CC state (hoisted to avoid TDZ)
let currentExpirationsFilter = 'all';
let activeNearbyStoreFilter = 'all';
let currentSelectedCcId = null;

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
  'candyclub': 'Candy Club'
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
      if (window.SaasAuth?.hydrateFromSupabase) {
        try {
          await window.SaasAuth.hydrateFromSupabase(supabaseClient);
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
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchQuery = e.target.value.trim();
    searchTimeout = setTimeout(() => {
      fetchB2BProducts(true); // Reset search and clear grid
    }, 400);
  });

  // Category Filtering
  categoryButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      categoryButtons.forEach(b => b.classList.remove('active'));
      
      const targetBtn = e.target.closest('.b2b-category-btn');
      targetBtn.classList.add('active');
      currentCategory = targetBtn.dataset.category;
      
      fetchB2BProducts(true); // Reset category and clear grid

      // Close sidebar filter drawer on mobile after selecting category
      if (window.innerWidth <= 992) {
        closeFilters();
      }
    });
  });

  // Load More Button
  loadMoreBtn.addEventListener('click', () => {
    currentPage++;
    fetchB2BProducts(false); // Fetch next page, do not clear grid
  });

  // Cart Drawer open/close
  cartTriggerBtn.addEventListener('click', openCart);
  cartCloseBtn.addEventListener('click', closeCart);
  cartOverlay.addEventListener('click', closeCart);

  // Checkout submit
  checkoutForm.addEventListener('submit', handleCheckout);

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
      if (sidebarCard.classList.contains('open')) {
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
      if (cartDrawer.classList.contains('open')) {
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
  noResults.style.display = 'none';
  loadMoreContainer.style.display = 'none';
  
  if (clearGrid) {
    productGrid.innerHTML = '';
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

    renderProductsList(fetchedProducts, clearGrid);
    renderVendorHomeUI();

    // Show/hide Load More button
    if ((data || []).length === itemsPerPage) {
      loadMoreContainer.style.display = 'block';
    } else {
      loadMoreContainer.style.display = 'none';
    }

    if (baseProducts.length === 0) {
      noResults.style.display = 'block';
    }
  } catch (err) {
    console.error('Error fetching B2B catalog:', err.message);
    productGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; color: #721c24; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px;">
        <p style="font-weight: bold; margin-bottom: 8px;">Error al conectar con la base de datos de Supabase</p>
        <p style="font-size: 0.9rem; margin-bottom: 12px;">${err.message || err}</p>
        <button onclick="window.fetchB2BProducts && window.fetchB2BProducts(true)" style="padding: 8px 16px; background: #721c24; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">Reintentar Carga</button>
      </div>
    `;
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
  cartCountEl.textContent = count;
  if (mobileCartCountEl) {
    mobileCartCountEl.textContent = count;
  }
  renderVendorHomeUI();
}

// --- CART RENDER & EDITING ---
function renderCart() {
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
    cartTotalEl.textContent = '$0';
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
  cartTotalEl.textContent = `$${formatPrice(overallTotal)}`;
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
  loader.style.display = show ? 'flex' : 'none';
}

function openCart() {
  cartDrawer.classList.add('open');
  cartOverlay.classList.add('open');
  updateMobileNavActive(mobileCartBtn);
}

function closeCart() {
  cartDrawer.classList.remove('open');
  cartOverlay.classList.remove('open');
  updateMobileNavActive(mobileHomeBtn);
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

const AUTHORIZED_VENDEDORES = [
  { name: 'Raul', pass: 'raul123', refCode: 'raul123', phone: '5493510001111', role: 'Especialista en Sustratos & Nutrición Orgánica', avatar: 'assets/logo.jpg' },
  { name: 'Nacho Mina', pass: 'nacho mina123', altPass: 'nachomina123', refCode: 'nachomina123', phone: '5493510002222', role: 'Asesor Técnico en Cultivo Indoor & Iluminación LED', avatar: 'assets/logo.jpg' },
  { name: 'Alexis', pass: 'alexis123', refCode: 'alexis123', phone: '5493510003333', role: 'Especialista en Riego Automático & Hidroponía', avatar: 'assets/logo.jpg' },
  { name: 'Gino', pass: 'gino123', refCode: 'gino123', phone: '5493510004444', role: 'Asesor en Extracciones & Parafernalia Premium', avatar: 'assets/logo.jpg' },
  { name: 'Rodrigo', pass: 'rodrigo123', refCode: 'rodrigo123', phone: '5493510005555', role: 'Especialista en Control de Plagas & Fitopatología', avatar: 'assets/logo.jpg' },
  { name: 'Felipe', pass: 'felipe123', refCode: 'felipe123', phone: '5493510006666', role: 'Asesor de Membresías & Trámites REPROCANN', avatar: 'assets/logo.jpg' },
  { name: 'Mariano', pass: 'mariano123', refCode: 'mariano123', phone: '5493510007777', role: 'Especialista en Semillas & Genética Cannabis', avatar: 'assets/logo.jpg' }
];

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
  const activeVendor = sessionStorage.getItem('boeweb_vendor_name') || localStorage.getItem('boeweb_vendor_name');
  const loginScreen = document.getElementById('vendedor-login-screen');
  const portalApp = document.getElementById('vendedor-portal-app');
  const vendorNameHeader = document.getElementById('active-vendor-display-name');
  const vendorCheckoutInput = document.getElementById('b2b-vendedor-name');
  const sidebarName = document.getElementById('vendor-sidebar-name');
  const sidebarAvatar = document.getElementById('vendor-sidebar-avatar');

  if (activeVendor) {
    if (loginScreen) loginScreen.style.display = 'none';
    if (portalApp) portalApp.style.display = 'block';
    if (vendorNameHeader) vendorNameHeader.innerHTML = `🧑‍💼 <span style="font-weight: 800; color: #fff;">${activeVendor}</span>`;
    if (vendorCheckoutInput) vendorCheckoutInput.value = activeVendor;
    if (sidebarName) sidebarName.textContent = activeVendor;
    if (sidebarAvatar) sidebarAvatar.textContent = activeVendor.charAt(0).toUpperCase();
    const requestedProductCode = new URLSearchParams(window.location.search).get('product');
    if (requestedProductCode) {
      handleProductLocationDeepLink();
    } else {
      switchVendorTab('home');
    }
  } else {
    if (loginScreen) loginScreen.style.display = 'flex';
    if (portalApp) portalApp.style.display = 'none';
  }
}

function handleVendorLogin(e) {
  if (e) e.preventDefault();
  const selectEl = document.getElementById('auth-vendor-select');
  const passEl = document.getElementById('auth-vendor-password');

  if (!selectEl || !passEl) return;

  const selectedName = selectEl.value;
  const typedPass = passEl.value.trim().toLowerCase();

  if (!selectedName) {
    setVendorLoginMessage('Seleccioná tu identidad para continuar.', 'info');
    selectEl.focus();
    return;
  }

  if (!typedPass) {
    setVendorLoginMessage('Ingresá tu contraseña para continuar.', 'info');
    passEl.focus();
    return;
  }

  const vendorData = AUTHORIZED_VENDEDORES.find(v => v.name.toLowerCase() === selectedName.toLowerCase());

  if (vendorData) {
    const customPass = localStorage.getItem('boeweb_vendor_password_' + vendorData.name.toLowerCase());
    const isPassValid = (customPass && typedPass === customPass.toLowerCase()) ||
                        (typedPass === vendorData.pass.toLowerCase()) || 
                        (vendorData.altPass && typedPass === vendorData.altPass.toLowerCase());

    if (isPassValid) {
      sessionStorage.setItem('boeweb_vendor_name', vendorData.name);
      localStorage.setItem('boeweb_vendor_name', vendorData.name);
      checkVendorAuth();
      showToast(`👋 ¡Bienvenido/a, ${vendorData.name}! Sesión de vendedor activa.`);
      passEl.value = '';
      setVendorLoginMessage('');
    } else {
      setVendorLoginMessage('Los datos de acceso no coinciden. Revisá la contraseña e intentá nuevamente.');
      passEl.select();
    }
  } else {
    setVendorLoginMessage('No pudimos validar esta identidad. Contactá al responsable del local.');
  }
}

function openVendorPasswordModal() {
  const activeVendor = sessionStorage.getItem('boeweb_vendor_name') || localStorage.getItem('boeweb_vendor_name');
  if (!activeVendor) {
    showToast('⚠️ Debés iniciar sesión como vendedor primero.');
    return;
  }
  const modal = document.getElementById('modal-vendor-change-password');
  const nameEl = document.getElementById('change-password-vendor-name');
  const oldPass = document.getElementById('vendor-old-password');
  const newPass = document.getElementById('vendor-new-password');
  const confirmPass = document.getElementById('vendor-confirm-password');
  const msgEl = document.getElementById('vendor-change-password-msg');

  if (nameEl) nameEl.textContent = activeVendor;
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

function handleVendorChangePassword(e) {
  if (e) e.preventDefault();
  const activeVendor = sessionStorage.getItem('boeweb_vendor_name') || localStorage.getItem('boeweb_vendor_name');
  if (!activeVendor) return;

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

  const vendorData = AUTHORIZED_VENDEDORES.find(v => v.name.toLowerCase() === activeVendor.toLowerCase());
  if (!vendorData) {
    showModalMsg('Vendedor no encontrado en el sistema.');
    return;
  }

  const customStored = localStorage.getItem('boeweb_vendor_password_' + activeVendor.toLowerCase());
  const validCurrent = customStored || vendorData.pass;

  if (oldPass.toLowerCase() !== validCurrent.toLowerCase() && (!vendorData.altPass || oldPass.toLowerCase() !== vendorData.altPass.toLowerCase())) {
    showModalMsg('La contraseña actual ingresada es incorrecta.');
    oldPassEl?.select();
    return;
  }

  if (newPass.length < 4) {
    showModalMsg('La nueva contraseña debe tener al menos 4 caracteres.');
    newPassEl?.focus();
    return;
  }

  if (newPass !== confirmPass) {
    showModalMsg('La nueva contraseña y la confirmación no coinciden.');
    confirmPassEl?.select();
    return;
  }

  // Guardar nueva contraseña en localStorage
  localStorage.setItem('boeweb_vendor_password_' + activeVendor.toLowerCase(), newPass);
  
  showModalMsg('¡Contraseña actualizada con éxito!', false);
  showToast(`🔑 Contraseña actualizada correctamente para ${activeVendor}.`);

  setTimeout(() => {
    closeVendorPasswordModal();
  }, 900);
}

function vendorLogout() {
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
  } else if (tab === 'portfolio') {
    if (portfolioSection) {
      portfolioSection.style.display = 'block';
      targetSection = portfolioSection;
    }
    if (vcardPortfolio) {
      vcardPortfolio.style.borderColor = '#ab47bc';
      vcardPortfolio.style.transform = 'scale(1.02)';
    }
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
    renderCashSectionUI();
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

  setText('vendor-welcome-title', `${greeting}, ${activeVendor}`);
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
const LOCAL_PRODUCT_LOCATIONS_KEY = 'boeweb_product_locations_v1';

function readLocalProductLocations() {
  try {
    const rows = JSON.parse(localStorage.getItem(LOCAL_PRODUCT_LOCATIONS_KEY) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.warn('No se pudieron leer las ubicaciones locales:', error);
    return [];
  }
}

function saveLocalProductLocation(location) {
  const rows = readLocalProductLocations().filter(item => item.product_code !== location.product_code);
  rows.unshift(location);
  localStorage.setItem(LOCAL_PRODUCT_LOCATIONS_KEY, JSON.stringify(rows.slice(0, 500)));
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
  if (!supabaseClient || storeMapDataLoading || (storeMapDataLoaded && !forceReload)) return;
  storeMapDataLoading = true;
  try {
    const [shelvesResult, draftsResult] = await Promise.all([
      supabaseClient.from('store_shelves').select('*').order('code', { ascending: true }),
      supabaseClient
        .from('product_drafts')
        .select('*')
        .eq('status', 'APPROVED')
        .order('updated_at', { ascending: false })
    ]);
    const localLocations = readLocalProductLocations();
    const draftLocations = draftsResult.error
      ? []
      : (draftsResult.data || []).map(mapLocatedDraftToProductLocation).filter(Boolean);
    const localByCode = new Map(localLocations.map(item => [item.product_code, item]));
    const mergedByCode = new Map(localByCode);
    draftLocations.forEach(item => {
      const knownDetails = mergedByCode.get(item.product_code) || {};
      mergedByCode.set(item.product_code, { ...knownDetails, ...item });
    });
    // Also include located products from internalCatalogProducts
    if (typeof internalCatalogProducts !== 'undefined' && Array.isArray(internalCatalogProducts)) {
      internalCatalogProducts.forEach(p => {
        if (p.shelf_code || p.location || p.wms_code || p.location_label) {
          const code = p.product_code || p.id;
          const known = mergedByCode.get(code) || {};
          mergedByCode.set(code, {
            ...known,
            product_id: p.id || code,
            product_code: code,
            name: p.name || code,
            image_url: p.image || p.image_url || known.image_url || '',
            barcode: p.barcode || known.barcode || null,
            floor_level: Number(p.floor_level) || (String(p.wms_code || '').startsWith('DP') ? 2 : 1),
            shelf_code: p.shelf_code || known.shelf_code || '',
            shelf_level: Number(p.shelf_level || p.level) || known.shelf_level || 1,
            stock: Math.max(0, Number(p.stock ?? p.on_hand) || 0),
            shelf_position: p.shelf_position || known.shelf_position || null,
            location_label: p.location_label || p.location || known.location_label || null,
            wms_code: p.wms_code || known.wms_code || null
          });
        }
      });
    }

    const syncLabel = draftsResult.error
      ? 'Modo local · sin conexión al inventario'
      : 'Inventario sincronizado';
    if (window.setStoreMapData) {
      window.setStoreMapData(shelvesResult.error ? [] : (shelvesResult.data || []), [...mergedByCode.values()], syncLabel);
    }
    storeMapDataLoaded = true;
  } catch (error) {
    console.error('Error al sincronizar el mapa:', error);
    if (window.setStoreMapData) window.setStoreMapData([], readLocalProductLocations(), 'Modo local');
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

function decodeHumanWmsLocation(queryOrCode, matchedProduct = null) {
  const raw = String(queryOrCode || (matchedProduct?.wms_code || matchedProduct?.location || matchedProduct?.shelf_code || '')).trim();
  const upper = raw.toUpperCase();

  // 1. Check full WMS code pattern: DP-D-P3-E3-N3-D or TI-I-P4-E1-N1-C
  const fullParts = upper.split('-');
  let zoneCode = 'TI';
  let compassCode = 'F';
  let wallCode = 'P1';
  let shelfCode = 'E1';
  let levelNum = 1;
  let sectorCode = 'C';

  if (fullParts.length >= 6) {
    zoneCode = fullParts[0];
    compassCode = fullParts[1];
    wallCode = fullParts[2];
    shelfCode = fullParts[3];
    levelNum = Number(fullParts[4].replace(/\D/g, '')) || 1;
    sectorCode = fullParts[5];
  } else {
    if (upper.includes('DP') || upper.includes('DEP')) zoneCode = 'DP';
    else if (upper.includes('TI') || upper.includes('TIE')) zoneCode = 'TI';

    const wallMatch = upper.match(/P([1-4])/);
    if (wallMatch) wallCode = `P${wallMatch[1]}`;

    const shelfMatch = upper.match(/(E[1-5]|HEL\d*|VIT\d*|PIS\d*|[A-E][-_]?[1-5])/);
    if (shelfMatch) shelfCode = shelfMatch[1].replace('-', '');

    const levelMatch = upper.match(/N([1-6])/) || upper.match(/NIVEL\s*([1-6])/);
    if (levelMatch) levelNum = Number(levelMatch[1]);

    if (upper.includes('IZQ') || upper.endsWith('-I')) sectorCode = 'I';
    else if (upper.includes('DER') || upper.endsWith('-D')) sectorCode = 'D';
    else if (upper.includes('CEN') || upper.endsWith('-C')) sectorCode = 'C';
  }

  // Area: Tienda vs Deposito
  const floorLevel = (zoneCode === 'DP' || zoneCode === 'DEPÓSITO') ? 2 : 1;
  const areaLabel = floorLevel === 2 ? 'el Depósito General' : 'la Tienda';

  // Wall text
  const wallMap = {
    'P1': 'Pared etiqueta 1 (Pared frontal / Norte)',
    'P2': 'Pared etiqueta 2 (Pared de fondo / Sur)',
    'P3': 'Pared etiqueta 3 (es la pared lateral derecha)',
    'P4': 'Pared etiqueta 4 (es la pared lateral izquierda)'
  };
  const wallLabel = wallMap[wallCode] || `Pared ${wallCode}`;

  // Compass explanation relative to central PC
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

  // Furniture / Type text
  let furnitureType = 'Estante de pared';
  if (shelfCode.startsWith('HEL')) {
    furnitureType = 'Heladera / Equipo de frío';
  } else if (shelfCode.startsWith('VIT')) {
    furnitureType = 'Vitrina / Mostrador vidriado';
  } else if (shelfCode.startsWith('PIS')) {
    furnitureType = 'Pallet de piso (sustratos / bultos)';
  } else if (shelfCode.startsWith('E')) {
    const num = shelfCode.replace('E', '');
    furnitureType = `Estante de pared (Estante ${num})`;
  } else {
    furnitureType = `Módulo de estantería ${shelfCode}`;
  }

  // Level description (N1 is bottom/floor)
  const levelDescriptions = {
    1: 'nivel piso / abajo',
    2: 'nivel bajo',
    3: 'nivel medio (a la altura de la vista y manos)',
    4: 'nivel medio-alto',
    5: 'nivel alto',
    6: 'tope superior (arriba del todo)'
  };
  const levelLabel = `Nivel ${levelNum}`;
  const levelDesc = levelDescriptions[levelNum] || `Nivel ${levelNum}`;

  // Sector horizontal description
  const sectorDescriptions = {
    'I': 'en el sector izquierdo de la balda',
    'C': 'en el centro',
    'D': 'en el sector derecho de la balda'
  };
  const sectorText = sectorDescriptions[sectorCode] || 'en el centro';

  // Physical shelf code on the floor layout (e.g. P3-E3 or E3)
  const layoutShelfCode = `${wallCode}-${shelfCode}`.replace(/P\d-P/, 'P');

  // Match product from internal catalog, local locations, or store map
  let matched = matchedProduct;
  const storeLocs = (typeof window !== 'undefined' && Array.isArray(window.storeLocationProducts)) ? window.storeLocationProducts : [];
  const localLocs = typeof readLocalProductLocations === 'function' ? readLocalProductLocations() : [];
  const allProducts = [...(internalCatalogProducts || []), ...storeLocs, ...localLocs, ...(baseProducts || [])];
  
  if (!matched) {
    // 1. Direct WMS code, SKU, barcode, name or ID match
    matched = allProducts.find(p => 
      (p.wms_code && p.wms_code.toUpperCase() === upper) ||
      (p.barcode && p.barcode.toUpperCase() === upper) ||
      (p.product_code && p.product_code.toUpperCase() === upper) ||
      (p.id && String(p.id).toUpperCase() === upper) ||
      (p.name && p.name.toUpperCase() === upper) ||
      (p.name && p.name.toLowerCase().includes(raw.toLowerCase()))
    );
  }

  if (!matched) {
    // 2. Matching by physical shelf code and level
    matched = allProducts.find(p => {
      const pShelf = String(p.shelf_code || '').toUpperCase().replace(/[-_ ]/g, '');
      const tShelf1 = `${wallCode}${shelfCode}`.toUpperCase().replace(/[-_ ]/g, '');
      const tShelf2 = `${shelfCode}`.toUpperCase().replace(/[-_ ]/g, '');
      const shelfMatch = pShelf === tShelf1 || pShelf === tShelf2 || pShelf.includes(tShelf2);
      const pLevel = Number(p.shelf_level ?? p.level) || 0;
      const levelMatch = !pLevel || pLevel === levelNum;
      return shelfMatch && levelMatch;
    });
  }

  if (!matched) {
    // 3. Fallback: match by shelf only
    matched = allProducts.find(p => {
      const pShelf = String(p.shelf_code || '').toUpperCase();
      return pShelf.includes(shelfCode) || pShelf.includes(layoutShelfCode);
    });
  }

  // Stock count & product properties
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
  let shelfPhoto = null;
  try {
    const photos = JSON.parse(localStorage.getItem('boeweb_store_shelf_photos_v1') || '{}');
    shelfPhoto = photos[layoutShelfCode] || photos[shelfCode] || matched?.placement_photo_url || null;
  } catch (err) {}

  return {
    rawCode: raw,
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
    hasMatchedProduct: !!matched,
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
  const title = info.productName 
    ? `${escapeFn(info.productName)}`
    : `Ubicación: ${escapeFn(info.rawCode)}`;

  const stockBadgeHtml = info.hasMatchedProduct
    ? `<strong style="color: #81c784; font-size: 1.18rem; font-weight: 900;">${info.stockCount} unidades disponibles</strong>`
    : `<span style="color: #ffd54f; font-weight: 700;">0 u. (Espacio disponible para asignar)</span>`;

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
              📍 Guía de Ubicación Física
            </span>
            <h3 style="margin: 4px 0 0 0; font-size: 1.15rem; color: #ffffff; font-weight: 800; line-height: 1.3; word-break: break-word;">
              ${title}
            </h3>
            ${info.productBarcode ? `<small style="color: rgba(247,246,242,0.7); font-size: 0.78rem; font-family: monospace;">SKU / Código: ${escapeFn(info.productBarcode)}</small>` : `<small style="color: #ffd54f; font-size: 0.75rem;">Código WMS: ${escapeFn(info.rawCode)}</small>`}
          </div>
        </div>
        ${info.productId ? `
          <button type="button" onclick="openProductFullInfoModal('${escapeFn(info.productId)}')" style="padding: 7px 12px; border-radius: 10px; background: rgba(194,162,70,0.25); border: 1.5px solid #c2a246; color: #ffd54f; font-size: 0.78rem; font-weight: 800; cursor: pointer; white-space: nowrap; flex-shrink: 0; display: flex; align-items: center; gap: 4px;">
            ℹ️ Ver más info
          </button>
        ` : ''}
      </div>

      <div style="background: rgba(0,0,0,0.3); border-radius: 14px; padding: 16px; border: 1px solid rgba(255,255,255,0.12); margin-bottom: 18px; font-size: 0.95rem; line-height: 1.7;">
        <div style="margin-bottom: 10px;">
          🏢 <strong>Lugar:</strong> El producto se encuentra en <span style="color: #c2a246; font-weight: 800;">${escapeFn(info.areaLabel)}</span>.
        </div>
        <div style="margin-bottom: 10px;">
          🧭 <strong>Pared y Orientación:</strong> <span style="color: #a5d6a7; font-weight: 700;">${escapeFn(info.wallLabel)}</span> (${escapeFn(info.compassText)}).
        </div>
        <div style="margin-bottom: 10px;">
          🪵 <strong>Tipo de Mueble:</strong> <span style="color: #ffffff; font-weight: 700;">${escapeFn(info.furnitureType)}</span>.
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

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
        <button type="button" onclick="openStockAdjustmentModal('${escapeFn(info.productId || info.productBarcode || info.productName || info.rawCode)}', 'add')" style="padding: 12px 14px; border-radius: 12px; font-weight: 800; font-size: 0.88rem; background: rgba(76,175,80,0.25); border: 1.5px solid #81c784; color: #a5d6a7; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
          ➕ Agregar stock
        </button>
        <button type="button" onclick="openStockAdjustmentModal('${escapeFn(info.productId || info.productBarcode || info.productName || info.rawCode)}', 'remove')" style="padding: 12px 14px; border-radius: 12px; font-weight: 800; font-size: 0.88rem; background: rgba(239,83,80,0.25); border: 1.5px solid #ef5350; color: #ef9a9a; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
          ➖ Quitar stock
        </button>
      </div>

      <div>
        <button type="button" onclick="closeStoreMapLocationCard()" style="width: 100%; min-height: 52px; padding: 14px 20px; font-size: 1.05rem; font-weight: 900; background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%); color: #ffffff; border: 2px solid #81c784; border-radius: 14px; cursor: pointer; box-shadow: 0 6px 20px rgba(46,125,50,0.45); display: flex; align-items: center; justify-content: center; gap: 10px;">
          ✅ Encontrado
        </button>
      </div>
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

  // 3. Render persistent card
  renderStoreMapLocationCard(info);

  // 4. Update the interactive 2D/3D map
  if (window.setFloorLevel) {
    window.setFloorLevel(info.floorLevel);
  }
  if (window.selectShelf) {
    window.selectShelf(info.layoutShelfCode || info.shelfCode, info.levelNum);
  }
  renderStoreMapUI(info.wallCode || info.zoneCode, info.layoutShelfCode || info.shelfCode, info.levelNum);
}


function simulateCustomerQRScan() {
  const resultBox = document.getElementById('customer-scan-result');
  const nameEl = document.getElementById('scanned-customer-name');
  const tierEl = document.getElementById('scanned-customer-tier');
  const seedsEl = document.getElementById('scanned-customer-seeds');

  showToast('🔍 Leyendo Código QR del celular del cliente...');

  setTimeout(() => {
    if (nameEl) nameEl.textContent = '👤 Franco P. (Cliente VIP BÔ)';
    if (tierEl) tierEl.textContent = '🌳 RANGO ÁRBOL ZEN';
    if (seedsEl) seedsEl.textContent = '650 Semillas VIP';
    if (resultBox) resultBox.style.display = 'block';

    showToast('✅ Cliente Verificado. Beneficios VIP y REPROCANN Aplicados.');
  }, 1200);
}

// --- CASH REGISTER & SHIFT CLOSING ENGINE ---
const CASH_TIME_ZONE = 'America/Argentina/Buenos_Aires';
const CASH_SCHEMA_VERSION = 2;
const CASH_TYPE_CONFIG = {
  apertura: { label: 'Fondo inicial', flow: 'in' },
  venta_efectivo: { label: 'Venta en efectivo', flow: 'in' },
  venta_transf: { label: 'Venta por transferencia', flow: 'transfer' },
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
    closed: false,
    validated: false,
    closedBy: null,
    validatedBy: null,
    updatedAt: null
  };
}

function normalizeCashData(value, dateKey = getTodayDateKey()) {
  const base = value && typeof value === 'object' ? value : {};
  const movements = Array.isArray(base.movements)
    ? base.movements.filter(movement => movement && Number.isFinite(Number(movement.amount))).map(movement => ({
        ...movement,
        id: movement.id || `legacy_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        amount: Number(movement.amount),
        desc: String(movement.desc || 'Movimiento sin detalle'),
        vendor: String(movement.vendor || 'Vendedor'),
        type: CASH_TYPE_CONFIG[movement.type] ? movement.type : 'venta_efectivo',
        voided: Boolean(movement.voided)
      }))
    : [];

  return {
    ...getEmptyCashData(dateKey),
    ...base,
    schemaVersion: CASH_SCHEMA_VERSION,
    date: base.date || dateKey,
    movements,
    closed: Boolean(base.closed),
    validated: Boolean(base.validated)
  };
}

function getVendorCashData(dateKey = getTodayDateKey()) {
  const storageKey = `boeweb_cash_${dateKey}`;
  const storedValue = localStorage.getItem(storageKey);
  if (!storedValue) return getEmptyCashData(dateKey);

  try {
    return normalizeCashData(JSON.parse(storedValue), dateKey);
  } catch (error) {
    console.error('No se pudo leer la caja guardada:', error);
    localStorage.setItem(`${storageKey}_recovery_${Date.now()}`, storedValue);
    return getEmptyCashData(dateKey);
  }
}

function saveVendorCashData(data, dateKey = getTodayDateKey()) {
  const normalized = normalizeCashData(data, dateKey);
  normalized.updatedAt = new Date().toISOString();
  localStorage.setItem(`boeweb_cash_${dateKey}`, JSON.stringify(normalized));
  renderVendorHomeUI();
  return normalized;
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

function addCashMovement(event) {
  if (event) event.preventDefault();
  const activeVendor = localStorage.getItem('boeweb_vendor_name') || 'Vendedor';
  const typeEl = document.getElementById('cash-entry-type');
  const amountEl = document.getElementById('cash-entry-amount');
  const descEl = document.getElementById('cash-entry-desc');
  const type = typeEl?.value || 'venta_efectivo';
  const amount = Number.parseFloat(amountEl?.value || '0');
  const desc = descEl?.value.trim() || '';
  const cashData = getVendorCashData();

  if (!CASH_TYPE_CONFIG[type]) {
    alert('El tipo de movimiento seleccionado no es válido.');
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0 || !desc) {
    alert('Ingresá un monto mayor a $0 y un detalle válido.');
    return;
  }
  if (cashData.closed) {
    alert('La caja de hoy ya fue cerrada. No se pueden agregar movimientos.');
    return;
  }

  const now = new Date();
  cashData.movements.unshift({
    id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `cash_${Date.now()}`,
    createdAt: now.toISOString(),
    time: now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
    type,
    amount,
    desc,
    vendor: activeVendor,
    voided: false
  });
  saveVendorCashData(cashData);

  if (amountEl) amountEl.value = '';
  if (descEl) {
    descEl.value = '';
    descEl.focus();
  }
  renderCashSectionUI();
  if (window.showToast) window.showToast(`Movimiento de ${formatCashCurrency(amount)} registrado.`);
}

function toggleCashMovementVoid(movementId) {
  const cashData = getVendorCashData();
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
        <button type="button" class="cash-void-btn" data-movement-id="${escapeCashHtml(String(movement.id))}" ${cashData.closed ? 'disabled' : ''}>
          ${movement.voided ? 'Restaurar' : 'Anular'}
        </button>
      </article>`;
  }).join('');

  listEl.querySelectorAll('.cash-void-btn').forEach(button => {
    button.addEventListener('click', () => toggleCashMovementVoid(button.dataset.movementId));
  });
}

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
    if (cashData.validated) {
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
    control.disabled = cashData.closed;
  });

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

function performShiftClosure() {
  const cashData = getVendorCashData();
  if (cashData.closed) return;

  const activeMovements = cashData.movements.filter(movement => !movement.voided);
  const countedEl = document.getElementById('cash-counted-amount');
  const notesEl = document.getElementById('cash-closure-notes');
  const countedCash = Number.parseFloat(countedEl?.value || '');
  if (activeMovements.length === 0) {
    alert('Registrá al menos un movimiento antes de cerrar la caja.');
    return;
  }
  if (!Number.isFinite(countedCash) || countedCash < 0) {
    alert('Ingresá el efectivo contado antes de cerrar el turno.');
    countedEl?.focus();
    return;
  }

  const totals = calculateCashTotals(cashData);
  cashData.closed = true;
  cashData.closedBy = localStorage.getItem('boeweb_vendor_name') || 'Vendedor';
  cashData.closedAt = new Date().toISOString();
  cashData.expectedCash = totals.expectedCash;
  cashData.countedCash = countedCash;
  cashData.difference = countedCash - totals.expectedCash;
  cashData.closureNotes = notesEl?.value.trim() || '';
  saveVendorCashData(cashData);
  renderCashSectionUI();
  downloadCashBackup('json');
  if (window.showToast) window.showToast('Caja cerrada. Se descargó un respaldo automático del arqueo.');
}

function validateAdminClosurePrompt() {
  const cashData = getVendorCashData();
  if (!cashData.closed || cashData.validated) return;
  const passEl = document.getElementById('cash-admin-password');
  const pass = passEl?.value.trim() || '';

  if (pass === 'admin123' || pass === 'boeweb2025' || pass === '1234') {
    cashData.validated = true;
    cashData.validatedBy = 'Admin';
    cashData.validatedAt = new Date().toISOString();
    saveVendorCashData(cashData);
    if (passEl) passEl.value = '';
    renderCashSectionUI();
    downloadCashBackup('json');
    if (window.showToast) window.showToast('Arqueo validado y respaldado correctamente.');
  } else {
    if (passEl) {
      passEl.value = '';
      passEl.focus();
    }
    alert('Contraseña de administración incorrecta.');
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
  const exportData = {
    brand: 'BÔ Grow Club',
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
const MOCK_VENDOR_CLIENTS = [
  { id: 101, name: 'Franco P.', phone: '5493512345678', vendor: 'Nacho Mina', tier: '🌳 ÁRBOL ZEN', regDate: '2026-05-10', lastSoilDaysAgo: 65, totalSpent: 145000 },
  { id: 102, name: 'Sofía Martínez', phone: '5493518765432', vendor: 'Nacho Mina', tier: '🌿 BROTE ZEN', regDate: '2026-06-02', lastSoilDaysAgo: 20, totalSpent: 48000 },
  { id: 103, name: 'Lucas Gómez', phone: '5493519998877', vendor: 'Raul', tier: '🌱 SEMILLA ZEN', regDate: '2026-04-15', lastSoilDaysAgo: 70, totalSpent: 92000 },
  { id: 104, name: 'Agustín Benítez', phone: '5493514443322', vendor: 'Alexis', tier: '🌳 ÁRBOL ZEN', regDate: '2026-03-20', lastSoilDaysAgo: 45, totalSpent: 210000 },
  { id: 105, name: 'Camila Rodriguez', phone: '5493516665544', vendor: 'Gino', tier: '🌿 BROTE ZEN', regDate: '2026-06-18', lastSoilDaysAgo: 10, totalSpent: 35000 },
  { id: 106, name: 'Valentín Silva', phone: '5493511112233', vendor: 'Rodrigo', tier: '🌱 SEMILLA ZEN', regDate: '2026-05-28', lastSoilDaysAgo: 85, totalSpent: 64000 },
  { id: 107, name: 'Martina Lopez', phone: '5493517778899', vendor: 'Felipe', tier: '🌳 ÁRBOL ZEN', regDate: '2026-02-14', lastSoilDaysAgo: 90, totalSpent: 180000 }
];

function getVendorClients(vendorName) {
  const customClients = JSON.parse(localStorage.getItem('boeweb_referred_clients') || '[]');
  const combined = [...customClients, ...MOCK_VENDOR_CLIENTS];
  if (!vendorName) return combined;
  return combined.filter(c => c.vendor && c.vendor.toLowerCase() === vendorName.toLowerCase());
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
              <strong style="color: var(--color-text-main); font-weight: 700;">${c.name}</strong>
              <span style="display: block; font-size: 0.72rem; color: var(--color-text-muted);">Registrado/a: ${c.regDate || '2026-05-15'}</span>
            </td>
            <td style="padding: 12px 10px;">
              <a href="https://wa.me/${c.phone}" target="_blank" style="color: #25d366; font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                💬 ${c.phone}
              </a>
            </td>
            <td style="padding: 12px 10px;">
              <span style="background: rgba(195,155,75,0.15); border: 1px solid var(--color-accent-gold); color: var(--color-accent-gold); padding: 3px 8px; border-radius: 8px; font-size: 0.75rem; font-weight: 700;">
                ${c.tier || '🌱 SEMILLA ZEN'}
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
              <button type="button" class="btn btn-secondary" onclick="sendVendorWhatsAppPromo('${c.phone}', '${c.name}', 'sustrato')" style="padding: 6px 12px; font-size: 0.78rem; border-color: #25d366; color: #25d366; border-radius: 8px; font-weight: 700;">
                💬 Enviar Promo Sustrato
              </button>
            </td>
          </tr>
        `;
      }).join('');
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
const LOCATION_ASSISTANT_STEP_ORDER = ['list', 'zone', 'type', 'compass', 'wall', 'shelf', 'level', 'sector', 'review'];

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
  { id: 'D', label: '➡️ Derecha (D)', help: 'Sector derecho de la balda' }
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

function createProductCode() {
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const randomPart = crypto.randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase();
  return `BO-${date}-${randomPart}`;
}

function buildProductQrPayload(productCode) {
  const url = new URL('vendedor.html', window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('product', productCode);
  return url.toString();
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
    manual: ['Agregá una foto del producto', 'Luego completarás los datos manualmente.']
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
    if (nextButton) nextButton.textContent = 'Datos del producto';
    return;
  }
  if (mobileProductAssistantStep === 'details') {
    content.innerHTML = fastUploadLookupResult?.found
      ? '<p class="assistant-question">Completá cantidad y precio</p><p class="assistant-help">Los demás datos ya fueron completados. Podés revisarlos si hace falta.</p>'
      : '<p class="assistant-question">Confirmá los datos, la cantidad y el precio</p><p class="assistant-help">Corregí cualquier dato antes de continuar.</p>';
    if (nextButton) nextButton.textContent = 'Revisar ingreso';
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
    if (!fastUploadSelectedFile && !fastUploadLookupResult?.found) {
      showToast('Escaneá un código encontrado o agregá una foto para continuar.');
      return;
    }
    setMobileProductAssistantStep('details');
    return;
  }
  if (mobileProductAssistantStep === 'details') {
    const name = document.getElementById('fastupload-name-input')?.value.trim();
    const category = document.getElementById('fastupload-category-input')?.value;
    const stock = Number.parseInt(document.getElementById('fastupload-stock-input')?.value || '', 10);
    const salePrice = Number(document.getElementById('fastupload-sale-price-input')?.value || 0);
    if (!name || !category || !Number.isFinite(stock) || stock < 0 || !Number.isFinite(salePrice) || salePrice <= 0) {
      showToast('Completá nombre, categoría, cantidad y precio de venta.');
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
      barcode: fallback.barcode || null,
      official_url: fallback.official_url || null,
      market_query: fallback.name || product?.name || null,
      image_url: fallback.image_url || product?.image || null
    },
    sale_price: Number(fallback.sale_price) || Number(localSupplier?.price) || null,
    sources,
    providers: ['Catálogo BÔ'],
    warnings: []
  };
}

async function fetchCatalogProductById(productId) {
  if (!productId) return null;
  const rows = await readStockLookupRows(
    supabaseClient
      .from('products')
      .select('id, name, image, category, description, supplier_products(supplier_id, name, price, stock, available, link)')
      .eq('id', productId)
      .limit(1),
    'Catálogo BÔ'
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
  if (barcode) {
    const location = readLocalProductLocations()
      .find(item => cleanStockBarcode(item.barcode) === barcode);
    if (location) {
      const product = await fetchCatalogProductById(location.product_id);
      return normalizeCatalogLookup(product, {
        name: location.name,
        barcode: location.barcode,
        image_url: location.image_url
      });
    }

    const draftRows = await readStockLookupRows(
      supabaseClient
        .from('product_drafts')
        .select('*')
        .eq('status', 'APPROVED')
        .order('updated_at', { ascending: false })
        .limit(250),
      'Productos aprobados de BÔ'
    );
    const draft = draftRows
      .map(hydrateProductDraft)
      .find(item => cleanStockBarcode(item.barcode) === barcode) || null;
    if (draft) return normalizeCatalogLookup(null, draft);
  }

  const safeQuery = String(query || '')
    .replace(/[%_,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  if (safeQuery.length < 2) return null;

  let catalogRows = await readStockLookupRows(
    supabaseClient
      .from('products')
      .select('id, name, image, category, description, supplier_products(supplier_id, name, price, stock, available, link)')
      .ilike('name', `%${safeQuery}%`)
      .limit(3),
    'Catálogo BÔ'
  );
  if (!catalogRows.length) {
    const mostSpecificTerm = stockMatchTokens(safeQuery)
      .filter(term => term.length >= 4)
      .sort((a, b) => b.length - a.length)[0];
    if (mostSpecificTerm && mostSpecificTerm !== safeQuery.toLowerCase()) {
      catalogRows = await readStockLookupRows(
        supabaseClient
          .from('products')
          .select('id, name, image, category, description, supplier_products(supplier_id, name, price, stock, available, link)')
          .ilike('name', `%${mostSpecificTerm}%`)
          .limit(3),
        'Catálogo BÔ'
      );
    }
  }
  const reliableMatch = catalogRows.find(product => isReliableCatalogNameMatch(product.name, safeQuery));
  return reliableMatch ? normalizeCatalogLookup(reliableMatch) : null;
}

async function fetchExternalStockLookup(barcode, query) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch('/.netlify/functions/lookup-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ barcode: barcode || null, query: query || null })
    });
    const result = await response.json().catch(() => ({}));
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
      status.textContent = 'No encontramos una coincidencia confiable en growshops. Podés abrir Google Argentina desde las fuentes o completar los datos manualmente.';
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
    status.textContent = `Datos encontrados en ${providers}.${marketCopy}${warningCopy} Ahora completá cantidad y precio.`;
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
    try {
      response = await fetch('/.netlify/functions/analyze-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          imageDataUrl,
          barcode: document.getElementById('fastupload-barcode-input')?.value.trim() || null,
          hints: {
            name: document.getElementById('fastupload-name-input')?.value.trim() || null,
            brand: document.getElementById('fastupload-brand-input')?.value.trim() || null
          }
        })
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
    const result = await response.json().catch(() => ({}));
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
    status.textContent = `Sugerencias completadas. Revisá los datos antes de enviar.${marketCopy}`;
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
    if (!fastUploadSelectedFile && !fastUploadLookupResult?.found) {
      showToast('⚠️ Escaneá un código encontrado o agregá una foto antes de enviar.');
      return;
    }

    const stockVal = Number.parseInt(document.getElementById('fastupload-stock-input').value, 10);
    if (!Number.isFinite(stockVal) || stockVal < 0) {
      showToast('⚠️ El stock debe ser mayor o igual a 0.');
      return;
    }

    const nameVal = document.getElementById('fastupload-name-input').value.trim();
    const categoryVal = document.getElementById('fastupload-category-input').value;
    const shelfVal = document.getElementById('fastupload-shelf-input').value;
    const floorVal = shelfVal ? Number(document.getElementById('fastupload-floor-input').value || 1) : null;
    const shelfLevelVal = shelfVal ? Number(document.getElementById('fastupload-level-input').value || 2) : null;
    const locationVal = document.getElementById('fastupload-location-input').value.trim();
    const obsVal = document.getElementById('fastupload-obs-input').value.trim();
    const salePriceVal = Number(document.getElementById('fastupload-sale-price-input').value || 0);
    const activeVendor = localStorage.getItem('boeweb_vendor_name') || 'Vendedor Local';

    if (!nameVal || !categoryVal) {
      showToast('Completá el nombre y la categoría del producto.');
      return;
    }
    if (!Number.isFinite(salePriceVal) || salePriceVal <= 0) {
      showToast('Completá el precio de venta del producto.');
      document.getElementById('fastupload-sale-price-input')?.focus();
      return;
    }
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
      image_url: imageUrl,
      image_path: filePath,
      stock: stockVal,
      location: shelfVal ? locationVal : null,
      observations: obsVal || null,
      seller_name: activeVendor,
      status: 'PENDING_REVIEW',
      ...metadata
    };
    let { error: insertError } = await supabaseClient
      .from('product_drafts')
      .insert([fullDraft]);

    // Compatibilidad temporal con la tabla anterior hasta ejecutar la migración nueva.
    if (insertError && /column|schema cache/i.test(insertError.message || '')) {
      const legacyObservations = `[BÔ_META]${JSON.stringify(metadata)}\n${obsVal}`;
      const legacyResult = await supabaseClient.from('product_drafts').insert([{
        image_url: imageUrl,
        image_path: filePath,
        stock: stockVal,
        location: locationVal,
        observations: legacyObservations,
        seller_name: activeVendor,
        status: 'PENDING_REVIEW'
      }]);
      insertError = legacyResult.error;
    }

    if (insertError) {
      throw new Error(`Error al guardar borrador en Supabase DB: ${insertError.message}`);
    }

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
  let metadata = {};
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
  return merged;
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

async function fetchPendingLocationProducts() {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from('product_drafts')
    .select('*')
    .neq('status', 'REJECTED')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`No se pudo consultar la cola de ubicación: ${error.message}`);
  return (data || []).map(hydrateProductDraft).filter(isPendingLocationProduct);
}

async function refreshPendingLocationBadge() {
  try {
    const products = await fetchPendingLocationProducts();
    updatePendingLocationIndicators(products.length);
  } catch (error) {
    console.warn('No se pudo actualizar el contador de ubicación:', error.message);
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
  return `
    <p class="assistant-question">¿Qué producto vas a ubicar?</p>
    <p class="assistant-help">Podés recorrer el local y completar uno detrás de otro.</p>
    <div class="location-pending-list">
      ${pendingLocationProducts.map(product => `
        <button type="button" class="location-pending-card" onclick="selectPendingLocationProduct('${escapeStockHtml(product.id)}')">
          ${product.image_url
            ? `<img src="${escapeStockHtml(product.image_url)}" alt="${escapeStockHtml(product.name || 'Producto pendiente')}">`
            : '<span class="location-pending-placeholder" aria-hidden="true">□</span>'}
          <span>
            <strong>${escapeStockHtml(product.name || product.product_code || 'Producto sin nombre')}</strong>
            <small>${Number(product.stock) || 0} unidades · ${product.status === 'APPROVED' ? 'Aprobado' : 'En revisión'}</small>
          </span>
          <span aria-hidden="true">›</span>
        </button>`).join('')}
    </div>`;
}

function renderLocationAssistantProductHeader() {
  const product = locationAssistantState.product;
  if (!product) return '';
  return `
    <div class="location-assistant-product">
      ${product.image_url ? `<img src="${escapeStockHtml(product.image_url)}" alt="${escapeStockHtml(product.name || 'Producto')}">` : ''}
      <span><strong>${escapeStockHtml(product.name || product.product_code || 'Producto')}</strong><small>${Number(product.stock) || 0} unidades · ${escapeStockHtml(product.product_code || '')}</small></span>
    </div>`;
}

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
    state.shelfCode ? (LOCATION_SHELF_LABELS[state.shelfCode] || `Estante ${state.shelfCode}`) : null,
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
  const shelf = state.shelfCode || 'E1';
  const level = state.level || LOCATION_LEVEL_OPTIONS[0];
  const sector = state.sector || LOCATION_SECTOR_OPTIONS[0];

  const zonePrefix = zone.prefix || 'TI';
  const compassCode = compass.id || 'D';
  const wallCode = wall.id || 'P1';
  const levelNum = Number(level.id) || 1;
  const sectorCode = sector.id || 'C';

  // Código estándar: TI-D-P1-E2-N3-C
  const wmsCode = `${zonePrefix}-${compassCode}-${wallCode}-${shelf}-N${levelNum}-${sectorCode}`;
  const shelfName = LOCATION_SHELF_LABELS[shelf] || shelf;
  const locationLabel = `📍 ${zone.label} · ${compass.compass} de la PC · ${wall.label} · ${shelfName} · Nivel ${levelNum} · Sector ${sector.label}`;
  
  const zoneNoun = zonePrefix === 'DP' ? 'el depósito' : 'la tienda';
  const voicePhrase = `Está en ${zoneNoun}, a la ${compass.compass.toLowerCase()} de la PC, ${wall.label.toLowerCase()}, ${shelfName.toLowerCase()}, nivel ${levelNum}, sector ${sector.label.toLowerCase()}.`;

  return `
    ${renderLocationAssistantProductHeader()}
    <p class="assistant-question">Paso 6: El sistema generó el código</p>
    <p class="assistant-help">Ubicación estructurada con la PC central como punto de referencia. Código para QR y respuesta guiada por voz.</p>
    
    <div style="background: rgba(255, 253, 246, 0.98); border: 2px solid var(--vendor-gold); border-radius: 16px; padding: 18px; margin-bottom: 16px; box-shadow: 0 4px 14px rgba(92,59,30,0.08);">
      
      <!-- Código WMS Destacado -->
      <div style="text-align: center; padding: 14px; background: #152d24; border-radius: 12px; margin-bottom: 14px; border: 2px solid var(--vendor-gold);">
        <small style="color: var(--vendor-gold); font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 4px;">Código de Estantería Generado</small>
        <span style="font-size: 1.5rem; font-family: monospace; font-weight: 900; color: #ffffff; letter-spacing: 2px;">${escapeStockHtml(wmsCode)}</span>
      </div>

      <!-- Cuadrícula Desglosada -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; margin-bottom: 14px;">
        <div style="background: #f7f4ea; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(194,162,70,0.3);">
          <small style="color: var(--vendor-muted); display: block; font-size: 0.68rem; text-transform: uppercase; font-weight: 800;">1. Zona</small>
          <strong style="color: var(--vendor-forest); font-size: 0.85rem;">${escapeStockHtml(zone.label || '-')}</strong>
        </div>
        <div style="background: #f7f4ea; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(194,162,70,0.3);">
          <small style="color: var(--vendor-muted); display: block; font-size: 0.68rem; text-transform: uppercase; font-weight: 800;">2. Tipo</small>
          <strong style="color: var(--vendor-forest); font-size: 0.85rem;">${escapeStockHtml(type.label || '-')}</strong>
        </div>
        <div style="background: #f7f4ea; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(194,162,70,0.3);">
          <small style="color: var(--vendor-muted); display: block; font-size: 0.68rem; text-transform: uppercase; font-weight: 800;">3. Brújula PC</small>
          <strong style="color: var(--vendor-forest); font-size: 0.85rem;">${escapeStockHtml(compass.label || '-')}</strong>
        </div>
        <div style="background: #f7f4ea; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(194,162,70,0.3);">
          <small style="color: var(--vendor-muted); display: block; font-size: 0.68rem; text-transform: uppercase; font-weight: 800;">4. Pared</small>
          <strong style="color: var(--vendor-forest); font-size: 0.85rem;">${escapeStockHtml(wall.label || '-')}</strong>
        </div>
        <div style="background: #f7f4ea; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(194,162,70,0.3);">
          <small style="color: var(--vendor-muted); display: block; font-size: 0.68rem; text-transform: uppercase; font-weight: 800;">5. Mueble</small>
          <strong style="color: var(--vendor-forest); font-size: 0.85rem;">${escapeStockHtml(shelfName)}</strong>
        </div>
        <div style="background: #f7f4ea; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(194,162,70,0.3);">
          <small style="color: var(--vendor-muted); display: block; font-size: 0.68rem; text-transform: uppercase; font-weight: 800;">6. Nivel</small>
          <strong style="color: var(--vendor-forest); font-size: 0.85rem;">Nivel ${levelNum}</strong>
        </div>
        <div style="background: #f7f4ea; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(194,162,70,0.3);">
          <small style="color: var(--vendor-muted); display: block; font-size: 0.68rem; text-transform: uppercase; font-weight: 800;">7. Sector</small>
          <strong style="color: var(--vendor-forest); font-size: 0.85rem;">${escapeStockHtml(sector.label || '-')}</strong>
        </div>
      </div>

      <!-- Tarjeta Guía por Voz (Panel 8) -->
      <div style="padding: 12px; background: rgba(30, 70, 32, 0.08); border-radius: 12px; border-left: 4px solid var(--vendor-forest); margin-bottom: 12px;">
        <span style="font-size: 0.75rem; color: var(--vendor-forest); font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; display: block;">🎙️ Búsqueda por Voz / Guía Asistente</span>
        <strong style="font-size: 0.95rem; color: var(--vendor-ink); display: block; margin: 4px 0; font-style: italic;">“${escapeStockHtml(voicePhrase)}”</strong>
      </div>

    </div>

    <div style="display: flex; flex-direction: column; gap: 10px;">
      <button type="button" class="mobile-assistant-primary" onclick="persistLocationAssistant()" style="width: 100%; padding: 16px; font-size: 1.05rem; font-weight: 800; border-radius: 14px; background: var(--vendor-forest); color: #ffffff; cursor: pointer; border: none; box-shadow: 0 4px 14px rgba(21,45,36,0.2);">
        💾 Guardar Ubicación
      </button>

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
  const choiceSteps = ['zone', 'type', 'compass', 'wall', 'shelf', 'level', 'sector'];
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
  } else if (step === 'shelf') {
    if (title) title.textContent = 'Paso 4b: Elegí el mueble o estante';
    content.innerHTML = renderLocationChoiceCards('4b. Elegí el mueble', '¿Qué número de estante o módulo específico es?', LOCATION_SHELF_OPTIONS, 'chooseLocationAssistantShelf');
  } else if (step === 'level') {
    if (title) title.textContent = 'Paso 5: Elegí el nivel de altura (N1 al N6)';
    content.innerHTML = renderLocationChoiceCards('5. Elegí el nivel (N1 siempre es abajo)', 'Desde Nivel 1 (Piso/Base) hasta Nivel 6 (Tope superior)', LOCATION_LEVEL_OPTIONS, 'chooseLocationAssistantLevel');
  } else if (step === 'sector') {
    if (title) title.textContent = 'Paso 5b: Elegí el sector dentro del nivel';
    content.innerHTML = renderLocationChoiceCards('5b. Elegí el sector horizontal', 'En cada nivel elegí el sector: Izquierda (I), Centro (C) o Derecha (D)', LOCATION_SECTOR_OPTIONS, 'chooseLocationAssistantSector');
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
  locationAssistantState = { ...createEmptyLocationAssistantState(), step: 'zone', product };
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
  locationAssistantState.step = 'shelf';
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

function serializeLocationDraftObservations(draft, metadata) {
  return `[BÔ_META]${JSON.stringify(metadata)}\n${draft.observations || ''}`;
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
  saveLocalProductLocation(location);
  return null;
}

async function updateDraftLocationWithFallback(draft, updatePayload, legacyObservations) {
  let { error } = await supabaseClient
    .from('product_drafts')
    .update(updatePayload)
    .eq('id', draft.id);
  if (error && /column|schema cache/i.test(error.message || '')) {
    const fallbackResult = await supabaseClient
      .from('product_drafts')
      .update({
        location: updatePayload.location,
        observations: legacyObservations,
        updated_at: updatePayload.updated_at
      })
      .eq('id', draft.id);
    error = fallbackResult.error;
  }
  if (error) throw new Error(`No se pudo guardar la ubicación: ${error.message}`);
}

async function persistLocationAssistant() {
  const state = locationAssistantState;
  const draft = state.product;
  const status = document.getElementById('location-assistant-status');
  if (!draft || !state.zone || !state.compass || !state.wall || !state.shelfCode || !state.level || !state.sector) {
    showToast('Completá todos los pasos antes de guardar.');
    return;
  }
  try {
    if (status) {
      status.hidden = false;
      status.dataset.state = 'loading';
      status.textContent = 'Guardando la ubicación y actualizando el stock…';
    }
    const productCode = draft.product_code || draft.id;
    const photo = await uploadLocationAssistantPhoto(productCode);

    const zone = state.zone;
    const type = state.type || LOCATION_TYPE_OPTIONS[0];
    const compass = state.compass;
    const wall = state.wall;
    const shelf = state.shelfCode;
    const level = state.level;
    const sector = state.sector;
    const levelNum = Number(level.id) || 1;
    const floorLevel = zone.floor_level || (zone.id === 'DP' ? 2 : 1);

    const zonePrefix = zone.prefix || 'TI';
    const compassCode = compass.id || 'D';
    const wallCode = wall.id || 'P1';
    const sectorCode = sector.id || 'C';
    const shelfLabel = LOCATION_SHELF_LABELS[shelf] || shelf;

    // Código estándar oficial: TI-D-P1-E2-N3-C
    const wmsCode = `${zonePrefix}-${compassCode}-${wallCode}-${shelf}-N${levelNum}-${sectorCode}`;
    const locationLabel = `📍 ${zone.label} · ${compass.compass} de la PC · ${wall.label} · ${shelfLabel} · Nivel ${levelNum} · Sector ${sector.label}`;

    const updatedAt = new Date().toISOString();
    const overrides = {
      floor_level: floorLevel,
      shelf_code: `${wallCode}-${shelf}`,
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
    const observations = serializeLocationDraftObservations(draft, metadata);
    const draftUpdate = {
      location: locationLabel,
      floor_level: floorLevel,
      shelf_code: `${wallCode}-${shelf}`,
      shelf_level: levelNum,
      observations,
      updated_at: updatedAt
    };
    await updateDraftLocationWithFallback(draft, draftUpdate, observations);

    const productLocation = {
      product_id: productCode,
      product_code: productCode,
      name: draft.name || productCode,
      image_url: draft.image_url || photo.url,
      barcode: draft.barcode || null,
      floor_level: floorLevel,
      shelf_code: `${wallCode}-${shelf}`,
      shelf_level: levelNum,
      stock: Math.max(0, Number(draft.stock) || 0),
      qr_payload: draft.qr_payload || buildProductQrPayload(productCode),
      area_name: zone.label,
      wall_side: wall.label,
      shelf_position: sector.label,
      placement_photo_url: photo.url,
      placement_photo_path: photo.path,
      location_label: locationLabel,
      updated_at: updatedAt
    };
    productLocation.wms_code = wmsCode;
    saveLocalProductLocation(productLocation);

    if (Array.isArray(internalCatalogProducts)) {
      const internalItem = internalCatalogProducts.find(p => p.id === draft.id || p.product_code === productCode || p.barcode === draft.barcode);
      if (internalItem) {
        internalItem.location = locationLabel;
        internalItem.location_label = locationLabel;
        internalItem.shelf_code = `${wallCode}-${shelf}`;
        internalItem.shelf_level = levelNum;
        internalItem.wms_code = wmsCode;
      }
    }

    if (window.ensureShelfExistsForLocation) {
      window.ensureShelfExistsForLocation(`${wallCode}-${shelf}`, floorLevel, locationLabel);
    }
    if (window.logMapHistoryAction) {
      window.logMapHistoryAction('ASISTENTE_UBICACION', 'Ubicación de producto asignada', `Producto "${draft.name}" ubicado en ${wmsCode}`, `${wallCode}-${shelf}`, floorLevel);
    }

    storeMapDataLoaded = false;
    showToast(`✅ Ubicación guardada: ${wmsCode}`);
    if (status) {
      status.hidden = false;
      status.dataset.state = 'success';
      status.textContent = 'Producto ubicado correctamente. Cargando siguientes…';
    }
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

// Cargar y mostrar borradores pendientes de revisión.
async function loadPendingProductDrafts() {
  const container = document.getElementById('pending-drafts-grid');
  const badge = document.getElementById('drafts-pending-count-badge');
  if (!container) return;

  try {
    const { data: drafts, error } = await supabaseClient
      .from('product_drafts')
      .select('*')
      .eq('status', 'PENDING_REVIEW')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const normalizedDrafts = (drafts || []).map(hydrateProductDraft);
    pendingDraftCache.clear();
    normalizedDrafts.forEach(draft => pendingDraftCache.set(draft.id, draft));
    const pendingCount = normalizedDrafts.length;
    if (badge) {
      badge.textContent = pendingCount;
      badge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
    }

    if (pendingCount === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; background: rgba(0,0,0,0.2); border: 1px dashed var(--color-border-accent); border-radius: 16px; color: var(--color-text-muted);">
          <div style="font-size: 2.5rem; margin-bottom: 8px;">✨</div>
          <p style="font-weight: 700; font-size: 1.1rem; color: #66bb6a; margin: 0 0 4px 0;">¡No hay borradores pendientes!</p>
          <p style="font-size: 0.85rem; margin: 0;">Los productos cargados por los vendedores aparecerán acá para tu revisión.</p>
        </div>
      `;
      return;
    }

    const categoriesList = ['Semillas', 'Sustratos', 'Fertilizantes', 'Indoor', 'Vaporizadores', 'Macetas', 'Medición y Riego', 'Parafernalia', 'Otros'];

    container.innerHTML = normalizedDrafts.map(draft => {
      const dateStr = new Date(draft.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
      return `
        <div style="background: #ffffff; border: 1.5px solid #d4c5a9; border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 4px 14px rgba(92,59,30,0.08);">
          <div style="aspect-ratio: 1/1; max-height: 200px; background: #000; position: relative; overflow: hidden;">
            <img src="${escapeStockHtml(draft.image_url)}" alt="${escapeStockHtml(draft.name || 'Foto del producto')}" style="width: 100%; height: 100%; object-fit: contain;">
            <span style="position: absolute; top: 8px; left: 8px; background: rgba(21,45,36,0.9); border: 1px solid var(--color-accent-gold); color: var(--color-accent-gold); font-size: 0.7rem; font-weight: 700; padding: 3px 8px; border-radius: 8px;">
              ${escapeStockHtml(draft.seller_name || 'Vendedor')} · ${escapeStockHtml(dateStr)}
            </span>
          </div>

          <div style="padding: 16px; flex: 1; display: flex; flex-direction: column; gap: 10px;">
            <div style="background: #f7f4ea; border: 1px solid rgba(194,162,70,0.4); border-radius: 12px; padding: 10px 14px; font-size: 0.82rem; color: #5c3b1e;">
              <p style="margin: 0 0 4px 0; color: #5c3b1e;"><strong>📦 Stock Cargado:</strong> ${draft.stock} unidades</p>
              <p style="margin: 0 0 4px 0; color: #5c3b1e;"><strong>📍 Ubicación:</strong> ${escapeStockHtml(draft.location || 'No especificada')}</p>
              ${draft.product_code ? `<p style="margin: 0 0 4px; color: #5c3b1e;"><strong>QR BÔ:</strong> ${escapeStockHtml(draft.product_code)}</p>` : ''}
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

  } catch (err) {
    console.error('Error al cargar borradores pendientes:', err);
    container.innerHTML = `<p style="color: #ef5350;">Error al cargar borradores: ${err.message}</p>`;
  }
}

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

    const nameVal = nameInput ? nameInput.value.trim() : '';
    const catVal = catInput ? catInput.value : 'Otros';
    const costVal = costInput ? parseFloat(costInput.value) || 0 : 0;
    const priceVal = priceInput ? parseFloat(priceInput.value) || 0 : 0;

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

    const productId = draft.product_code || `BO-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    const stock = Math.max(0, Number(draft.stock) || 0);
    const imageUrl = draft.image_url;

    const { error: prodErr } = await supabaseClient
      .from('products')
      .upsert([{
        id: productId,
        name: nameVal,
        category: catVal,
        image: imageUrl,
        description: draft.description || `${draft.brand || ''} ${draft.presentation || ''}`.trim() || `Costo de referencia: $${costVal} ARS.`
      }], { onConflict: 'id' });

    if (prodErr) throw new Error(`Error al crear producto: ${prodErr.message}`);

    await ensureLocalStoreSupplierExists();

    const { error: spErr } = await supabaseClient
      .from('supplier_products')
      .upsert([{
        supplier_id: 'local_store',
        supplier_product_id: productId,
        name: nameVal,
        price: priceVal,
        stock: stock,
        available: true,
        image: imageUrl,
        mapped_product_id: productId
      }], { onConflict: 'supplier_id,supplier_product_id' });

    if (spErr) throw new Error(`Error al incorporar el producto al catálogo interno: ${spErr.message}`);

    const resolvedShelfCode = draft.shelf_code || String(draft.location || '').match(/[A-E]-\d/i)?.[0]?.toUpperCase() || '';
    let productLocation = null;
    if (resolvedShelfCode) {
      productLocation = {
        product_id: productId,
        product_code: productId,
        name: nameVal,
        image_url: imageUrl,
        barcode: draft.barcode || null,
        floor_level: Number(draft.floor_level) || 1,
        shelf_code: resolvedShelfCode,
        shelf_level: Number(draft.shelf_level) || 2,
        stock,
        qr_payload: draft.qr_payload || buildProductQrPayload(productId),
        area_name: draft.location_area || null,
        wall_side: draft.location_wall || null,
        shelf_position: draft.shelf_position || null,
        placement_photo_url: draft.placement_photo_url || null,
        placement_photo_path: draft.placement_photo_path || null,
        location_label: draft.location_label || draft.location || null,
        updated_at: new Date().toISOString()
      };
      const locationError = await upsertProductLocationWithFallback(productLocation);
      if (locationError) console.warn('Ubicación guardada localmente hasta aplicar la migración:', locationError.message);
    }

    const { error: updateErr } = await supabaseClient
      .from('product_drafts')
      .update({
        status: 'APPROVED',
        updated_at: new Date().toISOString()
      })
      .eq('id', draftId);

    if (updateErr) throw new Error(`Error al actualizar estado del borrador: ${updateErr.message}`);

    storeMapDataLoaded = false;
    showToast(productLocation
      ? `Producto "${nameVal}" publicado y ubicado en ${productLocation.shelf_code}, nivel ${productLocation.shelf_level}.`
      : `Producto "${nameVal}" publicado y agregado a pendientes de ubicación.`);

    // Recargar cola y catálogo B2B
    loadPendingProductDrafts();
    refreshPendingLocationBadge();
    if (window.fetchB2BProducts) window.fetchB2BProducts(true);

  } catch (err) {
    console.error('Error al aprobar borrador:', err);
    showToast(`❌ Error al aprobar: ${err.message}`);
  }
}

async function handleShelfPhotoChange(event, shelfCode) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    showToast(`Preparando foto del estante ${shelfCode}…`);
    const compressed = await compressImageFile(file, 800, 800, 0.70);
    let photoUrl = URL.createObjectURL(compressed);
    let photoPath = null;
    if (supabaseClient) {
      photoPath = `shelves/${shelfCode.toLowerCase()}_${Date.now()}.jpg`;
      const { error: uploadError } = await supabaseClient.storage
        .from('product-images')
        .upload(photoPath, compressed, { contentType: 'image/jpeg', upsert: false });
      if (!uploadError) {
        const { data: urlData } = supabaseClient.storage.from('product-images').getPublicUrl(photoPath);
        photoUrl = urlData?.publicUrl || photoUrl;
        const { error: shelfError } = await supabaseClient.from('store_shelves').upsert([{
          code: shelfCode,
          photo_url: photoUrl,
          photo_path: photoPath,
          updated_at: new Date().toISOString()
        }], { onConflict: 'code' });
        if (shelfError) console.warn('La foto quedó local hasta aplicar la migración:', shelfError.message);
      } else {
        console.warn('La foto quedó guardada solo en este equipo:', uploadError.message);
      }
    }
    const photos = JSON.parse(localStorage.getItem('boeweb_store_shelf_photos_v1') || '{}');
    photos[shelfCode] = photoUrl;
    localStorage.setItem('boeweb_store_shelf_photos_v1', JSON.stringify(photos));
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

function printProductQrByCode(productCode) {
  const mapMatch = window.findStoreMapProduct ? window.findStoreMapProduct(productCode) : null;
  const product = mapMatch?.product
    || readLocalProductLocations().find(item => item.product_code === productCode)
    || { product_code: productCode, name: productCode, qr_payload: buildProductQrPayload(productCode) };
  openQrPrintWindow(productCode, product.name, product.qr_payload || buildProductQrPayload(productCode));
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
    const { error } = await supabaseClient
      .from('product_drafts')
      .update({
        status: 'REJECTED',
        updated_at: new Date().toISOString()
      })
      .eq('id', draftId);

    if (error) throw error;

    showToast('🚫 Borrador rechazado.');
    loadPendingProductDrafts();
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
window.vendorLogout = vendorLogout;
window.switchVendorTab = switchVendorTab;
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
window.importCashBackup = importCashBackup;
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
    brand: draft?.brand || '',
    presentation: draft?.presentation || '',
    category: product?.category || draft?.category || 'Otros',
    description: product?.description || draft?.description || '',
    barcode: draft?.barcode || location?.barcode || '',
    image: product?.image || supplier.image || draft?.image_url || location?.image_url || '',
    imagePath: draft?.image_path || '',
    price: Number(supplier.price) || Number(draft?.sale_price) || 0,
    stock: Math.max(0, Number(supplier.stock ?? draft?.stock ?? location?.stock) || 0),
    available: supplier.available !== false,
    supplier
  };
}

async function loadInternalCatalog() {
  const grid = document.getElementById('internal-catalog-grid');
  if (grid) {
    setInternalCatalogStatus('Cargando los productos propios de la tienda…', 'loading');
    grid.innerHTML = '';
  }
  try {
    if (supabaseClient) {
      const { data: supplierRows, error } = await supabaseClient
        .from('supplier_products')
        .select('*')
        .eq('supplier_id', 'local_store')
        .order('name', { ascending: true });
      if (error) throw new Error(error.message);

      const rows = supplierRows || [];
      const productIds = internalCatalogProductIds(rows);
      const related = await fetchInternalCatalogRelations(productIds);
      const productsById = new Map(related.products.map(product => [String(product.id), product]));
      const draftsByCode = new Map(related.drafts.map(draft => [String(draft.product_code), draft]));
      const locationsByCode = new Map(readLocalProductLocations().map(location => [String(location.product_code), location]));

      internalCatalogProducts = rows.map(supplier => {
        const productId = String(supplier.mapped_product_id || supplier.supplier_product_id);
        return normalizeInternalCatalogProduct(
          supplier,
          productsById.get(productId),
          draftsByCode.get(productId),
          locationsByCode.get(productId)
        );
      });

      try {
        localStorage.setItem('boeweb_internal_catalog', JSON.stringify(internalCatalogProducts));
      } catch (_) {}
    } else {
      const cached = localStorage.getItem('boeweb_internal_catalog');
      if (cached) {
        try {
          internalCatalogProducts = JSON.parse(cached);
        } catch (_) {}
      }
    }

    if (grid) {
      populateInternalCatalogCategoryFilter();
      renderInternalCatalogGrid();
      setInternalCatalogStatus('');
    }
  } catch (error) {
    console.error('Error al cargar el catálogo interno:', error);
    const cached = localStorage.getItem('boeweb_internal_catalog');
    if (cached) {
      try {
        internalCatalogProducts = JSON.parse(cached);
      } catch (_) {}
    }
    if (grid) {
      populateInternalCatalogCategoryFilter();
      renderInternalCatalogGrid();
      setInternalCatalogStatus(`No se pudieron cargar los productos propios: ${error.message}`, 'error');
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

function renderInternalCatalogGrid() {
  const grid = document.getElementById('internal-catalog-grid');
  const countEl = document.getElementById('internal-catalog-count');
  if (!grid) return;

  const filtered = internalCatalogProducts.filter(product => {
    const matchesCategory = internalCatalogFilterCategory === 'all' || product.category === internalCatalogFilterCategory;
    const searchText = [product.name, product.brand, product.presentation, product.category, product.id, product.barcode].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = !internalCatalogFilterQuery || searchText.includes(internalCatalogFilterQuery);
    return matchesCategory && matchesSearch;
  });

  if (countEl) countEl.textContent = filtered.length;

  if (!filtered.length) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 48px 20px; background: rgba(0,0,0,0.2); border: 1px dashed var(--color-border-accent); border-radius: 16px; color: var(--color-text-muted);">
        <p style="font-weight: 700; font-size: 1.1rem; color: var(--color-accent-gold); margin: 0 0 6px 0;">No encontramos productos con ese filtro</p>
        <p style="font-size: 0.88rem; margin: 0;">Probá cambiando la búsqueda o agregá un producto nuevo desde Ingresar producto.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(product => `
    <article class="internal-catalog-card" style="background: var(--color-card-bg-alt); border: 1.5px solid var(--color-border-accent); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; box-shadow: var(--shadow-sm);">
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
        <div style="margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08);">
          <span style="font-size: 1.1rem; font-weight: 900; color: #66bb6a;">$${Number(product.price).toLocaleString('es-AR')}</span>
          <button type="button" onclick="openInternalCatalogEditor('${product.id}')" style="background: rgba(195,155,75,0.15); border: 1px solid var(--color-accent-gold); color: var(--color-accent-gold); padding: 6px 12px; border-radius: 8px; font-weight: 700; font-size: 0.82rem; cursor: pointer;">
            ✏️ Editar
          </button>
        </div>
      </div>
    </article>
  `).join('');
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
  return {
    name: document.getElementById('internal-editor-name')?.value.trim() || '',
    brand: document.getElementById('internal-editor-brand')?.value.trim() || null,
    presentation: document.getElementById('internal-editor-presentation')?.value.trim() || null,
    category: document.getElementById('internal-editor-category')?.value || 'Otros',
    barcode: cleanStockBarcode(document.getElementById('internal-editor-barcode')?.value || '') || null,
    price: Number(document.getElementById('internal-editor-price')?.value || 0),
    stock: Number.parseInt(document.getElementById('internal-editor-stock')?.value || '0', 10),
    description: document.getElementById('internal-editor-description')?.value.trim() || null
  };
}

async function updateInternalCatalogRelations(product, values, image) {
  const productResult = await supabaseClient.from('products').update({
    name: values.name,
    category: values.category,
    description: values.description,
    image: image.url
  }).eq('id', product.id);
  if (productResult.error) throw new Error(`No se pudo actualizar la ficha: ${productResult.error.message}`);

  const supplierResult = await supabaseClient.from('supplier_products').update({
    name: values.name,
    price: values.price,
    stock: values.stock,
    available: values.stock > 0,
    image: image.url
  }).eq('id', product.supplierRowId);
  if (supplierResult.error) throw new Error(`No se pudo actualizar precio y stock: ${supplierResult.error.message}`);

  if (product.draftId) {
    const draftPayload = {
      name: values.name,
      brand: values.brand,
      presentation: values.presentation,
      category: values.category,
      description: values.description,
      barcode: values.barcode,
      image_url: image.url,
      stock: values.stock,
      sale_price: values.price,
      updated_at: new Date().toISOString()
    };
    if (image.path) draftPayload.image_path = image.path;
    const draftResult = await supabaseClient.from('product_drafts').update(draftPayload).eq('id', product.draftId);
    if (draftResult.error) console.warn('No se pudo sincronizar el borrador aprobado:', draftResult.error.message);
  }
}

function updateInternalCatalogLocalLocation(product, values, imageUrl) {
  const location = readLocalProductLocations().find(item => String(item.product_code) === String(product.id));
  if (!location) return;
  saveLocalProductLocation({
    ...location,
    name: values.name,
    barcode: values.barcode,
    image_url: imageUrl,
    stock: values.stock,
    updated_at: new Date().toISOString()
  });
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
  try {
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = 'Guardando…';
    }
    const image = await uploadInternalCatalogImage(product.id, product.image);
    await updateInternalCatalogRelations(product, values, image);
    updateInternalCatalogLocalLocation(product, values, image.url);
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

const WMS_MODULES_KEY = 'boeweb_wms_store_modules_v1';
const WMS_LOCATIONS_KEY = 'boeweb_wms_inventory_locations_v1';
const WMS_MOVEMENTS_KEY = 'boeweb_wms_inventory_movements_v1';
const WMS_AUDITS_KEY = 'boeweb_wms_inventory_audits_v1';

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

function getWmsModules() {
  try {
    const raw = localStorage.getItem(WMS_MODULES_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Error al leer WMS modules:', e);
  }
  const defaultModules = [
    { code: 'PI-M01', sector_name: 'Fertilizantes y Nutrición', wall_code: 'PI', module_number: 1, max_levels: 5, description: 'Pared Izquierda - Módulo 1 (Fertilizantes orgánicos)' },
    { code: 'PI-M02', sector_name: 'Nutrición Vegetal', wall_code: 'PI', module_number: 2, max_levels: 5, description: 'Pared Izquierda - Módulo 2 (Bioestimulantes)' },
    { code: 'PI-M03', sector_name: 'Sustratos y Enmiendas', wall_code: 'PI', module_number: 3, max_levels: 5, description: 'Pared Izquierda - Módulo 3 (Sustratos Klasmann/Grow)' },
    { code: 'PI-M04', sector_name: 'Módulo Principal Botánico', wall_code: 'PI', module_number: 4, max_levels: 5, description: 'Pared Izquierda - Módulo 4 (Control de plagas)' },
    { code: 'PT-M01', sector_name: 'Luz e Iluminación Indoor', wall_code: 'PT', module_number: 1, max_levels: 5, description: 'Pared Trasera - Módulo 1 (Paneles LED y Kits)' },
    { code: 'PT-M02', sector_name: 'Ventilación y Clima', wall_code: 'PT', module_number: 2, max_levels: 5, description: 'Pared Trasera - Módulo 2 (Extractores y filtros)' },
    { code: 'PD-M01', sector_name: 'Macetas y Riego', wall_code: 'PD', module_number: 1, max_levels: 5, description: 'Pared Derecha - Módulo 1 (Macetas geotextiles)' },
    { code: 'PD-M02', sector_name: 'Accesorios de Cultivo', wall_code: 'PD', module_number: 2, max_levels: 5, description: 'Pared Derecha - Módulo 2 (Tijeras y medidores)' },
    { code: 'DEP-M01', sector_name: 'Depósito Insumos Pesados', wall_code: 'DP', module_number: 1, max_levels: 5, description: 'Depósito - Módulo 1 (Sustratos 50L en pallets)' },
    { code: 'DEP-M02', sector_name: 'Depósito Reserva General', wall_code: 'DP', module_number: 2, max_levels: 5, description: 'Depósito - Módulo 2 (Reserva de seguridad)' }
  ];
  localStorage.setItem(WMS_MODULES_KEY, JSON.stringify(defaultModules));
  return defaultModules;
}

function getWmsLocations() {
  try {
    const raw = localStorage.getItem(WMS_LOCATIONS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Error al leer WMS locations:', e);
  }
  const defaultLocations = [
    {
      id: 'wms-loc-1',
      module_code: 'PI-M04',
      product_id: 'klasmann-50l',
      product_code: '7791234001',
      name: 'Sustrato Klasmann Potground H 50L',
      barcode: '7791234001',
      human_level: 3,
      sector_position: 'C',
      quantity: 25,
      image_url: 'https://astrogrow.com.ar/wp-content/uploads/2021/04/potground-h.jpg'
    },
    {
      id: 'wms-loc-2',
      module_code: 'PD-M02',
      product_id: 'klasmann-50l',
      product_code: '7791234001',
      name: 'Sustrato Klasmann Potground H 50L',
      barcode: '7791234001',
      human_level: 2,
      sector_position: 'I',
      quantity: 10,
      image_url: 'https://astrogrow.com.ar/wp-content/uploads/2021/04/potground-h.jpg'
    },
    {
      id: 'wms-loc-3',
      module_code: 'DEP-M01',
      product_id: 'klasmann-50l',
      product_code: '7791234001',
      name: 'Sustrato Klasmann Potground H 50L',
      barcode: '7791234001',
      human_level: 5,
      sector_position: 'C',
      quantity: 3,
      image_url: 'https://astrogrow.com.ar/wp-content/uploads/2021/04/potground-h.jpg'
    },
    {
      id: 'wms-loc-4',
      module_code: 'PI-M04',
      product_id: 'top-bud-250ml',
      product_code: '7791234002',
      name: 'Top Crop Top Bud Bioestimulante 250ml',
      barcode: '7791234002',
      human_level: 4,
      sector_position: 'D',
      quantity: 14,
      image_url: 'https://astrogrow.com.ar/wp-content/uploads/2020/05/top-bud-250.jpg'
    },
    {
      id: 'wms-loc-5',
      module_code: 'PI-M01',
      product_id: 'top-bud-250ml',
      product_code: '7791234002',
      name: 'Top Crop Top Bud Bioestimulante 250ml',
      barcode: '7791234002',
      human_level: 1,
      sector_position: 'C',
      quantity: 6,
      image_url: 'https://astrogrow.com.ar/wp-content/uploads/2020/05/top-bud-250.jpg'
    },
    {
      id: 'wms-loc-6',
      module_code: 'PI-M04',
      product_id: 'mamboreta-aba-30ml',
      product_code: '7791234003',
      name: 'Mamboretá ABA Acaricida 30ml',
      barcode: '7791234003',
      human_level: 2,
      sector_position: 'I',
      quantity: 8,
      image_url: ''
    }
  ];
  localStorage.setItem(WMS_LOCATIONS_KEY, JSON.stringify(defaultLocations));
  return defaultLocations;
}

function saveWmsLocations(locations) {
  localStorage.setItem(WMS_LOCATIONS_KEY, JSON.stringify(locations));
}

function getWmsMovements() {
  try {
    const raw = localStorage.getItem(WMS_MOVEMENTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

function saveWmsMovement(movement) {
  const list = getWmsMovements();
  list.unshift(movement);
  localStorage.setItem(WMS_MOVEMENTS_KEY, JSON.stringify(list.slice(0, 200)));
}

function getWmsAudits() {
  try {
    const raw = localStorage.getItem(WMS_AUDITS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

function saveWmsAudit(audit) {
  const list = getWmsAudits();
  list.unshift(audit);
  localStorage.setItem(WMS_AUDITS_KEY, JSON.stringify(list.slice(0, 100)));
}

function closeWmsModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'none';
}

function renderWmsModulesGrid() {
  const container = document.getElementById('wms-modules-grid');
  const filterWall = (document.getElementById('wms-filter-wall-select')?.value || 'all').toUpperCase();
  if (!container) return;

  const modules = getWmsModules();
  const locations = getWmsLocations();

  const filtered = filterWall === 'ALL' ? modules : modules.filter(m => String(m.wall_code).toUpperCase() === filterWall);

  if (filtered.length === 0) {
    container.innerHTML = `<div class="location-empty-state"><p>No se encontraron módulos para esta pared.</p></div>`;
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
          <button type="button" class="wms-btn wms-btn-warning" onclick="openWmsAuditModal('${m.code}')">📋 Auditar</button>
        </div>
      </div>
    `;
  }).join('');
}

function openWmsQrScannerModal() {
  const modal = document.getElementById('wms-qr-modal');
  if (modal) modal.style.display = 'flex';
}

function confirmWmsQrScanFromSelect() {
  const select = document.getElementById('wms-demo-module-select');
  const code = select ? select.value : 'PI-M04';
  closeWmsModal('wms-qr-modal');
  openWmsModuleModal(code);
}

function openWmsModuleModal(moduleCode) {
  currentWmsModuleCode = moduleCode;
  const modal = document.getElementById('wms-module-detail-modal');
  const title = document.getElementById('wms-detail-title');
  const wallBadge = document.getElementById('wms-detail-wall');
  const container = document.getElementById('wms-module-items-container');

  const modules = getWmsModules();
  const mod = modules.find(m => m.code === moduleCode) || { code: moduleCode, sector_name: 'Módulo', wall_code: 'Pared' };

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
                  <span style="font-size: 1.2rem; font-weight: 800; color: var(--vendor-forest); display: block;">${item.quantity} u.</span>
                  <small style="color: var(--vendor-muted); font-size: 0.75rem;">Disponibles</small>
                </div>
                <button type="button" class="wms-btn wms-btn-primary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="openWmsTransferModal('${moduleCode}', '${item.product_id}', ${item.human_level}, '${item.sector_position}')">
                  ⇄ Mover
                </button>
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
  if (availableLabelEl) availableLabelEl.textContent = `Disponible: ${targetLoc.quantity} u.`;

  if (qtyInput) {
    qtyInput.max = targetLoc.quantity;
    qtyInput.value = 1;
  }

  // Populate Destination Modules
  if (destSelect) {
    const modules = getWmsModules();
    destSelect.innerHTML = modules.map(m => `
      <option value="${m.code}" ${m.code === originModuleCode ? 'disabled' : ''}>${m.code} — ${m.sector_name} (${m.wall_code})</option>
    `).join('');

    const availableModule = modules.find(m => m.code !== originModuleCode);
    if (availableModule) destSelect.value = availableModule.code;
  }

  window._wmsCurrentTransferOrigin = {
    originModuleCode,
    productId,
    humanLevel: Number(humanLevel),
    sectorPos: String(sectorPos).toUpperCase(),
    maxQty: targetLoc.quantity,
    item: targetLoc
  };

  const resultCard = document.getElementById('wms-transfer-result-card');
  const form = document.getElementById('wms-transfer-form');
  if (resultCard) resultCard.style.display = 'none';
  if (form) form.style.display = 'block';

  if (modal) modal.style.display = 'flex';
}

function triggerWmsTransferFromCurrentModule() {
  const locations = getWmsLocations().filter(loc => loc.module_code === currentWmsModuleCode && loc.quantity > 0);
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
  const destLevelSelect = document.getElementById('wms-tr-dest-level');
  const destSectorSelect = document.getElementById('wms-tr-dest-sector');

  const transferQty = Number(qtyInput?.value) || 0;
  const destModuleCode = destSelect?.value;
  const destLevel = Number(destLevelSelect?.value) || 3;
  const destSector = String(destSectorSelect?.value || 'C').toUpperCase();

  const activeVendor = localStorage.getItem('boeweb_vendor_name') || 'Vendedor Local';

  // ATOMIC VALIDATIONS
  if (transferQty <= 0) {
    showToast('❌ La cantidad a mover debe ser mayor a cero.');
    return;
  }

  if (transferQty > originState.maxQty) {
    showToast(`❌ Stock insuficiente en origen: sólo quedan ${originState.maxQty} unidades.`);
    return;
  }

  if (originState.originModuleCode === destModuleCode && 
      originState.humanLevel === destLevel && 
      originState.sectorPos === destSector) {
    showToast('❌ El módulo y posición de origen y destino no pueden ser idénticos.');
    return;
  }

  try {
    const locations = getWmsLocations();
    const originIdx = locations.findIndex(loc => 
      loc.module_code === originState.originModuleCode &&
      loc.product_id === originState.productId &&
      Number(loc.human_level) === originState.humanLevel &&
      String(loc.sector_position).toUpperCase() === originState.sectorPos
    );

    if (originIdx === -1 || locations[originIdx].quantity < transferQty) {
      showToast('❌ Error de concurrencia: El stock de origen fue modificado.');
      return;
    }

    // Decrement Origin
    locations[originIdx].quantity -= transferQty;
    const originItem = locations[originIdx];

    // Remove empty origin row
    if (locations[originIdx].quantity <= 0) {
      locations.splice(originIdx, 1);
    }

    // Increment/Upsert Destination
    const destIdx = locations.findIndex(loc =>
      loc.module_code === destModuleCode &&
      loc.product_id === originState.productId &&
      Number(loc.human_level) === destLevel &&
      String(loc.sector_position).toUpperCase() === destSector
    );

    if (destIdx !== -1) {
      locations[destIdx].quantity += transferQty;
    } else {
      locations.push({
        id: `wms-loc-${Date.now()}`,
        module_code: destModuleCode,
        product_id: originState.productId,
        product_code: originItem.product_code,
        name: originItem.name,
        barcode: originItem.barcode,
        image_url: originItem.image_url,
        human_level: destLevel,
        sector_position: destSector,
        quantity: transferQty
      });
    }

    saveWmsLocations(locations);

    // Record Append-Only Movement Log
    const movementRecord = {
      id: `wms-mov-${Date.now()}`,
      movement_type: 'TRANSFERENCIA',
      product_id: originState.productId,
      product_name: originItem.name,
      quantity: transferQty,
      origin_module_code: originState.originModuleCode,
      origin_level: originState.humanLevel,
      origin_sector: originState.sectorPos,
      destination_module_code: destModuleCode,
      destination_level: destLevel,
      destination_sector: destSector,
      user_name: activeVendor,
      timestamp: new Date().toISOString()
    };
    saveWmsMovement(movementRecord);

    // Show Confirmation Receipt Card
    const form = document.getElementById('wms-transfer-form');
    const resultCard = document.getElementById('wms-transfer-result-card');
    if (form) form.style.display = 'none';

    if (resultCard) {
      resultCard.style.display = 'block';
      resultCard.innerHTML = `
        <div class="wms-receipt-card">
          <div class="wms-receipt-title">✅ MOVIMIENTO COMPLETADO</div>
          <div class="wms-receipt-row"><span>Producto:</span><strong>${originItem.name}</strong></div>
          <div class="wms-receipt-row"><span>Cantidad:</span><strong>${transferQty} unidades</strong></div>
          <div class="wms-receipt-row"><span>Origen:</span><strong>${originState.originModuleCode} (${getHumanLevelLabel(originState.humanLevel)})</strong></div>
          <div class="wms-receipt-row"><span>Destino:</span><strong>${destModuleCode} (${getHumanLevelLabel(destLevel)})</strong></div>
          <div class="wms-receipt-row"><span>Operador:</span><strong>${activeVendor}</strong></div>
          <div class="wms-receipt-row"><span>Fecha / Hora:</span><strong>${new Date().toLocaleTimeString()}</strong></div>
          <button type="button" class="wms-btn wms-btn-primary" style="width: 100%; margin-top: 16px;" onclick="closeWmsModal('wms-transfer-modal'); openWmsModuleModal('${destModuleCode}');">
            👁️ VER CONTENIDO DEL DESTINO (${destModuleCode})
          </button>
        </div>
      `;
    }

    showToast(`✅ Transferidos ${transferQty} u. a ${destModuleCode}`);

  } catch (err) {
    console.error('Error al ejecutar transferencia WMS:', err);
    showToast(`❌ Error: ${err.message}`);
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

function submitWmsAuditWithStatus(forcedStatus) {
  const activeVendor = localStorage.getItem('boeweb_vendor_name') || 'Vendedor Local';
  const locations = getWmsLocations().filter(loc => loc.module_code === currentWmsModuleCode && loc.quantity > 0);

  const auditRecord = {
    id: `wms-audit-${Date.now()}`,
    module_code: currentWmsModuleCode,
    auditor_user: activeVendor,
    status: forcedStatus || 'CORRECTO',
    timestamp: new Date().toISOString(),
    items: locations.map((loc, idx) => {
      const input = document.getElementById(`wms-audit-qty-${idx}`);
      const foundQty = input ? Number(input.value) : loc.quantity;
      return {
        product_id: loc.product_id,
        name: loc.name,
        expected_qty: loc.quantity,
        found_qty: foundQty,
        difference: foundQty - loc.quantity,
        human_level: loc.human_level,
        sector_position: loc.sector_position
      };
    })
  };

  saveWmsAudit(auditRecord);

  // Record Audit Movement Log
  saveWmsMovement({
    id: `wms-mov-${Date.now()}`,
    movement_type: 'AJUSTE_AUDITORIA',
    product_id: currentWmsModuleCode,
    product_name: `Auditoría Módulo ${currentWmsModuleCode}`,
    quantity: locations.length,
    origin_module_code: currentWmsModuleCode,
    destination_module_code: currentWmsModuleCode,
    user_name: activeVendor,
    timestamp: new Date().toISOString(),
    notes: `Estado: ${auditRecord.status}`
  });

  const notice = document.getElementById('wms-audit-result-notice');
  if (notice) {
    notice.style.display = 'block';
    notice.innerHTML = `
      <strong>📋 Auditoría Registrada (${auditRecord.status}):</strong> 
      Se guardó el control del Módulo ${currentWmsModuleCode}. 
      <br><small><strong>REGLA DE SEGURIDAD:</strong> El stock comercial y las cantidades de producción NO sufren alteraciones automáticas.</small>
    `;
  }

  showToast(`📋 Auditoría de ${currentWmsModuleCode} registrada correctamente.`);
}

function handleWmsAuditSubmit(event) {
  event.preventDefault();
  submitWmsAuditWithStatus('PENDIENTE_APROBACION');
}

function openWmsMovementsHistoryModal() {
  const modal = document.getElementById('wms-history-modal');
  const container = document.getElementById('wms-history-table-container');

  const movements = getWmsMovements();

  if (!container) return;

  if (movements.length === 0) {
    container.innerHTML = `
      <div class="location-empty-state">
        <p>No se registraron movimientos en esta sesión.</p>
      </div>
    `;
  } else {
    container.innerHTML = `
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
    `;
  }

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

function openSaasLoginModal() {
  const modal = document.getElementById('saas-login-modal');
  if (modal) modal.style.display = 'flex';
}

function handleSaasLoginSubmit(event) {
  event.preventDefault();
  const tenantId = document.getElementById('saas-login-tenant')?.value;
  const name = document.getElementById('saas-login-name')?.value;
  const email = document.getElementById('saas-login-email')?.value;
  const role = document.getElementById('saas-login-role')?.value;

  if (typeof SaasAuth !== 'undefined') {
    SaasAuth.loginAsUser(name, email, role, tenantId);
  }

  closeWmsModal('saas-login-modal');
  updateSaasHeaderUI();
  if (typeof renderWmsModulesGrid === 'function') {
    renderWmsModulesGrid();
  }
  showToast(`✅ Sesión SaaS iniciada como ${name} (${role}) en ${SaasAuth.getTenantContext().tenantName}`);
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

async function initPosWorkspace() {
  populatePosSalespeople();

  const cashierDisplay = document.getElementById('pos-cashier-display');
  if (cashierDisplay && typeof SaasAuth !== 'undefined') {
    const ctx = SaasAuth.getTenantContext();
    cashierDisplay.textContent = `${ctx.userName} (${ctx.roleName})`;
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

        inputDebounce = setTimeout(() => {
          renderPosSearchResults(query.trim());
        }, 150);
      });

      unifiedInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handlePosBarcodeOrDirectSearch(unifiedInput.value.trim());
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
}

function populatePosSalespeople() {
  const select = document.getElementById('pos-salesperson-select');
  if (!select) return;

  const verifiedUsers = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantUsers() : [];
  const activeVendor = sessionStorage.getItem('boeweb_vendor_name')
    || localStorage.getItem('boeweb_vendor_name')
    || 'Vendedor';
  const users = verifiedUsers.length > 0 ? verifiedUsers : [{
    id: `legacy-${activeVendor.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: activeVendor,
    role: 'VENDEDOR'
  }];

  select.innerHTML = users.map(user => {
    const id = escapeStockHtml(user.id || user.user_id || 'vendedor');
    const name = escapeStockHtml(user.name || 'Vendedor');
    const role = escapeStockHtml(user.role || 'VENDEDOR');
    return `<option value="${id}">${name} (${role})</option>`;
  }).join('');
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
}

function handlePosBarcodeOrDirectSearch(rawQuery) {
  if (!rawQuery) return;
  const clean = String(rawQuery).trim().toLowerCase();

  const prods = (typeof internalCatalogProducts !== 'undefined' && Array.isArray(internalCatalogProducts) && internalCatalogProducts.length > 0)
    ? internalCatalogProducts
    : JSON.parse(localStorage.getItem('boeweb_internal_catalog') || '[]');

  // 1. Coincidencia exacta por código de barras, SKU o ID
  const exactMatch = prods.find(p =>
    (p.barcode && String(p.barcode).trim().toLowerCase() === clean) ||
    (p.product_code && String(p.product_code).trim().toLowerCase() === clean) ||
    (p.id && String(p.id).trim().toLowerCase() === clean)
  );

  if (exactMatch) {
    if (Number(exactMatch.stock || 0) <= 0) {
      alert(`⚠️ El producto "${exactMatch.name}" está AGOTADO (Stock: 0). No se puede vender.`);
      return;
    }
    showPosProductConfirmModal(exactMatch);
    const unifiedInput = document.getElementById('pos-unified-search');
    if (unifiedInput) {
      unifiedInput.value = '';
      const clearBtn = document.getElementById('pos-search-clear-btn');
      if (clearBtn) clearBtn.style.display = 'none';
      renderPosSearchResults('');
    }
    return;
  }

  // 2. Si no hay coincidencia exacta de código pero hay una sola coincidencia en la búsqueda activa
  const matches = prods.filter(p => {
    const text = [p.name, p.brand, p.presentation, p.category, p.id, p.barcode, p.product_code].filter(Boolean).join(' ').toLowerCase();
    return text.includes(clean);
  });

  if (matches.length === 1) {
    const singleMatch = matches[0];
    if (Number(singleMatch.stock || 0) <= 0) {
      alert(`⚠️ El producto "${singleMatch.name}" está AGOTADO (Stock: 0). No se puede vender.`);
      return;
    }
    showPosProductConfirmModal(singleMatch);
    const unifiedInput = document.getElementById('pos-unified-search');
    if (unifiedInput) {
      unifiedInput.value = '';
      const clearBtn = document.getElementById('pos-search-clear-btn');
      if (clearBtn) clearBtn.style.display = 'none';
      renderPosSearchResults('');
    }
  } else if (matches.length === 0) {
    alert(`Producto no encontrado en el catálogo interno para el código o búsqueda "${rawQuery}".`);
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

  const prods = (typeof internalCatalogProducts !== 'undefined' && Array.isArray(internalCatalogProducts) && internalCatalogProducts.length > 0)
    ? internalCatalogProducts
    : JSON.parse(localStorage.getItem('boeweb_internal_catalog') || '[]');

  const cleanQuery = (query || '').toLowerCase().trim();

  const filtered = prods.filter(p => {
    if (!cleanQuery) return true;
    const text = [p.name, p.brand, p.presentation, p.category, p.id, p.barcode, p.product_code].filter(Boolean).join(' ').toLowerCase();
    return text.includes(cleanQuery);
  });

  if (countBadge) {
    countBadge.textContent = cleanQuery
      ? `${filtered.length} coincidencias (Catálogo interno)`
      : `${prods.length} productos en catálogo interno`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 30px 15px; color: var(--color-text-muted); background: rgba(21,45,36,0.02); border-radius: 12px; border: 1px dashed var(--color-border-subtle);">
        <span style="font-size: 2rem; display: block; margin-bottom: 6px;">🔍</span>
        <strong style="display: block; font-size: 0.95rem; margin-bottom: 4px; color: var(--color-text-main);">Sin coincidencias en el catálogo interno</strong>
        <p style="margin: 0; font-size: 0.8rem;">Verificá el código o nombre. Recordá que sólo podés vender productos propios registrados en la tienda.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const stockVal = Number(p.stock !== undefined ? p.stock : (p.own_stock || 0));
    const isOutOfStock = stockVal <= 0;
    const prodImg = p.image || p.image_url || 'assets/logo.jpg';
    const prodPrice = Number(p.price || 0);
    const prodId = escapeStockHtml(String(p.id || p.product_code));
    const safeName = escapeStockHtml(p.name || 'Producto');
    const safeCat = escapeStockHtml(p.category || 'Venta mostrador');

    return `
      <div class="pos-product-card ${isOutOfStock ? 'pos-product-card-out' : ''}">
        <div>
          <img src="${prodImg}" alt="${safeName}" class="pos-product-img" loading="lazy" onerror="this.src='assets/logo.jpg'">
          <span class="pos-product-category">${safeCat}</span>
          <strong class="pos-product-name" title="${safeName}">${safeName}</strong>
          <div class="pos-product-meta">
            ${p.barcode ? `<span>Cód: ${p.barcode}</span>` : `<span>ID: ${prodId}</span>`}
          </div>
        </div>

        <div>
          <div class="pos-product-price">$${prodPrice.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
          <div class="pos-stock-badge ${isOutOfStock ? 'pos-stock-badge-out' : 'pos-stock-badge-available'}">
            ${isOutOfStock ? '🔴 Agotado / Sin stock' : `🟢 ${stockVal} u. disponibles`}
          </div>

          <button type="button" 
                  class="pos-add-btn" 
                  ${isOutOfStock ? 'disabled' : ''} 
                  onclick="openPosProductModalById('${prodId}')">
            ${isOutOfStock ? '✕ Sin Stock' : '+ Seleccionar'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function openPosProductModalById(productId) {
  const prods = (typeof internalCatalogProducts !== 'undefined' && Array.isArray(internalCatalogProducts) && internalCatalogProducts.length > 0)
    ? internalCatalogProducts
    : JSON.parse(localStorage.getItem('boeweb_internal_catalog') || '[]');

  const product = prods.find(p => String(p.id) === String(productId) || String(p.product_code) === String(productId));
  if (product) {
    showPosProductConfirmModal(product);
  }
}

function showPosProductConfirmModal(product) {
  if (!product) return;
  posScanPendingProduct = product;

  const stockVal = Number(product.stock !== undefined ? product.stock : (product.own_stock || 0));
  if (stockVal <= 0) {
    alert(`⚠️ El producto "${product.name}" está agotado en el stock interno.`);
    return;
  }

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

  if (imgEl) imgEl.src = product.image || product.image_url || 'assets/logo.jpg';
  if (catEl) catEl.textContent = product.category || 'Catálogo Interno';
  if (nameEl) nameEl.textContent = product.name || 'Producto';
  if (codeEl) codeEl.textContent = product.barcode || product.product_code || product.id || 'N/A';
  if (stockEl) {
    stockEl.textContent = `${stockVal} u. disponibles`;
    stockEl.className = 'pos-stock-badge pos-stock-badge-available';
  }
  if (priceEl) priceEl.textContent = `$${Number(product.price || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
  if (qtyInput) {
    qtyInput.value = '1';
    qtyInput.max = stockVal;
  }
  if (qtyError) {
    qtyError.style.display = 'none';
    qtyError.textContent = '';
  }

  let locLabel = '📍 Sin ubicación asignada';
  if (typeof readLocalProductLocations === 'function') {
    const locs = readLocalProductLocations();
    const found = locs.find(l => l.product_code === product.id || l.product_code === product.product_code || l.barcode === product.barcode);
    if (found && found.shelf_code) {
      locLabel = `📍 Estante: ${found.shelf_code} (Piso ${found.floor_level || 1}, Nivel ${found.shelf_level || 2})`;
    }
  }
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
  const maxStock = Number(posScanPendingProduct.stock !== undefined ? posScanPendingProduct.stock : (posScanPendingProduct.own_stock || 1));
  const nextVal = Math.min(maxStock, Math.max(1, current + delta));

  qtyInput.value = nextVal;
  validatePosModalQty(qtyInput);
}

function validatePosModalQty(input) {
  if (!posScanPendingProduct || !input) return;
  const maxStock = Number(posScanPendingProduct.stock !== undefined ? posScanPendingProduct.stock : (posScanPendingProduct.own_stock || 1));
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

  if (current > maxStock) {
    if (qtyError) {
      qtyError.textContent = `Stock insuficiente. Máximo disponible: ${maxStock} u.`;
      qtyError.style.display = 'block';
    }
    if (confirmBtn) confirmBtn.disabled = true;
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
  const maxStock = Number(posScanPendingProduct.stock !== undefined ? posScanPendingProduct.stock : (posScanPendingProduct.own_stock || 1));
  const qty = Math.min(maxStock, Math.max(1, parseInt(qtyInput?.value, 10) || 1));

  const cart = getPosCartEngine();
  if (cart) {
    cart.addItem({
      ...posScanPendingProduct,
      quantity: qty
    });
    renderPosCartItems();
    if (typeof showToast === 'function') {
      showToast(`✓ Agregado al ticket: ${qty}x ${posScanPendingProduct.name}`);
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
    cart.addItem(product);
    renderPosCartItems();
  }
}

function renderPosCartItems() {
  const cart = getPosCartEngine();
  const body = document.getElementById('pos-cart-items-body');
  const emptyState = document.getElementById('pos-cart-empty-state');
  const subtotalEl = document.getElementById('pos-summary-subtotal');
  const discountRow = document.getElementById('pos-summary-discount-row');
  const discountLabelEl = document.getElementById('pos-summary-discount-label');
  const discountEl = document.getElementById('pos-summary-discount');
  const totalEl = document.getElementById('pos-summary-total');

  if (!cart || !body) return;

  const items = cart.getItems();

  if (items.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    body.innerHTML = '';
    if (subtotalEl) subtotalEl.textContent = '$0,00';
    if (discountRow) discountRow.style.display = 'none';
    if (totalEl) totalEl.textContent = '$0,00';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  body.innerHTML = items.map(item => `
    <li style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--color-border-subtle); font-size: 0.88rem;">
      <div style="flex: 1; min-width: 0; padding-right: 8px;">
        <strong style="display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--color-text-main);">${escapeStockHtml(item.name)}</strong>
        <small style="color: var(--color-text-muted);">$${Number(item.price).toLocaleString('es-AR', { minimumFractionDigits: 2 })} c/u</small>
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
  const discountAmount = cart.getDiscountAmount();
  const total = cart.getTotal();
  const discountInfo = cart.getDiscount();

  if (subtotalEl) subtotalEl.textContent = `$${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

  if (discountRow) {
    if (discountAmount > 0) {
      discountRow.style.display = 'flex';
      if (discountLabelEl) {
        discountLabelEl.textContent = discountInfo.type === 'PERCENT'
          ? `Descuento (${discountInfo.value}%):`
          : 'Descuento ($ fijo):';
      }
      if (discountEl) {
        discountEl.textContent = `-$${discountAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
      }
    } else {
      discountRow.style.display = 'none';
    }
  }

  if (totalEl) totalEl.textContent = `$${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
}

function updatePosCartItemQty(id, qty) {
  const cart = getPosCartEngine();
  if (cart) {
    cart.updateQuantity(id, qty);
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

function handlePosDiscountChange() {
  const cart = getPosCartEngine();
  if (!cart) return;

  const typeSelect = document.getElementById('pos-discount-type');
  const valueInput = document.getElementById('pos-discount-value');

  const discType = typeSelect?.value || 'PERCENT';
  const discValue = Math.max(0, parseFloat(valueInput?.value) || 0);

  cart.setDiscount(discType, discValue);
  renderPosCartItems();
}

function clearPosDiscount() {
  const cart = getPosCartEngine();
  if (!cart) return;

  const valueInput = document.getElementById('pos-discount-value');
  if (valueInput) valueInput.value = '';

  cart.setDiscount('PERCENT', 0);
  renderPosCartItems();
}

async function submitPosSaleDraft() {
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

  const draft = cart.createSaleDraft({
    tenantId: cashierUser.tenantId || '11111111-1111-1111-1111-111111111111',
    cashierUser: { id: cashierUser.userId || cashierUser.id, name: cashierUser.userName },
    salespersonUser: { id: salespersonObj.id || salespersonObj.user_id, name: salespersonObj.name },
    paymentMethod: paymentMethodSelect?.value || 'EFECTIVO',
    notes: notesInput?.value || ''
  });

  if (draft.payment_method === 'CUENTA_CORRIENTE') {
    const ccSelect = document.getElementById('pos-current-account-select');
    const ccId = ccSelect?.value;
    if (!ccId) {
      alert('⚠️ Debés seleccionar un cliente de la lista de Cuenta Corriente para confirmar la venta fiada.');
      return;
    }
    const accounts = typeof getCurrentAccounts === 'function' ? getCurrentAccounts() : [];
    const account = accounts.find(a => a.id === ccId);
    if (!account) {
      alert('⚠️ La cuenta corriente seleccionada no existe.');
      return;
    }
    const dueDateInput = document.getElementById('pos-cc-due-date');
    if (dueDateInput?.value) {
      account.first_payment_due = dueDateInput.value;
    }
    const saleConcept = `Venta Mostrador #${draft.draft_id} (${draft.items.map(i => `${i.quantity}x ${i.name}`).join(', ')})`;
    account.current_balance = (account.current_balance || 0) + draft.total;
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
      amount: draft.total,
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
    const code = String(soldItem.product_id || soldItem.id);
    const qty = soldItem.quantity;

    if (typeof internalCatalogProducts !== 'undefined' && Array.isArray(internalCatalogProducts)) {
      const intP = internalCatalogProducts.find(prod => String(prod.id) === code || String(prod.product_code) === code || prod.barcode === code);
      if (intP) {
        const prev = Number(intP.stock || 0);
        intP.stock = Math.max(0, prev - qty);
        stockChanges.push(`${intP.name}: de ${prev} u. a ${intP.stock} u.`);
      }
    }

    if (typeof readLocalProductLocations === 'function' && typeof saveLocalProductLocation === 'function') {
      const locs = readLocalProductLocations();
      const loc = locs.find(l => String(l.product_code) === code || l.barcode === code);
      if (loc) {
        loc.stock = Math.max(0, Number(loc.stock || 0) - qty);
        saveLocalProductLocation(loc);
      }
    }
  });

  try {
    localStorage.setItem('boeweb_internal_catalog', JSON.stringify(internalCatalogProducts));
  } catch (_) {}

  try {
    const today = getTodayDateKey();
    const cashData = getVendorCashData(today);
    cashData.sales.push({
      id: draft.draft_id,
      amount: draft.total,
      time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      paymentMethod: draft.payment_method,
      seller: draft.salesperson_name_snapshot,
      itemsSummary: draft.items.map(i => `${i.quantity}x ${i.name}`).join(', ')
    });
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
  clearPosDiscount();
  renderPosCartItems();
  renderPosSearchResults('');
  if (typeof renderStockProducts === 'function') renderStockProducts();
  if (typeof renderInternalCatalogGrid === 'function') renderInternalCatalogGrid();
  if (typeof renderVendorHomeUI === 'function') renderVendorHomeUI();
  switchVendorTab('home');
}

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
  const rawStored = JSON.parse(localStorage.getItem('boeweb_web_orders') || localStorage.getItem('boeweb_order_history') || '[]');
  const combined = (webOrdersList.length > 0 ? webOrdersList : rawStored);
  const pendingCount = combined.filter(o => {
    const st = String(o.status || '').toLowerCase();
    return !st.includes('completado') && !st.includes('entregado') && !st.includes('cancelado');
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
}

async function loadWebOrders(forceReload = false) {
  const listEl = document.getElementById('web-orders-list');
  if (!listEl) return;

  setWebOrdersStatus('Cargando pedidos de la tienda online...', 'loading');

  let localOrders = [];
  try {
    const w1 = JSON.parse(localStorage.getItem('boeweb_web_orders') || '[]');
    const w2 = JSON.parse(localStorage.getItem('boeweb_order_history') || '[]');
    localOrders = [...w1, ...w2];
  } catch (_) {
    localOrders = [];
  }

  let remoteOrders = [];
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        remoteOrders = data.map(r => ({
          id: r.order_id || r.id,
          order_id: r.order_id || r.id,
          customer_name: r.customer_name || 'Cliente Web',
          customer_phone: r.customer_phone || '',
          delivery_type: r.delivery_type || 'store_pickup',
          payment_method: r.payment_method || 'Efectivo / Transferencia',
          total: Number(r.total_amount || r.total || 0),
          total_amount: Number(r.total_amount || r.total || 0),
          status: r.status || 'Pendiente Vendedor',
          notes: r.notes || '',
          items: r.items_json || r.items || [],
          created_at: r.created_at || new Date().toISOString(),
          date: r.created_at || new Date().toISOString()
        }));
      }
    } catch (sbErr) {
      console.warn('Aviso al leer pedidos de Supabase:', sbErr);
    }
  }

  // Merge and deduplicate by ID
  const map = new Map();
  remoteOrders.forEach(o => map.set(String(o.order_id || o.id), o));
  localOrders.forEach(o => {
    const key = String(o.order_id || o.id);
    if (!map.has(key)) {
      map.set(key, o);
    }
  });

  webOrdersList = Array.from(map.values()).sort((a, b) => {
    return new Date(b.created_at || b.date || 0) - new Date(a.created_at || a.date || 0);
  });

  try {
    localStorage.setItem('boeweb_web_orders', JSON.stringify(webOrdersList));
  } catch (_) {}

  refreshWebOrdersBadges();
  renderWebOrders();
  setWebOrdersStatus('');
}

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

  const locations = typeof readLocalProductLocations === 'function' ? readLocalProductLocations() : [];

  const filtered = webOrdersList.filter(order => {
    const query = webOrdersFilterQuery;
    const matchesQuery = !query ||
      String(order.id || order.order_id || '').toLowerCase().includes(query) ||
      String(order.customer_name || order.name || '').toLowerCase().includes(query) ||
      String(order.customer_phone || order.phone || '').toLowerCase().includes(query);

    const st = String(order.status || '').toLowerCase();
    let matchesStatus = true;
    if (webOrdersFilterStatus === 'PENDING') {
      matchesStatus = st.includes('pendiente');
    } else if (webOrdersFilterStatus === 'IN_PREPARATION') {
      matchesStatus = st.includes('preparaci');
    } else if (webOrdersFilterStatus === 'READY') {
      matchesStatus = st.includes('listo') || st.includes('retiro');
    } else if (webOrdersFilterStatus === 'COMPLETED') {
      matchesStatus = st.includes('completado') || st.includes('entregado');
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
    const delivery = order.delivery_type === 'shipping' || order.deliveryType === 'shipping'
      ? `🚚 Envío a domicilio: ${order.address || 'Sin dirección'}`
      : '🏬 Retiro por el local';
    const payment = order.payment_method || order.paymentMethod || 'Efectivo / Transferencia';
    const total = Number(order.total_amount || order.total || 0);
    const dateStr = order.created_at || order.date
      ? new Date(order.created_at || order.date).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
      : 'Reciente';
    const status = order.status || 'Pendiente Vendedor';

    let statusBadgeColor = '#ffb74d';
    let statusBg = 'rgba(255,183,77,0.15)';
    const statusLower = status.toLowerCase();
    if (statusLower.includes('comprobado') || statusLower.includes('pago aprobado') || statusLower.includes('pago verificado') || statusLower.includes('pagado')) {
      statusBadgeColor = '#25d366';
      statusBg = 'rgba(37,211,102,0.18)';
    } else if (statusLower.includes('completado') || statusLower.includes('entregado')) {
      statusBadgeColor = '#66bb6a';
      statusBg = 'rgba(102,187,106,0.15)';
    } else if (statusLower.includes('preparaci')) {
      statusBadgeColor = '#42a5f5';
      statusBg = 'rgba(66,165,245,0.15)';
    } else if (statusLower.includes('listo')) {
      statusBadgeColor = '#ab47bc';
      statusBg = 'rgba(171,71,188,0.15)';
    }

    const items = order.items || order.items_json || [];

    const itemsHtml = items.map(item => {
      const pCode = item.product_code || item.id || '';
      const foundLoc = locations.find(l => String(l.product_code) === String(pCode) || String(l.barcode) === String(pCode));
      const locText = foundLoc && foundLoc.shelf_code
        ? `📍 ${foundLoc.shelf_code} (Nivel ${foundLoc.shelf_level || 1})`
        : '📍 Sin ubicación asignada';

      return `
        <li style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px dashed rgba(255,255,255,0.08); font-size: 0.85rem;">
          <div style="flex: 1;">
            <strong>${item.quantity}x ${item.name}</strong>
            <div style="font-size: 0.74rem; color: #42a5f5; margin-top: 2px;">${locText}</div>
          </div>
          <span style="font-weight: 700; color: var(--color-accent-gold);">$${Number((item.price || 0) * (item.quantity || 1)).toLocaleString('es-AR')}</span>
        </li>
      `;
    }).join('');

    const waLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`¡Hola ${customerName}! Te escribimos de BÔ Grow Club respecto a tu pedido #${orderId}.`)}` : '#';

    return `
      <article class="web-order-card" style="background: var(--color-card-bg); border: 1.5px solid var(--color-border-subtle); border-radius: 16px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between; gap: 14px; box-shadow: var(--shadow-sm); transition: transform 0.2s ease;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
            <div>
              <span style="font-size: 0.75rem; color: var(--color-text-muted); font-weight: 700;">ORDEN WEB</span>
              <h3 style="margin: 0; font-size: 1.15rem; color: var(--color-accent-gold); font-family: var(--font-display);">${orderId}</h3>
              <small style="color: var(--color-text-muted); font-size: 0.75rem;">📅 ${dateStr}</small>
            </div>
            <span style="font-size: 0.75rem; font-weight: 800; color: ${statusBadgeColor}; background: ${statusBg}; border: 1px solid ${statusBadgeColor}; padding: 4px 10px; border-radius: 12px; text-transform: uppercase;">
              ${status}
            </span>
          </div>

          <div style="background: rgba(0,0,0,0.15); border-radius: 10px; padding: 10px 12px; margin-bottom: 12px; font-size: 0.85rem; line-height: 1.4;">
            <div>👤 <strong>${customerName}</strong></div>
            ${customerPhone ? `<div>📞 <a href="${waLink}" target="_blank" style="color: #25d366; text-decoration: none; font-weight: 700;">${customerPhone} (WhatsApp)</a></div>` : ''}
            <div>${delivery}</div>
            <div>💳 Método: <strong>${payment}</strong></div>
            ${order.notes ? `<div style="margin-top: 4px; color: var(--color-accent-gold); font-style: italic;">💬 "${order.notes}"</div>` : ''}
          </div>

          <div style="margin-bottom: 10px;">
            <span style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--color-accent-gold); display: block; margin-bottom: 4px;">📦 Artículos & Picking:</span>
            <ul style="list-style: none; padding: 0; margin: 0;">
              ${itemsHtml}
            </ul>
          </div>
        </div>

        <div style="border-top: 1px solid var(--color-border-accent); padding-top: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <span style="font-size: 0.9rem; font-weight: 700;">Total a Cobrar:</span>
            <strong style="font-size: 1.3rem; color: var(--color-accent-gold); font-weight: 900;">$${total.toLocaleString('es-AR')}</strong>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <button type="button" class="btn btn-primary" onclick="loadWebOrderToPos('${orderId}')" style="grid-column: 1 / -1; padding: 10px; font-weight: 800; font-size: 0.88rem; background: #2e7d32; border-color: #2e7d32; color: #fff; border-radius: 10px; cursor: pointer;">
              💳 Pasar a Caja POS / Cobrar
            </button>
            <button type="button" class="btn btn-secondary" onclick="updateWebOrderStatus('${orderId}', 'Pago Comprobado')" style="padding: 6px 8px; font-size: 0.75rem; border-radius: 8px; cursor: pointer; color: #25d366; border-color: #25d366; font-weight: 700;">
              ✅ Pago Comprobado
            </button>
            <button type="button" class="btn btn-secondary" onclick="updateWebOrderStatus('${orderId}', 'En Preparación')" style="padding: 6px 8px; font-size: 0.75rem; border-radius: 8px; cursor: pointer;">
              📋 En Preparación
            </button>
            <button type="button" class="btn btn-secondary" onclick="updateWebOrderStatus('${orderId}', 'Listo para Retiro')" style="padding: 6px 8px; font-size: 0.75rem; border-radius: 8px; cursor: pointer; color: #ab47bc; border-color: #ab47bc;">
              🟢 Listo para Retiro
            </button>
            <button type="button" class="btn btn-secondary" onclick="updateWebOrderStatus('${orderId}', 'Completado')" style="padding: 6px 8px; font-size: 0.75rem; border-radius: 8px; cursor: pointer; color: #66bb6a; border-color: #66bb6a;">
              ✓ Completado
            </button>
            <button type="button" class="btn btn-secondary" onclick="sendWebOrderWhatsApp('${orderId}')" style="grid-column: 1 / -1; padding: 6px 8px; font-size: 0.75rem; border-radius: 8px; cursor: pointer; color: #25d366; border-color: #25d366;">
              💬 Notificar WhatsApp
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function loadWebOrderToPos(orderId) {
  const order = webOrdersList.find(o => (o.id || o.order_id) === orderId);
  if (!order) {
    alert(`Pedido #${orderId} no encontrado.`);
    return;
  }

  const cart = typeof getPosCartEngine === 'function' ? getPosCartEngine() : null;
  if (!cart) {
    alert('Motor de carrito POS no disponible.');
    return;
  }

  cart.clear();
  const items = order.items || order.items_json || [];
  items.forEach(item => {
    cart.addItem({
      id: item.id || item.product_code,
      product_code: item.product_code || item.id,
      name: item.name,
      price: Number(item.price) || 0,
      quantity: Number(item.quantity) || 1
    });
  });

  const notesInput = document.getElementById('pos-notes-input');
  if (notesInput) {
    notesInput.value = `Pedido Web #${orderId} (${order.customer_name || order.name || 'Cliente'})`;
  }

  switchVendorTab('pos');
  renderPosCartItems();
  if (window.showToast) window.showToast(`✓ Pedido #${orderId} cargado en Caja POS para cobrar.`);
}

async function updateWebOrderStatus(orderId, newStatus) {
  const order = webOrdersList.find(o => (o.id || o.order_id) === orderId);
  if (order) {
    order.status = newStatus;
    try {
      localStorage.setItem('boeweb_web_orders', JSON.stringify(webOrdersList));
    } catch (_) {}

    if (supabaseClient) {
      try {
        await supabaseClient
          .from('orders')
          .update({ status: newStatus })
          .eq('order_id', orderId);
      } catch (err) {
        console.warn('Aviso al actualizar estado remoto:', err);
      }
    }

    refreshWebOrdersBadges();
    renderWebOrders();
    if (window.showToast) window.showToast(`✓ Estado actualizado: ${newStatus}`);
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

function applyPromoForExpiringProduct(productId) {
  const p = (internalCatalogProducts || []).find(prod => String(prod.id) === String(productId));
  if (!p) return;
  const promoDiscount = 20; // 20% liquidación
  const originalPrice = Number(p.price || 0);
  const newPrice = Math.round(originalPrice * (1 - promoDiscount / 100));

  const authContext = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : { isSuperadmin: false };
  const activeVendor = localStorage.getItem('boeweb_vendor_name') || 'Vendedor';
  const quota = canVendorAdjustPrice(activeVendor, authContext.isSuperadmin);

  if (!quota.allowed) {
    alert(`⚠️ Límite de modificaciones de precio diario alcanzado (5 de 5 hoy).\nPara este turno se mantendrá el precio fijado.`);
    return;
  }

  if (confirm(`¿Aplicar descuento de liquidación por vencimiento del ${promoDiscount}% a "${p.name}"?\nPrecio actual: $${originalPrice} -> Nuevo precio: $${newPrice}`)) {
    p.price = newPrice;
    recordVendorPriceAdjustment(activeVendor, authContext.isSuperadmin);
    try {
      localStorage.setItem('boeweb_internal_catalog', JSON.stringify(internalCatalogProducts));
    } catch (_) {}
    renderExpirationsSection();
    if (window.showToast) window.showToast(`✓ Promo liquidación aplicada ($${newPrice})`);
  }
}

/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — MÓDULO 2: OTRAS TIENDAS CERCA & INGESTA IA
   ==========================================================================
   Red de alianzas con growshops y proveedores locales para entregas en 2 días.
   ========================================================================== */

function getNearbyStores() {
  try {
    const stored = localStorage.getItem('boeweb_nearby_stores');
    if (stored) return JSON.parse(stored);
  } catch (_) {}
  return [
    {
      id: 'store_local_1',
      name: 'Growshop Paraná Centro',
      phone: '5493434675428',
      address: 'Urquiza y San Martín, Paraná',
      markup: 30,
      catalog: [
        { id: 'loc_1', product_code: 'LOC-BIO-01', name: 'BioBizz Bio Bloom 500 ml', price: 16000, public_price: 20800, stock: 4, category: 'Fertilizantes' },
        { id: 'loc_2', product_code: 'LOC-SUS-50', name: 'Sustrato Growers Original 50 L', price: 12500, public_price: 16250, stock: 12, category: 'Sustratos' }
      ]
    }
  ];
}

function saveNearbyStore(store) {
  const stores = getNearbyStores();
  const existingIdx = stores.findIndex(s => s.id === store.id);
  if (existingIdx >= 0) {
    stores[existingIdx] = store;
  } else {
    stores.push(store);
  }
  localStorage.setItem('boeweb_nearby_stores', JSON.stringify(stores));

  // Sync unified nearby products
  const flatCatalog = [];
  stores.forEach(s => {
    (s.catalog || []).forEach(item => {
      flatCatalog.push({
        ...item,
        store_id: s.id,
        store_name: s.name,
        phone: s.phone,
        delivery_days: 2
      });
    });
  });
  localStorage.setItem('boeweb_nearby_stores_catalog', JSON.stringify(flatCatalog));
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
        <p>No hay productos cargados en esta tienda cercana aún.</p>
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
        <span>Costo Tienda: <strong>$${Number(p.price || 0).toLocaleString('es-AR')}</strong></span> · 
        <span>Público Web: <strong style="color: var(--color-accent-gold);">$${Number(p.public_price || 0).toLocaleString('es-AR')}</strong></span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 0.8rem; color: #2e7d32; font-weight: 700;">Stock: ${p.stock || 0} u.</span>
        <button type="button" class="btn btn-secondary" onclick="orderNearbyProductViaWa('${p.id}', '${p.storePhone}', '${escapeStockHtml(p.name)}')" style="padding: 6px 12px; font-size: 0.78rem; border-color: #25d366; color: #25d366; font-weight: 700; border-radius: 8px;">
          💬 Pedir por WA
        </button>
      </div>
    </article>
  `).join('');
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

function handleSaveNearbyStore(event) {
  event.preventDefault();
  const name = document.getElementById('nearby-store-name').value.trim();
  const phone = document.getElementById('nearby-store-phone').value.replace(/\D/g, '');
  const address = document.getElementById('nearby-store-address').value.trim();
  const markup = Number(document.getElementById('nearby-store-markup').value) || 30;
  const rawText = document.getElementById('nearby-store-raw-catalog').value.trim();

  const storeId = 'store_' + Date.now();
  const parsedCatalog = parseNearbyStoreCatalogWithAi(rawText, markup, storeId, name, phone);

  const newStore = {
    id: storeId,
    name,
    phone,
    address,
    markup,
    catalog: parsedCatalog
  };

  saveNearbyStore(newStore);
  closeAddNearbyStoreModal();
  renderNearbyStoresSection();
  if (window.showToast) window.showToast(`✓ Tienda "${name}" agregada con ${parsedCatalog.length} productos`);
}

function parseNearbyStoreCatalogWithAi(rawText, markupPercent, storeId, storeName, phone) {
  if (!rawText) return [];
  const lines = rawText.split(/\r?\n/).filter(l => l.trim().length > 0);
  const products = [];

  lines.forEach((line, idx) => {
    // Parser inteligente: busca nombre, precio ($123 o 12300) y stock opcional (Stock: 5 o 5 u)
    const priceMatch = line.match(/\$?(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+)/g);
    let price = 10000;
    if (priceMatch && priceMatch.length > 0) {
      const cleanPrice = priceMatch[priceMatch.length - 1].replace(/\./g, '').replace(/,/g, '.');
      price = parseFloat(cleanPrice) || 10000;
    }

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
  const cleanPhone = (storePhone || '5493434675428').replace(/\D/g, '');
  const activeVendor = localStorage.getItem('boeweb_vendor_name') || 'BÔ Grow Club';
  const msg = `¡Hola! 👋 Te escribo de *BÔ Grow Club* (${activeVendor}). Queremos hacer un pedido rápido del producto: *${productName}* para coordinar entrega en 2 días. ¿Tienen disponibilidad confirmada? ¡Muchas gracias! 🌿`;
  window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
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
  let accounts = null;
  try {
    const stored = localStorage.getItem('boeweb_current_accounts');
    if (stored) accounts = JSON.parse(stored);
  } catch (_) {}

  if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
    accounts = [
      {
        id: 'CC-001',
        customer_name: 'Juan Pérez Cultivador',
        dni: '34567890',
        phone: '5493434675428',
        credit_limit: 400000,
        current_balance: 65000,
        first_payment_due: '2026-09-01',
        ledger: [
          {
            id: 'MOV-1',
            date: '2026-08-10',
            concept: 'Venta Mostrador #POS-9812',
            amount: 65000,
            type: 'DEBIT',
            balance_after: 65000,
            sale_draft_id: 'POS-9812',
            items: [
              { id: 'PROD-BIO-1', product_code: 'BIO-GROW-1L', name: 'BioBizz Bio Grow 1L', quantity: 2, unit_price: 22500, subtotal: 45000, image: 'assets/logo.jpg' },
              { id: 'PROD-SUST-1', product_code: 'SUST-GROW-20L', name: 'Sustrato Growers Original 20L', quantity: 1, unit_price: 20000, subtotal: 20000, image: 'assets/logo.jpg' }
            ]
          }
        ]
      },
      {
        id: 'CC-002',
        customer_name: 'María González Indoor',
        dni: '38123456',
        phone: '5493434112233',
        credit_limit: 600000,
        current_balance: 140000,
        first_payment_due: '2026-08-25',
        ledger: [
          {
            id: 'MOV-2',
            date: '2026-08-01',
            concept: 'Venta Mostrador #POS-9740',
            amount: 140000,
            type: 'DEBIT',
            balance_after: 140000,
            sale_draft_id: 'POS-9740',
            items: [
              { id: 'PROD-LED-1', product_code: 'LED-CITIZEN-150', name: 'Panel LED 150W Citizen CLU048', quantity: 1, unit_price: 140000, subtotal: 140000, image: 'assets/logo.jpg' }
            ]
          }
        ]
      }
    ];
  } else {
    // Ensure existing mock entries have items
    accounts.forEach(acc => {
      if (Array.isArray(acc.ledger)) {
        acc.ledger.forEach(m => {
          if (m.type === 'DEBIT' && (!m.items || m.items.length === 0)) {
            m.items = [
              { id: 'PROD-1', product_code: 'PROD-GEN', name: m.concept || 'Productos Varios BÔ', quantity: 1, unit_price: m.amount || 0, subtotal: m.amount || 0, image: 'assets/logo.jpg' }
            ];
          }
        });
      }
    });
  }
  return accounts;
}

function saveCurrentAccount(account) {
  const accounts = getCurrentAccounts();
  const idx = accounts.findIndex(a => a.id === account.id);
  if (idx >= 0) {
    accounts[idx] = account;
  } else {
    accounts.push(account);
  }
  localStorage.setItem('boeweb_current_accounts', JSON.stringify(accounts));
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
    renderVendorPortfolioUI();
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
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <span style="background: rgba(76,175,80,0.18); color: #2e7d32; border: 1px solid #4caf50; padding: 2px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 800; margin-right: 6px;">
                💵 COBRO / PAGO (${movDate})
              </span>
              <strong style="color: var(--color-text-main); font-size: 0.9rem;">${escapeStockHtml(mov.concept)}</strong>
            </div>
            <div style="text-align: right;">
              <strong style="color: #2e7d32; font-size: 1.1rem;">-$${amountFormatted}</strong>
              <span style="display: block; font-size: 0.72rem; color: var(--color-text-muted);">Saldo posterior: $${balanceAfterFormatted}</span>
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

function openNewCurrentAccountModal() {
  const modal = document.getElementById('modal-new-current-account');
  if (modal) modal.style.display = 'flex';
}

function closeNewCurrentAccountModal() {
  const modal = document.getElementById('modal-new-current-account');
  if (modal) modal.style.display = 'none';
}

function handleCreateCurrentAccount(event) {
  event.preventDefault();
  const name = document.getElementById('cc-new-name').value.trim();
  const dni = document.getElementById('cc-new-dni').value.trim();
  const phone = document.getElementById('cc-new-phone').value.replace(/\D/g, '');
  const limit = Number(document.getElementById('cc-new-limit').value) || 300000;
  const dueDate = document.getElementById('cc-new-due-date').value || null;

  const newAccount = {
    id: 'CC-' + Date.now(),
    customer_name: name,
    dni,
    phone,
    credit_limit: limit,
    current_balance: 0,
    first_payment_due: dueDate,
    ledger: []
  };

  saveCurrentAccount(newAccount);
  closeNewCurrentAccountModal();
  renderCurrentAccountsUI();
  populatePosCurrentAccountDropdown();
  if (window.showToast) window.showToast(`✓ Cuenta Corriente de "${name}" creada`);
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

function handleRecordCcPaymentSubmit(event) {
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

  const newBalance = Math.max(0, (account.current_balance || 0) - amount);
  account.current_balance = newBalance;
  if (!account.ledger) account.ledger = [];
  account.ledger.push({
    id: 'PAG-' + Date.now(),
    date: new Date().toISOString().slice(0, 10),
    concept: `Cobro Cuenta Corriente (${method}) - ${note || 'Pago a cuenta'}`,
    amount,
    type: 'CREDIT',
    balance_after: newBalance
  });

  saveCurrentAccount(account);

  // If paid in cash, add to Caja BÔ shift
  if (method === 'EFECTIVO') {
    try {
      const today = getTodayDateKey();
      const cashData = getVendorCashData(today);
      cashData.sales.push({
        id: 'CC-PAY-' + Date.now(),
        amount: amount,
        time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        paymentMethod: 'EFECTIVO',
        seller: localStorage.getItem('boeweb_vendor_name') || 'Vendedor',
        itemsSummary: `Cobro CC: ${account.customer_name}`
      });
      saveVendorCashData(cashData, today);
    } catch (_) {}
  }

  closeRecordCcPaymentModal();
  renderCurrentAccountsUI();
  if (modalCcDetailsIsOpen()) {
    renderCcDetailsMovements(account);
    const debtEl = document.getElementById('cc-details-debt-badge');
    if (debtEl) debtEl.textContent = `$${newBalance.toLocaleString('es-AR')}`;
  }
  if (window.showToast) window.showToast(`✓ Pago de $${amount.toLocaleString('es-AR')} registrado con éxito`);
}

function modalCcDetailsIsOpen() {
  const modal = document.getElementById('modal-cc-details');
  return modal && modal.style.display !== 'none';
}

function sendCcWhatsAppReminder(ccId) {
  sendCcDetailedWhatsApp(ccId);
}

function handlePosPaymentMethodChange() {
  const methodSelect = document.getElementById('pos-payment-method-select');
  const ccContainer = document.getElementById('pos-current-account-container');
  if (methodSelect && ccContainer) {
    if (methodSelect.value === 'CUENTA_CORRIENTE') {
      ccContainer.style.display = 'block';
      populatePosCurrentAccountDropdown();
    } else {
      ccContainer.style.display = 'none';
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
      handlePosBarcodeOrDirectSearch(cleanCode);
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
window.saveCurrentAccount = saveCurrentAccount;
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
window.saveCurrentAccount = saveCurrentAccount;
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

const RETIRED_PRODUCTS_STORAGE_KEY = 'boeweb_retired_products_history_v1';

function getRetiredProductsHistory() {
  try {
    return JSON.parse(localStorage.getItem(RETIRED_PRODUCTS_STORAGE_KEY) || '[]');
  } catch (err) {
    return [];
  }
}

function saveRetiredProductAdjustment(adjustment) {
  const history = getRetiredProductsHistory();
  history.unshift(adjustment);
  localStorage.setItem(RETIRED_PRODUCTS_STORAGE_KEY, JSON.stringify(history));
  return history;
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
  }
}

function adjustAdjustmentQty(delta) {
  const input = document.getElementById('adjustment-quantity');
  if (!input) return;
  const current = Math.max(1, parseInt(input.value, 10) || 1);
  const next = Math.max(1, current + delta);
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

function handleStockAdjustmentSubmit(event) {
  event.preventDefault();
  const actionType = document.getElementById('adjustment-action-type')?.value || 'remove';
  const qty = Math.max(1, parseInt(document.getElementById('adjustment-quantity')?.value, 10) || 1);
  const dateVal = document.getElementById('adjustment-date')?.value || new Date().toISOString().slice(0, 10);
  const reason = document.getElementById('adjustment-reason')?.value || 'otro';
  const notes = document.getElementById('adjustment-notes')?.value.trim() || '';

  const prodId = document.getElementById('adjustment-product-id')?.value;
  const prodCode = document.getElementById('adjustment-product-code')?.value;

  const storeLocs = (typeof window !== 'undefined' && Array.isArray(window.storeLocationProducts)) ? window.storeLocationProducts : [];
  const allProducts = [...(internalCatalogProducts || []), ...storeLocs, ...(baseProducts || [])];
  const product = currentStockAdjustmentProduct || allProducts.find(p => String(p.id) === String(prodId) || p.product_code === prodCode);

  if (!product) {
    showToast('Seleccioná un producto válido antes de guardar.');
    return;
  }

  const prevStock = Math.max(0, Number(product.stock ?? product.on_hand) || 0);
  let newStock = prevStock;
  if (actionType === 'remove') {
    newStock = Math.max(0, prevStock - qty);
  } else {
    newStock = prevStock + qty;
  }

  product.stock = newStock;
  if (Array.isArray(internalCatalogProducts)) {
    const intItem = internalCatalogProducts.find(p => String(p.id) === String(product.id) || p.product_code === product.product_code);
    if (intItem) intItem.stock = newStock;
    localStorage.setItem('boeweb_internal_catalog', JSON.stringify(internalCatalogProducts));
  }

  const reasonLabels = {
    'vendido': 'Vendido (Mostrador)',
    'defectuoso': 'Defectuoso / Roto',
    'vencido': 'Vencido',
    'otro': 'Otro motivo'
  };

  const currentVendor = localStorage.getItem('boeweb_active_vendor_name') || 'Vendedor';

  const adjustmentRecord = {
    id: `adj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    date: dateVal,
    created_at: new Date().toISOString(),
    product_id: product.id || '',
    product_code: product.product_code || '',
    product_name: product.name || 'Producto',
    barcode: product.barcode || '',
    type: actionType,
    quantity: qty,
    previous_stock: prevStock,
    new_stock: newStock,
    reason: reason,
    reason_label: reasonLabels[reason] || reason,
    notes: notes,
    vendor_name: currentVendor
  };

  saveRetiredProductAdjustment(adjustmentRecord);

  closeStockAdjustmentModal();
  showToast(actionType === 'remove' 
    ? `🗑️ Retiro registrado: -${qty} u. de "${product.name}". Nuevo stock: ${newStock} u.`
    : `📥 Stock agregado: +${qty} u. de "${product.name}". Nuevo stock: ${newStock} u.`
  );

  renderRetiredProductsUI();
  if (document.getElementById('store-map-search-result-card')?.style.display !== 'none') {
    const info = decodeHumanWmsLocation(product.product_code || product.name, product);
    renderStoreMapLocationCard(info);
  }
}

function renderRetiredProductsUI() {
  const tbody = document.getElementById('retired-products-table-body');
  const history = getRetiredProductsHistory();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

  let totalRemoved = 0;
  let damagedUnits = 0;
  let expiredUnits = 0;
  let soldUnits = 0;

  history.forEach(item => {
    const itemDate = new Date(item.date + 'T00:00:00');
    if (item.type === 'remove') {
      if (itemDate >= thirtyDaysAgo) totalRemoved += item.quantity;
      if (item.reason === 'defectuoso') damagedUnits += item.quantity;
      else if (item.reason === 'vencido') expiredUnits += item.quantity;
      else if (item.reason === 'vendido') soldUnits += item.quantity;
    }
  });

  const kpiTotal = document.getElementById('retired-kpi-total-units');
  const kpiDamaged = document.getElementById('retired-kpi-damaged-units');
  const kpiExpired = document.getElementById('retired-kpi-expired-units');
  const kpiSold = document.getElementById('retired-kpi-sold-units');

  if (kpiTotal) kpiTotal.textContent = `${totalRemoved} u.`;
  if (kpiDamaged) kpiDamaged.textContent = `${damagedUnits} u.`;
  if (kpiExpired) kpiExpired.textContent = `${expiredUnits} u.`;
  if (kpiSold) kpiSold.textContent = `${soldUnits} u.`;

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
    const movementBadge = isRemove 
      ? `<span style="color: #ef5350; font-weight: 800;">-${item.quantity} u.</span> <small style="color: var(--color-text-muted);">(${item.previous_stock} → ${item.new_stock})</small>`
      : `<span style="color: #81c784; font-weight: 800;">+${item.quantity} u.</span> <small style="color: var(--color-text-muted);">(${item.previous_stock} → ${item.new_stock})</small>`;

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
          <button type="button" onclick="revertRetiredProductAdjustment('${item.id}')" style="padding: 4px 8px; border-radius: 6px; background: rgba(255,255,255,0.08); border: 1px solid var(--color-border-subtle); color: var(--color-text-muted); font-size: 0.76rem; cursor: pointer;" title="Revertir este ajuste si fue un error">
            ↩ Deshacer
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

function revertRetiredProductAdjustment(adjustmentId) {
  if (!confirm('¿Deseás deshacer este ajuste de stock y restaurar las unidades?')) return;
  const history = getRetiredProductsHistory();
  const index = history.findIndex(h => h.id === adjustmentId);
  if (index === -1) return;

  const item = history[index];
  if (Array.isArray(internalCatalogProducts)) {
    const product = internalCatalogProducts.find(p => String(p.id) === String(item.product_id) || p.product_code === item.product_code);
    if (product) {
      if (item.type === 'remove') {
        product.stock = Math.max(0, (Number(product.stock) || 0) + item.quantity);
      } else {
        product.stock = Math.max(0, (Number(product.stock) || 0) - item.quantity);
      }
      localStorage.setItem('boeweb_internal_catalog', JSON.stringify(internalCatalogProducts));
    }
  }

  history.splice(index, 1);
  localStorage.setItem(RETIRED_PRODUCTS_STORAGE_KEY, JSON.stringify(history));
  showToast('↩ Ajuste revertido correctamente.');
  renderRetiredProductsUI();
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
window.saveRetiredProductAdjustment = saveRetiredProductAdjustment;
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
