import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import AppConfig from '../app-config.js';

const tenantId = '11111111-1111-1111-1111-111111111111';
const clone = value => JSON.parse(JSON.stringify(value));
const config = (name = 'Central', revision = 1) => AppConfig.normalizeConfig({ tenantId, revision, brand: { texts: { name } } });
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function row(stage = 'published', revision = 1, name = 'Central') {
  return { tenant_id: tenantId, stage, revision, config_json: config(name, revision), updated_at: '2026-09-11T12:00:00Z', published_at: stage === 'published' ? '2026-09-11T12:00:00Z' : null };
}
function database(initial = [row()]) {
  const rows = new Map(initial.map(value => [`${value.tenant_id}:${value.stage}`, clone(value)]));
  const writes = [];
  const client = { from() {
    let payload;
    let operation = 'read';
    const filters = {};
    return {
      select() { return this; },
      eq(key, value) { filters[key] = value; return this; },
      update(value) { payload = value; operation = 'update'; return this; },
      insert(value) { payload = value; operation = 'insert'; return this; },
      async maybeSingle() {
        const key = `${payload?.tenant_id || filters.tenant_id}:${payload?.stage || filters.stage}`;
        const current = rows.get(key);
        if (operation === 'read') return { data: current ? clone(current) : null };
        writes.push({ operation, filters: clone(filters), payload: clone(payload) });
        if (operation === 'insert' && current) return { error: { code: '23505', message: 'duplicate' } };
        if (operation === 'update' && (!current || current.revision !== filters.revision)) return { data: null };
        const saved = { ...payload, updated_at: '2026-09-11T15:00:00Z' };
        rows.set(key, clone(saved));
        return { data: clone(saved) };
      }
    };
  } };
  return { client, rows, writes };
}
const repository = (db, cache = storage()) => AppConfig.createRepository({ tenantId, storage: cache, supabaseClient: db.client, requireRemoteWrites: true, requireRemoteReads: true });

test('two administrators cannot publish over the version the other just saved', async () => {
  const db = database();
  const first = repository(db);
  const second = repository(db);
  await Promise.all([first.loadPublished(), second.loadPublished()]);
  const saved = await first.publish(config('Primero', 999));
  assert.equal(saved.config.revision, 2, 'revision comes from the central baseline, never client input');
  assert.equal(saved.config.updatedAt, '2026-09-11T15:00:00Z');
  await assert.rejects(second.publish(config('Segundo')), { code: 'CONFIG_CONFLICT' });
  assert.equal(db.rows.get(`${tenantId}:published`).config_json.brand.texts.name, 'Primero');
  assert.equal(db.writes[1].filters.revision, 1);
  await second.loadPublished();
  assert.equal((await second.publish(config('Revisado'))).config.revision, 3);
});

test('drafts have an independent conflict baseline; a conflict preserves the cache', async () => {
  const db = database([row('draft', 3)]);
  const cache = storage();
  const first = repository(db);
  const second = repository(db, cache);
  await Promise.all([first.loadDraft(), second.loadDraft()]);
  await first.saveDraft(config('Primero'));
  await assert.rejects(second.saveDraft(config('Segundo')), { code: 'CONFIG_CONFLICT' });
  assert.equal(JSON.parse(cache.getItem(AppConfig.createStorageKey(tenantId, 'draft'))).revision, 3);
});

test('simultaneous first publications use insert, never upsert', async () => {
  const db = database([]);
  const first = repository(db);
  const second = repository(db);
  await Promise.all([first.loadPublished(), second.loadPublished()]);
  await first.publish(config('Primero'));
  await assert.rejects(second.publish(config('Segundo')), { code: 'CONFIG_CONFLICT' });
  assert.equal(db.writes.every(write => write.operation === 'insert'), true);
});

test('an empty central publication removes an obsolete cached publication', async () => {
  const db = database([]);
  const cache = storage();
  cache.setItem(AppConfig.createStorageKey(tenantId), JSON.stringify(config('Antiguo', 999)));
  assert.equal((await repository(db, cache).loadPublished()).revision, 0);
  assert.equal(JSON.parse(cache.getItem(AppConfig.createStorageKey(tenantId))).revision, 0);
});

