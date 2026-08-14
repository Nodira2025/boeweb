// BÔ Grow Club — Mapa de Estanterías estilo GBA Pokémon Verde Hoja / FireRed (32-bit RPG)
// Con la Computadora Central como punto de referencia cardinal (Brújula) para Tienda y Depósito.

const DEFAULT_STORE_SHELVES = [
  // =========================================================================
  // PLANTA 1: SALÓN TIENDA (PC EN EL CENTRO COMO BRÚJULA)
  // =========================================================================
  { id: 'tie-pc-center', code: 'PC-CENTRO', zone_code: 'PC', name: '💻 PC Central (Punto de Referencia / Brújula)', floor_level: 1, x: 42, y: 40, width: 16, height: 16, icon: '💻', is_anchor: true },

  // PARED 1 (FRENTE / NORTE - ARRIBA)
  { id: 'tie-P1-VIT1', code: 'P1-VIT1', zone_code: 'A', name: 'Pared 1 · Vitrina 1 (Semillas)', floor_level: 1, x: 4, y: 8, width: 14, height: 14, icon: '💎' },
  { id: 'tie-P1-E1', code: 'P1-E1', zone_code: 'A', name: 'Pared 1 · Estante 1', floor_level: 1, x: 20, y: 8, width: 13, height: 14, icon: '🪵' },
  { id: 'tie-P1-E2', code: 'P1-E2', zone_code: 'A', name: 'Pared 1 · Estante 2', floor_level: 1, x: 35, y: 8, width: 13, height: 14, icon: '🪵' },
  { id: 'tie-P1-E3', code: 'P1-E3', zone_code: 'A', name: 'Pared 1 · Estante 3', floor_level: 1, x: 50, y: 8, width: 13, height: 14, icon: '🪵' },
  { id: 'tie-P1-E4', code: 'P1-E4', zone_code: 'A', name: 'Pared 1 · Estante 4', floor_level: 1, x: 65, y: 8, width: 13, height: 14, icon: '🪵' },
  { id: 'tie-P1-HEL1', code: 'P1-HEL1', zone_code: 'A', name: 'Pared 1 · Heladera 1 (Frío/Biotec)', floor_level: 1, x: 80, y: 8, width: 14, height: 14, icon: '❄️' },

  // PARED 2 (FONDO / SUR - ABAJO)
  { id: 'tie-P2-E1', code: 'P2-E1', zone_code: 'B', name: 'Pared 2 · Estante 1', floor_level: 1, x: 10, y: 78, width: 14, height: 14, icon: '🪵' },
  { id: 'tie-P2-E2', code: 'P2-E2', zone_code: 'B', name: 'Pared 2 · Estante 2', floor_level: 1, x: 26, y: 78, width: 14, height: 14, icon: '🪵' },
  { id: 'tie-P2-E3', code: 'P2-E3', zone_code: 'B', name: 'Pared 2 · Estante 3', floor_level: 1, x: 42, y: 78, width: 14, height: 14, icon: '🪵' },
  { id: 'tie-P2-E4', code: 'P2-E4', zone_code: 'B', name: 'Pared 2 · Estante 4', floor_level: 1, x: 58, y: 78, width: 14, height: 14, icon: '🪵' },
  { id: 'tie-P2-E5', code: 'P2-E5', zone_code: 'B', name: 'Pared 2 · Estante 5', floor_level: 1, x: 74, y: 78, width: 14, height: 14, icon: '🪵' },

  // PARED 3 (DERECHA / ESTE - LATERAL DERECHO)
  { id: 'tie-P3-E1', code: 'P3-E1', zone_code: 'C', name: 'Pared 3 (Derecha) · Estante 1', floor_level: 1, x: 86, y: 26, width: 11, height: 15, icon: '🪜' },
  { id: 'tie-P3-E2', code: 'P3-E2', zone_code: 'C', name: 'Pared 3 (Derecha) · Estante 2', floor_level: 1, x: 86, y: 44, width: 11, height: 15, icon: '🪜' },
  { id: 'tie-P3-E3', code: 'P3-E3', zone_code: 'C', name: 'Pared 3 (Derecha) · Estante 3', floor_level: 1, x: 86, y: 62, width: 11, height: 15, icon: '🪜' },

  // PARED 4 (IZQUIERDA / OESTE - LATERAL IZQUIERDO)
  { id: 'tie-P4-E1', code: 'P4-E1', zone_code: 'D', name: 'Pared 4 (Izquierda) · Estante 1', floor_level: 1, x: 3, y: 26, width: 11, height: 15, icon: '🪜' },
  { id: 'tie-P4-E2', code: 'P4-E2', zone_code: 'D', name: 'Pared 4 (Izquierda) · Estante 2', floor_level: 1, x: 3, y: 44, width: 11, height: 15, icon: '🪜' },
  { id: 'tie-P4-E3', code: 'P4-E3', zone_code: 'D', name: 'Pared 4 (Izquierda) · Estante 3', floor_level: 1, x: 3, y: 62, width: 11, height: 15, icon: '🪜' },

  // =========================================================================
  // PLANTA 2: DEPÓSITO GENERAL / ALMACÉN (PC EN EL CENTRO COMO BRÚJULA)
  // =========================================================================
  { id: 'dep-pc-center', code: 'PC-CENTRO', zone_code: 'PC', name: '💻 PC Central de Depósito (Brújula de Referencia)', floor_level: 2, x: 42, y: 40, width: 16, height: 16, icon: '💻', is_anchor: true },

  // PARED 1 (FRENTE / NORTE - ARRIBA)
  { id: 'dep-P1-E1', code: 'P1-E1', zone_code: 'A', name: 'Pared 1 (Frente) · Estante 1', floor_level: 2, x: 10, y: 8, width: 14, height: 14, icon: '📦' },
  { id: 'dep-P1-E2', code: 'P1-E2', zone_code: 'A', name: 'Pared 1 (Frente) · Estante 2', floor_level: 2, x: 26, y: 8, width: 14, height: 14, icon: '📦' },
  { id: 'dep-P1-E3', code: 'P1-E3', zone_code: 'A', name: 'Pared 1 (Frente) · Estante 3', floor_level: 2, x: 42, y: 8, width: 14, height: 14, icon: '📦' },
  { id: 'dep-P1-E4', code: 'P1-E4', zone_code: 'A', name: 'Pared 1 (Frente) · Estante 4', floor_level: 2, x: 58, y: 8, width: 14, height: 14, icon: '📦' },
  { id: 'dep-P1-E5', code: 'P1-E5', zone_code: 'A', name: 'Pared 1 (Frente) · Estante 5', floor_level: 2, x: 74, y: 8, width: 14, height: 14, icon: '📦' },

  // PARED 2 (FONDO / SUR - ABAJO)
  { id: 'dep-P2-E1', code: 'P2-E1', zone_code: 'B', name: 'Pared 2 (Fondo) · Estante 1', floor_level: 2, x: 8, y: 78, width: 13, height: 14, icon: '🧱' },
  { id: 'dep-P2-E2', code: 'P2-E2', zone_code: 'B', name: 'Pared 2 (Fondo) · Estante 2', floor_level: 2, x: 23, y: 78, width: 13, height: 14, icon: '🧱' },
  { id: 'dep-P2-E3', code: 'P2-E3', zone_code: 'B', name: 'Pared 2 (Fondo) · Estante 3', floor_level: 2, x: 38, y: 78, width: 13, height: 14, icon: '🧱' },
  { id: 'dep-P2-E4', code: 'P2-E4', zone_code: 'B', name: 'Pared 2 (Fondo) · Estante 4', floor_level: 2, x: 53, y: 78, width: 13, height: 14, icon: '🧱' },
  { id: 'dep-P2-E5', code: 'P2-E5', zone_code: 'B', name: 'Pared 2 (Fondo) · Estante 5', floor_level: 2, x: 68, y: 78, width: 13, height: 14, icon: '🧱' },
  { id: 'dep-P2-PIS1', code: 'P2-PIS1', zone_code: 'B', name: 'Pared 2 · Pallet Sustratos (Piso)', floor_level: 2, x: 83, y: 78, width: 14, height: 14, icon: '📦' },

  // PARED 3 (DERECHA / ESTE - LATERAL DERECHO)
  { id: 'dep-P3-E1', code: 'P3-E1', zone_code: 'C', name: 'Pared 3 (Derecha) · Estante 1', floor_level: 2, x: 86, y: 26, width: 11, height: 15, icon: '🗄️' },
  { id: 'dep-P3-E2', code: 'P3-E2', zone_code: 'C', name: 'Pared 3 (Derecha) · Estante 2', floor_level: 2, x: 86, y: 44, width: 11, height: 15, icon: '🗄️' },
  { id: 'dep-P3-E3', code: 'P3-E3', zone_code: 'C', name: 'Pared 3 (Derecha) · Estante 3', floor_level: 2, x: 86, y: 62, width: 11, height: 15, icon: '🗄️' },

  // PARED 4 (IZQUIERDA / OESTE - LATERAL IZQUIERDO)
  { id: 'dep-P4-E1', code: 'P4-E1', zone_code: 'D', name: 'Pared 4 (Izquierda) · Estante 1', floor_level: 2, x: 3, y: 26, width: 11, height: 15, icon: '🗄️' },
  { id: 'dep-P4-E2', code: 'P4-E2', zone_code: 'D', name: 'Pared 4 (Izquierda) · Estante 2', floor_level: 2, x: 3, y: 44, width: 11, height: 15, icon: '🗄️' },
  { id: 'dep-P4-E3', code: 'P4-E3', zone_code: 'D', name: 'Pared 4 (Izquierda) · Estante 3', floor_level: 2, x: 3, y: 62, width: 11, height: 15, icon: '🗄️' }
];

