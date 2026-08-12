# MIGRATION AI ARCHITECTURE — BÔ GROW CLUB (FASE 9)
## Motor de Inteligencia Desacoplada `MigrationAI` & Puntuación de Confianza

**Proyecto:** `boeweb` (Plataforma SaaS Multi-Tenant)  
**Principios:** La IA propone, las validaciones verifican, la persona autoriza.

---

## 1. Capa Abstraída `MigrationAI`

El módulo `migration-ai.js` expone las siguientes funciones de Inteligencia Adaptativa:

- **`parseRawSource(content, sourceType)`:** Convierte CSV, JSON, tablas extraídas de PDF o OCR de imágenes en un array de objetos `raw_data`.
- **`suggestColumnMappings(headers, verticalCode)`:** Infiere el mapeo de columnas origen contra las columnas del esquema destino (`product_code`, `name`, `brand`, `price`, `stock`, `category`) según el diccionario y las prioridades del Business Vertical activo (`growshop`, `ferreteria`, `repuestos`, `indumentaria`).
- **`normalizeRow(rawRow, mappings, verticalCode)`:** Limpia divisas (`$ 1.500,00` $\rightarrow$ `1500.00`), coacciona tipos de datos y calcula la puntuación de confianza (`confidence` entre `0.00` y `1.00`).
- **`detectDuplicates(normalizedData, existingCatalog)`:** Compara contra el catálogo activo por SKU, EAN o nombre normalizado. Si existe coincidencia incierta, marca la fila como `DUPLICATE` exigiendo revisión manual.

---

## 2. Puntuación de Confianza (`confidence score`)

- **High Confidence ($\ge 0.85$):** La fila pasa automáticamente a estado `VALID` (Badge Verde).
- **Medium/Low Confidence ($< 0.85$):** La fila pasa a estado `WARNING` / `REQUIRES_REVIEW` (Badge Naranja) obligando la inspección en Staging.
- **Error Grave:** Si el valor numérico no se puede coercionar (ej: `"gratis"` en columna de precio), la fila pasa a `ERROR` impidiendo la importación hasta ser corregida.

---

**ESTADO: FASE 9 — AI MIGRATION CENTER CERTIFICADA**
