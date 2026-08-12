/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — MOTOR DE RUBROS Y ATRIBUTOS DINÁMICOS
   ========================================================================== */

const BUSINESS_VERTICALS_CACHE = {
  growshop: {
    code: 'growshop',
    name: 'Growshop & Botánica Premium',
    attribute_schema: [
      { key: 'brand', label: 'Marca / Laboratorio', type: 'text', required: true, searchable: true, barcode_priority: 10, ai_enrichment: true },
      { key: 'presentation', label: 'Presentación / Volumen', type: 'text', unit: 'ml/L/kg', required: true, searchable: true, barcode_priority: 9, ai_enrichment: true },
      { key: 'npk_ratio', label: 'Relación N-P-K', type: 'text', required: false, searchable: true, barcode_priority: 6, ai_enrichment: true },
      { key: 'substrate_type', label: 'Tipo de Sustrato', type: 'select', options: ['Turba/Inerte', 'Lovert/Orgánico', 'Coco', 'Hydro'], required: false, searchable: true, barcode_priority: 5, ai_enrichment: true }
    ],
    barcode_enrichment_config: { search_keywords: ['fertilizante', 'grow', 'sustrato', 'maceta', 'top crop', 'klasmann'], priority_fields: ['brand', 'presentation'] },
    ai_prompt_context: 'Eres un experto agrónomo de Growshop. Identifica marca, volumen en L/ml/kg, valores NPK y fase de cultivo.',
    category_suggestions: ['Nutrición Vegetal', 'Sustratos & Enmiendas', 'Control de Plagas', 'Iluminación Indoor', 'Macetas & Riego']
  },
  ferreteria: {
    code: 'ferreteria',
    name: 'Ferretería & Herramientas Industriales',
    attribute_schema: [
      { key: 'brand', label: 'Marca', type: 'text', required: true, searchable: true, barcode_priority: 10, ai_enrichment: true },
      { key: 'model', label: 'Modelo / Código Fábrica', type: 'text', required: true, searchable: true, barcode_priority: 9, ai_enrichment: true },
      { key: 'power_watts', label: 'Potencia Motor', type: 'number', unit: 'W', required: false, searchable: true, barcode_priority: 8, ai_enrichment: true },
      { key: 'voltage', label: 'Voltaje Alimentación', type: 'select', options: ['220V', '110V', '18V Batería', '20V Batería', 'Manual'], required: false, searchable: true, barcode_priority: 7, ai_enrichment: true },
      { key: 'measurements_mm', label: 'Medida / Mandril', type: 'text', unit: 'mm/pulgadas', required: false, searchable: true, barcode_priority: 6, ai_enrichment: true }
    ],
    barcode_enrichment_config: { search_keywords: ['taladro', 'amoladora', 'bosch', 'dewalt', 'makita', 'llave'], priority_fields: ['brand', 'model', 'power_watts', 'voltage'] },
    ai_prompt_context: 'Eres un consultor técnico de ferretería industrial. Identifica marca, modelo exacto, potencia en Watts y voltaje.',
    category_suggestions: ['Herramientas Eléctricas', 'Herramientas Manuales', 'Bulonería & Fijaciones', 'Electricidad & Iluminación', 'Plomería & Agua']
  },
  repuestos: {
    code: 'repuestos',
    name: 'Autopartes & Repuestos Automotores',
    attribute_schema: [
      { key: 'oem_code', label: 'Código OEM / Parte Original', type: 'text', required: true, searchable: true, barcode_priority: 10, ai_enrichment: true },
      { key: 'vehicle_make', label: 'Marca Vehículo', type: 'text', required: true, searchable: true, barcode_priority: 9, ai_enrichment: true },
      { key: 'compatible_models', label: 'Modelos Compatibles', type: 'text', required: true, searchable: true, barcode_priority: 8, ai_enrichment: true },
      { key: 'part_category', label: 'Sistema Mecánico', type: 'select', options: ['Motor', 'Frenos', 'Suspensión/Dirección', 'Transmisión', 'Electricidad'], required: true, searchable: true, barcode_priority: 6, ai_enrichment: true }
    ],
    barcode_enrichment_config: { search_keywords: ['filtro', 'pastilla freno', 'amortiguador', 'bosch', 'oem'], priority_fields: ['oem_code', 'vehicle_make', 'compatible_models'] },
    ai_prompt_context: 'Eres un especialista en catálogo técnico de autopartes. Extrae número de pieza OEM, marca del auto y compatibilidad.',
    category_suggestions: ['Filtros & Aceites', 'Sistema de Frenos', 'Suspensión & Amortiguadores', 'Motor & Distribución']
  },
  indumentaria: {
    code: 'indumentaria',
    name: 'Indumentaria, Calzado & Moda',
    attribute_schema: [
      { key: 'brand', label: 'Marca de Moda', type: 'text', required: true, searchable: true, barcode_priority: 10, ai_enrichment: true },
      { key: 'size', label: 'Talle / Medida', type: 'select', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '38', '40', '42'], required: true, searchable: true, barcode_priority: 9, ai_enrichment: true },
      { key: 'color', label: 'Color / Tono', type: 'text', required: true, searchable: true, barcode_priority: 8, ai_enrichment: true },
      { key: 'gender', label: 'Línea / Género', type: 'select', options: ['Unisex', 'Hombre', 'Mujer', 'Niños'], required: false, searchable: true, barcode_priority: 6, ai_enrichment: true }
    ],
    barcode_enrichment_config: { search_keywords: ['remera', 'pantalón', 'zapatillas', 'nike', 'adidas'], priority_fields: ['brand', 'size', 'color'] },
    ai_prompt_context: 'Eres un catalogador de moda. Extrae marca, talle exacto (S/M/L o calzado) y color predominante.',
    category_suggestions: ['Remeras & Musculosas', 'Pantalones & Jeans', 'Calzado Deportivo', 'Calzado Urbano']
  }
};

