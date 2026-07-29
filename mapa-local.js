// BÔ Growclub - Motor de Mapa Interactivo del Local Físico & Ubicación de Estantes (v2.5)

const storeZones = {
  'A': { name: 'Vitrina Principal / Parafernalia VIP', color: '#d4af37', description: 'Ubicada a la entrada, exhibición glassmorphism.' },
  'B': { name: 'Estantería Botánica Central', color: '#66bb6a', description: 'Pasillo central, fertilizantes y sustratos orgánicos.' },
  'C': { name: 'Módulo Indoor Fondo', color: '#42a5f5', description: 'Zona posterior, paneles LED, carpas y turbinas.' },
  'D': { name: 'Depósito Auxiliar & Banco de Semillas', color: '#ab47bc', description: 'Área restringida de stock en frío y semillas.' },
  'E': { name: 'Barra BÔ Coffee & Lounge', color: '#ffb74d', description: 'Mesas y mostrador de cafetería botánica.' }
};

// Default Sample Physical Inventory with Shelf Codes
let localStoreInventory = JSON.parse(localStorage.getItem('boeweb_local_inventory')) || [
  {
    sku: '#BO-LOCAL-1001',
    name: 'Quantum Board LED 240W Samsung LM301H',
    category: 'Indoor & Luz',
    priceArs: 450000,
    stock: 8,
    shelfCode: 'C-1',
    zone: 'C',
    details: 'Estante C-1 (Módulo Indoor Fondo - Estantería Metálica 1)'
  },
  {
    sku: '#BO-LOCAL-1002',
    name: 'Vaporizador Storz & Bickel Mighty+',
    category: 'Vaporizadores',
    priceArs: 680000,
    stock: 5,
    shelfCode: 'A-2',
    zone: 'A',
    details: 'Estante A-2 (Vitrina Principal - Mostrador Vidrio)'
  },
  {
    sku: '#BO-LOCAL-1003',
    name: 'Kit Trio Advanced Nutrients pH Perfect 500ml',
    category: 'Fertilizantes',
    priceArs: 125000,
    stock: 14,
    shelfCode: 'B-3',
    zone: 'B',
    details: 'Estante B-3 (Estantería Botánica Central - Nivel Medio)'
  },
  {
    sku: '#BO-LOCAL-1004',
    name: 'Picador Grinder BÔ Metal 4 Partes',
    category: 'Parafernalia',
    priceArs: 18500,
    stock: 30,
    shelfCode: 'A-1',
    zone: 'A',
    details: 'Cajón A-1 (Vitrina Entrada - Cajón Accesorios)'
  }
];

function saveLocalInventory() {
  localStorage.setItem('boeweb_local_inventory', JSON.stringify(localStoreInventory));
}

