import { createClient } from '@supabase/supabase-js';

const JSON_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
});
const PUBLIC_SUPABASE_FALLBACK_URL = 'https://sxbhrgvizqylnfcqzhin.supabase.co';
const PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4YmhyZ3ZpenF5bG5mY3F6aGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMjM1MzEsImV4cCI6MjA5Njg5OTUzMX0.UUOwXsHXKNCjlJKdxMUlAuCtNAnNWgAroBwMlWAdTag';

export function jsonResponse(status, payload, extraHeaders = {}) {
  const bodyless = status === 204 || status === 205 || status === 304;
  const headers = { ...JSON_HEADERS, ...extraHeaders };
  if (bodyless) delete headers['Content-Type'];
  return new Response(bodyless ? null : JSON.stringify(payload), {
    status,
    headers
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

function normalizeHttpOrigin(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : '';
  } catch (error) {
    return '';
  }
}

function cleanEnvironmentValue(value) {
  const candidate = String(value || '').trim();
  if (candidate.length < 2) return candidate;
  const firstCharacter = candidate[0];
  const lastCharacter = candidate[candidate.length - 1];
  if ((firstCharacter === '"' || firstCharacter === "'") && firstCharacter === lastCharacter) {
    return candidate.slice(1, -1).trim();
  }
  return candidate;
}

function serverConfigError() {
  const error = new Error('La función no tiene configuradas las credenciales server-side requeridas.');
  error.statusCode = 503;
  return error;
}

function resolveSupabaseProjectUrl() {
  const configuredValues = [
    process.env.SUPABASE_URL,
    process.env.PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_PROJECT_URL
  ];

  for (const value of configuredValues) {
    const configuredValue = cleanEnvironmentValue(value);
    if (!configuredValue) continue;
    let configuredUrl;
    try {
      configuredUrl = new URL(configuredValue);
    } catch (error) {
      continue;
    }
    // El cliente público ya está ligado a este proyecto. Nunca enviar la service key a otro host.
    const isExactPublicProject = configuredUrl.origin === PUBLIC_SUPABASE_FALLBACK_URL
      && configuredUrl.protocol === 'https:'
      && !configuredUrl.username
      && !configuredUrl.password
      && !configuredUrl.port
      && (configuredUrl.pathname === '/' || configuredUrl.pathname === '')
      && !configuredUrl.search
      && !configuredUrl.hash;
    if (!isExactPublicProject) throw serverConfigError();
    return { supabaseUrl: PUBLIC_SUPABASE_FALLBACK_URL, usedFallback: false };
  }

  return { supabaseUrl: PUBLIC_SUPABASE_FALLBACK_URL, usedFallback: true };
}

function validateServiceRoleProject(serviceRoleKey, supabaseUrl, usedFallback) {
  const segments = serviceRoleKey.split('.');
  if (segments.length !== 3) {
    // Una clave opaca sólo es segura cuando la URL canónica fue configurada explícitamente.
    if (usedFallback || !/^sb_secret_[a-z0-9_-]+$/i.test(serviceRoleKey)) throw serverConfigError();
    return;
  }

  try {
    const payload = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
    const expectedProjectRef = new URL(supabaseUrl).hostname.split('.')[0];
    if (payload.role !== 'service_role') throw serverConfigError();
    if (payload.ref !== expectedProjectRef) throw serverConfigError();
  } catch (error) {
    if (error?.statusCode === 503) throw error;
    throw serverConfigError();
  }
}

function splitConfiguredOrigins(value) {
  return String(value || '')
    .split(/[\n,]+/)
    .map(normalizeHttpOrigin)
    .filter(Boolean);
}

export function isAllowedRequestOrigin(request, extraOrigins = []) {
  const rawOrigin = typeof request?.headers?.get === 'function'
    ? request.headers.get('origin')
    : request?.headers?.origin || request?.headers?.Origin || '';
  if (!rawOrigin) return true;

  const origin = normalizeHttpOrigin(rawOrigin);
  if (!origin) return false;
  if (/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(origin)) return true;

  const requestOrigin = normalizeHttpOrigin(request?.url);
  const configuredOrigins = [
    process.env.PRODUCT_ANALYSIS_ALLOWED_ORIGIN,
    process.env.PUBLIC_SITE_URL,
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
    process.env.DEPLOY_URL,
    ...extraOrigins
  ].flatMap(splitConfiguredOrigins);

  return new Set([requestOrigin, ...configuredOrigins].filter(Boolean)).has(origin);
}

export function requireServerConfig() {
  const { supabaseUrl, usedFallback } = resolveSupabaseProjectUrl();
  const serviceRoleKey = cleanEnvironmentValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!serviceRoleKey) throw serverConfigError();
  validateServiceRoleProject(serviceRoleKey, supabaseUrl, usedFallback);
  return { supabaseUrl, serviceRoleKey };
}

export function createSupabaseAuthVerifier() {
  const { supabaseUrl } = resolveSupabaseProjectUrl();
  return createClient(supabaseUrl, PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

export function createUserScopedSupabaseClient(headers) {
  const { supabaseUrl } = resolveSupabaseProjectUrl();
  const token = getBearerToken(headers);
  if (!token) {
    const error = new Error('Se requiere una sesión autenticada.');
    error.statusCode = 401;
    throw error;
  }
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    accessToken: async () => token
  };
  return createClient(supabaseUrl, PUBLIC_SUPABASE_ANON_KEY, options);
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
  const normalized = String(value || '').trim();
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(normalized) &&
    normalized.toLowerCase() !== '00000000-0000-0000-0000-000000000000';
}

export function safeErrorStatus(error, fallback = 400) {
  const status = Number(error?.statusCode || error?.status || fallback);
  return status >= 400 && status <= 599 ? status : fallback;
}
