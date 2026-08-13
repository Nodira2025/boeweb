# ARQUITECTURA DE RELEASE ENGINEERING Y DESPLIEGUE — FASE 15

## 1. Matriz de Componentes y Despliegue

```text
       ┌────────────────────────────────────────────────────────┐
       │                NETLIFY HOSTING & CDN                   │
       │ (vendedor.html, index.html, JS bundles, netlify.toml)  │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
                   PRE-DEPLOY PREFLIGHT VERIFICATION
                      (release-preflight check)
                                   │
                                   ▼
                      MIGRACIONES DB INCREMENTALES
                   (Pattern: EXPAND -> DEPLOY -> CONTRACT)
                                   │
       ┌───────────────────────────┴────────────────────────────┐
       ▼                                                        ▼
NETLIFY FUNCTIONS (Serverless)                          SUPABASE POSTGRESQL DB
(lookup-product, health-check-cron)                     (schema_migrations, RLS)
```

| Componente | Mecanismo Actual | Versionado | Backup | Rollback | Riego | Acción |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **Frontend Web** | Netlify Deploy | Git Tag / Commit | Git Tracking | Netlify Rollback instantáneo | Bajo | REUTILIZAR / ADAPTAR |
| **Serverless Functions** | Netlify Functions | Function Bundle | Git Tracking | Function Rollback acoplado | Medio | REUTILIZAR / ADAPTAR |
| **Base de Datos** | Supabase Postgres | `schema_migrations` | Dump Lógico + Manifiesto | Forward-Fix / Restore Drill | **Alto** | **CREAR** (`release-engine.js`) |
| **Storage Assets** | Supabase Storage | Object Path | Storage Manifest | Object Restore | Medio | **CREAR** |
