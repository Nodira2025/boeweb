# GUÍA DE DEMOSTRACIÓN DE FASE 9 (3 A 5 MINUTOS)
## BÔ Grow Club / Plataforma SaaS — AI Migration Center, Staging & Rollback Atómico

Esta guía describe los pasos recomendados para presentar el módulo de importación masiva en vivo.

---

## ⏱️ Minuto 1: Acceso al Migration Center & Wizard IA
1. Abrir `http://127.0.0.1:4173/vendedor.html` en el navegador.
2. En el menú lateral izquierdo, hacer clic en **`📥 Migration Center IA`**.
3. Hacer clic en **`➕ Nueva Migración con IA`**.
4. **Paso 1:** Seleccionar **`Catálogo Interno de Productos`**.

---

## ⏱️ Minuto 2: Carga de Archivo & Mapeo con IA (Demo Ferretería / Growshop)
1. Hacer clic en el botón **`🧪 Cargar CSV Demo Ferretería/Growshop`**.
2. **Paso 3 & 4 (Análisis & Mapeo):** Observar cómo la IA relaciona las columnas `COD_ART`, `DESCRIPCION`, `PVP` y `CANT` con los atributos del sistema (`product_code`, `name`, `price`, `stock`).

---

## ⏱️ Minuto 3: Staging, Confianza IA & Puerta de Aprobación Humana
1. **Paso 5 & 6 (Staging & Validación):** Observar el listado de productos en Staging con insignias de confianza (`98% Confianza`) y acción propuesta (`CREATE` / `UPDATE`). Ningún producto se ha insertado aún en producción.
2. **Paso 7 (Gatekeeper):** Ver la pantalla de confirmación obligatoria con advertencia de seguridad.
3. Hacer clic en **`⚡ APROBAR E IMPORTAR DENTRO DE PRODUCCIÓN`**.

---

## ⏱️ Minuto 4: Confirmación & Rollback Atómico
1. **Paso 8 (Completado):** Verificar la notificación de éxito y la creación del Snapshot de versión (`ver-01`).
2. En la tabla de historial de la parte inferior, hacer clic en **`↩️ Rollback Atómico`**.
3. **Observar:** El sistema restaura instantáneamente el catálogo al estado exacto previo a la migración.

---

**ESTADO: FASE 9 — AI MIGRATION CENTER CERTIFICADA**
