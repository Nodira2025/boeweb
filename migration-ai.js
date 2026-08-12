/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — MOTOR DE IA MIGRATION CENTER & STAGING
   ========================================================================== */

const COLUMN_DICTIONARY = {
  product_code: ['cod_art', 'codigo', 'cod', 'sku', 'art', 'part_number', 'oem', 'id_producto'],
  name: ['descripcion', 'nombre', 'producto', 'articulo', 'desc', 'detalle', 'item'],
  brand: ['marca', 'laboratorio', 'fabricante', 'brand', 'make'],
  price: ['pvp', 'precio', 'precio_publico', 'precio_venta', 'costo', 'valor', 'price'],
  stock: ['cant', 'cantidad', 'stock', 'unidades', 'disponible', 'qty'],
  category: ['categoria', 'rubro', 'linea', 'familia', 'grupo'],
  barcode: ['ean', 'upc', 'codigo_barras', 'barcode', 'gtin']
};

class MigrationAIEngine {
  // Parsing de contenido CSV, JSON o estructura tabular de origen
  parseRawSource(content, sourceType = 'FILE_CSV') {
    if (typeof content === 'object' && Array.isArray(content)) {
      return content;
    }
    if (sourceType === 'JSON' || (typeof content === 'string' && content.trim().startsWith('['))) {
      try { return JSON.parse(content); } catch (e) {}
    }

    // Parsing CSV línea por línea
    const lines = String(content || '').split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return [];

    const delimiter = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''));
      const rawObj = {};
      headers.forEach((h, idx) => {
        rawObj[h] = values[idx] !== undefined ? values[idx] : '';
      });
      rows.push(rawObj);
    }
    return rows;
  }

  // Sugerencia de Mapeo de Columnas con Inteligencia Adaptativa
  suggestColumnMappings(headers, verticalCode = 'growshop') {
    const mappings = [];
    const lowerHeaders = headers.map(h => String(h).toLowerCase().trim());

    Object.keys(COLUMN_DICTIONARY).forEach(targetCol => {
      const aliases = COLUMN_DICTIONARY[targetCol];
      const matchIdx = lowerHeaders.findIndex(h => aliases.some(alias => h.includes(alias)));
      if (matchIdx !== -1) {
        mappings.push({
          source_column: headers[matchIdx],
          target_column: targetCol,
          transformation_rule: 'CLEAN_STRING'
        });
      }
    });

    return mappings;
  }

  // Normalizador de datos con puntuación de confianza (Confidence Score)
  normalizeRow(rawRow, mappings, verticalCode = 'growshop') {
    const normalized = {};
    let confidenceSum = 0;
    let fieldsMapped = 0;
    const errors = [];

    mappings.forEach(m => {
      const rawVal = rawRow[m.source_column];
      if (rawVal !== undefined && rawVal !== '') {
        let cleanVal = String(rawVal).trim();

        // Normalización de precios y números
        if (m.target_column === 'price' || m.target_column === 'stock' || m.target_column === 'power_watts') {
          cleanVal = cleanVal.replace(/\$/g, '').replace(/\./g, '').replace(/,/g, '.').trim();
          const num = parseFloat(cleanVal);
          if (isNaN(num)) {
            errors.push(`Valor numérico inválido en ${m.source_column}: "${rawVal}"`);
            confidenceSum += 0.4;
          } else {
            cleanVal = m.target_column === 'stock' ? Math.floor(num) : num;
            confidenceSum += 0.98;
          }
        } else {
          confidenceSum += 0.95;
        }

        normalized[m.target_column] = cleanVal;
        fieldsMapped++;
      }
    });

    const confidence = fieldsMapped > 0 ? Number((confidenceSum / fieldsMapped).toFixed(2)) : 0.50;
    let validationStatus = 'VALID';
    if (errors.length > 0) validationStatus = 'ERROR';
    else if (confidence < 0.85) validationStatus = 'WARNING';

    return {
      normalized_data: normalized,
      confidence,
      validation_status: validationStatus,
      errors
    };
  }

  // Detección de Duplicados en Staging
  detectDuplicates(normalizedData, existingCatalog = []) {
    const code = normalizedData.product_code || normalizedData.barcode;
    const name = (normalizedData.name || '').toLowerCase().trim();

    if (!code && !name) return { isDuplicate: false, matchedId: null, confidence: 0 };

    const match = existingCatalog.find(p => 
      (code && (p.product_code === code || p.barcode === code)) ||
      (name && p.name.toLowerCase().trim() === name)
    );

    if (match) {
      return {
        isDuplicate: true,
        matchedId: match.product_code || match.id,
        confidence: match.product_code === code ? 0.99 : 0.80
      };
    }
    return { isDuplicate: false, matchedId: null, confidence: 1.0 };
  }
}

const MigrationAI = new MigrationAIEngine();

if (typeof window !== 'undefined') {
  window.MigrationAI = MigrationAI;
}
if (typeof global !== 'undefined') {
  global.MigrationAI = MigrationAI;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MigrationAI, COLUMN_DICTIONARY };
}
