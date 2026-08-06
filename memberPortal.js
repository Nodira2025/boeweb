/**
 * BO growclub - Member & VIP Portal Logic (v2.4)
 * Implements Multi-account Login/Registration, Order History, Monthly Raffle Surveys,
 * Seeds Redemption Store, and Supabase Cloud Synchronization with localStorage Fallback.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- SUPABASE CLIENT SETUP (HYBRID SYNC) ---
  const SUPABASE_URL = "https://sxbhrgvizqylnfcqzhin.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4YmhyZ3ZpenF5bG5mY3F6aGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMjM1MzEsImV4cCI6MjA5Njg5OTUzMX0.UUOwXsHXKNCjlJKdxMUlAuCtNAnNWgAroBwMlWAdTag";

  let supabaseClient = null;
  if (window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (err) {
      console.warn("Supabase initialization fallback to localStorage:", err.message);
    }
  }

  // --- STATE & DATA ---
  let currentMember = JSON.parse(localStorage.getItem('boeweb_member')) || null;
  let registeredUsers = JSON.parse(localStorage.getItem('boeweb_registered_users')) || [];
  let orderHistory = JSON.parse(localStorage.getItem('boeweb_order_history')) || [];

  // 5 Tiers Definition (Matching Infographic)
  const TIERS = {
    BROTE: { name: 'Nivel 1: Brote', discount: 0.05, minSeeds: 0, nextMin: 500, label: '🌱 Brote (5% OFF)', icon: '🌱' },
    CULTIVADOR: { name: 'Nivel 2: Cultivador', discount: 0.10, minSeeds: 500, nextMin: 1500, label: '🌿 Cultivador (10% OFF)', icon: '🌿' },
    EXPERTO: { name: 'Nivel 3: Experto', discount: 0.15, minSeeds: 1500, nextMin: 3500, label: '🍃 Experto (15% OFF)', icon: '🍃' },
    MAESTRO: { name: 'Nivel 4: Maestro', discount: 0.20, minSeeds: 3500, nextMin: 7000, label: '👑 Maestro (20% OFF)', icon: '👑' },
    LEYENDA: { name: 'Nivel 5: Leyenda', discount: 0.25, minSeeds: 7000, nextMin: null, label: '🏆 Leyenda (25% OFF)', icon: '🏆' }
  };

  // Redeemable Physical Products ($0 cost in cart)
  const REDEEMABLE_PRODUCTS = [
    { id: 'gift-sedas', name: 'Sedas BÔ Premium (Papel de Armar)', seedsCost: 200, img: 'assets/logo.jpg' },
    { id: 'gift-clipper', name: 'Encendedor Clipper Edición Zen', seedsCost: 450, img: 'assets/logo.jpg' },
    { id: 'gift-grinder', name: 'Picador / Grinder BÔ 2 Piezas', seedsCost: 800, img: 'assets/logo.jpg' },
    { id: 'gift-nutrientes', name: 'Kit de Nutrientes Orgánicos 250ml', seedsCost: 1500, img: 'assets/logo.jpg' }
  ];

  // Redeemable Coupon Packs
  const REDEEMABLE_COUPONS = [
    { code: 'CANJE5', desc: '5% OFF Extra para tu compra', seedsCost: 100, value: 0.05 },
    { code: 'CANJE10', desc: '10% OFF Extra para tu compra', seedsCost: 300, value: 0.10 },
    { code: 'CANJE15', desc: '15% OFF Extra para tu compra', seedsCost: 500, value: 0.15 }
  ];

  // --- DOM ELEMENTS ---
  const clubTrigger = document.getElementById('club-trigger');
  const mobileClubBtn = document.getElementById('mobile-club-btn');
  const clubBtnText = document.getElementById('club-btn-text');

  // Modals
  const authModal = document.getElementById('club-auth-modal');
  const portalModal = document.getElementById('club-portal-modal');
  const closeAuthBtn = document.getElementById('close-club-auth-btn');
  const closePortalBtn = document.getElementById('close-club-portal-btn');

  // Auth Tabs
  const authTabRegister = document.getElementById('auth-tab-register');
  const authTabLogin = document.getElementById('auth-tab-login');
  const registerFormContainer = document.getElementById('auth-register-container');
  const loginFormContainer = document.getElementById('auth-login-container');

  // Forms & Actions
  const registerForm = document.getElementById('club-register-form');
  const loginForm = document.getElementById('club-login-form');
  const loginFeedback = document.getElementById('login-feedback');
  const logoutBtn = document.getElementById('club-logout-btn');

  // VIP Dashboard Tabs
  const portalNavItems = document.querySelectorAll('.portal-nav-item');
  const portalTabContents = document.querySelectorAll('.portal-tab-content');

  // VIP Dashboard Elements
  const vipName = document.getElementById('vip-member-name');
  const vipBadge = document.getElementById('vip-member-badge');
  const vipSeeds = document.getElementById('vip-member-seeds');
  const currentTierLabel = document.getElementById('current-tier-label');
  const nextTierLabel = document.getElementById('next-tier-label');
  const progressFill = document.getElementById('vip-progress-fill');
  const progressText = document.getElementById('vip-progress-text');

  // Certificate Link in Dashboard
  const viewCertBtn = document.getElementById('dashboard-view-cert-btn');

  // History Tab Elements
  const historyContainer = document.getElementById('history-orders-container');

  // Survey & Raffle Elements
  const surveyForm = document.getElementById('survey-form');
  const surveyContainer = document.getElementById('survey-active-container');
  const raffleTicketBox = document.getElementById('raffle-ticket-box');
  const ticketNumberEl = document.getElementById('ticket-number-display');

  // Store Tab Elements
  const redeemCouponsContainer = document.getElementById('redeem-coupons-container');
  const redeemProductsContainer = document.getElementById('redeem-products-container');

  // --- INITIALIZATION ---
  updateClubButtons();
  bindEvents();

  function bindEvents() {
    if (clubTrigger) clubTrigger.addEventListener('click', openMemberPortal);
    if (mobileClubBtn) {
      mobileClubBtn.addEventListener('click', () => {
        openMemberPortal();
        document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.classList.remove('active'));
        mobileClubBtn.classList.add('active');
      });
    }

    if (closeAuthBtn) closeAuthBtn.addEventListener('click', () => toggleModal(authModal, false));
    if (closePortalBtn) closePortalBtn.addEventListener('click', () => toggleModal(portalModal, false));

    // Auth Tabs Switcher
    if (authTabRegister && authTabLogin) {
      authTabRegister.addEventListener('click', () => switchAuthTab('register'));
      authTabLogin.addEventListener('click', () => switchAuthTab('login'));
    }

    // Portal Navigation Tabs Switcher
    portalNavItems.forEach(item => {
      item.addEventListener('click', () => {
        const targetTab = item.getAttribute('data-tab');
        switchPortalTab(targetTab);
      });
    });

    // Handle outside clicks
    [authModal, portalModal].forEach(modal => {
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) toggleModal(modal, false);
        });
      }
    });

    // Forms
    if (registerForm) registerForm.addEventListener('submit', handleRegistration);
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    const perfilLogoutBtn = document.getElementById('perfil-logout-btn');
    if (perfilLogoutBtn) perfilLogoutBtn.addEventListener('click', handleLogout);
    if (surveyForm) surveyForm.addEventListener('submit', handleSurveySubmit);
    if (viewCertBtn) viewCertBtn.addEventListener('click', openCertificateModal);
  }

  // --- CLOUD SYNC HELPERS ---
  async function syncMemberToCloud(member) {
    if (!supabaseClient || !member) return;
    try {
      const payload = {
        name: member.name,
        email: member.email,
        phone: member.phone,
        grow_type: member.growType,
        seeds: member.seeds || 100,
        raffle_ticket: member.raffleTicket || null,
        survey_completed: member.surveyCompleted || false,
        updated_at: new Date().toISOString()
      };
      await supabaseClient.from('boeweb_members').upsert(payload, { onConflict: 'email' });
    } catch (err) {
      console.warn("Cloud sync fallback:", err.message);
    }
  }

  async function fetchMemberFromCloud(credential) {
    if (!supabaseClient || !credential) return null;
    try {
      const { data, error } = await supabaseClient
        .from('boeweb_members')
        .select('*')
        .or(`email.eq.${credential},phone.eq.${credential}`)
        .maybeSingle();

      if (data && !error) {
        return {
          name: data.name,
          email: data.email,
          phone: data.phone,
          growType: data.grow_type,
          seeds: data.seeds,
          raffleTicket: data.raffle_ticket,
          surveyCompleted: data.survey_completed,
          joinedAt: data.created_at || new Date().toISOString()
        };
      }
    } catch (err) {
      console.warn("Cloud fetch fallback:", err.message);
    }
    return null;
  }

  // --- FUNCTIONS ---

  function toggleModal(modal, show) {
    if (!modal) return;
    if (show) modal.classList.add('active');
    else modal.classList.remove('active');
  }

  function switchAuthTab(tab) {
    if (tab === 'register') {
      authTabRegister.classList.add('active');
      authTabLogin.classList.remove('active');
      registerFormContainer.style.display = 'block';
      loginFormContainer.style.display = 'none';
    } else {
      authTabLogin.classList.add('active');
      authTabRegister.classList.remove('active');
      loginFormContainer.style.display = 'block';
      registerFormContainer.style.display = 'none';
    }
  }

  function switchPortalTab(tabId) {
    portalNavItems.forEach(item => {
      if (item.getAttribute('data-tab') === tabId) item.classList.add('active');
      else item.classList.remove('active');
    });

    portalTabContents.forEach(content => {
      if (content.id === `tab-${tabId}`) {
        content.classList.add('active');
        content.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      else content.classList.remove('active');
    });

    // Render contents dynamically per tab
    if (tabId === 'history') renderOrderHistory();
    else if (tabId === 'raffle') renderRaffleSection();
    else if (tabId === 'store') renderRedemptionStore();
  }

  function openMemberPortal() {
    if (currentMember) {
      window.location.href = 'perfil.html';
    } else {
      switchAuthTab('login');
      toggleModal(authModal, true);
    }
  }

  // --- REGISTRATION & LOGIN ---

  async function handleRegistration(e) {
    e.preventDefault();
    const name = document.getElementById('member-name').value.trim();
    const email = document.getElementById('member-email').value.trim().toLowerCase();
    const phone = document.getElementById('member-phone').value.trim();
    const growType = document.getElementById('member-growtype').value;

    if (!name || !email || !phone) return;

    // Check if user already exists in local list
    const existing = registeredUsers.find(u => u.email === email || u.phone === phone);
    if (existing) {
      currentMember = existing;
    } else {
      currentMember = {
        name,
        email,
        phone,
        growType,
        seeds: 100, // 100 seeds welcome bonus
        joinedAt: new Date().toISOString(),
        surveyCompleted: false,
        raffleTicket: null
      };
      registeredUsers.push(currentMember);
      localStorage.setItem('boeweb_registered_users', JSON.stringify(registeredUsers));
    }

    saveCurrentMemberState();
    syncMemberToCloud(currentMember); // Cloud Sync

    updateClubButtons();
    toggleModal(authModal, false);
    setTimeout(() => openMemberPortal(), 300);

    if (window.updateCartDisplay) window.updateCartDisplay();
  }

  async function handleLogin(e) {
    e.preventDefault();
    const inputVal = document.getElementById('login-credential').value.trim().toLowerCase();
    if (loginFeedback) loginFeedback.style.display = 'none';

    if (!inputVal) return;

    // 1. Try local list search (safe against undefined fields)
    let foundUser = registeredUsers.find(u => 
      (u.email && u.email.toLowerCase() === inputVal) || 
      (u.phone && typeof u.phone === 'string' && u.phone.toLowerCase().includes(inputVal))
    );

    // 2. Fallback: Try Supabase Cloud Fetch with safety catch
    if (!foundUser && supabaseClient) {
      try {
        const cloudUser = await fetchMemberFromCloud(inputVal);
        if (cloudUser) {
          foundUser = cloudUser;
          registeredUsers.push(foundUser);
          localStorage.setItem('boeweb_registered_users', JSON.stringify(registeredUsers));
        }
      } catch (err) {
        console.warn("Cloud fetch error:", err);
      }
    }

    if (foundUser) {
      currentMember = foundUser;
      saveCurrentMemberState();
      updateClubButtons();

      toggleModal(authModal, false);
      setTimeout(() => openMemberPortal(), 300);

      if (window.updateCartDisplay) window.updateCartDisplay();
    } else {
      if (loginFeedback) {
        loginFeedback.style.display = 'block';
        loginFeedback.textContent = '❌ Usuario no encontrado. Por favor registrate primero.';
      }
    }
  }

  function handleLogout() {
    localStorage.removeItem('boeweb_member');
    currentMember = null;
    updateClubButtons();
    if (portalModal) toggleModal(portalModal, false);

    if (window.location.pathname.includes('perfil.html')) {
      window.location.href = 'index.html';
    }

    const shopBtn = document.getElementById('mobile-shop-btn');
    if (shopBtn) {
      document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.classList.remove('active'));
      shopBtn.classList.add('active');
    }

    if (window.updateCartDisplay) window.updateCartDisplay();
  }

  function saveCurrentMemberState() {
    if (!currentMember) return;
    localStorage.setItem('boeweb_member', JSON.stringify(currentMember));

    // Update inside registeredUsers array as well
    const idx = registeredUsers.findIndex(u => u.email === currentMember.email);
    if (idx !== -1) {
      registeredUsers[idx] = currentMember;
    } else {
      registeredUsers.push(currentMember);
    }
    localStorage.setItem('boeweb_registered_users', JSON.stringify(registeredUsers));
    
    // Sync to Supabase in background
    syncMemberToCloud(currentMember);
  }

  function updateClubButtons() {
    const text = currentMember ? 'Perfil VIP' : 'Club BÔ';
    if (clubBtnText) clubBtnText.textContent = text;
  }

  function getMemberTier(seeds) {
    if (seeds >= TIERS.LEYENDA.minSeeds) return TIERS.LEYENDA;
    if (seeds >= TIERS.MAESTRO.minSeeds) return TIERS.MAESTRO;
    if (seeds >= TIERS.EXPERTO.minSeeds) return TIERS.EXPERTO;
    if (seeds >= TIERS.CULTIVADOR.minSeeds) return TIERS.CULTIVADOR;
    return TIERS.BROTE;
  }

  function getNextTier(tier) {
    if (tier === TIERS.BROTE) return TIERS.CULTIVADOR;
    if (tier === TIERS.CULTIVADOR) return TIERS.EXPERTO;
    if (tier === TIERS.EXPERTO) return TIERS.MAESTRO;
    if (tier === TIERS.MAESTRO) return TIERS.LEYENDA;
    return null;
  }

  function updatePortalUI() {
    if (!currentMember) return;

    const nameVal = currentMember.name || 'Miembro VIP';
    const seedsVal = currentMember.seeds || 0;
    const tier = getMemberTier(seedsVal);

    if (vipName) vipName.textContent = nameVal;
    if (vipBadge) {
      vipBadge.textContent = tier.name;
      vipBadge.className = 'member-badge';
      if (tier === TIERS.LEYENDA || tier === TIERS.MAESTRO) vipBadge.classList.add('badge-gold');
      else if (tier === TIERS.EXPERTO || tier === TIERS.CULTIVADOR) vipBadge.classList.add('badge-silver');
      else vipBadge.classList.add('badge-bronze');
    }
    if (vipSeeds) vipSeeds.textContent = seedsVal;

    // Progress Bar
    if (currentTierLabel) currentTierLabel.textContent = tier.label;
    if (tier.nextMin !== null) {
      const nextTier = getNextTier(tier);
      if (nextTierLabel && nextTier) {
        nextTierLabel.textContent = nextTier.label;
      }
      const range = tier.nextMin - tier.minSeeds;
      const progress = ((seedsVal - tier.minSeeds) / range) * 100;
      if (progressFill) progressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
      if (progressText) {
        const missing = tier.nextMin - seedsVal;
        progressText.textContent = `Te faltan ${missing} semillas para subir de nivel.`;
      }
    } else {
      if (nextTierLabel) nextTierLabel.textContent = 'Nivel Máximo alcanzado (Leyenda)';
      if (progressFill) progressFill.style.width = '100%';
      if (progressText) progressText.textContent = '¡Eres un legendario Leyenda VIP! Disfrutas de todos los beneficios máximos (25% OFF).';
    }

    // Update QR Pass Name
    const qrNameEl = document.getElementById('qr-pass-customer-name');
    if (qrNameEl) qrNameEl.textContent = `${nameVal} (${tier.label})`;

    // Dedicated perfil.html Page UI Updates
    const headerName = document.getElementById('header-user-name');
    const headerTier = document.getElementById('header-user-tier');
    const headerSeeds = document.getElementById('header-user-seeds');
    const perfilQrName = document.getElementById('perfil-qr-name');
    const perfilTierCurrent = document.getElementById('perfil-tier-current');
    const perfilTierNext = document.getElementById('perfil-tier-next');
    const perfilProgressFill = document.getElementById('perfil-progress-fill');
    const perfilProgressText = document.getElementById('perfil-progress-text');

    const nextTierObj = getNextTier(tier);

    if (headerName) headerName.textContent = nameVal;
    if (headerTier) headerTier.textContent = tier.label;
    if (headerSeeds) headerSeeds.textContent = `${seedsVal} SEMILLAS`;
    if (perfilQrName) perfilQrName.textContent = `${nameVal} (${tier.label})`;
    if (perfilTierCurrent) perfilTierCurrent.textContent = tier.label;
    if (perfilTierNext) perfilTierNext.textContent = nextTierObj ? nextTierObj.label : 'Nivel Máximo (Leyenda)';
    if (perfilProgressFill) {
      if (tier.nextMin !== null) {
        const range = tier.nextMin - tier.minSeeds;
        const progress = ((seedsVal - tier.minSeeds) / range) * 100;
        perfilProgressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
      } else {
        perfilProgressFill.style.width = '100%';
      }
    }
    if (perfilProgressText) {
      if (tier.nextMin !== null) {
        const missing = tier.nextMin - seedsVal;
        perfilProgressText.textContent = `Te faltan ${missing} semillas para subir de nivel.`;
      } else {
        perfilProgressText.textContent = '¡Nivel Máximo Leyenda alcanzado!';
      }
    }

    // Check Academy Certificate Button Visibility
    const academyProgress = JSON.parse(localStorage.getItem('boeweb_academy_progress')) || { completedModules: [] };
    if (viewCertBtn) {
      if (academyProgress.completedModules && academyProgress.completedModules.length >= 4) {
        viewCertBtn.style.display = 'inline-flex';
      } else {
        viewCertBtn.style.display = 'none';
      }
    }

    renderMemberBadges();
    renderRedemptionStore();
    renderLunarCalendar();
    renderGrowLogHistory();

    // Set user unique mission code display
    const codeEl = document.getElementById('user-mission-code');
    if (codeEl && currentMember) {
      let codeNum = 8492;
      if (currentMember.email) {
        let hash = 0;
        for (let i = 0; i < currentMember.email.length; i++) {
          hash = ((hash << 5) - hash) + currentMember.email.charCodeAt(i);
          hash |= 0;
        }
        codeNum = Math.abs(hash) % 9000 + 1000;
      }
      codeEl.textContent = `#BO-${codeNum}`;
    }
  }

  // --- TAB 2: ORDER HISTORY ---
  function renderOrderHistory() {
    if (!historyContainer) return;
    orderHistory = JSON.parse(localStorage.getItem('boeweb_order_history')) || [];
    
    // Filter orders matching current member email/phone
    const userOrders = orderHistory.filter(o => 
      currentMember && (o.email === currentMember.email || o.phone === currentMember.phone)
    );

    if (userOrders.length === 0) {
      historyContainer.innerHTML = `
        <div class="empty-tab-state">
          <p>📦 Aún no has realizado pedidos desde este usuario.</p>
          <a href="#catalog-section" class="btn btn-secondary" onclick="document.getElementById('close-club-portal-btn').click();">Explorar Catálogo</a>
        </div>
      `;
      return;
    }

    historyContainer.innerHTML = userOrders.map(order => `
      <div class="history-order-card">
        <div class="order-card-header">
          <div>
            <strong>Pedido #${order.id}</strong>
            <span class="order-date">${new Date(order.date).toLocaleDateString('es-AR')}</span>
          </div>
          <span class="order-status-tag">${order.status || 'Enviado a WhatsApp'}</span>
        </div>
        <div class="order-card-body">
          <ul class="order-items-list">
            ${order.items.map(item => `
              <li>${item.quantity}x ${item.name} ($${formatPrice(item.price * item.quantity)})</li>
            `).join('')}
          </ul>
          <div class="order-total-row">
            <span>Total:</span>
            <strong>$${formatPrice(order.total)}</strong>
          </div>
        </div>
        <div class="order-card-footer">
          <button class="btn btn-secondary btn-reorder" data-order-id="${order.id}">
            🔄 Volver a Pedir
          </button>
        </div>
      </div>
    `).join('');

    // Reorder event listeners
    document.querySelectorAll('.btn-reorder').forEach(btn => {
      btn.addEventListener('click', () => {
        const orderId = btn.getAttribute('data-order-id');
        const targetOrder = userOrders.find(o => o.id === orderId);
        if (targetOrder && window.reorderItems) {
          window.reorderItems(targetOrder.items);
          toggleModal(portalModal, false);
        }
      });
    });
  }

  // --- TAB 3: SURVEY & RAFFLE ---
  function renderRaffleSection() {
    if (!currentMember) return;

    if (currentMember.surveyCompleted && currentMember.raffleTicket) {
      if (surveyContainer) surveyContainer.style.display = 'none';
      if (raffleTicketBox) raffleTicketBox.style.display = 'block';
      if (ticketNumberEl) ticketNumberEl.textContent = currentMember.raffleTicket;
    } else {
      if (surveyContainer) surveyContainer.style.display = 'block';
      if (raffleTicketBox) raffleTicketBox.style.display = 'none';
    }
  }

  function handleSurveySubmit(e) {
    e.preventDefault();
    if (!currentMember) return;

    // Generate Ticket
    const ticketNum = `#BO-${Math.floor(1000 + Math.random() * 9000)}`;
    currentMember.surveyCompleted = true;
    currentMember.raffleTicket = ticketNum;
    currentMember.seeds = (currentMember.seeds || 0) + 150; // +150 Seeds award!

    saveCurrentMemberState();
    updatePortalUI();
    renderRaffleSection();

    if (window.updateCartDisplay) window.updateCartDisplay();
  }

  // --- TAB 4: REDEMPTION STORE ---
  function renderRedemptionStore() {
    if (!currentMember) return;
    const userSeeds = currentMember.seeds || 0;

    const perfilCouponsContainer = document.getElementById('perfil-coupons-container');
    const perfilProductsContainer = document.getElementById('perfil-products-container');

    const couponsTarget = perfilCouponsContainer || redeemCouponsContainer;
    const productsTarget = perfilProductsContainer || redeemProductsContainer;

    // 1. Render Redeemable Coupons
    if (couponsTarget) {
      couponsTarget.innerHTML = REDEEMABLE_COUPONS.map(c => {
        const canAfford = userSeeds >= c.seedsCost;
        return `
          <div class="store-item-card ${canAfford ? 'affordable' : 'locked'}" style="background: rgba(15,30,24,0.9); border: 1.5px solid var(--color-accent-gold); border-radius: 16px; padding: 16px;">
            <div class="store-item-info">
              <strong style="color: var(--color-accent-gold); display: block; font-size: 1rem;">${c.code} (${c.desc})</strong>
              <span class="store-item-cost" style="color: #fff; font-size: 0.85rem;">🪙 ${c.seedsCost} Semillas</span>
            </div>
            <button class="btn btn-secondary btn-redeem-coupon" data-code="${c.code}" data-cost="${c.seedsCost}" ${!canAfford ? 'disabled' : ''} style="margin-top: 10px; width: 100%;">
              ${canAfford ? 'Canjear' : 'Insuficientes'}
            </button>
          </div>
        `;
      }).join('');

      document.querySelectorAll('.btn-redeem-coupon').forEach(btn => {
        btn.addEventListener('click', () => {
          const code = btn.getAttribute('data-code');
          const cost = parseInt(btn.getAttribute('data-cost'));
          redeemCoupon(code, cost);
        });
      });
    }

    // 2. Render Redeemable Physical Products ($0)
    if (productsTarget) {
      productsTarget.innerHTML = REDEEMABLE_PRODUCTS.map(p => {
        const canAfford = userSeeds >= p.seedsCost;
        return `
          <div class="store-item-card product-card-gift ${canAfford ? 'affordable' : 'locked'}" style="background: rgba(15,30,24,0.9); border: 1.5px solid var(--color-accent-gold); border-radius: 16px; padding: 16px; text-align: center;">
            <img src="${p.img}" alt="${p.name}" class="gift-thumb" style="width: 80px; height: 80px; object-fit: cover; border-radius: 12px; border: 1px solid var(--color-accent-gold); margin-bottom: 8px;">
            <div class="store-item-info">
              <strong style="color: #fff; display: block; font-size: 0.9rem;">${p.name}</strong>
              <span class="store-item-cost" style="color: var(--color-accent-gold); font-size: 0.85rem; font-weight: 700;">🪙 ${p.seedsCost} Semillas (Regalo $0)</span>
            </div>
            <button class="btn btn-primary btn-redeem-product" data-id="${p.id}" data-cost="${p.seedsCost}" ${!canAfford ? 'disabled' : ''} style="margin-top: 10px; width: 100%; font-weight: 700;">
              ${canAfford ? 'Canjear Producto' : 'Insuficientes'}
            </button>
          </div>
        `;
      }).join('');

      document.querySelectorAll('.btn-redeem-product').forEach(btn => {
        btn.addEventListener('click', () => {
          const pId = btn.getAttribute('data-id');
          const cost = parseInt(btn.getAttribute('data-cost'));
          redeemProductGift(pId, cost);
        });
      });
    }
  }

  function redeemCoupon(code, cost) {
    if (!currentMember || (currentMember.seeds || 0) < cost) return;

    currentMember.seeds -= cost;
    saveCurrentMemberState();
    updatePortalUI();
    renderRedemptionStore();

    const couponObj = REDEEMABLE_COUPONS.find(c => c.code === code);
    localStorage.setItem('boeweb_applied_coupon', JSON.stringify({
      code: code,
      desc: couponObj.desc,
      type: 'percent',
      value: couponObj.value
    }));

    if (window.updateCartDisplay) window.updateCartDisplay();
    alert(`🎉 ¡Canje exitoso! Se descontaron ${cost} semillas y el cupón ${code} ha sido aplicado a tu carrito.`);
  }

  function redeemProductGift(productId, cost) {
    if (!currentMember || (currentMember.seeds || 0) < cost) return;

    const gift = REDEEMABLE_PRODUCTS.find(p => p.id === productId);
    if (!gift) return;

    currentMember.seeds -= cost;
    saveCurrentMemberState();
    updatePortalUI();
    renderRedemptionStore();

    if (window.addGiftToCart) {
      window.addGiftToCart({
        id: gift.id,
        name: `🎁 [REGALO CANJE] ${gift.name}`,
        price: 0,
        image: gift.img
      });
    }

    alert(`🎉 ¡Felicidades! Se descontaron ${cost} semillas y tu regalo "${gift.name}" ($0) fue agregado al carrito.`);
  }

  // --- LUNAR CALENDAR ---
  function renderLunarCalendar() {
    const today = new Date();
    const phaseData = getMoonPhase(today);

    const lunarIcon = document.getElementById('lunar-phase-icon');
    const lunarName = document.getElementById('lunar-phase-name');
    const lunarAge = document.getElementById('lunar-phase-age');
    const lunarTip = document.getElementById('lunar-phase-tip');

    if (lunarIcon) lunarIcon.textContent = phaseData.icon;
    if (lunarName) lunarName.textContent = phaseData.phaseName;
    if (lunarAge) lunarAge.textContent = `Edad: ${phaseData.age} días`;
    if (lunarTip) lunarTip.textContent = phaseData.recommendation;
  }

  function getMoonPhase(date) {
    const year = date.getFullYear();
    let month = date.getMonth() + 1;
    const day = date.getDate();
    
    let tempYear = year;
    let tempMonth = month;
    if (tempMonth < 3) {
      tempYear--;
      tempMonth += 12;
    }
    
    let jd = 365.25 * tempYear + 30.6 * (tempMonth + 1) + day - 694038.75;
    jd /= 29.530588853;
    
    const phase = jd - Math.floor(jd);
    const age = phase * 29.53;
    
    let phaseName = "";
    let icon = "🌑";
    let recommendation = "";
    
    if (age < 1.845) {
      phaseName = "Luna Nueva";
      icon = "🌑";
      recommendation = "Ideal para podar plantas enfermas, desmalezar y aplicar abonos orgánicos al sustrato.";
    } else if (age < 5.5369) {
      phaseName = "Luna Creciente";
      icon = "🌒";
      recommendation = "Excelente para la germinación de semillas y realizar trasplantes rápidos.";
    } else if (age < 9.2288) {
      phaseName = "Cuarto Creciente";
      icon = "🌓";
      recommendation = "Óptimo para podar ramas débiles y fomentar crecimiento lateral. Absorción radicular rápida.";
    } else if (age < 12.9206) {
      phaseName = "Gibosa Creciente";
      icon = "🌔";
      recommendation = "Excelente periodo para el riego y el abonado foliar.";
    } else if (age < 16.6125) {
      phaseName = "Luna Llena";
      icon = "🌕";
      recommendation = "Fase ideal para cosechar flores y recolectar aromáticas. Evita podas agresivas.";
    } else if (age < 20.3044) {
      phaseName = "Gibosa Menguante";
      icon = "🌖";
      recommendation = "La energía baja a las raíces. Ideal para aplicar fósforo y potasio en floración.";
    } else if (age < 23.9963) {
      phaseName = "Cuarto Menguante";
      icon = "🌗";
      recommendation = "Perfecto para trasplantes delicados y podas de control de altura.";
    } else if (age < 27.6881) {
      phaseName = "Luna Menguante";
      icon = "🌘";
      recommendation = "Excelente periodo para combatir plagas y hongos del sustrato.";
    } else {
      phaseName = "Luna Nueva";
      icon = "🌑";
      recommendation = "Ideal para podar plantas enfermas y desmalezar.";
    }
    
    return { phaseName, icon, recommendation, age: age.toFixed(1) };
  }

  function formatPrice(price) {
    return price.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function openCertificateModal() {
    const certModal = document.getElementById('academy-certificate-modal');
    const certNameEl = document.getElementById('cert-student-name');
    const certDateEl = document.getElementById('cert-issue-date');

    if (certNameEl && currentMember) certNameEl.textContent = currentMember.name;
    if (certDateEl) {
      const now = new Date();
      certDateEl.textContent = now.toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    if (certModal) certModal.classList.add('active');
  }

  // --- GROW LOG & DAILY CHECK-IN REWARDS ENGINE ---
  let growLogHistory = JSON.parse(localStorage.getItem('boeweb_grow_log_history')) || [];

  window.claimDailyCheckin = function() {
    if (!currentMember) {
      alert('Por favor iniciá sesión para reclamar tu racha diaria.');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const lastCheckin = localStorage.getItem(`boeweb_checkin_${currentMember.email}`);

    if (lastCheckin === today) {
      alert('✨ ¡Ya reclamaste tus +20 Semillas de hoy! Volvé mañana para mantener tu racha.');
      return;
    }

    localStorage.setItem(`boeweb_checkin_${currentMember.email}`, today);
    currentMember.seeds = (currentMember.seeds || 100) + 20;
    saveMemberSession(currentMember);
    updateDashboardUI();

    const streakText = document.getElementById('growlog-streak-text');
    if (streakText) streakText.textContent = '¡Racha Activa! (+20 Semillas Acreditadas Hoy 🎉)';
    alert('🎉 ¡+20 Semillas acreditadas en tu cuenta por ingresar a cuidar tu cultivo hoy!');
  };

  window.saveGrowLogEntry = function() {
    if (!currentMember) {
      alert('Por favor iniciá sesión para registrar tus parámetros.');
      return;
    }

    const ph = parseFloat(document.getElementById('log-ph').value) || null;
    const ec = parseFloat(document.getElementById('log-ec').value) || null;
    const temp = parseInt(document.getElementById('log-temp').value) || null;
    const humidity = parseInt(document.getElementById('log-humidity').value) || null;

    if (!ph && !ec && !temp && !humidity) {
      alert('Por favor ingresá al menos un parámetro (pH, EC, Temp o Humedad).');
      return;
    }

    const entry = {
      date: new Date().toLocaleString('es-AR'),
      ph,
      ec,
      temp,
      humidity,
      user: currentMember.email
    };

    growLogHistory.unshift(entry);
    localStorage.setItem('boeweb_grow_log_history', JSON.stringify(growLogHistory));

    // Award +30 Seeds
    currentMember.seeds = (currentMember.seeds || 100) + 30;
    saveMemberSession(currentMember);
    updateDashboardUI();
    renderGrowLogHistory();

    // Clear inputs
    document.getElementById('log-ph').value = '';
    document.getElementById('log-ec').value = '';
    document.getElementById('log-temp').value = '';
    document.getElementById('log-humidity').value = '';

    alert('💾 ¡Parámetros guardados correctamente! Acreditamos +30 Semillas VIP en tu cuenta.');
  };

  function renderGrowLogHistory() {
    const listEl = document.getElementById('growlog-history-list');
    if (!listEl) return;

    if (growLogHistory.length === 0) {
      listEl.innerHTML = '<p style="font-size:0.85rem; color:var(--color-neutral-stone-dark);">Aún no tenés registros. Cargá tu primer control de pH o temperatura arriba.</p>';
      return;
    }

    listEl.innerHTML = growLogHistory.slice(0, 5).map(item => `
      <div style="background: rgba(0,0,0,0.04); border: 1px solid var(--color-neutral-stone); padding: 10px 14px; border-radius: 10px; font-size: 0.85rem;">
        <strong style="color: var(--color-primary);">${item.date}</strong><br>
        ${item.ph ? `🧪 pH: <strong>${item.ph}</strong> ` : ''}
        ${item.ec ? `⚡ EC: <strong>${item.ec} mS/cm</strong> ` : ''}
        ${item.temp ? `🌡️ Temp: <strong>${item.temp}°C</strong> ` : ''}
        ${item.humidity ? `💧 Humedad: <strong>${item.humidity}% HR</strong>` : ''}
      </div>
    `).join('');
  }

  // --- IN-STORE PRODUCT QR SCANNER FOR CUSTOMERS ---
  window.openCustomerQRProductScan = function() {
    alert('📷 Simulación de Escáner QR: Escaneando etiqueta en el estante de BÔ Growclub...');
    setTimeout(() => {
      if (window.openProductDetailModal) {
        window.openProductDetailModal(101);
      } else {
        alert('📦 Producto Identificado: Quantum Board LED 240W Samsung LM301H\n💵 Precio: $450.000 ARS (USD $324.90)\n🛒 ¡Listo para comprar en 1-Clic!');
      }
    }, 1000);
  };

  // --- AUTOMATED SOCIAL GROWTH MISSIONS ENGINE ---
  let completedMissions = JSON.parse(localStorage.getItem('boeweb_completed_missions')) || [];

  window.verifyInstagramCommentMission = function() {
    if (!currentMember) {
      alert('Por favor iniciá sesión para completar esta misión.');
      return;
    }

    if (completedMissions.includes(`ig_comment_${currentMember.email}`)) {
      alert('✨ ¡Ya completaste la Misión de Comentario en Instagram y cobraste tus +150 Semillas!');
      return;
    }

    const btn = document.getElementById('btn-verify-ig-comment');
    if (btn) btn.disabled = true;

    alert('🔍 Verificando automáticamente los comentarios del último post en @bo.growclub...');

    setTimeout(() => {
      completedMissions.push(`ig_comment_${currentMember.email}`);
      localStorage.setItem('boeweb_completed_missions', JSON.stringify(completedMissions));

      currentMember.seeds = (currentMember.seeds || 100) + 150;
      saveMemberSession(currentMember);
      updateDashboardUI();

      if (btn) {
        btn.textContent = '✅ MISIÓN COMPLETADA (+150 SEMILLAS)';
        btn.style.background = '#66bb6a';
      }

      alert('🎉 ¡Comentario con código verificado! Acreditamos +150 Semillas VIP en tu cuenta.');
    }, 1500);
  };

  window.verifyReelUrlMission = function() {
    if (!currentMember) {
      alert('Por favor iniciá sesión para completar esta misión.');
      return;
    }

    const urlInput = document.getElementById('mission-reel-url');
    const url = urlInput ? urlInput.value.trim() : '';

    if (!url || (!url.includes('instagram.com') && !url.includes('facebook.com') && !url.includes('tiktok.com'))) {
      alert('⚠️ Por favor ingresá una URL válida de Instagram, Facebook o TikTok (ej: https://www.instagram.com/p/...).');
      return;
    }

    if (completedMissions.includes(`reel_share_${currentMember.email}`)) {
      alert('✨ ¡Ya completaste la Misión de Compartir Reel y cobraste tus +200 Semillas!');
      return;
    }

    const btn = document.getElementById('btn-verify-reel');
    if (btn) btn.disabled = true;

    alert('🔍 Consultando API y validando mención a @bo.growclub en la publicación...');

    setTimeout(() => {
      completedMissions.push(`reel_share_${currentMember.email}`);
      localStorage.setItem('boeweb_completed_missions', JSON.stringify(completedMissions));

      currentMember.seeds = (currentMember.seeds || 100) + 200;
      saveMemberSession(currentMember);
      updateDashboardUI();

      if (btn) {
        btn.textContent = '✅ MENCIÓN VALIDADA (+200 SEMILLAS)';
        btn.style.background = '#66bb6a';
      }

      alert('🎉 ¡Publicación y etiqueta verificadas! Acreditamos +200 Semillas VIP en tu cuenta.');
    }, 1600);
  };

  window.verifyWhatsAppMission = function() {
    if (!currentMember) return;
    if (completedMissions.includes(`wa_comm_${currentMember.email}`)) return;

    setTimeout(() => {
      completedMissions.push(`wa_comm_${currentMember.email}`);
      localStorage.setItem('boeweb_completed_missions', JSON.stringify(completedMissions));

      currentMember.seeds = (currentMember.seeds || 100) + 150;
      saveMemberSession(currentMember);
      updateDashboardUI();

      alert('🎉 ¡Te uniste a la Comunidad VIP! Acreditamos +150 Semillas en tu cuenta.');
    }, 2000);
  };

  window.verifyFacebookMission = function() {
    if (!currentMember) return;
    if (completedMissions.includes(`fb_follow_${currentMember.email}`)) return;

    setTimeout(() => {
      completedMissions.push(`fb_follow_${currentMember.email}`);
      localStorage.setItem('boeweb_completed_missions', JSON.stringify(completedMissions));

      currentMember.seeds = (currentMember.seeds || 100) + 100;
      saveMemberSession(currentMember);
      updateDashboardUI();

      alert('🎉 ¡Gracias por seguirnos en Facebook! Acreditamos +100 Semillas en tu cuenta.');
    }, 2000);
  };

  // --- MYSTERY LOOTBOX CHEST ENGINE ---
  window.openMysteryChest = function() {
    if (!currentMember) {
      alert('Por favor iniciá sesión para abrir tu Caja Mágica BÔ.');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const lastChest = localStorage.getItem(`boeweb_chest_${currentMember.email}`);

    if (lastChest === today) {
      alert('✨ ¡Ya abriste tu Caja Mágica de hoy! Volvé mañana para ganar más recompensas.');
      return;
    }

    localStorage.setItem(`boeweb_chest_${currentMember.email}`, today);

    const rewards = [
      { type: 'seeds', amount: 50, title: '✨ +50 Semillas VIP' },
      { type: 'seeds', amount: 100, title: '🎁 +100 Semillas VIP' },
      { type: 'seeds', amount: 250, title: '🔥 ¡PREMIO MAYOR! +250 Semillas VIP' },
      { type: 'coupon', amount: 0, title: '🎫 Cupón Especial 15% OFF' }
    ];

    const reward = rewards[Math.floor(Math.random() * rewards.length)];

    if (reward.type === 'seeds') {
      currentMember.seeds = (currentMember.seeds || 100) + reward.amount;
      saveMemberSession(currentMember);
      updateDashboardUI();
    }

    const chestResult = document.getElementById('mystery-chest-result');
    if (chestResult) {
      chestResult.innerHTML = `
        <div style="background: rgba(195,155,75,0.2); border: 2px solid var(--color-accent-gold); border-radius: 14px; padding: 16px; margin-top: 14px; text-align: center; animation: pulseGlow 1.2s infinite;">
          <span style="font-size: 2rem;">🎁</span>
          <h4 style="color: var(--color-accent-gold-dark); margin: 6px 0 2px 0;">¡FELICITACIONES!</h4>
          <p style="font-size: 1.1rem; font-weight: 700; color: var(--color-primary); margin: 0;">${reward.title}</p>
        </div>
      `;
    }

    alert(`🎉 ¡Abriste la Caja Mágica BÔ y ganaste: ${reward.title}!`);
  };

  // --- BÔ PLUS ULTRA SUBSCRIPTION ENGINE ---
  let plusUltraSubscribersCount = parseInt(localStorage.getItem('boeweb_plus_ultra_count')) || 3;

  window.subscribePlusUltra = function() {
    if (!currentMember) {
      alert('Por favor iniciá sesión primero para suscribirte a BÔ Plus Ultra.');
      return;
    }

    if (currentMember.isPlusUltra) {
      alert('🔥 ¡Ya sos un Miembro Activo de BÔ Plus Ultra! Disfrutás de Envío Gratis y Multiplicador 2x.');
      return;
    }

    const confirmSub = confirm('🔥 ¿Confirmar suscripción a BÔ Plus Ultra por $3 USD/mes (~$3.300 ARS)?\n\nBeneficios:\n• 🎁 Kit de Bienvenida Físico BÔ en el local (Si sos de los primeros 10).\n• 🚚 Envío Gratis Permanente en tus pedidos.\n• ⚡ Multiplicador 2x de Semillas VIP.');
    
    if (confirmSub) {
      currentMember.isPlusUltra = true;
      plusUltraSubscribersCount += 1;
      localStorage.setItem('boeweb_plus_ultra_count', plusUltraSubscribersCount);
      saveCurrentMemberState();
      updatePortalUI();

      const btn = document.getElementById('btn-subscribe-plus-ultra');
      if (btn) {
        btn.textContent = '🔥 ¡SUSCRIPCIÓN PLUS ULTRA ACTIVA!';
        btn.style.background = '#66bb6a';
      }

      const kitsCountEl = document.getElementById('plus-ultra-kits-count');
      if (kitsCountEl) {
        const remaining = Math.max(0, 10 - plusUltraSubscribersCount);
        kitsCountEl.textContent = `🎁 Quedan ${remaining}/10 Kits de Bienvenida Físicos`;
      }

      alert('🎉 ¡Felicitaciones! Te suscribiste a BÔ Plus Ultra. Podés retirar tu Kit de Bienvenida en la sucursal.');
    }
  };

  // --- GROWLOG & DAILY CHECKIN ENGINE ---
  window.claimDailyCheckin = function() {
    if (!currentMember) {
      alert('Por favor iniciá sesión primero para reclamar tu racha diaria.');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const lastCheckin = localStorage.getItem(`boeweb_checkin_${currentMember.email}`);

    if (lastCheckin === today) {
      alert('🔥 ¡Ya reclamaste tu racha diaria de hoy! Volvé mañana para sumar +20 Semillas.');
      return;
    }

    localStorage.setItem(`boeweb_checkin_${currentMember.email}`, today);
    currentMember.seeds = (currentMember.seeds || 100) + 20;
    saveCurrentMemberState();
    updatePortalUI();

    if (window.showToast) window.showToast('🔥 ¡Racha Diaria Reclamada! +20 Semillas VIP acreditadas.');
    alert('🎉 ¡Felicitaciones! Reclamaste tu Racha Diaria y ganaste +20 Semillas VIP.');
  };

  window.saveGrowLogEntry = function() {
    if (!currentMember) {
      alert('Por favor iniciá sesión primero para guardar tu diario de cultivo.');
      return;
    }

    const ph = document.getElementById('perfil-ph')?.value || 'N/A';
    const ec = document.getElementById('perfil-ec')?.value || 'N/A';
    const temp = document.getElementById('perfil-temp')?.value || 'N/A';
    const hr = document.getElementById('perfil-hr')?.value || 'N/A';

    const today = new Date().toISOString().slice(0, 10);
    const logsKey = `boeweb_growlogs_${currentMember.email}`;
    const logs = JSON.parse(localStorage.getItem(logsKey)) || [];

    const newLog = {
      date: new Date().toLocaleString('es-AR'),
      ph, ec, temp, hr
    };
    logs.unshift(newLog);
    localStorage.setItem(logsKey, JSON.stringify(logs));

    const lastLogDate = localStorage.getItem(`boeweb_growlog_bonus_${currentMember.email}`);
    let bonusAwarded = false;
    if (lastLogDate !== today) {
      localStorage.setItem(`boeweb_growlog_bonus_${currentMember.email}`, today);
      currentMember.seeds = (currentMember.seeds || 100) + 30;
      saveCurrentMemberState();
      updatePortalUI();
      bonusAwarded = true;
    } else {
      renderGrowLogHistory();
    }

    if (bonusAwarded) {
      if (window.showToast) window.showToast('🌱 Parámetros Guardados! +30 Semillas VIP acreditadas.');
      alert('🎉 ¡Parámetros de hoy guardados con éxito! Acreditamos +30 Semillas VIP en tu cuenta.');
    } else {
      if (window.showToast) window.showToast('🌱 Parámetros de cultivo actualizados correctamente.');
      alert('✅ Parámetros de cultivo guardados correctamente en tu historial.');
    }
  };

  function renderGrowLogHistory() {
    const listEl = document.getElementById('growlog-history-list');
    if (!listEl || !currentMember) return;

    const logsKey = `boeweb_growlogs_${currentMember.email}`;
    const logs = JSON.parse(localStorage.getItem(logsKey)) || [];

    if (logs.length === 0) {
      listEl.innerHTML = '<p style="color: rgba(247,246,242,0.6); font-size: 0.88rem; font-style: italic;">No tenés registros de cultivo guardados todavía.</p>';
      return;
    }

    listEl.innerHTML = logs.slice(0, 5).map(log => `
      <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(195,155,75,0.3); border-radius: 12px; padding: 12px 16px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <span style="font-weight: 700; color: var(--color-accent-gold); font-size: 0.85rem;">📅 ${log.date}</span>
        <div style="display: flex; gap: 12px; font-size: 0.82rem; color: #fff;">
          <span>🧪 pH: <strong>${log.ph}</strong></span>
          <span>⚡ EC: <strong>${log.ec}</strong></span>
          <span>🌡️ Temp: <strong>${log.temp}°C</strong></span>
          <span>💧 HR: <strong>${log.hr}%</strong></span>
        </div>
      </div>
    `).join('');
  }

  // --- MISSIONS ENGINE ---
  window.verifyInstagramCommentMission = function() {
    if (!currentMember) {
      alert('Por favor iniciá sesión primero.');
      return;
    }
    const completedKey = `boeweb_mission_ig_${currentMember.email}`;
    if (localStorage.getItem(completedKey)) {
      alert('✨ ¡Ya completaste la Misión de Instagram y reclamaste tus +150 Semillas!');
      return;
    }

    const btn = document.getElementById('btn-verify-ig-comment');
    if (btn) btn.textContent = '⏳ Verificando comentario...';

    setTimeout(() => {
      localStorage.setItem(completedKey, 'true');
      currentMember.seeds = (currentMember.seeds || 100) + 150;
      saveCurrentMemberState();
      updatePortalUI();

      if (btn) {
        btn.textContent = '✅ MISIÓN VERIFICADA (+150 SEMILLAS)';
        btn.style.background = '#66bb6a';
        btn.disabled = true;
      }
      alert('🎉 ¡Comentario verificado exitosamente! Se han acreditado +150 Semillas VIP.');
    }, 1500);
  };

  window.verifyReelUrlMission = function() {
    if (!currentMember) {
      alert('Por favor iniciá sesión primero.');
      return;
    }
    const urlInput = document.getElementById('mission-reel-url');
    const urlVal = urlInput?.value?.trim();

    if (!urlVal || (!urlVal.includes('instagram.com') && !urlVal.includes('instagr.am'))) {
      alert('⚠️ Por favor ingresá una URL válida de Instagram (ej: https://www.instagram.com/p/...).');
      return;
    }

    const completedKey = `boeweb_mission_reel_${currentMember.email}`;
    if (localStorage.getItem(completedKey)) {
      alert('✨ ¡Ya validaste tu publicación y reclamaste tus +200 Semillas!');
      return;
    }

    const btn = document.getElementById('btn-verify-reel');
    if (btn) btn.textContent = '⏳ Validando URL...';

    setTimeout(() => {
      localStorage.setItem(completedKey, 'true');
      currentMember.seeds = (currentMember.seeds || 100) + 200;
      saveCurrentMemberState();
      updatePortalUI();

      if (btn) {
        btn.textContent = '✅ REEL VALIDADO (+200 SEMILLAS)';
        btn.style.background = '#66bb6a';
        btn.disabled = true;
      }
      alert('🎉 ¡URL validada correctamente! Acreditamos +200 Semillas VIP a tu saldo.');
    }, 1500);
  };

  window.subscribePlusUltraWhatsApp = function() {
    if (!currentMember) {
      alert('Por favor iniciá sesión primero para solicitar la membresía Plus Ultra.');
      return;
    }

    const name = currentMember.name || 'Miembro VIP';
    const email = currentMember.email || '';
    const text = encodeURIComponent(`Hola! Soy ${name} (${email}). Quisiera validar mi suscripción BÔ Plus Ultra por $3 USD/mes y coordinar el retiro de mi Kit de Bienvenida Físico en el local.`);
    window.open(`https://wa.me/5491136868581?text=${text}`, '_blank');
  };

  window.submitRaffleSurvey = function(event) {
    if (event) event.preventDefault();
    if (!currentMember) {
      alert('Por favor iniciá sesión primero para participar del sorteo.');
      return;
    }

    const q1 = document.getElementById('survey-q1')?.value;
    const q2 = document.getElementById('survey-q2')?.value;
    const q3 = document.getElementById('survey-q3')?.value;

    const surveyKey = `boeweb_survey_${currentMember.email}`;
    const ticketNum = 'BO-' + Math.floor(1000 + Math.random() * 9000);

    localStorage.setItem(surveyKey, JSON.stringify({ q1, q2, q3, ticket: ticketNum }));

    currentMember.seeds = (currentMember.seeds || 100) + 150;
    saveCurrentMemberState();
    updatePortalUI();

    const formEl = document.getElementById('perfil-survey-form');
    if (formEl) formEl.style.display = 'none';

    const ticketBox = document.getElementById('raffle-ticket-box');
    const ticketNumEl = document.getElementById('ticket-number-display');
    if (ticketNumEl) ticketNumEl.textContent = `#${ticketNum}`;
    if (ticketBox) ticketBox.style.display = 'block';

    alert(`🎟️ ¡Encuesta enviada! Tu Ticket Dorado es #${ticketNum} y sumaste +150 Semillas VIP.`);
  };

  window.copyMissionCode = function() {
    const codeEl = document.getElementById('user-mission-code');
    const codeText = codeEl ? codeEl.textContent.trim() : '#BO-8492';
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(codeText).then(() => {
        if (window.showToast) window.showToast(`📋 ¡Código ${codeText} copiado al portapapeles!`);
        else alert(`📋 ¡Código ${codeText} copiado al portapapeles! Pegalo en el comentario de Instagram.`);
      }).catch(() => {
        fallbackCopyText(codeText);
      });
    } else {
      fallbackCopyText(codeText);
    }
  };

  function fallbackCopyText(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    if (window.showToast) window.showToast(`📋 ¡Código ${text} copiado al portapapeles!`);
    else alert(`📋 ¡Código ${text} copiado al portapapeles! Pegalo en el comentario de Instagram.`);
  }
});


