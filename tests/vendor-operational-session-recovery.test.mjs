import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const vendorSource = fs.readFileSync('vendedor.js', 'utf8');
const vendorHtml = fs.readFileSync('vendedor.html', 'utf8');

test('Portal vendedor: los flujos críticos recuperan la sesión antes de operar', () => {
  assert.match(vendorSource, /async function ensureVendorOperationalSession/);
  assert.match(vendorSource, /async function submitProductDraft[\s\S]*?await ensureVendorOperationalSession\(\{ showLogin: true \}\)/);
  assert.match(vendorSource, /async function persistLocationAssistant[\s\S]*?await ensureVendorOperationalSession\(\{ showLogin: true \}\)/);
  assert.match(vendorSource, /async function initPosWorkspace[\s\S]*?await ensureVendorOperationalSession\(\{ showLogin: true \}\)/);
  assert.match(vendorSource, /async function submitPosSaleDraft[\s\S]*?await ensureVendorOperationalSession\(\{ showLogin: true \}\)/);
});

test('Portal vendedor: una sesión ausente vuelve al acceso seguro y ofrece reconexión', () => {
  assert.match(vendorSource, /Tu sesión venció o todavía no fue verificada/);
  assert.match(vendorSource, /onclick="reconnectVendorSession\(\)"/);
  assert.doesNotMatch(vendorSource, /SaasAuth\.loginAsUser\(name, email, role, tenantId\)/);
});

test('Portal vendedor: el cachebuster fuerza a descartar el código de sesión anterior', () => {
  assert.match(vendorHtml, /saas-auth\.js\?v=session_recovery_v3/);
  assert.match(vendorHtml, /operational-api\.js\?v=session_recovery_v3/);
  assert.match(vendorHtml, /vendedor\.js\?v=cash_workspace_v5/);
});
