# ESPECIFICACIÓN TÉCNICA DE UNIFICACIÓN DE CATÁLOGO PÚBLICO — FASE 11A

## 1. Reglas Canónicas de Unificación (`PublicCatalogUnifier`)

1. **Badge 🟢 EN STOCK:**
   Se otorga **únicamente** cuando el inventario propio registrado (`on_hand_sellable` o `inventory_locations`) es estrictamente mayor a 0 (`own_stock > 0`).

2. **Badge 📦 A PEDIDO:**
   Se otorga cuando el producto no posee saldo en inventario propio (`own_stock = 0`), pero existe oferta de proveedores B2B.

3. **Deduplicación en Ficha Única:**
   Si un producto posee stock propio y simultáneamente existe en catálogos de proveedores B2B, se renderiza **una sola ficha consolidada**. La prioridad de despacho y precio de lista es el **stock propio**; las ofertas de proveedores quedan asignadas como opciones secundarias.

4. **Inmunidad de Saldos:**
   **Bajo ninguna circunstancia se suma `supplier_products.stock` a `own_stock`.** El stock de proveedores externos jamás altera los contadores de inventario propio.
