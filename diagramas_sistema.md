# 📐 BÔ GROW CLUB — DIAGRAMAS ARQUITECTÓNICOS Y FLUSJOS DEL SISTEMA

Este documento contiene los diagramas de arquitectura, flujos de datos, procesos de negocio y mapas de jerarquía del ecosistema **BÔ Grow Club**. Están diseñados en formato estándar **Mermaid** y **SmartArt Markdown** para ser interpretados por humanos y procesados por otros agentes de IA.

---

## 🏗️ 1. ARQUITECTURA GENERAL DEL ECOSISTEMA (Component Diagram)

```mermaid
graph TD
    subgraph CLIENT_TOUCHPOINTS ["🖥️ Canales & Pantallas de Usuario (HTML5)"]
        UI_STORE["🛒 index.html<br/>(Storefront E-Commerce & B2B)"]
        UI_POS["🏪 vendedor.html<br/>(Portal Vendedor & POS)"]
        UI_VIP["💳 perfil.html<br/>(Portal Miembros VIP)"]
        UI_MED["🩺 pacientes.html<br/>(Sistema Clínico REPROCANN)"]
        UI_COFFEE["☕ coffee.html<br/>(BÔ Coffee & Lounge POS)"]
        UI_TABLET["📱 tablet.html<br/>(Kiosco Auto-Servicio)"]
        UI_TV["📺 tv.html<br/>(Cartelera Digital Signage)"]
        UI_ADMIN["⚙️ admin-config.html<br/>(Panel de Configuración)"]
        UI_ACADEMY["🎓 academy.js<br/>(BÔ Academy Courses)"]
    end

    subgraph LOGIC_LAYER ["🧠 Capa de Inteligencia & Módulos JS"]
        JS_INDEX["index.js<br/>(Catalog & Cart Engine)"]
        JS_VENDOR["vendedor.js<br/>(POS Cash, Drafts & Portfolio)"]
        JS_MAP["mapa-local.js<br/>(2.5D Architectural Map Engine)"]
        JS_MEMBER["memberPortal.js<br/>(VIP QR & Seeds Gamification)"]
        JS_PATIENT["pacientes.js<br/>(REPROCANN Intakes & Doctors)"]
        JS_COFFEE["coffee.js<br/>(Barismo & Table Commands)"]
        JS_DRBO["drbo.js<br/>(Dr. BÔ AI Cannabis Medical Chat)"]
        JS_THEME["theme.js<br/>(Zen Theme Switcher Engine)"]
    end

    subgraph DATA_PERSISTENCE ["🗄️ Capa de Almacenamiento & Datos"]
        LOCAL_STORAGE[("💾 LocalStorage & SessionStorage<br/>(Carrito, Tema, POS Shift, Map Layout)")]
        STATIC_JSON[("📄 Datasets Estáticos<br/>(products.json & articles.json)")]
        
        subgraph SUPABASE_CLOUD ["☁️ Supabase Cloud (PostgreSQL 15+)"]
            DB_ORDERS[("orders<br/>(Registro de Pedidos)")]
            DB_DRAFTS[("product_drafts<br/>(Borradores de Stock)")]
            DB_PATIENTS[("patient_intakes & specialists<br/>(Registro REPROCANN)")]
            DB_CONFIG[("store_config<br/>(Pasarelas & Ajustes)")]
            STORAGE_BUCKET[("product-images<br/>(Storage Bucket)")]
        end
    end

    subgraph LOCAL_INFRA ["🚀 Infraestructura de Ejecución"]
        BAT_SERVER["iniciar.bat<br/>(Servidor HTTP Standalone Node.js en puerto 4173)"]
    end

    CLIENT_TOUCHPOINTS --> LOGIC_LAYER
    LOGIC_LAYER --> LOCAL_STORAGE
    LOGIC_LAYER --> STATIC_JSON
    LOGIC_LAYER --> SUPABASE_CLOUD
    BAT_SERVER --> CLIENT_TOUCHPOINTS
```

---

## 🔄 2. FLUJO DE CARGA DE DATOS & FALLBACK OFFLINE-FIRST (Flowchart)

Este flujo garantiza que el catálogo siempre funcione, incluso si falla la conexión a internet o a Supabase.

