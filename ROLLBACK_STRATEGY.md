# ESTRATEGIA Y PROCEDIMIENTO DE ROLLBACK — FASE 15

## 1. Distinción Crítica: Rollback de Aplicación vs Rollback de DB

- **Rollback de Frontend / Functions:** Se realiza instantáneamente promoviendo el despliegue / commit anterior conocido en Netlify sin reconstruir código.
- **Rollback de Base de Datos:**
  - Si la migración siguió el patrón **EXPAND**, la versión anterior de la app sigue funcionando con las columnas/tablas adicionales. **No se elimina la columna de la DB de forma precipitada.**
  - Si la migración requirió cambios destructivos, se aplica la estrategia **FORWARD-FIX** mediante un hotfix o restauración de respaldo probado.
