// Initialize Supabase Client
const supabaseUrl = 'https://sxbhrgvizqylnfcqzhin.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4YmhyZ3ZpenF5bG5mY3F6aGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMjM1MzEsImV4cCI6MjA5Njg5OTUzMX0.UUOwXsHXKNCjlJKdxMUlAuCtNAnNWgAroBwMlWAdTag';

const { createClient } = window.supabase;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- STATE MANAGEMENT ---
let baseProducts = []; // Stores products rendered in the grid
let cart = JSON.parse(localStorage.getItem('boeweb_b2b_cart')) || [];
let currentCategory = 'all';
let searchQuery = '';
let currentPage = 1;
const itemsPerPage = 24;

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
const toastMessageEl = document.getElementById('b2b-toast-message');

// --- INITIALIZE PORTAL ---
document.addEventListener('DOMContentLoaded', () => {
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
    // We select products and their mapped supplier relations
    let query = supabase
      .from('products')
      .select(`
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
      `);

    if (currentCategory !== 'all') {
      query = query.eq('category', currentCategory);
    }

    if (searchQuery) {
      query = query.ilike('name', `%${searchQuery}%`);
    }

    // Sort products by name alphabetically
    query = query.order('name', { ascending: true })
                 .range(from, to);

    const { data, error } = await query;

    if (error) throw error;

    const fetchedProducts = data || [];
    
    // Sort supplier products for each product from cheapest to most expensive
    fetchedProducts.forEach(product => {
      if (product.supplier_products) {
        product.supplier_products.sort((a, b) => a.price - b.price);
      }
    });

    baseProducts = baseProducts.concat(fetchedProducts);

    renderProductsList(fetchedProducts, clearGrid);

    // Show/hide Load More button
    if (fetchedProducts.length === itemsPerPage) {
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
    const { count: allCount, error: errAll } = await supabase
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

      const { count, error } = await supabase
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
      // Find cheapest with stock
      selectedSupplier = suppliers.find(s => s.available && (s.stock === null || s.stock > 0));
      // Fallback to first (cheapest) if none have stock
      if (!selectedSupplier) {
        selectedSupplier = suppliers[0];
      }
    }

    // Build suppliers list HTML
    let suppliersHtml = '';
    if (suppliers.length === 0) {
      suppliersHtml = `<div style="padding: 10px; text-align: center; font-size: 0.8rem; color: #888;">Sin proveedores cargados</div>`;
    } else {
      suppliers.forEach((s, idx) => {
        const isSelected = selectedSupplier && selectedSupplier.supplier_id === s.supplier_id;
        const isCheapest = idx === 0;
        const displayName = supplierNames[s.supplier_id] || s.supplier_id;
        
        let stockText = 'Sin stock';
        let stockClass = 'out-of-stock';
        if (s.available) {
          if (s.stock === null) {
            stockText = 'Stock disp.';
            stockClass = '';
          } else if (s.stock > 0) {
            stockText = `${s.stock} disp.`;
            stockClass = '';
          }
        }

        suppliersHtml += `
          <div class="b2b-supplier-row ${isSelected ? 'selected' : ''}" 
               data-supplier-id="${s.supplier_id}" 
               onclick="selectSupplierRow(this, '${product.id}', '${s.supplier_id}')">
            <input type="radio" name="radio-${product.id}" class="b2b-supplier-radio" ${isSelected ? 'checked' : ''}>
            <span class="b2b-supplier-name">
              ${displayName}
              ${isCheapest ? '<span class="b2b-best-price-badge">Cheapest</span>' : ''}
            </span>
            <span class="b2b-supplier-stock ${stockClass}">${stockText}</span>
            <span class="b2b-supplier-price">$${formatPrice(s.price)}</span>
          </div>
        `;
      });
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
        
        <div class="b2b-supplier-list">
          ${suppliersHtml}
        </div>

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
window.selectSupplierRow = function(rowEl, productId, supplierId) {
  const card = rowEl.closest('.b2b-card');
  
  // Unselect all rows in this card
  card.querySelectorAll('.b2b-supplier-row').forEach(row => {
    row.classList.remove('selected');
    row.querySelector('.b2b-supplier-radio').checked = false;
  });

  // Select this row
  rowEl.classList.add('selected');
  rowEl.querySelector('.b2b-supplier-radio').checked = true;
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

  const selectedRow = card.querySelector('.b2b-supplier-row.selected');
  if (!selectedRow) {
    showToast('Por favor, selecciona un proveedor', true);
    return;
  }

  const supplierId = selectedRow.dataset.supplierId;
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

// --- UI HELPERS ---
function showLoader(show) {
  loader.style.display = show ? 'flex' : 'none';
}

function openCart() {
  cartDrawer.classList.add('open');
  cartOverlay.classList.add('open');
}

function closeCart() {
  cartDrawer.classList.remove('open');
  cartOverlay.classList.remove('open');
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
