// BÔ Growclub - Motor de Juegos Presenciales para Tablet (v2.7)

let currentPrizeTitle = '';
let currentPrizeCode = '';
let currentCustomerWA = '';

document.addEventListener('DOMContentLoaded', () => {
  initWheelCanvas();
  initScratchCanvas();
});

// Game Navigation
window.openGameModal = function(gameId) {
  closeGameModals();
  const modal = document.getElementById(`modal-${gameId}`);
  if (modal) modal.classList.add('active');
  if (gameId === 'scratch') initScratchCanvas();
};

window.closeGameModals = function() {
  document.querySelectorAll('.game-modal').forEach(m => m.classList.remove('active'));
};

function showPrizePopup(title, code) {
  closeGameModals();
  currentPrizeTitle = title;
  currentPrizeCode = code;

  const titleEl = document.getElementById('prize-title');
  const codeEl = document.getElementById('prize-code');
  if (titleEl) titleEl.textContent = title;
  if (codeEl) codeEl.textContent = code;

  // Reset steps: Step 1 asks for WhatsApp, Step 2 is for vendor
  const stepWA = document.getElementById('prize-step-whatsapp');
  const stepVendor = document.getElementById('prize-step-vendor');
  const inputWA = document.getElementById('customer-whatsapp-input');

  if (stepWA) stepWA.style.display = 'block';
  if (stepVendor) stepVendor.style.display = 'none';
  if (inputWA) inputWA.value = '';

  const modalPrize = document.getElementById('modal-prize');
  if (modalPrize) modalPrize.classList.add('active');
}

// Step 1: Customer without account submits WhatsApp
window.submitPrizeWhatsApp = function() {
  const waInput = document.getElementById('customer-whatsapp-input');
  const waVal = waInput ? waInput.value.trim() : '';

  if (!waVal) {
    alert('Por favor, ingresá un número de WhatsApp válido.');
    return;
  }

  currentCustomerWA = waVal;
  const regDisplay = document.getElementById('registered-whatsapp-display');
  if (regDisplay) regDisplay.textContent = `📱 Registrado: ${waVal}`;

  // Switch to Vendor Step
  const stepWA = document.getElementById('prize-step-whatsapp');
  const stepVendor = document.getElementById('prize-step-vendor');

  if (stepWA) stepWA.style.display = 'none';
  if (stepVendor) stepVendor.style.display = 'block';

  // Reset validation button state
  const btn = document.getElementById('btn-vendor-validate-wa');
  if (btn) {
    btn.style.background = '#25D366';
    btn.innerHTML = '<span style="font-size: 1rem;">🟢</span> Validar & Enviar Invitación WhatsApp';
  }
};

// Step 2: Vendor 1-Click WhatsApp Community Invitation
window.vendorValidateAndSendWA = function() {
  const waVal = currentCustomerWA || document.getElementById('customer-whatsapp-input')?.value || '';
  const cleanPhone = waVal.replace(/[^0-9]/g, '');

  const registerUrl = `${window.location.origin}/perfil.html`;

  const message = `¡Hola! 👋 Gracias por tu visita a BÔ growclub.

🎉 Tu premio ganado en la Tablet: *${currentPrizeTitle}* (Código: *${currentPrizeCode}*).

🌱 Te invitamos a unirte GRATIS a nuestra Comunidad VIP para acceder a todos tus beneficios:
• 🎟️ Descuentos y Promos Exclusivas
• 📚 Cursos gratis en la Academia de Cultivo
• 🎛️ Registro Diario de Indoor y Calendario Lunar
• 🎁 Canje de puntos y semillas por premios de $0

👉 Registrate gratis aquí: ${registerUrl}

¡Te esperamos pronto de nuevo en el local! 🌿`;

  const encodedMsg = encodeURIComponent(message);
  const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodedMsg}` : `https://wa.me/?text=${encodedMsg}`;

  window.open(waUrl, '_blank');

  const btn = document.getElementById('btn-vendor-validate-wa');
  if (btn) {
    btn.style.background = '#1b5e20';
    btn.innerHTML = '✅ ¡Invitación Enviada & Premio Validado!';
  }
};

// Step 2 Optional: Vendor enters tablet discount code
window.applyVendorTabletDiscount = function() {
  const codeInput = document.getElementById('vendor-tablet-discount-code');
  const feedback = document.getElementById('vendor-tablet-discount-feedback');
  const code = codeInput ? codeInput.value.trim() : '';

  if (!code) return;

  if (feedback) {
    feedback.style.display = 'block';
    feedback.textContent = `✨ Código "${code}" aplicado exitosamente en la venta.`;
  }
};

