import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorHtml = fs.readFileSync(path.join(rootDir, 'vendedor.html'), 'utf8');
const vendorJs = fs.readFileSync(path.join(rootDir, 'vendedor.js'), 'utf8');

test('Caja abre directamente la planilla operativa sin invocar un asistente inexistente', () => {
  assert.match(vendorHtml, /id="cash-classic-dashboard"/);
  assert.match(vendorHtml, /Caja y arqueo operativo/);
  assert.doesNotMatch(vendorHtml, /switchCashWorkspaceMode|toggleMobileCashVoiceAssistant|goBackMobileCashAssistant/);

  const cashBranch = vendorJs.match(/else if \(tab === 'cash'\) \{[\s\S]*?\n  \} else if \(tab === 'map'/)?.[0] || '';
  assert.match(cashBranch, /cash-classic-dashboard/);
  assert.match(cashBranch, /cashDashboard\.style\.display = 'grid'/);
  assert.doesNotMatch(cashBranch, /switchCashWorkspaceMode/);
});

test('Caja consulta únicamente columnas existentes de cash_sessions_v2', () => {
  const sessionQuery = vendorJs.match(/\.from\('cash_sessions_v2'\)[\s\S]*?\.maybeSingle\(\)/)?.[0] || '';
  assert.match(sessionQuery, /closed_at,version/);
  assert.doesNotMatch(sessionQuery, /updated_at/);
  assert.match(vendorJs, /updatedAt: session\.closed_at \|\| session\.opened_at/);
});
