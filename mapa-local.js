// BÔ Grow Club — Explorador WMS de Ubicaciones Físicas y Plano Jerárquico del Local
// Navegación en 3 niveles: Sectores -> Muebles/Paredes -> Baldas N1..N6 y Productos
// Fotos de referencia ampliables (Lightbox), dictado y locución por voz y auditoría completa.

const DEFAULT_STORE_SHELVES = [
  // =========================================================================
  // SECTOR 1 (PISO 1): PARAFERNALIA
  // =========================================================================
  { id: 'sec1-pc-center', code: 'PC-CENTRO', zone_code: 'PC', name: '💻 PC Central · Sector 1 (Parafernalia)', floor_level: 1, x: 42, y: 40, width: 16, height: 16, icon: '💻', is_anchor: true },

  // =========================================================================
  // SECTOR 2 (PISO 2): SUSTRATOS
  // =========================================================================
  { id: 'sec2-pc-center', code: 'PC-CENTRO', zone_code: 'PC', name: '💻 PC Central · Sector 2 (Sustratos)', floor_level: 2, x: 42, y: 40, width: 16, height: 16, icon: '💻', is_anchor: true },

  // =========================================================================
  // SECTOR 3 (PISO 3): FERTILIZANTES
  // =========================================================================
  { id: 'sec3-pc-center', code: 'PC-CENTRO', zone_code: 'PC', name: '💻 PC Central · Sector 3 (Fertilizantes)', floor_level: 3, x: 42, y: 40, width: 16, height: 16, icon: '💻', is_anchor: true },

  // =========================================================================
  // SECTOR 4 (PISO 4): CONTROL DE PLAGAS
  // =========================================================================
  { id: 'sec4-pc-center', code: 'PC-CENTRO', zone_code: 'PC', name: '💻 PC Central · Sector 4 (Control de Plagas)', floor_level: 4, x: 42, y: 40, width: 16, height: 16, icon: '💻', is_anchor: true },

  // =========================================================================
  // SECTOR 5 (PISO 5): INDOOR Y HERRAMIENTAS
  // =========================================================================
  { id: 'sec5-pc-center', code: 'PC-CENTRO', zone_code: 'PC', name: '💻 PC Central · Sector 5 (Indoor y Herramientas)', floor_level: 5, x: 42, y: 40, width: 16, height: 16, icon: '💻', is_anchor: true },

  // =========================================================================
  // SECTOR 6 (PISO 6): BAJO ESCALERA
  // =========================================================================
  { id: 'sec6-pc-center', code: 'PC-CENTRO', zone_code: 'PC', name: '💻 PC Central · Sector 6 (Bajo Escalera)', floor_level: 6, x: 42, y: 40, width: 16, height: 16, icon: '💻', is_anchor: true }
];

const FLOOR_NAMES = {
  1: '🌿 SECTOR 1 · PARAFERNALIA (PC AL CENTRO)',
  2: '🌱 SECTOR 2 · SUSTRATOS (PC AL CENTRO)',
  3: '🧪 SECTOR 3 · FERTILIZANTES (PC AL CENTRO)',
  4: '🛡️ SECTOR 4 · CONTROL DE PLAGAS (PC AL CENTRO)',
  5: '💡 SECTOR 5 · INDOOR Y HERRAMIENTAS (PC AL CENTRO)',
  6: '📦 SECTOR 6 · BAJO ESCALERA (PC AL CENTRO)'
};

const LEVEL_NAMES = {
  1: 'Nv.1 Piso/Base (Abajo)',
  2: 'Nv.2 Bajo',
  3: 'Nv.3 Medio',
  4: 'Nv.4 Medio-Alto',
  5: 'Nv.5 Alto',
  6: 'Nv.6 Tope (Arriba)'
};

const WMS_SECTOR_DEFS = [
  { id: 'S1', floor: 1, name: 'Sector 1 · Parafernalia', desc: 'Pipas, bongs, sedas, picadores, encendedores y accesorios boutique', icon: '🌿', defaultImg: 'assets/store-shelf-map-gba.jpg' },
  { id: 'S2', floor: 2, name: 'Sector 2 · Sustratos', desc: 'Bolsas de tierra, turbas, perlitas, sustratos profesionales y pallets', icon: '🌱', defaultImg: 'assets/store-shelf-map-gba.jpg' },
  { id: 'S3', floor: 3, name: 'Sector 3 · Fertilizantes', desc: 'Nutrientes, bioestimulantes, enmiendas orgánicas y equipo refrigerado', icon: '🧪', defaultImg: 'assets/store-shelf-map-gba.jpg' },
  { id: 'S4', floor: 4, name: 'Sector 4 · Control de Plagas', desc: 'Insecticidas, preventivos, fungicidas y fitosanitarios', icon: '🛡️', defaultImg: 'assets/store-shelf-map-gba.jpg' },
  { id: 'S5', floor: 5, name: 'Sector 5 · Indoor y Herramientas', desc: 'Carpas, iluminación LED, turbinas, tijeras y medidores', icon: '💡', defaultImg: 'assets/store-shelf-map-gba.jpg' },
  { id: 'S6', floor: 6, name: 'Sector 6 · Bajo Escalera', desc: 'Espacio bajo escalera, reservas y stock pesado en cajas', icon: '📦', defaultImg: 'assets/store-shelf-map-gba.jpg' }
];

const ZONE_MAP_NAMES = {
  'S1': 'Sector 1 (Parafernalia)',
  'S2': 'Sector 2 (Sustratos)',
  'S3': 'Sector 3 (Fertilizantes)',
  'S4': 'Control de Plagas',
  'S5': 'Sector 5 (Indoor y Herramientas)',
  'S6': 'Sector 6 (Bajo Escalera)',
  'SEC1': 'Sector 1 (Parafernalia)',
  'SEC2': 'Sector 2 (Sustratos)',
  'SEC3': 'Sector 3 (Fertilizantes)',
  'SEC4': 'Control de Plagas',
  'SEC5': 'Sector 5 (Indoor y Herramientas)',
  'SEC6': 'Sector 6 (Bajo Escalera)',
  'TI': 'Tienda',
  'DP': 'Depósito'
};