```mermaid
flowchart TD
    A["🚀 Inicio de Carga de Aplicación (index.html)"] --> B["🔍 Intentar Fetch Local de products.json"]
    
    B -->|✅ Éxito (Respuesta OK)| C["📦 Cargar Catálogo Maestro desde JSON Estático"]
    B -->|❌ Fallo / Error CORS / Archivo No Encontrado| D["☁️ Activar Fallback: Consulta a Supabase API"]
    
    D -->|✅ Supabase Disponible| E["📦 Cargar Catálogo desde Tabla Supabase products"]
    D -->|❌ Sin Conexión| F["💾 Cargar Último Catálogo Cacheado en LocalStorage"]

    C --> G["🎨 Renderizar Grid de Productos & Categorías"]
    E --> G
    F --> G

    G --> H["📊 Ejecutar updateCategoryCounts() para Badges Ddinámicos"]
    H --> I["🔄 Inicializar Buscador & Filtros Facetados"]
```

---

## 🛒 3. FLUJO DE VENTA EN POS VENDEDOR & CIERRE DE CAJA (Sequence Diagram)

```mermaid
sequenceDiagram
    autonumber
    actor Vendedor as 👤 Vendedor / Cajero
    participant POS as 🏪 vendedor.html / vendedor.js
    participant Storage as 💾 LocalStorage / SessionStorage
    participant Cloud as ☁️ Supabase Cloud DB
    actor Admin as 👑 Administrador BÔ

    Note over Vendedor, POS: Inicio de Turno y Operación
    Vendedor->>POS: Ingresa credenciales de Vendedor Autorizado
    POS->>Storage: Valida sesión y carga Launchpad de accesos
    
    Vendedor->>POS: Registra ventas del turno (Efectivo / Transferencia / QR)
    POS->>Storage: Acumula órdenes en memoria del POS

    Note over Vendedor, Admin: Cierre de Turno & Arqueo de Caja
    Vendedor->>POS: Selecciona "Realizar Cierre de Caja y Fin de Turno"
    POS->>Vendedor: Despliega modal de desglose de billetes ($10.000, $2.000, etc.)
    Vendedor->>POS: Ingresa recuento físico de billetes
    POS->>POS: Calcula diferencia automática (Efectivo Sistema vs Recreo Físico)
    
    Vendedor->>POS: Solicita Validación de Cierre
    POS->>Admin: Requiere PIN de Seguridad Admin (PIN: 2025 / admin123)
    Admin->>POS: Ingresa PIN de Autorización
    POS->>Cloud: Persiste informe consolidado de turno en tabla `orders`
    POS->>Vendedor: Muestra comprobante de Cierre Exitoso con Resumen Arqueado
```

---

## 📸 4. FLUJO DE CARGA RÁPIDA DE STOCK & BORRADORES (State Diagram)

Diagrama de estados para la subida de productos por parte de vendedores sin riesgo de alterar el catálogo oficial sin aprobación.

```mermaid
stateDiagram-v2
    [*] --> FotoCapturada: Vendedor toma/sube foto de producto
    FotoCapturada --> FormularioCompletado: Ingresa Stock, Ubicación y Observaciones
    
    FormularioCompletado --> UploadStorage: Sube imagen a Supabase Bucket 'product-images'
    UploadStorage --> InsertDraft: Inserta registro en tabla 'product_drafts'
    
    state InsertDraft {
        [*] --> PENDING_REVIEW: Estado inicial por defecto
    }

    PENDING_REVIEW --> APPROVED: Admin revisa y aprueba borrador
    PENDING_REVIEW --> REJECTED: Admin rechaza por datos incorrectos

    APPROVED --> CatalogoOficial: Se integra al inventario activo
    REJECTED --> [*]: Se archiva o elimina borrador
```

---

## 🏬 5. MODELO JERÁRQUICO DE UBICACIÓN EN LOCAL (SmartArt Map)

Representación del modelo de coordenadas 3D de ubicación en el local:

