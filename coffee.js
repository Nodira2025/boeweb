// BÔ Coffee & Botanical Lounge Engine (v2.5)
// McDonald's style Table QR Ordering System & Exclusive Promos

const coffeeMenu = [
  // Promociones Exclusivas de la Mesa / Cafetería
  {
    id: 'p-1',
    name: 'Combo Zen (Café de Especialidad + Brownie 420)',
    category: 'promos',
    categoryLabel: '🔥 Promo Exclusiva Mesa',
    price: 7500,
    originalPrice: 8800,
    image: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?auto=format&fit=crop&w=600&q=80',
    description: 'Espresso Doble Origen + Brownie Artesanal Especial (Sin THC) con nueces de Sorrento y dulce de leche de campo (15% OFF).'
  },
  {
    id: 'p-2',
    name: 'Combo Mañanero (Capuchino + 2 Medialunas)',
    category: 'promos',
    categoryLabel: '🔥 Promo Exclusiva Mesa',
    price: 5200,
    originalPrice: 6500,
    image: 'https://images.unsplash.com/photo-1577968897966-3d4325b36b61?auto=format&fit=crop&w=600&q=80',
    description: 'Capuchino italiano cremoso con lluvia de canela + 2 medialunas de manteca hojaldradas recién horneadas (20% OFF).'
  },
  {
    id: 'p-3',
    name: 'Combo Chill (Cold Brew + Muffin Arándanos)',
    category: 'promos',
    categoryLabel: '🔥 Promo Exclusiva Mesa',
    price: 6900,
    originalPrice: 7700,
    image: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=600&q=80',
    description: 'Cold Brew macerado 12hs con toques de piel de naranja + Muffin gigante artesanal de vainilla y arándanos.'
  },
  {
    id: 'p-4',
    name: '2x1 Milkshake Botániko (Promo Mesa)',
    category: 'promos',
    categoryLabel: '🔥 Promo Exclusiva Mesa',
    price: 8000,
    originalPrice: 16000,
    image: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=600&q=80',
    description: '2 Milkshakes helados a elección (Frutos Rojos, Matcha Zen o Dulce de Leche) al precio de 1.'
  },

  // Cafés & Bebidas
  {
    id: 'c-1',
    name: 'Espresso Doble Origen',
    category: 'coffee',
    categoryLabel: 'Café de Especialidad',
    price: 3200,
    image: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?auto=format&fit=crop&w=600&q=80',
    description: 'Extracción doble de granos Etiopía y Colombia con notas a avellanas, chocolate amargo y cítricos suaves.'
  },
  {
    id: 'c-2',
    name: 'Flat White Orgánico',
    category: 'coffee',
    categoryLabel: 'Café de Especialidad',
    price: 4100,
    image: 'https://images.unsplash.com/photo-1577968897966-3d4325b36b61?auto=format&fit=crop&w=600&q=80',
    description: 'Doble shot de espresso combinado con finas microespumas de leche de almendras o vacuna texturizada.'
  },
  {
    id: 'c-3',
    name: 'Matcha Latte Ceremonial Grado A',
    category: 'coffee',
    categoryLabel: 'Infusión Zen',
    price: 4800,
    image: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=600&q=80',
    description: 'Té verde matcha japonés puro preparado con batido de bambú tradicional y leche vegetal.'
  },
  {
    id: 'c-4',
    name: 'Cold Brew Infusionado (12hs)',
    category: 'coffee',
    categoryLabel: 'Café Frío',
    price: 4300,
    image: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=600&q=80',
    description: 'Café macerado en frío durante 12 horas con toques de piel de naranja orgánica y hielo cristal.'
  },

  // Pastelería Artesanal
  {
    id: 'b-1',
    name: 'Croissant de Manteca & Almendras',
    category: 'bakery',
    categoryLabel: 'Pastelería',
    price: 3500,
    image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=600&q=80',
    description: 'Hojaldrado artesanal con mantequilla de primera calidad, relleno de crema de almendras y láminas doradas.'
  },
  {
    id: 'b-2',
    name: 'Torta Vasca de Queso (San Sebastián)',
    category: 'bakery',
    categoryLabel: 'Pastelería',
    price: 4900,
    image: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=600&q=80',
    description: 'Cheesecake horneado con exterior tostado y centro cremoso irresistible con suave toque de vainilla.'
  },
  {
    id: 'b-3',
    name: 'Pain au Chocolat 70% Cacao',
    category: 'bakery',
    categoryLabel: 'Pastelería',
    price: 3800,
    image: 'https://images.unsplash.com/photo-1608198093002-ad4e005484ec?auto=format&fit=crop&w=600&q=80',
    description: 'Masa de hojaldre crocante horneada diariamente con dos barras de chocolate negro belga 70%.'
  },

  // Brunch & Salados
  {
    id: 'br-1',
    name: 'Avocado Toast en Masa Madre',
    category: 'brunch',
    categoryLabel: 'Brunch Gourmet',
    price: 5900,
    image: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=600&q=80',
    description: 'Tostada de pan de masa madre de centeno con palta fresca laminada, huevo poché, semillas de chía y aceite de oliva.'
  },
  {
    id: 'br-2',
    name: 'Focaccia Jamón Crudo & Queso Brie',
    category: 'brunch',
    categoryLabel: 'Brunch Gourmet',
    price: 6800,
    image: 'https://images.unsplash.com/photo-1509722747041-616f39b57569?auto=format&fit=crop&w=600&q=80',
    description: 'Focaccia con romero y sal marina, jamón crudo serrano reserva, queso brie derretido y rúcula selvática.'
  },

  // Elixires Botánicos
  {
    id: 'e-1',
    name: 'Infusión Botánica Relax & Terpenos',
    category: 'elixir',
    categoryLabel: 'Elixir Botánico',
    price: 3900,
    image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80',
    description: 'Mezcla calmante de flores de manzanilla, lavanda, menta piperita y gotas de terpenos botánicos naturales.'
  },
  {
    id: 'e-2',
    name: 'Golden Milk Cúrcuma & Jengibre',
    category: 'elixir',
    categoryLabel: 'Elixir Botánico',
    price: 4200,
    image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80',
    description: 'Bebida milenaria ayurvédica con leche de almendras, cúrcuma pura, jengibre, canela y pimienta negra.'
  }
];

