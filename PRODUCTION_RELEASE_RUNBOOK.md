# RUNBOOK OPERATIVO DE RELEASE Y DESPLIEGUE EN PRODUCCIÓN — FASE 15

## 1. Pasos Secuenciales para Despliegue

1. **Preflight Verification (`release-preflight`):**
   - Verificar que la rama de trabajo esté limpia (`git status clean`).
   - Ejecutar suite completa: `npm test` (**96+ PASS — 0 FAIL**).
   - Confirmar conectividad con Supabase DB y variables de entorno requeridas.
2. **Ejecución de Migraciones de Base de Datos (EXPAND):**
   - Aplicar scripts de migración incrementales desde `scripts/migrations/`.
   - Registrar la versión en `public.schema_migrations`.
3. **Despliegue de Serverless Functions & Frontend:**
   - Publicar paquete en Netlify / CDN.
4. **Prueba Smoke Post-Despliegue:**
   - Verificar lectura de catálogo, autenticación, POS, caja y alertas.
5. **Verificación en Centro de Salud:**
   - Inspeccionar Centro de Salud (Fase 13). Si se detectan alertas críticas post-deploy, iniciar procedimiento de rollback.
