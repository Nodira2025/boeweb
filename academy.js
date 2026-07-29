/**
 * BO growclub - Academia BÔ (Interactive Indoor Cannabis Cultivation & Fitopatología Courses)
 * Includes VPD Calculator, Trichome Maturity Simulator, Quizzes, Seed Rewards, and Printable Certificate.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- COURSE 2: FITOPATOLOGIA DATA ---
  const FITOPATOLOGIA_MODULES = [
    {
      id: 101,
      title: 'Módulo 1: Fitopatología Micótica (Hongos Patógenos)',
      shortTitle: '1. Hongos Patógenos',
      subtitle: 'Botrytis, Oídio, Pythium y Fusarium bajo evidencia científica',
      content: `
        <div class="lesson-block">
          <h3>🧫 1. Botrytis cinerea & Erysiphe macularis (Oídio)</h3>
          <p>La esporulación micótica se desencadena cuando la humedad relativa excede el 65% HR en cogollos densos. El Oídio prolifera en la cara adaxial de las hojas por esporas anemófilas. La prevención científica exige flujo de aire constante de 0.5 m/s y uso de biopesticidas como <em>Bacillus subtilis</em>.</p>
          <div class="tip-box">
            <strong>💡 Protocolo Fungicida Orgánico:</strong> Aplicá <em>Bacillus subtilis</em> de forma preventiva cada 10 días o Jabón Potásico + Aceite de Neem al 2% para inhibir la germinación de conidias.
          </div>
        </div>

        <div class="lesson-block">
          <h3>🌱 2. Pythium & Fusarium (Damping Off / Pudrición de Raíz)</h3>
          <p>Los patógenos del suelo atacan el sistema radicular por falta de oxigenación y encharcamiento constante. Mantené la temperatura del agua entre 18°C y 21°C y aplicá Trichoderma harzianum para proteger la rizosfera.</p>
        </div>
      `,
      quiz: [
        {
          q: '¿Qué microorganismo antagonista es ampliamente utilizado en control biológico para inhibir Botrytis y Oídio?',
          options: ['Bacillus subtilis', 'Escherichia coli', 'Saccharomyces cerevisiae'],
          correct: 0
        },
        {
          q: '¿Cuál es la temperatura de agua de riego recomendada para prevenir patógenos de raíz como Pythium?',
          options: ['18°C a 21°C', '30°C a 35°C', '5°C a 10°C'],
          correct: 0
        }
      ]
    },
    {
      id: 102,
      title: 'Módulo 2: Entomología Agrícola & Manejo Integrado de Plagas (MIP)',
      shortTitle: '2. Plagas & Biocontrol',
      subtitle: 'Arañuela Roja, Trips y Mosca Blanca bajo biocontrol',
      content: `
        <div class="lesson-block">
          <h3>🐛 1. Arañuela Roja (Tetranychus urticae) & Biocontrol</h3>
          <p>Tetranychus urticae posee una velocidad de reproducción exponencial a T > 26°C. El tratamiento de biocontrol mediante el acaricida depredador <em>Phytoseiulus persimilis</em> o la aplicación de <strong>Sales Potásicas + Azadiractina (Neem)</strong> rompe la cutícula del ácaro sin generar resistencia ni dejar residuos tóxicos.</p>
          <div class="tip-box">
            <strong>💡 Regla MIP:</strong> Nunca apliques insecticidas sintéticos en fase de floración. El biocontrol predador no altera el perfil terpénico de las flores.
          </div>
        </div>

        <div class="lesson-block">
          <h3>🪰 2. Trips (Frankliniella occidentalis) & Mosca Blanca</h3>
          <p>Los trips raspan el mesófilo dejando manchas plateadas y puntos negros. Usá trampas cromáticas amarillas y azules combinadas con aplicaciones de tierra de diatomeas o <em>Beauveria bassiana</em>.</p>
        </div>
      `,
      quiz: [
        {
          q: '¿Cuál es el ácaro depredador específico utilizado en biocontrol para erradicar la Arañuela Roja?',
          options: ['Phytoseiulus persimilis', 'Tetranychus urticae', 'Frankliniella occidentalis'],
          correct: 0
        },
        {
          q: '¿Qué tipo de trampas se recomiendan para el monitoreo de Trips y Mosca Blanca?',
          options: ['Trampas Cromáticas Amarillas y Azules', 'Trampas de Luz Negra', 'No se usan trampas'],
          correct: 0
        }
      ]
    },
    {
      id: 103,
      title: 'Módulo 3: Diagnóstico Diferencial & Bioseguridad',
      shortTitle: '3. Diagnóstico & Saneamiento',
      subtitle: 'Distinción entre patógenos, deficiencias nutricionales y bloqueo de pH',
      content: `
        <div class="lesson-block">
          <h3>🧪 1. Diagnóstico Diferencial de Clorosis Foliar</h3>
          <p>Una clorosis internerval puede confundirse entre deficiencia de Magnesio (Mg) o bloqueo por pH ácido. La microscopía digital 60x permite observar la presencia de ninfas o hifas para descartar o confirmar una causa biótica frente a una nutricional.</p>
          <div class="tip-box">
            <strong>💡 Regla de Diagnóstico:</strong> Si el síntoma aparece solo en hojas bajas viejas, suele ser deficiencia móvil (N, P, K, Mg). Si aparece en brotes nuevos, es deficiencia inmóvil (Ca, Fe, B) o patógeno.
          </div>
        </div>

        <div class="lesson-block">
          <h3>🧼 2. Bioseguridad & Sanitización del Indoor</h3>
          <p>Desinfectá carpas, tijeras y macetas con alcohol al 70% o peróxido de hidrógeno entre cosechas para evitar reinfección por esporas de Fusarium o huevos de trips.</p>
        </div>
      `,
      quiz: [
        {
          q: '¿Qué herramienta permite descartar un patógeno biótico observando la superficie foliar a 60x-100x?',
          options: ['Microscopía Digital / Lupa 60x', 'Termómetro Ambiental', 'Medidor de Luxes'],
          correct: 0
        },
        {
          q: '¿Con qué solución se recomienda sanitizar tijeras de podar y carpas entre cosechas?',
          options: ['Alcohol al 70% o Peróxido de Hidrógeno', 'Solo agua de canilla', 'Aceite comestible'],
          correct: 0
        }
      ]
    }
  ];

  window.FITOPATOLOGIA_MODULES = FITOPATOLOGIA_MODULES;

  // --- COURSE 1: CULTIVO INDOOR DATA ---
  const MODULES_DATA = [
    {
      id: 1,
      title: 'Módulo 1: Germinación & Super Soil Orgánico',
      shortTitle: '1. Germinación & Sustrato',
      subtitle: 'La Base Zen: El origen de una raíz fuerte y sana',
      content: `
        <div class="lesson-block">
          <h3>🌱 1. El Proceso Agronómico de Germinación</h3>
          <p>La germinación es la fase crítica donde la semilla despierta de su latencia. Para lograr una tasa de éxito superior al 95%, debemos controlar tres variables fundamentales: <strong>Humedad (100%), Temperatura constante (22°C - 25°C) y Oscuridad</strong>.</p>
          <div class="tip-box">
            <strong>💡 Método de la Servilleta de Papel:</strong> Colocá las semillas entre dos capas de papel de cocina humedecido (sin encharcar) dentro de un recipiente cerrado en un lugar templado y oscuro. La radícula (raíz primaria) emergerá en 24 a 72 horas.
          </div>
        </div>

        <div class="lesson-block">
          <h3>🌿 2. La Arquitectura del "Super Soil" (Sustrato Vivo)</h3>
          <p>Un sustrato inerte obliga a depender de fertilizantes minerales constantes. El enfoque orgánico Zen promueve un sustrato vivo rico en microfauna benéfica:</p>
          <table class="academy-table">
            <thead>
              <tr>
                <th>Componente</th>
                <th>Proporción Recomendada</th>
                <th>Función Agronómica</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Turba Rubia / Coco</td>
                <td>40%</td>
                <td>Retención de humedad y estructura esponjosa.</td>
              </tr>
              <tr>
                <td>Perlita Expansiva</td>
                <td>20%</td>
                <td>Aireación y prevención de compactación radicular.</td>
              </tr>
              <tr>
                <td>Humus de Lombriz</td>
                <td>30%</td>
                <td>Aporte de nitrógeno orgánico y microfauna viva.</td>
              </tr>
              <tr>
                <td>Micorrizas & Trichodermas</td>
                <td>10% / Inóculo</td>
                <td>Simbiosis micorrízica y protección radicular.</td>
              </tr>
            </tbody>
          </table>
        </div>
      `,
      quiz: [
        {
          q: '¿Cuál es el rango de temperatura constante ideal para germinar semillas?',
          options: ['10°C - 15°C', '22°C - 25°C', '35°C - 40°C'],
          correct: 1
        },
        {
          q: '¿Qué microorganismo benéfico forma una relación simbiótica con las raíces aumentando la absorción de nutrientes?',
          options: ['Micorrizas', 'Fusarium', 'Oídio'],
          correct: 0
        },
        {
          q: '¿Qué porcentaje de perlita se recomienda para asegurar una buena aireación?',
          options: ['5%', '20%', '90%'],
          correct: 1
        }
      ]
    },
    {
      id: 2,
      title: 'Módulo 2: Iluminación LED & Clima Avanzado (VPD)',
      shortTitle: '2. Iluminación & VPD',
      subtitle: 'Dominando el fotoperíodo, PPFD y la Presión de Vapor',
      content: `
        <div class="lesson-block">
          <h3>💡 1. Espectro y Fotobiología LED</h3>
          <p>Los paneles LED modernos con diodos <strong>Samsung LM301H</strong> entregan un espectro continuo de alta eficiencia fotosintética (PPFD):</p>
          <ul>
            <li><strong>Fase Vegetativa:</strong> Fotoperíodo 18/6. Luz fría/azulada (4000K) que promueve entrenudos cortos y estructura robusta.</li>
            <li><strong>Fase de Floración:</strong> Fotoperíodo 12/12. Luz cálida/roja (3000K + Far Red 730nm) que estimula la formación de flores y terpenos.</li>
          </ul>
        </div>

        <div class="lesson-block">
          <h3>🌡️ 2. Calculadora Interactiva de Deficit de Presión de Vapor (VPD)</h3>
          <p>El VPD mide la transpiración real de las hojas según la temperatura y humedad. Ingresá los valores de tu carpa para calcular tu VPD instantáneo:</p>
          
          <!-- VPD CALCULATOR WIDGET -->
          <div class="interactive-widget-box vpd-widget">
            <h4>🎛️ Calculadora VPD en Tiempo Real</h4>
            <div class="widget-grid">
              <div class="widget-field">
                <label>Temperatura (°C):</label>
                <input type="number" id="vpd-temp" value="24" step="0.5" min="10" max="40">
              </div>
              <div class="widget-field">
                <label>Humedad Relativa (%):</label>
                <input type="number" id="vpd-humidity" value="60" min="10" max="95">
              </div>
              <div class="widget-field">
                <label>Fase de Cultivo:</label>
                <select id="vpd-stage">
                  <option value="veg">Vegetativo (Target: 0.8 - 1.1 kPa)</option>
                  <option value="flower">Floración (Target: 1.1 - 1.4 kPa)</option>
                </select>
              </div>
            </div>
            <button class="btn btn-secondary btn-full-width" id="btn-calc-vpd" type="button" style="margin-top: 10px;">Calcular VPD Instantáneo</button>
            <div class="vpd-result-display" id="vpd-result-box" style="display: none;">
              <span class="vpd-val-text" id="vpd-val-text">0.00 kPa</span>
              <p class="vpd-status-msg" id="vpd-status-msg">En rango ideal</p>
            </div>
          </div>
        </div>
      `,
      quiz: [
        {
          q: '¿Cuál es el fotoperíodo estándar recomendado para inducir la etapa de floración?',
          options: ['24/0 (Luz continua)', '18/6', '12 horas de Luz / 12 horas de Oscuridad'],
          correct: 2
        },
        {
          q: '¿Qué mide el Déficit de Presión de Vapor (VPD)?',
          options: ['El precio del fertilizante', 'La velocidad de transpiración foliar según T y HR', 'La potencia de la bomba de agua'],
          correct: 1
        },
        {
          q: '¿Cuál es el rango de VPD óptimo para la fase de floración?',
          options: ['0.2 - 0.4 kPa', '1.1 - 1.4 kPa', '3.0 - 4.0 kPa'],
          correct: 1
        }
      ]
    },
    {
      id: 3,
      title: 'Módulo 3: Nutrición Vegetal & Riego Consciente',
      shortTitle: '3. Nutrición & Riego',
      subtitle: 'El templo de los nutrientes: Macro, Micronutrientes y pH',
      content: `
        <div class="lesson-block">
          <h3>🧪 1. Macronutrientes Esenciales (N-P-K)</h3>
          <p>Durante la vida del cultivo, las demandas nutricionales cambian significativamente:</p>
          <ul>
            <li><strong>Nitrógeno (N):</strong> Clave en Vegetativo. Responsable del follaje verde y la síntesis de clorofila.</li>
            <li><strong>Fósforo (P):</strong> Esencial en la formación de raíces iniciales y en el engorde de cálices en floración.</li>
            <li><strong>Potasio (K):</strong> Aumenta la densidad, peso y producción de resina/terpenos.</li>
          </ul>
        </div>

        <div class="lesson-block">
          <h3>💧 2. Control de pH y Electroconductividad (EC)</h3>
          <p>Si el pH de la solución de riego no es el correcto, las raíces entran en "bloqueo nutricional" (Nutrient Lockout) y no absorben el fertilizante disponible.</p>
          <div class="tip-box">
            <strong>🎯 Rango de pH Ideal en Tierra:</strong> 6.0 a 6.5.<br>
            <strong>🎯 Rango de pH Ideal en Coco/Hidroponia:</strong> 5.8 a 6.2.
          </div>
        </div>
      `,
      quiz: [
        {
          q: '¿Qué macronutriente es el más demandado durante la fase vegetativa?',
          options: ['Nitrógeno (N)', 'Potasio (K)', 'Calcio (Ca)'],
          correct: 0
        },
        {
          q: '¿Qué sucede si regamos con un pH descalibrado por debajo de 5.0?',
          options: ['Las raíces absorben el doble', 'Se produce un bloqueo nutricional (la planta no absorbe nada)', 'La luz brilla más'],
          correct: 1
        },
        {
          q: '¿Cuál es el rango de pH recomendado para el cultivo en sustrato de tierra?',
          options: ['4.0 - 4.5', '6.0 - 6.5', '8.0 - 8.5'],
          correct: 1
        }
      ]
    },
    {
      id: 4,
      title: 'Módulo 4: Cosecha, Secado & Curado de Terpenos',
      shortTitle: '4. Cosecha & Curado',
      subtitle: 'La armonía final: Maduración de tricomas y conservación',
      content: `
        <div class="lesson-block">
          <h3>🔍 1. Simulador Interactivo de Maduración de Tricomas</h3>
          <p>Deslizá la barra para observar el cambio de estado en la resina mediante microscopio y entender el efecto de cosecha:</p>

          <!-- TRICHOME SIMULATOR WIDGET -->
          <div class="interactive-widget-box trichome-widget">
            <h4>🔬 Visor Microscópico de Tricomas</h4>
            <div class="trichome-slider-container">
              <input type="range" id="trichome-range" min="0" max="100" value="50" class="trichome-slider">
              <div class="trichome-visual-stage">
                <div class="trichome-head" id="trichome-head-graphic"></div>
                <span class="trichome-stage-title" id="trichome-stage-title">50% Transparente / 50% Lechoso</span>
              </div>
            </div>
            <div class="trichome-effect-box">
              <strong>🧠 Perfil de Efecto:</strong>
              <p id="trichome-effect-text">Efecto cerebral activo, estimulante y psicoactivo. Potencia máxima de THC sin somnolencia.</p>
            </div>
          </div>
        </div>

        <div class="lesson-block">
          <h3>🍂 2. Parámetros Dorados de Secado & Curado</h3>
          <p>Cosechar a tiempo no sirve si el secado arruina los terpenos. Seguí la regla 60/60:</p>
          <ul>
            <li><strong>Temperatura de Secado:</strong> 15°C - 20°C.</li>
            <li><strong>Humedad Relativa de Secado:</strong> 55% - 60% durante 10 a 14 días a oscuras.</li>
            <li><strong>Curado en Frasco:</strong> 60% - 62% de humedad constante abriendo frascos 5 min diarios.</li>
          </ul>
        </div>
      `,
      quiz: [
        {
          q: '¿Qué color de tricomas indica la concentración máxima de THC y efecto cerebral equilibrado?',
          options: ['Transparente cristalino', 'Mayoría Lechoso / Blanco', 'Negro puro'],
          correct: 1
        },
        {
          q: '¿Cuáles son las condiciones óptimas de secado en la regla 60/60?',
          options: ['30°C y 20% Humedad al sol', '15-20°C y 55-60% Humedad en oscuridad', '40°C dentro del horno'],
          correct: 1
        },
        {
          q: '¿Durante cuánto tiempo mínimo se recomienda curar las flores en frascos herméticos?',
          options: ['1 día', '3 a 4 semanas mínimo', '1 año'],
          correct: 1
        }
      ]
    }
  ];

  // --- STATE ---
  let currentCourseId = 'indoor'; // 'indoor' | 'fitopatologia'
  let activeModuleIndex = 0;
  let userProgress = JSON.parse(localStorage.getItem('boeweb_academy_progress')) || {
    completedModules: [],
    quizScores: {}
  };

  function getCurrentModules() {
    return currentCourseId === 'fitopatologia' ? FITOPATOLOGIA_MODULES : MODULES_DATA;
  }

  // --- DOM REFERENCES ---
  const academyNavBtn = document.getElementById('academy-trigger');
  const mobileAcademyBtn = document.getElementById('mobile-academy-btn');
  const catalogSection = document.getElementById('catalog-section');
  const blogSection = document.getElementById('blog-section');
  const contactSection = document.getElementById('contact-section');
  const heroSection = document.querySelector('.hero-section');
  const academySection = document.getElementById('academy-section');

  const modulesListContainer = document.getElementById('academy-modules-list');
  const lessonContentContainer = document.getElementById('academy-lesson-content');
  const academyProgressFill = document.getElementById('academy-progress-fill');
  const academyProgressPercent = document.getElementById('academy-progress-percent');
  const certModal = document.getElementById('academy-certificate-modal');
  const closeCertBtn = document.getElementById('close-cert-btn');
  const printCertBtn = document.getElementById('print-cert-btn');

  // --- INITIALIZATION ---
  initAcademy();

  function initAcademy() {
    // Nav Triggers
    if (academyNavBtn) {
      academyNavBtn.addEventListener('click', showAcademyView);
    }
    if (mobileAcademyBtn) {
      mobileAcademyBtn.addEventListener('click', () => {
        showAcademyView();
        document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.classList.remove('active'));
        mobileAcademyBtn.classList.add('active');
      });
    }

    if (closeCertBtn) {
      closeCertBtn.addEventListener('click', () => certModal.classList.remove('active'));
    }
    if (printCertBtn) {
      printCertBtn.addEventListener('click', () => window.print());
    }

    renderSidebarModules();
    renderActiveLesson();
    updateProgressUI();
  }

  // --- COURSE SWITCHER ---
  window.switchAcademyCourse = function(courseId) {
    currentCourseId = courseId;
    activeModuleIndex = 0;

    const btnIndoor = document.getElementById('btn-course-indoor');
    const btnFito = document.getElementById('btn-course-fitopatologia');
    const titleDisplay = document.getElementById('academy-course-title-display');

    if (btnIndoor) {
      btnIndoor.style.background = courseId === 'indoor' ? 'rgba(195,155,75,0.3)' : 'rgba(255,255,255,0.08)';
      btnIndoor.style.borderColor = courseId === 'indoor' ? 'var(--color-accent-gold)' : 'rgba(255,255,255,0.2)';
    }
    if (btnFito) {
      btnFito.style.background = courseId === 'fitopatologia' ? 'rgba(102,187,106,0.3)' : 'rgba(255,255,255,0.08)';
      btnFito.style.borderColor = courseId === 'fitopatologia' ? '#66bb6a' : 'rgba(255,255,255,0.2)';
    }

    if (titleDisplay) {
      titleDisplay.textContent = courseId === 'fitopatologia'
        ? 'Progreso del Curso (Fitopatología & Plagas):'
        : 'Progreso del Curso (Cultivo Indoor):';
    }

    renderSidebarModules();
    renderActiveLesson();
    updateProgressUI();
  };

  // --- VIEW TOGGLE ---
  function showAcademyView() {
    if (catalogSection) catalogSection.style.display = 'none';
    if (blogSection) blogSection.style.display = 'none';
    if (heroSection) heroSection.style.display = 'none';
    if (contactSection) contactSection.style.display = 'none';

    if (academySection) {
      academySection.style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // --- RENDER SIDEBAR MODULES ---
  function renderSidebarModules() {
    if (!modulesListContainer) return;
    modulesListContainer.innerHTML = '';
    const currentModules = getCurrentModules();

    currentModules.forEach((mod, index) => {
      const isCompleted = userProgress.completedModules.includes(mod.id);
      const isUnlocked = index === 0 || userProgress.completedModules.includes(currentModules[index - 1].id);

      const li = document.createElement('li');
      li.className = `academy-mod-item ${index === activeModuleIndex ? 'active' : ''} ${!isUnlocked ? 'disabled' : ''}`;
      
      li.innerHTML = `
        <div class="mod-item-status">
          ${isCompleted ? '✅' : (isUnlocked ? '📖' : '🔒')}
        </div>
        <div class="mod-item-info">
          <span class="mod-item-title">${mod.shortTitle}</span>
          <span class="mod-item-sub">${isCompleted ? 'Aprobado (+100 Semillas)' : (isUnlocked ? 'Disponible' : 'Bloqueado')}</span>
        </div>
      `;

      if (isUnlocked) {
        li.addEventListener('click', () => {
          activeModuleIndex = index;
          renderSidebarModules();
          renderActiveLesson();
        });
      }

      modulesListContainer.appendChild(li);
    });

    // Append Certificate Download Button if all completed in current course
    if (currentModules.every(m => userProgress.completedModules.includes(m.id))) {
      const certBtnLi = document.createElement('li');
      certBtnLi.className = 'academy-mod-item cert-unlocked-btn';
      certBtnLi.innerHTML = `
        <div class="mod-item-status">🏆</div>
        <div class="mod-item-info">
          <span class="mod-item-title" style="color: var(--color-accent-gold); font-weight: 700;">Obtener Certificado</span>
          <span class="mod-item-sub">¡Felicitaciones Egregio!</span>
        </div>
      `;
      certBtnLi.addEventListener('click', openCertificateModal);
      modulesListContainer.appendChild(certBtnLi);
    }
  }

  // --- RENDER ACTIVE LESSON ---
  function renderActiveLesson() {
    if (!lessonContentContainer) return;
    const currentModules = getCurrentModules();
    const mod = currentModules[activeModuleIndex] || currentModules[0];
    const isCompleted = userProgress.completedModules.includes(mod.id);

    lessonContentContainer.innerHTML = `
      <div class="lesson-header">
        <span class="lesson-badge">Módulo ${activeModuleIndex + 1} de ${currentModules.length}</span>
        <h2 class="lesson-main-title">${mod.title}</h2>
        <p class="lesson-main-sub">${mod.subtitle}</p>
      </div>

      <div class="lesson-body-text">
        ${mod.content}
      </div>

      <!-- QUIZ SECTION -->
      <div class="quiz-container" id="quiz-section-${mod.id}">
        <h3>📝 Cuestionario de Evaluación (${mod.shortTitle})</h3>
        <p>Aprobá las preguntas para ganar +100 Semillas y avanzar en tu certificación.</p>
        
        <form class="quiz-form" id="quiz-form-${mod.id}">
          ${renderQuizQuestions(mod.quiz, mod.id)}
          <button type="submit" class="btn btn-primary btn-submit-quiz">
            ${isCompleted ? 'Volver a Enviar Examen' : 'Enviar Respuestas & Ganar +100 Semillas'}
          </button>
        </form>
        <div class="quiz-result-msg" id="quiz-feedback-${mod.id}"></div>
      </div>
    `;

    // Bind Widgets Interactivity
    if (mod.id === 2) {
      bindVPDCalculator();
    } else if (mod.id === 4) {
      bindTrichomeSlider();
    }

    // Bind Quiz Form
    const quizForm = document.getElementById(`quiz-form-${mod.id}`);
    if (quizForm) {
      quizForm.addEventListener('submit', (e) => handleQuizSubmit(e, mod));
    }
  }

  function renderQuizQuestions(questions, modId) {
    return questions.map((qObj, qIdx) => `
      <div class="quiz-q-block">
        <p class="q-title"><strong>P${qIdx + 1}:</strong> ${qObj.q}</p>
        <div class="q-options">
          ${qObj.options.map((opt, oIdx) => `
            <label class="q-option-label">
              <input type="radio" name="mod_${modId}_q_${qIdx}" value="${oIdx}" required>
              <span>${opt}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  // --- QUIZ SUBMISSION HANDLER ---
  function handleQuizSubmit(e, mod) {
    e.preventDefault();
    const form = e.target;
    const feedbackEl = document.getElementById(`quiz-feedback-${mod.id}`);
    
    let correctCount = 0;
    mod.quiz.forEach((qObj, qIdx) => {
      const selected = form.querySelector(`input[name="mod_${mod.id}_q_${qIdx}"]:checked`);
      if (selected && parseInt(selected.value) === qObj.correct) {
        correctCount++;
      }
    });

    if (correctCount === mod.quiz.length) {
      feedbackEl.className = 'quiz-result-msg success';
      feedbackEl.innerHTML = `🎉 ¡Excelente! Respondiste 3/3 correctamente. Has ganado <strong>+100 Semillas</strong>.`;

      // Save Progress
      if (!userProgress.completedModules.includes(mod.id)) {
        userProgress.completedModules.push(mod.id);
        localStorage.setItem('boeweb_academy_progress', JSON.stringify(userProgress));

        // Award 100 seeds to member profile
        awardMemberSeeds(100);
      }

      updateProgressUI();
      renderSidebarModules();

      // Smooth scroll next
      setTimeout(() => {
        const currentModules = getCurrentModules();
        if (activeModuleIndex < currentModules.length - 1) {
          activeModuleIndex++;
          renderSidebarModules();
          renderActiveLesson();
          window.scrollTo({ top: 100, behavior: 'smooth' });
        } else {
          openCertificateModal();
        }
      }, 1500);

    } else {
      feedbackEl.className = 'quiz-result-msg error';
      feedbackEl.innerHTML = `❌ Respondiste ${correctCount}/${mod.quiz.length} correctamente. Revisa los apuntes e intentalo nuevamente.`;
    }
  }

  function awardMemberSeeds(amount) {
    let member = JSON.parse(localStorage.getItem('boeweb_member'));
    if (!member) {
      member = {
        name: 'Cultivador Estudiante',
        email: 'estudiante@boegrowclub.com',
        phone: '+5493810000000',
        growType: 'Indoor',
        seeds: 0,
        joinedAt: new Date().toISOString()
      };
    }
    member.seeds = (member.seeds || 0) + amount;
    localStorage.setItem('boeweb_member', JSON.stringify(member));

    if (window.updateCartDisplay) {
      window.updateCartDisplay();
    }
  }

  function updateProgressUI() {
    const currentModules = getCurrentModules();
    const total = currentModules.length;
    const completedCount = currentModules.filter(m => userProgress.completedModules.includes(m.id)).length;
    const pct = Math.round((completedCount / total) * 100);

    if (academyProgressFill) academyProgressFill.style.width = `${pct}%`;
    if (academyProgressPercent) academyProgressPercent.textContent = `${pct}% Completo`;
  }

  // --- INTERACTIVE WIDGET 1: VPD CALCULATOR ---
  function bindVPDCalculator() {
    const tempInput = document.getElementById('vpd-temp');
    const rhInput = document.getElementById('vpd-rh');
    const vpdValueNum = document.getElementById('vpd-value-num');
    const vpdStatusText = document.getElementById('vpd-status-text');
    const vpdExplanation = document.getElementById('vpd-explanation');

    if (!tempInput || !rhInput) return;

    function calculateVPD() {
      const T = parseFloat(tempInput.value) || 25;
      const RH = parseFloat(rhInput.value) || 60;

      // SVP (Saturated Vapor Pressure in kPa) formula: 0.61078 * exp((17.27 * T) / (T + 237.3))
      const svp = 0.61078 * Math.exp((17.27 * T) / (T + 237.3));
      // VP (Actual Vapor Pressure)
      const vp = svp * (RH / 100);
      // VPD = SVP - VP
      const vpd = svp - vp;

      vpdValueNum.textContent = `${vpd.toFixed(2)} kPa`;

      // Determine VPD status
      if (vpd < 0.4) {
        vpdStatusText.textContent = 'Zona Peligrosa: Muy Húmedo';
        vpdStatusText.className = 'vpd-status-badge status-danger';
        vpdExplanation.textContent = 'Riesgo alto de hongos y transpiración bloqueada. Bajá la humedad.';
      } else if (vpd >= 0.4 && vpd <= 0.8) {
        vpdStatusText.textContent = 'Zona Ideal: Plántula / Germinación';
        vpdStatusText.className = 'vpd-status-badge status-veg';
        vpdExplanation.textContent = 'Humedad suave ideal para plantines recién nacidos y esquejes.';
      } else if (vpd > 0.8 && vpd <= 1.2) {
        vpdStatusText.textContent = 'Zona Ideal: Vegetativo Avanzado';
        vpdStatusText.className = 'vpd-status-badge status-veg';
        vpdExplanation.textContent = 'Transpiración y fotosíntesis en máximo equilibrio agronómico.';
      } else if (vpd > 1.2 && vpd <= 1.6) {
        vpdStatusText.textContent = 'Zona Ideal: Floración Intensa';
        vpdStatusText.className = 'vpd-status-badge status-flower';
        vpdExplanation.textContent = 'Favorece la densidad de cogollos y previene la botritis.';
      } else {
        vpdStatusText.textContent = 'Zona Peligrosa: Seco / Estrés Hídrico';
        vpdStatusText.className = 'vpd-status-badge status-danger';
        vpdExplanation.textContent = 'Los estomas se cierran para no deshidratarse. Subí la humedad urgente.';
      }
    }

    tempInput.addEventListener('input', calculateVPD);
    rhInput.addEventListener('input', calculateVPD);
  }

  // --- INTERACTIVE WIDGET 2: TRICHOME SLIDER ---
  function bindTrichomeSlider() {
    const range = document.getElementById('trichome-range');
    const headGraphic = document.getElementById('trichome-head-graphic');
    const titleEl = document.getElementById('trichome-stage-title');
    const textEl = document.getElementById('trichome-effect-text');

    if (!range) return;

    range.addEventListener('input', () => {
      const val = parseInt(range.value);

      if (val < 30) {
        titleEl.textContent = '100% Cristalinos / Transparentes';
        textEl.textContent = 'Efecto inmaduro. Bajos niveles de THC. Cosechar ahora produce dolor de cabeza o efecto nulo.';
        headGraphic.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
        headGraphic.style.boxShadow = '0 0 10px rgba(255,255,255,0.8)';
      } else if (val >= 30 && val <= 70) {
        titleEl.textContent = '70% Lechosos / 30% Ámbar (Punto Óptimo)';
        textEl.textContent = 'Potencia máxima de THC y terpenos. Efecto cerebral limpio, activo y euforizante.';
        headGraphic.style.backgroundColor = 'rgba(245, 240, 220, 0.95)';
        headGraphic.style.boxShadow = '0 0 12px rgba(255, 215, 0, 0.6)';
      } else {
        titleEl.textContent = '50% Ámbar / 50% Carmesí (Cosecha Narcótica)';
        textEl.textContent = 'El THC ha comenzado a degradarse en CBN. Efecto corporal profundo, sedante y altamente relajante (ideal para dormir).';
        headGraphic.style.backgroundColor = 'rgba(205, 127, 50, 0.95)';
        headGraphic.style.boxShadow = '0 0 14px rgba(205, 127, 50, 0.8)';
      }
    });
  }

  // --- CERTIFICATE GENERATOR MODAL ---
  function openCertificateModal() {
    const member = JSON.parse(localStorage.getItem('boeweb_member')) || { name: 'Cultivador BÔ' };
    
    const certNameEl = document.getElementById('cert-student-name');
    const certDateEl = document.getElementById('cert-issue-date');

    if (certNameEl) certNameEl.textContent = member.name;
    if (certDateEl) {
      const now = new Date();
      certDateEl.textContent = now.toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    if (certModal) certModal.classList.add('active');
  }
});
