const fs = require('node:fs');
const path = require('node:path');

const WORKFLOW_ID = 'boewebSentryLocalTriage';
const output = path.join(__dirname, 'boeweb-sentry-local.json');

const workflow = {
  id: WORKFLOW_ID,
  name: 'boeweb · Triage local de Sentry',
  active: false,
  nodes: [
    {
      id: 'sentry-manual',
      name: 'Probar lectura manual',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      parameters: {},
      position: [0, 180],
    },
    {
      id: 'sentry-schedule',
      name: 'Cada 15 minutos',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.3,
      parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } },
      position: [0, 0],
    },
    {
      id: 'sentry-get-issues',
      name: 'Incidencias boeweb-browser',
      type: 'n8n-nodes-base.sentryIo',
      typeVersion: 1,
      credentials: { sentryIoApi: { id: 'boewebSentryRead', name: 'Sentry boeweb lectura' } },
      parameters: {
        authentication: 'accessToken',
        resource: 'issue',
        operation: 'getAll',
        organizationSlug: 'tucapacitacion',
        projectSlug: 'boeweb-browser',
        returnAll: false,
        limit: 50,
        additionalFields: { query: 'is:unresolved', statsPeriod: '24h', shortIdLookUp: false },
      },
      position: [240, 0],
    },
    {
      id: 'sentry-dedupe',
      name: 'Descartar incidencias ya vistas',
      type: 'n8n-nodes-base.removeDuplicates',
      typeVersion: 2,
      parameters: { operation: 'removeItemsSeenInPreviousExecutions', logic: 'removeItemsWithAlreadySeenKeyValues', dedupeValue: '={{ $json.id + ":" + $json.lastSeen }}', options: { scope: 'node', historySize: 500 } },
      position: [480, 0],
    },
    {
      id: 'sentry-summarize',
      name: 'Resumir incidencias nuevas',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      parameters: {
        mode: 'manual',
        includeOtherFields: false,
        assignments: { assignments: [
          { id: 'project', name: 'project', type: 'string', value: 'boeweb-browser' },
          ...['shortId', 'status', 'level', 'firstSeen', 'lastSeen'].map(name => ({ id: name, name, type: 'string', value: '={{ String($json.' + name + ' ?? "").slice(0, 100) }}' })),
          { id: 'count', name: 'count', type: 'number', value: '={{ Number($json.count ?? 0) }}' },
          { id: 'link', name: 'link', type: 'string', value: '={{ "https://tucapacitacion.sentry.io/issues/" + String($json.id).replace(/[^0-9]/g, "") + "/" }}' },
          { id: 'review', name: 'review', type: 'string', value: 'Revisar en Sentry; no cerrar ni asignar automáticamente.' },
        ] },
        options: {},
      },
      position: [480, 0],
    },
  ],
  connections: {
    'Probar lectura manual': { main: [[{ node: 'Incidencias boeweb-browser', type: 'main', index: 0 }]] },
    'Cada 15 minutos': { main: [[{ node: 'Incidencias boeweb-browser', type: 'main', index: 0 }]] },
    'Incidencias boeweb-browser': { main: [[{ node: 'Descartar incidencias ya vistas', type: 'main', index: 0 }]] },
    'Descartar incidencias ya vistas': { main: [[{ node: 'Resumir incidencias nuevas', type: 'main', index: 0 }]] },
  },
  settings: {
    executionOrder: 'v1',
    timezone: 'America/Argentina/Buenos_Aires',
    saveDataSuccessExecution: 'none',
    saveDataErrorExecution: 'none',
    saveManualExecutions: false,
  },
};

if (require.main === module) {
  fs.writeFileSync(output, `${JSON.stringify(workflow, null, 2)}\n`);
  console.log(JSON.stringify({ workflowId: WORKFLOW_ID, output }));
}

module.exports = { WORKFLOW_ID };
