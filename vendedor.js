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
document.addEventListener('DOMContentLoaded', () => {
  if (window.supabase) {
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  } else {
    console.error('Supabase CDN failed to load.');
    alert('Error: No se pudo cargar la librería de Supabase. Por favor, recarga la página o comprueba tu conexión.');
    return;
  }

  setupEventListeners();
  fetchB2BProducts(true); // Initial fetch (clearing grid)
  updateCartBadge();
  renderCart();
  updateCategoryCounts();
  loadPendingProductDrafts();
  initializeFastUploadForm();
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
  msg += `¡Pedido listo para procesar compra! 🌿`;

  // Encargado de compras WhatsApp Number: +54 9 381 302-3185 (5493813023185)
  const purchaseManagerPhone = "5493813023185";
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
    if (vendorNameHeader) vendorNameHeader.textContent = `🧑‍💼 Vendedor: ${activeVendor}`;
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
    const isPassValid = (typedPass === vendorData.pass.toLowerCase()) || 
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
  const draftsReviewSection = document.getElementById('vendor-drafts-review-section');

  const btnCatalog = document.getElementById('tab-btn-catalog');
  const btnMap = document.getElementById('tab-btn-map');
  const btnScan = document.getElementById('tab-btn-scan');

  const vcardCatalog = document.getElementById('vcard-catalog');
  const vcardPortfolio = document.getElementById('vcard-portfolio');
  const vcardCash = document.getElementById('vcard-cash');
  const vcardMap = document.getElementById('vcard-map');
  const vcardScan = document.getElementById('vcard-scan');
  const vcardFastUpload = document.getElementById('vcard-fastupload');
  const vcardDraftsReview = document.getElementById('vcard-draftsreview');

  const allBtns = [btnCatalog, btnMap, btnScan];
  allBtns.forEach(btn => { if (btn) btn.classList.remove('active'); });

  const allCards = [vcardCatalog, vcardPortfolio, vcardCash, vcardMap, vcardScan, vcardFastUpload, vcardDraftsReview];
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
  if (draftsReviewSection) draftsReviewSection.style.display = 'none';

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
  } else if (tab === 'map') {
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
  } else if (tab === 'fast-upload') {
    if (fastUploadSection) {
      fastUploadSection.style.display = 'block';
      targetSection = fastUploadSection;
    }
    if (vcardFastUpload) {
      vcardFastUpload.style.borderColor = 'var(--color-accent-gold)';
      vcardFastUpload.style.transform = 'scale(1.02)';
    }
    initializeFastUploadForm();
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
  }

  const activeSidebarTab = tab === 'reposicion' ? 'catalog' : tab;
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

async function loadStoreMapData(forceReload = false) {
  if (!supabaseClient || storeMapDataLoading || (storeMapDataLoaded && !forceReload)) return;
  storeMapDataLoading = true;
  try {
    const [shelvesResult, locationsResult] = await Promise.all([
      supabaseClient.from('store_shelves').select('*').order('code', { ascending: true }),
      supabaseClient.from('product_locations').select('*').order('updated_at', { ascending: false })
    ]);
    const localLocations = readLocalProductLocations();
    const remoteLocations = locationsResult.error ? [] : (locationsResult.data || []);
    const mergedByCode = new Map(localLocations.map(item => [item.product_code, item]));
    remoteLocations.forEach(item => mergedByCode.set(item.product_code, item));
    const syncLabel = shelvesResult.error || locationsResult.error
      ? 'Modo local · ejecutá la migración para sincronizar'
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

function searchShelfOnMap() {
  const input = document.getElementById('map-search-input');
  if (!input) return;
  const rawVal = input.value.trim();
  if (!rawVal) {
    renderStoreMapUI();
    return;
  }
  
  const upperVal = rawVal.toUpperCase();

  if (window.findStoreMapProduct) {
    const productMatch = window.findStoreMapProduct(rawVal);
    if (productMatch) {
      renderStoreMapUI(null, productMatch.shelfCode, productMatch.level);
      showToast(`Producto encontrado: ${productMatch.product.name} · ${productMatch.shelfCode} · nivel ${productMatch.level}.`);
      return;
    }
  }
  
  // Check for shelf pattern e.g. "A-1", "A-1 NIVEL 2", "B-2"
  const shelfMatch = upperVal.match(/([A-E])[-_]?([1-4])/);
  let targetLevel = null;
  
  if (upperVal.includes('NIVEL 3') || upperVal.includes('SUPERIOR')) targetLevel = 3;
  else if (upperVal.includes('NIVEL 2') || upperVal.includes('MEDIO')) targetLevel = 2;
  else if (upperVal.includes('NIVEL 1') || upperVal.includes('INFERIOR')) targetLevel = 1;

  if (shelfMatch) {
    const zoneCode = shelfMatch[1];
    const shelfCode = `${zoneCode}-${shelfMatch[2]}`;
    
    renderStoreMapUI(zoneCode, shelfCode, targetLevel);
    
    const levelStr = targetLevel ? ` → Nivel ${targetLevel}` : '';
    showToast(`📍 Estante ${shelfCode}${levelStr} ubicado en Zona ${zoneCode} (Planta Baja).`);
  } else {
    // Check if zone code alone e.g. "A", "B"
    const firstChar = upperVal.charAt(0);
    if (['A', 'B', 'C', 'D', 'E'].includes(firstChar)) {
      renderStoreMapUI(firstChar, `${firstChar}-1`, targetLevel);
      showToast(`📍 Zona ${firstChar} encontrada en Planta Baja.`);
    } else {
      showToast(`No encontramos "${rawVal}" entre los productos o ubicaciones registradas.`);
    }
  }
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
const pendingDraftCache = new Map();
const FAST_UPLOAD_MAX_FILE_SIZE = 25 * 1024 * 1024;
const FAST_UPLOAD_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);

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

function initializeFastUploadForm() {
  if (!fastUploadProductCode) fastUploadProductCode = createProductCode();
  updateFastUploadLocationPreview();
  renderFastUploadQr();
  const barcodeInput = document.getElementById('fastupload-barcode-input');
  if (barcodeInput && !barcodeInput.dataset.scannerReady) {
    barcodeInput.dataset.scannerReady = 'true';
    barcodeInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        showToast(`Código de barras registrado: ${barcodeInput.value.trim() || 'vacío'}.`);
      }
    });
  }
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
  input.focus();
  input.select();
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
  URL.revokeObjectURL(fastUploadPreviewUrl);
  fastUploadPreviewUrl = '';
}

