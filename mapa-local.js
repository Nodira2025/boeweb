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
let selectedShelfCode = 'P1';
let selectedInternalLevel = 3;
let currentWmsView = 'sectors'; // 'sectors' | 'sector_detail' | 'history' | 'infography'
let isAddShelfModalOpen = false;
let isFullShelvesInspectorOpen = false;
let storeMapSyncLabel = 'SISTEMA WMS EN LÍNEA';
let sectorPendingSelectedIds = new Set();

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
  } else if (parts.length === 2 && (parts[1] === 'GENERAL' || parts[1] === 'PENDIENTE')) {
    const zone = parts[0];
    return {
      zone: ZONE_MAP_NAMES[zone] || zone,
      zoneCode: zone,
      compass: 'Frente',
      compassCode: 'F',
      wall: 'General del Sector',
      wallCode: 'GENERAL',
      shelf: 'General',
      shelfCode: 'GENERAL',
      level: 'Sin balda asignada',
      levelNum: null,
      sector: 'General',
      sectorCode: 'C',
      isSectorOnly: true
    };
  }
  return null;
}

function getCleanWallOrModuleInfo(rawCode) {
  const code = String(rawCode || '').toUpperCase().trim();
  const parsed = parseLocationCode(code);
  
  let wallCode = 'P1';
  let compass = 'Frente';
  let levelNum = 1;
  let sectorSide = 'Centro';
  let isSectorOnly = false;
  
  if (parsed) {
    wallCode = parsed.wallCode || 'P1';
    compass = parsed.compass || 'Frente';
    levelNum = parsed.levelNum || 1;
    sectorSide = parsed.sector || 'Centro';
    isSectorOnly = Boolean(parsed.isSectorOnly);
  } else {
    const wallMatch = code.match(/P[1-4]/);
    if (wallMatch) wallCode = wallMatch[0];
    const lvlMatch = code.match(/N([1-6])/);
    if (lvlMatch) levelNum = Number(lvlMatch[1]);
    if (code.endsWith('-GENERAL') || code === 'GENERAL') isSectorOnly = true;
  }

  const WALL_TITLES = {
    'P1': 'Pared 1 · Frente (Norte)',
    'P2': 'Pared 2 · Fondo (Sur)',
    'P3': 'Pared 3 · Lateral Derecho (Este)',
    'P4': 'Pared 4 · Lateral Izquierdo (Oeste)',
    'VIT1': 'Vitrina 1 · Vidriada',
    'HEL1': 'Heladera 1 · Frío / Bioinsumos',
    'PIS1': 'Pallet 1 · Piso',
    'ISLA': 'Isla / Pasillo Central',
    'GENERAL': 'Sector General (Sin balda asignada)'
  };

  let cleanTitle = WALL_TITLES[wallCode] || `Pared ${wallCode}`;
  if (code.includes('HEL')) cleanTitle = 'Heladera 1 · Frío / Bioinsumos';
  else if (code.includes('VIT')) cleanTitle = 'Vitrina 1 · Vidriada';
  else if (code.includes('PIS')) cleanTitle = 'Pallet 1 · Piso';

  let icon = '🧱';
  if (wallCode === 'P1') icon = '▲';
  else if (wallCode === 'P2') icon = '▼';
  else if (wallCode === 'P3') icon = '▶';
  else if (wallCode === 'P4') icon = '◀';
  else if (code.includes('HEL')) icon = '❄️';
  else if (code.includes('VIT')) icon = '💎';
  else if (code.includes('PIS')) icon = '📦';
  else if (wallCode === 'GENERAL') icon = '⚠️';

  return {
    wallCode,
    cleanTitle,
    icon,
    compass,
    levelNum,
    sectorSide,
    isSectorOnly
  };
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

function formatLocationVoiceText(loc) {
  if (typeof loc === 'string') {
    const parsed = parseLocationCode(loc);
    if (parsed) loc = parsed;
    else return loc;
  }
  const zoneRaw = loc.zone || (loc.zoneCode ? ZONE_MAP_NAMES[loc.zoneCode] : null) || (loc.zoneCode === 'DP' ? 'el depósito' : 'la tienda');
  const zone = zoneRaw.toLowerCase().startsWith('sector') || zoneRaw.toLowerCase().startsWith('control') ? `el ${zoneRaw}` : (zoneRaw === 'Tienda' ? 'la tienda' : zoneRaw === 'Depósito' ? 'el depósito' : zoneRaw);
  
  if (loc.isSectorOnly) {
    return `Está en ${zone.toLowerCase()}, pero todavía no tiene una pared o balda asignada.`;
  }

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

  if (info.isSectorOnly || info.shelfCode === 'GENERAL' || String(info.wms_code || '').endsWith('-GENERAL')) {
    return `${prodName} está en ${area}, pero todavía no tiene una góndola o balda asignada.`;
  }

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
  sectorPendingSelectedIds.clear();
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

function toggleFullShelvesInspector() {
  isFullShelvesInspectorOpen = !isFullShelvesInspectorOpen;
  rerenderStoreMap();
}

function toggleSectorPendingSelection(productId, isChecked) {
  const idStr = String(productId);
  if (isChecked) {
    sectorPendingSelectedIds.add(idStr);
  } else {
    sectorPendingSelectedIds.delete(idStr);
  }
  rerenderStoreMap();
}

function toggleAllSectorPendingSelection(allIds, isChecked) {
  if (isChecked && Array.isArray(allIds)) {
    allIds.forEach(id => sectorPendingSelectedIds.add(String(id)));
  } else {
    sectorPendingSelectedIds.clear();
  }
  rerenderStoreMap();
}

function triggerBatchSectorRefinement() {
  const selectedIds = Array.from(sectorPendingSelectedIds);
  if (!selectedIds.length) {
    if (window.showToast) window.showToast('Seleccioná al menos un producto para ubicar.');
    return;
  }
  if (window.startBatchSectorRefinement) {
    window.startBatchSectorRefinement(selectedIds, selectedFloorLevel);
    sectorPendingSelectedIds.clear();
  }
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

function renderProductCardsList(products) {
  if (!products || !products.length) return '';
  return products.map(product => {
    const rawLoc = String(product.wms_code || product.shelf_code || product.location || '');
    const cleanInfo = getCleanWallOrModuleInfo(rawLoc);
    const lvlNum = product.shelf_level ?? cleanInfo.levelNum ?? 1;
    const lvlName = LEVEL_NAMES[lvlNum] || `Nivel ${lvlNum}`;
    const secTag = cleanInfo.sectorSide ? ` · Sector ${cleanInfo.sectorSide}` : '';
    const exactLoc = `${cleanInfo.cleanTitle} · ${lvlName}${secTag}`;

    const stockNum = Number(product.stock ?? product.on_hand) || 0;
    const stockBadgeClass = stockNum > 5 ? 'gba-badge-ok' : stockNum > 0 ? 'gba-badge-low' : 'gba-badge-zero';
    const stockLabel = stockNum > 5 ? `${stockNum} u.` : stockNum > 0 ? `${stockNum} u. (Bajo)` : '0 u. (Agotado)';
    const imgUrl = product.image_url || product.image || 'assets/logo.jpg';
    
    return `
      <article class="wms-product-item-card" data-product-code="${escapeMapHtml(product.product_code || product.sku || product.product_id || product.id)}">
        <img src="${escapeMapHtml(imgUrl)}" alt="${escapeMapHtml(product.name || 'Producto')}" class="wms-product-thumb" onclick="openWmsLightbox('${escapeMapHtml(imgUrl)}', '${escapeMapHtml(product.name || 'Producto')}', '${escapeMapHtml(exactLoc)} · Stock: ${stockLabel}')" title="Hacé clic para ampliar foto">
        <div style="flex: 1; min-width: 0;">
          <strong style="display: block; font-size: 0.92rem; color: var(--vendor-forest, #152d24); font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${escapeMapHtml(product.name || 'Producto sin nombre')}
          </strong>
          <div style="display: flex; align-items: center; gap: 6px; margin: 3px 0 4px 0; flex-wrap: wrap;">
            <span class="gba-stock-pill ${stockBadgeClass}">${stockLabel}</span>
            <small style="color: #666; font-size: 0.76rem; font-family: monospace;">SKU: ${escapeMapHtml(product.product_code || product.sku || product.product_id || product.id || '-')}</small>
          </div>
          <small style="color: #4a5d4e; font-size: 0.78rem; font-weight: 700; display: block;">
            📍 ${escapeMapHtml(exactLoc)}
          </small>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <button type="button" class="gba-qr-btn" onclick="if (window.openEditProductLocation) window.openEditProductLocation('${escapeMapHtml(product.product_code || product.sku || product.product_id || product.id)}');" title="Reubicar">📍 Reubicar</button>
          <button type="button" class="gba-qr-btn" onclick="printProductQrByCode('${escapeMapHtml(product.product_code || product.sku || product.product_id || product.id)}')" title="Imprimir QR">🖨️ QR</button>
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
                📸 Cambiar Foto
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onchange="handleSectorPhotoUpload(event, '${sector.id}')">
              </label>
            </div>
            <div class="wms-sector-card-body">
              <div>
                <h3 class="wms-sector-card-title">${sector.icon} ${escapeMapHtml(sector.name)}</h3>
                <p class="wms-sector-card-desc">${escapeMapHtml(sector.desc)}</p>
              </div>
              <div class="wms-sector-card-footer">
                <span class="wms-sector-pill">📦 ${skuCount} productos · ${totalStock} u.</span>
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
  const sectorProducts = getSectorProducts(sector.floor);
  const totalStock = sectorProducts.reduce((sum, p) => sum + (Number(p.stock ?? p.on_hand) || 0), 0);

  const isPendingSectorOnly = (p) => {
    const rawLoc = String(p.wms_code || p.shelf_code || p.location || '').toUpperCase();
    return rawLoc.endsWith('-GENERAL') || rawLoc === 'GENERAL' || p.is_sector_only === true || (!rawLoc.includes('P1') && !rawLoc.includes('P2') && !rawLoc.includes('P3') && !rawLoc.includes('P4') && !rawLoc.includes('HEL') && !rawLoc.includes('VIT') && !rawLoc.includes('PIS'));
  };

  const sectorPendingProducts = sectorProducts.filter(isPendingSectorOnly);
  const positionedProducts = sectorProducts.filter(p => !isPendingSectorOnly(p));

  // Group positioned products by Wall / Module code
  const wallGroups = new Map();
  positionedProducts.forEach(prod => {
    const rawLoc = String(prod.wms_code || prod.shelf_code || prod.location || '');
    const cleanInfo = getCleanWallOrModuleInfo(rawLoc);
    const key = cleanInfo.wallCode;
    if (!wallGroups.has(key)) {
      wallGroups.set(key, { info: cleanInfo, products: [] });
    }
    wallGroups.get(key).products.push(prod);
  });

  const allPendingSelected = sectorPendingProducts.length > 0 && sectorPendingProducts.every(p => sectorPendingSelectedIds.has(String(p.product_code || p.sku || p.product_id || p.id)));
  const pendingSelectedCount = sectorPendingSelectedIds.size;

  return `
    <div style="display: flex; flex-direction: column; gap: 18px;">
      
      <!-- Top Navigation & Breadcrumb -->
      <div class="wms-explorer-top-bar">
        <div class="wms-breadcrumb-nav">
          <button type="button" class="wms-breadcrumb-btn" onclick="backToWmsSectors()">
            ⬅ Volver a los 6 Sectores
          </button>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: var(--vendor-gold, #c2a246); font-weight: 800; font-size: 1.05rem;">
              ${sector.icon} ${escapeMapHtml(sector.name)}
            </span>
            <span class="gba-stock-pill gba-badge-ok">${sectorProducts.length} productos · ${totalStock} u.</span>
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="gba-pad-btn" onclick="if(window.openLocationAssistant) window.openLocationAssistant();" style="background: var(--vendor-forest, #152d24); border-color: var(--vendor-gold, #c2a246);">
            ➕ Ubicar Producto Aquí
          </button>
        </div>
      </div>

      <!-- BANDEJA DE PENDIENTES DEL SECTOR (Productos en Sector general sin balda) -->
      ${sectorPendingProducts.length > 0 ? `
        <section class="wms-sector-pending-tray">
          <div class="wms-sector-pending-tray-header">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 1.4rem;">⚠️</span>
              <div>
                <strong style="color: #6d4c13; font-size: 0.98rem; display: block;">
                  ${sectorPendingProducts.length} producto${sectorPendingProducts.length === 1 ? '' : 's'} en este Sector sin góndola o balda asignada
                </strong>
                <small style="color: #8c6a28; font-size: 0.78rem;">
                  Podés seleccionarlos en bloque para asignarles Pared, Góndola y Balda.
                </small>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <label style="display: flex; align-items: center; gap: 6px; font-size: 0.82rem; font-weight: 700; color: #6d4c13; cursor: pointer;">
                <input type="checkbox" ${allPendingSelected ? 'checked' : ''} onchange="toggleAllSectorPendingSelection(${JSON.stringify(sectorPendingProducts.map(p => p.product_code || p.sku || p.product_id || p.id))}, this.checked)" style="width: 16px; height: 16px; accent-color: var(--vendor-forest); cursor: pointer;">
                <span>Seleccionar todos (${sectorPendingProducts.length})</span>
              </label>
              ${pendingSelectedCount > 0 ? `
                <button type="button" class="wms-sector-action-btn" onclick="triggerBatchSectorRefinement()">
                  📦 Ubicar seleccionados (${pendingSelectedCount}) en Góndola
                </button>
              ` : ''}
            </div>
          </div>

          <div class="wms-sector-pending-grid">
            ${sectorPendingProducts.map(p => {
              const pid = p.product_code || p.sku || p.product_id || p.id;
              const isSel = sectorPendingSelectedIds.has(String(pid));
              const stockNum = Number(p.stock ?? p.on_hand) || 0;
              const imgUrl = p.image_url || p.image || 'assets/logo.jpg';
              return `
                <div class="wms-sector-pending-card ${isSel ? 'selected' : ''}">
                  <input type="checkbox" ${isSel ? 'checked' : ''} onchange="toggleSectorPendingSelection('${escapeMapHtml(pid)}', this.checked)" style="width: 18px; height: 18px; accent-color: var(--vendor-forest); cursor: pointer;" aria-label="Seleccionar ${escapeMapHtml(p.name || 'producto')}">
                  <img src="${escapeMapHtml(imgUrl)}" alt="${escapeMapHtml(p.name || 'Producto')}" class="wms-product-thumb" onclick="openWmsLightbox('${escapeMapHtml(imgUrl)}', '${escapeMapHtml(p.name || 'Producto')}', 'En Sector · Sin balda')" style="width: 44px; height: 44px; min-width: 44px;">
                  <div style="flex: 1; min-width: 0;">
                    <strong style="font-size: 0.88rem; color: var(--vendor-forest); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      ${escapeMapHtml(p.name || 'Producto')}
                    </strong>
                    <small style="color: #666; font-size: 0.76rem;">${escapeMapHtml(pid)} · <span class="gba-stock-pill gba-badge-ok">${stockNum} u.</span></small>
                  </div>
                  <button type="button" class="gba-qr-btn" onclick="if(window.openEditProductLocation) window.openEditProductLocation('${escapeMapHtml(pid)}');" title="Asignar góndola y nivel">
                    📍 Asignar Góndola
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        </section>
      ` : ''}

      <!-- Main Content: Active Positioned Products grouped cleanly by Wall/Module -->
      ${positionedProducts.length > 0 ? `
        <div style="display: flex; flex-direction: column; gap: 16px;">
          ${Array.from(wallGroups.entries()).map(([wallKey, group]) => {
            const wallUnits = group.products.reduce((sum, p) => sum + (Number(p.stock ?? p.on_hand) || 0), 0);
            
            // Group products in this wall by level
            const levelMap = new Map();
            group.products.forEach(p => {
              const rawLoc = String(p.wms_code || p.shelf_code || p.location || '');
              const cleanInfo = getCleanWallOrModuleInfo(rawLoc);
              const lvl = p.shelf_level ?? cleanInfo.levelNum ?? 1;
              if (!levelMap.has(lvl)) levelMap.set(lvl, []);
              levelMap.get(lvl).push(p);
            });

            return `
              <section class="wms-sector-wall-group">
                <header class="wms-wall-group-header">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1.3rem;">${group.info.icon}</span>
                    <div>
                      <h4 style="margin: 0; color: var(--vendor-forest, #152d24); font-size: 1.05rem; font-weight: 800;">
                        ${escapeMapHtml(group.info.cleanTitle)}
                      </h4>
                      <small style="color: #666; font-size: 0.78rem;">Orientación respecto a PC: ${escapeMapHtml(group.info.compass)}</small>
                    </div>
                  </div>
                  <span class="wms-sector-pill">
                    ${group.products.length} producto${group.products.length === 1 ? '' : 's'} · ${wallUnits} u.
                  </span>
                </header>

                <div class="wms-wall-group-body">
                  ${Array.from(levelMap.entries()).sort((a, b) => b[0] - a[0]).map(([lvlNum, prods]) => `
                    <div style="margin-bottom: 12px;">
                      <div class="wms-level-subheading">
                        <span>🪜 ${LEVEL_NAMES[lvlNum] || `Nivel ${lvlNum}`}</span>
                        <small>(${prods.length} ítem${prods.length === 1 ? '' : 's'})</small>
                      </div>
                      <div class="wms-products-grid">
                        ${renderProductCardsList(prods)}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </section>
            `;
          }).join('')}
        </div>
      ` : (sectorPendingProducts.length === 0 ? `
        <div class="wms-empty-slot-card" style="padding: 32px 20px; text-align: center; display: flex; flex-direction: column; gap: 12px; align-items: center;">
          <span style="font-size: 2.2rem;">🌱</span>
          <strong style="font-size: 1.1rem; color: var(--vendor-forest, #152d24);">No hay productos ubicados en este sector todavía</strong>
          <p style="margin: 0; max-width: 420px; font-size: 0.88rem; color: #666;">
            Podés asignar productos a las paredes o módulos de este sector desde el Asistente de Ubicación.
          </p>
          <button type="button" class="wms-sector-action-btn" onclick="if(window.openLocationAssistant) window.openLocationAssistant();" style="margin-top: 6px;">
            ➕ Asignar Primer Producto
          </button>
        </div>
      ` : '')}

      <!-- Collapsible Full Inspector for Empty Shelves & Levels N1 to N6 -->
      <div style="background: #ffffff; border: 1.5px solid rgba(194, 162, 70, 0.35); border-radius: 16px; overflow: hidden; margin-top: 8px;">
        <div style="padding: 14px 18px; background: #faf7ee; display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="toggleFullShelvesInspector()">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 1.1rem;">📐</span>
            <strong style="color: var(--vendor-forest, #152d24); font-size: 0.95rem;">
              Explorador Completo de Baldas (Nivel 1 al 6 y Espacios Disponibles)
            </strong>
          </div>
          <span style="font-size: 0.85rem; font-weight: 700; color: var(--vendor-gold, #c2a246);">
            ${isFullShelvesInspectorOpen ? '▲ Ocultar' : '▼ Ver baldas vacías'}
          </span>
        </div>

        ${isFullShelvesInspectorOpen ? `
          <div style="padding: 18px; display: flex; flex-direction: column; gap: 14px;">
            <div class="wms-furniture-grid">
              ${['P1', 'P2', 'P3', 'P4'].map(wCode => {
                const wInfo = getCleanWallOrModuleInfo(wCode);
                const isSelected = wCode === selectedShelfCode;
                const count = getShelfUnitCount(wCode);
                return `
                  <div class="wms-furniture-card ${isSelected ? 'active' : ''}" onclick="selectShelf('${wCode}')">
                    <div class="wms-furniture-card-header">
                      <span class="wms-furniture-code">${wCode}</span>
                      <span class="gba-stock-pill gba-badge-ok">${count} u.</span>
                    </div>
                    <strong style="color: var(--vendor-forest, #152d24); font-size: 0.95rem; display: block; margin-bottom: 4px;">${wInfo.icon} ${escapeMapHtml(wInfo.cleanTitle)}</strong>
                    <small style="color: #666; font-size: 0.76rem;">${isSelected ? '👉 Baldas N1..N6 desplegadas abajo' : 'Tocá para inspeccionar baldas'}</small>
                  </div>
                `;
              }).join('')}
            </div>

            <!-- Levels of the selected shelf -->
            <div class="wms-levels-container" style="margin-top: 10px;">
              ${[6, 5, 4, 3, 2, 1].map(lvlNum => {
                const lvlProducts = getShelfProducts(selectedShelfCode, lvlNum);
                const isSelectedLevel = lvlNum === selectedInternalLevel;
                return `
                  <div class="wms-level-row">
                    <div class="wms-level-header" onclick="setInternalLevel(${lvlNum})" style="cursor: pointer;">
                      <strong>
                        <span>${lvlNum === 1 ? '🧱' : lvlNum === 6 ? '🔝' : '📦'}</span>
                        ${LEVEL_NAMES[lvlNum]} · ${lvlProducts.length} productos
                      </strong>
                      <span style="font-size: 0.8rem; font-weight: 700; color: var(--vendor-forest, #152d24);">
                        ${isSelectedLevel ? '▲ Desplegado' : '▼ Ver'}
                      </span>
                    </div>
                    <div class="wms-level-body" ${isSelectedLevel ? '' : 'style="display: none;"'}>
                      ${lvlProducts.length > 0 ? `
                        <div class="wms-products-grid">
                          ${renderProductCardsList(lvlProducts)}
                        </div>
                      ` : `
                        <div class="wms-empty-slot-card">
                          <span>🌿 Esta balda está libre y disponible.</span>
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
        ` : ''}
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
                else if (item.action === 'ASIGNACION_SECTOR_RAPIDA') badgeClass = 'gba-badge-locate';
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
window.toggleFullShelvesInspector = toggleFullShelvesInspector;
window.toggleSectorPendingSelection = toggleSectorPendingSelection;
window.toggleAllSectorPendingSelection = toggleAllSectorPendingSelection;
window.triggerBatchSectorRefinement = triggerBatchSectorRefinement;
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