class BusinessVerticalManager {
  getVertical(verticalCode) {
    const code = String(verticalCode || 'growshop').toLowerCase();
    return BUSINESS_VERTICALS_CACHE[code] || BUSINESS_VERTICALS_CACHE.growshop;
  }

  getSuggestedAttributes(verticalCode) {
    return this.getVertical(verticalCode).attribute_schema;
  }

  getAiPromptContext(verticalCode) {
    return this.getVertical(verticalCode).ai_prompt_context;
  }

  // Genera el HTML de formulario dinámico basado en attribute_schema JSONB
  renderDynamicFormFields(verticalCode, currentValues = {}) {
    const vertical = this.getVertical(verticalCode);
    const schema = vertical.attribute_schema;

    return schema.map(attr => {
      const val = currentValues[attr.key] || '';
      const reqBadge = attr.required ? '<span style="color:#e53935;">*</span>' : '';
      const unitLabel = attr.unit ? `<small style="color:var(--vendor-muted);">(${attr.unit})</small>` : '';

      if (attr.type === 'select') {
        const optionsHtml = (attr.options || []).map(opt => 
          `<option value="${opt}" ${opt === val ? 'selected' : ''}>${opt}</option>`
        ).join('');

        return `
          <div style="margin-bottom: 12px;">
            <label style="font-size: 0.84rem; font-weight: 700; color: var(--vendor-forest); display: block; margin-bottom: 4px;">
              ${attr.label} ${reqBadge} ${unitLabel}
            </label>
            <select name="attr_${attr.key}" class="b2b-search-input" style="width: 100%;" ${attr.required ? 'required' : ''}>
              <option value="">-- Seleccionar ${attr.label} --</option>
              ${optionsHtml}
            </select>
          </div>
        `;
      }

      return `
        <div style="margin-bottom: 12px;">
          <label style="font-size: 0.84rem; font-weight: 700; color: var(--vendor-forest); display: block; margin-bottom: 4px;">
            ${attr.label} ${reqBadge} ${unitLabel}
          </label>
          <input type="${attr.type === 'number' ? 'number' : 'text'}" name="attr_${attr.key}" class="b2b-search-input" style="width: 100%;" value="${val}" placeholder="Ingresar ${attr.label.toLowerCase()}..." ${attr.required ? 'required' : ''}>
        </div>
      `;
    }).join('');
  }

  // Enriquece datos de código de barras según las heurísticas del rubro
  enrichBarcodeProductData(rawBarcodeResult, verticalCode) {
    const vertical = this.getVertical(verticalCode);
    const enriched = { ...rawBarcodeResult, verticalCode: vertical.code };

    // Extraer campos prioritarios definidos por la matriz del rubro
    const schema = vertical.attribute_schema;
    enriched.dynamicAttributes = {};

    schema.forEach(attr => {
      if (rawBarcodeResult[attr.key]) {
        enriched.dynamicAttributes[attr.key] = rawBarcodeResult[attr.key];
      }
    });

    return enriched;
  }
}

const BusinessVerticals = new BusinessVerticalManager();

if (typeof window !== 'undefined') {
  window.BusinessVerticals = BusinessVerticals;
  window.BUSINESS_VERTICALS_CACHE = BUSINESS_VERTICALS_CACHE;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BusinessVerticals, BUSINESS_VERTICALS_CACHE };
}
