# GUÍA DE DEMOSTRACIÓN SAAS MULTI-TENANT (3 A 5 MINUTOS)
## BÔ Grow Club / Plataforma SaaS — Fundación, Roles y Aislamiento

Esta guía describe los pasos recomendados para presentar las capacidades multi-empresa y de seguridad en vivo ante el equipo directivo o inversores.

---

## ⏱️ Minuto 1: Contexto de Plataforma & Identidad Superadmin
1. Abrir `http://127.0.0.1:4173/vendedor.html` en el navegador.
2. Observar en la parte superior derecha de la barra de encabezado el panel contextual de la plataforma SaaS:
   - **Empresa / Tenant:** `BÔ Grow Club`
   - **Usuario Autenticado:** `Profesor Franco`
   - **Badge de Rol:** `SUPERADMIN` (color Violeta)

---

## ⏱️ Minuto 2: Selector de Empresa (Superadmin Override)
1. Como usuario **`SUPERADMIN`**, desplegar el selector de empresa en el encabezado.
2. Seleccionar la opción **`Empresa B Demo (Ferretería Norte)`**.
3. **Observar en pantalla:**
   - La plataforma cambia dinámicamente de contexto al Tenant B (`Empresa B Demo`).
   - El inventario WMS y los datos operativos se filtran automáticamente mostrando la información perteneciente a la empresa seleccionada.

---

## ⏱️ Minuto 3: Cambio de Usuario & Prueba de Permisos (VENDEDOR)
1. Hacer clic en el botón **`🔑 Cambiar`** en la barra superior.
2. En el modal de inicio de sesión:
   - Seleccionar **`BÔ Grow Club (Tenant #1)`**.
   - Ingresar **Nombre:** `Vendedor BÔ`.
   - Seleccionar **Rol:** `🛒 VENDEDOR`.
   - Hacer clic en **`⚡ INICIAR SESIÓN SEGURA`**.
3. **Observar en pantalla:**
   - El badge de rol cambia a `VENDEDOR` (color Verde Foresta).
   - El selector de empresas para alternar a Tenant B **desaparece automáticamente**, restringiendo el acceso del vendedor exclusivamente a BÔ Grow Club.

---

## ⏱️ Minuto 4: Demostración de Aislamiento de Datos & WMS
1. En la barra lateral izquierda, hacer clic en **`📦 WMS Inventario QR`**.
2. Verificar que las operaciones WMS (transferencias, auditorías, historial) registran el operador activo con su rol SaaS correspondiente.
3. Volver a hacer clic en **`🔑 Cambiar`** y restablecer el usuario a **`Profesor Franco` (`SUPERADMIN`)**.

---

**ESTADO: FASE 7 — FUNDACIÓN SAAS MULTI-TENANT CERTIFICADA**