// --- GAME 1: RUEDA DE LA FORTUNA ---
const wheelPrizes = [
  { text: '5% OFF', code: '#BO-TABLET-5' },
  { text: '10% OFF', code: '#BO-TABLET-10' },
  { text: '15% OFF', code: '#BO-TABLET-15' },
  { text: '☕ Expreso Gratis', code: '#BO-TABLET-CAFE' },
  { text: '🌱 +100 Semillas', code: '#BO-TABLET-SEMILLAS' },
  { text: '🎁 Regalo sorpresa', code: '#BO-TABLET-REGALO' }
];

let isSpinningWheel = false;

function initWheelCanvas() {
  const canvas = document.getElementById('wheel-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const numSegments = wheelPrizes.length;
  const anglePerSegment = (2 * Math.PI) / numSegments;
  const colors = ['#c39b4b', '#152d24', '#2e7d32', '#0f1e18', '#b88e28', '#1b3b2f'];

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const center = canvas.width / 2;
  const radius = center - 10;

  for (let i = 0; i < numSegments; i++) {
    const angle = i * anglePerSegment;
    ctx.beginPath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, angle, angle + anglePerSegment);
    ctx.fill();
    ctx.stroke();

    // Segment Text
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(angle + anglePerSegment / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px Outfit';
    ctx.fillText(wheelPrizes[i].text, radius - 15, 4);
    ctx.restore();
  }
}

window.spinWheel = function() {
  if (isSpinningWheel) return;
  isSpinningWheel = true;
  const btn = document.getElementById('spin-wheel-btn');
  if (btn) btn.disabled = true;

  const canvas = document.getElementById('wheel-canvas');
  let currentRotation = 0;
  const targetRotation = 1440 + Math.floor(Math.random() * 360);
  const startTime = performance.now();

  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(1, elapsed / 3500);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    currentRotation = targetRotation * easeOut;

    canvas.style.transform = `rotate(${currentRotation}deg)`;

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      isSpinningWheel = false;
      if (btn) btn.disabled = false;
      const selectedIndex = Math.floor(Math.random() * wheelPrizes.length);
      const prize = wheelPrizes[selectedIndex];
      showPrizePopup(`🎡 ¡Ganaste: ${prize.text}!`, prize.code);
    }
  }

  requestAnimationFrame(animate);
};

// --- GAME 2: TRAGAMONEDAS ZEN ---
const slotSymbols = ['🌿', '☕', '🌱', '🎁', '⭐', '💎'];
let isSpinningSlots = false;

window.spinSlots = function() {
  if (isSpinningSlots) return;
  isSpinningSlots = true;
  const btn = document.getElementById('spin-slots-btn');
  if (btn) btn.disabled = true;

  const r1 = document.getElementById('reel-1');
  const r2 = document.getElementById('reel-2');
  const r3 = document.getElementById('reel-3');

  let count = 0;
  const interval = setInterval(() => {
    if (r1) r1.textContent = slotSymbols[Math.floor(Math.random() * slotSymbols.length)];
    if (r2) r2.textContent = slotSymbols[Math.floor(Math.random() * slotSymbols.length)];
    if (r3) r3.textContent = slotSymbols[Math.floor(Math.random() * slotSymbols.length)];
    count++;

    if (count > 20) {
      clearInterval(interval);
      isSpinningSlots = false;
      if (btn) btn.disabled = false;
      const finalSymbol = slotSymbols[Math.floor(Math.random() * slotSymbols.length)];
      if (r1) r1.textContent = finalSymbol;
      if (r2) r2.textContent = finalSymbol;
      if (r3) r3.textContent = finalSymbol;

      const randomCode = `#BO-SLOT-${Math.floor(1000 + Math.random() * 9000)}`;
      showPrizePopup(`🎰 ¡TRIPLE MATCH! Ganaste 15% OFF en tu compra`, randomCode);
    }
  }, 100);
};

// --- GAME 3: RASCA Y GANA DIGITAL ---
function initScratchCanvas() {
  const canvas = document.getElementById('scratch-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#c39b4b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0f1e18';
  ctx.font = 'bold 15px Outfit';
  ctx.textAlign = 'center';
  ctx.fillText('✨ RASPAS AQUÍ CON TU DEDO ✨', canvas.width / 2, canvas.height / 2);

  let isScratching = false;

  function scratch(e) {
    if (!isScratching) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();
  }

  canvas.onmousedown = canvas.ontouchstart = () => { isScratching = true; };
  canvas.onmouseup = canvas.ontouchend = () => { isScratching = false; };
  canvas.onmousemove = canvas.ontouchmove = (e) => scratch(e);
}

