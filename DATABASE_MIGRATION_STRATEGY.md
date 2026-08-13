# ESTRATEGIA DE MIGRACIÓN DE BASE DE DATOS (EXPAND -> DEPLOY -> CONTRACT) — FASE 15

## 1. Principio Fundamental

> **Un despliegue de frontend no puede asumir que la DB ya cambió de forma destructiva, y una migración DB jamás debe romper la versión previa del frontend.**

```text
[ PASO 1: EXPAND ] ──────► [ PASO 2: DEPLOY APP ] ──────► [ PASO 3: VERIFY ] ──────► [ PASO 4: CONTRACT ]
Agregar columnas/tables    Desplegar Frontend/API       Comprobar salud en       Eliminar columnas legacy
compatibles con N-1.       que consume la nueva versión. producción (Centro Salud).  solo cuando N-1 expiró.
```

- **EXPAND:** `ALTER TABLE sales ADD COLUMN IF NOT EXISTS build_version_snapshot VARCHAR(50) DEFAULT 'v1.0.0';`
- **DEPLOY APP:** Se despliega el frontend `v1.0.0-saas.15`.
- **VERIFY:** Se monitorea Centro de Salud Operativo.
- **CONTRACT:** Se retiran estructuras antiguas tras una ventana de compatibilidad comprobada.
