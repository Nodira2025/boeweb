# ONBOARDING ARCHITECTURE — BÔ GROW CLUB (FASE 10)
## Orquestación de Módulos Certificados & Idempotencia de Activación

**Proyecto:** `boeweb` (Plataforma SaaS Multi-Tenant)

---

## 1. Integración de Módulos Existentes Sin Duplicar Código

El Onboarding Wizard no reimplementa funciones existentes, sino que orquesta los submódulos previamente certificados:

- **Identidad & Branding:** Orquesta `tenant-theme.js` y `tenant_profiles`.
- **Rubros Comerciales:** Consulta `business_verticals` (attribute_schema JSONB) de PostgreSQL.
- **Catálogo & Importaciones:** Vincula el `MigrationCenter` (`migration-ai.js` / `migration-center.js`).
- **Provisión de Usuarios:** Orquesta `saas-auth.js` y Supabase Auth.
- **Ubicaciones Físicas WMS:** Si el toggle WMS es `TRUE`, invoca `wms-inventory.test.mjs` / `mapa-local.js`.

---

## 2. Idempotencia y Protección Contra Doble-Submit

Si el usuario hace doble clic en el botón de **Activar Negocio**:
1. La función `TenantOnboarding.activateTenant()` detecta la existencia previa del slug o `tenant_id`.
2. Devuelve `{ success: true, idempotency: true }` sin crear duplicados en la base de datos.

---

**ESTADO: FASE 10 — ONBOARDING MULTI-TENANT CERTIFICADA AL 100%**
