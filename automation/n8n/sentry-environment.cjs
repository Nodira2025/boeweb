const path = require('node:path');
const runtime = path.resolve(__dirname, '../../scratch/n8n-runtime');

function environment(config, cli = false) {
  // Deliberately do not inherit project API keys, Node preload options, or .env files.
  const env = {};
  const allowed = new Set(['path', 'systemroot', 'systemdrive', 'windir', 'comspec', 'pathext', 'temp', 'tmp', 'userprofile', 'appdata', 'localappdata', 'homedrive', 'homepath', 'number_of_processors']);
  for (const [key, value] of Object.entries(process.env)) if (allowed.has(key.toLowerCase())) env[key] = value;
  return {
    ...env,
    N8N_USER_FOLDER: path.join(runtime, 'user-data'),
    N8N_HOST: '127.0.0.1',
    N8N_LISTEN_ADDRESS: '127.0.0.1',
    N8N_PORT: String(config.port),
    N8N_PROTOCOL: 'http',
    N8N_EDITOR_BASE_URL: config.url,
    N8N_WEBHOOK_URL: `${config.url}/`,
    N8N_SECURE_COOKIE: 'false',
    N8N_DIAGNOSTICS_ENABLED: 'false',
    N8N_DIAGNOSTICS_CONFIG_FRONTEND: '',
    N8N_DIAGNOSTICS_CONFIG_BACKEND: '',
    EXTERNAL_FRONTEND_HOOKS_URLS: '',
    N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
    N8N_TEMPLATES_ENABLED: 'false',
    N8N_PERSONALIZATION_ENABLED: 'false',
    N8N_COMMUNITY_PACKAGES_ENABLED: 'false',
    N8N_UNVERIFIED_PACKAGES_ENABLED: 'false',
    N8N_BLOCK_ENV_ACCESS_IN_NODE: 'true',
    N8N_BLOCK_FILE_ACCESS_TO_N8N_FILES: 'true',
    N8N_PUBLIC_API_DISABLED: 'true',
    N8N_RUNNERS_MODE: 'internal',
    N8N_RUNNERS_BROKER_LISTEN_ADDRESS: '127.0.0.1',
    N8N_RUNNERS_BROKER_PORT: String(cli ? config.cliBrokerPort : config.brokerPort),
    N8N_RUNNERS_TASK_TIMEOUT: '60',
    N8N_HIRING_BANNER_ENABLED: 'false',
    N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: 'true',
    NODES_EXCLUDE: JSON.stringify(['n8n-nodes-base.executeCommand', 'n8n-nodes-base.readWriteFile', 'n8n-nodes-base.readBinaryFiles', 'n8n-nodes-base.writeBinaryFile', 'n8n-nodes-base.ssh', 'n8n-nodes-base.ftp']),
    GENERIC_TIMEZONE: 'America/Argentina/Buenos_Aires',
    TZ: 'America/Argentina/Buenos_Aires',
  };
}

module.exports = { environment };
