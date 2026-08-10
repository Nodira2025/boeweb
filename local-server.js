const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ quiet: true });

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function sendText(response, status, message) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(message);
}

async function readRequestBody(request, maxBytes = 9_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('La solicitud supera el tamaño permitido.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function handleNetlifyFunction(request, response, modulePath, errorLabel) {
  try {
    const body = await readRequestBody(request);
    const origin = `http://${request.headers.host || `127.0.0.1:${port}`}`;
    const webRequest = new Request(`${origin}${request.url}`, {
      method: request.method,
      headers: request.headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : body
    });
    const module = await import(modulePath);
    const functionResponse = await module.default(webRequest, {
      ip: request.socket.remoteAddress || 'local'
    });
    response.writeHead(functionResponse.status, Object.fromEntries(functionResponse.headers.entries()));
    response.end(Buffer.from(await functionResponse.arrayBuffer()));
  } catch (error) {
    console.error(`${errorLabel}:`, error.message);
    sendText(response, 500, 'Error del servidor local.');
  }
}

function handleStaticFile(request, response) {
  try {
    const urlPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relativePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const filePath = path.resolve(root, relativePath);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      sendText(response, 403, 'Acceso denegado.');
      return;
    }
    fs.stat(filePath, (error, stat) => {
      if (error || !stat.isFile()) {
        sendText(response, 404, 'No encontrado.');
        return;
      }
      response.writeHead(200, {
        'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(filePath).on('error', streamError => {
        console.error('Error al leer archivo:', streamError.message);
        response.destroy();
      }).pipe(response);
    });
  } catch (error) {
    console.error('Error al servir archivo:', error.message);
    sendText(response, 500, 'Error del servidor local.');
  }
}

const server = http.createServer(async (request, response) => {
  if (request.url?.startsWith('/.netlify/functions/analyze-product')) {
    await handleNetlifyFunction(request, response, './netlify/functions/analyze-product.mjs', 'Error en análisis local');
    return;
  }
  if (request.url?.startsWith('/.netlify/functions/lookup-product')) {
    await handleNetlifyFunction(request, response, './netlify/functions/lookup-product.mjs', 'Error en búsqueda local');
    return;
  }
  handleStaticFile(request, response);
});

server.on('error', error => {
  console.error(`\nNo se pudo iniciar el servidor: ${error.message}`);
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Servidor iniciado correctamente en http://127.0.0.1:${port}/`);
  const aiConfigured = Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY);
  console.log(aiConfigured ? 'Análisis con IA: configurado.' : 'Análisis con IA: falta OPENROUTER_API_KEY u OPENAI_API_KEY en .env.');
  console.log('Búsqueda sin IA: disponible.');
});
