# ARQUITECTURA DE INFORMACIÓN Y NAVEGACIÓN ADMIN — FASE 12

## 1. Estructura Jerárquica de la Consola

```text
CONSOLA ADMINISTRATIVA (Fase 12)
├── OPERACIÓN
│   ├── Dashboard (KPIs, Ventas Hoy, Efectivo Esperado, Alertas)
│   ├── Ventas (Historial, Trazabilidad, Correlación)
│   ├── Caja & Arqueo (DB Sessions, Cash Movements)
│   ├── Inventario (Balances Virtuales, Disponibilidad Unificada)
│   ├── WMS (Depósitos, Módulos, Picking, Mapa)
│   └── Auditorías (Pendientes, Ajustes Positive/Negative)
├── COMERCIAL
│   ├── Productos (Catálogo Interno, Atributos JSONB por Rubro)
│   ├── Catálogo Público (EN STOCK vs A PEDIDO, Publication State)
│   ├── Proveedores / B2B (Catálogos Externos, Precios)
│   └── Migraciones (Staging, Aprobación, Rollback Granular)
├── ORGANIZACIÓN
│   ├── Usuarios (Listado, Roles, Invitar, Suspender)
│   ├── Empresa (Branding, Logo, Colores, Terminología)
│   ├── Rubro (Esquemas de Atributos Verticales)
│   └── Configuración (Precedencias, Moneda, Timezone)
└── PLATAFORMA (Solo SUPERADMIN)
    ├── Empresas / Tenants (Listado, Multi-Tenant Switcher)
    ├── Onboarding Wizard (Alta Guiada 10 Pasos)
    └── Rubros Globales (Definiciones de Atributos)
```
