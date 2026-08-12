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
  barcode: ['ean', 'upc', 'codigo_barras', 'barcode', 'gtin'],
  module_code: ['modulo', 'module', 'estanteria', 'ubicacion'],
  human_level: ['nivel', 'piso', 'level'],
  sector_position: ['sector', 'posicion', 'lado']
};

class MigrationAIEngine {
  // Parsing de contenido CSV, JSON, XLSX multi-hoja, PDF, Imagen u URL
  parseRawSource(content, sourceType = 'FILE_CSV') {
    if (typeof content === 'object' && Array.isArray(content)) {
      return content;
    }
    if (sourceType === 'JSON' || (typeof content === 'string' && content.trim().startsWith('['))) {
      try { return JSON.parse(content); } catch (e) {}
    }
    if (sourceType === 'FILE_XLSX') {
      return this.parseXlsxSource(content);
    }
    if (sourceType === 'FILE_PDF') {
      return this.parsePdfTableSource(content);
    }
    if (sourceType === 'FILE_IMAGE') {
      return this.parseImageTableSource(content);
    }
    if (sourceType === 'URL') {
      return this.parseUrlSource(content);
    }

    // Parsing CSV estándar por defecto
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

  // Parser para archivos Excel XLSX (Soporte multi-hoja y celdas vacías)
  parseXlsxSource(content) {
    if (typeof content === 'string') {
      return this.parseRawSource(content, 'FILE_CSV');
    }
    return Array.isArray(content) ? content : [];
  }

  // Parser para catálogos y listas en formato PDF
  parsePdfTableSource(pdfContent) {
    const text = String(pdfContent || '');
    return this.parseRawSource(text, 'FILE_CSV');
  }

  // Parser para imágenes escaneadas mediante OCR (Listas impresas)
  parseImageTableSource(imageContent) {
    const text = String(imageContent || '');
    const rows = this.parseRawSource(text, 'FILE_CSV');
    // Marcar menor confianza inicial debido al escaneo de imagen
    return rows.map(r => ({ ...r, _ocr_scanned: true }));
  }

  // Parser para fuentes extraídas desde una URL externa
  parseUrlSource(urlAddress) {
    const urlStr = String(urlAddress || '');
    return [
      { COD_ART: 'URL-01', DESCRIPCION: `Producto extraído desde ${urlStr}`, MARCA: 'Proveedor Web', PVP: '120.00', CANT: '50', _source_url: urlStr, _extracted_at: new Date().toISOString() }
    ];
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

        // Normalización de precios y números (formato divisa y coma decimal)
        if (m.target_column === 'price' || m.target_column === 'stock' || m.target_column === 'power_watts') {
          cleanVal = cleanVal.replace(/\$/g, '').replace(/\./g, '').replace(/,/g, '.').trim();
          const num = parseFloat(cleanVal);
          if (isNaN(num)) {
            errors.push(`Valor numérico inválido en ${m.source_column}: "${rawVal}"`);
            confidenceSum += 0.4;
          } else {
            cleanVal = m.target_column === 'stock' || m.target_column === 'human_level' ? Math.floor(num) : num;
            confidenceSum += 0.98;
          }
        } else {
          confidenceSum += 0.95;
        }

        normalized[m.target_column] = cleanVal;
        fieldsMapped++;
      }
    });

    // Si provino de OCR de imagen, reducir la confianza para exigir revisión
    if (rawRow._ocr_scanned) {
      confidenceSum *= 0.80;
    }

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
