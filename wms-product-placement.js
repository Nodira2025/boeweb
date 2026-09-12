/* Name-based placement. Every stock movement goes through the audited WMS RPC. */
(function initProductPlacement(scope) {
  'use strict';
  const SECTORS = { 1: 'Parafernalia', 2: 'Sustratos', 3: 'Fertilizantes', 4: 'Control de Plagas', 5: 'Indoor y Herramientas' };
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  // Specific uses precede brands: neem is pest control even when sold by a nutrient brand.
  const RULES = [
    [5, /\b(buffer|buffet ph|ph\b|ec\/tds|medidor|calibr|power cleaning|poeer cleaning)/],
    [4, /\b(neem|jabon potasico|insecticida|fungicida|herbicida|kothrina|pasta cicatrizante|mamboreta)\b|kawsay[ .]+control|vamp.*pocion|green leaf.*[46]\s*en\s*1/],
    [2, /lana de roca|\bjiffys?\b|\b(sustrato|sustratos|perlita|turba|klasmann|dynamics)\b/],
    [1, /turbina chupete|fan of hash|\b(rosin|rosing|dabber|nail|boveda|integra|pipa|pipas|bong|bongs|waterpipe|hookah|narguille|narguile|tabaco|cenicero|picador|grinder|encendedor|seda|sedas|ocb|raw|libella|stamps|rolling|rolled|blunt|sauver|fumanchu|soulblime|powerhitter|hisopos)\b|regulador de humedad|papel para extraccion|keep it fresh|munecos? lion|lion.*(bandeja|bolsa)|bandeja.*lion|hands clean/],
    [5, /\b(tijera|tijeras|scrog|poleas?|lighthanger|hanger|carabiner|pro cufs|carpa|carpas|indoor|indoorlux|led|luz|luces|foco|lampara|balastro|growtech|insativa|amnesia|cooler|ventilador|ventilacion|extractor|turbina|timer|timmer|bomba|pump|regadera|pulverizador|rociador|jeringa|lupa|magnifier|balanza|maceta|macetas|esquejadora|germinadora|cuchara medidora)\b|higrometro|higr[oó]metro|garden.*(?:fan|filtro|pro active|pro net|humipro|pumpro)|pistola de riego|piedra difusora|filtro de agua|electrical.*filter|campana para sodio/],
    [3, /powder feeding|\bfeeding\b|top\s*crop|top (candy|bud|bloom|vege)|bio\s*proyect|byo\s*proyect|bio\s*bizz|\b(namaste|plagron|plagaron|mantra|viridian|grotek|kawsay|azteka|azteca|nutrients|nutrientes|fertilizante|fertilizantes|micorrizas?|bokashi|vampkashi|guano)\b|mundo hidroponia|advanced.*(sensi|bud|overdrive|connoisseur|rhino|b-?\s*52)|vamp.*(hechizo|polvos)|green leaf.*silice/],
    [1, /\b(bandeja|bandejas|contenedor|tapa)\b/]
  ];

  function inferSector(product) {
    const name = normalize(product?.name);
    if (!name || /\b(prueba|test|esclavo)\b/.test(name)) return null;
    if (/the press club|\bpipe\b|\bpica\b|bolsa lion|carbon al fakher/.test(name)) return 1;
    const rule = RULES.find(([, expression]) => expression.test(name));
    return rule ? rule[0] : null;
  }
  function sectorLocation(floor) {
    if (!SECTORS[floor]) throw new Error('Sector no reconocido.');
    return { code: `S${floor}-GENERAL`, name: `Sector ${floor} · ${SECTORS[floor]} · Pendiente de góndola o balda`,
      location_type: 'SHELF', is_sellable: true, is_default: false,
      metadata: { floor_level: floor, shelf_code: 'GENERAL', is_sector_only: true } };
  }
  function normalizeLocation(location) {
    if (normalize(location?.location_type).trim() !== 'sector') return location;
    return { ...location, location_type: 'SHELF', metadata: { ...location.metadata, is_sector_only: true } };
  }
  function floorOf(location) {
    const code = String(location?.code || '');
    const explicit = code.match(/^(?:S|SEC)([1-6])(?:-|$)/i);
    return explicit ? Number(explicit[1]) : null;
  }
  function isPrivate(product) {
    const metadata = product.metadata || {};
    return /^(reprocam|reprocann)$/i.test(product.category || metadata.category || '')
      || String(metadata.is_reprocam) === 'true' || String(metadata.is_reprocann) === 'true';
  }
  function buildPlan(data) {
    const actions = [], review = [];
    for (const draft of data.drafts) {
      if (!['PENDING_REVIEW', 'PENDING_LOCATION'].includes(draft.status) || isPrivate(draft)) continue;
      const floor = inferSector(draft);
      const before = draft.location_data || {};
      if (!floor) review.push({ name: draft.name, reason: 'Nombre ambiguo', id: draft.id });
      const after = floor && floorOf(before) !== floor ? sectorLocation(floor) : normalizeLocation(before);
      if (after.code && JSON.stringify(after) !== JSON.stringify(before)) {
        actions.push({ kind: 'draft', id: draft.id, name: draft.name, before, after, floor,
          updatedAt: draft.updated_at, status: draft.status });
      }
    }
    const products = new Map(data.products.map(product => [product.id, product]));
    const locations = new Map(data.locations.map(location => [location.id, location]));
    for (const balance of data.balances) {
      const product = products.get(balance.product_id), origin = locations.get(balance.location_id);
      if (!product || isPrivate(product) || Number(balance.on_hand) <= 0) continue;
      if (product.active === false || product.track_stock === false) {
        review.push({ name: product.name, reason: 'Producto desactivado o sin control de stock', id: product.id });
        continue;
      }
      const floor = inferSector(product);
      if (!floor) { review.push({ name: product.name, reason: 'Nombre ambiguo', id: product.id }); continue; }
      if (floorOf(origin) === floor) continue;
      // Quarantine, damaged goods, reserves and inactive locations need a physical review.
      if (!origin?.active || !origin.is_sellable || ['WAREHOUSE', 'QUARANTINE', 'DAMAGED'].includes(origin.location_type)
        || /^(DP|S6|SEC6)(-|$)/i.test(origin.code) || Number(balance.reserved) > 0) {
        review.push({ name: product.name, reason: 'Reserva o ubicación protegida', id: product.id }); continue;
      }
      actions.push({ kind: 'transfer', id: product.id, name: product.name, floor, before: origin,
        after: sectorLocation(floor), quantity: Number(balance.on_hand) });
    }
    return { actions, review };
  }
  async function readRows(client, table, tenantId, order) {
    const rows = [];
    for (let offset = 0; offset < 100000; offset += 500) {
      let query = client.from(table).select('*').eq('tenant_id', tenantId);
      for (const column of order.split(',')) query = query.order(column);
      const result = await query.range(offset, offset + 499);
      if (result.error) throw result.error;
      rows.push(...(result.data || []));
      if ((result.data || []).length < 500) return rows;
    }
    throw new Error('El inventario supera el límite de lectura.');
  }
  async function readData(client, tenantId) {
    const data = {};
    for (const [key, table, order] of [
      ['drafts', 'catalog_product_drafts_v2', 'id'], ['products', 'catalog_products', 'id'],
      ['locations', 'inventory_locations_v2', 'id'], ['balances', 'inventory_balances_v2', 'product_id,location_id']
    ]) data[key] = await readRows(client, table, tenantId, order);
    return data;
  }
  async function applyPlan({ plan, client, authContext, api, getContext, onProgress = () => {} }) {
    const report = { completed: [], failed: [], review: plan.review };
    const destinations = new Map();
    for (const action of plan.actions) {
      try {
        const current = getContext();
        if (!current?.isVerified || current.tenantId !== authContext.tenantId || current.userId !== authContext.userId) {
          throw new Error('La sesión cambió. Volvé a preparar el ordenamiento.');
        }
        if (action.kind === 'draft') {
          const fresh = await client.from('catalog_product_drafts_v2').select('updated_at,status,location_data')
            .eq('tenant_id', authContext.tenantId).eq('id', action.id).single();
          if (fresh.error) throw fresh.error;
          const alreadyLocated = fresh.data.status === 'PENDING_REVIEW'
            && fresh.data.location_data?.code === action.after.code
            && fresh.data.location_data?.location_type === action.after.location_type
            && fresh.data.location_data?.metadata?.floor_level === action.after.metadata?.floor_level;
          if (!alreadyLocated) {
            if (fresh.data.updated_at !== action.updatedAt || fresh.data.status !== action.status) throw new Error('El borrador cambió. Actualizá la vista previa.');
            await api.locateCatalogProductDraft({ supabaseClient: client, authContext, draftId: action.id,
              location: action.after, idempotencyKey: action.key });
          }
        } else {
          if (!destinations.has(action.after.code)) {
            const result = await api.upsertInventoryLocation({ supabaseClient: client, authContext, location: action.after });
            destinations.set(action.after.code, result.location_id);
          }
          await api.transferInventory({ supabaseClient: client, authContext, productId: action.id,
            originLocationId: action.before.id, destinationLocationId: destinations.get(action.after.code),
            quantity: action.quantity, notes: `Ordenamiento por nombre: ${action.before.code} → ${action.after.code}`,
            idempotencyKey: action.key });
        }
        report.completed.push(action);
      } catch (error) {
        report.failed.push({ ...action, error: error.message });
        // An ambiguous response must be retried with the same key; never create a second transfer.
        if (!error.code || ['42501', 'SESSION_EXPIRED', 'AUTH_REQUIRED'].includes(error.code)) break;
      }
      onProgress(report.completed.length, plan.actions.length, report.failed.length);
    }
    return report;
  }
  const api = { SECTORS, inferSector, sectorLocation, normalizeLocation, buildPlan, readData, applyPlan };
  scope.WmsProductPlacement = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