const FLOOR_NAMES = { 1: '🏪 SALÓN TIENDA (PC AL CENTRO)', 2: '📦 DEPÓSITO GENERAL (PC AL CENTRO)' };
const LEVEL_NAMES = {
  1: 'Nv.1 Piso/Base (Abajo)',
  2: 'Nv.2 Bajo',
  3: 'Nv.3 Medio',
  4: 'Nv.4 Medio-Alto',
  5: 'Nv.5 Alto',
  6: 'Nv.6 Tope (Arriba)'
};
const MAP_LAYOUT_KEY = 'boeweb_custom_store_layout_gba_v6';
const MAP_PHOTOS_KEY = 'boeweb_store_shelf_photos_v1';

let storeShelves = loadSavedStoreLayout();
let storeLocationProducts = [];
let selectedFloorLevel = 1;
let selectedShelfCode = 'P1-E1';
let selectedInternalLevel = 3;
let currentViewMode = '2D';
let activeMapTab = 'interactive'; // 'interactive' | 'illustration'
let mapZoomLevel = 100;
let isEditMode = false;
let storeMapSyncLabel = 'BRÚJULA CENTRAL CONECTADA';

function escapeMapHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function loadSavedStoreLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(MAP_LAYOUT_KEY) || 'null');
    return Array.isArray(saved) && saved.length ? saved : structuredClone(DEFAULT_STORE_SHELVES);
  } catch (error) {
    console.warn('No se pudo leer el plano guardado:', error);
    return structuredClone(DEFAULT_STORE_SHELVES);
  }
}