test('server confirmation succeeds even if browser storage is full or disabled', async () => {
  const cache = { getItem() { throw new Error('disabled'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('disabled'); } };
  const db = database();
  const repo = repository(db, cache);
  assert.equal((await repo.loadPublished()).revision, 1);
  const saved = await repo.publish(config('Guardado'));
  assert.equal(saved.remoteSynced, true);
  assert.equal(saved.cacheStored, false);
  assert.equal((await repo.loadPublished()).brand.texts.name, 'Guardado');
  assert.doesNotThrow(() => repo.clearCache());
});

test('offline public readers may use cache, but administrators cannot start an offline edit', async () => {
  const cache = storage();
  cache.setItem(AppConfig.createStorageKey(tenantId), JSON.stringify(config('Última copia', 8)));
  const client = { from() { return { select() { return this; }, eq() { return this; }, async maybeSingle() { throw new Error('offline'); } }; } };
  assert.equal((await AppConfig.createRepository({ tenantId, storage: cache, supabaseClient: client }).loadPublished()).revision, 8);
  await assert.rejects(repository({ client }, cache).loadPublished(), /configuración central/);
});

test('a confirmed publication wins over an earlier in-flight read across repository instances', async () => {
  const db = database();
  const cache = storage();
  const writer = repository(db, cache);
  await writer.loadPublished();
  let release;
  const slowClient = { from() { return { select() { return this; }, eq() { return this; }, maybeSingle() { return new Promise(resolve => { release = resolve; }); } }; } };
  const loading = repository({ client: slowClient }, cache).loadPublished();
  await writer.publish(config('Confirmado'));
  release({ data: row() });
  assert.equal((await loading).revision, 2);
  assert.equal(JSON.parse(cache.getItem(AppConfig.createStorageKey(tenantId))).brand.texts.name, 'Confirmado');
});

test('out-of-order reads are ordered by request, not response arrival or cached revision', async () => {
  const releases = [];
  const client = { from() { return { select() { return this; }, eq() { return this; }, maybeSingle() { return new Promise(resolve => releases.push(resolve)); } }; } };
  for (const olderFirst of [true, false]) {
    const repo = repository({ client });
    const offset = releases.length;
    const older = repo.loadPublished();
    const newer = repo.loadPublished();
    if (olderFirst) {
      releases[offset]({ data: row('published', 2) });
      await older;
      releases[offset + 1]({ data: row('published', 3) });
    } else {
      releases[offset + 1]({ data: row('published', 3) });
      await newer;
      releases[offset]({ data: row('published', 2) });
    }
    assert.equal((await newer).revision, 3);
    assert.equal((await older).revision, olderFirst ? 2 : 3);
  }
});

test('a delayed successful write response cannot downgrade a newer confirmed central snapshot', async () => {
  const db = database();
  const cache = storage();
  let release;
  let pauseWrite = true;
  const delayed = { client: { from() {
    const query = db.client.from();
    const originalUpdate = query.update;
    query.update = function (payload) {
      originalUpdate.call(this, payload);
      if (pauseWrite) {
        pauseWrite = false;
        this.maybeSingle = () => new Promise(resolve => { release = resolve; });
      }
      return this;
    };
    return query;
  } } };
  const writer = repository(delayed, cache);
  await writer.loadPublished();
  const writing = writer.publish(config('Mi guardado'));
  db.rows.set(`${tenantId}:published`, row('published', 3, 'Más reciente'));
  await repository(db, cache).loadPublished();
  release({ data: row('published', 2, 'Mi guardado') });
  assert.equal((await writing).config.revision, 2, 'the editor retains the actual version it saved');
  assert.equal(JSON.parse(cache.getItem(AppConfig.createStorageKey(tenantId))).revision, 3);
  await assert.rejects(writer.publish(config('No pisar versión 3')), { code: 'CONFIG_CONFLICT' });
});

function adminHarness() {
  const elements = new Map();
  const node = id => {
    if (!elements.has(id)) elements.set(id, { value: '', checked: false, textContent: '', dataset: {}, style: {}, hidden: true,
      disabled: false, setAttribute() {}, addEventListener() {}, scrollIntoView() {} });
    return elements.get(id);
  };
  const document = { getElementById: node, querySelectorAll: () => [], addEventListener() {} };
  const window = { AppConfig, dispatchEvent() {}, SaasAuth: { getTenantContext: () => ({ tenantId, role: 'ADMIN', isVerified: true }) } };
  const sandbox = vm.createContext({ window, document, console, setTimeout() {}, localStorage: storage(),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } });
  vm.runInContext(fs.readFileSync(new URL('../admin-config.js', import.meta.url), 'utf8'), sandbox);
  vm.runInContext(`adminTenantContext = { tenantId: '${tenantId}', role: 'ADMIN', isVerified: true };`, sandbox);
  return { sandbox, node, window };
}

test('admin conflict keeps the form, shows inline recovery and does not save a shared draft', async () => {
  const harness = adminHarness();
  harness.node('brand-name-input').value = 'Mi edición';
  vm.runInContext(`appConfigRepository = {
    async publish() { const error = new Error('Otra publicación'); error.code = 'CONFIG_CONFLICT'; throw error; },
    async saveDraft() { throw new Error('Draft must not be written'); }
  };`, harness.sandbox);
  await harness.window.saveAdminConfig();
  assert.equal(harness.node('brand-name-input').value, 'Mi edición');
  assert.equal(harness.node('admin-config-conflict').hidden, false);
  assert.equal(harness.node('admin-page-save-state').textContent, 'Hay cambios en otra sesión · guardado detenido');
  assert.equal(vm.runInContext('adminConfigBusy', harness.sandbox), false);
});

test('admin prevents double publication and refuses a changed tenant context', async () => {
  const harness = adminHarness();
  let calls = 0;
  let release;
  harness.sandbox.fakeRepo = { async publish() { calls += 1; return new Promise(resolve => { release = resolve; }); } };
  vm.runInContext('appConfigRepository = fakeRepo;', harness.sandbox);
  const pending = harness.window.saveAdminConfig();
  await harness.window.saveAdminConfig();
  assert.equal(calls, 1);
  release({ config: config(), remoteSynced: true });
  await pending;
  assert.match(harness.node('admin-page-save-state').textContent, /publicada y sincronizada/);
  harness.window.SaasAuth.getTenantContext = () => ({ tenantId: 'another', role: 'ADMIN', isVerified: true });
  await harness.window.saveAdminConfig();
  assert.equal(calls, 1);
  assert.match(harness.node('admin-page-save-state').textContent, /sesión administrativa/);
});
