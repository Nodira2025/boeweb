-- ============================================================================
-- BÔ GROW CLUB / PLATAFORMA SAAS — REVOCACIÓN DE PERMISOS ANÓNIMOS EN TABLAS INTERNAS
-- ============================================================================
-- Deshabilita el acceso directo de la clave anónima (anon) a borradores de productos,
-- estructuras WMS, ubicaciones físicas, auditorías, caja, perfiles y usuarios.
-- Mantiene intacta la lectura pública exclusivamente para el catálogo de productos activos.
-- ============================================================================

BEGIN;

-- 1. REVOCAR PRIVILEGIOS DIRECTOS A 'anon' Y 'PUBLIC' EN TABLAS INTERNAS
REVOKE ALL ON TABLE public.product_drafts FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.store_shelves FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.product_locations FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.store_modules FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.inventory_locations FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.inventory_movements FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.inventory_audits FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.inventory_audit_items FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.tenant_profiles FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.tenant_users FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.cash_sessions FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.cash_movements FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.sales FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.sale_items FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.admin_activity_log FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.operational_alerts FROM anon, PUBLIC;

-- Conceder acceso SELECT a usuarios autenticados (authenticated)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_drafts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_shelves TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_modules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_movements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_audits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_audit_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tenant_profiles TO authenticated;

-- 2. ELIMINAR POLÍTICAS PERMISIVAS HISTÓRICAS PARA 'anon'
DROP POLICY IF EXISTS "Permitir inserción de borradores para vendedores (anon)" ON public.product_drafts;
DROP POLICY IF EXISTS "Permitir lectura de borradores (anon)" ON public.product_drafts;
DROP POLICY IF EXISTS "Permitir actualización de borradores para admin (anon)" ON public.product_drafts;
DROP POLICY IF EXISTS "RLS product_drafts_select_anon" ON public.product_drafts;
DROP POLICY IF EXISTS "RLS product_drafts_insert_anon" ON public.product_drafts;
DROP POLICY IF EXISTS "Permitir lectura del mapa (anon)" ON public.store_shelves;
DROP POLICY IF EXISTS "Permitir alta de estantes (anon)" ON public.store_shelves;
DROP POLICY IF EXISTS "Permitir actualización del mapa (anon)" ON public.store_shelves;
DROP POLICY IF EXISTS "Permitir lectura de ubicaciones (anon)" ON public.product_locations;
DROP POLICY IF EXISTS "Permitir alta de ubicaciones (anon)" ON public.product_locations;
DROP POLICY IF EXISTS "Permitir actualización de ubicaciones (anon)" ON public.product_locations;

-- 3. POLÍTICA DE LECTURA AUTENTICADA EN BORRADORES Y WMS
CREATE POLICY "RLS product_drafts_authenticated" ON public.product_drafts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "RLS store_shelves_authenticated" ON public.store_shelves
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "RLS product_locations_authenticated" ON public.product_locations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. PROTEGER EL CATÁLOGO PÚBLICO (Solo Lectura de Productos Publicados/Activos para 'anon')
GRANT SELECT ON public.products TO anon, authenticated;

DROP POLICY IF EXISTS "RLS public_products_read_only" ON public.products;
CREATE POLICY "RLS public_products_read_only" ON public.products
  FOR SELECT TO anon, authenticated
  USING (active = true OR status = 'PUBLISHED');

COMMIT;
