# ESPECIFICACIÓN DE BITÁCORA DE AUDITORÍA DE ACCIONES ADMINISTRATIVAS — FASE 12

## 1. Esquema de Registro Append-Only (`admin_activity_log`)

```json
{
  "id": "act-1786562400000-888",
  "actor_id": "usr-profesor-franco",
  "actor_name": "Profesor Franco",
  "tenant_id": "11111111-1111-1111-1111-111111111111",
  "action": "USER_ROLE_CHANGE",
  "entity": "USER",
  "entity_id": "usr-lautaro",
  "metadata": {
    "previous_role": "VENDEDOR",
    "new_role": "SUPERVISOR"
  },
  "timestamp": "2026-08-12T19:30:00.000Z"
}
```

---

## 2. Eventos Administrativos Auditados

- `USER_CREATE`, `USER_UPDATE`, `USER_SUSPEND`, `USER_ROLE_CHANGE`
- `TENANT_ACTIVATION`, `TENANT_SUSPENSION`, `TENANT_SWITCH`
- `PRODUCT_PUBLISH`, `PRODUCT_UPDATE`, `PRODUCT_DELETE`
- `BRANDING_PUBLISH`, `MIGRATION_EXECUTE`, `MIGRATION_ROLLBACK`
- `AUDIT_APPROVE`, `AUDIT_REJECT`
