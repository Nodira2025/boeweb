// BÔ Grow Club — mapa físico conectado al inventario.

const DEFAULT_STORE_SHELVES = [
  { id: 'shelf-A1', code: 'A-1', zone_code: 'A', name: 'Vitrina principal', floor_level: 1, x: 16, y: 12, width: 18, height: 14 },
  { id: 'shelf-A2', code: 'A-2', zone_code: 'A', name: 'Vitrina secundaria', floor_level: 1, x: 16, y: 37, width: 18, height: 14 },
  { id: 'shelf-B1', code: 'B-1', zone_code: 'B', name: 'Pasillo botánico norte', floor_level: 1, x: 43, y: 12, width: 18, height: 14 },
  { id: 'shelf-B2', code: 'B-2', zone_code: 'B', name: 'Pasillo botánico sur', floor_level: 1, x: 65, y: 12, width: 18, height: 14 },
  { id: 'shelf-C1', code: 'C-1', zone_code: 'C', name: 'Módulo indoor superior', floor_level: 1, x: 79, y: 32, width: 12, height: 16 },
  { id: 'shelf-C2', code: 'C-2', zone_code: 'C', name: 'Módulo indoor inferior', floor_level: 1, x: 79, y: 53, width: 12, height: 16 },
  { id: 'shelf-D1', code: 'D-1', zone_code: 'D', name: 'Semillas y productos reservados', floor_level: 1, x: 31, y: 76, width: 18, height: 14 },
  { id: 'shelf-D2', code: 'D-2', zone_code: 'D', name: 'Depósito de insumos', floor_level: 1, x: 53, y: 76, width: 18, height: 14 },
  { id: 'shelf-E1', code: 'E-1', zone_code: 'E', name: 'Coffee Lounge 1', floor_level: 1, x: 41, y: 36, width: 10, height: 26 },
  { id: 'shelf-E2', code: 'E-2', zone_code: 'E', name: 'Coffee Lounge 2', floor_level: 1, x: 55, y: 36, width: 10, height: 26 }
];

const FLOOR_NAMES = { 1: 'Planta baja', 2: 'Entrepiso', 3: 'Depósito alto' };
const LEVEL_NAMES = { 1: 'Inferior', 2: 'Medio', 3: 'Superior' };
const MAP_LAYOUT_KEY = 'boeweb_custom_store_layout_v4';
const MAP_PHOTOS_KEY = 'boeweb_store_shelf_photos_v1';

let storeShelves = loadSavedStoreLayout();
let storeLocationProducts = [];
let selectedFloorLevel = 1;
let selectedShelfCode = 'A-1';
let selectedInternalLevel = 2;
let currentViewMode = '2D';
let mapZoomLevel = 100;
let isEditMode = false;
let storeMapSyncLabel = 'Datos locales listos';

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
    width: Number(shelf.width ?? fallback.width ?? 16),
    height: Number(shelf.height ?? fallback.height ?? 12)
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
  const firstShelf = storeShelves.find(item => item.floor_level === selectedFloorLevel);
  if (firstShelf) selectedShelfCode = firstShelf.code;
  rerenderStoreMap();
}

function selectShelf(code, internalLevel = null) {
  const shelf = storeShelves.find(item => item.code === code);
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
  mapZoomLevel = Math.max(70, Math.min(140, mapZoomLevel + Number(delta || 0)));
  const canvas = document.getElementById('architectural-map-canvas');
  if (canvas) canvas.style.transform = getCanvasTransform();
}

function getCanvasTransform() {
  const scale = `scale(${mapZoomLevel / 100})`;
  return currentViewMode === '3D' ? `perspective(900px) rotateX(11deg) ${scale}` : scale;
}

function rerenderStoreMap() {
  if (window.renderStoreMapUI) window.renderStoreMapUI(null, null, null, false);
}

function getShelfProducts(code, internalLevel = null) {
  return storeLocationProducts.filter(product => {
    const sameShelf = String(product.shelf_code || '').toUpperCase() === String(code || '').toUpperCase();
    return sameShelf && (!internalLevel || Number(product.shelf_level) === Number(internalLevel));
  });
}

function getShelfUnitCount(code) {
  return getShelfProducts(code).reduce((sum, product) => sum + Math.max(0, Number(product.stock) || 0), 0);
}