function handleFastUploadPhotoChange(event) {
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

  fastUploadSelectedFile = file;
  fastUploadAiResult = null;

  const previewImg = document.getElementById('fastupload-photo-img');
  const trigger = document.getElementById('fastupload-photo-trigger');
  const previewContainer = document.getElementById('fastupload-photo-preview-container');
  const analyzeButton = document.getElementById('fastupload-ai-btn');
  const status = document.getElementById('fastupload-ai-status');

  revokeFastUploadPreviewUrl();
  fastUploadPreviewUrl = URL.createObjectURL(file);
  if (previewImg) {
    previewImg.onerror = () => {
      fastUploadSelectedFile = null;
      if (analyzeButton) analyzeButton.disabled = true;
      if (status) {
        status.hidden = false;
        status.dataset.state = 'error';
        status.textContent = 'El teléfono no pudo abrir esta imagen. Probá compartirla o guardarla como JPG y elegila nuevamente.';
      }
    };
    previewImg.onload = () => {
      previewImg.onerror = null;
      previewImg.onload = null;
    };
    previewImg.src = fastUploadPreviewUrl;
  }
  if (trigger) trigger.hidden = true;
  if (previewContainer) previewContainer.hidden = false;
  if (analyzeButton) analyzeButton.disabled = false;
  if (status) {
    status.hidden = false;
    status.dataset.state = 'ready';
    status.textContent = 'Foto lista. Tocá “Analizar foto con IA” para completar la ficha.';
  }
}

function decodeFastUploadImage(file) {
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('El navegador no pudo procesar esta foto. Probá con una imagen JPG o PNG.'));
    };
    image.src = objectUrl;
  });
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

