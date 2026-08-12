# GUÍA DE PRESENTACIÓN DEMO WMS (5 MINUTOS)
## BÔ Grow Club — Sistema de Localización y Trazabilidad de Inventario Físico

Esta guía describe el recorrido recomendado paso a paso para presentar la solución WMS funcionando en vivo ante clientes, inversores o el equipo operativo.

---

## ⏱️ Minuto 1: El Problema & La Solución
- **El Problema:** Un vendedor sabe que un producto existe en stock, pero no sabe exactamente en qué estante o nivel del depósito o local encontrarlo.
- **La Solución:** Convertir la ubicación física en información digital estructurada mediante códigos QR por módulo y referencias humanas (*Nivel 1 — abajo* hasta *Nivel 5 — arriba*).

---

## ⏱️ Minuto 2: Exploración de Módulos Físicos & Escaneo QR
1. Abrir `http://127.0.0.1:4173/vendedor.html` en el navegador.
2. En la barra lateral izquierda, hacer clic en **📦 WMS Inventario QR**.
3. Hacer clic en **📷 Escanear QR Módulo**.
4. Seleccionar el módulo demo **`PI-M04`** (Pared Izquierda - Módulo Principal Botánico) y hacer clic en **⚡ ABRIR MÓDULO SELECCIONADO**.
5. **Mostrar en Pantalla:**
   - La estructura de productos ordenada por **Niveles Humanos**:
     - *Nivel 4 — alto (Derecha): Top Crop Top Bud (14 u.)*
     - *Nivel 3 — altura media (Centro): Sustrato Klasmann 50L (25 u.)*
     - *Nivel 2 — bajo (Izquierda): Mamboretá ABA (8 u.)*

---

## ⏱️ Minuto 3: Búsqueda Inversa (Multi-Ubicación)
1. Cerrar la ventana del módulo y hacer clic en **🔍 Búsqueda Inversa**.
2. Escribir `"Sustrato"` o `"7791234001"`.
3. **Mostrar en Pantalla:**
   - El encabezado **`STOCK FÍSICO LOCALIZADO: 38 u.`**
   - El desglose multi-ubicación del mismo SKU:
     - `PI-M04`: 25 u. en *Nivel 3 — altura media*
     - `PD-M02`: 10 u. en *Nivel 2 — bajo*
     - `DEP-M01`: 3 u. en *Nivel 5 — arriba (Depósito)*

---

## ⏱️ Minuto 4: Transferencia Atómica entre Módulos
1. En los resultados de búsqueda, hacer clic en el botón **`Ir al módulo`** de `PI-M04`.
2. En la lista del producto Sustrato Klasmann, hacer clic en **`⇄ Mover`**.
3. Indicar **`Cantidad: 5`**.
4. Seleccionar como **Módulo Destino: `PD-M02` (Pared Derecha)**.
5. Seleccionar **`Nivel 2 — bajo`** / **`Sector Centro`**.
6. Hacer clic en **`⚡ CONFIRMAR TRANSFERENCIA`**.
7. **Mostrar en Pantalla:**
   - El comprobante atómico **"✅ MOVIMIENTO COMPLETADO"** con el detalle de Origen, Destino, Operador y Hora.
   - Hacer clic en **`👁️ VER CONTENIDO DEL DESTINO`** y verificar que el Módulo `PD-M02` ahora cuenta con las 5 unidades adicionales.

---

## ⏱️ Minuto 5: Auditoría Física & Trazabilidad Inmutable
1. En la vista del módulo `PD-M02`, hacer clic en el botón **`📋 AUDITAR MÓDULO`**.
2. Simular un conteo donde se reporta 1 unidad de diferencia.
3. Hacer clic en **`🟠 REPORTAR DIFERENCIA`**.
4. **Mostrar la Regla de Seguridad:**
   - La alerta visual confirma que la auditoría quedó como **PENDIENTE DE REVISIÓN** y que **el stock comercial no se alteró automáticamente**.
5. Hacer clic en **`📋 Historial Inmutable`** para mostrar la bitácora append-only con la trazabilidad completa del turno.

---

**ESTADO: WMS DEMO FUNCIONAL — FASES 1 A 5 COMPLETADAS**  
**FASE 6 POS/VENTAS: NO IMPLEMENTADA.**
