(function initInventoryExport(root) {
  'use strict';

  const SOURCES = [
    ['products', 'catalog_products', 'id,sku,barcode,name,category,price,cost_price,currency,active,track_stock,metadata,updated_at', ['id']],
    ['balances', 'inventory_balances_v2', 'product_id,location_id,on_hand,reserved,available,updated_at', ['product_id', 'location_id']],
    ['locations', 'inventory_locations_v2', 'id,code,name,location_type,parent_location_id,is_sellable,active,metadata', ['id']],
    ['sources', 'external_catalog_sources_v2', 'id,source_type,name,contact_info,estimated_days,active,metadata', ['id']],
    ['offers', 'external_catalog_offers_v2', 'id,source_id,external_sku,name,category,cost_price,retail_price,available_units,active,metadata,updated_at', ['id']]
  ];
  let busy = false;

  function assertAdmin(context) {
    if (!context?.isVerified || !context.tenantId || !context.userId || !['ADMIN', 'SUPERADMIN'].includes(context.role)) {
      throw new Error('Necesitás una sesión administrativa verificada para exportar inventarios.');
    }
  }

  async function readPages(client, tenantId, table, columns, order) {
    const rows = [];
    try {
      // Advance by the actual response size: installations can cap pages below 500 rows.
      while (rows.length < 1000000) {
        let query = client.from(table).select(columns, { count: 'exact' }).eq('tenant_id', tenantId);
        for (const column of order) query = query.order(column, { ascending: true });
        const { data, error, count } = await query.range(rows.length, rows.length + 499);
        if (error) throw error;
        if (!Array.isArray(data)) throw new Error('Respuesta de datos inválida.');
        rows.push(...data);
        if (Number.isInteger(count) && rows.length >= count) return rows;
        if (data.length === 0) {
          if (Number.isInteger(count) && rows.length < count) throw new Error('La lectura quedó incompleta.');
          return rows;
        }
      }
      throw new Error('El inventario supera el límite de exportación.');
    } catch (error) {
      throw new Error(`No se pudo leer ${table}: ${error.message || 'error de conexión'}`);
    }
  }

  async function fetchData(client, context, scope = 'all') {
    assertAdmin(context);
    try {
      const selected = SOURCES.filter(([key]) => scope === 'all'
        || (['b2b', 'local'].includes(scope) ? ['sources', 'offers'].includes(key) : ['products', 'balances', 'locations'].includes(key)));
      const results = await Promise.allSettled(selected.map(async ([key, table, columns, order]) => {
        try {
          return [key, await readPages(client, context.tenantId, table, columns, order)];
        } catch (error) { throw error; }
      }));
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
      return { products: [], balances: [], locations: [], sources: [], offers: [], ...Object.fromEntries(results.map(result => result.value)) };
    } catch (error) { throw error; }
  }

  function number(value) {
    return value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  }

  function state(active) { return active === false ? 'Inactivo' : 'Activo'; }
  function yes(value) { return value ? 'Sí' : 'No'; }
  function text(value) { return value == null ? '' : String(value); }

  function locationFields(location, locations) {
    const meta = location?.metadata || {};
    const code = location?.code || '';
    // WMS codes can end in N3-I: shelf level 3 and left sector. Explicit metadata takes precedence.
    const level = meta.shelf_level ?? meta.human_level ?? code.match(/(?:^|-)N(\d+)(?:-|$)/i)?.[1];
    const sector = meta.sector_position || meta.sector || code.match(/-([ICD])$/i)?.[1] || '';
    return [code || 'Sin ubicación asignada', location?.name || '',
      locations.get(location?.parent_location_id)?.name || '', location?.location_type || '',
      text(level), ({ I: 'Izquierda', C: 'Centro', D: 'Derecha' })[text(sector).toUpperCase()] || text(sector),
      text(meta.address), location ? state(location.active) : '', location ? yes(location.is_sellable) : ''];
  }

  function indexBalances(data, locations) {
    const productIds = new Set(data.products.map(product => product.id));
    const balances = new Map();
    for (const balance of data.balances) {
      if (!productIds.has(balance.product_id)) throw new Error('Hay un saldo sin producto legible. Actualizá e intentá nuevamente.');
      if (!locations.has(balance.location_id)) throw new Error('Hay un saldo sin ubicación legible. Actualizá e intentá nuevamente.');
      if (!balances.has(balance.product_id)) balances.set(balance.product_id, []);
      balances.get(balance.product_id).push(balance);
    }
    return balances;
  }

  function totalBalances(entries, locations) {
    return entries.reduce((sum, balance) => {
      const location = locations.get(balance.location_id);
      sum.hand += number(balance.on_hand) || 0;
      sum.reserved += number(balance.reserved) || 0;
      if (location.active && location.is_sellable) sum.sellable += number(balance.available) || 0;
      return sum;
    }, { hand: 0, reserved: 0, sellable: 0 });
  }

  function ownProductRow(product, entries, locations) {
    const tracked = product.track_stock !== false;
    const totals = totalBalances(entries, locations);
    const cost = number(product.cost_price);
    return [text(product.id), text(product.sku), text(product.barcode), product.name, product.category || '',
      text(product.metadata?.brand), text(product.metadata?.presentation), state(product.active), yes(tracked),
      tracked ? totals.hand : null, tracked ? totals.reserved : null, tracked ? totals.sellable : null,
      number(product.price), cost, product.currency, tracked && cost !== null ? totals.hand * cost : null,
      entries.length, entries.length ? 'Con ubicación' : 'Sin ubicación asignada', product.updated_at || ''];
  }

  function physicalProductRow(product, balance, locations) {
    const tracked = product.track_stock !== false;
    const location = balance ? locations.get(balance.location_id) : null;
    return [text(product.id), text(product.sku), text(product.barcode), product.name,
      ...locationFields(location, locations),
      balance ? number(balance.on_hand) : (tracked ? 0 : null),
      balance ? number(balance.reserved) : (tracked ? 0 : null),
      balance ? number(balance.available) : (tracked ? 0 : null), balance?.updated_at || '',
      state(product.active), yes(tracked)];
  }

  function buildOwnSheets(data, isPrivateProduct) {
    const products = data.products.filter(product => !isPrivateProduct(product));
    const locations = new Map(data.locations.map(location => [location.id, location]));
    const balances = indexBalances(data, locations);
    const own = [];
    const physical = [];
    for (const product of products) {
      const entries = balances.get(product.id) || [];
      own.push(ownProductRow(product, entries, locations));
      for (const balance of entries.length ? entries : [null]) {
        physical.push(physicalProductRow(product, balance, locations));
      }
    }
    return [
      { name: 'Stock propio', headers: ['ID producto', 'SKU', 'Código de barras', 'Producto', 'Categoría', 'Marca', 'Presentación', 'Estado', 'Controla stock', 'Existencias físicas', 'Reservado', 'Disponible en ubicaciones vendibles', 'Precio de venta', 'Costo unitario', 'Moneda', 'Valor físico al costo', 'Cantidad de ubicaciones', 'Asignación', 'Actualizado (ISO)'], rows: own, money: [12, 13, 15] },
      { name: 'Ubicaciones', headers: ['ID producto', 'SKU', 'Código de barras', 'Producto', 'Código ubicación', 'Ubicación', 'Ubicación superior', 'Tipo', 'Nivel', 'Sector', 'Dirección', 'Estado ubicación', 'Ubicación vendible', 'Existencias físicas', 'Reservado', 'Disponible físico', 'Saldo actualizado (ISO)', 'Estado producto', 'Controla stock'], rows: physical }
    ];
  }

  function buildExternalSheets(data, isPrivateProduct) {
    const sources = new Map(data.sources.map(source => [source.id, source]));
    const rows = { B2B_SUPPLIER: [], LOCAL_STORE: [] };
    for (const offer of data.offers) {
      if (isPrivateProduct(offer)) continue;
      const source = sources.get(offer.source_id);
      if (!source || !rows[source.source_type]) throw new Error('Hay una oferta sin proveedor o local legible. Actualizá e intentá nuevamente.');
      // Legacy supplier contacts store "phone · address"; prefer the explicit address when present.
      const address = source.metadata?.address || text(source.contact_info).split('·')[1]?.trim() || '';
      rows[source.source_type].push([text(offer.id), text(offer.external_sku), text(offer.metadata?.barcode), offer.name,
        offer.category || '', text(offer.metadata?.brand), text(offer.metadata?.presentation), source.name,
        text(source.contact_info), text(address), number(source.estimated_days), number(offer.available_units),
        number(offer.cost_price), number(offer.retail_price), text(offer.metadata?.currency || source.metadata?.currency) || 'No informada',
        state(offer.active), state(source.active), offer.updated_at || '']);
    }
    const headers = ['ID oferta', 'SKU externo', 'Código de barras', 'Producto', 'Categoría', 'Marca', 'Presentación', 'Proveedor / local', 'Contacto', 'Dirección', 'Entrega estimada (días)', 'Disponibilidad informada', 'Costo unitario', 'Precio de venta', 'Moneda', 'Estado oferta', 'Estado proveedor / local', 'Actualizado (ISO)'];
    return [{ name: 'B2B', headers, rows: rows.B2B_SUPPLIER, money: [12, 13] },
      { name: 'Locales', headers, rows: rows.LOCAL_STORE, money: [12, 13] }];
  }

  function buildSheets(data, { scope = 'all', isPrivateProduct, context, startedAt, finishedAt } = {}) {
    if (typeof isPrivateProduct !== 'function') throw new Error('No se pudo verificar el alcance del catálogo comercial.');
    if (!['all', 'own', 'b2b', 'local', 'locations'].includes(scope)) throw new Error('Inventario no válido.');
    let sheets = [];
    if (['all', 'own', 'locations'].includes(scope)) {
      sheets = buildOwnSheets(data, isPrivateProduct);
      if (scope === 'locations') sheets = sheets.filter(sheet => sheet.name === 'Ubicaciones');
    }
    if (['all', 'b2b', 'local'].includes(scope)) {
      const external = buildExternalSheets(data, isPrivateProduct);
      sheets.push(...external.filter(sheet => scope === 'all' || sheet.name === (scope === 'b2b' ? 'B2B' : 'Locales')));
    }
    const summary = { name: 'Resumen', headers: ['Dato', 'Detalle'], rows: [
      ['Empresa (ID)', text(context?.tenantId)], ['Inicio de lectura (ISO)', startedAt || ''], ['Fin de lectura (ISO)', finishedAt || ''],
      ...sheets.map(sheet => [`Filas en ${sheet.name}`, sheet.rows.length]),
      ['Alcance', 'Catálogo comercial completo del origen elegido, sin filtros de pantalla. Incluye activos e inactivos identificados.'],
      ['Stock propio', 'Existencias y reservas sumadas por producto. Disponible vendible usa solo ubicaciones activas y vendibles; revisar también el estado del producto.'],
      ['Ubicaciones', 'Una fila por producto y ubicación. Productos sin saldo registrado figuran sin ubicación asignada. No sumar esta hoja con Stock propio.'],
      ['B2B y locales', 'Disponibilidad informada por terceros, sujeta a confirmación. No es stock propio ni se suma a él.'],
      ['Datos faltantes', 'Celdas vacías indican datos no informados o sin control de stock. Cero indica una cantidad registrada o ausencia de saldos.'],
      ['Valuación', 'Existencias físicas por costo unitario, en la moneda de cada producto. No sumar monedas distintas.'],
      ['Lectura', 'Datos centrales leídos durante el intervalo indicado; pueden cambiar mientras se exportan. Fechas ISO con zona horaria.']
    ] };
    return [summary, ...sheets];
  }

  function createWorkbook(XLSX, sheets) {
    const workbook = XLSX.utils.book_new();
    for (const sheet of sheets) {
      // aoa_to_sheet preserves SKU/barcodes and formula-looking names as literal strings.
      const worksheet = XLSX.utils.aoa_to_sheet([sheet.headers, ...sheet.rows]);
      worksheet['!cols'] = sheet.headers.map((header, column) => ({ wch: sheet.name === 'Resumen'
        ? (column === 0 ? 30 : 100)
        : Math.min(42, Math.max(14, header.length + 2, ...sheet.rows.slice(0, 200).map(row => text(row[column]).length + 1))) }));
      if (sheet.name !== 'Resumen') worksheet['!autofilter'] = { ref: worksheet['!ref'] };
      for (let row = 1; row <= sheet.rows.length; row += 1) {
        for (const column of sheet.money || []) {
          const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })];
          if (cell?.t === 'n') cell.z = '#,##0.00';
        }
      }
      XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
    }
    return workbook;
  }

  async function download({ client, auth, button, scope = 'all', statusId = 'inventory-export-status' }) {
    if (busy) return;
    busy = true;
    const label = button?.textContent;
    const status = root.document?.getElementById(statusId);
    const report = message => { if (status) status.textContent = message; };
    if (button) { button.disabled = true; button.textContent = 'Preparando Excel…'; }
    try {
      report('Verificando sesión y leyendo inventarios completos…');
      if (!client || !auth?.hydrateFromSupabase || !root.XLSX) throw new Error('No se pudo iniciar la exportación. Recargá la página.');
      if (!await auth.hydrateFromSupabase(client)) throw new Error('Volvé a iniciar sesión para exportar.');
      const context = { ...auth.getTenantContext() };
      assertAdmin(context);
      const startedAt = new Date().toISOString();
      const data = await fetchData(client, context, scope);
      const current = auth.getTenantContext();
      assertAdmin(current);
      if (current.tenantId !== context.tenantId || current.userId !== context.userId) throw new Error('La sesión cambió durante la exportación. Intentá nuevamente.');
      const finishedAt = new Date().toISOString();
      const sheets = buildSheets(data, { scope, context, startedAt, finishedAt, isPrivateProduct: root.StoreCatalog?.isPrivateProduct });
      const workbook = createWorkbook(root.XLSX, sheets);
      root.XLSX.writeFile(workbook, `inventario-${scope}-${finishedAt.replace(/[:.]/g, '-')}.xlsx`, { compression: true });
      report('Excel generado. Revisá las descargas de tu navegador.');
    } catch (error) {
      console.error('No se pudo exportar el inventario:', error);
      report(`No se generó el Excel. ${error.message || 'Intentá nuevamente.'}`);
    } finally {
      busy = false;
      if (button) { button.disabled = false; button.textContent = label; }
    }
  }

  const api = Object.freeze({ readPages, fetchData, buildSheets, createWorkbook, download });
  root.InventoryExport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
