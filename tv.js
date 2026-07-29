// BÔ Growclub - Motor de Cartelería Digital TV & Espacio Publicitario (v1.0)

document.addEventListener('DOMContentLoaded', () => {
  startLiveClock();
  initAdCarousel();
});

// 1. Live Digital Clock Widget
function startLiveClock() {
  const clockEl = document.getElementById('tv-clock-display');
  function updateTime() {
    if (!clockEl) return;
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    clockEl.textContent = `${hours}:${minutes}:${seconds}`;
  }
  updateTime();
  setInterval(updateTime, 1000);
}

// 2. Promotional Sponsored Brands & Products Carousel Data
const promoCampaigns = [
  {
    badge: "⭐ SPONSOR DESTACADO / CULTIVO ORGANICO",
    title: "Sustratos Profesional Growmix MultiPro",
    desc: "Turba de Sphagnum y compost orgánico de alta aireación. Formulación amortiguadora ideal para siembra y trasplantes en Indoor.",
    img: "https://acdn-us.mitiendanube.com/stores/001/425/734/products/18771-beab017604ca43b5e716119470508767-1024-1024.webp",
    promoLabel: "🎁 10% OFF al llevar 2 unidades o más en caja:",
    promoCode: "#GROWMIX-10"
  },
  {
    badge: "🔥 MARCA OFICIAL / FOTOBIOLOGÍA LED",
    title: "Paneles LED Quantum Board Samsung LM301H",
    desc: "Máxima eficiencia fotosintética (2.9 µmol/J), espectro completo con UV y Far-Red para resinas terpénicas más concentradas.",
    img: "assets/logo.jpg",
    promoLabel: "⚡ Cuponera Exclusiva TV Local:",
    promoCode: "#SAMSUNG-LED"
  },
  {
    badge: "🌿 NUTRICIÓN VEGETAL & TERPENOS",
    title: "Línea de Nutrientes Orgánicos BÔ Bio-Boost",
    desc: "Bioestimulantes concentrados y fito-hormonas para raíces explosivas y cogollos densos sin residuos químicos.",
    img: "assets/logo.jpg",
    promoLabel: "🎁 Regalo sorpresa en tu compra:",
    promoCode: "#NUTRI-BO"
  },
  {
    badge: "💨 VAPORIZADORES & ATENCIÓN ZEN",
    title: "Vaporización de Hierbas Secas Premium",
    desc: "Control de temperatura digital de 100°C a 220°C para extraer puros aceites esenciales y flavonoides en cada sesión.",
    img: "assets/logo.jpg",
    promoLabel: "🎫 15% OFF en Accesorios de Vapeo:",
    promoCode: "#VAPE-ZEN15"
  },
  {
    badge: "🏆 CLUB DE MIEMBROS & BENEFICIOS VIP",
    title: "Sumate al Club BÔ & Ganá Semillas",
    desc: "Escaneá el código QR para registrarte gratis. Ganá puntos en cada compra, cursos en la Academia y sorteos mensuales.",
    img: "assets/logo.jpg",
    promoLabel: "✨ +100 Semillas Gratis al Registrarte:",
    promoCode: "#CLUB-BO-VIP"
  }
];

let currentCampaignIndex = 0;
const DURATION_PER_SLIDE = 7000; // 7 seconds per ad slide

function initAdCarousel() {
  showCampaign(0);
  startProgressLoop();
}

function showCampaign(index) {
  const c = promoCampaigns[index];
  if (!c) return;

  const titleEl = document.getElementById('tv-ad-title');
  const descEl = document.getElementById('tv-ad-desc');
  const imgEl = document.getElementById('tv-ad-img');
  const labelEl = document.getElementById('tv-ad-promo-label');
  const codeEl = document.getElementById('tv-ad-promo-code');

  if (titleEl) titleEl.textContent = c.title;
  if (descEl) descEl.textContent = c.desc;
  if (labelEl) labelEl.textContent = c.promoLabel;
  if (codeEl) codeEl.textContent = c.promoCode;
  
  if (imgEl) {
    imgEl.style.opacity = '0';
    setTimeout(() => {
      imgEl.src = c.img;
      imgEl.style.opacity = '1';
    }, 200);
  }
}

function startProgressLoop() {
  const fillEl = document.getElementById('tv-progress-fill');
  let startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / DURATION_PER_SLIDE);

    if (fillEl) fillEl.style.width = `${progress * 100}%`;

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      // Next Campaign Slide
      currentCampaignIndex = (currentCampaignIndex + 1) % promoCampaigns.length;
      showCampaign(currentCampaignIndex);
      startTime = performance.now();
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}
