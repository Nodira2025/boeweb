// BÔ Growclub - Motor de Mapa Interactivo del Local Físico & Ubicación de Estantes (v2.6)
// Includes 2D Architectural Blueprint Renderer & Custom Visual Layout Builder Engine

const defaultStoreElements = [
  { id: 'zone-A', code: 'A', name: 'Vitrina Entrada / VIP', icon: '🪟', color: '#d4af37', x: 10, y: 15, width: 28, height: 25, type: 'vitrina' },
  { id: 'zone-B', code: 'B', name: 'Pasillo Botánico Central', icon: '🌿', color: '#66bb6a', x: 42, y: 15, width: 22, height: 45, type: 'estanteria' },
  { id: 'zone-C', code: 'C', name: 'Módulo Indoor Fondo', icon: '🏠', color: '#42a5f5', x: 68, y: 15, width: 24, height: 35, type: 'indoor' },
  { id: 'zone-D', code: 'D', name: 'Depósito & Semillas', icon: '📦', color: '#ab47bc', x: 68, y: 55, width: 24, height: 35, type: 'deposito' },
  { id: 'zone-E', code: 'E', name: 'Barra BÔ Coffee & Lounge', icon: '☕', color: '#ffb74d', x: 10, y: 50, width: 28, height: 40, type: 'coffee' }
];

let customStoreLayout = JSON.parse(localStorage.getItem('boeweb_custom_store_layout')) || defaultStoreElements;
let isEditMode = false;

function saveStoreLayout() {
  localStorage.setItem('boeweb_custom_store_layout', JSON.stringify(customStoreLayout));
}

