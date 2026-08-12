# INFORME TÉCNICO DE CORRECCIÓN DE FRONTEND & POS ITEMIZADO — FASE 11A

## 1. Clasificación DOM & Resolución de Excepciones

Se realizó una revisión exhaustiva de todas las referencias al DOM en `vendedor.js` y `vendedor.html` para erradicar el error `Cannot read properties of null (reading 'addEventListener')`.

### Elementos Clasificados como REQUIRED (Obligatorios)
- `b2b-search-input`: Reincorporado en el contenedor principal del catálogo B2B.
- `b2b-product-grid`: Contenedor principal de renderizado de cuadrícula.
- `b2b-cart-trigger-btn`, `b2b-cart-drawer`, `b2b-cart-close-btn`: UI del drawer lateral.
- `b2b-checkout-form`: Formulario de checkout.

### Elementos Clasificados como OPTIONAL (Opcionales / Contextuales)
- `b2b-filter-supplier`: Filtro por proveedor B2B.
- `b2b-filter-stock`: Filtro de stock vendible.
- `b2b-mobile-filter-btn`, `b2b-mobile-home-btn`, `b2b-mobile-cart-btn`: Elementos de navegación móvil.
- `pos-barcode-input`, `pos-product-search`: Controles de la solapa POS Itemizado.

---

## 2. Nuevo Home Vendedor (Acciones Rápidas)

El inicio del vendedor (`#vendor-dashboard-home`) se simplificó para actuar como centro operativo enfocado exclusivamente en acciones rápidas:
1. 🛒 **Nueva Venta POS** (`switchVendorTab('pos')`)
2. 📷 **Escanear producto / QR** (`switchVendorTab('scan')`)
3. 🔍 **Buscar en catálogo** (`switchVendorTab('catalog')`)
4. 📦 **Pedidos & Solicitudes**
5. 💰 **Caja & Arqueo** (`switchVendorTab('cash')`)
6. ⌖ **Localizar en Depósito (WMS)** (`switchVendorTab('location-assistant')`)
7. 🔄 **Mover Stock (WMS)** (`switchVendorTab('wms')`)
8. 📋 **Auditorías de Inventario**

---

## 3. POS Itemizado

Flujo operacional: `NUEVA VENTA` $\rightarrow$ `SELECCIÓN VENDEDOR` $\rightarrow$ `AGREGAR ÍTEMS` $\rightarrow$ `MÉTODOS DE PAGO` $\rightarrow$ `GENERAR DRAFT`.

### Vías de Ingreso de Productos:
- **Lector de Código de Barras:** Input con foco rápido que agrega automáticamente el producto al presionar Enter o escanear.
- **Búsqueda por Nombre / SKU:** Filtrado en tiempo real con debounce.
- **Dictado por Voz:** Integración con `SpeechRecognition` en es-AR que escribe en el cuadro de búsqueda (únicamente búsqueda, sin auto-confirmación ciega).

---

## 4. Separación de Identidades (Cajero Auth vs Vendedor Mostrador)

- `cashier_user_id` + `cashier_name_snapshot`: Obtenidos desde `SaasAuth.getTenantContext()` (ej. Profesor Franco).
- `salesperson_user_id` + `salesperson_name_snapshot`: Desplegable alimentado dinámicamente desde `SaasAuth.getTenantUsers()`, reflejando usuarios reales activos del tenant en PostgreSQL (`tenant_users`).
