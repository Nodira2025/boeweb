/* ==========================================================================
   BÔ GrowClub / SaaS Platform — Universal White-Label & Theme Engine
   ========================================================================== */

(function () {
  function getBrandProfile() {
    try {
      const custom = localStorage.getItem('boeweb_tenant_profile_published');
      if (custom) return JSON.parse(custom);
    } catch (_) {}
    return null;
  }

  function applyBrandIdentity() {
    const brand = getBrandProfile();
    if (!brand) return;

    const root = document.documentElement;

    // 1. Inyectar variables de color de marca
    if (brand.primary_color) {
      root.style.setProperty('--color-primary', brand.primary_color);
      root.style.setProperty('--color-brand-primary', brand.primary_color);
      root.style.setProperty('--vendor-forest', brand.primary_color);
      root.style.setProperty('--color-border-accent', brand.primary_color);
    }
    if (brand.accent_color) {
      root.style.setProperty('--color-accent-gold', brand.accent_color);
      root.style.setProperty('--color-brand-accent', brand.accent_color);
      root.style.setProperty('--vendor-gold', brand.accent_color);
      root.style.setProperty('--shadow-gold', `0 0 14px ${brand.accent_color}66`);
    }

    // 2. Actualizar textos de marca
    if (brand.brand_name) {
      document.querySelectorAll('.brand-title, .saas-brand-name-display').forEach(el => {
        el.textContent = brand.brand_name;
      });
      if (!window.location.pathname.includes('admin-config')) {
        const parts = document.title.split(' - ');
        if (parts.length > 1) {
          document.title = `${brand.brand_name} - ${parts[1]}`;
        }
      }
    }

    if (brand.slogan) {
      document.querySelectorAll('.brand-subtitle, .hero-tagline, .footer-zen-quote').forEach(el => {
        el.textContent = brand.slogan;
      });
    }

    // 3. Actualizar logos de marca
    if (brand.logo_url) {
      document.querySelectorAll('img.brand-logo, img.main-brand-logo, #header-logo-img').forEach(el => {
        el.src = brand.logo_url;
      });
    }

    // 4. Actualizar favicon si está definido
    if (brand.favicon_url) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = brand.favicon_url;
    }

    // 5. Actualizar terminología
    if (brand.terminology) {
      if (brand.terminology.product) {
        document.querySelectorAll('.saas-term-product').forEach(el => { el.textContent = brand.terminology.product; });
      }
      if (brand.terminology.vendor) {
        document.querySelectorAll('.saas-term-vendor').forEach(el => { el.textContent = brand.terminology.vendor; });
      }
      if (brand.terminology.warehouse) {
        document.querySelectorAll('.saas-term-warehouse').forEach(el => { el.textContent = brand.terminology.warehouse; });
      }
    }

    // 6. Actualizar enlaces de contacto (WhatsApp)
    if (brand.whatsapp_phone) {
      const cleanPhone = String(brand.whatsapp_phone).replace(/\D/g, '');
      document.querySelectorAll('a[href*="wa.me"], a.whatsapp-float-btn').forEach(el => {
        el.href = `https://wa.me/${cleanPhone}?text=Hola!%20Quiero%20hacer%20una%20consulta`;
      });
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btns = document.querySelectorAll('.theme-toggle-btn');
    btns.forEach(function (btn) {
      if (theme === 'dark') {
        btn.innerHTML = '☀️ Modo Claro';
        btn.title = 'Cambiar a Modo Claro';
        btn.style.borderColor = 'var(--color-accent-gold)';
        btn.style.color = 'var(--color-accent-gold)';
      } else {
        btn.innerHTML = '🌙 Modo Oscuro';
        btn.title = 'Cambiar a Modo Oscuro';
        btn.style.borderColor = 'var(--color-primary)';
        btn.style.color = 'var(--color-primary)';
      }
    });
    applyBrandIdentity();
  }

  function initZenTheme() {
    const savedTheme = localStorage.getItem('boeweb_theme') || 'light';
    applyTheme(savedTheme);
    applyBrandIdentity();
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('boeweb_theme', newTheme);
    applyTheme(newTheme);
    if (window.showToast) {
      window.showToast(newTheme === 'dark' ? '🌙 Modo Oscuro Activado' : '☀️ Modo Claro Activado');
    }
  }

  // Execute immediately to prevent flash
  initZenTheme();

  document.addEventListener('DOMContentLoaded', initZenTheme);

  window.initZenTheme = initZenTheme;
  window.toggleTheme = toggleTheme;
  window.applyBrandIdentity = applyBrandIdentity;
})();
