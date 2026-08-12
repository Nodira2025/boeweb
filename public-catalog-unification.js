/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — CATÁLOGO PÚBLICO UNIFICADO (FASE 11A)
   ==========================================================================
   Unifica catálogo propio y catálogo B2B de proveedores.
   - Regla 1: EN STOCK solo aplica si existe saldo/stock en inventario propio.
   - Regla 2: A PEDIDO aplica cuando solo existe oferta de proveedores B2B.
   - Regla 3: Producto propio + B2B se consolida en UNA sola ficha.
   - Regla 4: NUNCA sumar supplier_products.stock a stock propio.
   ========================================================================== */

class PublicCatalogUnifier {
  static unifyProducts(ownProducts = [], b2bProducts = []) {
    const unifiedMap = new Map();

    // 1. Procesar productos de inventario propio
    ownProducts.forEach(prod => {
      const sku = (prod.product_code || prod.id || '').trim().toUpperCase();
      const name = prod.name || 'Producto Sin Nombre';
      const ownQty = Number(prod.own_stock || prod.stock || 0);

      unifiedMap.set(sku || name.toLowerCase(), {
        id: prod.id || sku,
        product_code: sku,
        name: prod.name,
        price: Number(prod.price) || 0,
        own_stock: ownQty,
        has_own_stock: ownQty > 0,
        availability: ownQty > 0 ? 'EN_STOCK' : 'A_PEDIDO',
        badge_text: ownQty > 0 ? '🟢 EN STOCK' : '📦 A PEDIDO',
        category: prod.category || 'Otros',
        image: prod.image || prod.image_url || 'assets/logo.jpg',
        description: prod.description || '',
        suppliers: []
      });
    });

    // 2. Procesar productos de proveedores B2B (Deduplicación)
    b2bProducts.forEach(b2b => {
      const sku = (b2b.product_code || b2b.id || '').trim().toUpperCase();
      const name = b2b.name || '';
      const key = sku || name.toLowerCase();

      const existing = unifiedMap.get(key);
      const supplierOffer = {
        supplier_code: b2b.supplier_code || 'astrogrow',
        supplier_name: b2b.supplier_name || b2b.supplier_code || 'Proveedor B2B',
        price: Number(b2b.price) || 0,
        stock_b2b: Number(b2b.stock) || 0,
        link: b2b.link || ''
      };

      if (existing) {
        // Mantiene una sola ficha; agrega oferta de proveedor como secundaria
        existing.suppliers.push(supplierOffer);
      } else {
        // Producto únicamente disponible A PEDIDO de proveedor
        unifiedMap.set(key, {
          id: b2b.id || sku,
          product_code: sku,
          name: b2b.name,
          price: Number(b2b.price) || 0,
          own_stock: 0, // NUNCA sumar supplier_products.stock a stock propio
          has_own_stock: false,
          availability: 'A_PEDIDO',
          badge_text: '📦 A PEDIDO',
          category: b2b.category || 'Otros',
          image: b2b.image || b2b.image_url || 'assets/logo.jpg',
          description: b2b.description || '',
          suppliers: [supplierOffer]
        });
      }
    });

    return Array.from(unifiedMap.values());
  }
}

if (typeof window !== 'undefined') {
  window.PublicCatalogUnifier = PublicCatalogUnifier;
}
if (typeof global !== 'undefined') {
  global.PublicCatalogUnifier = PublicCatalogUnifier;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PublicCatalogUnifier };
}
