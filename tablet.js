// BÔ Growclub - Motor de Juegos Presenciales para Tablet (v2.6)

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
  document.getElementById('prize-title').textContent = title;
  document.getElementById('prize-code').textContent = code;
  document.getElementById('modal-prize').classList.add('active');
}

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
  
  for (let i = 0; i < numSegments; i++) {
    const angle = i * anglePerSegment;
    ctx.beginPath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.moveTo(170, 170);
    ctx.arc(170, 170, 160, angle, angle + anglePerSegment);
    ctx.fill();
    ctx.stroke();

    // Segment Text
    ctx.save();
    ctx.translate(170, 170);
    ctx.rotate(angle + anglePerSegment / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Outfit';
    ctx.fillText(wheelPrizes[i].text, 140, 5);
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
  const targetRotation = 1440 + Math.floor(Math.random() * 360); // 4 full spins + random stop
  const startTime = performance.now();

  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(1, elapsed / 3500); // 3.5 seconds
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
    r1.textContent = slotSymbols[Math.floor(Math.random() * slotSymbols.length)];
    r2.textContent = slotSymbols[Math.floor(Math.random() * slotSymbols.length)];
    r3.textContent = slotSymbols[Math.floor(Math.random() * slotSymbols.length)];
    count++;

    if (count > 20) {
      clearInterval(interval);
      isSpinningSlots = false;
      if (btn) btn.disabled = false;
      const finalSymbol = slotSymbols[Math.floor(Math.random() * slotSymbols.length)];
      r1.textContent = finalSymbol;
      r2.textContent = finalSymbol;
      r3.textContent = finalSymbol;

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

  // Fill canvas with gold foil
  ctx.fillStyle = '#c39b4b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0f1e18';
  ctx.font = 'bold 16px Outfit';
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
    ctx.arc(x, y, 25, 0, Math.PI * 2);
    ctx.fill();
  }

  canvas.onmousedown = canvas.ontouchstart = () => { isScratching = true; };
  canvas.onmouseup = canvas.ontouchend = () => { isScratching = false; };
  canvas.onmousemove = canvas.ontouchmove = (e) => scratch(e);
}
