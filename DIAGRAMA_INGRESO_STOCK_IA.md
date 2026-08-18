# Arquitectura y Cruce de Datos: Ingreso de Producto con IA y Criterio Dinámico

Este documento detalla el flujo de información, cruce de datos, inferencia con IA y resolución de códigos QR para el módulo de ingreso de stock.

---

## 📊 Diagrama de Flujo General (Mermaid)

```mermaid
flowchart TD
    %% --- PASO 0: CRITERIO ---
    subgraph S0["0. Configuración de Criterio (País & Rubro)"]
        UI_Crit["Modal: Cambiar Criterio<br/>(País: Perú, Argentina... / Rubro: Farmacia, Verdulería...)"]
        LS[("LocalStorage / Contexto de Sesión")]
        UI_Crit -->|Guarda selección| LS
    end

    %% --- PASO 1: ENTRADAS ---
    subgraph S1["1. Entrada de Datos en Stock Entry"]
        IN_Barcode["📷 Escaneo Código de Barras<br/>(Lector USB / Cámara)"]
        IN_Text["⌨️ Búsqueda por Texto o 🎙️ Dictado por Voz<br/>(Reconocimiento de voz según idioma del país)"]
        IN_Photo["📸 Foto del Envase / Producto<br/>(Cámara o Galería)"]
    end

    LS -.->|Aplica país y rubro activo| S1

    %% --- PASO 2: BACKEND & CRUCE DE DATOS ---
    subgraph S2["2. Motor de Cruce de Datos & IA (Serverless Backend)"]
        direction TB
        
        subgraph LookupService["lookup-product.mjs (Búsqueda Web Híbrida)"]
            DB_Local[("Catálogo Local Supabase<br/>(Tenant Products)")]
            API_UPC["OpenFoodFacts / UPCItemDB<br/>(Bases Globales de Código)"]
            API_ML["Mercado Libre API<br/>(MLA = AR, MPE = PE, MLC = CL...)"]
            WEB_Search["Google / Yahoo Search Scraper<br/>('Query + Rubro + País')"]
        end

        subgraph AIService["analyze-product.mjs (Visión Multimodal)"]
            AI_Prompt["Prompt Dinámico Parametrizado<br/>('Experto en {Rubro} de {País}')"]
            AI_Model["OpenAI / OpenRouter<br/>(Extracción de Marca, Dosis, Presentación, etc.)"]
            AI_Prompt --> AI_Model
        end
    end

    IN_Barcode -->|Consulta código + país + rubro| LookupService
    IN_Text -->|Consulta nombre + país + rubro| LookupService
    IN_Photo -->|Envía imagen + pistas| AIService

    %% --- PASO 3: MERGE & PRESENTACIÓN ---
    subgraph S3["3. Consolidación de Información"]
        MergeEngine["mergeStockLookupResults()<br/>Fusión y ponderación de fuentes confiables"]
        FormAutofill["Autocompletado en Formulario Paso 2<br/>(Nombre, Marca, Presentación, Categoría, Precio Estimado)"]
        Validation["Validación del Vendedor<br/>(Ajuste de Stock y Precio Final de Venta)"]
        
        LookupService --> MergeEngine
        AIService --> MergeEngine
        MergeEngine --> FormAutofill
        FormAutofill --> Validation
    end

    %% --- PASO 4: GUARDADO Y GENERACIÓN QR ---
    subgraph S4["4. Persistencia y Generación de QR Universal"]
        SaveDB[("Base de Datos (Supabase)<br/>Tabla: products / product_drafts")]
        GenCode["Generación de Código Interno Único<br/>BO-YYYYMMDD-XXXX"]
        GenQR["Generación de Código QR Universal<br/>URL: https://tudominio.com/?product=BO-..."]
        
        Validation -->|Confirmar Ingreso| SaveDB
        SaveDB --> GenCode
        GenCode --> GenQR
    end

    %% --- PASO 5: ESCANEO DE QR POSTERIOR ---
    subgraph S5["5. Consumo del Código QR (Doble Propósito)"]
        QR_Scan["📱 Escaneo del QR en el Producto"]
        IsClient{"¿Quién escanea?"}
        
        QR_Scan --> IsClient
        
        ClientView["🛍️ Vista Cliente (index.html?product=BO-...)<br/>Abre Ficha Técnica: Fotos, Precio, Stock y Botón de Compra"]
        SellerView["🏪 Vista Vendedor (vendedor.html?product=BO-...)<br/>Carga rápida en Caja POS / Ajuste de Stock en WMS"]
        
        IsClient -->|Cliente con móvil| ClientView
        IsClient -->|Vendedor en POS| SellerView
    end

    GenQR -.->|Etiqueta impresa en góndola o caja| QR_Scan
```

---

## 🔍 Detalle del Cruce de Datos por Capa

| Capa | Entrada | Lógica de Procesamiento | Salida Contextualizada |
| :--- | :--- | :--- | :--- |
| **0. Criterio** | Selección de País + Rubro | Persiste en `localStorage` y actualiza la interfaz. | Contexto activo: ej. `🇵🇪 Perú` + `💊 Farmacia`. |
| **1. Dictado / Texto** | Voz del vendedor | Usa `recognition.lang = 'es-PE'` para no forzar jerga argentina. | Transcripción limpia del nombre o código. |
| **2. Búsqueda Web** | Código o Nombre | Consulta Mercado Libre Perú (`MPE`) y agrega sufijo `"${query} farmacia Peru"`. | Precios en Soles (PEN), marcas peruanas, fichas técnicas locales. |
| **3. Análisis de Foto** | Imagen del envase | El modelo de IA recibe las directivas del rubro farmacéutico (principio activo, mg, laboratorio). | JSON estructurado con datos exactos del rubro. |
| **4. QR Universal** | Producto guardado | Crea enlace `/?product=BO-...` e imprime etiqueta térmica o visualiza en pantalla. | QR escaneable por clientes y empleados. |
