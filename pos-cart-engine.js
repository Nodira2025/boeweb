/* ==========================================================================
   BÔ GROW CLUB / PLATAFORMA SAAS — CART ENGINE UNIFICADO (FASE 11A)
   ==========================================================================
   Motor de carrito compartido con contexto aislado para POS, B2B y Tienda Pública.
   ========================================================================== */

class PosCartEngine {
  constructor(mode = 'POS') {
    this.validModes = ['POS', 'B2B_PURCHASE', 'PUBLIC_ORDER'];
    this.setMode(mode);
  }

  setMode(mode) {
    if (!this.validModes.includes(mode)) {
      console.warn(`[CartEngine] Modo '${mode}' no válido. Usando 'POS' por defecto.`);
      this.mode = 'POS';
    } else {
      this.mode = mode;
    }
    this.storageKey = `boeweb_cart_${this.mode.toLowerCase()}`;
    this.items = this.loadFromStorage();
  }

  loadFromStorage() {
    if (typeof localStorage === 'undefined') return [];
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error(`[CartEngine] Error cargando storage para modo ${this.mode}:`, e);
      return [];
    }
  }

  saveToStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.items));
    } catch (e) {
      console.error(`[CartEngine] Error guardando storage para modo ${this.mode}:`, e);
    }
  }

  addItem(product) {
    if (!product || (!product.id && !product.product_code)) return false;

    const code = product.product_code || product.id;
    const existingIndex = this.items.findIndex(item => (item.product_code || item.id) === code);
    const qty = Number(product.quantity) || 1;
    const unitPrice = Number(product.price) || 0;

    if (existingIndex >= 0) {
      this.items[existingIndex].quantity += qty;
    } else {
      this.items.push({
        id: code,
        product_code: code,
        name: product.name || 'Producto Sin Nombre',
        price: unitPrice,
        quantity: qty,
        availability: product.availability || (product.own_stock > 0 ? 'EN_STOCK' : 'A_PEDIDO'),
        supplier_code: product.supplier_code || 'own',
        image_url: product.image_url || 'assets/logo.jpg'
      });
    }

    this.saveToStorage();
    return true;
  }

  removeItem(productCode) {
    this.items = this.items.filter(item => (item.product_code || item.id) !== productCode);
    this.saveToStorage();
  }

  updateQuantity(productCode, newQuantity) {
    const qty = Number(newQuantity);
    if (qty <= 0) {
      this.removeItem(productCode);
      return;
    }

    const item = this.items.find(i => (i.product_code || i.id) === productCode);
    if (item) {
      item.quantity = qty;
      this.saveToStorage();
    }
  }

  clear() {
    this.items = [];
    this.saveToStorage();
  }

  getItems() {
    return [...this.items];
  }

  getItemCount() {
    return this.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  }

  getSubtotal() {
    return this.items.reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.quantity) || 0)), 0);
  }

  setDiscount(type = 'PERCENT', value = 0) {
    const normType = String(type).toUpperCase() === 'FIXED' || String(type).toUpperCase() === 'AMOUNT' ? 'FIXED' : 'PERCENT';
    const numVal = Math.max(0, Number(value) || 0);
    this.discount = { type: normType, value: numVal };
  }

  getDiscount() {
    return { ...(this.discount || { type: 'PERCENT', value: 0 }) };
  }

  getDiscountAmount(customDiscount = null) {
    const subtotal = this.getSubtotal();
    if (customDiscount !== null && typeof customDiscount === 'number') {
      return (subtotal * customDiscount) / 100;
    }
    const disc = this.discount || { type: 'PERCENT', value: 0 };
    if (disc.type === 'PERCENT') {
      return (subtotal * (disc.value || 0)) / 100;
    }
    return Math.min(subtotal, disc.value || 0);
  }

  getTotal(discountPercent = null) {
    const subtotal = this.getSubtotal();
    const discountAmount = this.getDiscountAmount(discountPercent);
    return Math.max(0, subtotal - discountAmount);
  }

  createSaleDraft(options = {}) {
    const cashierUser = options.cashierUser || { id: 'anonymous', name: 'Cajero' };
    const salespersonUser = options.salespersonUser || { id: 'anonymous', name: 'Vendedor' };
    const subtotal = this.getSubtotal();
    const discountAmount = options.discount !== undefined ? Number(options.discount) : this.getDiscountAmount();
    const discountType = options.discountType || (this.discount ? this.discount.type : 'PERCENT');
    const total = options.total !== undefined ? Number(options.total) : Math.max(0, subtotal - discountAmount);
    const dateNow = new Date();

    return {
      draft_id: `draft_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      tenant_id: options.tenantId || '11111111-1111-1111-1111-111111111111',
      cashier_user_id: cashierUser.id || cashierUser.user_id || 'anonymous',
      cashier_name_snapshot: cashierUser.name || cashierUser.email || 'Cajero Principal',
      salesperson_user_id: salespersonUser.id || salespersonUser.user_id || 'anonymous',
      salesperson_name_snapshot: salespersonUser.name || salespersonUser.email || 'Vendedor Mostrador',
      items: this.items.map(i => ({
        product_id: i.product_code || i.id,
        name: i.name,
        quantity: i.quantity,
        unit_price: i.price,
        subtotal: i.price * i.quantity,
        availability: i.availability || 'EN_STOCK'
      })),
      subtotal,
      discount: discountAmount,
      discount_type: discountType,
      total,
      payment_method: options.paymentMethod || 'EFECTIVO',
      notes: options.notes || '',
      idempotency_key: `pos_draft_${Date.now()}_${total}`,
      created_at: dateNow.toISOString(),
      status: 'DRAFT_READY_FOR_11B'
    };
  }
}

if (typeof window !== 'undefined') {
  window.PosCartEngine = PosCartEngine;
}
if (typeof global !== 'undefined') {
  global.PosCartEngine = PosCartEngine;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PosCartEngine };
}