let storeShelves = structuredClone(DEFAULT_STORE_SHELVES);
let storeLocationProducts = [];
let mapHistoryEntries = [];
let selectedFloorLevel = 1;
let selectedShelfCode = 'P1-E1';
let selectedInternalLevel = 3;
let currentWmsView = 'sectors'; // 'sectors' | 'sector_detail' | 'history' | 'infography'
let isAddShelfModalOpen = false;
let storeMapSyncLabel = 'SISTEMA WMS EN LÍNEA';

function escapeMapHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getDeletedStoreShelves() {
  return new Set();
}

function addDeletedStoreShelf() {
  return false;
}

function removeDeletedStoreShelf() {
  return false;
}

function getCurrentMapUser() {
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  return context?.isVerified ? (context.userName || context.userId) : 'Sesión no verificada';
}

function getMapHistory() {
  return mapHistoryEntries.slice();
}

function logMapHistoryAction(action, label, details, shelfCode = null, floorLevel = null) {
  try {
    const entry = {
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      timestamp: new Date().toISOString(),
      user: getCurrentMapUser(),
      action: action || 'MODIFICACION',
      action_label: label || 'Modificación de Mapa',
      details: details || '',
      shelf_code: shelfCode || null,
      floor_level: floorLevel || selectedFloorLevel
    };
    mapHistoryEntries.unshift(entry);
    mapHistoryEntries = mapHistoryEntries.slice(0, 200);
    return entry;
  } catch (err) {
    console.warn('No se pudo registrar historial del mapa:', err);
  }
}

function clearMapHistory() {
  if (confirm('¿Deseás borrar el historial de modificaciones del plano?')) {
    mapHistoryEntries = [];
    if (window.showToast) window.showToast('🗑️ Historial de modificaciones vaciado.');
    rerenderStoreMap();
  }
}

function exportMapHistoryCSV() {
  const history = getMapHistory();
  if (!history.length) {
    if (window.showToast) window.showToast('No hay registros de historial para exportar.');
    return;
  }
  const headers = ['Fecha/Hora', 'Usuario', 'Acción', 'Título', 'Detalle', 'Estante', 'Sector'];
  const rows = history.map(item => [
    new Date(item.timestamp).toLocaleString('es-AR'),
    item.user,
    item.action,
    item.action_label,
    `"${String(item.details || '').replace(/"/g, '""')}"`,
    item.shelf_code || '-',
    FLOOR_NAMES[item.floor_level] ? FLOOR_NAMES[item.floor_level].split('(')[0].trim() : (item.floor_level === 2 ? 'Depósito' : 'Tienda')
  ]);
  const csvContent = 'data:text/csv;charset=utf-8,﻿' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `historial_plano_boeweb_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
}

function getSectorCustomPhoto(sectorId) {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('boeweb_wms_sector_photo_' + sectorId);
      if (stored) return stored;
    }
  } catch (_) {}
  const def = WMS_SECTOR_DEFS.find(s => s.id === sectorId);
  return def?.defaultImg || 'assets/store-shelf-map-gba.jpg';
}

function saveSectorCustomPhoto(sectorId, photoUrl) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('boeweb_wms_sector_photo_' + sectorId, photoUrl);
    }
  } catch (_) {}
}

function handleSectorPhotoUpload(event, sectorId) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      saveSectorCustomPhoto(sectorId, dataUrl);
      logMapHistoryAction('FOTO_SECTOR', 'Foto de sector actualizada', `Se actualizó la foto de referencia del Sector ${sectorId}`, null, Number(sectorId.replace(/\D/g, '')) || 1);
      if (window.showToast) window.showToast(`📸 Foto del Sector ${sectorId} guardada.`);
      rerenderStoreMap();
    };
    reader.readAsDataURL(file);
  } catch (err) {
    console.error('Error al subir foto de sector:', err);
    if (window.showToast) window.showToast('No se pudo guardar la foto del sector.');
  }
}

// Lightbox modal para ampliar fotos a pantalla completa
function openWmsLightbox(imgUrl, title, subtitle) {
  if (typeof document === 'undefined') return;
  closeWmsLightbox();

  const modal = document.createElement('div');
  modal.id = 'wms-lightbox-modal';
  modal.className = 'wms-lightbox-backdrop';
  modal.onclick = (e) => {
    if (e.target === modal || e.target.classList.contains('wms-lightbox-close')) closeWmsLightbox();
  };
  modal.innerHTML = `
    <div class="wms-lightbox-content">
      <button type="button" class="wms-lightbox-close" onclick="closeWmsLightbox()" aria-label="Cerrar imagen">&times;</button>
      <div class="wms-lightbox-header">
        <h3 style="margin: 0; color: var(--vendor-gold, #c2a246); font-size: 1.15rem; font-weight: 800;">${escapeMapHtml(title || 'Foto de Referencia WMS')}</h3>
        ${subtitle ? `<small style="color: rgba(246,243,232,0.8);">${escapeMapHtml(subtitle)}</small>` : ''}
      </div>
      <div class="wms-lightbox-img-wrapper">
        <img src="${escapeMapHtml(imgUrl)}" alt="${escapeMapHtml(title || 'Foto')}" class="wms-lightbox-img">
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.addEventListener('keydown', handleLightboxEsc);
}

function closeWmsLightbox() {
  const modal = document.getElementById('wms-lightbox-modal');
  if (modal) modal.remove();
  document.removeEventListener('keydown', handleLightboxEsc);
}

function handleLightboxEsc(e) {
  if (e.key === 'Escape') closeWmsLightbox();
}

function normalizeShelfCode(rawCode) {
  return String(rawCode || '').trim().toUpperCase();
}

function getSectorProducts(floorLevel) {
  const floorNum = Number(floorLevel);
  const targetSectorId = `S${floorNum}`;
  const allProducts = Array.isArray(storeLocationProducts) && storeLocationProducts.length > 0
    ? storeLocationProducts
    : (typeof window !== 'undefined' && Array.isArray(window.internalCatalogProducts) ? window.internalCatalogProducts : []);

  return allProducts.filter(p => {
    const pFloor = Number(p.floor_level || p.floor || 0);
    const pWms = String(p.wms_code || p.location || '').toUpperCase();
    if (pFloor === floorNum) return true;
    if (pWms.startsWith(targetSectorId + '-') || pWms.startsWith(`SEC${floorNum}-`)) return true;
    if (floorNum === 1 && (pWms.startsWith('TI-') || (!pWms && !pFloor))) return true;
    if (floorNum === 6 && pWms.startsWith('DP-')) return true;
    return false;
  });
}

