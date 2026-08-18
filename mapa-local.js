// BÔ Grow Club — Mapa de Estanterías estilo GBA Pokémon Verde Hoja / FireRed (32-bit RPG)
// Con la Computadora Central como punto de referencia cardinal (Brújula) para Tienda y Depósito.
// Soporta mapa limpio por defecto (solo PC Central), creación/eliminación de estantes, auditoría e historial.

const DEFAULT_STORE_SHELVES = [
  // =========================================================================
  // SALÓN TIENDA (PISO 1): PC EN EL CENTRO COMO BRÚJULA
  // =========================================================================
  { id: 'tie-pc-center', code: 'PC-CENTRO', zone_code: 'PC', name: '💻 PC Central (Punto de Referencia / Brújula)', floor_level: 1, x: 42, y: 40, width: 16, height: 16, icon: '💻', is_anchor: true },

  // =========================================================================
  // DEPÓSITO GENERAL (PISO 2): PC EN EL CENTRO COMO BRÚJULA
  // =========================================================================
  { id: 'dep-pc-center', code: 'PC-CENTRO', zone_code: 'PC', name: '💻 PC Central de Depósito (Brújula de Referencia)', floor_level: 2, x: 42, y: 40, width: 16, height: 16, icon: '💻', is_anchor: true }
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

const MAP_LAYOUT_KEY = 'boeweb_custom_store_layout_gba_v7';
const MAP_PHOTOS_KEY = 'boeweb_store_shelf_photos_v1';
const MAP_HISTORY_KEY = 'boeweb_store_map_history_v1';

let storeShelves = loadSavedStoreLayout();
let storeLocationProducts = [];
let selectedFloorLevel = 1;
let selectedShelfCode = 'PC-CENTRO';
let selectedInternalLevel = 3;
let currentViewMode = '2D';
let activeMapTab = 'interactive'; // 'interactive' | 'illustration' | 'history'
let mapZoomLevel = 100;
let isEditMode = false;
let isAddShelfModalOpen = false;
let storeMapSyncLabel = 'BRÚJULA CENTRAL CONECTADA';

function escapeMapHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getCurrentMapUser() {
  try {
    const authSess = JSON.parse(localStorage.getItem('boeweb_saas_auth_session_v1') || '{}');
    if (authSess.user?.name || authSess.user?.email) return authSess.user.name || authSess.user.email;
    const vendorSess = JSON.parse(localStorage.getItem('saas_active_tenant_session') || '{}');
    if (vendorSess.user_name) return vendorSess.user_name;
  } catch (e) {}
  return 'Vendedor / Operador';
}

function getMapHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(MAP_HISTORY_KEY) || '[]');
    return Array.isArray(history) ? history : [];
  } catch (err) {
    return [];
  }
}

function logMapHistoryAction(action, label, details, shelfCode = null, floorLevel = null) {
  try {
    const history = getMapHistory();
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
    history.unshift(entry);
    localStorage.setItem(MAP_HISTORY_KEY, JSON.stringify(history.slice(0, 200)));
    return entry;
  } catch (err) {
    console.warn('No se pudo registrar historial del mapa:', err);
  }
}