// Render Interactive Store Map SVG / HTML Canvas
function renderStoreMapHTML(activeZone = null, activeShelf = null) {
  return `
    <div class="store-map-container" style="background: rgba(15, 30, 24, 0.95); border: 2px solid var(--color-accent-gold); border-radius: 16px; padding: 20px; color: #fff;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
        <div>
          <span style="font-size: 0.75rem; color: var(--color-accent-gold); font-weight: 700; text-transform: uppercase;">PLANO INTERACTIVO DEL LOCAL FÍSICO BÔ</span>
          <h3 style="font-family: var(--font-display); color: #fff; margin: 2px 0 0 0; font-size: 1.25rem;">Mapa de Estanterías y Ubicación</h3>
        </div>
        ${activeShelf ? `<div style="background: rgba(195,155,75,0.2); border: 1px solid var(--color-accent-gold); padding: 6px 14px; border-radius: 20px; color: var(--color-accent-gold); font-weight: 700; font-size: 0.9rem;">📍 UBICACIÓN SOLICITADA: ${activeShelf}</div>` : ''}
      </div>

      <!-- Map Diagram Grid -->
      <div class="store-floorplan-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px;">
        
        <!-- Zona A -->
        <div class="store-zone-box ${activeZone === 'A' ? 'active-zone' : ''}" style="background: rgba(212,175,55,0.12); border: 2px ${activeZone === 'A' ? 'solid #d4af37' : 'dashed rgba(212,175,55,0.4)'}; border-radius: 12px; padding: 14px; text-align: center; position: relative;">
          <span style="background: #d4af37; color: #0f1e18; font-weight: 900; padding: 2px 8px; border-radius: 6px; font-size: 0.75rem;">ZONA A</span>
          <h4 style="font-size: 0.9rem; margin: 6px 0 4px 0; color: #d4af37;">Vitrina Entrada</h4>
          <p style="font-size: 0.72rem; color: rgba(247,246,242,0.7); margin: 0;">Estantes A-1, A-2, A-3 (Vaporizadores & VIP)</p>
          ${activeZone === 'A' ? '<div style="margin-top:8px; font-weight:700; color:#d4af37; font-size:0.8rem;">🎯 ¡PRODUCTO AQUÍ!</div>' : ''}
        </div>

        <!-- Zona B -->
        <div class="store-zone-box ${activeZone === 'B' ? 'active-zone' : ''}" style="background: rgba(102,187,106,0.12); border: 2px ${activeZone === 'B' ? 'solid #66bb6a' : 'dashed rgba(102,187,106,0.4)'}; border-radius: 12px; padding: 14px; text-align: center;">
          <span style="background: #66bb6a; color: #0f1e18; font-weight: 900; padding: 2px 8px; border-radius: 6px; font-size: 0.75rem;">ZONA B</span>
          <h4 style="font-size: 0.9rem; margin: 6px 0 4px 0; color: #66bb6a;">Pasillo Botánico</h4>
          <p style="font-size: 0.72rem; color: rgba(247,246,242,0.7); margin: 0;">Estantes B-1, B-2, B-3 (Fertilizantes & Aditivos)</p>
          ${activeZone === 'B' ? '<div style="margin-top:8px; font-weight:700; color:#66bb6a; font-size:0.8rem;">🎯 ¡PRODUCTO AQUÍ!</div>' : ''}
        </div>

        <!-- Zona C -->
        <div class="store-zone-box ${activeZone === 'C' ? 'active-zone' : ''}" style="background: rgba(66,165,245,0.12); border: 2px ${activeZone === 'C' ? 'solid #42a5f5' : 'dashed rgba(66,165,245,0.4)'}; border-radius: 12px; padding: 14px; text-align: center;">
          <span style="background: #42a5f5; color: #0f1e18; font-weight: 900; padding: 2px 8px; border-radius: 6px; font-size: 0.75rem;">ZONA C</span>
          <h4 style="font-size: 0.9rem; margin: 6px 0 4px 0; color: #42a5f5;">Módulo Indoor Fondo</h4>
          <p style="font-size: 0.72rem; color: rgba(247,246,242,0.7); margin: 0;">Estantes C-1, C-2 (LED, Carpas & Turbinas)</p>
          ${activeZone === 'C' ? '<div style="margin-top:8px; font-weight:700; color:#42a5f5; font-size:0.8rem;">🎯 ¡PRODUCTO AQUÍ!</div>' : ''}
        </div>

        <!-- Zona D -->
        <div class="store-zone-box ${activeZone === 'D' ? 'active-zone' : ''}" style="background: rgba(171,71,188,0.12); border: 2px ${activeZone === 'D' ? 'solid #ab47bc' : 'dashed rgba(171,71,188,0.4)'}; border-radius: 12px; padding: 14px; text-align: center;">
          <span style="background: #ab47bc; color: #fff; font-weight: 900; padding: 2px 8px; border-radius: 6px; font-size: 0.75rem;">ZONA D</span>
          <h4 style="font-size: 0.9rem; margin: 6px 0 4px 0; color: #ab47bc;">Depósito & Semillas</h4>
          <p style="font-size: 0.72rem; color: rgba(247,246,242,0.7); margin: 0;">Estantes D-1 al D-4 (Stock Frío & Genéticas)</p>
          ${activeZone === 'D' ? '<div style="margin-top:8px; font-weight:700; color:#ab47bc; font-size:0.8rem;">🎯 ¡PRODUCTO AQUÍ!</div>' : ''}
        </div>

        <!-- Zona E -->
        <div class="store-zone-box ${activeZone === 'E' ? 'active-zone' : ''}" style="grid-column: span 2; background: rgba(255,183,77,0.12); border: 2px ${activeZone === 'E' ? 'solid #ffb74d' : 'dashed rgba(255,183,77,0.4)'}; border-radius: 12px; padding: 14px; text-align: center;">
          <span style="background: #ffb74d; color: #0f1e18; font-weight: 900; padding: 2px 8px; border-radius: 6px; font-size: 0.75rem;">ZONA E</span>
          <h4 style="font-size: 0.9rem; margin: 6px 0 4px 0; color: #ffb74d;">Barra BÔ Coffee & Lounge</h4>
          <p style="font-size: 0.72rem; color: rgba(247,246,242,0.7); margin: 0;">Mesas 1-20, Barra de Café & Repostería</p>
          ${activeZone === 'E' ? '<div style="margin-top:8px; font-weight:700; color:#ffb74d; font-size:0.8rem;">🎯 ¡PRODUCTO AQUÍ!</div>' : ''}
        </div>

      </div>

      <div style="text-align: center; font-size: 0.78rem; color: rgba(247,246,242,0.6);">
        💡 Podés asignar o editar la ubicación de cualquier producto ingresando su código (ej: <strong>A-1</strong>, <strong>B-3</strong>, <strong>C-2</strong>).
      </div>
    </div>
  `;
}

// Global exposure
window.renderStoreMapHTML = renderStoreMapHTML;
window.localStoreInventory = localStoreInventory;
window.saveLocalInventory = saveLocalInventory;
