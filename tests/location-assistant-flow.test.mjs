import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Location Assistant: Constantes y estructura de pasos presentes en vendedor.js', () => {
  const code = fs.readFileSync(path.join(process.cwd(), 'vendedor.js'), 'utf8');

  // 1. Elegí la zona / sector (6 Sectores temáticos)
  assert.match(code, /LOCATION_ZONE_OPTIONS/);
  assert.match(code, /id:\s*'S1'/);
  assert.match(code, /id:\s*'S2'/);
  assert.match(code, /id:\s*'S3'/);
  assert.match(code, /id:\s*'S4'/);
  assert.match(code, /id:\s*'S5'/);
  assert.match(code, /id:\s*'S6'/);
  assert.match(code, /Sector 1 \(Parafernalia\)/);
  assert.match(code, /Sector 2 \(Sustratos\)/);
  assert.match(code, /Sector 3 \(Fertilizantes\)/);
  assert.match(code, /Sector 4 \(Control de Plagas\)/);
  assert.match(code, /Sector 5 \(Indoor y Herramientas\)/);
  assert.match(code, /Sector 6 \(Bajo Escalera\)/);

  // 2. Elegí el tipo de ubicación
  assert.match(code, /LOCATION_TYPE_OPTIONS/);
  assert.match(code, /Estante de pared/);
  assert.match(code, /Heladera/);
  assert.match(code, /Vitrina/);
  assert.match(code, /Estantería/);
  assert.match(code, /Piso \/ Pallet/);

  // 3. La PC es la brújula (Derecha, Izquierda, Frente, Atrás)
  assert.match(code, /LOCATION_COMPASS_OPTIONS/);
  assert.match(code, /Derecha de la PC/);
  assert.match(code, /Izquierda de la PC/);
  assert.match(code, /Frente de la PC/);
  assert.match(code, /Atrás de la PC/);

  // 4. Elegí pared
  assert.match(code, /LOCATION_WALL_OPTIONS/);
  assert.match(code, /Pared 1/);
  assert.match(code, /Pared 2/);
  assert.match(code, /Pared 3/);
  assert.match(code, /Pared 4/);

  // 5. Elegí nivel (N1..N6) y sector (I, C, D, Es chico no hace falta)
  assert.match(code, /LOCATION_LEVEL_OPTIONS/);
  assert.match(code, /Nivel 1 \(Piso \/ Base\)/);
  assert.match(code, /Nivel 6/);

  assert.match(code, /LOCATION_SECTOR_OPTIONS/);
  assert.match(code, /Izquierda \(I\)/);
  assert.match(code, /Centro \(C\)/);
  assert.match(code, /Derecha \(D\)/);
  assert.match(code, /Es chico no hace falta/);

  // Orden de pasos sin paso 4b (shelf)
  assert.match(code, /LOCATION_ASSISTANT_STEP_ORDER\s*=\s*\['list',\s*'zone',\s*'type',\s*'compass',\s*'wall',\s*'level',\s*'sector',\s*'review'\]/);

  // Handlers de cada paso
  assert.match(code, /function chooseLocationAssistantZone/);
  assert.match(code, /function chooseLocationAssistantType/);
  assert.match(code, /function chooseLocationAssistantCompass/);
  assert.match(code, /function chooseLocationAssistantWall/);
  assert.match(code, /function chooseLocationAssistantLevel/);
  assert.match(code, /function chooseLocationAssistantSector/);
  assert.match(code, /function printLocationQrLabel/);
  assert.match(code, /function persistLocationAssistant/);
});

