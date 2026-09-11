/**
 * Hero Slider Engine - BÔ SaaS White-Label Storefront
 * Supports image and video slides (muted by default, autoplay, loop, playsinline),
 * per-slide duration, touch swipe, indicator dots, manual controls, and CTA links.
 */
(function() {
  'use strict';

  let currentSlideIndex = 0;
  let slideTimer = null;
  let isPaused = false;
  let touchStartX = 0;
  let touchEndX = 0;

  function escapeHeroHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function mapCanonicalHero(config) {
    const normalized = window.AppConfig?.normalizeConfig(config);
    if (!normalized) return null;
    const hero = normalized.brand.hero;
    const visuals = normalized.brand.visuals;
    const texts = normalized.brand.texts;
    return {
      isActive: normalized.brand.content.homeEnabled && hero.enabled && hero.slides.length > 0,
      slides: hero.slides.map(slide => ({
        id: slide.id,
        type: slide.type,
        media_url: slide.mediaUrl,
        title: slide.title,
        subtitle: slide.subtitle,
        target_url: slide.targetUrl,
        cta_text: slide.ctaText,
        duration_seconds: slide.durationSeconds,
        overlay_enabled: slide.overlayEnabled
      })),
      brand: {
        brand_name: texts.name,
        slogan: texts.slogan,
        primary_color: visuals.primaryColor,
        accent_color: visuals.accentColor
      }
    };
  }

  function getHeroConfig() {
    if (!window.AppConfig) return { isActive: false, slides: [], brand: null };
    // The shared confirmed publication also includes changes received after the page first loaded.
    return mapCanonicalHero(window.AppConfig.getPresentationConfig());
  }

  function initHeroSlider() {
    if (slideTimer) clearTimeout(slideTimer);
    slideTimer = null;
    isPaused = false;
    const heroSection = document.getElementById('home');
    if (!heroSection) return;

    const { isActive, slides, brand } = getHeroConfig();

    // The textual introduction and multimedia are independent, configurable parts of the portada.
    if (!isActive || slides.length === 0) {
      const defaultContainer = heroSection.querySelector('.hero-container');
      if (defaultContainer) defaultContainer.classList.remove('hero-has-media');
      const existingSlider = heroSection.querySelector('.hero-slider-wrapper');
      if (existingSlider) existingSlider.remove();
      return;
    }

    // Keep the published introductory copy visible alongside the banner.
    const defaultContainer = heroSection.querySelector('.hero-container');
    if (defaultContainer) defaultContainer.classList.add('hero-has-media');

    let sliderWrapper = heroSection.querySelector('.hero-slider-wrapper');
    if (!sliderWrapper) {
      sliderWrapper = document.createElement('div');
      sliderWrapper.className = 'hero-slider-wrapper';
      sliderWrapper.id = 'hero-slider-wrapper';
      heroSection.appendChild(sliderWrapper);
    }

    renderSliderDOM(sliderWrapper, slides, brand);
    setupSliderEvents(sliderWrapper, slides);
    goToSlide(0, slides);
  }

  function renderSliderDOM(wrapper, slides, brand) {
    const accentColor = brand?.accent_color || 'var(--color-accent-gold, #C2A246)';

    wrapper.innerHTML = `
      <div class="hero-slider-track" id="hero-slider-track">
        ${slides.map((slide, idx) => {
          const media = window.AppConfig.getHeroMedia(slide);
          const isVideo = media.kind === 'video';
          const isYoutube = media.kind === 'youtube';
          const targetUrl = escapeHeroHtml(slide.target_url || '#catalog-section');
          const ctaText = escapeHeroHtml(slide.cta_text || 'Ver');
          const title = escapeHeroHtml(slide.title || brand?.brand_name || 'Promoción Especial');
          const subtitle = escapeHeroHtml(slide.subtitle || brand?.slogan || '');
          const mediaUrl = escapeHeroHtml(slide.media_url || 'assets/hero-banner1.jpg');

          return `
            <div class="hero-slide-item ${idx === 0 ? 'active' : ''} ${isYoutube ? 'is-youtube' : ''} ${slide.overlay_enabled === false ? 'without-overlay' : ''}" data-index="${idx}" data-duration="${slide.duration_seconds || 5}" aria-hidden="${idx !== 0}">
              <div class="hero-slide-media-container">
                ${isYoutube ? `<iframe class="hero-slide-youtube" data-src="${escapeHeroHtml(media.src)}" title="${title} — YouTube" referrerpolicy="strict-origin-when-cross-origin" allow="fullscreen; picture-in-picture" allowfullscreen></iframe>` : isVideo ? `
                  <video class="hero-slide-video" src="${mediaUrl}" muted loop playsinline preload="metadata"></video>
                ` : media.kind === 'image' ? `
                  <img class="hero-slide-image" src="${mediaUrl}" alt="${title}">
                ` : '<p class="hero-media-unavailable">Este recurso no está disponible. Consultá las novedades con la tienda.</p>'}
              </div>
              <div class="hero-slide-overlay">
                <div class="hero-slide-content">
                  <span class="hero-slide-badge">${escapeHeroHtml(brand?.brand_name || 'Destacado')}</span>
                  <h2 class="hero-slide-title">${title}</h2>
                  ${subtitle ? `<p class="hero-slide-subtitle">${subtitle}</p>` : ''}
                  <div class="hero-slide-actions">
                    <a href="${targetUrl}" class="hero-slide-cta-btn" style="background: ${accentColor}; color: ${window.AppConfig.getReadableForeground(accentColor)};">
                      ${ctaText}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                    </a>
                    ${isYoutube ? `<a class="hero-video-fallback" href="${escapeHeroHtml(media.watchUrl)}" target="_blank" rel="noopener">Ver en YouTube</a>` : ''}
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Navigation Arrows (if more than 1 slide) -->
      ${slides.length > 1 ? `
      <div class="hero-slider-controls" aria-label="Controles de banners">
        <button type="button" class="hero-slider-pause" aria-pressed="false">Pausar rotación</button>
        <button type="button" class="hero-slider-arrow hero-slider-prev" id="hero-slider-prev-btn" aria-label="Slide anterior">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <button type="button" class="hero-slider-arrow hero-slider-next" id="hero-slider-next-btn" aria-label="Siguiente slide">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
        <div class="hero-slider-dots" id="hero-slider-dots">
          ${slides.map((_, idx) => `
            <button type="button" class="hero-slider-dot ${idx === 0 ? 'active' : ''}" data-index="${idx}" aria-label="Ir al slide ${idx + 1}"></button>
          `).join('')}
        </div>
      </div>
      ` : ''}
    `;
  }

  function setupSliderEvents(wrapper, slides) {
    wrapper.querySelectorAll('img, video').forEach(media => {
      media.addEventListener('error', () => {
        media.hidden = true;
        const note = document.createElement('p');
        note.className = 'hero-media-unavailable';
        note.textContent = 'No se pudo cargar este recurso. Podés seguir al catálogo.';
        media.parentElement.appendChild(note);
      }, { once: true });
    });
    if (slides.length <= 1) return;

    const pauseButton = wrapper.querySelector('.hero-slider-pause');
    pauseButton?.addEventListener('click', () => {
      isPaused = !isPaused;
      pauseButton.setAttribute('aria-pressed', String(isPaused));
      pauseButton.textContent = isPaused ? 'Reanudar rotación' : 'Pausar rotación';
      scheduleNextSlide(slides);
    });

    const prevBtn = wrapper.querySelector('#hero-slider-prev-btn');
    const nextBtn = wrapper.querySelector('#hero-slider-next-btn');
    const dotsContainer = wrapper.querySelector('#hero-slider-dots');

    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        prevSlide(slides);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        nextSlide(slides);
      });
    }

    if (dotsContainer) {
      dotsContainer.addEventListener('click', (e) => {
        const dot = e.target.closest('.hero-slider-dot');
        if (dot) {
          e.stopPropagation();
          const targetIndex = parseInt(dot.getAttribute('data-index'));
          if (!isNaN(targetIndex)) goToSlide(targetIndex, slides);
        }
      });
    }

    // Touch Swipe Support for Mobile
    wrapper.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    wrapper.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      handleTouchSwipe(slides);
    }, { passive: true });
  }

  function handleTouchSwipe(slides) {
    const swipeThreshold = 40;
    if (touchEndX < touchStartX - swipeThreshold) {
      // Swiped Left -> Next slide
      nextSlide(slides);
    } else if (touchEndX > touchStartX + swipeThreshold) {
      // Swiped Right -> Prev slide
      prevSlide(slides);
    }
  }

  function goToSlide(index, slides) {
    if (!slides || slides.length === 0) return;
    if (slideTimer) clearTimeout(slideTimer);

    const slideElements = document.querySelectorAll('.hero-slide-item');
    const dotElements = document.querySelectorAll('.hero-slider-dot');

    currentSlideIndex = (index + slides.length) % slides.length;

    slideElements.forEach((el, idx) => {
      const active = idx === currentSlideIndex;
      el.setAttribute('aria-hidden', String(!active));
      el.inert = !active;
      const iframe = el.querySelector('iframe');
      if (iframe) {
        if (active && !iframe.getAttribute('src')) iframe.src = iframe.getAttribute('data-src');
        if (!active) iframe.removeAttribute('src');
      }
      if (idx === currentSlideIndex) {
        el.classList.add('active');
        const video = el.querySelector('video');
        if (video) {
          video.currentTime = 0;
          void playMutedVideo(video);
        }
      } else {
        el.classList.remove('active');
        const video = el.querySelector('video');
        if (video) video.pause();
      }
    });

    dotElements.forEach((dot, idx) => {
      dot.setAttribute('aria-current', String(idx === currentSlideIndex));
      if (idx === currentSlideIndex) dot.classList.add('active');
      else dot.classList.remove('active');
    });

    scheduleNextSlide(slides);
  }

  async function playMutedVideo(video) {
    try {
      video.muted = true;
      await video.play();
    } catch (error) { video.controls = true; }
  }

  function scheduleNextSlide(slides) {
    if (slideTimer) clearTimeout(slideTimer);
    slideTimer = null;
    // Never interrupt a YouTube player; a single slide needs no rotation timer.
    if (isPaused || slides.length < 2 || window.AppConfig.getHeroMedia(slides[currentSlideIndex]).kind === 'youtube') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const currentSlideData = slides[currentSlideIndex];
    const duration = (currentSlideData?.duration_seconds || 5) * 1000;

    slideTimer = setTimeout(() => {
      if (!isPaused) nextSlide(slides);
    }, duration);
  }

  function nextSlide(slides) {
    goToSlide(currentSlideIndex + 1, slides);
  }

  function prevSlide(slides) {
    goToSlide(currentSlideIndex - 1, slides);
  }

  // Initialize on load and on brand update events
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeroSlider);
  } else {
    initHeroSlider();
  }

  window.addEventListener('boeweb_brand_updated', initHeroSlider);
  window.addEventListener('boeweb_app_config_loaded', initHeroSlider);
  window.addEventListener('storage', (e) => {
    if (e.key === 'boeweb_hero_slides' || e.key === 'boeweb_tenant_profile_published') {
      initHeroSlider();
    }
  });

  window.initHeroSlider = initHeroSlider;
})();
