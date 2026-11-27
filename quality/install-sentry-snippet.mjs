import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const siteId = '4c94adc6-0b1b-4b62-aadf-8d812d21a44a';
const title = 'boeweb Sentry portada privada v1';

async function netlifyToken() {
  if (process.env.NETLIFY_AUTH_TOKEN) return process.env.NETLIFY_AUTH_TOKEN;
  const configPath = path.join(os.homedir(), 'AppData/Roaming/netlify/Config/config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const user = config.users[config.userId];
  const token = typeof user?.auth === 'string' ? user.auth : user?.auth?.token;
  if (!token) throw new Error('Falta una sesión autorizada de Netlify.');
  return token;
}

async function main() {
  const token = await netlifyToken();
  const base = `https://api.netlify.com/api/v1/sites/${siteId}/snippets`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const current = await fetch(base, { headers });
  if (!current.ok) throw new Error(`Netlify snippets: ${current.status}`);
  const snippets = await current.json();
  const existing = snippets.find(snippet => snippet.title === title);
  const bootstrap = await fs.readFile(new URL('../sentry-bootstrap.js', import.meta.url), 'utf8');
  // Serve-time injection preserves the current deploy. Restrict telemetry to the public homepage.
  const general = `<script id="boeweb-sentry-public-home">\nif ((location.pathname === '/' || location.pathname === '/index.html') && !window.sentryOnLoad) {\n${bootstrap}\nconst sentryLoader = document.createElement('script');\nsentryLoader.src = 'https://js.sentry-cdn.com/74e6f2d6c6b769a2d3d739b9c729c43a.min.js';\nsentryLoader.crossOrigin = 'anonymous';\nsentryLoader.setAttribute('data-lazy', 'no');\ndocument.head.appendChild(sentryLoader);\n}\n</script>`;
  const response = await fetch(existing ? `${base}/${existing.id}` : base, {
    method: existing ? 'PUT' : 'POST', headers,
    body: JSON.stringify({ title, general, general_position: 'head' }),
  });
  if (!response.ok) throw new Error(`Guardar snippet: ${response.status}`);
  // Netlify can return JSON null after a successful write; re-read instead of repeating creation.
  const verified = await fetch(base, { headers });
  if (!verified.ok) throw new Error(`Verificar snippet: ${verified.status}`);
  const saved = (await verified.json()).find(snippet => snippet.title === title);
  if (!saved) throw new Error('Netlify no devolvió el snippet guardado.');
  console.log(JSON.stringify({ snippetId: saved.id, title: saved.title, siteId }));
  const page = await fetch('https://bogrowclub.com.ar/');
  const html = await page.text();
  if (!page.ok || !html.includes('boeweb-sentry-public-home')) throw new Error('Falta verificar el snippet en la portada servida.');
  console.log(JSON.stringify({ homepage: page.status, injected: true, title: html.match(/<title>(.*?)<\/title>/)?.[1] }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
