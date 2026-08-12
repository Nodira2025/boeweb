# CATALOG MAPPING SPECIFICATION — BÔ GROW CLUB (FASE 9)
## Especificación de Mapeo, Diccionario de Aliases & Plantillas Reutilizables

**Proyecto:** `boeweb` (Plataforma SaaS Multi-Tenant)

---

## 1. Diccionario Estándar de Mapeo (`COLUMN_DICTIONARY`)

| Atributo Destino | Aliases Reconocidos por IA | Regla de Transformación |
| :--- | :--- | :--- |
| **`product_code`** | `cod_art`, `codigo`, `cod`, `sku`, `art`, `part_number`, `oem`, `id_producto` | Trim + Uppercase |
| **`name`** | `descripcion`, `nombre`, `producto`, `articulo`, `desc`, `detalle`, `item` | Clean String |
| **`brand`** | `marca`, `laboratorio`, `fabricante`, `brand`, `make` | Titlecase |
| **`price`** | `pvp`, `precio`, `precio_publico`, `precio_venta`, `costo`, `valor`, `price` | Currency Clean $\rightarrow$ Float |
| **`stock`** | `cant`, `cantidad`, `stock`, `unidades`, `disponible`, `qty` | Integer Coercion |
| **`category`** | `categoria`, `rubro`, `linea`, `familia`, `grupo` | Titlecase |
| **`barcode`** | `ean`, `upc`, `codigo_barras`, `barcode`, `gtin` | Numeric String |

---

## 2. Acciones Registradas por Fila en Staging

- **`CREATE`:** El SKU o código no existe en el catálogo activo. Se insertará como nuevo producto.
- **`UPDATE`:** El SKU coincide con un producto existente. Se actualizarán los campos mapeados conservando el ID interno.
- **`IGNORE`:** Fila omitida explícitamente por el operador durante la etapa de mapeo.

---

**ESTADO: FASE 9 — AI MIGRATION CENTER CERTIFICADA**
