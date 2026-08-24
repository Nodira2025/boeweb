BEGIN;

-- Expone únicamente la marca comercial como faceta pública saneada. El resto
-- de metadata permanece privado. La columna se agrega al final para conservar
-- el contrato posicional de la vista existente.
CREATE OR REPLACE VIEW public.public_catalog_products_v2
WITH (security_barrier = true)
AS
SELECT
  cp.tenant_id,
  cp.id,
  cp.sku,
  cp.barcode,
  cp.name,
  cp.description,
  cp.category,
  cp.price,
  cp.currency,
  NULLIF(COALESCE(cp.metadata->>'image_url', cp.metadata->>'image'), '') AS image_url,
  cp.track_stock,
  CASE
    WHEN cp.track_stock THEN COALESCE(sum(
      CASE
        WHEN il.active = true AND il.is_sellable = true
          THEN greatest(ib.on_hand - ib.reserved, 0)
        ELSE 0
      END
    ), 0)
    ELSE NULL
  END AS available_quantity,
  NULLIF(btrim(cp.metadata->>'brand'), '') AS brand
FROM public.catalog_products cp
JOIN public.tenant_app_config tac
  ON tac.tenant_id = cp.tenant_id
 AND tac.stage = 'published'
LEFT JOIN public.inventory_balances_v2 ib
  ON ib.tenant_id = cp.tenant_id
 AND ib.product_id = cp.id
LEFT JOIN public.inventory_locations_v2 il
  ON il.tenant_id = ib.tenant_id
 AND il.id = ib.location_id
WHERE cp.active = true
  AND lower(COALESCE(tac.config_json #>> '{catalog,visibility}', 'public')) = 'public'
  AND lower(COALESCE(tac.config_json #>> '{catalog,source}', 'unified')) <> 'disabled'
GROUP BY
  cp.tenant_id, cp.id, cp.sku, cp.barcode, cp.name, cp.description,
  cp.category, cp.price, cp.currency, cp.metadata, cp.track_stock,
  tac.config_json
HAVING
  lower(COALESCE(tac.config_json #>> '{catalog,showOutOfStock}', 'true')) = 'true'
  OR lower(COALESCE(tac.config_json #>> '{catalog,allowBackorders}', 'false')) = 'true'
  OR cp.track_stock = false
  OR COALESCE(sum(
    CASE
      WHEN il.active = true AND il.is_sellable = true
        THEN greatest(ib.on_hand - ib.reserved, 0)
      ELSE 0
    END
  ), 0) > 0;

REVOKE ALL ON public.public_catalog_products_v2 FROM PUBLIC;
GRANT SELECT ON public.public_catalog_products_v2 TO anon, authenticated;
GRANT ALL ON public.public_catalog_products_v2 TO service_role;

INSERT INTO public.schema_migrations (
  version, name, checksum, backward_compatible, applied_by
)
VALUES (
  '011',
  'public_catalog_dynamic_taxonomy',
  'sha256-public-catalog-dynamic-taxonomy-011-v1',
  true,
  'migration-engine'
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
