# BUSINESS VERTICALS ARCHITECTURE — BÔ GROW CLUB (FASE 8)
## Arquitectura de Adaptación Comercial Desacoplada por Rubro

**Proyecto:** `boeweb` (Plataforma SaaS Multi-Empresa)  
**Principios de Diseño:** Desacoplamiento total, Cero `IFs` hardcodeados en el código, Fuente de Verdad en PostgreSQL JSONB.

---

## 1. Modelo de Datos JSONB (`attribute_schema`)

Cada rubro comercial define su catálogo de atributos dynamic en la columna `attribute_schema JSONB`:

```json
[
  {
    "key": "power_watts",
    "label": "Potencia Motor",
    "type": "number",
    "unit": "W",
    "required": false,
    "searchable": true,
    "barcode_priority": 8,
    "ai_enrichment": true
  },
  {
    "key": "voltage",
    "label": "Voltaje Alimentación",
    "type": "select",
    "options": ["220V", "110V", "18V Batería", "20V Batería"],
    "required": false,
    "searchable": true,
    "barcode_priority": 7,
    "ai_enrichment": true
  }
]
```

---

## 2. Flujo de Autocompletado Integrado por Rubro

```
CÓDIGO DE BARRAS ESCANEADO
           │
           ▼
OBTENER TENANT ACTIVO
           │
           ▼
OBTENER RUBRO ASIGNADO EN POSTGRESQL (tenant_profiles.vertical_code)
           │
           ▼
CARGAR ATTRIBUTE SCHEMA JSONB & IA PROMPT CONTEXT
           │
           ▼
ENRIQUECER Y COMPLETAR FORMULARIO DINÁMICO
```

---

## 3. Extensibilidad sin Modificar Código JS

Para dar de alta un nuevo rubro en el futuro (ej: **Veterinaria & Mascotas**), el **SUPERADMIN** únicamente debe ejecutar un `INSERT` en PostgreSQL:

```sql
INSERT INTO public.business_verticals (code, name, attribute_schema) VALUES (
  'veterinaria',
  'Veterinaria & Alimento Balanceado',
  '[{"key": "pet_type", "label": "Especie (Perro/Gato)", "type": "select", "options": ["Perro", "Gato"]}, {"key": "weight_kg", "label": "Peso Bolsa (kg)", "type": "number", "unit": "kg"}]'::jsonb
);
```

El motor `business-verticals.js` detecta automáticamente el nuevo esquema y renderiza los formularios sin requerir ningún despliegue de código.

---

**ESTADO: FASE 8 — WHITE-LABEL & BUSINESS VERTICALS CERTIFICADA**
