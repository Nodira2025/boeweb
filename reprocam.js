/* ==========================================================================
   BÔ GROW CLUB — REPROCAM: CONTROLADOR DE CATÁLOGO Y TERMINAL DE CAJA
   ========================================================================== */

(function() {
  'use strict';

  const supabaseUrl = 'https://sxbhrgvizqylnfcqzhin.supabase.co';
  const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4YmhyZ3ZpenF5bG5mY3F6aGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMjM1MzEsImV4cCI6MjA5Njg5OTUzMX0.UUOwXsHXKNCjlJKdxMUlAuCtNAnNWgAroBwMlWAdTag';
  const TENANT_ID = '11111111-1111-1111-1111-111111111111';

  let supabaseClient = null;
  let rcProducts = [];
  let selectedRcUnit = 'g'; // 'g' | 'u'
  let selectedPaymentMethod = 'CASH'; // 'CASH' | 'DIGITAL'
  let rcRegister = null;
  let activeRcSession = null;
  let rcSessionMovements = [];

  // DOM Elements
  let productsContainer, productSelect, qtyInput, scaleValue, scaleUnitLabel;
  let totalDisplay, sessionBadge, openingValEl, salesValEl, expectedValEl;
  let openShiftPanel, closeShiftPanel, toastEl;

  document.addEventListener('DOMContentLoaded', async () => {
    initElements();
    initSupabase();
    await initAuthAndData();
  });

  function initElements() {
    productsContainer = document.getElementById('rc-products-container');
    productSelect = document.getElementById('rc-pos-product-select');
    qtyInput = document.getElementById('rc-pos-qty-input');
    scaleValue = document.getElementById('rc-scale-value');
    scaleUnitLabel = document.getElementById('rc-scale-unit-label');
    totalDisplay = document.getElementById('rc-pos-total-display');
    sessionBadge = document.getElementById('rc-session-badge');
    openingValEl = document.getElementById('rc-cash-opening-val');
    salesValEl = document.getElementById('rc-cash-sales-val');
    expectedValEl = document.getElementById('rc-cash-expected-val');
    openShiftPanel = document.getElementById('rc-open-shift-panel');
    closeShiftPanel = document.getElementById('rc-close-shift-panel');
    toastEl = document.getElementById('rc-toast');
  }

  function initSupabase() {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
      window.supabaseClient = supabaseClient;
    }
  }

  async function initAuthAndData() {
    if (window.SaasAuth?.ensureOperationalContext && supabaseClient) {
      try {
        await window.SaasAuth.ensureOperationalContext(supabaseClient);
      } catch (err) {
        console.warn('SaasAuth notice:', err);
      }
    }
    await Promise.all([loadRcRegister(), loadRcProducts()]);
  }

  // --- TABS & UI NAVIGATION ---
  function switchRcTab(tab) {
    const catalogSec = document.getElementById('section-catalog');
    const cashSec = document.getElementById('section-cash');
    const catalogBtn = document.getElementById('tab-btn-catalog');
    const cashBtn = document.getElementById('tab-btn-cash');

    if (tab === 'catalog') {
      catalogSec.classList.add('is-active');
      cashSec.classList.remove('is-active');
      catalogBtn.classList.add('is-active');
      cashBtn.classList.remove('is-active');
      catalogBtn.setAttribute('aria-selected', 'true');
      cashBtn.setAttribute('aria-selected', 'false');
    } else {
      catalogSec.classList.remove('is-active');
      cashSec.classList.add('is-active');
      catalogBtn.classList.remove('is-active');
      cashBtn.classList.add('is-active');
      catalogBtn.setAttribute('aria-selected', 'false');
      cashBtn.setAttribute('aria-selected', 'true');
      loadRcCashShift();
    }
  }
  window.switchRcTab = switchRcTab;

  function setRcUnit(unit) {
    selectedRcUnit = unit;
    const btnGram = document.getElementById('rc-btn-unit-gram');
    const btnUnit = document.getElementById('rc-btn-unit-unit');
    const priceLabel = document.getElementById('rc-price-label');
    const stockLabel = document.getElementById('rc-stock-label');
    const stockInput = document.getElementById('rc-prod-stock');

    if (unit === 'g') {
      btnGram.classList.add('is-active');
      btnUnit.classList.remove('is-active');
      priceLabel.textContent = 'Precio por Gramo ($)';
      stockLabel.textContent = 'Stock Total Disponible (Gramos)';
      stockInput.step = '0.001';
      stockInput.placeholder = 'Ej: 50.5';
    } else {
      btnUnit.classList.add('is-active');
      btnGram.classList.remove('is-active');
      priceLabel.textContent = 'Precio por Unidad ($)';
      stockLabel.textContent = 'Stock Total Disponible (Unidades)';
      stockInput.step = '1';
      stockInput.placeholder = 'Ej: 15';
    }
  }
  window.setRcUnit = setRcUnit;

  function setRcPaymentMethod(method) {
    selectedPaymentMethod = method;
    const btnCash = document.getElementById('rc-pay-cash-btn');
    const btnDigital = document.getElementById('rc-pay-digital-btn');
    if (method === 'CASH') {
      btnCash.classList.add('is-active');
      btnDigital.classList.remove('is-active');
    } else {
      btnDigital.classList.add('is-active');
      btnCash.classList.remove('is-active');
    }
  }
  window.setRcPaymentMethod = setRcPaymentMethod;

  function setRcQuickGrams(grams) {
    if (qtyInput) {
      qtyInput.value = grams;
      updateRcPosCalculation();
    }
  }
  window.setRcQuickGrams = setRcQuickGrams;

  function formatMoney(amount) {
    return '$' + Number(amount || 0).toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function showToast(msg, isError = false) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.style.borderColor = isError ? 'var(--rc-danger)' : 'var(--rc-gold)';
    toastEl.style.display = 'block';
    setTimeout(() => {
      toastEl.style.display = 'none';
    }, 3500);
  }

  // --- CATALOG MANAGEMENT ---
  async function loadRcProducts() {
    try {
      if (!supabaseClient) throw new Error('Cliente Supabase no disponible');

      // Buscar productos de categoría REPROCAM o con metadata is_reprocam = true
      const { data, error } = await supabaseClient
        .from('catalog_products')
        .select(`
          id, sku, name, price, active, metadata, created_at,
          inventory_balances_v2 ( on_hand, available )
        `)
        .eq('tenant_id', TENANT_ID)
        .or('category.eq.REPROCAM,metadata->>is_reprocam.eq.true')
        .order('name');

      if (error) throw error;

      rcProducts = (data || []).map(p => {
        const meta = p.metadata || {};
        const balance = p.inventory_balances_v2 && p.inventory_balances_v2[0];
        const stockOnHand = balance?.on_hand !== undefined ? Number(balance.on_hand) : Number(meta.reprocam_stock || 0);
        return {
          id: p.id,
          name: p.name,
          sku: p.sku,
          price: Number(p.price || 0),
          unit: meta.reprocam_unit || (p.name?.toLowerCase().includes('semilla') ? 'u' : 'g'),
          stock: stockOnHand
        };
      });

      renderRcProducts(rcProducts);
      populatePosProductSelect(rcProducts);
    } catch (err) {
      console.error('Error loading Reprocam products:', err);
      if (productsContainer) {
        productsContainer.innerHTML = `<div style="color: var(--rc-danger); grid-column: 1 / -1; text-align: center;">⚠️ Error al cargar productos: ${err.message}</div>`;
      }
    }
  }

  function renderRcProducts(products) {
    if (!productsContainer) return;
    if (!products || !products.length) {
      productsContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--rc-muted); padding: 30px;">
          <p style="font-size: 1.1rem; font-weight: 700;">No hay productos en Reprocam aún</p>
          <span style="font-size: 0.85rem;">Usá el formulario superior para dar de alta el primer lote de flores, biomasa o semillas sueltas.</span>
        </div>`;
      return;
    }

    productsContainer.innerHTML = products.map(p => {
      const isGram = p.unit === 'g';
      const stockDisplay = isGram ? `${p.stock.toFixed(2)} g` : `${Math.floor(p.stock)} u`;
      const priceUnit = isGram ? '/g' : '/u';
      return `
        <article class="rc-prod-card" id="rc-card-${p.id}">
          <div class="rc-prod-top">
            <h3 class="rc-prod-name">${escapeHtml(p.name)}</h3>
            <span class="rc-badge-unit ${isGram ? 'is-gram' : 'is-unit'}">
              ${isGram ? '⚖️ Gramos' : '📦 Unidad'}
            </span>
          </div>
          <div class="rc-prod-details">
            <span class="rc-prod-price">${formatMoney(p.price)} <small style="font-size: 0.75rem; color: var(--rc-muted);">${priceUnit}</small></span>
            <span class="rc-prod-stock">Disponible: <strong>${stockDisplay}</strong></span>
          </div>
          <button type="button" class="rc-btn-primary" style="margin-top: 6px; padding: 8px 12px; font-size: 0.85rem; min-height: 40px;" onclick="selectProductForSale('${p.id}')">
            ⚖️ Vender en Caja ›
          </button>
        </article>`;
    }).join('');
  }

  function populatePosProductSelect(products) {
    if (!productSelect) return;
    productSelect.innerHTML = '<option value="">-- Seleccioná un producto --</option>' +
      products.map(p => {
        const isGram = p.unit === 'g';
        const stockStr = isGram ? `${p.stock.toFixed(1)}g` : `${Math.floor(p.stock)}u`;
        return `<option value="${p.id}">${escapeHtml(p.name)} (${formatMoney(p.price)} | Disp: ${stockStr})</option>`;
      }).join('');
  }

  function handleRcSearch(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) {
      renderRcProducts(rcProducts);
      return;
    }
    const filtered = rcProducts.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    renderRcProducts(filtered);
  }
  window.handleRcSearch = handleRcSearch;

  async function handleRcAddProduct(e) {
    if (e) e.preventDefault();
    const nameInput = document.getElementById('rc-prod-name');
    const priceInput = document.getElementById('rc-prod-price');
    const stockInput = document.getElementById('rc-prod-stock');
    const submitBtn = document.getElementById('rc-submit-prod-btn');

    const name = nameInput?.value.trim();
    const price = Number(priceInput?.value);
    const stock = Number(stockInput?.value);

    if (!name || isNaN(price) || isNaN(stock) || price < 0 || stock < 0) {
      showToast('Por favor completá los campos con valores válidos.', true);
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    try {
      // 1. Intentar llamar a la RPC upsert_reprocam_product_v2
      let saved = false;
      try {
        const { data: rpcData, error: rpcErr } = await supabaseClient.rpc('upsert_reprocam_product_v2', {
          p_tenant_id: TENANT_ID,
          p_name: name,
          p_price: price,
          p_stock: stock,
          p_unit: selectedRcUnit
        });
        if (!rpcErr && rpcData?.success) saved = true;
      } catch (rpcEx) {
        console.warn('RPC upsert_reprocam_product_v2 notice, fallback to direct insert:', rpcEx);
      }

      // 2. Fallback directo a catalog_products si la RPC aún no fue creada
      if (!saved) {
        const sku = 'REP-' + Math.random().toString(36).substring(2, 9).toUpperCase();
        const { data: newProd, error: insertErr } = await supabaseClient
          .from('catalog_products')
          .insert({
            tenant_id: TENANT_ID,
            sku: sku,
            name: name,
            category: 'REPROCAM',
            price: price,
            currency: 'ARS',
            track_stock: true,
            metadata: {
              is_reprocam: true,
              reprocam_unit: selectedRcUnit,
              reprocam_stock: stock
            }
          })
          .select()
          .single();

        if (insertErr) throw insertErr;

        // Intentar registrar el stock en inventory_balances_v2
        try {
          const { data: locs } = await supabaseClient
            .from('inventory_locations_v2')
            .select('id')
            .eq('tenant_id', TENANT_ID)
            .eq('is_default', true)
            .limit(1);

          const defaultLocId = locs && locs[0] ? locs[0].id : null;
          if (defaultLocId) {
            await supabaseClient.from('inventory_balances_v2').upsert({
              tenant_id: TENANT_ID,
              product_id: newProd.id,
              location_id: defaultLocId,
              on_hand: stock,
              reserved: 0
            });
          }
        } catch (balErr) {
          console.warn('Balance fallback insert notice:', balErr);
        }
      }

      showToast(`✅ "${name}" guardado exitosamente en Reprocam.`);
      nameInput.value = '';
      priceInput.value = '';
      stockInput.value = '';
      await loadRcProducts();
    } catch (err) {
      console.error('Error adding Reprocam product:', err);
      showToast(`❌ Error al guardar: ${err.message}`, true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }
  window.handleRcAddProduct = handleRcAddProduct;

  function selectProductForSale(productId) {
    switchRcTab('cash');
    if (productSelect) {
      productSelect.value = productId;
      handleRcProductSelected();
    }
  }
  window.selectProductForSale = selectProductForSale;

  // --- POS WEIGHING & CASH TERMINAL ---
  function handleRcProductSelected() {
    const prodId = productSelect?.value;
    const prod = rcProducts.find(p => p.id === prodId);
    const quickGramsPanel = document.getElementById('rc-quick-grams-panel');

    if (!prod) {
      if (scaleValue) scaleValue.textContent = '0.000 g';
      if (totalDisplay) totalDisplay.textContent = '$0,00';
      return;
    }

    const isGram = prod.unit === 'g';
    if (scaleUnitLabel) scaleUnitLabel.textContent = isGram ? 'PESO A GRANEL:' : 'CANTIDAD ABIERTA:';
    if (qtyInput) {
      qtyInput.placeholder = isGram ? 'Ingresá gramos (ej: 3.5)' : 'Ingresá unidades (ej: 2)';
      qtyInput.step = isGram ? '0.001' : '1';
    }
    if (quickGramsPanel) quickGramsPanel.style.display = isGram ? 'grid' : 'none';

    updateRcPosCalculation();
  }
  window.handleRcProductSelected = handleRcProductSelected;

  function updateRcPosCalculation() {
    const prodId = productSelect?.value;
    const prod = rcProducts.find(p => p.id === prodId);
    const qty = Number(qtyInput?.value || 0);

    if (!prod || qty <= 0) {
      if (scaleValue) scaleValue.textContent = prod?.unit === 'u' ? '0 u' : '0.000 g';
      if (totalDisplay) totalDisplay.textContent = '$0,00';
      return;
    }

    const isGram = prod.unit === 'g';
    if (scaleValue) {
      scaleValue.textContent = isGram ? `${qty.toFixed(3)} g` : `${Math.floor(qty)} u`;
    }

    const total = Math.round(qty * prod.price * 100) / 100;
    if (totalDisplay) {
      totalDisplay.textContent = formatMoney(total);
    }
  }
  window.updateRcPosCalculation = updateRcPosCalculation;

  async function executeRcSale() {
    const prodId = productSelect?.value;
    const prod = rcProducts.find(p => p.id === prodId);
    const qty = Number(qtyInput?.value || 0);
    const chargeBtn = document.getElementById('rc-btn-charge');

    if (!prod) {
      showToast('Seleccioná un producto para vender.', true);
      return;
    }
    if (qty <= 0) {
      showToast('Ingresá una cantidad o peso mayor a cero.', true);
      qtyInput?.focus();
      return;
    }
    if (qty > prod.stock) {
      showToast(`Stock insuficiente. Solo hay disponible ${prod.stock}${prod.unit}.`, true);
      return;
    }

    const total = Math.round(qty * prod.price * 100) / 100;
    if (chargeBtn) chargeBtn.disabled = true;

    try {
      let saleCompleted = false;

      // 1. Intentar registrar vía RPC record_reprocam_sale_v2
      try {
        const { data: rpcSale, error: rpcSaleErr } = await supabaseClient.rpc('record_reprocam_sale_v2', {
          p_tenant_id: TENANT_ID,
          p_product_id: prod.id,
          p_quantity: qty,
          p_unit_price: prod.price,
          p_payment_method: selectedPaymentMethod,
          p_notes: `Venta Caja Reprocam (${prod.name})`
        });
        if (!rpcSaleErr && rpcSale?.success) {
          saleCompleted = true;
        }
      } catch (saleRpcEx) {
        console.warn('record_reprocam_sale_v2 notice, fallback to manual execution:', saleRpcEx);
      }

      // 2. Fallback de descuento directo de stock y movimiento de caja
      if (!saleCompleted) {
        const newStock = Math.max(0, prod.stock - qty);
        await supabaseClient
          .from('catalog_products')
          .update({
            metadata: {
              ...(prod.metadata || {}),
              is_reprocam: true,
              reprocam_unit: prod.unit,
              reprocam_stock: newStock
            }
          })
          .eq('tenant_id', TENANT_ID)
          .eq('id', prod.id);

        // Si hay una sesión de caja Reprocam abierta y se pagó en efectivo, registrar ingreso
        if (activeRcSession && selectedPaymentMethod === 'CASH') {
          await supabaseClient.from('cash_movements_v2').insert({
            tenant_id: TENANT_ID,
            session_id: activeRcSession.id,
            direction: 'IN',
            amount: total,
            reason: `Venta Reprocam: ${prod.name} (${qty}${prod.unit})`,
            reference_type: 'SALE'
          });
        }
      }

      showToast(`🎉 ¡Venta cobrada! ${formatMoney(total)} (${qty}${prod.unit} de ${prod.name}).`);
      qtyInput.value = '';
      updateRcPosCalculation();
      await Promise.all([loadRcProducts(), loadRcCashShift()]);
    } catch (err) {
      console.error('Error executing Reprocam sale:', err);
      showToast(`❌ Error al registrar venta: ${err.message}`, true);
    } finally {
      if (chargeBtn) chargeBtn.disabled = false;
    }
  }
  window.executeRcSale = executeRcSale;

  // --- INDEPENDENT CASH REGISTER & SHIFT SESSIONS ---
  async function loadRcRegister() {
    try {
      const { data, error } = await supabaseClient
        .from('cash_registers')
        .select('*')
        .eq('tenant_id', TENANT_ID)
        .eq('code', 'CAJA-REPROCAM')
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        rcRegister = data;
      }
    } catch (err) {
      console.warn('Load CAJA-REPROCAM notice:', err);
    }
  }

  async function loadRcCashShift() {
    if (!supabaseClient || !rcRegister) return;

    try {
      // 1. Buscar sesión OPEN para CAJA-REPROCAM
      const { data: session, error: sessErr } = await supabaseClient
        .from('cash_sessions_v2')
        .select('*')
        .eq('tenant_id', TENANT_ID)
        .eq('register_id', rcRegister.id)
        .eq('status', 'OPEN')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessErr) throw sessErr;

      activeRcSession = session;

      if (!session) {
        if (sessionBadge) {
          sessionBadge.textContent = '🔴 Turno Cerrado';
          sessionBadge.style.color = 'var(--rc-danger)';
        }
        if (openShiftPanel) openShiftPanel.style.display = 'flex';
        if (closeShiftPanel) closeShiftPanel.style.display = 'none';
        if (openingValEl) openingValEl.textContent = '$0,00';
        if (salesValEl) salesValEl.textContent = '$0,00';
        if (expectedValEl) expectedValEl.textContent = '$0,00';
        return;
      }

      if (sessionBadge) {
        sessionBadge.textContent = '🟢 Turno Abierto';
        sessionBadge.style.color = 'var(--rc-success)';
      }
      if (openShiftPanel) openShiftPanel.style.display = 'none';
      if (closeShiftPanel) closeShiftPanel.style.display = 'flex';

      const openingAmount = Number(session.opening_amount || 0);
      if (openingValEl) openingValEl.textContent = formatMoney(openingAmount);

      // 2. Cargar movimientos de efectivo de esta sesión
      const { data: movs } = await supabaseClient
        .from('cash_movements_v2')
        .select('direction, amount')
        .eq('tenant_id', TENANT_ID)
        .eq('session_id', session.id);

      let salesCash = 0;
      (movs || []).forEach(m => {
        const amt = Number(m.amount || 0);
        if (m.direction === 'IN') salesCash += amt;
        else salesCash -= amt;
      });

      const expected = openingAmount + salesCash;
      if (salesValEl) salesValEl.textContent = formatMoney(salesCash);
      if (expectedValEl) expectedValEl.textContent = formatMoney(expected);
    } catch (err) {
      console.warn('Error loading Reprocam cash shift:', err);
    }
  }

  async function openRcShift() {
    const input = document.getElementById('rc-opening-amount-input');
    const amount = Number(input?.value || 0);
    if (!rcRegister) {
      showToast('Caja Reprocam no encontrada en base de datos.', true);
      return;
    }

    try {
      const authUser = (await supabaseClient.auth.getUser())?.data?.user;
      const { data, error } = await supabaseClient.from('cash_sessions_v2').insert({
        tenant_id: TENANT_ID,
        register_id: rcRegister.id,
        opened_by: authUser?.id || '3855ee23-d46b-41d8-ae82-0cfebd105631',
        opening_amount: amount,
        status: 'OPEN'
      }).select().single();

      if (error) throw error;

      showToast(`🟢 Turno de Caja Reprocam abierto con ${formatMoney(amount)}.`);
      if (input) input.value = '';
      await loadRcCashShift();
    } catch (err) {
      console.error('Error opening Reprocam shift:', err);
      showToast(`❌ Error al abrir turno: ${err.message}`, true);
    }
  }
  window.openRcShift = openRcShift;

  async function closeRcShift() {
    if (!activeRcSession) return;
    if (!confirm('¿Confirmás el cierre del turno de Caja Reprocam?')) return;

    try {
      const authUser = (await supabaseClient.auth.getUser())?.data?.user;
      const { error } = await supabaseClient
        .from('cash_sessions_v2')
        .update({
          status: 'CLOSED',
          closed_by: authUser?.id || activeRcSession.opened_by,
          closed_at: new Date().toISOString()
        })
        .eq('tenant_id', TENANT_ID)
        .eq('id', activeRcSession.id);

      if (error) throw error;

      showToast('🔒 Turno de Caja Reprocam cerrado exitosamente.');
      await loadRcCashShift();
    } catch (err) {
      console.error('Error closing Reprocam shift:', err);
      showToast(`❌ Error al cerrar turno: ${err.message}`, true);
    }
  }
  window.closeRcShift = closeRcShift;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str || '');
    return div.innerHTML;
  }

})();