// State Variables
let isReprocannActive = false;
let currentCategoryFilter = 'promos'; // Default to Exclusive Promos!
let coffeeCart = [];
let activePrizeDiscount = 0; // percentage from wheel
let currentTable = null; // null = unselected, 0 = takeaway, >0 = Table Number

// Format currency
function formatARS(num) {
  return num.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// --- TABLE SELECTION & QR DETECTOR ENGINE ---
function initTableState() {
  const urlParams = new URLSearchParams(window.location.search);
  const tableParam = urlParams.get('mesa') || urlParams.get('table') || urlParams.get('m') || urlParams.get('t');

  if (tableParam !== null) {
    currentTable = parseInt(tableParam) || 0;
    sessionStorage.setItem('boeweb_coffee_table', currentTable);
  } else {
    const stored = sessionStorage.getItem('boeweb_coffee_table');
    if (stored !== null) {
      currentTable = parseInt(stored);
    }
  }

  updateTableUI();
}

function updateTableUI() {
  const titleEl = document.getElementById('table-banner-title');
  const subtitleEl = document.getElementById('table-banner-subtitle');
  const iconEl = document.getElementById('table-icon-badge');

  if (!titleEl) return;

  if (currentTable === 0) {
    titleEl.textContent = '🛍️ Para Llevar / Takeaway';
    subtitleEl.textContent = 'Tu pedido se preparará para retirar por el mostrador';
    if (iconEl) iconEl.textContent = '🛍️';
  } else if (currentTable !== null && currentTable > 0) {
    titleEl.textContent = `📍 MESA #${currentTable} ACTIVADA`;
    subtitleEl.textContent = 'Servicio directo a tu mesa por mozo/barista';
    if (iconEl) iconEl.textContent = '📍';
  } else {
    titleEl.textContent = '❓ Ninguna Mesa Seleccionada';
    subtitleEl.textContent = 'Tocá para indicar tu número de mesa o elegir Para Llevar';
    if (iconEl) iconEl.textContent = '🪑';
  }

  // Update modal buttons active state
  document.querySelectorAll('.table-select-btn').forEach(btn => {
    const val = parseInt(btn.getAttribute('data-table'));
    if (val === currentTable) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

function selectTable(tableNum) {
  currentTable = tableNum;
  sessionStorage.setItem('boeweb_coffee_table', currentTable);
  updateTableUI();
  closeTableModal();
}

function openTableModal() {
  const modal = document.getElementById('coffee-table-modal');
  if (modal) modal.classList.add('active');
}

function closeTableModal() {
  const modal = document.getElementById('coffee-table-modal');
  if (modal) modal.classList.remove('active');
}

// Render Menu Cards
function renderCoffeeMenu() {
  const grid = document.getElementById('coffee-menu-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const items = currentCategoryFilter === 'all' 
    ? coffeeMenu 
    : coffeeMenu.filter(item => item.category === currentCategoryFilter);

  items.forEach(item => {
    const finalPrice = isReprocannActive ? Math.round(item.price * 0.85) : item.price;
    const card = document.createElement('article');
    card.className = `coffee-card ${item.category === 'promos' ? 'promo-featured-card' : ''}`;

    card.innerHTML = `
      <div class="coffee-card-img-wrapper">
        <span class="coffee-card-badge ${item.category === 'promos' ? 'promo-badge-gold' : ''}">${item.categoryLabel}</span>
        <img src="${item.image}" alt="${item.name}" class="coffee-card-img" loading="lazy">
      </div>
      <div class="coffee-card-body">
        <h3 class="coffee-card-title">${item.name}</h3>
        <p class="coffee-card-desc">${item.description}</p>
        <div class="coffee-card-footer">
          <div class="price-box">
            ${item.originalPrice ? `<span class="price-original">$${formatARS(item.originalPrice)}</span>` : (isReprocannActive ? `<span class="price-original">$${formatARS(item.price)}</span>` : '')}
            <span class="price-regular">$${formatARS(finalPrice)}</span>
            ${isReprocannActive ? `<span class="price-reprocann-tag">🌱 15% OFF REPROCANN</span>` : ''}
          </div>
          <button class="btn-add-coffee" onclick="addToCoffeeCart('${item.id}')" aria-label="Agregar ${item.name}">
            <svg style="width: 20px; height: 20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// Category filter toggle
function filterCoffeeCategory(cat, pillEl) {
  currentCategoryFilter = cat;
  document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
  if (pillEl) pillEl.classList.add('active');
  renderCoffeeMenu();
}

// REPROCANN Discount Toggle
function toggleReprocannDiscount() {
  const btn = document.getElementById('reprocann-toggle-btn');
  if (!isReprocannActive) {
    const dni = prompt('🌱 Verificación de Paciente REPROCANN:\nIngresá tu número de DNI registrado:');
    if (dni && dni.trim() !== '') {
      isReprocannActive = true;
      if (btn) {
        btn.classList.add('active');
        btn.innerHTML = '<span>✓ 15% OFF REPROCANN Activado</span>';
      }
      renderCoffeeMenu();
      alert(`✅ ¡Excelente! Se activó el 15% OFF automático en todo el menú para el DNI: ${dni.trim()}`);
    }
  } else {
    isReprocannActive = false;
    if (btn) {
      btn.classList.remove('active');
      btn.innerHTML = '<span>Activar 15% OFF REPROCANN</span>';
    }
    renderCoffeeMenu();
  }
}

// Add Item to Cart
function addToCoffeeCart(itemId) {
  const item = coffeeMenu.find(i => i.id === itemId);
  if (!item) return;

  const existing = coffeeCart.find(c => c.id === itemId);
  if (existing) {
    existing.quantity++;
  } else {
    const unitPrice = isReprocannActive ? Math.round(item.price * 0.85) : item.price;
    coffeeCart.push({ ...item, unitPrice, quantity: 1 });
  }

  updateCoffeeCartCount();
  renderCoffeeCartModal();
}

function updateCoffeeCartCount() {
  const count = coffeeCart.reduce((acc, i) => acc + i.quantity, 0);
  const countEl = document.getElementById('coffee-cart-count');
  if (countEl) countEl.textContent = count;
}

// --- COFFEE CART & WHATSAPP CHECKOUT MODAL ---
function openCoffeeCartModal() {
  if (coffeeCart.length === 0) {
    alert('🛒 Tu pedido de BÔ Coffee está vacío. Agregá algún café o promo para continuar.');
    return;
  }

  if (currentTable === null) {
    openTableModal();
    return;
  }

  renderCoffeeCartModal();
  const modal = document.getElementById('coffee-cart-modal');
  if (modal) modal.classList.add('active');
}

function closeCoffeeCartModal() {
  const modal = document.getElementById('coffee-cart-modal');
  if (modal) modal.classList.remove('active');
}

function renderCoffeeCartModal() {
  const container = document.getElementById('coffee-cart-items-list');
  const subtotalEl = document.getElementById('coffee-cart-subtotal');
  const totalEl = document.getElementById('coffee-cart-total');
  const tableBadgeEl = document.getElementById('cart-table-badge-display');

  if (!container) return;

  if (tableBadgeEl) {
    tableBadgeEl.textContent = currentTable === 0 
      ? '🛍️ Para Llevar' 
      : (currentTable ? `📍 Mesa #${currentTable}` : '❓ Sin Mesa');
  }

  let subtotal = 0;
  container.innerHTML = coffeeCart.map((item, idx) => {
    const itemTotal = item.unitPrice * item.quantity;
    subtotal += itemTotal;
    return `
      <div class="coffee-cart-item-row">
        <div class="cart-item-details">
          <strong>${item.name}</strong>
          <span class="cart-item-price">$${formatARS(item.unitPrice)} c/u</span>
        </div>
        <div class="cart-item-actions">
          <button class="btn-qty-minus" onclick="changeCoffeeQty(${idx}, -1)">-</button>
          <span>${item.quantity}</span>
          <button class="btn-qty-plus" onclick="changeCoffeeQty(${idx}, 1)">+</button>
          <span class="cart-item-subtotal">$${formatARS(itemTotal)}</span>
        </div>
      </div>
    `;
  }).join('');

  let discount = subtotal * activePrizeDiscount;
  let total = Math.max(0, subtotal - discount);

  if (subtotalEl) subtotalEl.textContent = `$${formatARS(subtotal)}`;
  if (totalEl) totalEl.textContent = `$${formatARS(total)}`;
}

function changeCoffeeQty(idx, delta) {
  if (coffeeCart[idx]) {
    coffeeCart[idx].quantity += delta;
    if (coffeeCart[idx].quantity <= 0) {
      coffeeCart.splice(idx, 1);
    }
  }
  updateCoffeeCartCount();
  renderCoffeeCartModal();
  if (coffeeCart.length === 0) closeCoffeeCartModal();
}

function sendCoffeeOrderToWhatsApp() {
  if (coffeeCart.length === 0) return;

  const clientNameInput = document.getElementById('coffee-client-name');
  const clientName = clientNameInput ? clientNameInput.value.trim() : '';

  if (!clientName) {
    alert('Por favor ingresá tu nombre para enviarle la orden a la barista.');
    return;
  }

  let locationText = '🛍️ Para Llevar / Takeaway';
  if (currentTable && currentTable > 0) {
    locationText = `📍 MESA #${currentTable} (Servicio en Mesa)`;
  }

  let msg = `☕ *PEDIDO BÔ COFFEE - MCDONALD'S STYLE* ☕\n\n`;
  msg += `👤 *Cliente:* ${clientName}\n`;
  msg += `📍 *Ubicación:* ${locationText}\n`;
  msg += `\n🛒 *Detalle del Pedido:*\n`;

  let subtotal = 0;
  coffeeCart.forEach(item => {
    const itemTotal = item.unitPrice * item.quantity;
    subtotal += itemTotal;
    msg += `- ${item.quantity}x ${item.name} ($${formatARS(item.unitPrice)} c/u)\n`;
  });

  let discount = subtotal * activePrizeDiscount;
  let total = Math.max(0, subtotal - discount);

  if (activePrizeDiscount > 0) {
    msg += `\n🎁 *Descuento Rueda Zen:* -$${formatARS(discount)}\n`;
  }

  msg += `\n💰 *TOTAL A ABONAR:* $${formatARS(total)}\n`;
  msg += `\n¡Muchas gracias! 🙏`;

  const waPhone = "5493813023185";
  const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`;

  coffeeCart = [];
  updateCoffeeCartCount();
  closeCoffeeCartModal();

  window.open(waUrl, '_blank');
}

// --- RUEDA DE LA FORTUNA ZEN ---
const prizes = [
  { text: '5% OFF EXTRA', value: 0.05, desc: 'Sumás un 5% de descuento adicional a tu cuenta.' },
  { text: 'Espresso Gratis', value: 0, desc: '¡Un shot de Espresso Doble de regalo con tu pedido!' },
  { text: '10% OFF EXTRA', value: 0.10, desc: '¡Genial! 10% de descuento adicional acumulable.' },
  { text: 'Pastry Gratis', value: 0, desc: '¡Te regalamos un Croissant o Pain au Chocolat!' },
  { text: 'Envío Gratis', value: 0, desc: 'Envío bonificado para tu pedido.' },
  { text: '15% OFF VIP', value: 0.15, desc: '¡Premio mayor! 15% de descuento adicional.' }
];

let isSpinning = false;

function drawWheel() {
  const canvas = document.getElementById('wheel-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const numSlices = prizes.length;
  const sliceAngle = (2 * Math.PI) / numSlices;

  ctx.clearRect(0, 0, 280, 280);
  const colors = ['#152d24', '#c39b4b', '#1a382d', '#b88e28', '#0f1e18', '#d4af37'];

  prizes.forEach((prize, i) => {
    const angle = i * sliceAngle;
    ctx.beginPath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.moveTo(140, 140);
    ctx.arc(140, 140, 135, angle, angle + sliceAngle);
    ctx.lineTo(140, 140);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.stroke();

    ctx.save();
    ctx.translate(140, 140);
    ctx.rotate(angle + sliceAngle / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#0f1e18';
    ctx.font = 'bold 12px Outfit, sans-serif';
    ctx.fillText(prize.text, 120, 4);
    ctx.restore();
  });
}

function openCoffeeWheel() {
  document.getElementById('coffee-wheel-modal').classList.add('active');
  drawWheel();
}

function closeCoffeeWheel() {
  document.getElementById('coffee-wheel-modal').classList.remove('active');
}

function spinCoffeeWheel() {
  if (isSpinning) return;
  isSpinning = true;

  const canvas = document.getElementById('wheel-canvas');
  const randomPrizeIdx = Math.floor(Math.random() * prizes.length);
  const sliceAngle = 360 / prizes.length;
  
  const extraRotations = 5 * 360;
  const targetDegree = extraRotations + (360 - (randomPrizeIdx * sliceAngle + sliceAngle / 2));

  canvas.style.transform = `rotate(${targetDegree}deg)`;

  setTimeout(() => {
    isSpinning = false;
    const prize = prizes[randomPrizeIdx];
    activePrizeDiscount = prize.value;

    const box = document.getElementById('wheel-result-box');
    document.getElementById('wheel-prize-title').textContent = `🎉 ¡Ganaste: ${prize.text}!`;
    document.getElementById('wheel-prize-desc').textContent = prize.desc;
    box.style.display = 'block';
    document.getElementById('spin-btn').style.display = 'none';
  }, 4000);
}

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
  initTableState();
  renderCoffeeMenu();

  const cartBtn = document.getElementById('coffee-cart-btn');
  if (cartBtn) cartBtn.addEventListener('click', openCoffeeCartModal);
});

// Global Exposure
window.renderCoffeeMenu = renderCoffeeMenu;
window.filterCoffeeCategory = filterCoffeeCategory;
window.toggleReprocannDiscount = toggleReprocannDiscount;
window.addToCoffeeCart = addToCoffeeCart;
window.openCoffeeWheel = openCoffeeWheel;
window.closeCoffeeWheel = closeCoffeeWheel;
window.spinCoffeeWheel = spinCoffeeWheel;
window.openTableModal = openTableModal;
window.closeTableModal = closeTableModal;
window.selectTable = selectTable;
window.openCoffeeCartModal = openCoffeeCartModal;
window.closeCoffeeCartModal = closeCoffeeCartModal;
window.changeCoffeeQty = changeCoffeeQty;
window.sendCoffeeOrderToWhatsApp = sendCoffeeOrderToWhatsApp;
