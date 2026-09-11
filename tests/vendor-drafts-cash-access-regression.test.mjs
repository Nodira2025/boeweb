import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const vendorSource = fs.readFileSync(path.resolve('vendedor.js'), 'utf8');

function extractFunctionSource(name) {
  const declaration = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const match = declaration.exec(vendorSource);
  assert.ok(match, `No se encontró la función ${name}`);

  const nextDeclaration = /\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
  nextDeclaration.lastIndex = match.index + match[0].length;
  const nextMatch = nextDeclaration.exec(vendorSource);
  return vendorSource.slice(match.index, nextMatch?.index ?? vendorSource.length);
}

test('el contador de borradores valida la sesión operativa antes de consultar la tabla privada', () => {
  const functionSource = extractFunctionSource('refreshPendingDraftsBadgeOnce');
  const sessionGuardIndex = functionSource.indexOf('await ensureVendorOperationalSession(');
  const draftsQueryIndex = functionSource.search(/\.from\(\s*['"]catalog_product_drafts_v2['"]\s*\)/);

  assert.notEqual(sessionGuardIndex, -1, 'refreshPendingDraftsBadge debe esperar ensureVendorOperationalSession');
  assert.notEqual(draftsQueryIndex, -1, 'refreshPendingDraftsBadge debe conservar la consulta de borradores');
  assert.ok(
    sessionGuardIndex < draftsQueryIndex,
    'la sesión operativa debe validarse antes de construir la consulta de borradores'
  );
  assert.doesNotMatch(
    functionSource,
    /SaasAuth\.getTenantContext\(\)/,
    'el contexto cacheado no reemplaza la validación de la sesión para esta lectura privada'
  );
});

test('el resumen de caja restringe a cada vendedor por opened_by', () => {
  const functionSource = extractFunctionSource('refreshCanonicalCashSection');
  assert.match(functionSource, /if\s*\(!canInspectTeamCashSessions\(context\)\)/);
  assert.match(functionSource, /\.eq\(\s*['"]opened_by['"]\s*,\s*context\.userId\s*\)/);
});

test('Caja carga los registros en orden y no ofrece turnos ajenos a vendedores', () => {
  const workspaceSource = extractFunctionSource('refreshCashWorkspace');
  assert.match(workspaceSource, /return\s+await\s+refreshCanonicalCashSection\(\)\s*;/);
  const summarySource = extractFunctionSource('refreshCanonicalCashSection');
  assert.match(summarySource, /await\s+loadPosRegisters\(\)\s*;/);
  assert.ok(summarySource.indexOf('await loadPosRegisters()') < summarySource.indexOf(".from('cash_sessions_v2')"));

  const switchSource = extractFunctionSource('switchVendorTab');
  assert.match(switchSource, /tab\s*===\s*['"]cash['"][\s\S]*?refreshCashWorkspace\(\)/);

  const registersSource = extractFunctionSource('loadPosRegisters');
  assert.match(registersSource, /occupiedByOther[\s\S]*?disabled/);
  assert.match(registersSource, /registers\.find\(isOwnSession\)/);
  assert.doesNotMatch(
    registersSource,
    /\|\|\s*registers\.find\(register\s*=>\s*register\.session\)\s*\|\|\s*registers\[0\]/,
    'un vendedor no debe caer automáticamente en cualquier sesión abierta'
  );
});