function getShelfProducts(shelfCode, level = null) {
  const normalized = normalizeShelfCode(shelfCode);
  const allProducts = Array.isArray(storeLocationProducts) && storeLocationProducts.length > 0
    ? storeLocationProducts
    : (typeof window !== 'undefined' && Array.isArray(window.internalCatalogProducts) ? window.internalCatalogProducts : []);

  return allProducts.filter(product => {
    const rawCode = String(product.shelf_code || product.shelf || product.wms_code || product.location || '').toUpperCase();
    const productLevel = Number(product.shelf_level ?? product.level ?? 0);
    
    // Parse wms code parts if present
    const wmsMatch = rawCode.match(/^S\d-([A-Z])-([A-Z0-9]+)-N(\d)-([A-Z])/i);
    let effectiveShelf = rawCode;
    let effectiveLevel = productLevel;
    if (wmsMatch) {
      effectiveShelf = wmsMatch[2]; // e.g. P1
      effectiveLevel = Number(wmsMatch[3]) || productLevel;
    }

    const matchesShelf = rawCode === normalized || effectiveShelf === normalized || rawCode.includes(normalized) || normalized.includes(rawCode);
    if (!matchesShelf) return false;
    if (level === null || level === undefined) return true;
    return Number(effectiveLevel) === Number(level);
  });
}

function getShelfUnitCount(shelfCode) {
  return getShelfProducts(shelfCode).reduce((total, p) => total + Math.max(0, Number(p.stock ?? p.on_hand) || 0), 0);
}

function calculateDefaultCoordinatesForShelf(wallCode, floorLevel = 1) {
  return { x: 42, y: 40, width: 16, height: 16 };
}

function ensureShelfExistsForLocation(shelfCode, floorLevel = 1, options = {}) {
  const normalizedCode = normalizeShelfCode(shelfCode);
  if (!normalizedCode || normalizedCode === 'PC-CENTRO') return null;

  const existing = storeShelves.find(s => s.code.toUpperCase() === normalizedCode && s.floor_level === floorLevel);
  if (existing) return existing;

  const wallMatch = normalizedCode.match(/^P([1-4])/);
  const newShelf = {
    id: 'shelf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    code: normalizedCode,
    zone_code: wallMatch ? `P${wallMatch[1]}` : 'ISLA',
    name: options.name || `Módulo ${normalizedCode}`,
    floor_level: Number(floorLevel),
    icon: options.icon || (normalizedCode.includes('HEL') ? '❄️' : normalizedCode.includes('VIT') ? '💎' : normalizedCode.includes('PIS') ? '🧱' : '🗄️'),
    is_anchor: false,
    x: 42,
    y: 40,
    width: 16,
    height: 16,
    photo_url: options.photo_url || null
  };

  storeShelves.push(newShelf);
  logMapHistoryAction('CREAR_ESTANTE', 'Módulo WMS incorporado', `Se creó el módulo ${newShelf.code} en ${FLOOR_NAMES[floorLevel] || 'Sector'}`, newShelf.code, floorLevel);
  return newShelf;
}

function parseLocationCode(code) {
  const raw = String(code || '').trim().toUpperCase();
  const parts = raw.split('-');
  if (parts.length >= 6) {
    const [zone, compass, wall, shelf, level, sector] = parts;
    return {
      zone: ZONE_MAP_NAMES[zone] || (zone === 'TI' ? 'Tienda' : zone === 'DP' ? 'Depósito' : zone),
      zoneCode: zone,
      compass: compass === 'D' ? 'Derecha' : compass === 'I' ? 'Izquierda' : compass === 'F' ? 'Frente' : compass === 'A' ? 'Atrás' : compass,
      compassCode: compass,
      wall: wall.replace('P', 'Pared '),
      wallCode: wall,
      shelf: shelf.startsWith('E') ? shelf.replace('E', 'Estante ') : shelf,
      shelfCode: shelf,
      level: level.replace('N', 'Nivel '),
      levelNum: Number(level.replace(/\D/g, '')) || 1,
      sector: sector === 'I' ? 'Izquierda' : sector === 'C' ? 'Centro' : sector === 'D' ? 'Derecha' : sector === 'U' ? 'Es chico / Sin sector' : sector,
      sectorCode: sector
    };
  } else if (parts.length === 5) {
    const [zone, compass, wall, level, sector] = parts;
    return {
      zone: ZONE_MAP_NAMES[zone] || (zone === 'TI' ? 'Tienda' : zone === 'DP' ? 'Depósito' : zone),
      zoneCode: zone,
      compass: compass === 'D' ? 'Derecha' : compass === 'I' ? 'Izquierda' : compass === 'F' ? 'Frente' : compass === 'A' ? 'Atrás' : compass,
      compassCode: compass,
      wall: wall.replace('P', 'Pared '),
      wallCode: wall,
      shelf: wall.replace('P', 'Pared '),
      shelfCode: wall,
      level: level.replace('N', 'Nivel '),
      levelNum: Number(level.replace(/\D/g, '')) || 1,
      sector: sector === 'I' ? 'Izquierda' : sector === 'C' ? 'Centro' : sector === 'D' ? 'Derecha' : sector === 'U' ? 'Es chico / Sin sector' : sector,
      sectorCode: sector
    };
  }
  return null;
}

function formatLocationVoiceText(loc) {
  if (typeof loc === 'string') {
    const parsed = parseLocationCode(loc);
    if (parsed) loc = parsed;
    else return loc;
  }
  const zoneRaw = loc.zone || (loc.zoneCode ? ZONE_MAP_NAMES[loc.zoneCode] : null) || (loc.zoneCode === 'DP' ? 'el depósito' : 'la tienda');
  const zone = zoneRaw.toLowerCase().startsWith('sector') || zoneRaw.toLowerCase().startsWith('control') ? `el ${zoneRaw}` : (zoneRaw === 'Tienda' ? 'la tienda' : zoneRaw === 'Depósito' ? 'el depósito' : zoneRaw);
  const compass = loc.compass || 'frente';
  const wall = loc.wall || 'Pared 1';
  const level = loc.level || `nivel ${loc.levelNum || 1}`;
  const isChico = loc.sectorCode === 'U' || (loc.sector && (loc.sector.toLowerCase().includes('chico') || loc.sector.toLowerCase().includes('no hace falta')));
  const sector = isChico ? '' : `, sector ${loc.sector.toLowerCase()}`;
  const shelfStr = loc.shelf && loc.shelf !== loc.wall ? `, ${loc.shelf.toLowerCase()}` : '';
  return `Está en ${zone.toLowerCase()}, a la ${compass.toLowerCase()} de la PC, ${wall.toLowerCase()}${shelfStr}, ${level.toLowerCase()}${sector}.`;
}

