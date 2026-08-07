// BÔ Growclub - Motor de Mapa Interactivo del Local Físico & Ubicación de Estantes (v3.0)
// Architectural Blueprint Renderer & Visual Layout Builder with Vertical Shelf Levels

// Floor Elements Definition (Zones & Furniture)
const defaultStoreElements = [
  { id: 'shelf-A1', code: 'A-1', zoneCode: 'A', name: 'Vitrina Entrada / VIP', icon: '🪟', color: '#D97706', x: 18, y: 12, width: 18, height: 14, floor: 1, productsCount: 24, codeRange: 'A-1 a A-4' },
  { id: 'shelf-A2', code: 'A-2', zoneCode: 'A', name: 'Vitrina Entrada Secundaria', icon: '🪟', color: '#D97706', x: 18, y: 38, width: 18, height: 14, floor: 1, productsCount: 18, codeRange: 'A-1 a A-4' },
  { id: 'shelf-B1', code: 'B-1', zoneCode: 'B', name: 'Pasillo Botánico Norte', icon: '🌿', color: '#4E8752', x: 45, y: 12, width: 18, height: 14, floor: 1, productsCount: 32, codeRange: 'B-1 a B-4' },
  { id: 'shelf-B2', code: 'B-2', zoneCode: 'B', name: 'Pasillo Botánico Sur', icon: '🌿', color: '#4E8752', x: 66, y: 12, width: 18, height: 14, floor: 1, productsCount: 28, codeRange: 'B-1 a B-4' },
  { id: 'shelf-C1', code: 'C-1', zoneCode: 'C', name: 'Módulo Indoor Superior', icon: '🏠', color: '#2563EB', x: 80, y: 32, width: 12, height: 16, floor: 1, productsCount: 15, codeRange: 'C-1 a C-4' },
  { id: 'shelf-C2', code: 'C-2', zoneCode: 'C', name: 'Módulo Indoor Inferior', icon: '🏠', color: '#2563EB', x: 80, y: 52, width: 12, height: 16, floor: 1, productsCount: 12, codeRange: 'C-1 a C-4' },
  { id: 'shelf-D1', code: 'D-1', zoneCode: 'D', name: 'Estante Semillas VIP', icon: '📦', color: '#9333EA', x: 32, y: 76, width: 18, height: 14, floor: 1, productsCount: 40, codeRange: 'D-1 a D-4' },
  { id: 'shelf-D2', code: 'D-2', zoneCode: 'D', name: 'Depósito Insumos', icon: '📦', color: '#9333EA', x: 54, y: 76, width: 18, height: 14, floor: 1, productsCount: 35, codeRange: 'D-1 a D-4' },
  { id: 'shelf-E1', code: 'E-1', zoneCode: 'E', name: 'Barra BÔ Coffee Lounge 1', icon: '☕', color: '#B45309', x: 42, y: 36, width: 10, height: 26, floor: 1, productsCount: 10, codeRange: 'E-1 a E-4' },
  { id: 'shelf-E2', code: 'E-2', zoneCode: 'E', name: 'Barra BÔ Coffee Lounge 2', icon: '☕', color: '#B45309', x: 56, y: 36, width: 10, height: 26, floor: 1, productsCount: 14, codeRange: 'E-1 a E-4' }
];

let customStoreLayout = JSON.parse(localStorage.getItem('boeweb_custom_store_layout')) || defaultStoreElements;
let isEditMode = false;
let selectedFloorLevel = 1; // 1: Planta Baja, 2: Entrepiso, 3: Depósito Alto
let selectedShelfCode = 'A-1';
let selectedInternalLevel = 2; // 1: Inferior, 2: Medio, 3: Superior
let currentViewMode = '2D';
let mapZoomLevel = 100;

function saveStoreLayout() {
  localStorage.setItem('boeweb_custom_store_layout', JSON.stringify(customStoreLayout));
}

function setFloorLevel(level) {
  selectedFloorLevel = level;
  if (window.renderStoreMapUI) window.renderStoreMapUI();
}

function selectShelf(code, internalLevel = null) {
  selectedShelfCode = code;
  if (internalLevel) {
    selectedInternalLevel = internalLevel;
  }
  if (window.renderStoreMapUI) window.renderStoreMapUI();
}

