// Initialize Supabase Client
const SUPABASE_URL = 'https://sxbhrgvizqylnfcqzhin.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4YmhyZ3ZpenF5bG5mY3F6aGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMjM1MzEsImV4cCI6MjA5Njg5OTUzMX0.UUOwXsHXKNCjlJKdxMUlAuCtNAnNWgAroBwMlWAdTag';

let supabaseClient = null;
if (window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Wizard State
let currentStep = 1;
let selectedSpecialistId = 'auto';
let selectedSpecialistName = 'Asignación Automática BÔ';

function updateWizardUI() {
  // Update step indicators
  for (let i = 1; i <= 3; i++) {
    const stepEl = document.getElementById(`pstep-${i}`);
    const contentEl = document.getElementById(`step-content-${i}`);
    
    if (i === currentStep) {
      stepEl.classList.add('active');
      stepEl.classList.remove('completed');
      contentEl.style.display = 'block';
    } else if (i < currentStep) {
      stepEl.classList.remove('active');
      stepEl.classList.add('completed');
      contentEl.style.display = 'none';
    } else {
      stepEl.classList.remove('active', 'completed');
      contentEl.style.display = 'none';
    }
  }

  // Update action buttons
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const btnSubmit = document.getElementById('btn-submit');

  if (currentStep === 1) {
    btnPrev.style.visibility = 'hidden';
    btnNext.style.display = 'inline-flex';
    btnSubmit.style.display = 'none';
  } else if (currentStep === 2) {
    btnPrev.style.visibility = 'visible';
    btnNext.style.display = 'inline-flex';
    btnSubmit.style.display = 'none';
  } else if (currentStep === 3) {
    btnPrev.style.visibility = 'visible';
    btnNext.style.display = 'none';
    btnSubmit.style.display = 'inline-flex';
  }
}

function nextStep() {
  if (currentStep === 1) {
    const fullname = document.getElementById('patient-fullname').value.trim();
    const dni = document.getElementById('patient-dni').value.trim();
    const phone = document.getElementById('patient-phone').value.trim();
    const province = document.getElementById('patient-province').value.trim();

    if (!fullname || !dni || !phone || !province) {
      alert('Por favor completá todos los campos obligatorios (*) antes de continuar.');
      return;
    }
  } else if (currentStep === 2) {
    const procedureType = document.getElementById('procedure-type').value;
    if (!procedureType) {
      alert('Por favor seleccioná el tipo de trámite o consulta.');
      return;
    }
  }

  if (currentStep < 3) {
    currentStep++;
    updateWizardUI();
  }
}

function prevStep() {
  if (currentStep > 1) {
    currentStep--;
    updateWizardUI();
  }
}

function selectSpecialist(cardEl) {
  document.querySelectorAll('.specialist-card').forEach(c => c.classList.remove('selected'));
  cardEl.classList.add('selected');
  selectedSpecialistId = cardEl.getAttribute('data-id');
  selectedSpecialistName = cardEl.querySelector('.specialist-name')?.textContent || 'Especialista';
}

async function submitPatientForm() {
  const fullname = document.getElementById('patient-fullname').value.trim();
  const dni = document.getElementById('patient-dni').value.trim();
  const phone = document.getElementById('patient-phone').value.trim();
  const email = document.getElementById('patient-email').value.trim();
  const province = document.getElementById('patient-province').value.trim();
  const procedureType = document.getElementById('procedure-type').value;
  const notes = document.getElementById('patient-notes').value.trim();

  // Save intake to Supabase asynchronously if client available
  if (supabaseClient) {
    try {
      await supabaseClient.from('patient_intakes').insert([{
        patient_name: fullname,
        dni: dni,
        phone: phone,
        email: email || null,
        province: province,
        procedure_type: procedureType,
        specialist_id: selectedSpecialistId,
        specialist_name: selectedSpecialistName,
        notes: notes || null,
        status: 'pendiente',
        created_at: new Date().toISOString()
      }]);
    } catch (e) {
      console.warn('Could not save to patient_intakes table, proceeding to WhatsApp dispatch:', e);
    }
  }

  // Format WhatsApp message
  const waNumber = '5493813023185';
  let message = `*SOLICITUD DE TRÁMITE & VINCULACIÓN MÉDICA - BÔ growclub*\n\n`;
  message += `👤 *Paciente:* ${fullname}\n`;
  message += `🪪 *DNI:* ${dni}\n`;
  message += `📱 *Teléfono:* ${phone}\n`;
  if (email) message += `✉️ *Email:* ${email}\n`;
  message += `📍 *Ubicación:* ${province}\n\n`;
  message += `🌱 *Trámite Requerido:* ${procedureType}\n`;
  message += `🩺 *Especialista Solicitado:* ${selectedSpecialistName}\n`;
  if (notes) message += `📝 *Detalles/Consulta:* ${notes}\n`;

  const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
  window.open(waUrl, '_blank');
}

// Global exposure
window.nextStep = nextStep;
window.prevStep = prevStep;
window.selectSpecialist = selectSpecialist;
window.submitPatientForm = submitPatientForm;