function generateDetailedVoicePhrase(info) {
  if (!info) return '';
  if (info.isLocated === false) {
    if (info.hasMatchedProduct) {
      const prodName = info.productName ? `El producto ${info.productName}` : 'El ítem solicitado';
      return `${prodName} está en el inventario con ${info.stockCount || 0} unidades, pero todavía no tiene una ubicación física asignada en el plano.`;
    }
    return 'No se encontró ningún producto o módulo de guardado con el término ingresado en el plano actual.';
  }

  const prodName = info.productName ? `El producto ${info.productName}` : 'El ítem solicitado';
  const area = info.areaLabel || (info.floorLevel === 2 ? 'el Sector 2 (Sustratos)' : 'el Sector 1 (Parafernalia)');
  const wallMatch = String(info.wallCode || 'P1').match(/\d/);
  const wallNum = wallMatch ? wallMatch[0] : '1';

  let wallSide = 'la del frente';
  if (info.wallCode === 'P4' || info.compassCode === 'I') wallSide = 'la de izquierda';
  else if (info.wallCode === 'P3' || info.compassCode === 'D') wallSide = 'la de derecha';
  else if (info.wallCode === 'P2' || info.compassCode === 'A') wallSide = 'la del fondo';
  else if (info.wallCode === 'P1' || info.compassCode === 'F') wallSide = 'la del frente';

  let shelfName = 'módulo 1';
  const rawShelf = String(info.shelfCode || 'E1').toUpperCase();
  if (rawShelf.startsWith('HEL')) {
    shelfName = `heladera ${rawShelf.replace(/\D/g, '') || '1'}`;
  } else if (rawShelf.startsWith('VIT')) {
    shelfName = `vitrina ${rawShelf.replace(/\D/g, '') || '1'}`;
  } else if (rawShelf.startsWith('PIS')) {
    shelfName = `pallet de piso ${rawShelf.replace(/\D/g, '') || '1'}`;
  } else if (rawShelf.startsWith('E')) {
    shelfName = `góndola ${rawShelf.replace(/\D/g, '') || '1'}`;
  } else {
    shelfName = `módulo ${rawShelf}`;
  }

  const levelDescriptions = {
    1: 'nivel 1 piso',
    2: 'nivel 2 bajo',
    3: 'nivel 3 medio',
    4: 'nivel 4 medio alto',
    5: 'nivel 5 alto',
    6: 'nivel 6 tope'
  };
  const lvlText = levelDescriptions[info.levelNum] || `nivel ${info.levelNum || 1}`;

  const sectorDescriptions = {
    'I': 'sector izquierdo',
    'C': 'centro',
    'D': 'sector derecho',
    'U': ''
  };
  const secText = sectorDescriptions[info.sectorCode] || 'centro';
  const secClause = secText ? `, ${secText}` : '';

  return `${prodName} está ubicado en ${area}, en la pared número ${wallNum} ${wallSide}, ${shelfName}, ${lvlText}${secClause}.`;
}

function speakLocationVoicePhrase(infoOrText) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const phrase = typeof infoOrText === 'string' ? infoOrText : generateDetailedVoicePhrase(infoOrText);
    if (!phrase) return;

    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.lang = 'es-AR';
    utterance.rate = 1.35;
    utterance.pitch = 0.95;
    const voices = window.speechSynthesis.getVoices();
    const esVoice = voices.find(v => v.lang && (v.lang === 'es-AR' || v.lang.startsWith('es-419') || v.lang === 'es-US' || v.lang.startsWith('es')));
    if (esVoice) utterance.voice = esVoice;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Voice synthesis error:', err);
  }
}

function setFloorLevel(floorNum) {
  selectedFloorLevel = Number(floorNum);
  currentWmsView = 'sector_detail';
  rerenderStoreMap();
}

function openWmsSectorView(floorNum) {
  selectedFloorLevel = Number(floorNum);
  currentWmsView = 'sector_detail';
  rerenderStoreMap();
}

function backToWmsSectors() {
  currentWmsView = 'sectors';
  rerenderStoreMap();
}

function selectShelf(shelfCode) {
  selectedShelfCode = normalizeShelfCode(shelfCode);
  rerenderStoreMap();
}

function setInternalLevel(levelNum) {
  selectedInternalLevel = Number(levelNum);
  rerenderStoreMap();
}

function setMapTab(tabName) {
  currentWmsView = tabName === 'interactive' ? 'sectors' : tabName;
  rerenderStoreMap();
}

function openAddShelfModal() {
  isAddShelfModalOpen = true;
  rerenderStoreMap();
}

function closeAddShelfModal() {
  isAddShelfModalOpen = false;
  rerenderStoreMap();
}

function addNewStoreShelf(floorLevel, wallCode, typeCode, shelfNum, descriptiveName) {
  const num = Math.max(1, parseInt(shelfNum, 10) || 1);
  const code = `${wallCode}-${typeCode}${num}`;
  
  const existing = storeShelves.find(s => s.code === code && s.floor_level === Number(floorLevel));
  if (existing) {
    if (window.showToast) window.showToast(`⚠️ El módulo ${code} ya existe en esta planta.`);
    return;
  }

  let icon = '🪵';
  if (typeCode === 'HEL') icon = '❄️';
  else if (typeCode === 'VIT') icon = '💎';
  else if (typeCode === 'PIS') icon = '📦';
  else if (typeCode === 'EST') icon = '🗄️';

  const newShelf = {
    id: 'shelf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    code,
    zone_code: wallCode,
    name: descriptiveName || `Módulo ${code}`,
    floor_level: Number(floorLevel),
    icon,
    is_anchor: false,
    x: 42,
    y: 40,
    width: 16,
    height: 16
  };

  storeShelves.push(newShelf);
  selectedShelfCode = code;
  selectedFloorLevel = Number(floorLevel);
  isAddShelfModalOpen = false;

  logMapHistoryAction('CREAR_ESTANTE', 'Módulo incorporado', `Se creó el estante ${code} en ${FLOOR_NAMES[floorLevel]}`, code, Number(floorLevel));
  if (window.showToast) window.showToast(`✅ Módulo ${code} creado correctamente.`);
  rerenderStoreMap();
}

