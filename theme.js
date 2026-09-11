/* Published AppConfig is the single presentation source for every portal. */
(function () {
  'use strict';

  const root = document.documentElement;
  let refreshTask = null;
  let refreshTenant = null;
  let refreshGeneration = 0;
  let lastRefresh = 0;
  let presentationClient = null;

  function readMode() {
    try { return localStorage.getItem('boeweb_theme') === 'dark' ? 'dark' : 'light'; }
    catch (error) { return 'light'; }
  }

  function applyBrandIdentity(config) {
    if (!window.AppConfig) return;
    const tenantId = window.AppConfig.resolveTenantId();
    const current = window.AppConfig.get();
    const draft = current.tenantId === tenantId && current.status === 'draft' ? current : null;
    const candidate = config?.brand && config.tenantId === tenantId
      ? config : (draft || window.AppConfig.getPresentationConfig(tenantId));
    window.AppConfig.applyCssVariables(candidate);
  }

  function applyTheme(mode) {
    const currentConfig = window.AppConfig?.get();
    root.setAttribute('data-theme', mode === 'dark' ? 'dark' : 'light');
    applyBrandIdentity(currentConfig?.revision > 0 || currentConfig?.status === 'draft' ? currentConfig : null);
    document.querySelectorAll('.theme-toggle-btn').forEach(button => {
      button.textContent = mode === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Oscuro';
      button.title = mode === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro';
    });
  }

  function resolveConfigClient() {
    if (window.boeSupabaseClient || window.supabaseClient) return window.boeSupabaseClient || window.supabaseClient;
    // Older entry points expose a global lexical binding rather than a window property.
    try { if (typeof supabaseClient !== 'undefined' && supabaseClient?.from) return supabaseClient; }
    catch (error) { /* An entry-point declaration may still be in its temporal dead zone. */ }
    if (!presentationClient && window.supabase?.createClient) {
      presentationClient = window.supabase.createClient(
        'https://sxbhrgvizqylnfcqzhin.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4YmhyZ3ZpenF5bG5mY3F6aGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMjM1MzEsImV4cCI6MjA5Njg5OTUzMX0.UUOwXsHXKNCjlJKdxMUlAuCtNAnNWgAroBwMlWAdTag',
        { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
      );
    }
    return presentationClient;
  }

  async function refreshPublishedTheme(options = {}) {
    if (!window.AppConfig) return null;
    const tenantId = window.AppConfig.resolveTenantId();
    if (refreshTask && refreshTenant === tenantId) return refreshTask;
    if (!options.force && refreshTenant === tenantId && Date.now() - lastRefresh < 15000) {
      return window.AppConfig.getPresentationConfig(tenantId);
    }
    refreshTenant = tenantId;
    const generation = ++refreshGeneration;
    refreshTask = (async () => {
      try {
        const client = resolveConfigClient();
        const repository = window.AppConfig.createRepository({ tenantId, supabaseClient: client });
        const remote = await repository.loadPublished();
        if (generation !== refreshGeneration || tenantId !== window.AppConfig.resolveTenantId()) return null;
        // A slower read must not replace a newer publication received from another tab.
        const cached = window.AppConfig.getPresentationConfig(tenantId);
        const config = cached.revision > remote.revision ? cached : remote;
        const editingDraft = window.location.pathname.includes('admin-config') && window.AppConfig.get('status') === 'draft';
        if (!editingDraft) {
          applyBrandIdentity(config);
          window.boeStorefrontAppConfig = config;
          window.dispatchEvent(new CustomEvent('boeweb_app_config_loaded', { detail: config }));
        }
        lastRefresh = Date.now();
        return config;
      } catch (error) {
        console.warn('No se pudo actualizar la apariencia publicada.', error);
        return null;
      } finally {
        if (generation === refreshGeneration) refreshTask = null;
      }
    })();
    return refreshTask;
  }

  function initZenTheme() { applyTheme(readMode()); }

  function toggleTheme() {
    const mode = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('boeweb_theme', mode); }
    catch (error) { console.warn('La preferencia de modo se conservará solo en esta página.', error); }
    applyTheme(mode);
  }

  if (!document.querySelector('link[data-brand-theme-styles]')) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = 'theme.css?v=canonical_theme_v1';
    stylesheet.setAttribute('data-brand-theme-styles', '');
    document.head.appendChild(stylesheet);
  }
  initZenTheme();
  document.addEventListener('DOMContentLoaded', () => {
    applyBrandIdentity();
    // Allow the page's own client initialization to finish before selecting the reader.
    setTimeout(() => { void refreshPublishedTheme({ force: true }); }, 0);
  });
  window.addEventListener('load', () => { applyBrandIdentity(); });
  window.addEventListener('focus', () => { void refreshPublishedTheme(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshPublishedTheme();
  });
  window.addEventListener('storage', event => {
    if (!window.AppConfig) return;
    if (event.key === 'boeweb_theme') { initZenTheme(); return; }
    const key = window.AppConfig.createStorageKey(window.AppConfig.resolveTenantId(), 'published');
    if (event.key !== key) return;
    try {
      const config = event.newValue ? JSON.parse(event.newValue) : null;
      if (config?.tenantId !== window.AppConfig.resolveTenantId() || config.status !== 'published') return;
      if (config.revision < window.AppConfig.get('revision', 0)) return;
      applyBrandIdentity(config);
      window.boeStorefrontAppConfig = config;
      window.dispatchEvent(new CustomEvent('boeweb_app_config_loaded', { detail: config }));
    } catch (error) { console.warn('Se ignoró una notificación de tema inválida.', error); }
  });
  window.addEventListener('boeweb_brand_updated', event => { applyBrandIdentity(event.detail); });

  window.initZenTheme = initZenTheme;
  window.toggleTheme = toggleTheme;
  window.applyBrandIdentity = applyBrandIdentity;
  window.refreshPublishedTheme = refreshPublishedTheme;
})();