function clearMapHistory() {
  if (confirm('¿Deseás borrar el historial de modificaciones del plano?')) {
    localStorage.removeItem(MAP_HISTORY_KEY);
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
  const headers = ['Fecha/Hora', 'Usuario', 'Acción', 'Título', 'Detalle', 'Estante', 'Piso'];
  const rows = history.map(item => [
    new Date(item.timestamp).toLocaleString('es-AR'),
    item.user,
    item.action,
    item.action_label,
    `"${String(item.details || '').replace(/"/g, '""')}"`,
    item.shelf_code || '-',
    item.floor_level === 2 ? 'Depósito' : 'Tienda'
  ]);
  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `historial_plano_boeweb_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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
    window.storeShelves = storeShelves;
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

function calculateDefaultCoordinatesForShelf(wallCode, floorLevel) {
  const wallShelves = storeShelves.filter(s => s.floor_level === floorLevel && !s.is_anchor && String(s.code).startsWith(wallCode));
  const index = wallShelves.length;

  if (wallCode === 'P1') { // Frente / Norte (Top wall)
    const x = Math.min(78, 6 + (index * 15));
    return { x, y: 8, width: 13, height: 14, icon: '🪵' };
  } else if (wallCode === 'P2') { // Fondo / Sur (Bottom wall)
    const x = Math.min(78, 6 + (index * 15));
    return { x, y: 78, width: 13, height: 14, icon: '🪵' };
  } else if (wallCode === 'P3') { // Derecha / Este (Right wall)
    const y = Math.min(74, 22 + (index * 17));
    return { x: 86, y, width: 11, height: 15, icon: '🪜' };
  } else if (wallCode === 'P4') { // Izquierda / Oeste (Left wall)
    const y = Math.min(74, 22 + (index * 17));
    return { x: 3, y, width: 11, height: 15, icon: '🪜' };
  } else { // Isla / Centro
    const x = Math.min(70, 24 + (index * 16));
    return { x, y: 58, width: 14, height: 14, icon: '📦' };
  }
}

function ensureShelfExistsForLocation(shelfCode, floorLevel = 1, locationLabel = '') {
  if (!shelfCode || shelfCode === 'PC-CENTRO') return null;
  const normalizedCode = String(shelfCode).trim().toUpperCase();
  const existing = storeShelves.find(s => s.code.toUpperCase() === normalizedCode && s.floor_level === floorLevel);
  if (existing) return existing;

  const wallMatch = normalizedCode.match(/P([1-4])/);
  const wallCode = wallMatch ? `P${wallMatch[1]}` : 'P1';
  const coords = calculateDefaultCoordinatesForShelf(wallCode, floorLevel);
  const roomName = floorLevel === 2 ? 'dep' : 'tie';

  const newShelf = {
    id: `${roomName}-${normalizedCode.toLowerCase()}-${Date.now()}`,
    code: normalizedCode,
    zone_code: wallCode,
    name: locationLabel || `${wallCode} · Módulo ${normalizedCode}`,
    floor_level: floorLevel,
    x: coords.x,
    y: coords.y,
    width: coords.width,
    height: coords.height,
    icon: coords.icon,
    is_anchor: false
  };

  storeShelves.push(newShelf);
  saveStoreLayout();
  logMapHistoryAction(
    'CREAR_ESTANTE',
    'Módulo agregado automáticamente por ubicación',
    `Se creó el módulo ${normalizedCode} (${locationLabel || 'Asignado a producto'})`,
    normalizedCode,
    floorLevel
  );
  return newShelf;
}

function setStoreMapData(shelves = [], products = [], syncLabel = 'Inventario sincronizado') {
  const localPhotos = getLocalShelfPhotos();
  
  // Cleanly integrate located products and create their shelves on the map
  storeLocationProducts = Array.isArray(products) ? products : [];
  storeLocationProducts.forEach(prod => {
    if (prod.shelf_code && prod.shelf_code !== 'PC-CENTRO') {
      const fLevel = Number(prod.floor_level) || (String(prod.wms_code || '').startsWith('DP') ? 2 : 1);
      ensureShelfExistsForLocation(prod.shelf_code, fLevel, prod.location_label || prod.location);
    }
  });

  storeMapSyncLabel = syncLabel;
  window.storeLocationProducts = storeLocationProducts;
  window.storeShelves = storeShelves;
  saveStoreLayout();
}

function setFloorLevel(level) {
  selectedFloorLevel = Number(level) || 1;
  const firstShelf = storeShelves.find(item => item.floor_level === selectedFloorLevel && !item.is_anchor);
  selectedShelfCode = firstShelf ? firstShelf.code : 'PC-CENTRO';
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

function adjustZoom(delta) {
  mapZoomLevel = Math.max(60, Math.min(150, mapZoomLevel + Number(delta || 0)));
  rerenderStoreMap();
}

function setMapTab(tab) {
  activeMapTab = tab;
  rerenderStoreMap();
}

function getCanvasTransform() {
  const scale = `scale(${mapZoomLevel / 100})`;
  return currentViewMode === '3D' ? `perspective(1000px) rotateX(12deg) ${scale}` : scale;
}

function rerenderStoreMap() {
  if (window.renderStoreMapUI) window.renderStoreMapUI(null, null, null, false);
}

function getShelfProducts(code, internalLevel = null) {
  const targetCode = String(code || '').toUpperCase().trim();
  if (!targetCode || targetCode === 'PC-CENTRO') return [];

  return storeLocationProducts.filter(product => {
    const rawShelf = String(product.shelf_code || '').toUpperCase().trim();
    // Strict exact matching or normalized wall-shelf matching (e.g. P3-E3)
    const sameShelf = (rawShelf === targetCode) || 
                      (rawShelf.replace(/[-_ ]/g, '') === targetCode.replace(/[-_ ]/g, ''));
    if (!sameShelf) return false;
    if (internalLevel !== null && internalLevel !== undefined) {
      const prodLevel = Number(product.shelf_level ?? product.level) || 1;
      return prodLevel === Number(internalLevel);
    }
    return true;
  });
}

function getShelfUnitCount(code) {
  return getShelfProducts(code).reduce((sum, product) => sum + Math.max(0, Number(product.stock) || 0), 0);
}

function findStoreMapProduct(query) {
  const normalized = String(query || '').trim().toLocaleLowerCase('es-AR');
  if (!normalized) return null;
  const product = storeLocationProducts.find(item => [item.name, item.product_code, item.barcode, item.shelf_code, item.location_label, item.wms_code]
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
  if (!shelf || shelf.is_anchor) return;
  shelf.x = Math.max(2, Math.min(88, shelf.x + Number(dx || 0)));
  shelf.y = Math.max(2, Math.min(84, shelf.y + Number(dy || 0)));
  saveStoreLayout();
  logMapHistoryAction('MOVER_ESTANTE', 'Módulo desplazado', `Estante ${shelf.code} movido a posición (X:${shelf.x}%, Y:${shelf.y}%)`, shelf.code, shelf.floor_level);
  rerenderStoreMap();
}

function deleteStoreShelf(shelfCode) {
  const shelf = storeShelves.find(item => item.code === shelfCode);
  if (!shelf) return;
  if (shelf.is_anchor) {
    if (window.showToast) window.showToast('⚠️ No se puede eliminar la PC Central (punto de ancla cardinal).');
    return;
  }

  const assignedProducts = getShelfProducts(shelfCode);
  const msg = assignedProducts.length
    ? `⚠️ Este estante tiene ${assignedProducts.length} producto(s) asignado(s). ¿Estás seguro de eliminar el estante ${shelfCode}?`
    : `¿Eliminar el estante ${shelfCode} del plano?`;

  if (confirm(msg)) {
    storeShelves = storeShelves.filter(item => item.code !== shelfCode);
    saveStoreLayout();
    logMapHistoryAction('ELIMINAR_ESTANTE', 'Módulo eliminado', `Se eliminó el estante ${shelfCode} de ${FLOOR_NAMES[shelf.floor_level]}`, shelfCode, shelf.floor_level);
    if (selectedShelfCode === shelfCode) {
      const fallback = storeShelves.find(s => s.floor_level === shelf.floor_level && !s.is_anchor);
      selectedShelfCode = fallback ? fallback.code : 'PC-CENTRO';
    }
    if (window.showToast) window.showToast(`🗑️ Estante ${shelfCode} eliminado.`);
    rerenderStoreMap();
  }
}

function addNewStoreShelf(floorLevel, wallCode, shelfType, shelfNumber, customName = '') {
  const typeCodeMap = { 'E': 'E', 'VIT': 'VIT', 'HEL': 'HEL', 'PIS': 'PIS', 'EST': 'EST' };
  const typePrefix = typeCodeMap[shelfType] || 'E';
  const fullCode = `${wallCode}-${typePrefix}${shelfNumber}`;
  
  const existing = storeShelves.find(s => s.code === fullCode && s.floor_level === Number(floorLevel));
  if (existing) {
    if (window.showToast) window.showToast(`⚠️ Ya existe un módulo con el código ${fullCode} en esta sala.`);
    return false;
  }

  const wallLabels = {
    'P1': 'Pared 1 (Frente / Norte)',
    'P2': 'Pared 2 (Fondo / Sur)',
    'P3': 'Pared 3 (Derecha / Este)',
    'P4': 'Pared 4 (Izquierda / Oeste)',
    'ISLA': 'Isla / Pasillo Central'
  };

  const coords = calculateDefaultCoordinatesForShelf(wallCode, Number(floorLevel));
  const roomName = Number(floorLevel) === 2 ? 'dep' : 'tie';

  const newShelf = {
    id: `${roomName}-${fullCode.toLowerCase()}-${Date.now()}`,
    code: fullCode,
    zone_code: wallCode,
    name: customName || `${wallLabels[wallCode] || wallCode} · ${fullCode}`,
    floor_level: Number(floorLevel),
    x: coords.x,
    y: coords.y,
    width: coords.width,
    height: coords.height,
    icon: coords.icon,
    is_anchor: false
  };

  storeShelves.push(newShelf);
  saveStoreLayout();
  selectedShelfCode = fullCode;
  selectedFloorLevel = Number(floorLevel);
  logMapHistoryAction('CREAR_ESTANTE', 'Nuevo módulo creado', `Se creó el módulo ${fullCode} en ${wallLabels[wallCode]}`, fullCode, Number(floorLevel));
  if (window.showToast) window.showToast(`✅ Estante ${fullCode} creado correctamente.`);
  isAddShelfModalOpen = false;
  rerenderStoreMap();
  return true;
}

function clearAllStoreShelves() {
  if (confirm('¿Vaciar todos los estantes del plano y dejar únicamente la PC Central?')) {
    storeShelves = structuredClone(DEFAULT_STORE_SHELVES);
    saveStoreLayout();
    selectedShelfCode = 'PC-CENTRO';
    logMapHistoryAction('VACIAR_PLANO', 'Plano reiniciado', 'Se vaciaron todos los estantes. Solo quedó la PC Central como punto cardinal.');
    if (window.showToast) window.showToast('🧹 Plano vaciado correctamente (solo PC Central).');
    rerenderStoreMap();
  }
}

function toggleStoreLayoutEditMode() {
  isEditMode = !isEditMode;
  saveStoreLayout();
  if (!isEditMode && window.showToast) window.showToast('💾 Cambios guardados en el plano.');
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
      sector: sector === 'I' ? 'Izquierda' : sector === 'C' ? 'Centro' : sector === 'D' ? 'Derecha' : sector === 'U' ? 'Es chico / Sin sector' : sector,
      sectorCode: sector
    };
  } else if (parts.length === 5) {
    const [zone, compass, wall, level, sector] = parts;
    return {
      zone: zone === 'TI' ? 'Tienda' : zone === 'DP' ? 'Depósito' : zone,
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
  const zone = loc.zone || (loc.zoneCode === 'DP' ? 'el depósito' : 'la tienda');
  const compass = loc.compass || 'frente';
  const wall = loc.wall || 'Pared 1';
  const level = loc.level || `nivel ${loc.levelNum || 1}`;
  const isChico = loc.sectorCode === 'U' || (loc.sector && (loc.sector.toLowerCase().includes('chico') || loc.sector.toLowerCase().includes('no hace falta')));
  const sector = isChico ? '' : `, sector ${loc.sector.toLowerCase()}`;
  const shelfStr = loc.shelf && loc.shelf !== loc.wall ? `, ${loc.shelf.toLowerCase()}` : '';
  return `Está en ${zone.toLowerCase()}, a la ${compass.toLowerCase()} de la PC, ${wall.toLowerCase()}${shelfStr}, ${level.toLowerCase()}${sector}.`;
}

function renderShelfBlocks() {
  const floorShelves = storeShelves.filter(item => item.floor_level === selectedFloorLevel);
  if (!floorShelves.length) {
    return `<div class="gba-empty-room"><div><span style="font-size:2.5rem;">🌿</span><br><strong>SALA SIN ESTANTES</strong><br><small>Tocá '🛠️ EDITAR' para agregar módulos.</small></div></div>`;
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
        ${isEditMode ? `
          <button type="button" class="gba-shelf-delete-btn" onclick="deleteStoreShelf('${escapeMapHtml(shelf.code)}')" title="Eliminar estante ${escapeMapHtml(shelf.code)}">✕</button>
        ` : ''}
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
          <button type="button" onclick="moveStoreItem('${escapeMapHtml(shelf.id)}',-3,0)" title="Mover Izquierda">◀</button>
          <button type="button" onclick="moveStoreItem('${escapeMapHtml(shelf.id)}',3,0)" title="Mover Derecha">▶</button>
          <button type="button" onclick="moveStoreItem('${escapeMapHtml(shelf.id)}',0,-3)" title="Mover Arriba">▲</button>
          <button type="button" onclick="moveStoreItem('${escapeMapHtml(shelf.id)}',0,3)" title="Mover Abajo">▼</button>
        </div>` : ''}
      </div>`;
  }).join('');
}

function renderProductRows(products) {
  if (!products.length) {
    return `<div class="gba-bag-empty">
      <span style="font-size: 1.5rem; display: block; margin-bottom: 6px;">🎒</span>
      No hay objetos asignados en este estante/nivel.<br>
      <small style="color: #ffd54f; display: block; margin-top: 6px;">Ubicá un producto o agregá stock con los botones de arriba.</small>
    </div>`;
  }
  return products.map(product => {
    const exactPosition = product.shelf_position ? ` · ${escapeMapHtml(product.shelf_position)}` : '';
    const stockNum = Number(product.stock) || 0;
    const stockBadgeClass = stockNum > 5 ? 'gba-badge-ok' : stockNum > 0 ? 'gba-badge-low' : 'gba-badge-zero';
    return `
      <article class="gba-item-row" data-product-code="${escapeMapHtml(product.product_code || product.id)}">
        <div class="gba-item-thumb">
          ${product.image_url ? `<img src="${escapeMapHtml(product.image_url)}" alt="${escapeMapHtml(product.name || 'Producto')}">` : '<span class="gba-item-icon-ph">🌿</span>'}
        </div>
        <div class="gba-item-info">
          <strong>${escapeMapHtml(product.name || 'Producto sin nombre')}</strong>
          <small>${escapeMapHtml(product.product_code || product.id || 'SIN CÓD')} · <span class="gba-stock-pill ${stockBadgeClass}">${stockNum} u.</span>${exactPosition}</small>
        </div>
        <div style="display: flex; gap: 4px;">
          <button type="button" class="gba-qr-btn" onclick="openStockAdjustmentModal('${escapeMapHtml(product.product_code || product.id)}', 'add')" title="Ajustar Stock">📦</button>
          <button type="button" class="gba-qr-btn" onclick="printProductQrByCode('${escapeMapHtml(product.product_code || product.id)}')" aria-label="Imprimir QR">QR</button>
        </div>
      </article>`;
  }).join('');
}

function renderSelectedShelfPanel() {
  const shelf = storeShelves.find(item => item.code === selectedShelfCode)
    || storeShelves.find(item => item.floor_level === selectedFloorLevel && !item.is_anchor)
    || storeShelves.find(item => item.is_anchor);
  if (!shelf) return '';
  selectedShelfCode = shelf.code;

  if (shelf.is_anchor) {
    return `
      <aside class="gba-inspector-side">
        <section class="gba-dialog-box">
          <div class="gba-dialog-banner">
            <span class="gba-poke-ball">🔴</span>
            <span class="gba-dialog-kicker">BRÚJULA CENTRAL</span>
            <span class="gba-poke-leaf">🌿</span>
          </div>
          <h3 class="gba-shelf-title">💻 COMPUTADORA CENTRAL</h3>
          <p style="font-size: 0.82rem; color: #e8f5e9; line-height: 1.5; margin: 8px 0 12px 0;">
            Este es el punto cardinal de referencia del local. Todas las orientaciones (Frente, Atrás, Derecha, Izquierda) se miden mirando desde esta PC.
          </p>
          <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.78rem; color: #a5d6a7;">
            <div>⬆️ <strong>Pared 1:</strong> Frente / Norte</div>
            <div>➡️ <strong>Pared 3:</strong> Lateral Derecho / Este</div>
            <div>⬇️ <strong>Pared 2:</strong> Fondo / Sur</div>
            <div>⬅️ <strong>Pared 4:</strong> Lateral Izquierdo / Oeste</div>
          </div>
          ${isEditMode ? `
            <div style="margin-top: 14px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px;">
              <button type="button" class="gba-action-btn-gold" onclick="openAddShelfModal()" style="width: 100%;">➕ NUEVO ESTANTE</button>
            </div>
          ` : ''}
        </section>
      </aside>
    `;
  }

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

        ${isEditMode ? `
          <div style="display: flex; gap: 8px; margin-bottom: 12px;">
            <button type="button" class="gba-action-btn-gold" onclick="openAddShelfModal()" style="flex:1;">➕ NUEVO ESTANTE</button>
            <button type="button" class="gba-action-btn-green" onclick="deleteStoreShelf('${escapeMapHtml(shelf.code)}')" style="flex:1; background: #c62828;">🗑️ ELIMINAR</button>
          </div>
        ` : ''}

        <div class="gba-levels-row">
          <div class="gba-levels-label">ALTURA / BALDA (N1 = Abajo, N6 = Arriba):</div>
          <div class="gba-levels-grid" style="grid-template-columns: repeat(6, 1fr);">${levels}</div>
        </div>
      </section>

      <!-- Retro GBA Item Bag / Products Box -->
      <section class="gba-bag-box" aria-labelledby="map-products-title">
        <div class="gba-bag-header">
          <span class="gba-bag-icon">🎒</span>
          <h3 id="map-products-title" class="gba-bag-title">OBJETOS EN ESTANTE ${escapeMapHtml(shelf.code)} · N${selectedInternalLevel}</h3>
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

function renderMapHistoryHTML() {
  const history = getMapHistory();
  return `
    <div class="gba-history-container">
      <div class="gba-history-header">
        <div>
          <h3 style="margin: 0; font-family: 'Press Start 2P', monospace; font-size: 0.8rem; color: #ffd54f;">
            📜 HISTORIAL DE AUDITORÍA Y CAMBIOS DEL MAPA
          </h3>
          <small style="color: #a5d6a7; font-size: 0.76rem;">Registro cronológico de creaciones, modificaciones y ubicaciones físicas</small>
        </div>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="gba-pad-btn" onclick="exportMapHistoryCSV()">📥 EXPORTAR CSV</button>
          <button type="button" class="gba-pad-btn" onclick="clearMapHistory()" style="background: #b71c1c;">🗑️ LIMPIAR</button>
        </div>
      </div>

      ${!history.length ? `
        <div style="text-align: center; padding: 30px; color: #81c784; font-family: 'Press Start 2P', monospace; font-size: 0.6rem;">
          No hay cambios registrados en el mapa todavía.
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
                return `
                  <tr>
                    <td style="white-space: nowrap; font-family: monospace; font-size: 0.78rem;">${formattedDate}</td>
                    <td><strong>${escapeMapHtml(item.user)}</strong></td>
                    <td><span class="gba-history-badge ${badgeClass}">${escapeMapHtml(item.action_label || item.action)}</span></td>
                    <td>${escapeMapHtml(item.details)}</td>
                    <td><strong style="color: #ffd54f;">${escapeMapHtml(item.shelf_code || '-')}</strong></td>
                    <td>${item.floor_level === 2 ? '📦 Depósito' : '🏪 Tienda'}</td>
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
      <div style="max-width: 480px; width: 100%; border-radius: 20px; border: 2px solid #c2a246; background: #152d24; color: #fff; padding: 22px; box-shadow: 0 20px 60px rgba(0,0,0,0.8);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid rgba(194,162,70,0.3); padding-bottom: 10px;">
          <h3 style="margin: 0; color: #ffd54f; font-size: 1.15rem; font-weight: 800;">➕ Agregar Nuevo Estante</h3>
          <button type="button" onclick="closeAddShelfModal()" style="background: rgba(255,255,255,0.15); border: none; color: #fff; border-radius: 50%; width: 32px; height: 32px; cursor: pointer;">✕</button>
        </div>
        <form onsubmit="event.preventDefault(); addNewStoreShelf(document.getElementById('new-shelf-floor').value, document.getElementById('new-shelf-wall').value, document.getElementById('new-shelf-type').value, document.getElementById('new-shelf-num').value, document.getElementById('new-shelf-name').value);">
          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.8rem; font-weight: 700; margin-bottom: 4px; color: #c2a246;">Sala / Planta</label>
            <select id="new-shelf-floor" style="width: 100%; padding: 10px; border-radius: 8px; background: #0f2019; border: 1.5px solid #2e6b4d; color: #fff; font-weight: 700;">
              <option value="1" ${selectedFloorLevel === 1 ? 'selected' : ''}>🏪 Salón Tienda</option>
              <option value="2" ${selectedFloorLevel === 2 ? 'selected' : ''}>📦 Depósito General</option>
            </select>
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.8rem; font-weight: 700; margin-bottom: 4px; color: #c2a246;">Pared / Orientación</label>
            <select id="new-shelf-wall" style="width: 100%; padding: 10px; border-radius: 8px; background: #0f2019; border: 1.5px solid #2e6b4d; color: #fff; font-weight: 700;">
              <option value="P1">⬆️ Pared 1 (Frente / Norte)</option>
              <option value="P2">⬇️ Pared 2 (Fondo / Sur)</option>
              <option value="P3">➡️ Pared 3 (Derecha / Este)</option>
              <option value="P4">⬅️ Pared 4 (Izquierda / Oeste)</option>
              <option value="ISLA">📦 Isla / Pasillo Central</option>
            </select>
          </div>
          <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 10px; margin-bottom: 12px;">
            <div>
              <label style="display: block; font-size: 0.8rem; font-weight: 700; margin-bottom: 4px; color: #c2a246;">Tipo de mueble</label>
              <select id="new-shelf-type" style="width: 100%; padding: 10px; border-radius: 8px; background: #0f2019; border: 1.5px solid #2e6b4d; color: #fff; font-weight: 700;">
                <option value="E">🪵 Estante de Pared (E)</option>
                <option value="VIT">💎 Vitrina Vidriada (VIT)</option>
                <option value="HEL">❄️ Heladera / Frío (HEL)</option>
                <option value="PIS">📦 Pallet de Piso (PIS)</option>
                <option value="EST">🗄️ Estantería Metálica (EST)</option>
              </select>
            </div>
            <div>
              <label style="display: block; font-size: 0.8rem; font-weight: 700; margin-bottom: 4px; color: #c2a246;">Número</label>
              <input type="number" id="new-shelf-num" min="1" max="20" value="1" required style="width: 100%; padding: 10px; border-radius: 8px; background: #0f2019; border: 1.5px solid #2e6b4d; color: #fff; font-weight: 800; text-align: center; box-sizing: border-box;">
            </div>
          </div>
          <div style="margin-bottom: 16px;">
            <label style="display: block; font-size: 0.8rem; font-weight: 700; margin-bottom: 4px; color: #c2a246;">Nombre / Etiqueta Descriptiva</label>
            <input type="text" id="new-shelf-name" placeholder="Ej: Fertilizantes, Semillas, Sustratos..." style="width: 100%; padding: 10px; border-radius: 8px; background: #0f2019; border: 1.5px solid #2e6b4d; color: #fff; box-sizing: border-box;">
          </div>
          <div style="display: flex; gap: 10px;">
            <button type="button" onclick="closeAddShelfModal()" style="flex: 1; padding: 12px; border-radius: 10px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.25); color: #fff; cursor: pointer;">Cancelar</button>
            <button type="submit" style="flex: 1.5; padding: 12px; border-radius: 10px; background: #2e7d32; border: 1.5px solid #81c784; color: #fff; font-weight: 800; cursor: pointer;">➕ Crear Módulo</button>
          </div>
        </form>
      </div>
    </div>
  `;
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
          <button type="button" class="gba-room-btn ${activeMapTab === 'interactive' ? 'active' : ''}" onclick="setMapTab('interactive')">
            🎮 MAPA INTERACTIVO
          </button>
          <button type="button" class="gba-room-btn ${activeMapTab === 'illustration' ? 'active' : ''}" onclick="setMapTab('illustration')">
            🖼️ PLANO ILUSTRADO
          </button>
          <button type="button" class="gba-room-btn ${activeMapTab === 'history' ? 'active' : ''}" onclick="setMapTab('history')">
            📜 HISTORIAL DE CAMBIOS
          </button>
        </div>
        <div class="gba-hardware-buttons">
          <button type="button" class="gba-pad-btn ${isEditMode ? 'active' : ''}" onclick="toggleStoreLayoutEditMode()">${isEditMode ? '💾 GUARDAR' : '🛠️ EDITAR'}</button>
          ${isEditMode ? `
            <button type="button" class="gba-pad-btn" onclick="openAddShelfModal()" style="background: #2e7d32; color: #fff;">➕ NUEVO</button>
            <button type="button" class="gba-pad-btn" onclick="clearAllStoreShelves()" style="background: #b71c1c; color: #fff;">🧹 VACIAR</button>
          ` : ''}
          <button type="button" class="gba-pad-btn ${currentViewMode === '2D' ? 'active' : ''}" onclick="setViewMode('2D')">2D</button>
          <button type="button" class="gba-pad-btn ${currentViewMode === '3D' ? 'active' : ''}" onclick="setViewMode('3D')">3D</button>
          <button type="button" class="gba-pad-btn" onclick="adjustZoom(-10)" aria-label="Alejar">🔍−</button>
          <button type="button" class="gba-pad-btn" onclick="adjustZoom(10)" aria-label="Acercar">🔍+</button>
        </div>
      </div>

      ${activeMapTab === 'history' ? renderMapHistoryHTML() : activeMapTab === 'illustration' ? `
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

      <!-- Add Shelf Modal -->
      ${renderAddShelfModalHTML()}

    </div>`;
}

window.renderStoreMapHTML = renderStoreMapHTML;
window.setStoreMapData = setStoreMapData;
window.findStoreMapProduct = findStoreMapProduct;
window.focusStoreMapProduct = focusStoreMapProduct;
window.toggleStoreLayoutEditMode = toggleStoreLayoutEditMode;
window.moveStoreItem = moveStoreItem;
window.deleteStoreShelf = deleteStoreShelf;
window.addNewStoreShelf = addNewStoreShelf;
window.clearAllStoreShelves = clearAllStoreShelves;
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
window.setViewMode = setViewMode;
window.adjustZoom = adjustZoom;
window.showShelfDetailsModal = showShelfDetailsModal;
window.setMapTab = setMapTab;
window.parseLocationCode = parseLocationCode;
window.formatLocationVoiceText = formatLocationVoiceText;
window.storeLocationProducts = storeLocationProducts;
window.storeShelves = storeShelves;