function deleteStoreShelf(shelfCode) {
  const normalized = normalizeShelfCode(shelfCode);
  if (normalized === 'PC-CENTRO') {
    if (window.showToast) window.showToast('La Terminal Central es la brújula y no se puede eliminar.');
    return;
  }
  if (!confirm(`¿Deseás eliminar el módulo ${normalized}?`)) return;

  const count = getShelfUnitCount(normalized);
  if (count > 0) {
    if (!confirm(`El módulo ${normalized} contiene ${count} unidades de inventario. ¿Eliminar de todas formas?`)) return;
  }

  storeShelves = storeShelves.filter(s => !(s.code === normalized && s.floor_level === selectedFloorLevel));
  logMapHistoryAction('ELIMINAR_ESTANTE', 'Módulo eliminado', `Se eliminó el módulo ${normalized}`, normalized, selectedFloorLevel);
  if (window.showToast) window.showToast(`🗑️ Módulo ${normalized} eliminado.`);
  rerenderStoreMap();
}

function handleShelfPhotoChange(event, shelfCode) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const shelf = storeShelves.find(s => s.code === shelfCode);
  if (!shelf) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    shelf.photo_url = e.target.result;
    logMapHistoryAction('FOTO_ESTANTE', 'Foto actualizada', `Se actualizó la foto de ${shelf.code}`, shelf.code, shelf.floor_level);
    if (window.showToast) window.showToast(`📸 Foto del estante ${shelf.code} guardada.`);
    rerenderStoreMap();
  };
  reader.readAsDataURL(file);
}

function showShelfDetailsModal(code) {
  const shelf = storeShelves.find(item => item.code === code);
  if (!shelf) return;
  const unitCount = getShelfUnitCount(code);
  const message = `🌿 ${FLOOR_NAMES[shelf.floor_level]} · Estante ${shelf.code} · ${unitCount} u.`;
  if (window.showToast) window.showToast(message);
}

function setStoreMapData(shelves, products, statusLabel) {
  if (Array.isArray(shelves) && shelves.length > 0) storeShelves = shelves;
  if (Array.isArray(products)) storeLocationProducts = products;
  if (statusLabel) storeMapSyncLabel = statusLabel;
  rerenderStoreMap();
}

function findStoreMapProduct(query) {
  if (typeof window !== 'undefined' && window.decodeHumanWmsLocation) {
    const info = window.decodeHumanWmsLocation(query);
    if (info && info.hasMatchedProduct) {
      if (typeof window.renderStoreMapLocationCard === 'function') {
        window.renderStoreMapLocationCard(info);
      }
      speakLocationVoicePhrase(info);
      return info;
    }
  }
  return null;
}

function focusStoreMapProduct(queryOrCode) {
  const info = findStoreMapProduct(queryOrCode);
  if (info && info.floorLevel) {
    selectedFloorLevel = info.floorLevel;
    if (info.shelfCode) selectedShelfCode = info.shelfCode;
    currentWmsView = 'sector_detail';
    rerenderStoreMap();
  }
  return info;
}

function renderProductRows(products) {
  if (!products.length) return '';
  return products.map(product => {
    const exactPosition = product.shelf_position ? ` · Posición: ${escapeMapHtml(product.shelf_position)}` : '';
    const stockNum = Number(product.stock ?? product.on_hand) || 0;
    const stockBadgeClass = stockNum > 5 ? 'gba-badge-ok' : stockNum > 0 ? 'gba-badge-low' : 'gba-badge-zero';
    const stockLabel = stockNum > 5 ? `${stockNum} u.` : stockNum > 0 ? `${stockNum} u. (Bajo)` : '0 u. (Agotado)';
    const imgUrl = product.image_url || product.image || 'assets/logo.jpg';
    
    return `
      <article class="wms-product-item-card" data-product-code="${escapeMapHtml(product.product_code || product.id)}">
        <img src="${escapeMapHtml(imgUrl)}" alt="${escapeMapHtml(product.name || 'Producto')}" class="wms-product-thumb" onclick="openWmsLightbox('${escapeMapHtml(imgUrl)}', '${escapeMapHtml(product.name || 'Producto')}', 'Stock: ${stockLabel}')" title="Hacé clic para ampliar foto">
        <div style="flex: 1; min-width: 0;">
          <strong style="display: block; font-size: 0.88rem; color: var(--vendor-forest, #152d24); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeMapHtml(product.name || 'Producto sin nombre')}</strong>
          <small style="color: #666; font-size: 0.76rem; display: block;">${escapeMapHtml(product.product_code || product.id || 'SKU')} · <span class="gba-stock-pill ${stockBadgeClass}">${stockLabel}</span>${exactPosition}</small>
        </div>
        <div style="display: flex; gap: 4px;">
          <button type="button" class="gba-qr-btn" onclick="if (window.openEditProductLocation) window.openEditProductLocation('${escapeMapHtml(product.product_code || product.id)}');" title="Reubicar">📍 Reubicar</button>
          <button type="button" class="gba-qr-btn" onclick="printProductQrByCode('${escapeMapHtml(product.product_code || product.id)}')" title="Imprimir QR">QR</button>
        </div>
      </article>`;
  }).join('');
}

