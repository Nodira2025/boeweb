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

let storeShelves = structuredClone(DEFAULT_STORE_SHELVES);
let storeLocationProducts = [];
let mapHistoryEntries = [];
let selectedFloorLevel = 1;
let selectedShelfCode = 'PC-CENTRO';
let selectedInternalLevel = 3;
let currentViewMode = '2D';
let activeMapTab = 'interactive'; // 'interactive' | 'illustration' | 'history'
let mapZoomLevel = 100;
let isEditMode = false;
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
  return structuredClone(DEFAULT_STORE_SHELVES);
}

function getLocalShelfPhotos() {
  return {};
}

function saveStoreLayout() {
  window.storeShelves = storeShelves;
}

let movingShelfId = null;

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
  } else if (wallCode === 'P3') { // Derecha / Este (Right wall pegada al borde)
    const y = Math.min(74, 20 + (index * 17));
    return { x: 88, y, width: 10, height: 15, icon: '🪜' };
  } else if (wallCode === 'P4') { // Izquierda / Oeste (Left wall pegada al borde)
    const y = Math.min(74, 20 + (index * 17));
    return { x: 2, y, width: 10, height: 15, icon: '🪜' };
  } else { // Isla / Centro
    const x = Math.min(70, 24 + (index * 16));
    return { x, y: 58, width: 14, height: 14, icon: '📦' };
  }
}

function ensureShelfExistsForLocation(shelfCode, floorLevel = 1, locationLabel = '') {
  if (!shelfCode || shelfCode === 'PC-CENTRO') return null;
  const normalizedCode = String(shelfCode).trim().toUpperCase();
  const existing = storeShelves.find(s => s.code.toUpperCase() === normalizedCode && s.floor_level === floorLevel);
  return existing || null;
}