function setInternalLevel(level) {
  selectedInternalLevel = level;
  if (window.renderStoreMapUI) window.renderStoreMapUI();
}

function setViewMode(mode) {
  currentViewMode = mode;
  if (window.renderStoreMapUI) window.renderStoreMapUI();
}

function adjustZoom(delta) {
  mapZoomLevel = Math.max(70, Math.min(150, mapZoomLevel + delta));
  const canvas = document.getElementById('architectural-map-canvas');
  if (canvas) {
    canvas.style.transform = `scale(${mapZoomLevel / 100})`;
    canvas.style.transformOrigin = 'center center';
  }
}

function showShelfDetailsModal(code) {
  const item = customStoreLayout.find(el => el.code === code) || customStoreLayout[0];
  const levelNames = { 1: 'Nivel 1 (Inferior)', 2: 'Nivel 2 (Medio)', 3: 'Nivel 3 (Superior)' };
  const floorNames = { 1: 'Planta Baja', 2: 'Entrepiso', 3: 'Depósito Alto' };
  
  if (window.showToast) {
    window.showToast(`📍 Estante ${item.code} [${levelNames[selectedInternalLevel]}] en ${floorNames[selectedFloorLevel]}`);
  } else {
    alert(`📍 Ubicación Completa:\nSucursal Centro → ${floorNames[selectedFloorLevel]} → Zona ${item.zoneCode} → Estante ${item.code} → ${levelNames[selectedInternalLevel]}\n\nTotal Productos: ${item.productsCount}`);
  }
}