function getLocalShelfPhotos() {
  try {
    return JSON.parse(localStorage.getItem(MAP_PHOTOS_KEY) || '{}');
  } catch (error) {
    console.warn('No se pudieron leer las fotos locales de estantes:', error);
    return {};
  }
}

function saveStoreLayout() {
  try {
    localStorage.setItem(MAP_LAYOUT_KEY, JSON.stringify(storeShelves));
  } catch (error) {
    console.error('No se pudo guardar el plano:', error);
  }
}

function normalizeShelf(shelf) {
  const fallback = DEFAULT_STORE_SHELVES.find(item => item.code === shelf.code) || {};
  return {
    ...fallback,
    ...shelf,
    zone_code: shelf.zone_code || shelf.zoneCode || fallback.zone_code || String(shelf.code || '').charAt(0),
    floor_level: Number(shelf.floor_level || shelf.floor || fallback.floor_level || 1),
    x: Number(shelf.x ?? fallback.x ?? 10),
    y: Number(shelf.y ?? fallback.y ?? 10),
    width: Number(shelf.width ?? fallback.width ?? 14),
    height: Number(shelf.height ?? fallback.height ?? 14),
    icon: shelf.icon || fallback.icon || '📦',
    is_anchor: shelf.is_anchor || fallback.is_anchor || false
  };
}

function setStoreMapData(shelves = [], products = [], syncLabel = 'Inventario sincronizado') {
  const localPhotos = getLocalShelfPhotos();
  const remoteByCode = new Map((shelves || []).map(item => [item.code, item]));
  storeShelves = storeShelves.map(localShelf => {
    const merged = normalizeShelf({ ...localShelf, ...(remoteByCode.get(localShelf.code) || {}) });
    merged.photo_url = merged.photo_url || localPhotos[merged.code] || null;
    return merged;
  });
  shelves.forEach(remoteShelf => {
    if (!storeShelves.some(item => item.code === remoteShelf.code)) {
      const normalized = normalizeShelf(remoteShelf);
      normalized.photo_url = normalized.photo_url || localPhotos[normalized.code] || null;
      storeShelves.push(normalized);
    }
  });
  storeLocationProducts = Array.isArray(products) ? products : [];
  storeMapSyncLabel = syncLabel;
  saveStoreLayout();
}

