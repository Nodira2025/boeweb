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

  function getHeroConfig() {
    let brand = null;
    try {
      brand = JSON.parse(localStorage.getItem('boeweb_tenant_profile_published') || 'null');
    } catch (_) {}

    let slides = null;
    try {
      const storedSlides = localStorage.getItem('boeweb_hero_slides');
      if (storedSlides) slides = JSON.parse(storedSlides);
    } catch (_) {}

    if (!slides && brand?.hero_slides && Array.isArray(brand.hero_slides)) {
      slides = brand.hero_slides;
    }

    const isActive = brand?.hero_slider_active !== false && slides && slides.length > 0;
    return { isActive, slides: slides || [], brand };
  }

  function initHeroSlider() {
    const heroSection = document.getElementById('home');
    if (!heroSection) return;

    const { isActive, slides, brand } = getHeroConfig();

    // If slider is disabled or has no slides, keep default layout and inject brand texts
    if (!isActive || slides.length === 0) {
      const defaultContainer = heroSection.querySelector('.hero-container');
      if (defaultContainer) defaultContainer.style.display = 'flex';
      const existingSlider = heroSection.querySelector('.hero-slider-wrapper');
      if (existingSlider) existingSlider.remove();
      return;
    }

    // Hide default container, render slider
    const defaultContainer = heroSection.querySelector('.hero-container');
    if (defaultContainer) defaultContainer.style.display = 'none';

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
    const primaryColor = brand?.primary_color || 'var(--color-primary, #152D24)';
    const accentColor = brand?.accent_color || 'var(--color-accent-gold, #C2A246)';

    wrapper.innerHTML = `
      <div class="hero-slider-track" id="hero-slider-track">
        ${slides.map((slide, idx) => {
          const isVideo = slide.type === 'video';
          const targetUrl = slide.target_url || '#catalog-section';
          const ctaText = slide.cta_text || 'Ver';
          const title = slide.title || brand?.brand_name || 'Promoción Especial';
          const subtitle = slide.subtitle || brand?.slogan || '';

          return `
            <div class="hero-slide-item ${idx === 0 ? 'active' : ''}" data-index="${idx}" data-duration="${slide.duration_seconds || 5}">
              <div class="hero-slide-media-container">
                ${isVideo ? `
                  <video class="hero-slide-video" src="${slide.media_url}" autoplay muted loop playsinline></video>
                ` : `
                  <img class="hero-slide-image" src="${slide.media_url || 'assets/hero-banner1.jpg'}" alt="${title}">
                `}
              </div>
              <div class="hero-slide-overlay">
                <div class="hero-slide-content">
                  <span class="hero-slide-badge">${brand?.brand_name || 'Destacado'}</span>
                  <h2 class="hero-slide-title">${title}</h2>
                  ${subtitle ? `<p class="hero-slide-subtitle">${subtitle}</p>` : ''}
                  <div class="hero-slide-actions">
                    <a href="${targetUrl}" class="hero-slide-cta-btn" style="background: ${accentColor}; color: ${primaryColor};">
                      ${ctaText}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Navigation Arrows (if more than 1 slide) -->
      ${slides.length > 1 ? `
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
      ` : ''}
    `;
  }

  function setupSliderEvents(wrapper, slides) {
    if (slides.length <= 1) return;

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

    // Pause on hover
    wrapper.addEventListener('mouseenter', () => { isPaused = true; });
    wrapper.addEventListener('mouseleave', () => { isPaused = false; });

    // Touch Swipe Support for Mobile
    wrapper.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      isPaused = true;
    }, { passive: true });

    wrapper.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      isPaused = false;
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
      if (idx === currentSlideIndex) {
        el.classList.add('active');
        const video = el.querySelector('video');
        if (video) {
          video.currentTime = 0;
          video.play().catch(() => {});
        }
      } else {
        el.classList.remove('active');
        const video = el.querySelector('video');
        if (video) video.pause();
      }
    });

    dotElements.forEach((dot, idx) => {
      if (idx === currentSlideIndex) dot.classList.add('active');
      else dot.classList.remove('active');
    });

    // Schedule next auto slide
    const currentSlideData = slides[currentSlideIndex];
    const duration = (currentSlideData?.duration_seconds || 5) * 1000;

    slideTimer = setTimeout(() => {
      if (!isPaused) {
        nextSlide(slides);
      } else {
        // Retry shortly if paused
        goToSlide(currentSlideIndex, slides);
      }
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
  window.addEventListener('storage', (e) => {
    if (e.key === 'boeweb_hero_slides' || e.key === 'boeweb_tenant_profile_published') {
      initHeroSlider();
    }
  });

  window.initHeroSlider = initHeroSlider;
})();
