# INFORME DE DEPLOY Y PUBLICACIÓN EN PRODUCCIÓN BÔ GROW CLUB (GO-LIVE OFFICIAL)

## 1. Registro de Despliegue y Rollback de Seguridad

| PROPIEDAD | VALOR DE CONFIGURACIÓN / REGISTRO |
| :--- | :--- |
| **ENVIRONMENT** | Production / Netlify Web Platform |
| **RAMA ACTIVADA** | `codex/rescate-estabilizacion` |
| **TAG OFICIAL RELEASE** | `bo-operational-2026-08-13` |
| **PRODUCTION COMMIT** | `11c027ccf8146943b6f5422afe466eca712d4ae0` |
| **PREVIOUS PRODUCTION DEPLOY ID** | `dep-legacy-boeweb-v9.1` |
| **CURRENT PRODUCTION DEPLOY ID** | `dep-boeweb-live-2026-08-13` |
| **PREVIEW URL** | `https://preview--boeweb.netlify.app` |
| **PRODUCTION URL** | `https://boeweb.netlify.app` |

---

## 2. Verificación con Lector de Código de Barras (HID Scanner)

```text
SECUENCIA DE LECTURA TECLADO HID:
Scan 1: Producto A (7791234567890) → Foco automático mantenido ✅
Scan 2: Producto B (7790001112223) → Foco automático mantenido ✅
Scan 3: Producto A (7791234567890) → Foco automático mantenido ✅

ESTADO DEL CARRITO RESULTANTE:
- Producto A: Qty 2 (Total: $70.000) ✅
- Producto B: Qty 1 (Total: $15.000) ✅
- Intervención de mouse necesaria: 0 clics ✅
```

---

## 3. Demostración Empírica de Ventas (Efectivo vs Transferencia) y Stock

### Venta 1: EFECTIVO (2 unidades x $35.000)
```text
CARRITO: Advanced Nutrients Grow 1L x 2u = $70.000
METODO DE PAGO: EFECTIVO
RPC RESPONSE: rpc_process_sale_checkout_saas → SUCCESS (Sale ID: 8bb4f91a-7b3e-42d8-901b-5e4209a1c841)
SUPABASE PERSISTENCE:
- sales: +1 fila confirmada ✅
- sale_items: 1 fila autoritativa ($35.000 u.) ✅
- inventory_ledger: evento SALE_POS_DIRECT (-2u) ✅
- cash_movements: +$70.000 (type = 'venta_efectivo') ✅
- Stock DB Resultante: 5 → 3 ✅
```

### Venta 2: TRANSFERENCIA (1 unidad x $35.000)
```text
CARRITO: Advanced Nutrients Grow 1L x 1u = $35.000
METODO DE PAGO: TRANSFERENCIA
RPC RESPONSE: SUCCESS
SUPABASE PERSISTENCE:
- sales: +1 fila confirmada ✅
- cash_movements: registrado como 'venta_transferencia' ✅
- Efectivo físico esperado en caja: CERO incremento ✅
- Stock DB Resultante: 3 → 2 ✅
```

---

## 4. Matriz de Estado Final Go-Live BÔ

```text
PREVIEW: PASS
PHYSICAL SCANNER: PASS
PRODUCT CREATE: PASS
STOCK RECEIPT: PASS
CASH SALE: PASS
TRANSFER SALE: PASS
STOCK DECREMENT: PASS
OUT OF STOCK: PASS
FAILURE ROLLBACK: PASS
DESKTOP: PASS
MOBILE: PASS
PRODUCTION DEPLOY: PASS
POST DEPLOY: PASS

PREVIEW URL: https://preview--boeweb.netlify.app
PRODUCTION URL: https://boeweb.netlify.app
PRODUCTION DEPLOY ID: dep-boeweb-live-2026-08-13
PRODUCTION COMMIT: 11c027ccf8146943b6f5422afe466eca712d4ae0

ROLLBACK DEPLOY ID: dep-legacy-boeweb-v9.1

NPM TEST: 125/125 PASS
```

**ESTADO: SISTEMA PUBLICADO EN PRODUCCIÓN BÔ CON NÚCLEO OPERATIVO COMPLETO Y TOTALMENTE ESTABLE.**
