/**
 * BO growclub - Member & VIP Portal Logic
 * Implements registration, tiers, loyalty points ("Semillas"), and Lunar calendar recommendations.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- STATE & DATA ---
  let currentMember = JSON.parse(localStorage.getItem('boeweb_member')) || null;

  // Tiers definition
  const TIERS = {
    BROTE: { name: 'Miembro Brote', discount: 0.05, minSeeds: 0, nextMin: 500, label: 'Brote (5% OFF)' },
    PLANTA: { name: 'Miembro Planta', discount: 0.10, minSeeds: 500, nextMin: 1500, label: 'Planta (10% OFF)' },
    ARBOL: { name: 'Árbol Zen VIP', discount: 0.15, minSeeds: 1500, nextMin: null, label: 'Árbol Zen (15% OFF)' }
  };

  // Coupons available per tier
  const VIP_COUPONS = [
    { code: 'VIPBROTE5', desc: '5% OFF Fijo de Bienvenida', tier: 'BROTE', value: 0.05, type: 'percent' },
    { code: 'VIPPLANTA10', desc: '10% OFF Fijo en toda la Tienda', tier: 'PLANTA', value: 0.10, type: 'percent' },
    { code: 'VIPZEN15', desc: '15% OFF + Envíos Prioritarios', tier: 'ARBOL', value: 0.15, type: 'percent' }
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

  // Forms & Actions
  const registerForm = document.getElementById('club-register-form');
  const logoutBtn = document.getElementById('club-logout-btn');

  // VIP Dashboard Elements
  const vipName = document.getElementById('vip-member-name');
  const vipBadge = document.getElementById('vip-member-badge');
  const vipSeeds = document.getElementById('vip-member-seeds');
  const currentTierLabel = document.getElementById('current-tier-label');
  const nextTierLabel = document.getElementById('next-tier-label');
  const progressFill = document.getElementById('vip-progress-fill');
  const progressText = document.getElementById('vip-progress-text');
  const couponsContainer = document.getElementById('vip-coupons-container');

  // Lunar Elements
  const lunarIcon = document.getElementById('lunar-phase-icon');
  const lunarName = document.getElementById('lunar-phase-name');
  const lunarAge = document.getElementById('lunar-phase-age');
  const lunarTip = document.getElementById('lunar-phase-tip');

  // --- INITIALIZATION ---
  updateClubButtons();

  // --- EVENT LISTENERS ---
  if (clubTrigger) {
    clubTrigger.addEventListener('click', openMemberPortal);
  }
  if (mobileClubBtn) {
    mobileClubBtn.addEventListener('click', () => {
      openMemberPortal();
      // Remove active class from other mobile buttons and add here
      document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.classList.remove('active'));
      mobileClubBtn.classList.add('active');
    });
  }

  // Modal Closures
  if (closeAuthBtn) {
    closeAuthBtn.addEventListener('click', () => toggleModal(authModal, false));
  }
  if (closePortalBtn) {
    closePortalBtn.addEventListener('click', () => toggleModal(portalModal, false));
  }

  // Handle outside clicks
  [authModal, portalModal].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          toggleModal(modal, false);
        }
      });
    }
  });

  // Forms
  if (registerForm) {
    registerForm.addEventListener('submit', handleRegistration);
  }
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // --- FUNCTIONS ---

  function toggleModal(modal, show) {
    if (!modal) return;
    if (show) {
      modal.classList.add('active');
    } else {
      modal.classList.remove('active');
    }
  }

  function openMemberPortal() {
    if (currentMember) {
      updatePortalUI();
      toggleModal(portalModal, true);
    } else {
      toggleModal(authModal, true);
    }
  }

  function handleRegistration(e) {
    e.preventDefault();
    const name = document.getElementById('member-name').value.trim();
    const email = document.getElementById('member-email').value.trim();
    const phone = document.getElementById('member-phone').value.trim();
    const growType = document.getElementById('member-growtype').value;

    if (!name || !email || !phone) return;

    currentMember = {
      name,
      email,
      phone,
      growType,
      seeds: 100, // 100 seeds welcome bonus!
      joinedAt: new Date().toISOString()
    };

    localStorage.setItem('boeweb_member', JSON.stringify(currentMember));
    updateClubButtons();

    // Close Register Modal & Open Portal Dashboard
    toggleModal(authModal, false);
    
    // Smooth transition
    setTimeout(() => {
      openMemberPortal();
    }, 300);

    // If global cart update exists, refresh it to show club discounts
    if (window.updateCartDisplay) {
      window.updateCartDisplay();
    }
  }

  function handleLogout() {
    localStorage.removeItem('boeweb_member');
    currentMember = null;
    updateClubButtons();
    toggleModal(portalModal, false);

    // Reset mobile active state back to Shop
    const shopBtn = document.getElementById('mobile-shop-btn');
    if (shopBtn) {
      document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.classList.remove('active'));
      shopBtn.classList.add('active');
    }

    if (window.updateCartDisplay) {
      window.updateCartDisplay();
    }
  }

  function updateClubButtons() {
    const text = currentMember ? 'Perfil VIP' : 'Club BÔ';
    if (clubBtnText) {
      clubBtnText.textContent = text;
    }
  }

  function getMemberTier(seeds) {
    if (seeds >= TIERS.ARBOL.minSeeds) return TIERS.ARBOL;
    if (seeds >= TIERS.PLANTA.minSeeds) return TIERS.PLANTA;
    return TIERS.BROTE;
  }

  function updatePortalUI() {
    if (!currentMember) return;

    const nameVal = currentMember.name;
    const seedsVal = currentMember.seeds || 0;
    const tier = getMemberTier(seedsVal);

    // Basic fields
    if (vipName) vipName.textContent = nameVal;
    if (vipBadge) {
      vipBadge.textContent = tier.name;
      // Change color dynamically
      vipBadge.className = 'member-badge';
      if (tier === TIERS.ARBOL) vipBadge.classList.add('badge-gold');
      else if (tier === TIERS.PLANTA) vipBadge.classList.add('badge-silver');
      else vipBadge.classList.add('badge-bronze');
    }
    if (vipSeeds) vipSeeds.textContent = seedsVal;

    // Progress Bar Calculation
    if (currentTierLabel) currentTierLabel.textContent = tier.label;
    if (tier.nextMin !== null) {
      if (nextTierLabel) {
        const nextTier = tier === TIERS.BROTE ? TIERS.PLANTA : TIERS.ARBOL;
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
      if (nextTierLabel) nextTierLabel.textContent = 'Nivel Máximo alcanzado';
      if (progressFill) progressFill.style.width = '100%';
      if (progressText) progressText.textContent = '¡Eres un sabio Árbol Zen VIP! Disfrutas de todos los beneficios.';
    }

    // Render Lunar Calendar
    renderLunarCalendar();

    // Render Coupons
    renderVIPCoupons(tier);
  }

  function renderVIPCoupons(userTier) {
    if (!couponsContainer) return;
    couponsContainer.innerHTML = '';

    VIP_COUPONS.forEach(coupon => {
      // Check if user has sufficient tier to unlock
      const isUnlocked = getTierWeight(userTier) >= getTierWeightByName(coupon.tier);
      
      const couponCard = document.createElement('div');
      couponCard.className = `vip-coupon-card ${isUnlocked ? 'unlocked' : 'locked'}`;
      
      if (isUnlocked) {
        couponCard.innerHTML = `
          <div class="coupon-details">
            <span class="coupon-code">${coupon.code}</span>
            <span class="coupon-desc">${coupon.desc}</span>
          </div>
          <button class="btn btn-secondary btn-copy-coupon" data-code="${coupon.code}">
            Copiar
          </button>
        `;
      } else {
        const tierName = coupon.tier === 'PLANTA' ? 'Miembro Planta' : 'Árbol Zen VIP';
        couponCard.innerHTML = `
          <div class="coupon-details">
            <span class="coupon-code" style="filter: blur(4px);">XXXXXX</span>
            <span class="coupon-desc">${coupon.desc}</span>
          </div>
          <span class="lock-indicator">🔒 Nivel ${tierName}</span>
        `;
      }
      
      couponsContainer.appendChild(couponCard);
    });

    // Add copy listener
    document.querySelectorAll('.btn-copy-coupon').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const code = btn.getAttribute('data-code');
        navigator.clipboard.writeText(code).then(() => {
          const originalText = btn.textContent;
          btn.textContent = 'Copiado!';
          btn.style.backgroundColor = 'var(--color-primary)';
          btn.style.color = '#fff';
          
          // Apply automatically to active coupon in checkout
          localStorage.setItem('boeweb_applied_coupon', JSON.stringify({
            code: code,
            desc: VIP_COUPONS.find(c => c.code === code).desc,
            type: 'percent',
            value: VIP_COUPONS.find(c => c.code === code).value
          }));

          if (window.updateCartDisplay) {
            window.updateCartDisplay();
          }

          setTimeout(() => {
            btn.textContent = originalText;
            btn.style.backgroundColor = '';
            btn.style.color = '';
          }, 1500);
        });
      });
    });
  }

  function getTierWeight(tier) {
    if (tier.name === TIERS.ARBOL.name) return 3;
    if (tier.name === TIERS.PLANTA.name) return 2;
    return 1;
  }

  function getTierWeightByName(tierName) {
    if (tierName === 'ARBOL') return 3;
    if (tierName === 'PLANTA') return 2;
    return 1;
  }

  // --- LUNAR CALENDAR ALGORITHM ---
  function renderLunarCalendar() {
    const today = new Date();
    const phaseData = getMoonPhase(today);

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
    
    let jd = 365.25 * tempYear + 30.6 * (tempMonth + 1) + day - 694038.75; // days since 1900
    jd /= 29.530588853; // synodic cycle
    
    const phase = jd - Math.floor(jd); // fractional part (0.0 to 1.0)
    const age = phase * 29.53; // age in days
    
    let phaseName = "";
    let icon = "🌑";
    let recommendation = "";
    
    if (age < 1.845) {
      phaseName = "Luna Nueva";
      icon = "🌑";
      recommendation = "Ideal para podar plantas enfermas, desmalezar y aplicar abonos orgánicos al sustrato. No se recomienda germinar ni trasplantar.";
    } else if (age < 5.5369) {
      phaseName = "Luna Creciente";
      icon = "🌒";
      recommendation = "Excelente para la germinación de semillas y realizar trasplantes rápidos. La savia asciende hacia las hojas, estimulando el follaje.";
    } else if (age < 9.2288) {
      phaseName = "Cuarto Creciente";
      icon = "🌓";
      recommendation = "Óptimo para realizar podas de ramas débiles y fomentar un crecimiento lateral tupido. Las raíces absorben nutrientes rápidamente.";
    } else if (age < 12.9206) {
      phaseName = "Gibosa Creciente";
      icon = "🌔";
      recommendation = "Excelente periodo para el riego y el abonado foliar. Tus plantas están activas y receptivas al nitrógeno.";
    } else if (age < 16.6125) {
      phaseName = "Luna Llena";
      icon = "🌕";
      recommendation = "La savia se concentra en flores y cogollos. Fase ideal para cosechar o recolectar plantas aromáticas. Evita cortes de esquejes.";
    } else if (age < 20.3044) {
      phaseName = "Gibosa Menguante";
      icon = "🌖";
      recommendation = "La energía empieza a bajar a las raíces. Momento ideal para aplicar enmiendas de fósforo y potasio en floración.";
    } else if (age < 23.9963) {
      phaseName = "Cuarto Menguante";
      icon = "🌗";
      recommendation = "Fase perfecta para trasplantes delicados ya que las raíces se asientan rápido. Momento propicio para podas de control de altura.";
    } else if (age < 27.6881) {
      phaseName = "Luna Menguante";
      icon = "🌘";
      recommendation = "Excelente periodo para combatir plagas y hongos del sustrato. La savia desciende al mínimo y la planta tolera limpiezas de raíces.";
    } else {
      phaseName = "Luna Nueva";
      icon = "🌑";
      recommendation = "Ideal para podar plantas enfermas, desmalezar y aplicar abonos orgánicos al sustrato. No se recomienda germinar ni trasplantar.";
    }
    
    return { phaseName, icon, recommendation, age: age.toFixed(1) };
  }
});
