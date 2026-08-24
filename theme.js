/* ==========================================================================
   BÔ GrowClub / SaaS Platform — Universal White-Label & Theme Engine
   ========================================================================== */

(function () {
  function getBrandProfile() {
    try {
      const custom = localStorage.getItem('boeweb_tenant_profile_published');
      if (custom) {
        const parsed = JSON.parse(custom);
        if (parsed && (parsed.brand_name || parsed.primary_color)) {
          return parsed;
        }
      }
    } catch (_) {}

    try {
      if (typeof TENANT_PROFILES_CACHE !== 'undefined' && TENANT_PROFILES_CACHE['11111111-1111-1111-1111-111111111111']) {
        return TENANT_PROFILES_CACHE['11111111-1111-1111-1111-111111111111'];
      }
    } catch (_) {}

    return null;
  }

  function applyBrandIdentity() {
    const brand = getBrandProfile();
    if (!brand) return;

    const root = document.documentElement;

    // 1. Inyectar variables de color de marca (degradados y tonos derivados)
    if (brand.primary_color) {
      root.style.setProperty('--color-primary', brand.primary_color);
      root.style.setProperty('--color-brand-primary', brand.primary_color);
      root.style.setProperty('--vendor-forest', brand.primary_color);
      root.style.setProperty('--vendor-forest-soft', `${brand.primary_color}ee`);
      root.style.setProperty('--vendor-leaf', brand.accent_color || `${brand.primary_color}bb`);
      root.style.setProperty('--color-border-accent', brand.primary_color);
      root.style.setProperty('--color-primary-light', `${brand.primary_color}dd`);
      root.style.setProperty('--cash-forest', brand.primary_color);
      root.style.setProperty('--cash-ink', brand.primary_color);
      root.style.setProperty('--tv-accent-green', brand.primary_color);
    }
    if (brand.accent_color) {
      root.style.setProperty('--color-accent-gold', brand.accent_color);
      root.style.setProperty('--color-brand-accent', brand.accent_color);
      root.style.setProperty('--vendor-gold', brand.accent_color);
      root.style.setProperty('--vendor-gold-soft', `${brand.accent_color}cc`);
      root.style.setProperty('--cash-gold', brand.accent_color);
      root.style.setProperty('--tv-accent-gold', brand.accent_color);
      root.style.setProperty('--shadow-gold', `0 0 14px ${brand.accent_color}66`);
    }
    if (brand.text_color) {
      root.style.setProperty('--color-text-main', brand.text_color);
      root.style.setProperty('--vendor-ink', brand.text_color);
      root.style.setProperty('--cash-ink', brand.text_color);
      root.style.setProperty('--color-neutral-dark', brand.text_color);
    }
    if (brand.action_color) {
      root.style.setProperty('--color-success', brand.action_color);
      root.style.setProperty('--vendor-leaf', brand.action_color);
    }

    // 1.1 Inyectar tipografías configuradas
    if (brand.font_family) {
      root.style.setProperty('--font-sans', brand.font_family);
      if (document.body) {
        document.body.style.fontFamily = brand.font_family;
      }
    }
    if (brand.font_headings) {
      root.style.setProperty('--font-serif', brand.font_headings);
      root.style.setProperty('--font-display', brand.font_headings);
    }

    // 2. Actualizar textos de marca en todos los portales y dispositivos
    if (brand.brand_name) {
      // Header brand title & logos
      document.querySelectorAll('.brand-title, .saas-brand-name-display, #header-brand-name, .b2b-logo-text h1, #saas-active-tenant-name, .tablet-header h2, .tv-header h1').forEach(el => {
        el.textContent = brand.brand_name;
      });

      // Vendor eyebrows and sidebar versions
      document.querySelectorAll('.vendor-home-eyebrow').forEach(el => {
        el.textContent = `Centro operativo · ${brand.brand_name}`;
      });
      document.querySelectorAll('.vendor-sidebar-version').forEach(el => {
        el.textContent = `${brand.brand_name} · Centro operativo`;
      });
      document.querySelectorAll('.vendor-login-brand').forEach(el => {
        el.textContent = brand.brand_name;
      });

      // Footer logo text
      document.querySelectorAll('.footer-logo span, .footer-brand-info h3').forEach(el => {
        el.textContent = brand.brand_name;
      });

      // Footer description
      document.querySelectorAll('.footer-brand-desc').forEach(el => {
        el.textContent = `${brand.brand_name} — ${brand.slogan || 'Estudio Comercial & Catálogo Exclusivo'}. ${brand.address ? `Visitanos en ${brand.address}.` : ''}`;
      });

      // Hero service text
      document.querySelectorAll('.hero-service-brand span').forEach(el => {
        el.textContent = `Tu tienda ${brand.brand_name}`;
      });

      // Document title si no estamos en admin-config
      if (!window.location.pathname.includes('admin-config')) {
        document.title = `${brand.brand_name} · ${brand.slogan || 'Tienda Oficial'}`;
      }
    }

    // Subtítulo / Eslogan
    if (brand.slogan !== undefined) {
      document.querySelectorAll('.brand-subtitle').forEach(el => {
        if (brand.slogan) {
          el.textContent = brand.slogan;
          el.style.display = '';
        } else {
          el.textContent = '';
          el.style.display = 'none';
        }
      });

      document.querySelectorAll('.hero-eyebrow').forEach(el => {
        if (brand.slogan) {
          el.textContent = `${brand.slogan} ${brand.address ? `· ${brand.address}` : ''}`;
        }
      });

      document.querySelectorAll('.hero-service-brand strong').forEach(el => {
        if (brand.slogan) el.textContent = brand.slogan;
      });
    }

    // 3. Actualizar logos de marca
    if (brand.logo_url) {
      document.querySelectorAll('img.brand-logo, img.main-brand-logo, #brand-logo-img, .footer-logo-img, .hero-service-brand img, .b2b-logo-img, .tablet-logo img, .tv-header img').forEach(el => {
        el.src = brand.logo_url;
        if (brand.brand_name) el.alt = brand.brand_name;
      });
    }

    // 4. Actualizar favicon si está definido
    if (brand.favicon_url || brand.logo_url) {
      const favUrl = brand.favicon_url || brand.logo_url;
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = favUrl;
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

    // 6. Actualizar enlaces de contacto (WhatsApp, Instagram, Dirección)
    if (brand.whatsapp_phone) {
      const cleanPhone = String(brand.whatsapp_phone).replace(/\D/g, '');
      if (cleanPhone) {
        document.querySelectorAll('a[href*="wa.me"], a.whatsapp-float-btn').forEach(el => {
          el.href = `https://wa.me/${cleanPhone}?text=Hola!%20Quiero%20hacer%20una%20consulta%20en%20${encodeURIComponent(brand.brand_name || 'la tienda')}`;
        });
        document.querySelectorAll('.footer-contact-info a[href*="wa.me"]').forEach(el => {
          el.textContent = brand.whatsapp_phone;
        });
      }
    }

    if (brand.instagram_url) {
      document.querySelectorAll('.footer-contact-info a[href*="instagram"]').forEach(el => {
        const cleanHandle = brand.instagram_url.startsWith('@') ? brand.instagram_url.slice(1) : brand.instagram_url.replace(/https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
        el.href = `https://www.instagram.com/${cleanHandle}/`;
        el.textContent = brand.instagram_url.startsWith('@') ? brand.instagram_url : `@${cleanHandle}`;
      });
    }

    if (brand.address) {
      document.querySelectorAll('.footer-contact-info a[href*="google.com/search"]').forEach(el => {
        el.textContent = brand.address;
        el.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(brand.address)}`;
      });
    }

    // 7. Ocultar enlaces o módulos de BÔ Coffee si existen en el DOM
    document.querySelectorAll('a[href*="coffee.html"], .vendor-flow-card[href*="coffee"], [data-feature="coffee"]').forEach(el => {
      el.style.display = 'none';
    });
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

  // Re-run on document lifecycle stages
  document.addEventListener('DOMContentLoaded', initZenTheme);
  window.addEventListener('load', applyBrandIdentity);

  // Synchronize across tabs or on live update events
  window.addEventListener('storage', function (e) {
    if (e.key && (e.key === 'boeweb_tenant_profile_published' || e.key === 'boeweb_theme')) {
      initZenTheme();
    }
  });

  window.addEventListener('boeweb_brand_updated', function () {
    applyBrandIdentity();
  });

  window.initZenTheme = initZenTheme;
  window.toggleTheme = toggleTheme;
  window.applyBrandIdentity = applyBrandIdentity;
})();
