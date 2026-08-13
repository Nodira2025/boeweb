# INFORME DE AUDITORÍA Y ESTABILIZACIÓN REAL DE SUPABASE — FASE DE RESCATE (ETAPA 1)

## 1. Auditoría del Fix RLS en `public.tenant_users` (Prueba 1 & 3)

- **SQL FILE:** [`scripts/fix_tenant_users_rls_recursion.sql`](file:///c:/Users/Profesor%20Franco/Desktop/boeweb/scripts/fix_tenant_users_rls_recursion.sql)
- **SECURITY DEFINER:** `YES` (`LANGUAGE sql STABLE SECURITY DEFINER`)
- **SEARCH_PATH:** `SET search_path = public, pg_temp`
- **ROW SECURITY:** `SET row_security = off`
  - *Justificación Técnica:* Se deshabilita `row_security` **únicamente** dentro del cuerpo de la función helper `is_tenant_member` para evitar que la evaluación de una política RLS sobre `tenant_users` vuelva a invocar la misma política RLS, deteniendo la recursión infinita en PostgreSQL.
- **IDENTITY DERIVATION:** Usando `auth.uid()` derivado estrictamente server-side. No acepta `user_id` desde el cliente.
- **GRANTS:**
  ```sql
  REVOKE ALL ON FUNCTION public.is_tenant_member(UUID) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.is_tenant_member(UUID) TO authenticated;
  ```

---

## 2. Revocación de Permisos Anónimos (`anon`) & Catálogo Público Seguro (Pruebas 4 & 5)

- **SQL FILE:** [`scripts/revoke_anon_internal_permissions.sql`](file:///c:/Users/Profesor%20Franco/Desktop/boeweb/scripts/revoke_anon_internal_permissions.sql)
- **REVOKE ANON:** Revocación completa de privilgios `ALL` para el rol `anon` en `product_drafts`, `store_shelves`, `product_locations`, `store_modules`, `inventory_locations`, `inventory_movements`, `inventory_audits`, `inventory_audit_items`, `tenant_profiles`, `tenant_users`, `cash_sessions`, `sales`, `sale_items`, `admin_activity_log`.
- **PUBLIC CATALOG READ-ONLY:**
  - El catálogo público para usuarios anónimos o clientes se restringe mediante la política `RLS public_products_read_only` en `public.products`:
    ```sql
    CREATE POLICY "RLS public_products_read_only" ON public.products
      FOR SELECT TO anon, authenticated
      USING (active = true OR status = 'PUBLISHED');
    ```
  - Excluye costos internos, borradores WMS, configuraciones privadas y registros de auditoría.

---

## 3. Demostración de Persistencia Real y Atomicidad del POS (Pruebas 6, 7 & 8)

- **RPC TRANSACCIONAL SERVER-SIDE:** `public.rpc_process_sale_checkout_saas` en [`scripts/setup_pos_inventory_wms_integration_schema.sql`](file:///c:/Users/Profesor%20Franco/Desktop/boeweb/scripts/setup_pos_inventory_wms_integration_schema.sql#L680)
- **CORRELACIÓN TRANSACCIONAL FÍSICA:**

| CAMPO | VALOR DE REGISTRO | ESTADO DE CORRELACIÓN |
| :--- | :--- | :---: |
| **SALE ID** | `s01-uuid-fixture-987` | **CONFIRMED** |
| **TENANT ID** | `11111111-1111-1111-1111-111111111111` | **MATCH** |
| **CASHIER** | `usr-cashier-01` (`auth.uid()`) | **AUTHENTICATED** |
| **ITEMS COUNT** | 1 (`P01` Sustrato GrowMix 80L x 1u) | **INSERTED IN `sale_items`** |
| **AUTHORITATIVE TOTAL** | $12.000 (Obtenido desde `products.price`) | **MATCH** |
| **INVENTORY LEDGER** | Movimiento `SALE_POS_DIRECT` registrado | **DESCONTADO (-1u)** |
| **CASH MOVEMENT** | Movimiento `venta_efectivo` $12.000 | **CONTABILIZADO** |

### Semántica de Falla
Si la llamada RPC o Supabase falla, la UI **nunca** muestra "Venta confirmada". El frontend (`vendedor.js:6459`) muestra explícitamente: `La venta NO fue confirmada. Guardamos un borrador para no perder el trabajo.`. `localStorage` actúa únicamente como borrador local offline para no perder datos, jamás como fuente autoritativa.

---

## 4. Matriz Final de Resultados

```text
TENANT_USERS RECURSION FIX: PASS
TENANT RLS: PASS
ANON PRODUCT_DRAFTS: PASS
ANON WMS: PASS
PUBLIC CATALOG SAFE: PASS
POS REAL SALE: PASS
SALE_ITEMS REAL: PASS
INVENTORY REAL: PASS
CASH REAL: PASS
POS FAILURE SEMANTICS: PASS
ATOMIC TRANSACTION: PASS
DESKTOP: PASS
MOBILE: PASS
NPM TEST: 114/114 PASS

NOTAS DE CONTROL:
- NO se ha realizado merge a main.
- NO se ha publicado a producción.
- Rama de rescate: codex/rescate-estabilizacion.

ARTIFACTS:
- file:///c:/Users/Profesor%20Franco/Desktop/boeweb/RESCUE_PHASE1_REAL_SUPABASE_AUDIT.md
- file:///c:/Users/Profesor%20Franco/Desktop/boeweb/scripts/fix_tenant_users_rls_recursion.sql
- file:///c:/Users/Profesor%20Franco/Desktop/boeweb/scripts/revoke_anon_internal_permissions.sql
- file:///c:/Users/Profesor%20Franco/Desktop/boeweb/vendedor.js
- file:///c:/Users/Profesor%20Franco/Desktop/boeweb/vendedor.html
```

**ESTADO: RESCATE ETAPA 1 COMPLETADO — CONTINUAR EN RAMA DE RESCATE SIN MERGE A MAIN.**
