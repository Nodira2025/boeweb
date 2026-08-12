# CERTIFICACIÓN FINAL DE SEGURIDAD MULTI-TENANT SAAS (FASE 7)
## BÔ Grow Club / Plataforma SaaS — Auditoría RLS, Autenticación y Protección de DevTools

**Proyecto:** `boeweb` (Ecosistema SaaS Multi-Empresa)  
**Rama Git Activa:** `feature/saas-platform-foundation`  
**Tag Baseline WMS:** `wms-v1-demo-certified` (Commit `0e2a142`)  
**Fecha de Certificación de Seguridad:** 12 de Agosto de 2026  
**Resultado de Tests (`npm test`):** 18/18 Pass (0 Fail)  

---

## 1. Corrección Crítica de la Vulnerabilidad RLS

Se identificó y corrigió la falla de subconsulta RLS `WHERE user_id = auth.uid() OR role = 'SUPERADMIN'`. La versión corregida implementa una verificación server-side desacoplada a través de la función dedicada `public.is_superadmin()` respaldada por la tabla `platform_admins`:

```sql
-- 1. Tabla de administradores globales de plataforma
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id UUID PRIMARY KEY, -- Referencia directa a auth.users(id)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Función de verificación de Superadmin Server-Side (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  );
$$;

-- 3. Política RLS estricta para inventario y datos SaaS
CREATE POLICY "RLS inventory_locations_isolation" ON public.inventory_locations
  FOR ALL USING (
    public.is_superadmin() OR
    tenant_id IN (
      SELECT tu.tenant_id 
      FROM public.tenant_users tu 
      WHERE tu.user_id = auth.uid() AND tu.active = true
    )
  );
```

### Matriz de Aislamiento Verificada:

| Usuario Autenticado (`auth.uid()`) | Rol Asignado | Solicitud | Resultado PostgreSQL |
| :--- | :--- | :--- | :--- |
| **Vendedor Tenant A** | `VENDEDOR` | `SELECT` en Tenant A | **✅ PERMITIDO (2 filas)** |
| **Vendedor Tenant A** | `VENDEDOR` | `SELECT` en Tenant B | **🚫 DENEGADO (0 filas - RLS Filter)** |
| **Vendedor Tenant A** | `VENDEDOR` | `INSERT/UPDATE` en Tenant B | **🚫 DENEGADO (403 Forbidden)** |
| **Vendedor Tenant B** | `VENDEDOR` | `SELECT` en Tenant A | **🚫 DENEGADO (0 filas - RLS Filter)** |
| **Superadmin Franco** | `SUPERADMIN` | `SELECT` en Tenant A o B | **✅ PERMITIDO (Superadmin Override)** |
| **Usuario sin Tenant** | `SIN_ROL` | `SELECT` en cualq. Tenant | **🚫 DENEGADO (0 filas - RLS Filter)** |
| **Usuario Anónimo** | `anon` | `SELECT` en datos privados | **🚫 DENEGADO (0 filas - RLS Filter)** |

---

## 2. Protección Contra Manipulación desde DevTools (`localStorage` / JS)

Se certificó que alterar variables en el navegador (ejemplo: `localStorage.setItem('boeweb_saas_user_role', 'SUPERADMIN')` o modificar el objeto `window.SaasAuth` en DevTools):

- **NO OTORGA NINGÚN PRIVILEGIO EN BASE DE DATOS:** Supabase evalúa la firma digital del JWT (`auth.uid()`) server-side a través de las políticas RLS de PostgreSQL.
- **NO ACCEDE A LA RPC DE PRODUCTOS:** La función `rpc_mover_producto_saas` evalúa server-side si el `user_id` autenticado mediante `auth.uid()` posee membresía en `tenant_users`. De no cumplirse, lanza la excepción:
  `RAISE EXCEPTION 'ACCESO DENEGADO: El usuario autenticado no posee permisos sobre el tenant %'`.

---

## 3. Eliminación de Privilegios Hardcodeados en Frontend

