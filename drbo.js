// Dr. BÔ IA - Doctor de Cultivo con Visión Artificial
// Agronomic Plant Diagnosis Engine & 1-Click Solution Recommender

const drBoDiagnoses = {
  nitrogen: {
    title: 'Deficiencia de Nitrógeno (N)',
    badge: '⚠️ Severidad Media - Requiere Atención',
    badgeClass: 'warning',
    symptoms: 'Clorosis progresiva (hojas bajas amarillentas), nervaduras pálidas y desaceleración del crecimiento vegetativo.',
    cause: 'Falta de Nitrógeno disponible en la solución nutricia durante la fase de crecimiento o nivel de pH desbalanceado (< 6.0 o > 7.0) que bloquea su absorción.',
    treatment: 'Aplicar un fertilizante orgánico rico en Nitrógeno de rápida absorción y regular el pH del agua de riego a 6.2 - 6.5.',
    product: {
      id: 'drbo-prod-1',
      name: 'Fertilizante Vegetativo Top Crop Top Veg 250ml',
      price: 14500,
      image: 'https://images.unsplash.com/photo-1585314062340-f1a5a7c9328d?auto=format&fit=crop&w=400&q=80',
      description: 'Fórmula líquida concentrada rica en Nitrógeno orgánico, ácidos húmicos y fúlvicos para recuperar el verdor intenso.'
    }
  },
  spidermite: {
    title: 'Plaga de Arañuela Roja (Tetranychus urticae)',
    badge: '🚨 Severidad Alta - Riesgo de Pérdida',
    badgeClass: 'danger',
    symptoms: 'Punteado micro-amarillento en la cara superior de la hoja, finas telas de araña entre los entrenudos y secado del follaje.',
    cause: 'Ambientes secos con baja humedad relativa (< 40% HR) y temperaturas elevadas (> 26°C) que aceleran la reproducción de la plaga.',
    treatment: 'Fumigar con Jabón Potásico + Neem en el envés de las hojas y elevar la humedad relativa del ambiente a 60% HR.',
    product: {
      id: 'drbo-prod-2',
      name: 'Insecticida Orgánico Jabón Potásico + Neem Ecomambo 250ml',
      price: 9800,
      image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=400&q=80',
      description: 'Insecticida y acaricida 100% ecológico que disuelve el exoesqueleto de las plagas sin dejar residuos tóxicos.'
    }
  },
  phburn: {
    title: 'Bloqueo Nutricional / Quemadura de pH',
    badge: '⚠️ Severidad Alta - Desbalance de Sales',
    badgeClass: 'warning',
    symptoms: 'Bordes de las hojas marrón garra de águila (secos y crocantes), manchas necróticas marrones e imposibilidad de absorción.',
    cause: 'Acumulación excesiva de sales en el sustrato (EC > 2.4 ms/cm) o descalibración del pH que quema las radículas absorberas.',
    treatment: 'Realizar un lavado de raíces con abundante agua de osmosis o baja mineralización y medir el drenaje con medidor digital.',
    product: {
      id: 'drbo-prod-3',
      name: 'Medidor de pH Digital de Precisión + Soluciones de Calibración',
      price: 18900,
      image: 'https://images.unsplash.com/photo-1581093588401-fbb62a02f120?auto=format&fit=crop&w=400&q=80',
      description: 'Instrumento digital imprescindible para monitorear el pH exacto del riego y evitar bloqueos en el sustrato.'
    }
  },
  overwater: {
    title: 'Estrés por Riego / Asfixia Radicular',
    badge: 'ℹ️ Severidad Moderada - Manejo de Sustrato',
    badgeClass: 'info',
    symptoms: 'Hojas caídas y pesadas con forma de cuchara, turgencia excesiva en los tallos y sustrato compactado húmedo.',
    cause: 'Frecuencia de riego excesiva sin permitir el secado parcial del sustrato o macetas con drenaje deficiente que asfixian las raíces.',
    treatment: 'Pausar los riegos hasta que la maceta pierda peso, oxigenar la capa superior del sustrato y trasplantar a macetas de tela respirable.',
    product: {
      id: 'drbo-prod-4',
      name: 'Maceta Geotextil BÔ Air-Root 15 Litros',
      price: 4500,
      image: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=400&q=80',
      description: 'Maceta de tela de alta aireación que promueve la poda radicular aérea automática y previene el ahogamiento.'
    }
  }
};

let currentDrBoSelection = null;

function openDrBoModal() {
  const modal = document.getElementById('dr-bo-modal');
  if (modal) {
    modal.classList.add('active');
  }
}