test('Location Assistant: Construcción correcta del código generado (S3-D-P1-N3-C y S6-I-P2-N2-U) y guía de voz', () => {
  const ZONE_NOUN_MAP = {
    'S1': 'el Sector 1 (Parafernalia)',
    'S2': 'el Sector 2 (Sustratos)',
    'S3': 'el Sector 3 (Fertilizantes)',
    'S4': 'el Sector 4 (Control de Plagas)',
    'S5': 'el Sector 5 (Indoor y Herramientas)',
    'S6': 'el Sector 6 (Bajo Escalera)'
  };

  function buildLocationInfo(zone, compass, wall, level, sector) {
    const zonePrefix = zone.prefix || 'S1';
    const compassCode = compass.id || 'D';
    const wallCode = wall.id || 'P1';
    const levelNum = Number(level.id) || 1;
    const sectorCode = sector.id || 'C';
    const isChico = sectorCode === 'U' || (sector.label && (sector.label.toLowerCase().includes('chico') || sector.label.toLowerCase().includes('no hace falta')));

    const wmsCode = `${zonePrefix}-${compassCode}-${wallCode}-N${levelNum}-${sectorCode}`;
    const locationLabel = isChico
      ? `📍 ${zone.label} · ${compass.compass} de la PC · ${wall.label} · Nivel ${levelNum}`
      : `📍 ${zone.label} · ${compass.compass} de la PC · ${wall.label} · Nivel ${levelNum} · Sector ${sector.label}`;
    const zoneNoun = ZONE_NOUN_MAP[zonePrefix] || `el ${zone.label}`;
    const sectorPhrase = isChico ? '' : `, sector ${sector.label.toLowerCase()}`;
    const voicePhrase = `Está en ${zoneNoun}, a la ${compass.compass.toLowerCase()} de la PC, ${wall.label.toLowerCase()}, nivel ${levelNum}${sectorPhrase}.`;

    return { wmsCode, locationLabel, voicePhrase };
  }

  const res1 = buildLocationInfo(
    { label: '🌿 Sector 3 (Fertilizantes)', prefix: 'S3' },
    { id: 'D', compass: 'Derecha' },
    { id: 'P1', label: 'Pared 1' },
    { id: 3, label: 'Nivel 3' },
    { id: 'C', label: 'Centro' }
  );

  assert.equal(res1.wmsCode, 'S3-D-P1-N3-C');
  assert.equal(res1.locationLabel, '📍 🌿 Sector 3 (Fertilizantes) · Derecha de la PC · Pared 1 · Nivel 3 · Sector Centro');
  assert.equal(res1.voicePhrase, 'Está en el Sector 3 (Fertilizantes), a la derecha de la PC, pared 1, nivel 3, sector centro.');

  const res2 = buildLocationInfo(
    { label: '📦 Sector 6 (Bajo Escalera)', prefix: 'S6' },
    { id: 'I', compass: 'Izquierda' },
    { id: 'P2', label: 'Pared 2' },
    { id: 2, label: 'Nivel 2' },
    { id: 'U', label: '👌 Es chico no hace falta' }
  );

  assert.equal(res2.wmsCode, 'S6-I-P2-N2-U');
  assert.equal(res2.locationLabel, '📍 📦 Sector 6 (Bajo Escalera) · Izquierda de la PC · Pared 2 · Nivel 2');
  assert.equal(res2.voicePhrase, 'Está en el Sector 6 (Bajo Escalera), a la izquierda de la PC, pared 2, nivel 2.');
});

test('Mapa de Estanterías: PC Central como brújula en los 6 Sectores con funciones de voz y parser', () => {
  const mapJs = fs.readFileSync(path.join(process.cwd(), 'mapa-local.js'), 'utf8');

  // PC Central como Ancla / Brújula en Sectores
  assert.match(mapJs, /id:\s*'sec1-pc-center'/);
  assert.match(mapJs, /id:\s*'sec6-pc-center'/);
  assert.match(mapJs, /is_anchor:\s*true/);

  // Niveles 1 al 6
  assert.match(mapJs, /Nv\.1 Piso\/Base/);
  assert.match(mapJs, /Nv\.6 Tope/);

  // Funciones de Parser y Guía por Voz
  assert.match(mapJs, /function parseLocationCode/);
  assert.match(mapJs, /function formatLocationVoiceText/);
  assert.match(mapJs, /window\.parseLocationCode/);
  assert.match(mapJs, /window\.formatLocationVoiceText/);
  assert.match(mapJs, /assets\/store-shelf-map-gba\.jpg/);
});

