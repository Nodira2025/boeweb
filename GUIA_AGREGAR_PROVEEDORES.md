# 📦 Guía: Cómo Agregar un Nuevo Proveedor al Sistema

Esta guía explica paso a paso cómo integrar un nuevo proveedor al portal B2B de BO growclub.

---

## Paso 1: Registrar el proveedor en Supabase

Entrá al panel de tu Supabase → **SQL Editor** y ejecutá:

```sql
INSERT INTO suppliers (id, name, website) VALUES
('nuevo_proveedor', 'Nombre del Proveedor', 'https://www.ejemplo.com/')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, website = EXCLUDED.website;
```

> **Importante:** El `id` tiene que ser una palabra corta en minúscula sin espacios ni acentos (ej: `maryplant`, `highgrow`, etc.). Ese ID se va a usar en todo el sistema.

---

## Paso 2: Agregar la opción de filtro en `vendedor.html`

Buscá la sección del `<select id="b2b-filter-supplier">` (alrededor de la línea 795) y agregá una nueva `<option>`:

```html
<option value="nuevo_proveedor">Nombre del Proveedor</option>
```

---

## Paso 3: Agregar el nombre de display en `vendedor.js`

Buscá el objeto `supplierNames` al inicio del archivo (alrededor de la línea 16) y agregá:

```javascript
const supplierNames = {
  'astrogrow': 'AstroGrow',
  'santaplanta': 'Santa Planta',
  'rosse': 'Distribuidora Rosse',
  'candyclub': 'Candy Club',
  'nuevo_proveedor': 'Nombre del Proveedor'  // ← NUEVO
};
```

---

## Paso 4: Cargar productos del nuevo proveedor

Tenés dos formas:

### Opción A: Manual (desde Supabase)

1. Ir a la tabla `supplier_products` en el panel de Supabase
2. Insertar filas manualmente con:
   - `supplier_id`: el ID del nuevo proveedor (ej: `nuevo_proveedor`)
   - `supplier_product_id`: ID del producto en la web del proveedor
   - `name`: Nombre del producto
   - `price`: Precio numérico
   - `stock`: Cantidad disponible (o NULL si no aplica)
   - `available`: true o false
   - `image`: URL de la imagen
   - `link`: URL al producto en la web del proveedor
   - `mapped_product_id`: El ID del producto base en la tabla `products` (si existe un equivalente)

### Opción B: Scraper automático (recomendado)

1. Abrir el archivo `scripts/sync_suppliers.js`
2. Agregar una nueva función de scraping, por ejemplo:

```javascript
async function scrapeNuevoProveedor() {
  // Si es WooCommerce (la mayoría de las tiendas del rubro):
  const baseUrl = 'https://www.ejemplo.com/wp-json/wc/store/v1/products';
  let page = 1;
  let allProducts = [];

  while (true) {
    const res = await fetch(`${baseUrl}?page=${page}&per_page=100`);
    if (!res.ok) break;
    const products = await res.json();
    if (products.length === 0) break;
    allProducts = allProducts.concat(products);
    page++;
  }

  // Mapear al formato de supplier_products
  for (const prod of allProducts) {
    await upsertSupplierProduct({
      supplier_id: 'nuevo_proveedor',
      supplier_product_id: String(prod.id),
      name: prod.name,
      price: parseFloat(prod.prices?.price || 0) / 100,
      stock: prod.stock_quantity,
      available: prod.is_in_stock,
      image: prod.images?.[0]?.src || null,
      link: prod.permalink
    });
  }
}
```

3. Llamar esa función en el flujo principal del script.

---

## Paso 5: Mapear productos (matching)

Para que la comparación de precios funcione, los productos del nuevo proveedor deben estar **mapeados** al catálogo base (tabla `products`).

Esto se hace poniendo el `mapped_product_id` correcto en cada fila de `supplier_products`:

```sql
-- Ejemplo: mapear un producto del nuevo proveedor al producto base existente
UPDATE supplier_products 
SET mapped_product_id = 'id-del-producto-base'
WHERE supplier_id = 'nuevo_proveedor' 
AND supplier_product_id = 'id-original-del-proveedor';
```

> **Tip:** El script `sync_suppliers.js` ya tiene una función de fuzzy matching que intenta hacer esto automáticamente comparando nombres. Si no matchea, queda sin mapear y no aparece comparación.

---

## Resumen Visual

| Paso | Archivo | Qué hacer |
|------|---------|-----------|
| 1 | Supabase SQL | INSERT en tabla `suppliers` |
| 2 | `vendedor.html` | Agregar `<option>` en el select de filtro |
| 3 | `vendedor.js` | Agregar entrada en `supplierNames` |
| 4 | Supabase / Script | Cargar productos en `supplier_products` |
| 5 | Supabase | Mapear con `mapped_product_id` |

---

## ¿Cómo sé si un proveedor es WooCommerce?

La mayoría de las tiendas de growshops en Argentina usan WooCommerce. Podés verificar visitando:

```
https://www.ejemplo.com/wp-json/wc/store/v1/products?per_page=1
```

Si devuelve un JSON con productos, es WooCommerce y el scraper funciona directo.

Si no, preguntame y vemos cómo adaptar el scraper para ese proveedor específico.