function setFloorLevel(level) {
  selectedFloorLevel = Number(level) || 1;
  const firstShelf = storeShelves.find(item => item.floor_level === selectedFloorLevel && !item.is_anchor);
  if (firstShelf) selectedShelfCode = firstShelf.code;
  rerenderStoreMap();
}

function selectShelf(code, internalLevel = null) {
  const shelf = storeShelves.find(item => item.code === code)
    || storeShelves.find(item => String(item.code).toUpperCase() === String(code).toUpperCase());
  if (!shelf) return;
  selectedShelfCode = shelf.code;
  selectedFloorLevel = shelf.floor_level;
  if (internalLevel) selectedInternalLevel = Number(internalLevel);
  rerenderStoreMap();
}

function setInternalLevel(level) {
  selectedInternalLevel = Number(level) || 1;
  rerenderStoreMap();
}

function setViewMode(mode) {
  currentViewMode = mode === '3D' ? '3D' : '2D';
  rerenderStoreMap();
}

function setMapTab(tab) {
  activeMapTab = tab;
  rerenderStoreMap();
}

function adjustZoom(delta) {
  mapZoomLevel = Math.max(75, Math.min(140, mapZoomLevel + Number(delta || 0)));
  const canvas = document.getElementById('architectural-map-canvas');
  if (canvas) canvas.style.transform = getCanvasTransform();
}

function getCanvasTransform() {
  const scale = `scale(${mapZoomLevel / 100})`;
  return currentViewMode === '3D' ? `perspective(1000px) rotateX(12deg) ${scale}` : scale;
}

function rerenderStoreMap() {
  if (window.renderStoreMapUI) window.renderStoreMapUI(null, null, null, false);
}

function getShelfProducts(code, internalLevel = null) {
  return storeLocationProducts.filter(product => {
    const rawShelf = String(product.shelf_code || '').toUpperCase();
    const targetCode = String(code || '').toUpperCase();
    const sameShelf = rawShelf === targetCode || rawShelf.includes(targetCode) || targetCode.includes(rawShelf);
    return sameShelf && (!internalLevel || Number(product.shelf_level) === Number(internalLevel));
  });
}

function getShelfUnitCount(code) {
  return getShelfProducts(code).reduce((sum, product) => sum + Math.max(0, Number(product.stock) || 0), 0);
}

function findStoreMapProduct(query) {
  const normalized = String(query || '').trim().toLocaleLowerCase('es-AR');
  if (!normalized) return null;
  const product = storeLocationProducts.find(item => [item.name, item.product_code, item.barcode, item.shelf_code, item.location_label]
    .some(value => String(value || '').toLocaleLowerCase('es-AR').includes(normalized)));
  if (!product) return null;
  return {
    product,
    shelfCode: product.shelf_code,
    level: Number(product.shelf_level) || 1,
    floor: Number(product.floor_level) || 1
  };
}

function focusStoreMapProduct(productCode) {
  const match = findStoreMapProduct(productCode);
  if (!match) return false;
  selectedShelfCode = match.shelfCode;
  selectedInternalLevel = match.level;
  selectedFloorLevel = match.floor;
  rerenderStoreMap();
  return true;
}

function moveStoreItem(id, dx, dy) {
  const shelf = storeShelves.find(item => item.id === id);
  if (!shelf) return;
  shelf.x = Math.max(2, Math.min(88, shelf.x + Number(dx || 0)));
  shelf.y = Math.max(2, Math.min(84, shelf.y + Number(dy || 0)));
  saveStoreLayout();
  rerenderStoreMap();
}

function toggleStoreLayoutEditMode() {
  isEditMode = !isEditMode;
  saveStoreLayout();
  if (!isEditMode && window.showToast) window.showToast('🎮 Plano guardado en el Game Boy.');
  rerenderStoreMap();
}

function resetStoreLayoutToDefault() {
  storeShelves = structuredClone(DEFAULT_STORE_SHELVES);
  saveStoreLayout();
  selectedFloorLevel = 1;
  selectedShelfCode = 'A-1';
  rerenderStoreMap();
}

function showShelfDetailsModal(code) {
  const shelf = storeShelves.find(item => item.code === code);
  if (!shelf) return;
  const unitCount = getShelfUnitCount(code);
  const message = `🌿 ${FLOOR_NAMES[shelf.floor_level]} · Estante ${shelf.code} · ${LEVEL_NAMES[selectedInternalLevel] || 'Nivel ' + selectedInternalLevel} · ${unitCount} u.`;
  if (window.showToast) window.showToast(message);
}

