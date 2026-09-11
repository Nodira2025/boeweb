(function initSectorEditor(scope) {
  'use strict';
  let draft = null;
  let photo = null;
  let preview = null;
  let busy = false;
  let message = '';
  let photoGeneration = 0;
  const html = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  function isOpen() { return Boolean(draft); }
  function render() { scope.rerenderStoreMap?.(); }
  function discardPhoto() {
    if (preview) URL.revokeObjectURL(preview);
    preview = null; photo = null; photoGeneration += 1;
  }
  async function open(code) {
    if (busy || draft) return;
    try {
      await scope.WmsSectors.load({ force: true });
      if (!scope.WmsSectors.canEdit()) throw new Error('Solo administración o supervisión puede editar sectores.');
      if (scope.WmsSectors.status().error) throw new Error(scope.WmsSectors.status().error);
      const sector = scope.WmsSectors.get(code);
      if (!sector) throw new Error('El sector no existe.');
      draft = { ...sector, tenantId: scope.WmsSectors.currentTenant(), photoAction: 'keep' };
      message = ''; render();
      document.getElementById('wms-sector-name')?.focus();
    } catch (failure) { scope.showToast?.(failure.message); }
  }
  function close() {
    if (busy) return;
    discardPhoto(); draft = null; message = ''; render();
  }
  function update(field, value) {
    if (!draft || busy || !['name', 'desc', 'sortOrder'].includes(field)) return;
    draft[field] = value;
  }
  function legacyPhoto() {
    try {
      const value = draft ? localStorage.getItem(`boeweb_wms_sector_photo_${draft.id}`) : null;
      return /^data:image\/(jpeg|png|webp);base64,/.test(value || '') ? value : null;
    } catch (failure) { return null; }
  }
  async function recoverLocalPhoto() {
    try {
      const data = legacyPhoto();
      if (!data) throw new Error('No hay una foto local recuperable.');
      const [header, encoded] = data.split(',');
      const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
      await selectPhoto({ target: { files: [new Blob([bytes], { type: header.split(':')[1].split(';')[0] })] } });
    } catch (failure) { message = failure.message; render(); }
  }
  function photoAction(action) {
    if (!draft || busy || !['keep', 'restore', 'reset'].includes(action)) return;
    discardPhoto(); draft.photoAction = action; message = ''; render();
  }
  async function selectPhoto(event) {
    const file = event.target.files?.[0];
    if (!file || !draft || busy) return;
    const currentDraft = draft;
    const version = ++photoGeneration;
    busy = true; message = 'Preparando imagen…'; render();
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Elegí una imagen JPG, PNG o WebP.');
      if (file.size > 15728640) throw new Error('La foto original debe pesar menos de 15 MB.');
      const compressed = await scope.compressImageFile(file, 1600, 1200, 0.8);
      if (draft !== currentDraft || version !== photoGeneration) return;
      if (!compressed || compressed.size > 2097152) throw new Error('La imagen sigue siendo demasiado grande. Elegí otra foto.');
      discardPhoto(); photo = compressed; preview = URL.createObjectURL(compressed);
      draft.photoAction = 'replace'; message = 'Foto preparada. Se compartirá cuando guardes el sector.';
    } catch (failure) { message = failure.message || 'No se pudo preparar esa imagen.'; }
    finally { busy = false; render(); }
  }
  async function save(event) {
    event?.preventDefault();
    if (!draft || busy) return;
    busy = true; message = 'Guardando en la tienda…'; render();
    try {
      await scope.WmsSectors.save(draft, photo);
      busy = false; close(); scope.showToast?.('Sector guardado y compartido con los dispositivos de la tienda.');
    } catch (failure) {
      message = failure.message || 'No se pudo confirmar el guardado. Tus cambios siguen en el editor.';
    } finally { busy = false; render(); }
  }
  function markup() {
    if (!draft) return '';
    if (draft.tenantId !== scope.WmsSectors.currentTenant()) { discardPhoto(); draft = null; return ''; }
    const disabled = busy ? 'disabled' : '';
    const selectedPhoto = preview || (draft.photoAction === 'reset' ? null : draft.photoUrl);
    return `<section class="wms-sector-editor" aria-labelledby="wms-editor-title" aria-busy="${busy}">
      <header><div><span class="wms-editor-eyebrow">Configuración del mapa · ${html(draft.id)}</span>
        <h3 id="wms-editor-title">Editar sector</h3></div><button type="button" onclick="WmsSectorEditor.close()" ${disabled}>Cancelar</button></header>
      <p>El código ${html(draft.id)} y las ubicaciones de productos no cambian. Solo se actualiza su presentación.</p>
      <form onsubmit="WmsSectorEditor.save(event)">
        <fieldset ${disabled}><div class="wms-editor-fields">
          <label for="wms-sector-name">Nombre<input id="wms-sector-name" maxlength="80" required value="${html(draft.name)}" oninput="WmsSectorEditor.update('name',this.value)"></label>
          <label for="wms-sector-order">Orden<input id="wms-sector-order" type="number" min="1" max="999" required value="${html(draft.sortOrder)}" oninput="WmsSectorEditor.update('sortOrder',this.value)"></label>
          <label class="wms-editor-description" for="wms-sector-description">Descripción<textarea id="wms-sector-description" maxlength="240" rows="2" oninput="WmsSectorEditor.update('desc',this.value)">${html(draft.desc)}</textarea></label>
        </div>
        <div class="wms-editor-photo">
          ${selectedPhoto ? `<img src="${html(selectedPhoto)}" alt="Vista previa de la foto del sector">` : '<div class="wms-photo-placeholder">Sin foto de referencia</div>'}
          <div><strong>Foto real del sector</strong><p>JPG, PNG o WebP. Se optimiza automáticamente.</p>
            <div class="wms-editor-photo-actions">
              <label class="wms-file-choice">Elegir de galería<input type="file" accept="image/jpeg,image/png,image/webp" onchange="WmsSectorEditor.selectPhoto(event)"></label>
              <label class="wms-file-choice">Tomar foto<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onchange="WmsSectorEditor.selectPhoto(event)"></label>
              ${legacyPhoto() ? '<button type="button" onclick="WmsSectorEditor.recoverLocalPhoto()">Recuperar foto de este navegador</button>' : ''}
              ${draft.previousPhotoPath ? '<button type="button" onclick="WmsSectorEditor.photoAction(\'restore\')">Recuperar foto anterior</button>' : ''}
              ${draft.photoPath || preview ? '<button type="button" onclick="WmsSectorEditor.photoAction(\'reset\')">Quitar foto actual</button>' : ''}
            </div>
            ${legacyPhoto() ? '<p>La foto local puede ser de una configuración anterior. Revisala antes de compartirla con esta tienda.</p>' : ''}
            ${draft.photoAction === 'restore' ? '<p>Al guardar se recuperará la foto anterior.</p>' : ''}
            ${draft.photoAction === 'reset' ? '<p>Al guardar se quitará la foto actual. Podrás recuperarla después.</p>' : ''}
          </div>
        </div></fieldset>
        <p role="status" aria-live="polite" class="wms-editor-message">${html(message)}</p>
        <button type="submit" class="wms-sector-save" ${disabled}>${busy ? 'Guardando…' : 'Guardar y compartir'}</button>
      </form></section>`;
  }
  scope.WmsSectorEditor = { open, close, update, selectPhoto, recoverLocalPhoto, photoAction, save, markup, isOpen };
})(window);
