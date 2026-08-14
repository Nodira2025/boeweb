/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — CATÁLOGO PÚBLICO UNIFICADO (OMNICANAL)
   ==========================================================================
   Unifica catálogo propio, tiendas cercanas y catálogo B2B de proveedores.
   - Disponibilidad 1 (EN_STOCK): Saldo físico en tienda propia -> "🟢 EN STOCK"
   - Disponibilidad 2 (LOCAL_2_DAYS): Tiendas cercanas / Proveedores locales -> "📦 LLEGA EN 2 DÍAS"
   - Disponibilidad 3 (A_PEDIDO): Proveedores mayoristas B2B -> "📦 SOLO POR PEDIDO · Llega en 5 días"
   - Cálculo de Precios: Aplica el margen comercial configurado por el Administrador (+30% por defecto).
   - Regla de oro: NUNCA sumar stock externo a stock propio de la tienda.
   ========================================================================== */

class PublicCatalogUnifier {
  static getAdminMarkupPercent() {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('boeweb_catalog_markup_percent');
        if (stored !== null && !isNaN(Number(stored))) {
          return Number(stored);
        }
      }
    } catch (_) {}
    return 30; // 30% default markup
  }

  static calculatePublicPrice(baseCost, markupPercent = null) {
    const markup = markupPercent !== null ? Number(markupPercent) : this.getAdminMarkupPercent();
    const cost = Number(baseCost) || 0;
    if (cost <= 0) return 0;
    return Math.round(cost * (1 + (markup / 100)));
  }

  static unifyProducts(ownProducts = [], b2bProducts = [], options = {}) {
    const localProducts = Array.isArray(options.localStoresProducts) ? options.localStoresProducts : [];
    const applyMarkup = options.adminMarkupPercent !== undefined || options.applyMarkup === true;
    const markupPercent = options.adminMarkupPercent !== undefined ? Number(options.adminMarkupPercent) : this.getAdminMarkupPercent();
    const isDetailed = options.detailedBadge !== undefined ? options.detailedBadge : false;
    const unifiedMap = new Map();

    // 1. Procesar productos de inventario propio (Prioridad 1: EN STOCK)
    ownProducts.forEach(prod => {
      const sku = (prod.product_code || prod.id || '').trim().toUpperCase();
      const name = prod.name || 'Producto Sin Nombre';
      const ownQty = Number(prod.own_stock !== undefined ? prod.own_stock : (prod.stock || 0));
      const isAvailable = prod.available !== false && ownQty > 0;

      unifiedMap.set(sku || name.toLowerCase(), {
        id: prod.id || sku,
        product_code: sku,
        name: prod.name,
        price: Number(prod.price) || 0,
        own_stock: ownQty,
        has_own_stock: ownQty > 0,
        available: isAvailable,
        availability: isAvailable ? 'EN_STOCK' : 'A_PEDIDO',
        badge_text: isAvailable ? '🟢 EN STOCK' : '📦 SOLO POR PEDIDO · Llega en 5 días',
        delivery_estimate: isAvailable ? 'Inmediata en local' : '5 días hábiles',
        category: prod.category || 'Otros',
        image: prod.image || prod.image_url || 'assets/logo.jpg',
        description: prod.description || '',
        expiration_date: prod.expiration_date || prod.expiry_date || null,
        suppliers: []
      });
    });

    // 2. Procesar productos de Tiendas Cercanas / Proveedores Locales (LLEGA EN 2 DÍAS)
    localProducts.forEach(local => {
      const sku = (local.product_code || local.id || '').trim().toUpperCase();
      const name = local.name || '';
      const key = sku || name.toLowerCase();

      const existing = unifiedMap.get(key);
      const supplierOffer = {
        supplier_code: local.store_code || local.supplier_code || 'tienda_cercana',
        supplier_name: local.store_name || local.supplier_name || 'Tienda Cercana BÔ',
        price: Number(local.price) || 0,
        stock_b2b: Number(local.stock) || 0,
        delivery_days: 2,
        link: local.link || ''
      };

      if (existing) {
        existing.suppliers.push(supplierOffer);
        if (!existing.has_own_stock) {
          existing.availability = 'LOCAL_2_DAYS';
          existing.badge_text = '📦 LLEGA EN 2 DÍAS';
          existing.delivery_estimate = '2 días hábiles (Tienda cercana)';
        }
      } else {
        const publicPrice = Number(local.public_price) || (applyMarkup ? PublicCatalogUnifier.calculatePublicPrice(local.price, markupPercent) : Number(local.price) || 0);
        unifiedMap.set(key, {
          id: local.id || sku,
          product_code: sku,
          name: local.name,
          price: publicPrice,
          own_stock: 0,
          has_own_stock: false,
          available: true,
          availability: 'LOCAL_2_DAYS',
          badge_text: '📦 LLEGA EN 2 DÍAS',
          delivery_estimate: '2 días hábiles (Tienda cercana)',
          category: local.category || 'Otros',
          image: local.image || local.image_url || 'assets/logo.jpg',
          description: local.description || '',
          expiration_date: local.expiration_date || null,
          suppliers: [supplierOffer]
        });
      }
    });

    // 3. Procesar productos de proveedores B2B Mayoristas (SOLO POR PEDIDO · 5 DÍAS)
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
        delivery_days: 5,
        link: b2b.link || ''
      };

      if (existing) {
        existing.suppliers.push(supplierOffer);
      } else {
        const publicPrice = Number(b2b.public_price) || (applyMarkup ? PublicCatalogUnifier.calculatePublicPrice(b2b.price, markupPercent) : Number(b2b.price) || 0);
        unifiedMap.set(key, {
          id: b2b.id || sku,
          product_code: sku,
          name: b2b.name,
          price: publicPrice,
          own_stock: 0,
          has_own_stock: false,
          available: true,
          availability: 'A_PEDIDO',
          badge_text: b2b.badge_text || '📦 SOLO POR PEDIDO · Llega en 5 días',
          delivery_estimate: '5 días hábiles',
          category: b2b.category || 'Otros',
          image: b2b.image || b2b.image_url || 'assets/logo.jpg',
          description: b2b.description || '',
          expiration_date: b2b.expiration_date || null,
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