function parseLocationCode(code) {
  const raw = String(code || '').trim().toUpperCase();
  const parts = raw.split('-');
  if (parts.length >= 6) {
    const [zone, compass, wall, shelf, level, sector] = parts;
    return {
      zone: zone === 'TI' ? 'Tienda' : zone === 'DP' ? 'Depósito' : zone,
      zoneCode: zone,
      compass: compass === 'D' ? 'Derecha' : compass === 'I' ? 'Izquierda' : compass === 'F' ? 'Frente' : compass === 'A' ? 'Atrás' : compass,
      compassCode: compass,
      wall: wall.replace('P', 'Pared '),
      wallCode: wall,
      shelf: shelf.startsWith('E') ? shelf.replace('E', 'Estante ') : shelf,
      shelfCode: shelf,
      level: level.replace('N', 'Nivel '),
      levelNum: Number(level.replace(/\D/g, '')) || 1,
      sector: sector === 'I' ? 'Izquierda' : sector === 'C' ? 'Centro' : sector === 'D' ? 'Derecha' : sector,
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
  const zone = loc.zone || (loc.zoneCode === 'DP' ? 'el depósito' : 'la tienda');
  const compass = loc.compass || 'frente';
  const wall = loc.wall || 'Pared 1';
  const shelf = loc.shelf || 'Estante 1';
  const level = loc.level || `nivel ${loc.levelNum || 1}`;
  const sector = loc.sector || 'centro';
  return `Está en ${zone.toLowerCase()}, a la ${compass.toLowerCase()} de la PC, ${wall.toLowerCase()}, ${shelf.toLowerCase()}, ${level.toLowerCase()}, sector ${sector.toLowerCase()}.`;
}

function renderShelfBlocks() {
  const floorShelves = storeShelves.filter(item => item.floor_level === selectedFloorLevel);
  if (!floorShelves.length) {
    return `<div class="gba-empty-room"><div><span style="font-size:2.5rem;">🌿</span><br><strong>SALA SIN ESTANTES</strong><br><small>Ajustá el plano para colocar módulos.</small></div></div>`;
  }
  return floorShelves.map(shelf => {
    // Si es la Computadora Central (Brújula)
    if (shelf.is_anchor) {
      return `
        <div class="gba-shelf-wrapper gba-anchor-pc-wrapper" style="left:${shelf.x}%;top:${shelf.y}%;width:${shelf.width}%;height:${shelf.height}%;">
          <div class="gba-anchor-pc" title="Computadora Central: Punto de Referencia Cardinal">
            <div class="gba-pc-screen">💻</div>
            <strong class="gba-pc-title">PC CENTRAL</strong>
            <small class="gba-pc-sub">(BRÚJULA)</small>
            
            <!-- Flechas Cardinales de Brújula -->
            <span class="gba-compass-arrow gba-compass-north" title="Frente / Norte (Pared 1)">⬆️ Frente</span>
            <span class="gba-compass-arrow gba-compass-south" title="Atrás / Sur (Pared 2)">⬇️ Atrás</span>
            <span class="gba-compass-arrow gba-compass-east" title="Derecha / Este (Pared 3)">➡️ Derecha</span>
            <span class="gba-compass-arrow gba-compass-west" title="Izquierda / Oeste (Pared 4)">⬅️ Izquierda</span>
          </div>
        </div>`;
    }

    const count = getShelfUnitCount(shelf.code);
    const selected = shelf.code === selectedShelfCode;
    
    // HP Bar calculation
    let hpColor = '#4caf50'; // Green (>10)
    let hpPercent = Math.min(100, Math.max(8, (count / 25) * 100));
    if (count === 0) {
      hpColor = '#e53935';
      hpPercent = 0;
    } else if (count < 10) {
      hpColor = '#fbc02d';
    }

    return `
      <div class="gba-shelf-wrapper" style="left:${shelf.x}%;top:${shelf.y}%;width:${shelf.width}%;height:${shelf.height}%;">
        <button type="button" class="gba-shelf-block ${selected ? 'selected' : ''}" data-zone="${escapeMapHtml(shelf.zone_code)}"
          onclick="selectShelf('${escapeMapHtml(shelf.code)}')" aria-label="Estante ${escapeMapHtml(shelf.code)}, ${count} unidades">
          
          <div class="gba-shelf-header">
            <span class="gba-shelf-icon">${shelf.icon || '📦'}</span>
            <strong class="gba-shelf-code">${escapeMapHtml(shelf.code)}</strong>
          </div>
          
          <div class="gba-hp-track" title="${count} unidades">
            <div class="gba-hp-fill" style="width: ${hpPercent}%; background: ${hpColor};"></div>
          </div>
          
          <span class="gba-shelf-count">${count} u.</span>
          ${selected ? '<span class="gba-cursor-tag">🎯</span>' : ''}
        </button>
        ${isEditMode ? `<div class="gba-editor-arrows">
          <button type="button" onclick="moveStoreItem('${escapeMapHtml(shelf.id)}',-3,0)">◀</button>
          <button type="button" onclick="moveStoreItem('${escapeMapHtml(shelf.id)}',3,0)">▶</button>
        </div>` : ''}
      </div>`;
  }).join('');
}

function renderProductRows(products) {
  if (!products.length) {
    return `<div class="gba-bag-empty"><span style="font-size: 1.5rem; display: block; margin-bottom: 6px;">🎒</span>No hay objetos en este nivel del estante.</div>`;
  }
  return products.map(product => {
    const exactPosition = product.shelf_position ? ` · ${escapeMapHtml(product.shelf_position)}` : '';
    const stockNum = Number(product.stock) || 0;
    const stockBadgeClass = stockNum > 5 ? 'gba-badge-ok' : stockNum > 0 ? 'gba-badge-low' : 'gba-badge-zero';
    return `
      <article class="gba-item-row" data-product-code="${escapeMapHtml(product.product_code)}">
        <div class="gba-item-thumb">
          ${product.image_url ? `<img src="${escapeMapHtml(product.image_url)}" alt="${escapeMapHtml(product.name || 'Producto')}">` : '<span class="gba-item-icon-ph">🌿</span>'}
        </div>
        <div class="gba-item-info">
          <strong>${escapeMapHtml(product.name || 'Producto sin nombre')}</strong>
          <small>${escapeMapHtml(product.product_code || 'SIN CÓD')} · <span class="gba-stock-pill ${stockBadgeClass}">x${stockNum}</span>${exactPosition}</small>
        </div>
        <button type="button" class="gba-qr-btn" onclick="printProductQrByCode('${escapeMapHtml(product.product_code)}')" aria-label="Imprimir QR">QR</button>
      </article>`;
  }).join('');
}

function renderSelectedShelfPanel() {
  const shelf = storeShelves.find(item => item.code === selectedShelfCode)
    || storeShelves.find(item => item.floor_level === selectedFloorLevel && !item.is_anchor)
    || storeShelves[0];
  if (!shelf) return '';
  selectedShelfCode = shelf.code;
  const allProducts = getShelfProducts(shelf.code);
  const visibleProducts = getShelfProducts(shelf.code, selectedInternalLevel);
  const unitCount = allProducts.reduce((sum, product) => sum + (Number(product.stock) || 0), 0);
  
  // 6 Niveles según el diagrama oficial (N1 abajo .. N6 arriba)
  const levels = [1, 2, 3, 4, 5, 6].map(level => {
    const lvlUnits = getShelfProducts(shelf.code, level).reduce((sum, item) => sum + (Number(item.stock) || 0), 0);
    return `
      <button type="button" class="gba-level-btn ${selectedInternalLevel === level ? 'active' : ''}" onclick="setInternalLevel(${level})">
        <span class="gba-lvl-num">N${level}</span>
        <small class="gba-lvl-qty">${lvlUnits}u</small>
      </button>`;
  }).join('');

  return `
    <aside class="gba-inspector-side">
      <!-- Retro GBA Dialog Window Box -->
      <section class="gba-dialog-box" aria-labelledby="map-selected-shelf-title">
        <div class="gba-dialog-banner">
          <span class="gba-poke-ball">🔴</span>
          <span class="gba-dialog-kicker">INFORMACIÓN DEL ESTANTE</span>
          <span class="gba-poke-leaf">🌿</span>
        </div>
        <h3 id="map-selected-shelf-title" class="gba-shelf-title">${escapeMapHtml(shelf.code)} · ${escapeMapHtml(shelf.name)}</h3>
        <div class="gba-dialog-meta">
          <span>${escapeMapHtml(FLOOR_NAMES[shelf.floor_level])}</span> · 
          <strong>${unitCount} UNIDADES EN TOTAL</strong>
        </div>

        <div class="gba-photo-frame">
          ${shelf.photo_url ? `<img src="${escapeMapHtml(shelf.photo_url)}" alt="Foto del estante ${escapeMapHtml(shelf.code)}">` : '<div class="gba-photo-empty"><span>📷 SIN FOTO DEL MUEBLE</span><small>Agregá una imagen de referencia.</small></div>'}
        </div>

        <div class="gba-photo-buttons">
          <label class="gba-action-btn-green">
            ${shelf.photo_url ? '🔄 CAMBIAR FOTO' : '📸 CARGAR FOTO'}
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onchange="handleShelfPhotoChange(event,'${escapeMapHtml(shelf.code)}')">
          </label>
          <button type="button" class="gba-action-btn-gold" onclick="showShelfDetailsModal('${escapeMapHtml(shelf.code)}')">📋 RESUMEN</button>
        </div>

        <div class="gba-levels-row">
          <div class="gba-levels-label">ALTURA / BALDA (N1 = Abajo, N6 = Arriba):</div>
          <div class="gba-levels-grid" style="grid-template-columns: repeat(6, 1fr);">${levels}</div>
        </div>
      </section>

      <!-- Retro GBA Item Bag / Products Box -->
      <section class="gba-bag-box" aria-labelledby="map-products-title">
        <div class="gba-bag-header">
          <span class="gba-bag-icon">🎒</span>
          <h3 id="map-products-title" class="gba-bag-title">OBJETOS EN NIVEL ${selectedInternalLevel} (${LEVEL_NAMES[selectedInternalLevel] || ''})</h3>
        </div>
        <div class="gba-bag-list">${renderProductRows(visibleProducts)}</div>
      </section>
    </aside>`;
}

function renderFloorTabs() {
  return Object.entries(FLOOR_NAMES).map(([floor, name]) => {
    const floorNum = Number(floor);
    const active = floorNum === selectedFloorLevel;
    const label = floorNum === 1 ? '🏪 SALÓN TIENDA (PC AL CENTRO)' : '📦 DEPÓSITO GENERAL (PC AL CENTRO)';
    return `<button type="button" class="gba-room-btn ${active ? 'active' : ''}" onclick="setFloorLevel(${floorNum})">${label}</button>`;
  }).join('');
}

function renderStoreMapHTML(activeZone = null, activeShelf = null, targetLevel = null) {
  if (activeShelf) {
    const shelf = storeShelves.find(item => item.code === activeShelf)
      || storeShelves.find(item => String(item.code).toUpperCase() === String(activeShelf).toUpperCase());
    if (shelf) {
      selectedShelfCode = shelf.code;
      selectedFloorLevel = shelf.floor_level;
    }
  }
  if (targetLevel) selectedInternalLevel = Number(targetLevel);
  const floorShelfCount = storeShelves.filter(item => item.floor_level === selectedFloorLevel && !item.is_anchor).length;
  const totalUnits = storeLocationProducts.reduce((sum, item) => sum + Math.max(0, Number(item.stock) || 0), 0);
  const currentRoomName = FLOOR_NAMES[selectedFloorLevel] || 'SALÓN';

  return `
    <div class="gba-map-shell">
      
      <!-- Top GBA Status Bar -->
      <div class="gba-screen-topbar">
        <div class="gba-topbar-left">
          <span class="gba-led-light"></span>
          <span class="gba-title-logo">🌿 BÔ GROW CLUB</span>
          <span class="gba-version-tag">BRÚJULA CENTRAL</span>
        </div>
        <div class="gba-topbar-right">
          <span class="gba-battery-tag">🧭 PC = CENTRO</span>
          <span class="gba-sync-tag">${escapeMapHtml(storeMapSyncLabel)}</span>
        </div>
      </div>

      <!-- Navigation & Controls Header -->
      <div class="gba-map-toolbar">
        <div class="gba-room-tabs">
          ${renderFloorTabs()}
          <button type="button" class="gba-room-btn ${activeMapTab === 'illustration' ? 'active' : ''}" onclick="setMapTab('illustration')">
            🖼️ PLANO ILUSTRADO
          </button>
          <button type="button" class="gba-room-btn ${activeMapTab === 'interactive' ? 'active' : ''}" onclick="setMapTab('interactive')">
            🎮 MAPA INTERACTIVO
          </button>
        </div>
        <div class="gba-hardware-buttons">
          <button type="button" class="gba-pad-btn ${isEditMode ? 'active' : ''}" onclick="toggleStoreLayoutEditMode()">${isEditMode ? '💾 GUARDAR' : '🛠️ EDITAR'}</button>
          ${isEditMode ? '<button type="button" class="gba-pad-btn" onclick="resetStoreLayoutToDefault()">↺ RESET</button>' : ''}
          <button type="button" class="gba-pad-btn ${currentViewMode === '2D' ? 'active' : ''}" onclick="setViewMode('2D')">2D</button>
          <button type="button" class="gba-pad-btn ${currentViewMode === '3D' ? 'active' : ''}" onclick="setViewMode('3D')">3D</button>
          <button type="button" class="gba-pad-btn" onclick="adjustZoom(-10)" aria-label="Alejar">🔍−</button>
          <button type="button" class="gba-pad-btn" onclick="adjustZoom(10)" aria-label="Acercar">🔍+</button>
        </div>
      </div>

      ${activeMapTab === 'illustration' ? `
        <!-- Vista Ilustrada / Infografía Oficial del Local -->
        <div style="background: #0f2318; border: 2px solid #2e6b4d; border-radius: 16px; padding: 18px; margin: 12px 0; text-align: center;">
          <h3 style="color: #a5d6a7; font-family: 'Press Start 2P', monospace; font-size: 0.8rem; margin: 0 0 12px 0;">
            🧭 SISTEMA DE UBICACIÓN — PC AL CENTRO COMO BRÚJULA
          </h3>
          <div style="max-width: 820px; margin: 0 auto; border: 3px solid #c2a246; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.5);">
            <img src="assets/store-shelf-map-gba.jpg" alt="Mapa Isométrico con PC Central y Estanterías Pared 1 a 4" style="width: 100%; height: auto; display: block;">
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-top: 14px; text-align: left; font-size: 0.8rem; color: #e8f5e9;">
            <div style="background: rgba(255,255,255,0.06); padding: 10px; border-radius: 10px; border-left: 3px solid #4caf50;">
              <strong>⬆️ Frente (Norte):</strong> Pared 1 con vitrinas y estantes.
            </div>
            <div style="background: rgba(255,255,255,0.06); padding: 10px; border-radius: 10px; border-left: 3px solid #fbc02d;">
              <strong>➡️ Derecha (Este):</strong> Pared 3 con estantes laterales.
            </div>
            <div style="background: rgba(255,255,255,0.06); padding: 10px; border-radius: 10px; border-left: 3px solid #29b6f6;">
              <strong>⬇️ Atrás (Sur):</strong> Pared 2 / Ingreso / Pallets.
            </div>
            <div style="background: rgba(255,255,255,0.06); padding: 10px; border-radius: 10px; border-left: 3px solid #ab47bc;">
              <strong>⬅️ Izquierda (Oeste):</strong> Pared 4 con estantes laterales.
            </div>
          </div>
        </div>
      ` : `
        <!-- Main Layout: Retro Canvas + Inspector -->
        <div class="gba-main-grid">
          <div class="gba-screen-viewport">
            
            <div id="architectural-map-canvas" class="gba-pokemart-canvas" style="transform:${getCanvasTransform()}">
              
              <!-- Room Background Floor Grid -->
              <div class="gba-floor-grid ${selectedFloorLevel === 2 ? 'gba-floor-warehouse' : 'gba-floor-wood'}"></div>

              <!-- Shelf & Compass Anchor Blocks -->
              ${renderShelfBlocks()}
            </div>
          </div>

          <!-- Right Side: Retro Inspector & Bag -->
          ${renderSelectedShelfPanel()}
        </div>
      `}

      <!-- Retro Bottom HUD -->
      <div class="gba-bottom-hud">
        <div class="gba-hud-stat">
          <span>SALA ACTUAL:</span>
          <strong>${escapeMapHtml(currentRoomName)}</strong>
        </div>
        <div class="gba-hud-stat">
          <span>ESTANTES ACTIVOS:</span>
          <strong>${floorShelfCount} MÓDULOS</strong>
        </div>
        <div class="gba-hud-stat">
          <span>TOTAL EN INVENTARIO:</span>
          <strong>${totalUnits} UNIDADES</strong>
        </div>
      </div>

    </div>`;
}

window.renderStoreMapHTML = renderStoreMapHTML;
window.setStoreMapData = setStoreMapData;
window.findStoreMapProduct = findStoreMapProduct;
window.focusStoreMapProduct = focusStoreMapProduct;
window.toggleStoreLayoutEditMode = toggleStoreLayoutEditMode;
window.moveStoreItem = moveStoreItem;
window.resetStoreLayoutToDefault = resetStoreLayoutToDefault;
window.setFloorLevel = setFloorLevel;
window.selectShelf = selectShelf;
window.setInternalLevel = setInternalLevel;
window.setViewMode = setViewMode;
window.adjustZoom = adjustZoom;
window.showShelfDetailsModal = showShelfDetailsModal;
window.setMapTab = setMapTab;
window.parseLocationCode = parseLocationCode;
window.formatLocationVoiceText = formatLocationVoiceText;
window.storeLocationProducts = storeLocationProducts;
window.storeShelves = storeShelves;