// Render Interactive Store Map HTML
function renderStoreMapHTML(activeZone = null, activeShelf = null, targetLevel = null) {
  if (activeShelf) {
    selectedShelfCode = activeShelf;
    const found = customStoreLayout.find(el => el.code === activeShelf || activeShelf.startsWith(el.code));
    if (found) {
      selectedShelfCode = found.code;
    }
  }
  if (targetLevel) {
    selectedInternalLevel = targetLevel;
  }

  const currentShelfInfo = customStoreLayout.find(el => el.code === selectedShelfCode) || customStoreLayout[0];
  const activeZoneCode = activeZone || currentShelfInfo.zoneCode;

  return `
    <div class="store-map-dashboard" style="background: #FDFBF7; border: 1px solid #EBE6DF; border-radius: 24px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.03); font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #2D3748;">
      
      <!-- Top Action Sub-header -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
        <div>
          <span style="font-size: 0.72rem; color: #4E8752; font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px; display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #4E8752;"></span>
            PLANO DE PLANTA ARQUITECTÓNICO 2D BÔ
          </span>
          <h3 style="color: #1B4332; margin: 4px 0 0 0; font-size: 1.45rem; font-weight: 800; letter-spacing: -0.5px;">Mapa de Estanterías y Ubicación en Local</h3>
        </div>
        <div style="display: flex; gap: 10px; align-items: center;">
          <button type="button" onclick="toggleStoreLayoutEditMode()" style="padding: 10px 18px; font-size: 0.88rem; font-weight: 700; border-radius: 30px; border: 1.5px solid ${isEditMode ? '#DC2626' : '#1B4332'}; color: ${isEditMode ? '#DC2626' : '#1B4332'}; background: #FFFFFF; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s ease; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
            ✏️ ${isEditMode ? 'Guardar Plano' : 'Diseñar / Mover Muebles'}
          </button>
        </div>
      </div>

      ${isEditMode ? `
        <div style="background: #FEF3C7; border: 1px solid #F59E0B; padding: 12px 16px; border-radius: 14px; margin-bottom: 20px; font-size: 0.88rem; color: #92400E; display: flex; justify-content: space-between; align-items: center;">
          <span>🛠️ <strong>MODO EDITOR ACTIVO:</strong> Arrastrá los muebles o usá los controles para ajustar su ubicación en el plano.</span>
          <button type="button" onclick="resetStoreLayoutToDefault()" style="background: #FFFFFF; border: 1px solid #F59E0B; padding: 4px 12px; border-radius: 8px; font-size: 0.78rem; font-weight: 700; color: #92400E; cursor: pointer;">Restablecer Predeterminado</button>
        </div>
      ` : ''}

      <!-- Main Layout Grid (Left levels sidebar, Center map canvas, Right details panel) -->
      <div style="display: grid; grid-template-columns: 210px 1fr 310px; gap: 20px; align-items: start;">
        
        <!-- LEFT COLUMN: PHYSICAL STORE FLOORS -->
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="font-size: 0.75rem; font-weight: 800; color: #718096; text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
            <span>NIVELES</span>
            <span style="font-size: 0.9rem;">🥞</span>
          </div>

          <!-- Nivel 1 Card -->
          <div onclick="setFloorLevel(1)" style="background: ${selectedFloorLevel === 1 ? '#FFFFFF' : '#F7F4EF'}; border: 2px solid ${selectedFloorLevel === 1 ? '#2D6A4F' : '#E2E8F0'}; border-radius: 16px; padding: 14px 16px; cursor: pointer; display: flex; align-items: center; gap: 14px; transition: all 0.2s ease; box-shadow: ${selectedFloorLevel === 1 ? '0 8px 20px rgba(45,106,79,0.12)' : 'none'};">
            <div style="width: 42px; height: 42px; border-radius: 12px; background: ${selectedFloorLevel === 1 ? '#E8F5E9' : '#EDF2F7'}; color: ${selectedFloorLevel === 1 ? '#2D6A4F' : '#718096'}; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">
              📚
            </div>
            <div>
              <div style="font-weight: 800; font-size: 0.95rem; color: ${selectedFloorLevel === 1 ? '#1B4332' : '#2D3748'};">Nivel 1</div>
              <div style="font-size: 0.78rem; color: #718096; font-weight: 500;">Planta Baja</div>
            </div>
          </div>

          <!-- Nivel 2 Card -->
          <div onclick="setFloorLevel(2)" style="background: ${selectedFloorLevel === 2 ? '#FFFFFF' : '#F7F4EF'}; border: 2px solid ${selectedFloorLevel === 2 ? '#2D6A4F' : '#E2E8F0'}; border-radius: 16px; padding: 14px 16px; cursor: pointer; display: flex; align-items: center; gap: 14px; transition: all 0.2s ease; box-shadow: ${selectedFloorLevel === 2 ? '0 8px 20px rgba(45,106,79,0.12)' : 'none'};">
            <div style="width: 42px; height: 42px; border-radius: 12px; background: ${selectedFloorLevel === 2 ? '#E8F5E9' : '#EDF2F7'}; color: ${selectedFloorLevel === 2 ? '#2D6A4F' : '#718096'}; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">
              📚
            </div>
            <div>
              <div style="font-weight: 800; font-size: 0.95rem; color: ${selectedFloorLevel === 2 ? '#1B4332' : '#2D3748'};">Nivel 2</div>
              <div style="font-size: 0.78rem; color: #718096; font-weight: 500;">Entrepiso</div>
            </div>
          </div>

          <!-- Nivel 3 Card -->
          <div onclick="setFloorLevel(3)" style="background: ${selectedFloorLevel === 3 ? '#FFFFFF' : '#F7F4EF'}; border: 2px solid ${selectedFloorLevel === 3 ? '#2D6A4F' : '#E2E8F0'}; border-radius: 16px; padding: 14px 16px; cursor: pointer; display: flex; align-items: center; gap: 14px; transition: all 0.2s ease; box-shadow: ${selectedFloorLevel === 3 ? '0 8px 20px rgba(45,106,79,0.12)' : 'none'};">
            <div style="width: 42px; height: 42px; border-radius: 12px; background: ${selectedFloorLevel === 3 ? '#E8F5E9' : '#EDF2F7'}; color: ${selectedFloorLevel === 3 ? '#2D6A4F' : '#718096'}; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">
              📚
            </div>
            <div>
              <div style="font-weight: 800; font-size: 0.95rem; color: ${selectedFloorLevel === 3 ? '#1B4332' : '#2D3748'};">Nivel 3</div>
              <div style="font-size: 0.78rem; color: #718096; font-weight: 500;">Depósito Alto</div>
            </div>
          </div>
        </div>

        <!-- CENTER COLUMN: MAP CANVAS TOP DOWN VIEW -->
        <div style="position: relative; background: #EAE6DF; border: 2px solid #D8D2C9; border-radius: 20px; padding: 16px; min-height: 480px; box-shadow: inset 0 2px 8px rgba(0,0,0,0.06); display: flex; flex-direction: column; overflow: hidden;">
          
          <!-- Outer Architectural Floor Box -->
          <div id="architectural-map-canvas" style="position: relative; flex: 1; min-height: 440px; background: #F4F0E8; border: 8px solid #8C8275; border-radius: 12px; overflow: hidden; background-image: radial-gradient(#D6CFCE 1.5px, transparent 1.5px); background-size: 18px 18px; transition: transform 0.3s ease; ${currentViewMode === '3D' ? 'transform: perspective(600px) rotateX(15deg);' : ''}">
            
            <!-- Entrance Gap Marker -->
            <div style="position: absolute; left: 0; top: 40%; transform: translateY(-50%); background: #F4F0E8; width: 10px; height: 60px; z-index: 4;"></div>
            <div style="position: absolute; left: 12px; top: 40%; transform: translateY(-50%); color: #1B4332; font-weight: 900; font-size: 0.75rem; letter-spacing: 1px; z-index: 5; display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.85); padding: 4px 10px; border-radius: 8px; border: 1px solid #C39B4B;">
              ENTRADA <span style="color: #2D6A4F; font-size: 0.9rem;">▶</span>
            </div>

            <!-- Room Wall: Depósito Room (Bottom Right) -->
            <div style="position: absolute; right: 0; bottom: 0; width: 140px; height: 110px; border-top: 6px solid #8C8275; border-left: 6px solid #8C8275; background: #E8E2D8; border-top-left-radius: 8px; display: flex; align-items: center; justify-content: center; z-index: 2;">
              <div style="text-align: center; color: #786D5F; font-weight: 800; font-size: 0.78rem; letter-spacing: 0.5px;">
                <div style="font-size: 1.2rem; margin-bottom: 2px;">📦</div>
                DEPÓSITO
              </div>
            </div>

            <!-- Plants 🪴 Decorative Elements -->
            <div style="position: absolute; top: 12px; right: 12px; font-size: 1.4rem; z-index: 3;">🪴</div>
            <div style="position: absolute; bottom: 120px; left: 20px; font-size: 1.2rem; z-index: 3;">🪴</div>

            <!-- Render Store Furniture Blocks -->
            ${customStoreLayout.map(item => {
              const isSelected = selectedShelfCode === item.code;
              const isZoneActive = activeZoneCode === item.zoneCode;

              return `
                <div class="furniture-block ${isSelected ? 'selected-shelf-active' : ''}"
                     onclick="selectShelf('${item.code}')"
                     style="position: absolute; left: ${item.x}%; top: ${item.y}%; width: ${item.width}%; height: ${item.height}%; background: ${isSelected ? item.color : item.color + 'DD'}; border: 2.5px solid ${isSelected ? '#1B4332' : 'rgba(0,0,0,0.15)'}; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; z-index: ${isSelected ? '10' : '5'}; box-shadow: ${isSelected ? '0 0 0 4px rgba(45,106,79,0.3), 0 8px 16px rgba(0,0,0,0.2)' : '0 2px 6px rgba(0,0,0,0.1)'}; transform: ${isSelected ? 'scale(1.04)' : 'scale(1)'};">
                  
                  <div style="text-align: center; color: #FFFFFF; font-weight: 900; font-size: 0.85rem; text-shadow: 0 1px 3px rgba(0,0,0,0.5); user-select: none;">
                    ${item.code}
                  </div>

                  ${isEditMode ? `
                    <div style="position: absolute; top: -10px; right: -10px; display: flex; gap: 2px; background: #FFFFFF; padding: 2px; border-radius: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
                      <button onclick="event.stopPropagation(); moveStoreItem('${item.id}', -4, 0)" style="font-size:0.6rem; padding:1px 3px;">⬅️</button>
                      <button onclick="event.stopPropagation(); moveStoreItem('${item.id}', 4, 0)" style="font-size:0.6rem; padding:1px 3px;">➡️</button>
                    </div>
                  ` : ''}

                </div>
              `;
            }).join('')}

          </div>
        </div>

        <!-- RIGHT COLUMN: DETALLE DEL ESTANTE + VISTA FRONTAL + LEYENDA -->
        <div style="display: flex; flex-direction: column; gap: 16px;">
          
          <!-- DETALLE DEL ESTANTE CARD -->
          <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 18px; padding: 18px; box-shadow: 0 4px 14px rgba(0,0,0,0.03);">
            <div style="font-size: 0.72rem; font-weight: 800; color: #718096; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">DETALLE DEL ESTANTE</div>
            
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
              <span style="background: ${currentShelfInfo.color}; color: #FFFFFF; font-weight: 900; font-size: 0.9rem; padding: 4px 12px; border-radius: 10px; letter-spacing: 0.5px; box-shadow: 0 2px 6px rgba(0,0,0,0.15);">${currentShelfInfo.code}</span>
              <h4 style="margin: 0; color: #1A202C; font-size: 1rem; font-weight: 800; flex: 1; line-height: 1.2;">${currentShelfInfo.name}</h4>
            </div>

            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 0.8rem; color: #4A5568;">
              <span style="background: #E8F5E9; color: #2D6A4F; font-weight: 700; padding: 2px 10px; border-radius: 12px;">Nivel ${selectedFloorLevel}</span>
              <span>Código: ${currentShelfInfo.codeRange}</span>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; font-size: 0.85rem; background: #F8FAFC; padding: 10px 14px; border-radius: 12px; border: 1px solid #EDF2F7;">
              <div style="display: flex; align-items: center; gap: 6px; color: #4A5568; font-weight: 600;">
                <span>📦 Productos:</span>
                <strong style="color: #1A202C; font-size: 0.95rem;">${currentShelfInfo.productsCount}</strong>
              </div>
              <div style="display: flex; align-items: center; gap: 6px; color: #2D6A4F; font-weight: 700;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: #22C55E;"></span>
                Disponible
              </div>
            </div>

            <button type="button" onclick="showShelfDetailsModal('${selectedShelfCode}')" style="width: 100%; padding: 9px; border-radius: 10px; border: 1px solid #CBD5E1; background: #FFFFFF; color: #334155; font-weight: 700; font-size: 0.82rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: background 0.2s ease;">
              👁️ Ver detalles
            </button>
          </div>

          <!-- VISTA DEL ESTANTE CARD (Representación Frontal) -->
          <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 18px; padding: 18px; box-shadow: 0 4px 14px rgba(0,0,0,0.03);">
            <div style="font-size: 0.72rem; font-weight: 800; color: #718096; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">VISTA DEL ESTANTE</div>
            
            <!-- Interactive Wooden Shelf Front View -->
            <div style="position: relative; background: #FAF8F5; border: 1px solid #E5DFD5; border-radius: 14px; padding: 12px; display: flex; gap: 14px; align-items: center;">
              
              <!-- Wooden Frame Graphic -->
              <div style="position: relative; width: 130px; height: 150px; background: url('assets/botanical_shelf_preview.jpg') center center / contain no-repeat; border-radius: 8px; flex-shrink: 0;"></div>
              
              <!-- Shelf Levels Selection -->
              <div style="display: flex; flex-direction: column; gap: 8px; flex: 1;">
                
                <!-- Nivel 3 -->
                <div onclick="setInternalLevel(3)" style="padding: 8px 10px; border-radius: 10px; border: 1.5px solid ${selectedInternalLevel === 3 ? '#2D6A4F' : '#E2E8F0'}; background: ${selectedInternalLevel === 3 ? '#E8F5E9' : '#FFFFFF'}; cursor: pointer; transition: all 0.2s ease; box-shadow: ${selectedInternalLevel === 3 ? '0 2px 6px rgba(45,106,79,0.1)' : 'none'};">
                  <div style="font-size: 0.82rem; font-weight: 800; color: ${selectedInternalLevel === 3 ? '#1B4332' : '#2D3748'};">Nivel 3</div>
                  <div style="font-size: 0.72rem; color: #718096;">Superior</div>
                </div>

                <!-- Nivel 2 -->
                <div onclick="setInternalLevel(2)" style="padding: 8px 10px; border-radius: 10px; border: 1.5px solid ${selectedInternalLevel === 2 ? '#2D6A4F' : '#E2E8F0'}; background: ${selectedInternalLevel === 2 ? '#E8F5E9' : '#FFFFFF'}; cursor: pointer; transition: all 0.2s ease; box-shadow: ${selectedInternalLevel === 2 ? '0 2px 6px rgba(45,106,79,0.1)' : 'none'};">
                  <div style="font-size: 0.82rem; font-weight: 800; color: ${selectedInternalLevel === 2 ? '#1B4332' : '#2D3748'};">Nivel 2</div>
                  <div style="font-size: 0.72rem; color: #718096;">Medio</div>
                </div>

                <!-- Nivel 1 -->
                <div onclick="setInternalLevel(1)" style="padding: 8px 10px; border-radius: 10px; border: 1.5px solid ${selectedInternalLevel === 1 ? '#2D6A4F' : '#E2E8F0'}; background: ${selectedInternalLevel === 1 ? '#E8F5E9' : '#FFFFFF'}; cursor: pointer; transition: all 0.2s ease; box-shadow: ${selectedInternalLevel === 1 ? '0 2px 6px rgba(45,106,79,0.1)' : 'none'};">
                  <div style="font-size: 0.82rem; font-weight: 800; color: ${selectedInternalLevel === 1 ? '#1B4332' : '#2D3748'};">Nivel 1</div>
                  <div style="font-size: 0.72rem; color: #718096;">Inferior</div>
                </div>

              </div>

            </div>
          </div>

          <!-- LEYENDA DE ZONAS CARD -->
          <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 18px; padding: 16px; box-shadow: 0 4px 14px rgba(0,0,0,0.03); font-size: 0.78rem;">
            <div style="font-size: 0.72rem; font-weight: 800; color: #718096; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">LEYENDA DE ZONAS</div>
            
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="width: 12px; height: 12px; border-radius: 4px; background: #D97706; display: inline-block;"></span>
                <span style="color: #4A5568;"><strong style="color: #1A202C;">Zona A:</strong> Vitrina Entrada / VIP</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="width: 12px; height: 12px; border-radius: 4px; background: #4E8752; display: inline-block;"></span>
                <span style="color: #4A5568;"><strong style="color: #1A202C;">Zona B:</strong> Pasillo Botánico Central</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="width: 12px; height: 12px; border-radius: 4px; background: #2563EB; display: inline-block;"></span>
                <span style="color: #4A5568;"><strong style="color: #1A202C;">Zona C:</strong> Módulo Indoor Fondo</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="width: 12px; height: 12px; border-radius: 4px; background: #9333EA; display: inline-block;"></span>
                <span style="color: #4A5568;"><strong style="color: #1A202C;">Zona D:</strong> Depósito & Semillas</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="width: 12px; height: 12px; border-radius: 4px; background: #B45309; display: inline-block;"></span>
                <span style="color: #4A5568;"><strong style="color: #1A202C;">Zona E:</strong> Barra BÔ Coffee & Lounge</span>
              </div>
            </div>
          </div>

        </div>

      </div>

      <!-- BOTTOM BAR: KPI STATS & CONTROLS -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; flex-wrap: wrap; gap: 14px; padding-top: 16px; border-top: 1px solid #EBE6DF;">
        
        <!-- KPIs -->
        <div style="display: flex; gap: 14px; flex-wrap: wrap;">
          <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 14px; padding: 10px 16px; display: flex; align-items: center; gap: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
            <span style="font-size: 1.4rem;">🗄️</span>
            <div>
              <div style="font-size: 0.72rem; color: #718096; font-weight: 600;">Total Estantes</div>
              <div style="font-size: 1.05rem; font-weight: 800; color: #1A202C;">12 <span style="font-size: 0.75rem; font-weight: 500; color: #718096;">activos</span></div>
            </div>
          </div>

          <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 14px; padding: 10px 16px; display: flex; align-items: center; gap: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
            <span style="font-size: 1.4rem;">📚</span>
            <div>
              <div style="font-size: 0.72rem; color: #718096; font-weight: 600;">Niveles</div>
              <div style="font-size: 1.05rem; font-weight: 800; color: #1A202C;">3 <span style="font-size: 0.75rem; font-weight: 500; color: #718096;">disponibles</span></div>
            </div>
          </div>

          <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 14px; padding: 10px 16px; display: flex; align-items: center; gap: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
            <span style="font-size: 1.4rem;">📦</span>
            <div>
              <div style="font-size: 0.72rem; color: #718096; font-weight: 600;">Productos</div>
              <div style="font-size: 1.05rem; font-weight: 800; color: #1A202C;">128 <span style="font-size: 0.75rem; font-weight: 500; color: #718096;">registrados</span></div>
            </div>
          </div>

          <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 14px; padding: 10px 16px; display: flex; align-items: center; gap: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
            <span style="font-size: 1.4rem;">🕒</span>
            <div>
              <div style="font-size: 0.72rem; color: #718096; font-weight: 600;">Última actualización</div>
              <div style="font-size: 0.95rem; font-weight: 800; color: #1A202C;">Hoy 14:32 <span style="font-size: 0.7rem; font-weight: 500; color: #718096;">08/08/2025</span></div>
            </div>
          </div>
        </div>

        <!-- View Controls (2D, 3D, Zoom -, Zoom +) -->
        <div style="display: flex; gap: 6px; align-items: center; background: #FFFFFF; padding: 4px 8px; border-radius: 12px; border: 1px solid #E2E8F0;">
          <button type="button" onclick="setViewMode('2D')" style="padding: 6px 12px; border-radius: 8px; border: none; background: ${currentViewMode === '2D' ? '#E8F5E9' : 'transparent'}; color: ${currentViewMode === '2D' ? '#2D6A4F' : '#718096'}; font-weight: 800; font-size: 0.82rem; cursor: pointer;">2D</button>
          <button type="button" onclick="setViewMode('3D')" style="padding: 6px 12px; border-radius: 8px; border: none; background: ${currentViewMode === '3D' ? '#E8F5E9' : 'transparent'}; color: ${currentViewMode === '3D' ? '#2D6A4F' : '#718096'}; font-weight: 800; font-size: 0.82rem; cursor: pointer;">3D</button>
          <div style="width: 1px; height: 16px; background: #CBD5E1; margin: 0 4px;"></div>
          <button type="button" onclick="adjustZoom(-10)" style="padding: 6px 10px; border-radius: 8px; border: none; background: transparent; color: #4A5568; font-weight: 800; font-size: 0.9rem; cursor: pointer;">—</button>
          <button type="button" onclick="adjustZoom(10)" style="padding: 6px 10px; border-radius: 8px; border: none; background: transparent; color: #4A5568; font-weight: 800; font-size: 0.9rem; cursor: pointer;">+</button>
        </div>

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
    item.x = Math.max(5, Math.min(80, item.x + dx));
    item.y = Math.max(5, Math.min(80, item.y + dy));
    saveStoreLayout();
    if (window.renderStoreMapUI) window.renderStoreMapUI();
  }
}

function resetStoreLayoutToDefault() {
  customStoreLayout = JSON.parse(JSON.stringify(defaultStoreElements));
  saveStoreLayout();
  if (window.renderStoreMapUI) window.renderStoreMapUI();
}

// Expose globally
window.renderStoreMapHTML = renderStoreMapHTML;
window.toggleStoreLayoutEditMode = toggleStoreLayoutEditMode;
window.moveStoreItem = moveStoreItem;
window.resetStoreLayoutToDefault = resetStoreLayoutToDefault;
window.setFloorLevel = setFloorLevel;
window.selectShelf = selectShelf;
window.setInternalLevel = setInternalLevel;
window.setViewMode = setViewMode;
window.adjustZoom = adjustZoom;
window.showShelfDetailsModal = showShelfDetailsModal;