function findStoreMapProduct(query) {
  const normalized = String(query || '').trim().toLocaleLowerCase('es-AR');
  if (!normalized) return null;
  const product = storeLocationProducts.find(item => [item.name, item.product_code, item.barcode]
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
  if (!isEditMode && window.showToast) window.showToast('Plano guardado en este equipo.');
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
  const message = `${FLOOR_NAMES[shelf.floor_level]} · Estante ${shelf.code} · ${LEVEL_NAMES[selectedInternalLevel]} · ${unitCount} unidades registradas`;
  if (window.showToast) window.showToast(message);
}

function renderFloorTabs() {
  return Object.entries(FLOOR_NAMES).map(([level, label]) => `
    <button type="button" class="store-map-floor-btn ${selectedFloorLevel === Number(level) ? 'active' : ''}"
      onclick="setFloorLevel(${level})" aria-pressed="${selectedFloorLevel === Number(level)}">
      ${escapeMapHtml(label)}
    </button>`).join('');
}

function renderShelfBlocks() {
  const floorShelves = storeShelves.filter(item => item.floor_level === selectedFloorLevel);
  if (!floorShelves.length) {
    return `<div class="map-empty-floor"><div><strong>Este nivel todavía no tiene estantes.</strong><br>Podés asignarlos cuando definas el plano físico.</div></div>`;
  }
  return floorShelves.map(shelf => {
    const count = getShelfUnitCount(shelf.code);
    const selected = shelf.code === selectedShelfCode;
    return `
      <div class="map-shelf-position" style="left:${shelf.x}%;top:${shelf.y}%;width:${shelf.width}%;height:${shelf.height}%;">
        <button type="button" class="map-shelf-block ${selected ? 'selected' : ''}" data-zone="${escapeMapHtml(shelf.zone_code)}"
          onclick="selectShelf('${escapeMapHtml(shelf.code)}')" aria-label="Estante ${escapeMapHtml(shelf.code)}, ${count} unidades">
          <span>${escapeMapHtml(shelf.code)}</span><small>${count} u.</small>
        </button>
        ${isEditMode ? `<div class="map-editor-controls" aria-label="Mover estante ${escapeMapHtml(shelf.code)}">
          <button type="button" onclick="moveStoreItem('${escapeMapHtml(shelf.id)}',-3,0)" aria-label="Mover a la izquierda">←</button>
          <button type="button" onclick="moveStoreItem('${escapeMapHtml(shelf.id)}',3,0)" aria-label="Mover a la derecha">→</button>
        </div>` : ''}
      </div>`;
  }).join('');
}

function renderProductRows(products) {
  if (!products.length) {
    return `<div class="map-products-empty">No hay productos asignados a este nivel del estante.</div>`;
  }
  return products.map(product => {
    const exactPosition = product.shelf_position ? ` · ${escapeMapHtml(product.shelf_position)}` : '';
    return `
      <article class="map-product-row" data-product-code="${escapeMapHtml(product.product_code)}">
        ${product.image_url ? `<img src="${escapeMapHtml(product.image_url)}" alt="${escapeMapHtml(product.name || 'Producto')}">` : '<span class="map-product-placeholder" aria-hidden="true">□</span>'}
        <div>
          <strong>${escapeMapHtml(product.name || 'Producto sin nombre')}</strong>
          <small>${escapeMapHtml(product.product_code || 'Sin código')} · ${Number(product.stock) || 0} unidades${exactPosition}${product.barcode ? ` · Barra ${escapeMapHtml(product.barcode)}` : ''}</small>
        </div>
        <button type="button" class="map-product-action" onclick="printProductQrByCode('${escapeMapHtml(product.product_code)}')" aria-label="Imprimir QR de ${escapeMapHtml(product.name)}">QR</button>
      </article>`;
  }).join('');
}

function renderSelectedShelfPanel() {
  const shelf = storeShelves.find(item => item.code === selectedShelfCode)
    || storeShelves.find(item => item.floor_level === selectedFloorLevel)
    || storeShelves[0];
  if (!shelf) return '';
  selectedShelfCode = shelf.code;
  const allProducts = getShelfProducts(shelf.code);
  const visibleProducts = getShelfProducts(shelf.code, selectedInternalLevel);
  const unitCount = allProducts.reduce((sum, product) => sum + (Number(product.stock) || 0), 0);
  const levels = [1, 2, 3].map(level => `
    <button type="button" class="map-shelf-level ${selectedInternalLevel === level ? 'active' : ''}" onclick="setInternalLevel(${level})">
      ${LEVEL_NAMES[level]} · ${getShelfProducts(shelf.code, level).reduce((sum, item) => sum + (Number(item.stock) || 0), 0)} u.
    </button>`).join('');
  return `
    <aside class="store-map-side">
      <section class="map-detail-card" aria-labelledby="map-selected-shelf-title">
        <span class="stock-entry-step">Estante seleccionado</span>
        <h3 id="map-selected-shelf-title">${escapeMapHtml(shelf.code)} · ${escapeMapHtml(shelf.name)}</h3>
        <div class="map-detail-meta">${escapeMapHtml(FLOOR_NAMES[shelf.floor_level])} · Zona ${escapeMapHtml(shelf.zone_code)} · ${unitCount} unidades</div>
        <div class="map-shelf-photo">
          ${shelf.photo_url ? `<img src="${escapeMapHtml(shelf.photo_url)}" alt="Foto del estante ${escapeMapHtml(shelf.code)}">` : '<span>Agregá una foto real para reconocer el estante más rápido.</span>'}
        </div>
        <div class="map-photo-actions">
          <label class="map-photo-button">${shelf.photo_url ? 'Cambiar foto' : 'Cargar foto'}
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onchange="handleShelfPhotoChange(event,'${escapeMapHtml(shelf.code)}')">
          </label>
          <button type="button" class="map-editor-button" onclick="showShelfDetailsModal('${escapeMapHtml(shelf.code)}')">Ver resumen</button>
        </div>
        <div class="map-level-actions">${levels}</div>
      </section>
      <section class="map-products-card" aria-labelledby="map-products-title">
        <span class="stock-entry-step">${escapeMapHtml(LEVEL_NAMES[selectedInternalLevel])}</span>
        <h3 id="map-products-title">Productos ubicados</h3>
        <div class="map-products-list">${renderProductRows(visibleProducts)}</div>
      </section>
    </aside>`;
}

function renderStoreMapHTML(activeZone = null, activeShelf = null, targetLevel = null) {
  if (activeShelf) {
    const shelf = storeShelves.find(item => item.code === activeShelf);
    if (shelf) {
      selectedShelfCode = shelf.code;
      selectedFloorLevel = shelf.floor_level;
    }
  }
  if (targetLevel) selectedInternalLevel = Number(targetLevel);
  const floorShelfCount = storeShelves.filter(item => item.floor_level === selectedFloorLevel).length;
  const totalUnits = storeLocationProducts.reduce((sum, item) => sum + Math.max(0, Number(item.stock) || 0), 0);
  const updatedAt = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date());

  return `
    <div class="store-map-dashboard">
      <div class="store-map-toolbar">
        <div class="store-map-floor-tabs" aria-label="Pisos del local">${renderFloorTabs()}</div>
        <div class="store-map-map-actions">
          <button type="button" class="store-map-action-btn" onclick="toggleStoreLayoutEditMode()">${isEditMode ? 'Guardar plano' : 'Ajustar plano'}</button>
          ${isEditMode ? '<button type="button" class="store-map-action-btn" onclick="resetStoreLayoutToDefault()">Restablecer</button>' : ''}
          <button type="button" class="store-map-action-btn" onclick="setViewMode('2D')">2D</button>
          <button type="button" class="store-map-action-btn" onclick="setViewMode('3D')">3D</button>
          <button type="button" class="store-map-action-btn" onclick="adjustZoom(-10)" aria-label="Alejar">−</button>
          <button type="button" class="store-map-action-btn" onclick="adjustZoom(10)" aria-label="Acercar">+</button>
        </div>
        <span class="store-map-sync">${escapeMapHtml(storeMapSyncLabel)} · ${updatedAt}</span>
      </div>
      <div class="store-map-main-grid">
        <div class="store-map-canvas-wrap">
          <div id="architectural-map-canvas" class="architectural-map-canvas" style="transform:${getCanvasTransform()}">
            <span class="map-entrance">Entrada →</span>
            <span class="map-depot-label">Depósito</span>
            ${renderShelfBlocks()}
          </div>
        </div>
        ${renderSelectedShelfPanel()}
      </div>
      <div class="store-map-kpis">
        <div class="map-kpi"><span>Estantes en este piso</span><strong>${floorShelfCount}</strong></div>
        <div class="map-kpi"><span>Productos ubicados</span><strong>${storeLocationProducts.length}</strong></div>
        <div class="map-kpi"><span>Unidades registradas</span><strong>${totalUnits}</strong></div>
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
