# TENANT LIFECYCLE SPECIFICATION — BÔ GROW CLUB (FASE 10)
## Estados del Negocio (`SETUP`, `ACTIVE`, `SUSPENDED`, `ARCHIVED`)

**Proyecto:** `boeweb` (Plataforma SaaS Multi-Tenant)

---

## 1. Matriz de Estados de Licencia y Operación

| Estado Tenant | Operación Vendedores | Administración Admin | Consola Superadmin |
| :--- | :--- | :--- | :--- |
| **`SETUP`** | ❌ Denegado | ⚠️ En Configuración | ✅ Permitido |
| **`ACTIVE`** | ✅ Habilitado | ✅ Habilitado | ✅ Permitido |
| **`SUSPENDED`** | ❌ Denegado (Bloqueo RLS) | ❌ Denegado | ✅ Acceso Superadmin |
| **`ARCHIVED`** | ❌ Denegado | ❌ Denegado | ⚠️ Lectura de Auditoría |

---

## 2. Suspensión & Reactivación Limpia

- Al suspender un Tenant (`status = 'SUSPENDED'`), los usuarios normales no pueden realizar operaciones comerciales.
- Sus datos permanecen 100% protegidos e intactos en PostgreSQL.
- El Superadmin puede reactivarlo en cualquier momento a estado `ACTIVE` mediante la consola.

---

**ESTADO: FASE 10 — ONBOARDING MULTI-TENANT CERTIFICADA AL 100%**
