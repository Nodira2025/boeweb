// Initialize Supabase Client
const SUPABASE_URL = 'https://sxbhrgvizqylnfcqzhin.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4YmhyZ3ZpenF5bG5mY3F6aGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMjM1MzEsImV4cCI6MjA5Njg5OTUzMX0.UUOwXsHXKNCjlJKdxMUlAuCtNAnNWgAroBwMlWAdTag';

let supabaseClient = null;
if (window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Config State
let currentPasscode = localStorage.getItem('boeweb_admin_passcode') || 'boeweb2026';

function checkAdminPasscode() {
  const inputPass = document.getElementById('admin-passcode-input').value.trim();
  const errorMsg = document.getElementById('admin-login-error');

  if (inputPass === currentPasscode) {
    document.getElementById('admin-login-modal').style.display = 'none';
    document.getElementById('admin-dashboard-content').style.display = 'block';
    loadAdminConfig();
  } else {
    errorMsg.style.display = 'block';
  }
}

async function loadAdminConfig() {
  let config = JSON.parse(localStorage.getItem('boeweb_payment_config')) || {};

  // Try fetching config from Supabase store_config if available
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('store_config').select('*').eq('id', 'main_config').single();
      if (!error && data) {
        config = data.config_json || config;
      }
    } catch (e) {
      console.warn('Using local config fallback:', e);
    }
  }

  // Populate UI inputs
  document.getElementById('mp-active-toggle').checked = config.mpActive !== false;
  document.getElementById('mp-access-token').value = config.mpAccessToken || '';
  document.getElementById('mp-public-key').value = config.mpPublicKey || '';

  document.getElementById('bank-active-toggle').checked = config.bankActive !== false;
  document.getElementById('bank-name').value = config.bankName || 'Banco Galicia';
  document.getElementById('bank-holder').value = config.bankHolder || 'BO GROWCLUB S.A.';
  document.getElementById('bank-cbu').value = config.bankCbu || '0000003100012345678901';
  document.getElementById('bank-alias').value = config.bankAlias || 'BO.GROWCLUB.MP';
}

async function saveAdminConfig() {
  const newPasscode = document.getElementById('admin-new-passcode').value.trim();
  if (newPasscode !== '') {
    currentPasscode = newPasscode;
    localStorage.setItem('boeweb_admin_passcode', newPasscode);
  }

  const config = {
    mpActive: document.getElementById('mp-active-toggle').checked,
    mpAccessToken: document.getElementById('mp-access-token').value.trim(),
    mpPublicKey: document.getElementById('mp-public-key').value.trim(),

    bankActive: document.getElementById('bank-active-toggle').checked,
    bankName: document.getElementById('bank-name').value.trim(),
    bankHolder: document.getElementById('bank-holder').value.trim(),
    bankCbu: document.getElementById('bank-cbu').value.trim(),
    bankAlias: document.getElementById('bank-alias').value.trim(),

    updatedAt: new Date().toISOString()
  };

  // Save to LocalStorage
  localStorage.setItem('boeweb_payment_config', JSON.stringify(config));

  // Save to Supabase store_config if available
  if (supabaseClient) {
    try {
      await supabaseClient.from('store_config').upsert({
        id: 'main_config',
        config_json: config,
        updated_at: new Date().toISOString()
      });
    } catch (e) {
      console.warn('Could not sync to Supabase store_config table:', e);
    }
  }

  const saveMsg = document.getElementById('admin-save-msg');
  saveMsg.style.display = 'block';
  setTimeout(() => { saveMsg.style.display = 'none'; }, 3500);
}

async function testCurrentMpToken() {
  const tokenInput = document.getElementById('mp-access-token');
  const statusEl = document.getElementById('mp-test-status');
  if (!tokenInput || !statusEl) return;

  const token = tokenInput.value.trim();
  if (!token) {
    statusEl.style.display = 'block';
    statusEl.style.color = '#ff6b6b';
    statusEl.textContent = '⚠️ Por favor pegá el Access Token antes de probar.';
    return;
  }

  statusEl.style.display = 'block';
  statusEl.style.color = 'var(--color-accent-gold)';
  statusEl.textContent = '⏳ Conectando con Mercado Pago...';

  if (typeof window.testMercadoPagoCredentials !== 'function') {
    statusEl.style.color = '#ff6b6b';
    statusEl.textContent = '⚠️ Módulo de checkout no cargado.';
    return;
  }

  const res = await window.testMercadoPagoCredentials(token);
  if (res.ok) {
    statusEl.style.color = '#25D366';
    statusEl.textContent = '✅ ¡Conexión exitosa! El Access Token es válido y está listo para recibir pagos.';
  } else {
    statusEl.style.color = '#ff6b6b';
    statusEl.textContent = `❌ Error en Mercado Pago: ${res.error || 'Token inválido o no autorizado'}`;
  }
}

// Global Exposure
window.checkAdminPasscode = checkAdminPasscode;
window.saveAdminConfig = saveAdminConfig;
window.testCurrentMpToken = testCurrentMpToken;

