(function initStoreCatalog(scope) {
  'use strict';

  function isPrivateProduct(product) {
    const category = String(product?.category || '').trim().toUpperCase();
    const metadata = product?.metadata || {};
    return ['REPROCAM', 'REPROCANN'].includes(category)
      || String(metadata.is_reprocam).toLowerCase() === 'true'
      || String(metadata.is_reprocann).toLowerCase() === 'true';
  }

  function isLocalRegister(register) {
    return Boolean(register?.id)
      && !['CAJA-REPROCAM', 'CAJA-REPROCANN'].includes(String(register.code || '').trim().toUpperCase())
      && String(register.metadata?.is_reprocam).toLowerCase() !== 'true'
      && String(register.metadata?.is_reprocann).toLowerCase() !== 'true';
  }

  async function readAllRows(client, view, columns, tenantId) {
    const rows = [];
    const pageSize = 1000;
    // PostgREST caps responses. An explicit stable page prevents silently losing offers.
    for (let offset = 0; offset < 100000; offset += pageSize) {
      const { data, error } = await client.from(view).select(columns)
        .eq('tenant_id', tenantId).order('id', { ascending: true }).range(offset, offset + pageSize - 1);
      if (error) throw error;
      const page = data || [];
      rows.push(...page);
      if (page.length < pageSize) return rows;
    }
    throw new Error('El catálogo supera el límite de carga. Se requiere búsqueda paginada en el servidor.');
  }

  function normalizeOwnProduct(row, config) {
    const quantity = row.track_stock === false ? null : Math.max(0, Number(row.available_quantity) || 0);
    const canBackorder = row.track_stock !== false && config.allowBackorders === true;
    return {
      id: row.id, product_id: row.id, product_code: row.sku, barcode: row.barcode || '',
      name: row.name, description: row.description || '', category: row.category || 'Otros',
      brand: row.brand || '', price: Number(row.price) || 0, currency: row.currency || 'ARS',
      image: row.image_url || 'assets/logo.jpg', image_url: row.image_url || 'assets/logo.jpg',
      track_stock: row.track_stock !== false, stock: quantity, own_stock: quantity,
      available_quantity: quantity, available: quantity === null || quantity > 0 || canBackorder,
      availability: quantity === null || quantity > 0 ? 'EN_STOCK' : (canBackorder ? 'A_PEDIDO' : 'SIN_STOCK'),
      allow_backorder: canBackorder, supplier_code: 'own', source_type: 'INTERNAL', inquiry_only: false
    };
  }

  function normalizeExternalProduct(row) {
    const days = Math.max(0, Number(row.estimated_days) || 0);
    return {
      id: `external:${row.id}`, offer_id: row.id, product_code: row.external_sku,
      name: row.name, description: row.description || '', category: row.category || 'Otros',
      brand: row.brand || '', price: Number(row.price) || 0, currency: row.currency || 'ARS',
      image: row.image_url || 'assets/logo.jpg', image_url: row.image_url || 'assets/logo.jpg',
      stock: 0, own_stock: 0, available_quantity: 0, has_own_stock: false, available: true,
      availability: row.source_type === 'LOCAL_STORE' ? 'LOCAL_2_DAYS' : 'A_PEDIDO',
      source_type: row.source_type, estimated_days: days, inquiry_only: true, allow_backorder: false,
      delivery_estimate: `${days} días hábiles estimados · sujeto a confirmación`
    };
  }

  function consultationUrl(product, whatsapp) {
    const phone = String(whatsapp || '').replace(/\D/g, '');
    if (!/^\d{8,15}$/.test(phone) || !product?.inquiry_only) return '';
    const message = `Hola, quiero consultar por ${product.name} (${product.product_code}). Precio publicado: ${product.currency} ${product.price}. Plazo estimado: ${product.estimated_days} días hábiles. ¿Me confirman disponibilidad, precio final y entrega antes de pagar?`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }

  const api = Object.freeze({ isPrivateProduct, isLocalRegister, readAllRows, normalizeOwnProduct, normalizeExternalProduct, consultationUrl });
  scope.StoreCatalog = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
