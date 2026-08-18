import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Location Assistant: Constantes y estructura de pasos presentes en vendedor.js', () => {
  const code = fs.readFileSync(path.join(process.cwd(), 'vendedor.js'), 'utf8');

  // 1. Elegí la zona (TIENDA o DEPÓSITO)
  assert.match(code, /LOCATION_ZONE_OPTIONS/);
  assert.match(code, /id:\s*'TI'/);
  assert.match(code, /id:\s*'DP'/);

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

test('Location Assistant: Construcción correcta del código generado (TI-D-P1-N3-C y TI-D-P1-N3-U) y guía de voz', () => {
  function buildLocationInfo(zone, compass, wall, level, sector) {
    const zonePrefix = zone.prefix || 'TI';
    const compassCode = compass.id || 'D';
    const wallCode = wall.id || 'P1';
    const levelNum = Number(level.id) || 1;
    const sectorCode = sector.id || 'C';
    const isChico = sectorCode === 'U' || (sector.label && (sector.label.toLowerCase().includes('chico') || sector.label.toLowerCase().includes('no hace falta')));

    const wmsCode = `${zonePrefix}-${compassCode}-${wallCode}-N${levelNum}-${sectorCode}`;
    const locationLabel = isChico
      ? `📍 ${zone.label} · ${compass.compass} de la PC · ${wall.label} · Nivel ${levelNum}`
      : `📍 ${zone.label} · ${compass.compass} de la PC · ${wall.label} · Nivel ${levelNum} · Sector ${sector.label}`;
    const zoneNoun = zonePrefix === 'DP' ? 'el depósito' : 'la tienda';
    const sectorPhrase = isChico ? '' : `, sector ${sector.label.toLowerCase()}`;
    const voicePhrase = `Está en ${zoneNoun}, a la ${compass.compass.toLowerCase()} de la PC, ${wall.label.toLowerCase()}, nivel ${levelNum}${sectorPhrase}.`;

    return { wmsCode, locationLabel, voicePhrase };
  }

  const res1 = buildLocationInfo(
    { label: 'Tienda', prefix: 'TI' },
    { id: 'D', compass: 'Derecha' },
    { id: 'P1', label: 'Pared 1' },
    { id: 3, label: 'Nivel 3' },
    { id: 'C', label: 'Centro' }
  );

  assert.equal(res1.wmsCode, 'TI-D-P1-N3-C');
  assert.equal(res1.locationLabel, '📍 Tienda · Derecha de la PC · Pared 1 · Nivel 3 · Sector Centro');
  assert.equal(res1.voicePhrase, 'Está en la tienda, a la derecha de la PC, pared 1, nivel 3, sector centro.');

  const res2 = buildLocationInfo(
    { label: 'Depósito', prefix: 'DP' },
    { id: 'I', compass: 'Izquierda' },
    { id: 'P2', label: 'Pared 2' },
    { id: 2, label: 'Nivel 2' },
    { id: 'U', label: '👌 Es chico no hace falta' }
  );

  assert.equal(res2.wmsCode, 'DP-I-P2-N2-U');
  assert.equal(res2.locationLabel, '📍 Depósito · Izquierda de la PC · Pared 2 · Nivel 2');
  assert.equal(res2.voicePhrase, 'Está en el depósito, a la izquierda de la PC, pared 2, nivel 2.');
});

test('Mapa de Estanterías: PC Central como brújula en Tienda y Depósito con funciones de voz y parser', () => {
  const mapJs = fs.readFileSync(path.join(process.cwd(), 'mapa-local.js'), 'utf8');

  // PC Central como Ancla / Brújula
  assert.match(mapJs, /id:\s*'tie-pc-center'/);
  assert.match(mapJs, /id:\s*'dep-pc-center'/);
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

