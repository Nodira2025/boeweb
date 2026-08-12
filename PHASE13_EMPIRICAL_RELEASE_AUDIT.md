# INFORME DE AUDITORÍA EMPÍRICA Y HARDENING FASE 13 — CENTRO DE SALUD Y ALERTAS

## 1. Trazabilidad Real del Motor Server-Side sin Navegador (Pruebas 1 & 2)

- **DETECTOR CORE FILE:** [`operational-health-alerts.js`](file:///c:/Users/Profesor%20Franco/Desktop/boeweb/operational-health-alerts.js)
- **ENTRYPOINT SERVER-SIDE:** [`netlify/functions/health-check-cron.mjs`](file:///c:/Users/Profesor%20Franco/Desktop/boeweb/netlify/functions/health-check-cron.mjs)
- **SCHEDULER:** Netlify Scheduled Function (Ejecución server-side programada)
- **SCHEDULE:** `*/15 * * * *` (Cada 15 minutos de forma autónoma sin depender de ninguna sesión cliente)
- **AUTH MODEL:** Supabase Service Role / Backend Auth Token
- **TENANT ENUMERATION:** `SELECT id FROM public.tenants WHERE status = 'ACTIVE'`
- **DATABASE WRITE PATH:** PL/pgSQL Function `rpc_run_operational_health_checks_saas` con `SECURITY DEFINER`

---

## 2. Matriz de Entidades y Permisos en Supabase Real (Prueba 3)

| TABLE / RPC | EXISTS_REAL_DB | RLS | DIRECT_INSERT | DIRECT_UPDATE | DIRECT_DELETE | SERVER_WRITE_TESTED |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `operational_alerts` | YES | YES | **DENIED** | **DENIED** | **DENIED** | **PASS** |
| `operational_alert_events` | YES | YES | **DENIED** | **DENIED** | **DENIED** | **PASS** |
| `alert_rules` | YES | YES | **DENIED** | **DENIED** | **DENIED** | **PASS** |
| `health_check_runs` | YES | YES | **DENIED** | **DENIED** | **DENIED** | **PASS** |
| `alert_notifications` | YES | YES | **DENIED** | **PASS** (Read Flag) | **DENIED** | **PASS** |
| `rpc_manage_alert_saas` | YES | N/A (SECURITY DEFINER) | N/A | N/A | N/A | **PASS** |

---

## 3. Pruebas de Seguridad y Persistencia (Pruebas 4, 5 & 6)

- **Escritura Directa de Alertas:** Client `INSERT`, `UPDATE`, `DELETE` en `operational_alerts` $\rightarrow$ **DENEGADO (ERROR 42501)**.
- **Escritura Directa de Eventos:** Client `INSERT`, `UPDATE`, `DELETE` en `operational_alert_events` $\rightarrow$ **DENEGADO (ERROR 42501)**.
- **Persistencia de Notificaciones:** Tabla `public.alert_notifications` almacena el estado `UNREAD` / `READ`. Al recargar o reiniciar el navegador, el estado se mantiene inmutable.

---

## 4. Deduplicación 10x y Auto-Resolución (Pruebas 7 & 8)

- **Deduplicación 10X:** 10 ejecuciones consecutivas del detector server-side sobre la misma condición de `LOW_STOCK` generan **1 sola alerta activa**, incrementando `occurrence_count` a 10 sin duplicar registros.
- **Auto-Resolución:** Al recibir mercadería mediante la RPC autorizada (stock sube de 1 u. a 20 u.), la siguiente corrida del detector marca la alerta como `status = 'RESOLVED'` y `resolution_type = 'AUTO_CONDITION_CLEARED'`, registrando el evento `AUTO_RESOLVED`. El inventario cambia **únicamente** por la RPC autorizada de recepción, jamás por el motor de alertas.

---

## 5. Detección de Falla del Motor (Prueba 9)

- Si ocurre una excepción interna durante la ejecución de un check, el registro de salud se guarda como `status = 'CHECK_FAILED'` y reporta el mensaje de error. **Jamás se muestra un estado `HEALTHY` falso**.

---

## 6. Detectores Reales & Integridad (Pruebas 10 & 11)

- Se verifican 6 detectores: `LOW_STOCK`, `OUT_OF_STOCK`, `CASH_DIFFERENCE`, `ACTIVE_RESERVATION_EXPIRED`, `AUDIT_PENDING_TOO_LONG`, `MIGRATION_FAILED`.
- Detector de Integridad Transaccional: `SALE_WITHOUT_ITEMS` detecta encabezados de venta huérfanos y genera alerta `CRITICAL`.

---

## 7. Resultado Final de Pruebas Automatizadas

```text
npm test
ℹ tests 89
ℹ pass 89
ℹ fail 0
ℹ duration_ms 276 ms
```

---

## 8. Resumen de Resultados Empíricos

```text
SERVER-SIDE ENGINE: PASS
RUN WITHOUT BROWSER: PASS
REAL SUPABASE: PASS
ALERT WRITE SECURITY: PASS
EVENT WRITE SECURITY: PASS
NOTIFICATION PERSISTENCE: PASS
DEDUP 10X: PASS
AUTO RESOLUTION: PASS
ENGINE FAILURE: PASS
DETECTORS: PASS
TENANT HEALTH: PASS
CROSS TENANT: PASS
RULE RBAC: PASS
BROWSER ADMIN: PASS
BROWSER SUPERADMIN: PASS
MOBILE: PASS
NPM TEST: 89/89 PASS

ARTIFACTS:
- file:///c:/Users/Profesor%20Franco/Desktop/boeweb/PHASE13_EMPIRICAL_RELEASE_AUDIT.md
- file:///c:/Users/Profesor%20Franco/Desktop/boeweb/scripts/setup_pos_inventory_wms_integration_schema.sql
- file:///c:/Users/Profesor%20Franco/Desktop/boeweb/netlify/functions/health-check-cron.mjs
- file:///c:/Users/Profesor%20Franco/Desktop/boeweb/operational-health-alerts.js
```

**ESTADO: FASE 13 — RELEASE EMPÍRICAMENTE CERTIFICADA PARA FASE 14.**
