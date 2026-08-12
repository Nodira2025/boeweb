# ESPECIFICACIÓN DEL CICLO DE VIDA DE ALERTAS — FASE 13

## 1. Estados y Transiciones

```text
[ DETECCIÓN CONDICIÓN ]
         │
         ▼
     ( OPEN ) ──────────► ( ACKNOWLEDGED ) ──────────► ( RESOLVED )
        │                       │                             ▲
        │                       ▼                             │
        │                  ( SNOOZED ) ───────────────────────┘
        │
        └─────── ( Auto-Resolución: AUTO_CONDITION_CLEARED ) ──┘
```

- **OPEN:** Alerta detectada y activa.
- **ACKNOWLEDGED:** Tomada en conocimiento por un usuario.
- **SNOOZED:** Postergada temporalmente por un operador.
- **RESOLVED:** Resuelta (Manualmente por usuario con nota o automáticamente cuando la condición desaparece).
