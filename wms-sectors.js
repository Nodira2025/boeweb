/* Shared sector presentation; inventory balances remain owned by operational WMS. */
(function initWmsSectors(scope) {
  'use strict';
  const BUCKET = 'wms-sector-images';
  const EDIT_ROLES = new Set(['ADMIN', 'SUPERVISOR']);
  let defaults = [];
  let tenantId = null;
  let rows = [];
  let error = '';
  let loadedAt = 0;
  let generation = 0;
  let task = null;

  function context() { return scope.SaasAuth?.getTenantContext?.() || {}; }
  function client() { return scope.supabaseClient || scope.boeSupabaseClient; }
  function currentTenant() {
    const auth = context();
    return auth.isVerified ? auth.tenantId : null;
  }
  function canEdit() { return Boolean(currentTenant() && EDIT_ROLES.has(context().role)); }
  function configure(sectors) { defaults = sectors.map(sector => ({ ...sector })); }
  function list() {
    const currentRows = tenantId === currentTenant() ? rows : [];
    return defaults.map(sector => {
      const saved = currentRows.find(row => row.code === sector.id);
      return { ...sector, name: saved?.name || sector.name, desc: saved?.description ?? sector.desc,
        sortOrder: saved?.sort_order ?? sector.floor, revision: saved?.revision || 0,
        photoPath: saved?.photo_path || null, previousPhotoPath: saved?.previous_photo_path || null,
        photoUrl: saved?.photo_url || null, photoUnavailable: Boolean(saved?.photo_path && !saved?.photo_url),
        updatedAt: saved?.updated_at || null };
    }).sort((a, b) => a.sortOrder - b.sortOrder || a.floor - b.floor);
  }
  function get(code) { return list().find(sector => sector.id === code); }
  function status() { return { error: tenantId === currentTenant() ? error : '', loadedAt, canEdit: canEdit() }; }
  function notify() {
    if (scope.dispatchEvent && scope.CustomEvent) scope.dispatchEvent(new scope.CustomEvent('boeweb_wms_sectors_updated'));
  }
  async function signPhotos(items, reader) {
    const paths = [...new Set(items.map(row => row.photo_path).filter(Boolean))];
    if (!paths.length) return items;
    const result = await reader.storage.from(BUCKET).createSignedUrls(paths, 3600);
    if (result.error) throw result.error;
    const urls = new Map((result.data || []).map(item => [item.path, item.signedUrl]));
    return items.map(row => ({ ...row, photo_url: urls.get(row.photo_path) || null }));
  }
  async function load({ force = false } = {}) {
    const activeTenant = currentTenant();
    if (activeTenant !== tenantId) {
      generation += 1; tenantId = activeTenant; rows = []; task = null; loadedAt = 0; error = '';
    }
    if (!activeTenant || !client()) return list();
    if (task) return task;
    if (!force && loadedAt && Date.now() - loadedAt < 30000) return list();
    const version = ++generation;
    task = (async () => {
      try {
        const reader = client();
        const result = await reader.from('wms_sectors_v2')
          .select('code,name,description,sort_order,photo_path,previous_photo_path,revision,updated_at')
          .eq('tenant_id', activeTenant).order('sort_order');
        if (result.error) throw result.error;
        const incoming = await signPhotos(result.data || [], reader);
        if (version !== generation || activeTenant !== currentTenant()) return list();
        rows = incoming; loadedAt = Date.now(); error = '';
      } catch (failure) {
        if (version === generation) {
          error = 'No se pudieron actualizar los sectores. Reintentá antes de editarlos.';
          console.warn('No se pudo cargar la presentación de sectores:', failure.message);
        }
      } finally {
        if (version === generation) { task = null; notify(); }
      }
      return list();
    })();
    return task;
  }
  async function save(draft, photoBlob = null) {
    const auth = context();
    if (!canEdit() || draft.tenantId !== auth.tenantId) throw new Error('La sesión cambió o no permite editar sectores.');
    if (error || !loadedAt) throw new Error('Primero actualizá los sectores desde el servidor.');
    const reader = client();
    let photoPath = null;
    if (photoBlob) {
      if (photoBlob.type !== 'image/jpeg' || photoBlob.size > 2097152) throw new Error('La imagen preparada supera el tamaño permitido.');
      photoPath = `${auth.tenantId}/${draft.id}/${scope.crypto.randomUUID()}.jpg`;
      const upload = await reader.storage.from(BUCKET).upload(photoPath, photoBlob, { contentType: 'image/jpeg', upsert: false });
      if (upload.error) throw new Error(`No se pudo subir la foto: ${upload.error.message}`);
    }
    if (auth.tenantId !== currentTenant()) throw new Error('La sesión cambió. No se publicaron los cambios.');
    // Do not delete uploads on ambiguous network errors: the commit may have succeeded.
    const result = await scope.OperationalApi.updateWmsSector({ supabaseClient: reader, authContext: auth,
      sector: { ...draft, photoAction: photoBlob ? 'replace' : draft.photoAction, photoPath } });
    if (auth.tenantId !== currentTenant()) return result;
    const saveGeneration = ++generation; task = null;
    rows = [...rows.filter(row => row.code !== result.code), result];
    error = ''; loadedAt = Date.now();
    try {
      const signed = await signPhotos(rows, reader);
      if (generation === saveGeneration && auth.tenantId === currentTenant()) rows = signed;
    }
    catch (failure) { console.warn('Sector guardado; vista previa de foto no disponible:', failure.message); }
    if (generation === saveGeneration && auth.tenantId === currentTenant()) notify();
    return result;
  }

  function resolveFloor(record) {
    const code = String(record.wms_code || record.module_code || record.location || record.shelf_code || '').toUpperCase();
    const explicit = code.match(/^(?:S|SEC)([1-6])(?:-|$)/);
    if (explicit) return Number(explicit[1]);
    if (/^DP(?:-|$)/.test(code)) return 6;
    if (/^TI(?:-|$)/.test(code)) return 1;
    const floor = Number(record.location_metadata?.floor_level || record.floor_level || record.floor);
    return Number.isInteger(floor) && floor >= 1 && floor <= 6 ? floor : null;
  }
  function productKey(record) { return String(record.product_id || record.product_code || record.sku || record.id || ''); }
  function summarize(records) {
    const confirmed = records.filter(record => !record.is_draft);
    const stocked = confirmed.filter(record => Number(record.stock ?? record.quantity ?? record.on_hand) > 0);
    return {
      products: new Set(stocked.map(productKey)).size,
      units: confirmed.reduce((sum, record) => sum + Math.max(0, Number(record.stock ?? record.quantity ?? record.on_hand) || 0), 0),
      locations: new Set(stocked.map(record => record.location_id || `${record.wms_code || record.shelf_code}:${record.shelf_level || ''}`)).size,
      pending: new Set(records.filter(record => record.is_draft).map(record => record.draft_id || productKey(record))).size
    };
  }
  const api = { configure, list, get, load, save, status, canEdit, currentTenant, resolveFloor, summarize };
  scope.WmsSectors = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  scope.addEventListener?.('focus', () => { if (!scope.WmsSectorEditor?.isOpen()) void load({ force: true }); });
})(typeof window !== 'undefined' ? window : globalThis);