async function compressImageFile(file, maxWidth = 1000, maxHeight = 1000, quality = 0.75) {
  const decoded = await decodeFastUploadImage(file);
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
    URL.revokeObjectURL(decoded.objectUrl);
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

function renderAiSourceLinks(result) {
  const container = document.getElementById('fastupload-source-links');
  if (!container) return;
  container.innerHTML = '';
  const candidates = [];
  if (result.product?.official_url) candidates.push({ label: 'Página oficial', url: result.product.official_url });
  (result.sources || []).forEach(source => candidates.push({ label: source.title || 'Fuente consultada', url: source.url }));
  (result.market?.results || []).slice(0, 3).forEach(item => candidates.push({ label: 'Ver referencia en Mercado Libre', url: item.permalink }));
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
    if (!fastUploadSelectedFile) {
      showToast('⚠️ Por favor sacá o elegí una foto antes de enviar.');
      return;
    }

    const stockVal = Number.parseInt(document.getElementById('fastupload-stock-input').value, 10);
    if (!Number.isFinite(stockVal) || stockVal < 0) {
      showToast('⚠️ El stock debe ser mayor o igual a 0.');
      return;
    }

    const nameVal = document.getElementById('fastupload-name-input').value.trim();
    const categoryVal = document.getElementById('fastupload-category-input').value;
    const floorVal = Number(document.getElementById('fastupload-floor-input').value || 1);
    const shelfVal = document.getElementById('fastupload-shelf-input').value;
    const shelfLevelVal = Number(document.getElementById('fastupload-level-input').value || 2);
    const locationVal = document.getElementById('fastupload-location-input').value.trim();
    const obsVal = document.getElementById('fastupload-obs-input').value.trim();
    const activeVendor = localStorage.getItem('boeweb_vendor_name') || 'Vendedor Local';

    if (!nameVal || !categoryVal) {
      showToast('Completá el nombre y la categoría del producto.');
      return;
    }
    if (!shelfVal) {
      showToast('Elegí el estante donde se guardarán las unidades.');
      document.getElementById('fastupload-shelf-input').focus();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '⏳ Comprimiendo y subiendo foto...';
    }

    const compressedBlob = await compressImageFile(fastUploadSelectedFile, 1000, 1000, 0.75);
    const filePath = `drafts/${fastUploadProductCode}_${Date.now()}.jpg`;
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

    const imageUrl = urlData ? urlData.publicUrl : '';
    const marketResult = fastUploadAiResult?.market || {};
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
      sale_price: Number(document.getElementById('fastupload-sale-price-input').value) || null,
      floor_level: floorVal,
      shelf_code: shelfVal,
      shelf_level: shelfLevelVal,
      ai_confidence: Number(fastUploadAiResult?.product?.confidence) || null,
      ai_payload: fastUploadAiResult || null,
      qr_payload: fastUploadQrPayload
    };
    const fullDraft = {
      image_url: imageUrl,
      image_path: filePath,
      stock: stockVal,
      location: locationVal,
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

    showToast(`Producto ${fastUploadProductCode} enviado a revisión con ubicación ${shelfVal}.`);

    fastUploadSelectedFile = null;
    fastUploadAiResult = null;
    revokeFastUploadPreviewUrl();
    fastUploadProductCode = createProductCode();
    document.getElementById('fast-upload-form').reset();
    document.getElementById('fastupload-photo-trigger').hidden = false;
    document.getElementById('fastupload-photo-preview-container').hidden = true;
    document.getElementById('fastupload-ai-btn').disabled = true;
    document.getElementById('fastupload-ai-status').hidden = true;
    document.getElementById('fastupload-ai-confidence').hidden = true;
    document.getElementById('fastupload-source-links').innerHTML = '';
    initializeFastUploadForm();

    loadPendingProductDrafts();
    switchVendorTab('drafts-review');

  } catch (err) {
    console.error('Error en submitProductDraft:', err);
    showToast(`❌ Error: ${err.message}`);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar producto a revisión';
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
        <div style="background: var(--color-card-bg-alt); border: 1.5px solid var(--color-border-accent); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; box-shadow: var(--shadow-sm);">
          <div style="aspect-ratio: 1/1; max-height: 200px; background: #000; position: relative; overflow: hidden;">
            <img src="${escapeStockHtml(draft.image_url)}" alt="${escapeStockHtml(draft.name || 'Foto del producto')}" style="width: 100%; height: 100%; object-fit: contain;">
            <span style="position: absolute; top: 8px; left: 8px; background: rgba(21,45,36,0.9); border: 1px solid var(--color-accent-gold); color: var(--color-accent-gold); font-size: 0.7rem; font-weight: 700; padding: 3px 8px; border-radius: 8px;">
              ${escapeStockHtml(draft.seller_name || 'Vendedor')} · ${escapeStockHtml(dateStr)}
            </span>
          </div>

          <div style="padding: 16px; flex: 1; display: flex; flex-direction: column; gap: 10px;">
            <div style="background: rgba(195,155,75,0.1); border: 1px solid rgba(195,155,75,0.3); border-radius: 10px; padding: 8px 12px; font-size: 0.8rem;">
              <p style="margin: 0 0 4px 0; color: #fff;"><strong>📦 Stock Cargado:</strong> ${draft.stock} unidades</p>
              <p style="margin: 0 0 4px 0; color: #fff;"><strong>📍 Ubicación:</strong> ${escapeStockHtml(draft.location || 'No especificada')}</p>
              ${draft.product_code ? `<p style="margin: 0 0 4px; color: #fff;"><strong>QR BÔ:</strong> ${escapeStockHtml(draft.product_code)}</p>` : ''}
              ${draft.barcode ? `<p style="margin: 0 0 4px; color: #fff;"><strong>Barra:</strong> ${escapeStockHtml(draft.barcode)}</p>` : ''}
              ${draft.market_average_price ? `<p style="margin: 0 0 4px; color: #fff;"><strong>Promedio ML:</strong> $${Number(draft.market_average_price).toLocaleString('es-AR')}</p>` : ''}
              ${draft.observations ? `<p style="margin: 0; color: rgba(247,246,242,0.8); font-style: italic;">${escapeStockHtml(draft.observations)}</p>` : ''}
            </div>

            <div>
              <label style="display: block; font-size: 0.78rem; font-weight: 700; color: var(--color-accent-gold); margin-bottom: 2px;">Nombre del Producto (Requerido) *</label>
              <input type="text" id="draft-name-${draft.id}" value="${escapeStockHtml(draft.name || '')}" placeholder="Ej: Sustrato Klasmann 50L" class="b2b-form-input" style="width: 100%; padding: 8px; font-size: 0.9rem; border-radius: 8px;">
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div>
                <label style="display: block; font-size: 0.78rem; font-weight: 700; color: var(--color-accent-gold); margin-bottom: 2px;">Categoría *</label>
                <select id="draft-cat-${draft.id}" class="b2b-form-input" style="width: 100%; padding: 8px; font-size: 0.85rem; border-radius: 8px;">
                  ${categoriesList.map(cat => `<option value="${cat}" ${draft.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
                </select>
              </div>

              <div>
                <label style="display: block; font-size: 0.78rem; font-weight: 700; color: var(--color-accent-gold); margin-bottom: 2px;">Costo de Compra ($)</label>
                <input type="number" step="0.01" id="draft-cost-${draft.id}" placeholder="Ej: 15000" class="b2b-form-input" style="width: 100%; padding: 8px; font-size: 0.85rem; border-radius: 8px;">
              </div>
            </div>

            <div>
              <label style="display: block; font-size: 0.78rem; font-weight: 800; color: #66bb6a; margin-bottom: 2px;">PRECIO FINAL AL PÚBLICO ($ ARS) *</label>
              <input type="number" step="0.01" id="draft-price-${draft.id}" value="${Number(draft.sale_price) || ''}" placeholder="Ej: 22500" required class="b2b-form-input" style="width: 100%; padding: 8px; font-size: 1rem; font-weight: 800; border-radius: 8px; border-color: #66bb6a;">
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
      .insert([{
        id: productId,
        name: nameVal,
        category: catVal,
        image: imageUrl,
        description: draft.description || `${draft.brand || ''} ${draft.presentation || ''}`.trim() || `Costo de referencia: $${costVal} ARS.`
      }]);

    if (prodErr) throw new Error(`Error al crear producto: ${prodErr.message}`);

    const { error: spErr } = await supabaseClient
      .from('supplier_products')
      .insert([{
        supplier_id: 'local_store',
        supplier_product_id: productId,
        name: nameVal,
        price: priceVal,
        stock: stock,
        available: true,
        image: imageUrl,
        mapped_product_id: productId
      }]);

    if (spErr) console.warn('Aviso supplier_products:', spErr.message);

    const productLocation = {
      product_id: productId,
      product_code: productId,
      name: nameVal,
      image_url: imageUrl,
      barcode: draft.barcode || null,
      floor_level: Number(draft.floor_level) || 1,
      shelf_code: draft.shelf_code || String(draft.location || '').match(/[A-E]-\d/i)?.[0]?.toUpperCase() || 'A-1',
      shelf_level: Number(draft.shelf_level) || 2,
      stock,
      qr_payload: draft.qr_payload || buildProductQrPayload(productId),
      updated_at: new Date().toISOString()
    };
    const { error: locationError } = await supabaseClient
      .from('product_locations')
      .upsert([productLocation], { onConflict: 'product_code' });
    if (locationError) {
      console.warn('Ubicación guardada localmente hasta aplicar la migración:', locationError.message);
      saveLocalProductLocation(productLocation);
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
    showToast(`Producto "${nameVal}" publicado y ubicado en ${productLocation.shelf_code}, nivel ${productLocation.shelf_level}.`);

    // Recargar cola y catálogo B2B
    loadPendingProductDrafts();
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
    const compressed = await compressImageFile(file, 1100, 800, 0.72);
    const localDataUrl = await blobToDataUrl(compressed);
    let photoUrl = localDataUrl;
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
window.updateFastUploadLocationPreview = updateFastUploadLocationPreview;
window.focusFastUploadBarcode = focusFastUploadBarcode;
window.openMapForStockEntry = openMapForStockEntry;
window.printCurrentProductQr = printCurrentProductQr;
window.printProductQrByCode = printProductQrByCode;
window.handleShelfPhotoChange = handleShelfPhotoChange;
window.submitProductDraft = submitProductDraft;
window.loadPendingProductDrafts = loadPendingProductDrafts;
window.approveProductDraft = approveProductDraft;
window.rejectProductDraft = rejectProductDraft;