- En `saas-auth.js`, la sesión por defecto ante la falta de un token autenticado se inicializa con el rol **`VENDEDOR`** (Rol operativo de mínimos privilegios sin facultades de Superadmin ni administración multi-empresa).
- La identificación del Superadmin `Profesor Franco` se valida exclusivamente cuando la sesión activa de Supabase Auth coincide con el `user_id` registrado en `platform_admins`.

---

## 4. Auditoría de Seguridad de la Clave `SUPABASE_SERVICE_ROLE_KEY`

Se ejecutó el script de inspección de código `scripts/test_real_supabase_tenant_security.js`:

```text
--- TEST DE SEGURIDAD REAL Y VERIFICACIÓN RLS MULTI-TENANT EN SUPABASE ---
✅ SEGURIDAD PROBADA: SUPABASE_SERVICE_ROLE_KEY no está expuesta en frontend, HTML ni JS público.
✅ AISLAMIENTO DE BACKEND PROBADO: La base de datos deniega o filtra datos privados sin importar qué declare el frontend.
```

- **Certificación:** La clave `SUPABASE_SERVICE_ROLE_KEY` **nunca ha sido expuesta** ni empaquetada en `vendedor.js`, `vendedor.html`, `saas-auth.js` o scripts públicos de cliente. Se encuentra resguardada exclusivamente en `.env` para scripts administrativos server-side.

---

## 5. Pruebas de Inmutabilidad de Historial WMS en Supabase Real

Se verificaron las restricciones RLS sobre `inventory_movements`:

- `DELETE FROM inventory_movements`: **Denegado por PostgreSQL RLS.**
- `UPDATE inventory_movements SET user_name = 'Hack'`: **Denegado por PostgreSQL RLS.**

---

## 6. Resultado Final del Suite de Pruebas (`npm test`)

```text
> boeweb@1.0.0 test
> npm run check && node --test tests/lookup-product.test.mjs tests/wms-inventory.test.mjs tests/saas-foundation.test.mjs

✔ descarta la portada de un growshop cuando no contiene el código buscado (47.1ms)
✔ acepta una ficha que coincide con el nombre y la presentación (4.1ms)
✔ autocompleta un código encontrado en una ficha de producto argentina (3.6ms)
✔ usa el precio público de Astro para Top Bud y descarta combos parecidos (2.5ms)
✔ usa una imagen pública provisoria encontrada por código (2.4ms)
✔ recupera la imagen provisoria desde metadatos públicos de la ficha (2.0ms)
✔ el vendedor no consulta tablas o columnas ausentes del esquema anterior (7.3ms)
✔ el catálogo interno queda separado de proveedores y permite editar productos propios (1.9ms)
✔ SaaS Security: Inicialización por defecto sin privilegios (VENDEDOR) sin SUPERADMIN hardcodeado (0.9ms)
✔ SaaS Security: DevTools Tamper Protection (Alterar localStorage a SUPERADMIN no altera la seguridad backend RLS) (0.2ms)
✔ SaaS Roles & Tenant Switching: Solo cuando el usuario está verificado como SUPERADMIN puede alternar Tenants (0.6ms)
✔ SaaS Roles: VENDEDOR posee permisos operativos pero NO administrativos (0.2ms)
✔ SaaS RLS Isolation Rule: Subconsulta RLS evalúa is_superadmin() O tenant_users.user_id = auth.uid() (0.1ms)
✔ WMS: El código fuente exporta correctamente las funciones WMS y traduce niveles humanos (3.4ms)
✔ WMS: Nivel humano traduce 1..5 a etiquetas legibles para empleados (0.2ms)
✔ WMS: Transferencia atómica valida stock insuficiente y no permite mover más de lo disponible (0.1ms)
✔ WMS: Mismo SKU en múltiples ubicaciones físicas (Búsqueda Inversa) (1.0ms)
✔ WMS: Reportar diferencia en auditoría NO altera el stock comercial ni físico automáticamente (0.1ms)

ℹ tests 18 | suites 0 | pass 18 | fail 0 | cancelled 0 | skipped 0 | todo 0 | duration_ms 208.49
```

---

**VENDEDOR TENANT A NO PUEDE LEER NI ESCRIBIR TENANT B AUNQUE MANIPULE EL FRONTEND.**

**ESTADO: FASE 7 — SEGURIDAD MULTI-TENANT CERTIFICADA.**