```
[📍 SUCURSAL BÔ CENTRO]
 └── [📚 PISO DEL LOCAL]
      ├── Nivel 1 — Planta Baja
      ├── Nivel 2 — Entrepiso
      └── Nivel 3 — Depósito Alto
           └── [🏷️ ZONA DEL LOCAL]
                ├── Zona A: Vitrina Entrada / VIP (Dorado)
                ├── Zona B: Pasillo Botánico Central (Verde)
                ├── Zona C: Módulo Indoor Fondo (Azul)
                ├── Zona D: Depósito & Semillas (Púrpura)
                └── Zona E: Barra BÔ Coffee & Lounge (Ámbar)
                     └── [🗄️ ESTANTE / MUEBLE]
                          ├── A-1, A-2
                          ├── B-1, B-2
                          ├── C-1, C-2
                          ├── D-1, D-2
                          └── E-1, E-2
                               └── [📥 NIVEL INTERNO / BANDEJA]
                                    ├── Nivel 3 — Superior
                                    ├── Nivel 2 — Medio
                                    └── Nivel 1 — Inferior
```

---

## 💳 6. CICLO DE VIDA DEL CLIENTE VIP & REPROCANN (Activity Diagram)

```mermaid
flowchart LR
    subgraph REGISTRO ["1. Alta & Identificación"]
        A1["👤 Cliente se Registra en perfil.html"] --> A2["🔐 Genera Contraseña Segura"]
        A2 --> A3["🪪 Genera Pase Digital VIP con QR Único"]
    end

    subgraph BENEFICIOS ["2. Verificación REPROCANN"]
        B1["📄 Ingresa Código de Trámite REPROCANN"] --> B2["✅ Verificación de Estado (Vigente / En Trámite)"]
        B2 --> B3["🎉 Habilita automáticamente 15% OFF permanente"]
    end

    subgraph GAMIFICACION ["3. Acumulación & Misiones"]
        C1["🛒 Compras Presenciales / Web"] --> C3["🌱 Acredita BÔ Semillas"]
        C2["📲 Misiones (Instagram, GrowLog, Check-in)"] --> C3
    end

    subgraph RECOMPENSAS ["4. Canje & Niveles"]
        D1["🌱 BÔ Semillas Acumuladas"] --> D2["🎁 Canje en Mystery Lootboxes & Descuentos"]
        D1 --> D3["⭐ Ascenso de Rango VIP: Zen ➔ Botánico ➔ Maestro Grow"]
    end

    REGISTRO --> BENEFICIOS
    BENEFICIOS --> GAMIFICACION
    GAMIFICACION --> RECOMPENSAS
```

---

## 🗺️ 7. MAPA DE NAVEGACIÓN Y ARCHIVOS HTML/JS (SmartArt Hierarchy)

```
[🌐 ECOSISTEMA BÔ GROW CLUB]
 │
 ├── 🛒 STOREFRONT PÚBLICO
 │    ├── index.html ───────── index.js + storefront.css (Catálogo, Buscador, Carrito)
 │    ├── theme.js ─────────── Controller Global Switcher Tema Zen (Claro/Oscuro)
 │    └── mercadopago-checkout.js ─ Integración con Pasarela de Pago
 │
 ├── 🏪 OPERACIÓN Y PUNTO DE VENTA (POS)
 │    ├── vendedor.html ────── vendedor.js (Launchpad, Cierre de Caja, Borradores)
 │    └── mapa-local.js ────── Engine del Mapa Arquitectónico 2.5D & Muebles
 │
 ├── 💳 CLUB VIP Y SALUD
 │    ├── perfil.html ──────── memberPortal.js (Pase Digital QR, Semillas, Misiones)
 │    └── pacientes.html ───── pacientes.js (Sistema de Intakes Médicos REPROCANN)
 │
 ├── ☕ EXPERIENCIA EN LOCAL
 │    ├── coffee.html ──────── coffee.js (POS Barismo, Comandera Mesa 1-20)
 │    ├── tablet.html ──────── tablet.js (Kiosco Auto-Servicio en Sala)
 │    └── tv.html ──────────── tv.js (Cartelera Digital Signage Promocional)
 │
 └── 🛠️ HERRAMIENTAS ADICIONALES
      ├── drbo.js ──────────── Asistente IA Médico Cannabis
      ├── academy.js ───────── BÔ Academy (Cursos & Artículos)
      ├── admin-config.html ── admin-config.js (Configuración Admin Supabase/MP)
      └── iniciar.bat ──────── Servidor Local Standalone Node.js en puerto 4173
```

---

*Documento técnico de diagramas arquitectónicos de BÔ Grow Club generado exitosamente.*
