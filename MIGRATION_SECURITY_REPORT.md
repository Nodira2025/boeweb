# MIGRATION SECURITY REPORT — BÔ GROW CLUB (FASE 9)
## Seguridad en Ingesta de Archivos, Aislamiento RLS & Protección de Entornos

**Proyecto:** `boeweb` (Plataforma SaaS Multi-Tenant)  
**Fecha:** 12 de Agosto de 2026

---

## 1. Protección Contra Archivos Maliciosos

- **Inmunización Excel:** Se desactivan y descartan todas las macros VBA (`.xlsm`) y fórmulas ejecutables (`DDE` / `=CMD()`). Los archivos Excel se procesan como celdas de datos estáticos en texto plano.
- **Inmunización PDF:** Se extrae únicamente la estructura tabular sin ejecutar JavaScript o capas activas incrustadas.
- **Validación MIME & Tamaño:** Se limita el peso máximo a 5 MB y se rechaza cualquier ejecutable (`.exe`, `.bat`, `.sh`, `.php`, `.js`).

---

## 2. Aislamiento Multi-Tenant por RLS

- Las tablas `migration_jobs`, `migration_sources`, `migration_rows`, `migration_mappings` y `migration_versions` requieren que `tenant_id` coincida con la membresía del usuario autenticado en `tenant_users` (`role IN ('ADMIN', 'SUPERADMIN')`) o sea `public.is_superadmin()`.
- **Aislamiento B2B:** Los productos de proveedores importados mantienen su propio `supplier_id` sin mezclarse entre empresas. Un Admin de Tenant A no puede visualizar ni revertir trabajos de migración pertenecientes a Tenant B.

---

**ESTADO: FASE 9 — AI MIGRATION CENTER CERTIFICADA**