// Render Interactive Store Map SVG / Grid Blueprint
function renderStoreMapHTML(activeZone = null, activeShelf = null) {
  const activeItem = customStoreLayout.find(el => el.code === activeZone || (activeShelf && activeShelf.startsWith(el.code)));

  return `
    <div class="store-map-container" style="background: rgba(15, 30, 24, 0.98); border: 2px solid var(--color-accent-gold); border-radius: 20px; padding: 24px; color: #fff; box-shadow: 0 15px 40px rgba(0,0,0,0.5);">
      
      <!-- Top Action Bar -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
        <div>
          <span style="font-size: 0.75rem; color: var(--color-accent-gold); font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">PLANO DE PLANTA ARQUITECTÓNICO 2D BÔ</span>
          <h3 style="font-family: var(--font-display); color: #fff; margin: 2px 0 0 0; font-size: 1.35rem;">Mapa de Estanterías y Ubicación en Local</h3>
        </div>
        <div style="display: flex; gap: 10px; align-items: center;">
          ${activeShelf ? `<div style="background: rgba(195,155,75,0.25); border: 1.5px solid var(--color-accent-gold); padding: 6px 16px; border-radius: 20px; color: var(--color-accent-gold); font-weight: 700; font-size: 0.9rem; animation: pulseGlow 1.5s infinite;">🎯 DARDITO EN: ${activeShelf}</div>` : ''}
          <button class="btn btn-secondary" onclick="toggleStoreLayoutEditMode()" style="padding: 8px 14px; font-size: 0.85rem; border-color: ${isEditMode ? '#ff5252' : 'var(--color-accent-gold)'}; color: ${isEditMode ? '#ff5252' : 'var(--color-accent-gold)'};">
            ${isEditMode ? '💾 Guardar Plano' : '🧩 Diseñar / Mover Muebles'}
          </button>
        </div>
      </div>

      ${isEditMode ? `
        <div style="background: rgba(255,193,7,0.15); border: 1px solid #ffc107; padding: 10px 14px; border-radius: 10px; margin-bottom: 16px; font-size: 0.85rem; color: #ffc107;">
          🛠️ <strong>MODO EDITOR DE ARQUITECTURA ACTIVO:</strong> Seleccioná y arrastrá los módulos para ubicar tus vitrinas, mostrador o depósitos exactos según la forma de tu local.
          <button class="btn btn-secondary" onclick="resetStoreLayoutToDefault()" style="margin-left: 10px; font-size: 0.75rem; padding: 4px 10px;">Restablecer Predeterminado</button>
        </div>
      ` : ''}

      <!-- Architectural Canvas Grid -->
      <div class="store-architect-canvas" style="position: relative; width: 100%; height: 380px; background: rgba(0,0,0,0.5); border: 2px solid rgba(195,155,75,0.3); border-radius: 14px; overflow: hidden; background-image: radial-gradient(rgba(195,155,75,0.15) 1px, transparent 1px); background-size: 20px 20px;">
        
        <!-- Entrance Marker -->
        <div style="position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); background: var(--color-accent-gold); color: #0f1e18; padding: 4px 14px; border-radius: 12px; font-weight: 900; font-size: 0.75rem; letter-spacing: 1px; z-index: 5; box-shadow: 0 0 10px rgba(195,155,75,0.5);">
          🚪 ENTRADA PRINCIPAL LOCAL
        </div>

        <!-- Render Furniture Elements -->
        ${customStoreLayout.map(item => {
          const isActive = activeItem && activeItem.code === item.code;
          return `
            <div class="architect-furniture-item ${isActive ? 'active-target-pin' : ''}" 
                 style="position: absolute; left: ${item.x}%; top: ${item.y}%; width: ${item.width}%; height: ${item.height}%; background: ${item.color}22; border: 2px ${isActive ? 'solid #fff' : 'solid ' + item.color}; border-radius: 10px; padding: 8px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; transition: all 0.3s ease; ${isActive ? 'box-shadow: 0 0 25px ' + item.color + ', 0 0 10px #fff;' : ''}">
              
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="background: ${item.color}; color: #0f1e18; font-weight: 900; padding: 2px 6px; border-radius: 4px; font-size: 0.72rem;">ZONA ${item.code}</span>
                <span style="font-size: 1.1rem;">${item.icon}</span>
              </div>

              <div style="text-align: center; margin: 4px 0;">
                <h5 style="margin: 0; color: #fff; font-size: 0.85rem; font-weight: 700;">${item.name}</h5>
              </div>

              ${isActive ? `
                <div style="background: ${item.color}; color: #0f1e18; font-weight: 900; padding: 4px; border-radius: 6px; font-size: 0.75rem; text-align: center; animation: pulseGlow 1.2s infinite;">
                  🎯 DARDITO AQUÍ
                </div>
              ` : `
                <span style="font-size: 0.68rem; color: rgba(247,246,242,0.6); text-align: center;">Código: ${item.code}-1 a ${item.code}-4</span>
              `}

              ${isEditMode ? `
                <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                  <button onclick="moveStoreItem('${item.id}', -5, 0)" style="font-size:0.65rem; padding:2px 4px;">⬅️</button>
                  <button onclick="moveStoreItem('${item.id}', 5, 0)" style="font-size:0.65rem; padding:2px 4px;">➡️</button>
                  <button onclick="moveStoreItem('${item.id}', 0, -5)" style="font-size:0.65rem; padding:2px 4px;">⬆️</button>
                  <button onclick="moveStoreItem('${item.id}', 0, 5)" style="font-size:0.65rem; padding:2px 4px;">⬇️</button>
                </div>
              ` : ''}

            </div>
          `;
        }).join('')}

      </div>

      <!-- Legend -->
      <div style="display: flex; justify-content: space-around; margin-top: 16px; flex-wrap: wrap; gap: 8px; font-size: 0.78rem; color: rgba(247,246,242,0.8);">
        ${customStoreLayout.map(el => `
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="width: 12px; height: 12px; border-radius: 3px; background: ${el.color}; display: inline-block;"></span>
            <span><strong>Zona ${el.code}:</strong> ${el.name}</span>
          </div>
        `).join('')}
      </div>

    </div>
  `;
}

function toggleStoreLayoutEditMode() {
  isEditMode = !isEditMode;
  if (!isEditMode) {
    saveStoreLayout();
    if (window.showToast) window.showToast('💾 ¡Diseño de Plano del Local Guardado!');
  }
  if (window.renderStoreMapUI) window.renderStoreMapUI();
}

function moveStoreItem(id, dx, dy) {
  const item = customStoreLayout.find(el => el.id === id);
  if (item) {
    item.x = Math.max(0, Math.min(75, item.x + dx));
    item.y = Math.max(0, Math.min(70, item.y + dy));
    saveStoreLayout();
    if (window.renderStoreMapUI) window.renderStoreMapUI();
  }
}

function resetStoreLayoutToDefault() {
  customStoreLayout = JSON.parse(JSON.stringify(defaultStoreElements));
  saveStoreLayout();
  if (window.renderStoreMapUI) window.renderStoreMapUI();
}

// Global exposure
window.renderStoreMapHTML = renderStoreMapHTML;
window.toggleStoreLayoutEditMode = toggleStoreLayoutEditMode;
window.moveStoreItem = moveStoreItem;
window.resetStoreLayoutToDefault = resetStoreLayoutToDefault;