function setStoreMapData(shelves = [], products = [], syncLabel = 'Inventario WMS sincronizado') {
  storeLocationProducts = Array.isArray(products) ? products : [];
  storeShelves = structuredClone(DEFAULT_STORE_SHELVES);
  (Array.isArray(shelves) ? shelves : []).forEach(rawShelf => {
    if (!rawShelf?.id || !rawShelf?.code) return;
    const shelf = normalizeShelf(rawShelf);
    if (!Number.isFinite(Number(rawShelf.x)) || !Number.isFinite(Number(rawShelf.y))) {
      const wallMatch = String(shelf.code).toUpperCase().match(/P([1-4])/);
      const coords = calculateDefaultCoordinatesForShelf(wallMatch ? `P${wallMatch[1]}` : 'ISLA', shelf.floor_level);
      shelf.x = coords.x;
      shelf.y = coords.y;
      shelf.width = Number(rawShelf.width) || coords.width;
      shelf.height = Number(rawShelf.height) || coords.height;
      shelf.icon = rawShelf.icon || coords.icon;
    }
    storeShelves.push(shelf);
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

function getMapOperationalContext() {
  const context = typeof SaasAuth !== 'undefined' ? SaasAuth.getTenantContext() : null;
  const supabaseClient = window.supabaseClient;
  if (!window.OperationalApi || !supabaseClient || !context?.isVerified || !['ADMIN', 'SUPERVISOR'].includes(context.role)) {
    throw new Error('Sólo administración o supervisión pueden modificar ubicaciones centrales.');
  }
  return { context, supabaseClient };
}

async function persistStoreShelf(shelf) {
  const { context, supabaseClient } = getMapOperationalContext();
  return window.OperationalApi.upsertInventoryLocation({
    supabaseClient,
    authContext: context,
    location: {
      id: shelf.id || null,
      code: shelf.code,
      name: shelf.name || shelf.code,
      location_type: shelf.location_type || 'SHELF',
      is_sellable: shelf.is_sellable !== false,
      is_default: shelf.is_default === true,
      metadata: {
        ...(shelf.metadata || {}),
        floor_level: Number(shelf.floor_level) || 1,
        map_x: Number(shelf.x),
        map_y: Number(shelf.y),
        map_width: Number(shelf.width),
        map_height: Number(shelf.height),
        map_icon: shelf.icon || '📦'
      }
    }
  });
}

async function moveStoreItem(id, dx, dy) {
  const shelf = storeShelves.find(item => item.id === id);
  if (!shelf || shelf.is_anchor) return;
  const previous = { x: shelf.x, y: shelf.y };
  shelf.x = Math.max(2, Math.min(88, shelf.x + Number(dx || 0)));
  shelf.y = Math.max(2, Math.min(84, shelf.y + Number(dy || 0)));
  try {
    await persistStoreShelf(shelf);
    saveStoreLayout();
    logMapHistoryAction('MOVER_ESTANTE', 'Módulo desplazado', `Estante ${shelf.code} movido a posición (X:${shelf.x}%, Y:${shelf.y}%)`, shelf.code, shelf.floor_level);
    rerenderStoreMap();
  } catch (error) {
    shelf.x = previous.x;
    shelf.y = previous.y;
    if (window.showToast) window.showToast(`❌ No se pudo mover la ubicación: ${error.message}`);
    rerenderStoreMap();
  }
}

function deleteStoreShelf(shelfCode) {
  const shelf = storeShelves.find(item => item.code === shelfCode);
  if (!shelf) return;
  if (shelf.is_anchor) {
    if (window.showToast) window.showToast('⚠️ No se puede eliminar la Terminal Central (punto de ancla cardinal).');
    return;
  }

  if (window.showToast) {
    window.showToast(`🔒 ${shelfCode} es una ubicación central. No se puede borrar ni desvincular stock desde el plano.`);
  }
}

async function addNewStoreShelf(floorLevel, wallCode, shelfType, shelfNumber, customName = '') {
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

  const newShelf = {
    id: null,
    code: fullCode,
    zone_code: wallCode,
    name: customName || `${wallLabels[wallCode] || wallCode} · ${fullCode}`,
    floor_level: Number(floorLevel),
    x: coords.x,
    y: coords.y,
    width: coords.width,
    height: coords.height,
    icon: coords.icon || '🗄️',
    is_anchor: false
  };

  try {
    const result = await persistStoreShelf(newShelf);
    newShelf.id = result.location_id;
    storeShelves.push(newShelf);
    saveStoreLayout();
    selectedShelfCode = fullCode;
    selectedFloorLevel = Number(floorLevel);
    logMapHistoryAction('CREAR_ESTANTE', 'Nuevo módulo creado', `Se creó el módulo ${fullCode} en ${wallLabels[wallCode]}`, fullCode, Number(floorLevel));
    if (window.showToast) window.showToast(`✅ Ubicación central ${fullCode} creada correctamente.`);
    isAddShelfModalOpen = false;
    if (typeof window.loadStoreMapData === 'function') await window.loadStoreMapData(true);
    rerenderStoreMap();
    return true;
  } catch (error) {
    if (window.showToast) window.showToast(`❌ No se pudo crear la ubicación: ${error.message}`);
    return false;
  }
}

function clearAllStoreShelves() {
  if (window.showToast) {
    window.showToast('🔒 El plano refleja ubicaciones centrales y no puede vaciarse desde el navegador.');
  }
}

function toggleStoreLayoutEditMode() {
  if (!isEditMode) {
    try {
      getMapOperationalContext();
    } catch (error) {
      if (window.showToast) window.showToast(`🔒 ${error.message}`);
      return;
    }
  }
  isEditMode = !isEditMode;
  movingShelfId = null;
  saveStoreLayout();
  if (!isEditMode && window.showToast) window.showToast('💾 Cambios guardados en el plano.');
  rerenderStoreMap();
}

function handleShelfClickInEditMode(id, code, event) {
  if (event) event.stopPropagation();
  const shelf = storeShelves.find(s => s.id === id);
  if (!shelf || shelf.is_anchor) return;

  if (movingShelfId === id) {
    movingShelfId = null;
    if (window.showToast) window.showToast(`Módulo ${code} deseleccionado.`);
  } else {
    movingShelfId = id;
    selectedShelfCode = code;
    if (window.showToast) window.showToast(`📍 Módulo ${code} seleccionado. Tocá en el plano para ubicarlo.`);
  }
  rerenderStoreMap();
}

async function handleCanvasTapToMove(event) {
  if (!isEditMode || !movingShelfId) return;
  if (event.target.closest('.gba-shelf-delete-btn') || event.target.closest('.gba-editor-arrows')) return;

  const canvas = document.getElementById('architectural-map-canvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const clickX = ((event.clientX - rect.left) / rect.width) * 100;
  const clickY = ((event.clientY - rect.top) / rect.height) * 100;

  const shelf = storeShelves.find(s => s.id === movingShelfId);
  if (!shelf || shelf.is_anchor) return;

  const newX = Math.max(2, Math.min(88, Math.round((clickX - (shelf.width / 2)) / 2) * 2));
  const newY = Math.max(2, Math.min(84, Math.round((clickY - (shelf.height / 2)) / 2) * 2));

  const previous = { x: shelf.x, y: shelf.y };
  shelf.x = newX;
  shelf.y = newY;
  try {
    await persistStoreShelf(shelf);
    saveStoreLayout();
    logMapHistoryAction('MOVER_ESTANTE', 'Módulo reubicado', `Estante ${shelf.code} reposicionado a (X:${newX}%, Y:${newY}%)`, shelf.code, shelf.floor_level);
    if (window.showToast) window.showToast(`✅ ${shelf.code} posicionado en (X:${newX}%, Y:${newY}%).`);
    movingShelfId = null;
    rerenderStoreMap();
  } catch (error) {
    shelf.x = previous.x;
    shelf.y = previous.y;
    if (window.showToast) window.showToast(`❌ No se pudo mover la ubicación: ${error.message}`);
    rerenderStoreMap();
  }
}

function openAddShelfModal() {
  try {
    getMapOperationalContext();
  } catch (error) {
    if (window.showToast) window.showToast(`🔒 ${error.message}`);
    return;
  }
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
  const area = info.floorLevel === 2 ? 'el depósito' : 'la tienda';
  const wallMatch = String(info.wallCode || 'P1').match(/\d/);
  const wallNum = wallMatch ? wallMatch[0] : '1';

  let wallSide = 'la del frente';
  if (info.wallCode === 'P4' || info.compassCode === 'I') wallSide = 'la de izquierda';
  else if (info.wallCode === 'P3' || info.compassCode === 'D') wallSide = 'la de derecha';
  else if (info.wallCode === 'P2' || info.compassCode === 'A') wallSide = 'la del fondo';
  else if (info.wallCode === 'P1' || info.compassCode === 'F') wallSide = 'la del frente';

  let shelfName = 'góndola 1';
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
    utterance.rate = 1.38;
    utterance.pitch = 0.94;
    const voices = window.speechSynthesis.getVoices();
    const esVoice = voices.find(v => v.lang && (v.lang === 'es-AR' || v.lang.startsWith('es-419') || v.lang === 'es-US' || v.lang.startsWith('es')));
    if (esVoice) utterance.voice = esVoice;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Voice synthesis error:', err);
  }
}

function renderShelfBlocks() {
  const floorShelves = storeShelves.filter(item => item.floor_level === selectedFloorLevel);
  if (!floorShelves.length) {
    return `
      <div class="gba-empty-room">
        <div>
          <span style="font-size: 2.2rem; display: block; margin-bottom: 8px;">📐</span>
          <strong>SALA SIN ESTANTES</strong><br>
          <small style="color: rgba(246,243,232,0.65);">Hacé clic en '🛠️ EDITAR PLANO' para incorporar módulos de guardado.</small>
        </div>
      </div>`;
  }
  return floorShelves.map(shelf => {
    // Si es la Terminal Central (Brújula)
    if (shelf.is_anchor) {
      return `
        <div class="gba-shelf-wrapper gba-anchor-pc-wrapper" style="left:${shelf.x}%;top:${shelf.y}%;width:${shelf.width}%;height:${shelf.height}%;">
          <div class="gba-anchor-pc" title="Terminal Central: Punto de Referencia Cardinal de Planta">
            <div class="gba-pc-radar-ring"></div>
            <div class="gba-pc-screen">💻</div>
            <strong class="gba-pc-title">TERMINAL CENTRAL</strong>
            <small class="gba-pc-sub">BRÚJULA WMS</small>
            
            <!-- Flechas Cardinales de Brújula -->
            <span class="gba-compass-arrow gba-compass-north" title="Pared 1 · Frente / Norte">▲ P1 · FRENTE</span>
            <span class="gba-compass-arrow gba-compass-south" title="Pared 2 · Fondo / Sur">▼ P2 · FONDO</span>
            <span class="gba-compass-arrow gba-compass-east" title="Pared 3 · Lateral Derecho / Este">▶ P3 · DERECHA</span>
            <span class="gba-compass-arrow gba-compass-west" title="Pared 4 · Lateral Izquierdo / Oeste">◀ P4 · IZQUIERDA</span>
          </div>
        </div>`;
    }

    const count = getShelfUnitCount(shelf.code);
    const selected = shelf.code === selectedShelfCode;
    const isMoving = isEditMode && movingShelfId === shelf.id;
    
    // Capacity indicator calculation
    let capColor = '#2e7d32'; // Green (>10)
    let capPercent = Math.min(100, Math.max(6, (count / 30) * 100));
    if (count === 0) {
      capColor = '#d32f2f';
      capPercent = 0;
    } else if (count < 10) {
      capColor = '#f57c00';
    }

    return `
      <div class="gba-shelf-wrapper" style="left:${shelf.x}%;top:${shelf.y}%;width:${shelf.width}%;height:${shelf.height}%;">
        ${isEditMode ? `
          <button type="button" class="gba-shelf-delete-btn" onclick="deleteStoreShelf('${escapeMapHtml(shelf.code)}')" title="Eliminar estante ${escapeMapHtml(shelf.code)}">✕</button>
        ` : ''}
        <button type="button" class="gba-shelf-block ${selected ? 'selected' : ''} ${isMoving ? 'gba-shelf-moving' : ''}" data-zone="${escapeMapHtml(shelf.zone_code)}"
          onclick="${isEditMode ? `handleShelfClickInEditMode('${escapeMapHtml(shelf.id)}', '${escapeMapHtml(shelf.code)}', event)` : `selectShelf('${escapeMapHtml(shelf.code)}')`}" aria-label="Módulo ${escapeMapHtml(shelf.code)}, ${count} unidades">
          
          <div class="gba-shelf-header">
            <span class="gba-shelf-icon">${shelf.icon || '🗄️'}</span>
            <strong class="gba-shelf-code">${escapeMapHtml(shelf.code)}</strong>
          </div>
          
          <div class="gba-hp-track" title="${count} unidades">
            <div class="gba-hp-fill" style="width: ${capPercent}%; background: ${capColor};"></div>
          </div>
          
          <div class="gba-shelf-footer-info">
            <span class="gba-shelf-count">${count} u.</span>
            ${isMoving ? '<span class="gba-cursor-tag" style="color:#ffd600;">✋ MOVIENDO</span>' : (selected ? '<span class="gba-cursor-tag">📍 ACTIVO</span>' : '')}
          </div>
        </button>
        ${isEditMode ? `<div class="gba-editor-arrows">
          <button type="button" onclick="moveStoreItem('${escapeMapHtml(shelf.id)}',-3,0)" title="Mover a la izquierda">◀</button>
          <button type="button" onclick="moveStoreItem('${escapeMapHtml(shelf.id)}',3,0)" title="Mover a la derecha">▶</button>
          <button type="button" onclick="moveStoreItem('${escapeMapHtml(shelf.id)}',0,-3)" title="Mover hacia arriba">▲</button>
          <button type="button" onclick="moveStoreItem('${escapeMapHtml(shelf.id)}',0,3)" title="Mover hacia abajo">▼</button>
        </div>` : ''}
      </div>`;
  }).join('');
}

function renderProductRows(products) {
  if (!products.length) {
    return `
      <div class="gba-bag-empty">
        <span style="font-size: 1.4rem; display: block; margin-bottom: 6px;">📦</span>
        No hay productos asignados en este nivel del módulo.<br>
        <small style="color: var(--color-accent-gold, #c2a246); display: block; margin-top: 6px;">Asigná una ubicación desde el asistente o ajustá el stock.</small>
      </div>`;
  }
  return products.map(product => {
    const exactPosition = product.shelf_position ? ` · ${escapeMapHtml(product.shelf_position)}` : '';
    const stockNum = Number(product.stock) || 0;
    const stockBadgeClass = stockNum > 5 ? 'gba-badge-ok' : stockNum > 0 ? 'gba-badge-low' : 'gba-badge-zero';
    const stockLabel = stockNum > 5 ? `${stockNum} u.` : stockNum > 0 ? `${stockNum} u. (Bajo)` : '0 u. (Agotado)';
    
    return `
      <article class="gba-item-row" data-product-code="${escapeMapHtml(product.product_code || product.id)}">
        <div class="gba-item-thumb">
          ${product.image_url ? `<img src="${escapeMapHtml(product.image_url)}" alt="${escapeMapHtml(product.name || 'Producto')}">` : '<span class="gba-item-icon-ph">🌿</span>'}
        </div>
        <div class="gba-item-info">
          <strong>${escapeMapHtml(product.name || 'Producto sin nombre')}</strong>
          <small>${escapeMapHtml(product.product_code || product.id || 'SIN CÓD')} · <span class="gba-stock-pill ${stockBadgeClass}">${stockLabel}</span>${exactPosition}</small>
        </div>
        <div style="display: flex; gap: 6px;">
          <button type="button" class="gba-qr-btn" onclick="openStockAdjustmentModal('${escapeMapHtml(product.product_code || product.id)}', 'add')" title="Ajustar Stock Físico">📦 Ajustar</button>
          <button type="button" class="gba-qr-btn" onclick="printProductQrByCode('${escapeMapHtml(product.product_code || product.id)}')" aria-label="Imprimir Etiqueta QR">QR</button>
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
            <span class="gba-dialog-kicker">TERMINAL CENTRAL DE PLANTA</span>
            <span class="gba-status-dot"></span>
          </div>
          <h3 class="gba-shelf-title">💻 TERMINAL DE CONTROL Y BRÚJULA</h3>
          <p style="font-size: 0.84rem; color: rgba(246,243,232,0.8); line-height: 1.5; margin: 10px 0 14px 0;">
            Este es el punto cardinal de referencia operativa. Todas las indicaciones de orientación se determinan situándose frente a esta terminal.
          </p>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.8rem; color: #a5d6a7; margin-bottom: 14px;">
            <div style="background: rgba(255,255,255,0.04); padding: 8px 10px; border-radius: 8px; border-left: 3px solid #4caf50;">
              ▲ <strong>Pared 1:</strong> Frente (Norte)
            </div>
            <div style="background: rgba(255,255,255,0.04); padding: 8px 10px; border-radius: 8px; border-left: 3px solid #29b6f6;">
              ▶ <strong>Pared 3:</strong> Lateral Derecho (Este)
            </div>
            <div style="background: rgba(255,255,255,0.04); padding: 8px 10px; border-radius: 8px; border-left: 3px solid #fbc02d;">
              ▼ <strong>Pared 2:</strong> Fondo / Ingreso (Sur)
            </div>
            <div style="background: rgba(255,255,255,0.04); padding: 8px 10px; border-radius: 8px; border-left: 3px solid #ab47bc;">
              ◀ <strong>Pared 4:</strong> Lateral Izquierdo (Oeste)
            </div>
          </div>
          ${isEditMode ? `
            <div style="margin-top: 14px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px;">
              <button type="button" class="gba-action-btn-gold" onclick="openAddShelfModal()" style="width: 100%;">➕ NUEVO MÓDULO</button>
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
      <!-- Inspector Window Box -->
      <section class="gba-dialog-box" aria-labelledby="map-selected-shelf-title">
        <div class="gba-dialog-banner">
          <span class="gba-dialog-kicker">INFORMACIÓN DEL MÓDULO</span>
          <span class="gba-status-dot"></span>
        </div>
        <h3 id="map-selected-shelf-title" class="gba-shelf-title">${escapeMapHtml(shelf.code)} · ${escapeMapHtml(shelf.name)}</h3>
        <div class="gba-dialog-meta">
          <span>${escapeMapHtml(FLOOR_NAMES[shelf.floor_level])}</span> · 
          <strong>${unitCount} UNIDADES EN TOTAL</strong>
        </div>

        <div class="gba-photo-frame">
          ${shelf.photo_url ? `<img src="${escapeMapHtml(shelf.photo_url)}" alt="Foto del estante ${escapeMapHtml(shelf.code)}">` : '<div class="gba-photo-empty"><span>📷 SIN FOTO DEL MUEBLE</span><small>Subí una foto para facilitar el reconocimiento visual.</small></div>'}
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
            <button type="button" class="gba-action-btn-gold" onclick="openAddShelfModal()" style="flex:1;">➕ NUEVO MÓDULO</button>
            <button type="button" class="gba-action-btn-green" onclick="deleteStoreShelf('${escapeMapHtml(shelf.code)}')" style="flex:1; background: #c62828; border-color: #ef5350;">🗑️ ELIMINAR</button>
          </div>
        ` : ''}

        <div class="gba-levels-row">
          <div class="gba-levels-label">ALTURA / BALDA (N1 = Abajo, N6 = Arriba):</div>
          <div class="gba-levels-grid" style="grid-template-columns: repeat(6, 1fr);">${levels}</div>
        </div>
      </section>

      <!-- Products in Selected Level Box -->
      <section class="gba-bag-box" aria-labelledby="map-products-title">
        <div class="gba-bag-header">
          <span class="gba-bag-icon">📦</span>
          <h3 id="map-products-title" class="gba-bag-title">PRODUCTOS EN ${escapeMapHtml(shelf.code)} · N${selectedInternalLevel}</h3>
        </div>
        <div class="gba-bag-list">${renderProductRows(visibleProducts)}</div>
      </section>
    </aside>`;
}

function renderFloorTabs() {
  return Object.entries(FLOOR_NAMES).map(([floor, name]) => {
    const floorNum = Number(floor);
    const active = floorNum === selectedFloorLevel;
    const label = floorNum === 1 ? '🏪 SALÓN TIENDA' : '📦 DEPÓSITO GENERAL';
    return `<button type="button" class="gba-room-btn ${active ? 'active' : ''}" onclick="setFloorLevel(${floorNum})">${label}</button>`;
  }).join('');
}

function renderMapHistoryHTML() {
  const history = getMapHistory();
  return `
    <div class="gba-history-container">
      <div class="gba-history-header">
        <div>
          <h3 style="margin: 0; font-size: 0.95rem; font-weight: 800; color: var(--color-accent-gold, #c2a246);">
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
                return `
                  <tr>
                    <td style="white-space: nowrap; font-family: monospace; font-size: 0.82rem;">${formattedDate}</td>
                    <td><strong>${escapeMapHtml(item.user)}</strong></td>
                    <td><span class="gba-history-badge ${badgeClass}">${escapeMapHtml(item.action_label || item.action)}</span></td>
                    <td>${escapeMapHtml(item.details)}</td>
                    <td><strong style="color: var(--color-accent-gold, #c2a246);">${escapeMapHtml(item.shelf_code || '-')}</strong></td>
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
      <div style="max-width: 480px; width: 100%; border-radius: 20px; border: 2px solid #c2a246; background: #152d24; color: #fff; padding: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.85);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid rgba(194,162,70,0.3); padding-bottom: 12px;">
          <h3 style="margin: 0; color: #c2a246; font-size: 1.15rem; font-weight: 800;">➕ Agregar Nuevo Módulo de Guardado</h3>
          <button type="button" onclick="closeAddShelfModal()" style="background: rgba(255,255,255,0.15); border: none; color: #fff; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-weight: bold;">✕</button>
        </div>
        <form onsubmit="event.preventDefault(); addNewStoreShelf(document.getElementById('new-shelf-floor').value, document.getElementById('new-shelf-wall').value, document.getElementById('new-shelf-type').value, document.getElementById('new-shelf-num').value, document.getElementById('new-shelf-name').value);">
          <div style="margin-bottom: 14px;">
            <label style="display: block; font-size: 0.84rem; font-weight: 700; margin-bottom: 6px; color: #c2a246;">Sala / Planta</label>
            <select id="new-shelf-floor" style="width: 100%; padding: 10px 12px; border-radius: 8px; background: #0f2019; border: 1.5px solid #2e6b4d; color: #fff; font-weight: 700; box-sizing: border-box;">
              <option value="1" ${selectedFloorLevel === 1 ? 'selected' : ''}>🏪 Salón Tienda</option>
              <option value="2" ${selectedFloorLevel === 2 ? 'selected' : ''}>📦 Depósito General</option>
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
  const currentRoomName = FLOOR_NAMES[selectedFloorLevel] || 'SALÓN TIENDA';

  return `
    <div class="gba-map-shell">
      
      <!-- Top Status Header -->
      <div class="gba-screen-topbar">
        <div class="gba-topbar-left">
          <span class="gba-led-light"></span>
          <span class="gba-title-logo">BÔ GROW CLUB · CONTROL DE PLANTA WMS</span>
          <span class="gba-version-tag">CAD VIRTUAL</span>
        </div>
        <div class="gba-topbar-right">
          <span class="gba-battery-tag">🧭 TERMINAL AL CENTRO</span>
          <span class="gba-sync-tag">${escapeMapHtml(storeMapSyncLabel)}</span>
        </div>
      </div>

      <!-- Navigation & Controls Header -->
      <div class="gba-map-toolbar">
        <div class="gba-room-tabs">
          ${renderFloorTabs()}
          <button type="button" class="gba-room-btn ${activeMapTab === 'interactive' ? 'active' : ''}" onclick="setMapTab('interactive')">
            🗺️ PLANO INTERACTIVO
          </button>
          <button type="button" class="gba-room-btn ${activeMapTab === 'illustration' ? 'active' : ''}" onclick="setMapTab('illustration')">
            🖼️ INFOGRAFÍA OFICIAL
          </button>
          <button type="button" class="gba-room-btn ${activeMapTab === 'history' ? 'active' : ''}" onclick="setMapTab('history')">
            📜 HISTORIAL DE AUDITORÍA
          </button>
        </div>
        <div class="gba-hardware-buttons">
          <button type="button" class="gba-pad-btn ${isEditMode ? 'active' : ''}" onclick="toggleStoreLayoutEditMode()">${isEditMode ? '💾 GUARDAR PLANO' : '🛠️ EDITAR PLANO'}</button>
          ${isEditMode ? `
            <button type="button" class="gba-pad-btn" onclick="openAddShelfModal()" style="background: #2e7d32; color: #fff; border-color: #81c784;">➕ NUEVO MÓDULO</button>
            <button type="button" class="gba-pad-btn" onclick="clearAllStoreShelves()" style="background: #b71c1c; color: #fff; border-color: #ef5350;">🧹 VACIAR PLANO</button>
          ` : ''}
          <button type="button" class="gba-pad-btn ${currentViewMode === '2D' ? 'active' : ''}" onclick="setViewMode('2D')">2D</button>
          <button type="button" class="gba-pad-btn ${currentViewMode === '3D' ? 'active' : ''}" onclick="setViewMode('3D')">3D</button>
          <button type="button" class="gba-pad-btn" onclick="adjustZoom(-10)" aria-label="Alejar">🔍−</button>
          <button type="button" class="gba-pad-btn" onclick="adjustZoom(10)" aria-label="Acercar">🔍+</button>
        </div>
      </div>

      ${isEditMode ? `
        <div class="gba-edit-hint-bar">
          <span>🛠️ ${movingShelfId ? `👉 Tocá en el plano dónde querés ubicar el módulo seleccionado.` : `Modo Edición activo: tocá un módulo y luego tocá en el plano para moverlo de lugar.`}</span>
          ${movingShelfId ? `<button type="button" onclick="movingShelfId=null;rerenderStoreMap();" style="background:rgba(0,0,0,0.4);border:1px solid #ffd54f;color:#ffd54f;border-radius:6px;padding:2px 8px;font-size:0.72rem;cursor:pointer;">Cancelar</button>` : ''}
        </div>
      ` : ''}

      ${activeMapTab === 'history' ? renderMapHistoryHTML() : activeMapTab === 'illustration' ? `
        <!-- Vista Ilustrada / Infografía Oficial del Local -->
        <div style="background: #0f2318; border: 2px solid #2e6b4d; border-radius: 16px; padding: 20px; margin: 12px 0; text-align: center;">
          <h3 style="color: var(--color-accent-gold, #c2a246); font-size: 1rem; font-weight: 800; margin: 0 0 14px 0;">
            🧭 SISTEMA DE UBICACIÓN — TERMINAL AL CENTRO COMO BRÚJULA
          </h3>
          <div style="max-width: 860px; margin: 0 auto; border: 2px solid #c2a246; border-radius: 16px; overflow: hidden; box-shadow: 0 12px 32px rgba(0,0,0,0.6);">
            <img src="assets/store-shelf-map-gba.jpg" alt="Mapa Isométrico con PC Central y Estanterías Pared 1 a 4" style="width: 100%; height: auto; display: block;">
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 16px; text-align: left; font-size: 0.85rem; color: #e8f5e9;">
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px; border-left: 4px solid #4caf50;">
              <strong>▲ Frente (Norte):</strong> Pared 1 con vitrinas y estantes principales.
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px; border-left: 4px solid #29b6f6;">
              <strong>▶ Derecha (Este):</strong> Pared 3 con estanterías laterales.
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px; border-left: 4px solid #fbc02d;">
              <strong>▼ Fondo (Sur):</strong> Pared 2 / Zona de ingreso y pallets.
            </div>
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 10px; border-left: 4px solid #ab47bc;">
              <strong>◀ Izquierda (Oeste):</strong> Pared 4 con estanterías laterales.
            </div>
          </div>
        </div>
      ` : `
        <!-- Main Layout: Modern Architectural Canvas + Inspector -->
        <div class="gba-main-grid">
          <div class="gba-screen-viewport">
            
            <div id="architectural-map-canvas" class="gba-pokemart-canvas ${isEditMode ? 'edit-active' : ''}" style="transform:${getCanvasTransform()}" onclick="handleCanvasTapToMove(event)">
              
              <!-- Wall Perimeter Orientation Labels -->
              <div class="gba-wall-banner gba-wall-north">PARED 1 · FRENTE (NORTE)</div>
              <div class="gba-wall-banner gba-wall-south">PARED 2 · FONDO (SUR)</div>
              <div class="gba-wall-banner gba-wall-east">PARED 3 · DERECHA (ESTE)</div>
              <div class="gba-wall-banner gba-wall-west">PARED 4 · IZQUIERDA (OESTE)</div>

              <!-- Architectural Grid Floor -->
              <div class="gba-floor-grid ${selectedFloorLevel === 2 ? 'gba-floor-warehouse' : 'gba-floor-wood'}"></div>

              <!-- Shelf & Compass Anchor Blocks -->
              ${renderShelfBlocks()}
            </div>
          </div>

          <!-- Right Side: Architectural Inspector & Item List -->
          ${renderSelectedShelfPanel()}
        </div>
      `}

      <!-- Bottom Status Bar -->
      <div class="gba-bottom-hud">
        <div class="gba-hud-stat">
          <span>SALA SELECCIONADA:</span>
          <strong>${escapeMapHtml(currentRoomName)}</strong>
        </div>
        <div class="gba-hud-stat">
          <span>MÓDULOS ACTIVOS:</span>
          <strong>${floorShelfCount} MÓDULOS</strong>
        </div>
        <div class="gba-hud-stat">
          <span>INVENTARIO TOTAL:</span>
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
window.handleCanvasTapToMove = handleCanvasTapToMove;
window.handleShelfClickInEditMode = handleShelfClickInEditMode;
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
window.generateDetailedVoicePhrase = generateDetailedVoicePhrase;
window.speakLocationVoicePhrase = speakLocationVoicePhrase;
window.storeLocationProducts = storeLocationProducts;
window.storeShelves = storeShelves;
