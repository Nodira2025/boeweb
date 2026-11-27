const fs = require('node:fs');
const path = require('node:path');

const WORKFLOW_ID = 'boewebSentryLocalTriage';
const output = path.join(__dirname, 'boeweb-sentry-local.json');

const summarizeIssues = `const state = $getWorkflowStaticData('global');
const seen = state.seen ?? {};
const now = Date.now();
const issues = $input.all().map(item => item.json).filter(issue => issue && issue.id);
const next = [];
for (const issue of issues) {
  const id = String(issue.id);
  const lastSeen = String(issue.lastSeen ?? '');
  if (seen[id] === lastSeen) continue;
  seen[id] = lastSeen;
  next.push({
    json: {
      project: 'boeweb-browser',
      shortId: String(issue.shortId ?? '').slice(0, 50),
      status: String(issue.status ?? '').slice(0, 50),
      level: String(issue.level ?? '').slice(0, 30),
      count: Number(issue.count ?? 0),
      firstSeen: String(issue.firstSeen ?? ''),
      lastSeen,
      link: /^https:\\/\\/[^/]+\\.sentry\\.io\\/issues\\/\\d+\\/?$/.test(String(issue.permalink ?? '')) ? issue.permalink : '',
      review: 'Revisar en Sentry; no cerrar ni asignar automáticamente.'
    }
  });
}
// Bound the deduplication state; n8n persists static data only for active workflows.
state.seen = Object.fromEntries(Object.entries(seen).slice(-500));
state.checkedAt = new Date(now).toISOString();
return next;`;

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
      id: 'sentry-summarize',
      name: 'Resumir incidencias nuevas',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      parameters: { jsCode: summarizeIssues },
      position: [480, 0],
    },
  ],
  connections: {
    'Probar lectura manual': { main: [[{ node: 'Incidencias boeweb-browser', type: 'main', index: 0 }]] },
    'Cada 15 minutos': { main: [[{ node: 'Incidencias boeweb-browser', type: 'main', index: 0 }]] },
    'Incidencias boeweb-browser': { main: [[{ node: 'Resumir incidencias nuevas', type: 'main', index: 0 }]] },
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
