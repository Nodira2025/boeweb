# SEGURIDAD Y AISLAMIENTO DEL MOTOR DE SALUD — FASE 13

## 1. Reglas RLS Multi-Tenant

- `public.operational_alerts`: Aislada por `tenant_id` vinculada a `auth.uid()`.
- `public.operational_alert_events`: Append-only (`REVOKE UPDATE, DELETE ON public.operational_alert_events FROM anon, authenticated`).
- `public.alert_rules`: Configurables únicamente por `ADMIN` o `SUPERADMIN`.
- **Detección de Falla del Motor (`CHECK_FAILED`):** Si un detector falla o se corrompe la conexión, el sistema reporta `CHECK_FAILED` e impide mostrar un estado `HEALTHY` falso.
