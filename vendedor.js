// Initialize Supabase Client
const supabaseUrl = 'https://sxbhrgvizqylnfcqzhin.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4YmhyZ3ZpenF5bG5mY3F6aGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMjM1MzEsImV4cCI6MjA5Njg5OTUzMX0.UUOwXsHXKNCjlJKdxMUlAuCtNAnNWgAroBwMlWAdTag';

let supabaseClient;

// --- STATE MANAGEMENT ---
let baseProducts = []; // Stores products rendered in the grid
let cart = JSON.parse(localStorage.getItem('boeweb_b2b_cart')) || [];
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
    
    // Sort supplier products for each product from cheapest to most expensive
    fetchedProducts.forEach(product => {
      if (product.supplier_products) {
        // Clean up the extra filtered_query key returned by Supabase
        delete product.filtered_query;
        product.supplier_products.sort((a, b) => a.price - b.price);
      }
    });

    baseProducts = baseProducts.concat(fetchedProducts);

    renderProductsList(fetchedProducts, clearGrid);

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
    productGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: red;">Error al conectar con Supabase: ${err.message}</p>`;
  } finally {
    showLoader(false);
  }
}

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