function renderWmsSectorsGrid() {
  return `
    <div class="wms-sectors-grid">
      ${WMS_SECTOR_DEFS.map(sector => {
        const customPhoto = getSectorCustomPhoto(sector.id);
        const sectorProducts = getSectorProducts(sector.floor);
        const totalStock = sectorProducts.reduce((sum, p) => sum + (Number(p.stock ?? p.on_hand) || 0), 0);
        const skuCount = sectorProducts.length;

        return `
          <div class="wms-sector-card">
            <div class="wms-sector-banner" onclick="openWmsLightbox('${escapeMapHtml(customPhoto)}', '${escapeMapHtml(sector.name)}', '${skuCount} SKUs · ${totalStock} unidades')">
              <img src="${escapeMapHtml(customPhoto)}" alt="${escapeMapHtml(sector.name)}">
              <span class="wms-sector-zoom-badge">🔍 Ampliar Foto</span>
              <label class="wms-sector-photo-btn" onclick="event.stopPropagation()">
                📸 Cambiar
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onchange="handleSectorPhotoUpload(event, '${sector.id}')">
              </label>
            </div>
            <div class="wms-sector-card-body">
              <div>
                <h3 class="wms-sector-card-title">${sector.icon} ${escapeMapHtml(sector.name)}</h3>
                <p class="wms-sector-card-desc">${escapeMapHtml(sector.desc)}</p>
              </div>
              <div class="wms-sector-card-footer">
                <span class="wms-sector-pill">📦 ${skuCount} SKUs · ${totalStock} u.</span>
                <button type="button" class="wms-sector-action-btn" onclick="openWmsSectorView(${sector.floor})">
                  Explorar Sector ➔
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderWmsSectorDetail() {
  const sector = WMS_SECTOR_DEFS.find(s => s.floor === selectedFloorLevel) || WMS_SECTOR_DEFS[0];
  const customPhoto = getSectorCustomPhoto(sector.id);
  const sectorShelves = storeShelves.filter(s => s.floor_level === selectedFloorLevel && !s.is_anchor);
  
  // Si no hay estantes en la lista para este sector, agregamos las 4 paredes por defecto
  const effectiveShelves = sectorShelves.length > 0 ? sectorShelves : [
    { code: 'P1-E1', name: 'Pared 1 · Frente (Norte)', icon: '🪵', floor_level: selectedFloorLevel },
    { code: 'P2-E1', name: 'Pared 2 · Fondo (Sur)', icon: '🪵', floor_level: selectedFloorLevel },
    { code: 'P3-E1', name: 'Pared 3 · Lateral Derecho (Este)', icon: '🪵', floor_level: selectedFloorLevel },
    { code: 'P4-E1', name: 'Pared 4 · Lateral Izquierdo (Oeste)', icon: '🪵', floor_level: selectedFloorLevel }
  ];

  const currentShelf = effectiveShelves.find(s => s.code === selectedShelfCode) || effectiveShelves[0];
  selectedShelfCode = currentShelf.code;

  return `
    <div style="display: flex; flex-direction: column; gap: 20px;">
      
      <!-- Top Navigation & Breadcrumb -->
      <div class="wms-explorer-top-bar">
        <div class="wms-breadcrumb-nav">
          <button type="button" class="wms-breadcrumb-btn" onclick="backToWmsSectors()">
            ⬅ Volver a los 6 Sectores
          </button>
          <span style="color: var(--vendor-gold, #c2a246); font-weight: 800;">${sector.icon} ${escapeMapHtml(sector.name)}</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="gba-pad-btn" onclick="openAddShelfModal()" style="background: var(--vendor-forest, #152d24); border-color: var(--vendor-gold, #c2a246);">
            ➕ Nuevo Módulo
          </button>
        </div>
      </div>

      <!-- Furniture / Walls Selection Grid -->
      <div>
        <h4 style="margin: 0 0 12px 0; color: var(--vendor-forest, #152d24); font-size: 1rem; font-weight: 800;">
          🧱 Paredes y Módulos de Guardado en este Sector:
        </h4>
        <div class="wms-furniture-grid">
          ${effectiveShelves.map(shelf => {
            const count = getShelfUnitCount(shelf.code);
            const isSelected = shelf.code === selectedShelfCode;

            return `
              <div class="wms-furniture-card ${isSelected ? 'active' : ''}" onclick="selectShelf('${escapeMapHtml(shelf.code)}')">
                <div class="wms-furniture-card-header">
                  <span class="wms-furniture-code">${escapeMapHtml(shelf.code)}</span>
                  <span class="gba-stock-pill gba-badge-ok">${count} u.</span>
                </div>
                <strong style="color: var(--vendor-forest, #152d24); font-size: 0.95rem; display: block; margin-bottom: 6px;">${shelf.icon || '🗄️'} ${escapeMapHtml(shelf.name || shelf.code)}</strong>
                <small style="color: #666; display: block;">${isSelected ? '👉 Nivel seleccionado abajo' : 'Tocá para ver baldas y productos'}</small>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Shelf Levels Accordion (Nivel 6 Tope down to Nivel 1 Piso) -->
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h4 style="margin: 0; color: var(--vendor-forest, #152d24); font-size: 1.05rem; font-weight: 800;">
            🪜 Baldas y Altura de ${escapeMapHtml(currentShelf.name || currentShelf.code)} (N1 Piso a N6 Tope):
          </h4>
        </div>

        <div class="wms-levels-container">
          ${[6, 5, 4, 3, 2, 1].map(lvlNum => {
            const lvlProducts = getShelfProducts(currentShelf.code, lvlNum);
            const lvlUnits = lvlProducts.reduce((sum, p) => sum + (Number(p.stock ?? p.on_hand) || 0), 0);
            const isSelectedLevel = lvlNum === selectedInternalLevel;

            return `
              <div class="wms-level-row">
                <div class="wms-level-header" onclick="setInternalLevel(${lvlNum})" style="cursor: pointer;">
                  <strong>
                    <span>${lvlNum === 1 ? '🧱' : lvlNum === 6 ? '🔝' : '📦'}</span>
                    ${LEVEL_NAMES[lvlNum]} · ${lvlProducts.length} productos (${lvlUnits} u.)
                  </strong>
                  <span style="font-size: 0.8rem; font-weight: 700; color: var(--vendor-forest, #152d24);">
                    ${isSelectedLevel ? '▲ Desplegado' : '▼ Ver balda'}
                  </span>
                </div>
                <div class="wms-level-body" ${isSelectedLevel ? '' : 'style="display: none;"'}>
                  ${lvlProducts.length > 0 ? `
                    <div class="wms-products-grid">
                      ${renderProductRows(lvlProducts)}
                    </div>
                  ` : `
                    <div class="wms-empty-slot-card">
                      <span>🌿 Esta balda está libre y disponible para ubicar productos.</span>
                      <button type="button" class="wms-empty-slot-btn" onclick="if(window.openLocationAssistant) window.openLocationAssistant();">
                        ➕ Asignar Producto
                      </button>
                    </div>
                  `}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

    </div>
  `;
}

function renderMapHistoryHTML() {
  const history = getMapHistory();
  return `
    <div class="gba-history-container">
      <div class="gba-history-header">
        <div>
          <h3 style="margin: 0; font-size: 0.95rem; font-weight: 800; color: var(--vendor-gold, #c2a246);">
            📜 HISTORIAL DE AUDITORÍA Y CAMBIOS DEL PLANO
          </h3>
          <small style="color: rgba(246,243,232,0.7); font-size: 0.8rem;">Registro cronológico de creaciones, modificaciones y asignaciones de inventario</small>
        </div>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="gba-pad-btn" onclick="exportMapHistoryCSV()">📥 EXPORTAR CSV</button>
          <button type="button" class="gba-pad-btn" onclick="clearMapHistory()" style="background: #b71c1c; border-color: #ef5350;">🗑️ LIMPIAR</button>
        </div>
      </div>

      ${!history.length ? `
        <div style="text-align: center; padding: 30px; color: rgba(246,243,232,0.6); font-size: 0.85rem;">
          No hay cambios registrados en el plano todavía.
        </div>
      ` : `
        <div style="overflow-x: auto;">
          <table class="gba-history-table">
            <thead>
              <tr>
                <th>FECHA / HORA</th>
                <th>USUARIO</th>
                <th>ACCIÓN</th>
                <th>DETALLE</th>
                <th>MÓDULO</th>
                <th>SALA</th>
              </tr>
            </thead>
            <tbody>
              ${history.map(item => {
                let badgeClass = 'gba-badge-move';
                if (item.action === 'CREAR_ESTANTE') badgeClass = 'gba-badge-create';
                else if (item.action === 'ELIMINAR_ESTANTE') badgeClass = 'gba-badge-delete';
                else if (item.action === 'ASISTENTE_UBICACION') badgeClass = 'gba-badge-locate';
                else if (item.action === 'VACIAR_PLANO') badgeClass = 'gba-badge-reset';
                const formattedDate = new Date(item.timestamp).toLocaleString('es-AR', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                });
                const sectorLabel = FLOOR_NAMES[item.floor_level] ? FLOOR_NAMES[item.floor_level].split('(')[0].trim() : (item.floor_level === 2 ? '📦 Depósito' : '🏪 Tienda');
                return `
                  <tr>
                    <td style="white-space: nowrap; font-family: monospace; font-size: 0.82rem;">${formattedDate}</td>
                    <td><strong>${escapeMapHtml(item.user)}</strong></td>
                    <td><span class="gba-history-badge ${badgeClass}">${escapeMapHtml(item.action_label || item.action)}</span></td>
                    <td>${escapeMapHtml(item.details)}</td>
                    <td><strong style="color: var(--vendor-gold, #c2a246);">${escapeMapHtml(item.shelf_code || '-')}</strong></td>
                    <td>${escapeMapHtml(sectorLabel)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function renderAddShelfModalHTML() {
  if (!isAddShelfModalOpen) return '';
  return `
    <div style="position: fixed; inset: 0; z-index: 99999999; background: rgba(0,0,0,0.85); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; padding: 16px;">
      <div style="max-width: 480px; width: 100%; border-radius: 20px; border: 2px solid #c2a246; background: #152d24; color: #fff; padding: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.85);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid rgba(194,162,70,0.3); padding-bottom: 12px;">
          <h3 style="margin: 0; color: #c2a246; font-size: 1.15rem; font-weight: 800;">➕ Agregar Nuevo Módulo de Guardado</h3>
          <button type="button" onclick="closeAddShelfModal()" style="background: rgba(255,255,255,0.15); border: none; color: #fff; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-weight: bold;">✕</button>
        </div>
        <form onsubmit="event.preventDefault(); addNewStoreShelf(document.getElementById('new-shelf-floor').value, document.getElementById('new-shelf-wall').value, document.getElementById('new-shelf-type').value, document.getElementById('new-shelf-num').value, document.getElementById('new-shelf-name').value);">
          <div style="margin-bottom: 14px;">
            <label style="display: block; font-size: 0.84rem; font-weight: 700; margin-bottom: 6px; color: #c2a246;">Sector / Sala</label>
            <select id="new-shelf-floor" style="width: 100%; padding: 10px 12px; border-radius: 8px; background: #0f2019; border: 1.5px solid #2e6b4d; color: #fff; font-weight: 700; box-sizing: border-box;">
              ${Object.entries(FLOOR_NAMES).map(([flNum, flName]) => `<option value="${flNum}" ${selectedFloorLevel === Number(flNum) ? 'selected' : ''}>${flName.split('(')[0].trim()}</option>`).join('')}
            </select>
          </div>
          <div style="margin-bottom: 14px;">
            <label style="display: block; font-size: 0.84rem; font-weight: 700; margin-bottom: 6px; color: #c2a246;">Pared / Orientación</label>
            <select id="new-shelf-wall" style="width: 100%; padding: 10px 12px; border-radius: 8px; background: #0f2019; border: 1.5px solid #2e6b4d; color: #fff; font-weight: 700; box-sizing: border-box;">
              <option value="P1">▲ Pared 1 (Frente / Norte)</option>
              <option value="P2">▼ Pared 2 (Fondo / Sur)</option>
              <option value="P3">▶ Pared 3 (Lateral Derecho / Este)</option>
              <option value="P4">◀ Pared 4 (Lateral Izquierdo / Oeste)</option>
              <option value="ISLA">📦 Isla / Pasillo Central</option>
            </select>
          </div>
          <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 10px; margin-bottom: 14px;">
            <div>
              <label style="display: block; font-size: 0.84rem; font-weight: 700; margin-bottom: 6px; color: #c2a246;">Tipo de mueble</label>
              <select id="new-shelf-type" style="width: 100%; padding: 10px 12px; border-radius: 8px; background: #0f2019; border: 1.5px solid #2e6b4d; color: #fff; font-weight: 700; box-sizing: border-box;">
                <option value="E">🪵 Estante de Pared (E)</option>
                <option value="VIT">💎 Vitrina Vidriada (VIT)</option>
                <option value="HEL">❄️ Heladera / Frío (HEL)</option>
                <option value="PIS">📦 Pallet de Piso (PIS)</option>
                <option value="EST">🗄️ Estantería Metálica (EST)</option>
              </select>
            </div>
            <div>
              <label style="display: block; font-size: 0.84rem; font-weight: 700; margin-bottom: 6px; color: #c2a246;">Número</label>
              <input type="number" id="new-shelf-num" min="1" max="20" value="1" required style="width: 100%; padding: 10px 12px; border-radius: 8px; background: #0f2019; border: 1.5px solid #2e6b4d; color: #fff; font-weight: 800; text-align: center; box-sizing: border-box;">
            </div>
          </div>
          <div style="margin-bottom: 18px;">
            <label style="display: block; font-size: 0.84rem; font-weight: 700; margin-bottom: 6px; color: #c2a246;">Etiqueta Descriptiva</label>
            <input type="text" id="new-shelf-name" placeholder="Ej: Fertilizantes, Semillas, Sustratos..." style="width: 100%; padding: 10px 12px; border-radius: 8px; background: #0f2019; border: 1.5px solid #2e6b4d; color: #fff; box-sizing: border-box;">
          </div>
          <div style="display: flex; gap: 10px;">
            <button type="button" onclick="closeAddShelfModal()" style="flex: 1; padding: 12px; border-radius: 10px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.25); color: #fff; font-weight: 600; cursor: pointer;">Cancelar</button>
            <button type="submit" style="flex: 1.5; padding: 12px; border-radius: 10px; background: #2e7d32; border: 1.5px solid #81c784; color: #fff; font-weight: 800; cursor: pointer;">➕ Crear Módulo</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderStoreMapHTML(activeZone = null, activeShelf = null, targetLevel = null) {
  if (activeShelf) {
    selectedShelfCode = normalizeShelfCode(activeShelf);
    currentWmsView = 'sector_detail';
  }
  if (targetLevel) selectedInternalLevel = Number(targetLevel);

  const totalProducts = Array.isArray(storeLocationProducts) && storeLocationProducts.length > 0
    ? storeLocationProducts
    : (typeof window !== 'undefined' && Array.isArray(window.internalCatalogProducts) ? window.internalCatalogProducts : []);
  const totalUnits = totalProducts.reduce((sum, p) => sum + (Number(p.stock ?? p.on_hand) || 0), 0);

  return `
    <div class="wms-explorer-container">
      
      <!-- Top Switcher & Stats Header -->
      <div class="gba-room-selector" style="margin-bottom: 0;">
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <button type="button" class="gba-room-btn ${currentWmsView === 'sectors' || currentWmsView === 'sector_detail' ? 'active' : ''}" onclick="setMapTab('interactive')">
            🧭 EXPLORADOR DE SECTORES (${WMS_SECTOR_DEFS.length})
          </button>
          <button type="button" class="gba-room-btn ${currentWmsView === 'history' ? 'active' : ''}" onclick="setMapTab('history')">
            📜 AUDITORÍA E HISTORIAL
          </button>
          <button type="button" class="gba-room-btn ${currentWmsView === 'infography' ? 'active' : ''}" onclick="setMapTab('infography')">
            📐 GUÍA DE PLANTA
          </button>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 0.78rem; color: #a5d6a7; font-weight: 800; letter-spacing: 0.5px;">● ${escapeMapHtml(storeMapSyncLabel)}</span>
          <span style="font-size: 0.78rem; background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 8px; color: #fff;">${totalUnits} unidades totales</span>
        </div>
      </div>

      <!-- Main View Content -->
      ${currentWmsView === 'history' ? renderMapHistoryHTML() : currentWmsView === 'infography' ? `
        <div style="background: #0f2318; border: 2px solid #2e6b4d; border-radius: 16px; padding: 20px; text-align: center;">
          <h3 style="color: var(--vendor-gold, #c2a246); font-size: 1rem; font-weight: 800; margin: 0 0 14px 0;">
            🧭 GUÍA ARQUITECTÓNICA DEL LOCAL (TERMINAL CENTRAL COMO BRÚJULA)
          </h3>
          <div style="max-width: 860px; margin: 0 auto; border: 2px solid var(--vendor-gold, #c2a246); border-radius: 16px; overflow: hidden; box-shadow: 0 12px 32px rgba(0,0,0,0.6); cursor: pointer;" onclick="openWmsLightbox('assets/store-shelf-map-gba.jpg', 'Guía Arquitectónica del Local', 'Terminal central como brújula')">
            <img src="assets/store-shelf-map-gba.jpg" alt="Mapa del Local" style="width: 100%; height: auto; display: block;">
          </div>
        </div>
      ` : currentWmsView === 'sector_detail' ? renderWmsSectorDetail() : renderWmsSectorsGrid()}

      <!-- Add Shelf Modal -->
      ${renderAddShelfModalHTML()}

    </div>
  `;
}

function rerenderStoreMap() {
  const container = document.getElementById('store-map-render-container');
  if (container) container.innerHTML = renderStoreMapHTML();
}

window.renderStoreMapHTML = renderStoreMapHTML;
window.setStoreMapData = setStoreMapData;
window.findStoreMapProduct = findStoreMapProduct;
window.focusStoreMapProduct = focusStoreMapProduct;
window.deleteStoreShelf = deleteStoreShelf;
window.addNewStoreShelf = addNewStoreShelf;
window.openAddShelfModal = openAddShelfModal;
window.closeAddShelfModal = closeAddShelfModal;
window.getMapHistory = getMapHistory;
window.logMapHistoryAction = logMapHistoryAction;
window.exportMapHistoryCSV = exportMapHistoryCSV;
window.clearMapHistory = clearMapHistory;
window.ensureShelfExistsForLocation = ensureShelfExistsForLocation;
window.setFloorLevel = setFloorLevel;
window.selectShelf = selectShelf;
window.setInternalLevel = setInternalLevel;
window.setMapTab = setMapTab;
window.parseLocationCode = parseLocationCode;
window.formatLocationVoiceText = formatLocationVoiceText;
window.generateDetailedVoicePhrase = generateDetailedVoicePhrase;
window.speakLocationVoicePhrase = speakLocationVoicePhrase;
window.openWmsLightbox = openWmsLightbox;
window.closeWmsLightbox = closeWmsLightbox;
window.openWmsSectorView = openWmsSectorView;
window.backToWmsSectors = backToWmsSectors;
window.storeLocationProducts = storeLocationProducts;
window.storeShelves = storeShelves;
window.WMS_SECTOR_DEFS = WMS_SECTOR_DEFS;
