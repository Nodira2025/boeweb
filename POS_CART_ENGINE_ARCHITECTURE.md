# ARQUITECTURA DEL MOTOR DE CARRITO UNIFICADO (POS_CART_ENGINE) — FASE 11A

## 1. Mapeo de Contextos y Aislamiento de Storage

El motor `PosCartEngine` centraliza la lógica de ítems, totales y subclaves de almacenamiento para evitar la contaminación cruzada entre operaciones:

```text
               PosCartEngine
                     │
     ┌───────────────┼───────────────┐
     ▼               ▼               ▼
   mode =          mode =          mode =
   'POS'       'B2B_PURCHASE'  'PUBLIC_ORDER'
     │               │               │
  Storage:        Storage:        Storage:
boeweb_cart_pos boeweb_cart_b2b boeweb_cart_pub
```

---

## 2. Estructura Canónica del Ítem de Carrito POS

```json
{
  "id": "SKU-01",
  "product_code": "SKU-01",
  "name": "BioBizz Bio Grow 1 L",
  "price": 15000,
  "quantity": 2,
  "availability": "EN_STOCK",
  "supplier_code": "own",
  "image_url": "assets/logo.jpg"
}
```

---

## 3. Compatibilidad con Caja Legacy

- Las ventas registradas mediante el POS Itemizado en Fase 11A generan automáticamente una vista previa y un registro en `localStorage` bajo el concepto `venta_efectivo` si la forma de pago es efectivo.
- Esta sección está explícitamente documentada como `LEGACY LOCALSTORAGE CASH` y será migrada a tablas de base de datos en las Fases 11B y 12.
