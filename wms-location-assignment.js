/* Location commands never fabricate stock or maintain a browser-only inventory. */
(function (scope) {
  'use strict';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const clone = value => JSON.parse(JSON.stringify(value));

  function identity(product) {
    if (product.status === 'REJECTED') throw new Error('El borrador fue rechazado. Actualizá la lista.');
    const pending = ['PENDING_LOCATION', 'PENDING_REVIEW'].includes(product.status);
    const draftId = product.status === 'APPROVED' ? null
      : product.draft_id || ((product.is_draft || pending) ? product.id : null);
    if (draftId && UUID.test(draftId)) return { kind: 'draft', id: draftId };
    if (draftId || (product.is_draft && product.status !== 'APPROVED') || pending) {
      throw new Error('El borrador no tiene una identidad válida. Actualizá la lista.');
    }
    const productId = product.product_id || (product.status !== 'APPROVED' ? product.id : null);
    if (!UUID.test(productId || '')) throw new Error('No se pudo identificar el producto central. Actualizá el inventario.');
    return { kind: 'stock', id: productId };
  }

  function createJob({ products, location, tenantId, userId, randomId = () => scope.crypto.randomUUID() }) {
    if (!products?.length || !location?.code || !tenantId || !userId) throw new Error('Faltan productos, destino o sesión para guardar.');
    const seen = new Set();
    const entries = products.map(product => {
      const target = identity(product);
      const key = `${target.kind}:${target.id}:${product.location_id || ''}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return { product: clone(product), target, confirmed: false, attempted: false, plan: null,
        idempotencyKey: `wms-placement:${randomId()}` };
    }).filter(Boolean);
    return { tenantId, userId, location: clone(location), entries, running: false, destinationId: null };
  }

  async function readResult(query, message) {
    const { data, error } = await query;
    if (error) throw new Error(`${message}: ${error.message || 'error de conexión'}`);
    return data;
  }

  async function prepareTransfer(entry, job, client) {
    let query = client.from('inventory_balances_v2')
      .select('location_id,on_hand,reserved,available')
      .eq('tenant_id', job.tenantId).eq('product_id', entry.target.id).gt('on_hand', 0);
    const origin = entry.product.location_id;
    if (origin) {
      if (!UUID.test(origin)) throw new Error('La ubicación de origen no es válida. Actualizá el mapa.');
      query = query.eq('location_id', origin);
    }
    const balances = await readResult(query.order('location_id').limit(2), 'No se pudo consultar el stock de origen');
    if (!balances?.length) throw new Error('Sin stock físico en el origen. Revisá el inventario; ubicar no crea unidades.');
    if (balances.length !== 1) throw new Error('El producto tiene más de una ubicación. Elegí el origen desde el mapa o usá Traslados WMS.');
    const balance = balances[0];
    const quantity = Number(balance.on_hand);
    if (!UUID.test(balance.location_id || '') || !Number.isFinite(quantity) || quantity <= 0) throw new Error('El stock de origen no es válido. Actualizá el inventario.');
    // Moving the whole position must not leave reserved units behind without telling the operator.
    if (Number(balance.reserved) !== 0 || Number(balance.available) !== quantity) {
      throw new Error('Hay unidades reservadas. Resolvé la reserva o trasladá una cantidad disponible desde Traslados WMS.');
    }
    return { productId: entry.target.id, originLocationId: balance.location_id, quantity };
  }

  async function resolveDestination(job, client, api, authContext) {
    if (job.destinationId) return job.destinationId;
    const existing = await readResult(client.from('inventory_locations_v2').select('id,code,active')
      .eq('tenant_id', job.tenantId).eq('code', job.location.code).maybeSingle(), 'No se pudo consultar el destino');
    if (existing) {
      if (!existing.active) throw new Error('El destino está inactivo. Elegí otra ubicación.');
      job.destinationId = existing.id;
    } else {
      const created = await api.upsertInventoryLocation({ supabaseClient: client, authContext, location: job.location });
      job.destinationId = created?.location_id;
    }
    if (!UUID.test(job.destinationId || '')) {
      job.destinationId = null;
      throw new Error('La base no confirmó la ubicación de destino. Reintentá.');
    }
    return job.destinationId;
  }

  async function executeEntry(entry, job, { supabaseClient, api, authContext }) {
    if (entry.target.kind === 'draft') {
      entry.attempted = true;
      const result = await api.locateCatalogProductDraft({ supabaseClient, authContext,
        draftId: entry.target.id, location: job.location, idempotencyKey: entry.idempotencyKey });
      if (result?.draft_id !== entry.target.id || !['PENDING_REVIEW', 'APPROVED'].includes(result?.status)) {
        throw new Error('La base no confirmó la ubicación del borrador. Reintentá para verificar.');
      }
      return;
    }
    if (!entry.plan) entry.plan = await prepareTransfer(entry, job, supabaseClient);
    const destinationLocationId = await resolveDestination(job, supabaseClient, api, authContext);
    if (entry.plan.originLocationId === destinationLocationId) return;
    entry.attempted = true;
    const result = await api.transferInventory({ supabaseClient, authContext, ...entry.plan, destinationLocationId,
      notes: `Ubicación asistida → ${job.location.code}`, idempotencyKey: entry.idempotencyKey });
    if (!result?.transfer_id || result.product_id !== entry.target.id || result.destination_location_id !== destinationLocationId) {
      throw new Error('La base no confirmó el traslado. Reintentá para verificar; no se duplicarán las unidades.');
    }
  }

  async function runJob(job, options) {
    if (job.running) throw new Error('Ya se está guardando este grupo de productos.');
    const context = options.authContext;
    if (!context?.isVerified || context.tenantId !== job.tenantId || context.userId !== job.userId) {
      throw new Error('La sesión cambió. Volvé a verificarla antes de continuar.');
    }
    job.running = true;
    let failure = null;
    try {
      for (const entry of job.entries) {
        if (entry.confirmed) continue;
        try {
          await executeEntry(entry, job, options);
          entry.confirmed = true;
        } catch (error) {
          failure = { entry, message: error.message || 'No se pudo confirmar el guardado.' };
          break;
        }
        // A visual refresh is not part of the transaction and cannot invalidate a confirmed write.
        try { options.onProgress?.(job.entries.filter(item => item.confirmed).length, job.entries.length); }
        catch (error) { console.warn('No se pudo mostrar el progreso de ubicación:', error); }
      }
      const confirmed = job.entries.filter(entry => entry.confirmed);
      return { confirmed, pending: job.entries.filter(entry => !entry.confirmed), failure, complete: !failure };
    } finally { job.running = false; }
  }

  const api = { createJob, runJob, identity };
  scope.WmsLocationAssignment = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
