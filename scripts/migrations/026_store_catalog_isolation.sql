BEGIN;

-- Presentation boundaries only: no historical sales, balances or cash movements are moved.
CREATE OR REPLACE FUNCTION public.is_private_catalog_product_v2(p_category TEXT, p_metadata JSONB)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT upper(btrim(COALESCE(p_category, ''))) IN ('REPROCAM', 'REPROCANN')
    OR lower(COALESCE(p_metadata->>'is_reprocam', 'false')) = 'true'
    OR lower(COALESCE(p_metadata->>'is_reprocann', 'false')) = 'true';
$$;

CREATE OR REPLACE VIEW public.public_catalog_products_v2
WITH (security_barrier = true) AS
SELECT cp.tenant_id, cp.id, cp.sku, cp.barcode, cp.name, cp.description, cp.category,
  cp.price, cp.currency,
  NULLIF(COALESCE(cp.metadata->>'image_url', cp.metadata->>'image'), '') AS image_url,
  cp.track_stock,
  CASE WHEN cp.track_stock THEN COALESCE(sum(CASE
    WHEN il.active = true AND il.is_sellable = true THEN greatest(ib.on_hand - ib.reserved, 0)
    ELSE 0 END), 0) ELSE NULL END AS available_quantity,
  NULLIF(btrim(cp.metadata->>'brand'), '') AS brand
FROM public.catalog_products cp
JOIN public.tenant_app_config tac ON tac.tenant_id = cp.tenant_id AND tac.stage = 'published'
LEFT JOIN public.inventory_balances_v2 ib ON ib.tenant_id = cp.tenant_id AND ib.product_id = cp.id
LEFT JOIN public.inventory_locations_v2 il ON il.tenant_id = ib.tenant_id AND il.id = ib.location_id
WHERE cp.active = true
  AND NOT public.is_private_catalog_product_v2(cp.category, cp.metadata)
  AND lower(COALESCE(tac.config_json #>> '{catalog,visibility}', 'public')) = 'public'
  AND lower(COALESCE(tac.config_json #>> '{catalog,source}', 'unified')) <> 'disabled'
GROUP BY cp.tenant_id, cp.id, cp.sku, cp.barcode, cp.name, cp.description, cp.category,
  cp.price, cp.currency, cp.metadata, cp.track_stock, tac.config_json
HAVING lower(COALESCE(tac.config_json #>> '{catalog,showOutOfStock}', 'true')) = 'true'
  OR lower(COALESCE(tac.config_json #>> '{catalog,allowBackorders}', 'false')) = 'true'
  OR cp.track_stock = false
  OR COALESCE(sum(CASE WHEN il.active = true AND il.is_sellable = true
    THEN greatest(ib.on_hand - ib.reserved, 0) ELSE 0 END), 0) > 0;

-- Public offer projection deliberately excludes cost, supplier contacts, and private metadata.
-- Offers remain quotations, not physical stock or directly payable web products.
CREATE OR REPLACE VIEW public.public_external_catalog_v2
WITH (security_barrier = true) AS
SELECT offer.tenant_id, offer.id, offer.external_sku, offer.name, offer.category,
  offer.retail_price AS price, 'ARS'::TEXT AS currency, source.source_type, source.estimated_days,
  NULLIF(COALESCE(offer.metadata->>'image_url', offer.metadata->>'image'), '') AS image_url,
  NULLIF(btrim(offer.metadata->>'brand'), '') AS brand,
  NULLIF(btrim(offer.metadata->>'description'), '') AS description
FROM public.external_catalog_offers_v2 offer
JOIN public.external_catalog_sources_v2 source ON source.tenant_id = offer.tenant_id AND source.id = offer.source_id
JOIN public.tenant_app_config tac ON tac.tenant_id = offer.tenant_id AND tac.stage = 'published'
WHERE offer.active = true AND source.active = true AND offer.retail_price > 0
  AND NOT public.is_private_catalog_product_v2(offer.category, offer.metadata)
  AND lower(COALESCE(tac.config_json #>> '{catalog,visibility}', 'public')) = 'public'
  AND lower(COALESCE(tac.config_json #>> '{catalog,source}', 'unified')) = 'unified';

REVOKE ALL ON public.public_catalog_products_v2, public.public_external_catalog_v2 FROM PUBLIC;
GRANT SELECT ON public.public_catalog_products_v2, public.public_external_catalog_v2 TO anon, authenticated;
GRANT ALL ON public.public_catalog_products_v2, public.public_external_catalog_v2 TO service_role;

-- An old cart or a forged public request must not bypass the catalog exclusion.
CREATE OR REPLACE FUNCTION public.guard_public_order_catalog_scope_v2()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.items) item
    JOIN public.catalog_products product ON product.tenant_id = NEW.tenant_id
      AND product.id::text = item->>'product_id'
    WHERE public.is_private_catalog_product_v2(product.category, product.metadata)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Este producto no pertenece al catálogo público del local.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_public_order_catalog_scope_v2() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_public_order_catalog_scope_v2 ON public.public_orders_v2;
CREATE TRIGGER guard_public_order_catalog_scope_v2 BEFORE INSERT OR UPDATE OF items ON public.public_orders_v2
FOR EACH ROW EXECUTE FUNCTION public.guard_public_order_catalog_scope_v2();

INSERT INTO public.schema_migrations (version, name, checksum, backward_compatible, applied_by)
VALUES ('026', 'store_catalog_isolation', 'sha256-store-catalog-isolation-026-v1', true, 'migration-engine')
ON CONFLICT (version) DO NOTHING;
COMMIT;
