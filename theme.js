/* ==========================================================================
   BÔ GrowClub Zen Theme Engine (Modo Claro / Modo Oscuro)
   ========================================================================== */

(function () {
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
  }

  function initZenTheme() {
    const savedTheme = localStorage.getItem('boeweb_theme') || 'light';
    applyTheme(savedTheme);
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
})();
