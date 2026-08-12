# ARQUITECTURA DEL CENTRO DE SALUD OPERATIVO Y MOTOR DE ALERTAS — FASE 13

## 1. Principio Fundamental de la Arquitectura

```text
       ┌────────────────────────────────────────────────────────┐
       │                 FUENTES DE INFORMACIÓN                 │
       │ (inventory_balances, cash_sessions, reservations, etc.)│
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
                       DETECTOR SERVER-SIDE
                                   │
                                   ▼
                    CONDICIÓN OPERATIVA DETECTADA
                                   │
                                   ▼
                       PROCESADOR DE DEDUPLICACIÓN
                        (fingerprint unívoco)
                                   │
       ┌───────────────────────────┴────────────────────────────┐
       ▼                                                        ▼
OPERATIONAL ALERT (Persistente)                        NOTIFICACIÓN IN-APP
 (OPEN / ACK / RESOLVED)                                (Badges Unread/Read)
       │
       ▼
ACCIONAR HUMANO / RESOLUCIÓN
(Mediante RPCs/Flujos autorizados existentes)
```

> **REGLA DE ORO:** Una alerta NUNCA modifica automáticamente la contabilidad, el stock, las ventas o las cajas. El motor detecta, avisa y deduplica; las correcciones las realiza el usuario mediante los flujos autorizados.