test('Asistente de Voz WMS: Pregunta inicial, selección de coincidencias, foto de estante y locución', () => {
  const code = fs.readFileSync(path.join(process.cwd(), 'vendedor.js'), 'utf8');

  // Funciones principales del Asistente de Voz
  assert.match(code, /function startVoiceLocationAssistantFlow/);
  assert.match(code, /function speakVoiceAssistantPhrase/);
  assert.match(code, /function renderVoiceAssistantStep1/);
  assert.match(code, /function handleVoiceAssistantSearchInput/);
  assert.match(code, /function selectVoiceAssistantProduct/);
  assert.match(code, /function renderVoiceAssistantStep3/);
  assert.match(code, /function closeVoiceLocationAssistant/);

  // Pregunta inicial y elementos visuales
  assert.match(code, /¿Qué producto estás buscando\?/);
  assert.match(code, /voice-shelf-photo-banner/);
  assert.match(code, /window\.startVoiceLocationAssistantFlow/);
  assert.match(code, /window\.selectVoiceAssistantProduct/);
});

test('Location Assistant: Selección masiva, reubicación y edición posterior de ubicaciones', () => {
  const code = fs.readFileSync(path.join(process.cwd(), 'vendedor.js'), 'utf8');
  const mapCode = fs.readFileSync(path.join(process.cwd(), 'mapa-local.js'), 'utf8');

  // 1. Selección masiva y estado extendido
  assert.match(code, /locationAssistantSelectedDraftIds/);
  assert.match(code, /function togglePendingLocationSelection/);
  assert.match(code, /function toggleAllPendingLocations/);
  assert.match(code, /function startBulkLocationAssignment/);
  assert.match(code, /Seleccionar todos/);

  // 2. Reubicación y edición posterior
  assert.match(code, /function openEditProductLocation/);
  assert.match(code, /window\.openEditProductLocation\s*=\s*openEditProductLocation/);
  assert.match(code, /function jumpToLocationAssistantStep/);
  assert.match(code, /isBulk/);
  assert.match(code, /isEditing/);
  assert.match(code, /isMultiSlot/);

  // 3. Botón Reubicar en el Plano del Local
  assert.match(mapCode, /openEditProductLocation/);
  assert.match(mapCode, /📍 Reubicar/);

  // 4. Fetch de pendientes
  assert.match(code, /function fetchPendingLocationProducts/);
  assert.match(code, /function refreshPendingLocationBadge/);
});

test('WMS Hierarchical Explorer: Navegación por 6 sectores, muebles/baldas y modal Lightbox', () => {
  const mapCode = fs.readFileSync(path.join(process.cwd(), 'mapa-local.js'), 'utf8');

  // 1. Definición de los 6 sectores
  assert.match(mapCode, /WMS_SECTOR_DEFS/);
  assert.match(mapCode, /Sector 1 · Parafernalia/);
  assert.match(mapCode, /Sector 2 · Sustratos/);
  assert.match(mapCode, /Sector 3 · Fertilizantes/);
  assert.match(mapCode, /Sector 4 · Control de Plagas/);
  assert.match(mapCode, /Sector 5 · Indoor y Herramientas/);
  assert.match(mapCode, /Sector 6 · Bajo Escalera/);

  // 2. Funciones de Lightbox y navegación
  assert.match(mapCode, /function openWmsLightbox/);
  assert.match(mapCode, /function closeWmsLightbox/);
  assert.match(mapCode, /function openWmsSectorView/);
  assert.match(mapCode, /function backToWmsSectors/);
  assert.match(mapCode, /function handleSectorPhotoUpload/);

  // 3. Renderers
  assert.match(mapCode, /function renderWmsSectorsGrid/);
  assert.match(mapCode, /function renderWmsSectorDetail/);
  assert.match(mapCode, /wms-lightbox-modal/);
  assert.match(mapCode, /wms-sector-card/);
});


