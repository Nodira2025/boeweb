const JSON_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
});

export function jsonResponse(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
}

export function legacyJsonResponse(statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...JSON_HEADERS, ...extraHeaders },
    body: JSON.stringify(payload)
  };
}

export function getBearerToken(headers) {
  const rawHeader = typeof headers?.get === 'function'
    ? headers.get('authorization')
    : headers?.authorization || headers?.Authorization || '';
  const match = String(rawHeader).match(/^Bearer\s+([^\s]+)$/i);
  return match ? match[1] : null;
}

export function requireServerConfig() {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error('La función no tiene configuradas las credenciales server-side requeridas.');
    error.statusCode = 503;
    throw error;
  }
  return { supabaseUrl, serviceRoleKey };
}

export async function authenticateBearer(supabaseAdmin, headers) {
  const token = getBearerToken(headers);
  if (!token) {
    const error = new Error('Se requiere una sesión autenticada.');
    error.statusCode = 401;
    throw error;
  }

  const { data, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !data?.user) {
    const error = new Error('La sesión no es válida o expiró.');
    error.statusCode = 401;
    throw error;
  }
  return data.user;
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

export function safeErrorStatus(error, fallback = 400) {
  const status = Number(error?.statusCode || error?.status || fallback);
  return status >= 400 && status <= 599 ? status : fallback;
}