function closeDrBoModal() {
  const modal = document.getElementById('dr-bo-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

function loadDrBoSample(type) {
  currentDrBoSelection = type;
  const previewBox = document.getElementById('drbo-preview-box');
  const resultsContainer = document.getElementById('drbo-results-card');

  if (resultsContainer) resultsContainer.style.display = 'none';

  let imgUrl = '';
  if (type === 'nitrogen') {
    imgUrl = 'https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?auto=format&fit=crop&w=500&q=80';
  } else if (type === 'spidermite') {
    imgUrl = 'https://images.unsplash.com/photo-1592417817098-8f3d6ef23a9f?auto=format&fit=crop&w=500&q=80';
  } else if (type === 'phburn') {
    imgUrl = 'https://images.unsplash.com/photo-1508873696983-2df515122519?auto=format&fit=crop&w=500&q=80';
  } else if (type === 'overwater') {
    imgUrl = 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=500&q=80';
  }

  if (previewBox) {
    previewBox.innerHTML = `<img src="${imgUrl}" alt="Muestra Folio" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">`;
  }
}

function runDrBoAnalysis() {
  if (!currentDrBoSelection) {
    alert('🩺 Por favor seleccioná o subí una foto de la hoja antes de consultar al Dr. BÔ.');
    return;
  }

  const scanBtn = document.getElementById('btn-run-drbo');
  const progressBox = document.getElementById('drbo-scan-progress');
  const progressBar = document.getElementById('drbo-progress-bar');
  const resultsCard = document.getElementById('drbo-results-card');

  if (scanBtn) scanBtn.disabled = true;
  if (progressBox) progressBox.style.display = 'block';
  if (progressBar) progressBar.style.width = '0%';
  if (resultsCard) resultsCard.style.display = 'none';

  setTimeout(() => {
    if (progressBar) progressBar.style.width = '100%';
  }, 100);

  setTimeout(() => {
    if (progressBox) progressBox.style.display = 'none';
    if (scanBtn) scanBtn.disabled = false;

    renderDrBoDiagnosis(currentDrBoSelection);
  }, 1800);
}

function renderDrBoDiagnosis(key) {
  const diagnosis = drBoDiagnoses[key];
  if (!diagnosis) return;

  const resultsCard = document.getElementById('drbo-results-card');
  const titleEl = document.getElementById('drbo-diag-title');
  const badgeEl = document.getElementById('drbo-diag-badge');
  const symptomsEl = document.getElementById('drbo-diag-symptoms');
  const causeEl = document.getElementById('drbo-diag-cause');
  const treatmentEl = document.getElementById('drbo-diag-treatment');

  const prodImg = document.getElementById('drbo-prod-img');
  const prodTitle = document.getElementById('drbo-prod-title');
  const prodDesc = document.getElementById('drbo-prod-desc');
  const prodPrice = document.getElementById('drbo-prod-price');
  const addBtn = document.getElementById('drbo-btn-add-cart');

  if (titleEl) titleEl.textContent = diagnosis.title;
  if (badgeEl) {
    badgeEl.textContent = diagnosis.badge;
    badgeEl.className = `drbo-badge drbo-badge-${diagnosis.badgeClass}`;
  }
  if (symptomsEl) symptomsEl.textContent = diagnosis.symptoms;
  if (causeEl) causeEl.textContent = diagnosis.cause;
  if (treatmentEl) treatmentEl.textContent = diagnosis.treatment;

  if (prodImg) prodImg.src = diagnosis.product.image;
  if (prodTitle) prodTitle.textContent = diagnosis.product.name;
  if (prodDesc) prodDesc.textContent = diagnosis.product.description;
  if (prodPrice) prodPrice.textContent = `$${diagnosis.product.price.toLocaleString('es-AR')}`;

  if (addBtn) {
    addBtn.onclick = () => addDrBoProductToCart(diagnosis.product);
  }

  if (resultsCard) {
    resultsCard.style.display = 'block';
    resultsCard.scrollIntoView({ behavior: 'smooth' });
  }
}

function addDrBoProductToCart(prod) {
  // Integrate with index.js global cart
  if (window.cart) {
    const existing = window.cart.find(item => item.name === prod.name || item.id === prod.id);
    if (existing) {
      existing.quantity = (existing.quantity || 1) + 1;
    } else {
      window.cart.push({
        id: prod.id,
        name: prod.name,
        price: prod.price,
        image: prod.image,
        quantity: 1
      });
    }

    if (window.updateCartDisplay) window.updateCartDisplay();
    alert(`🛒 ¡Excelente! Se agregó "${prod.name}" a tu carrito de compras.`);
    closeDrBoModal();
    if (window.openCart) window.openCart();
  } else {
    alert(`🛒 "${prod.name}" listo para comprar. Se agregará a tu pedido.`);
  }
}

// Event bindings
document.addEventListener('DOMContentLoaded', () => {
  const triggerBtn = document.getElementById('drbo-trigger');
  if (triggerBtn) triggerBtn.addEventListener('click', openDrBoModal);
});

// Global exposure
window.openDrBoModal = openDrBoModal;
window.closeDrBoModal = closeDrBoModal;
window.loadDrBoSample = loadDrBoSample;
window.runDrBoAnalysis = runDrBoAnalysis;
window.addDrBoProductToCart = addDrBoProductToCart;
