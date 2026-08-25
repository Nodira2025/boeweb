import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedRequestOrigin, jsonResponse, requireServerConfig } from '../netlify/functions/_shared/http-auth.mjs';

function encodeJwtPart(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createTestServiceRoleJwt(ref = 'sxbhrgvizqylnfcqzhin', role = 'service_role') {
  return [
    encodeJwtPart({ alg: 'HS256', typ: 'JWT' }),
    encodeJwtPart({ role, ref }),
    'firma-de-prueba'
  ].join('.');
}

test('jsonResponse no adjunta cuerpo a estados HTTP que lo prohíben', async () => {
  for (const status of [204, 205, 304]) {
    const response = jsonResponse(status, {}, { 'Access-Control-Allow-Origin': 'https://boeweb.netlify.app' });
    assert.equal(response.status, status);
    assert.equal(await response.text(), '');
    assert.equal(response.headers.get('content-type'), null);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://boeweb.netlify.app');
  }
});

test('jsonResponse conserva JSON y cabeceras seguras para respuestas con cuerpo', async () => {
  const response = jsonResponse(422, { error: 'Dato inválido.' });
  assert.equal(response.status, 422);
  assert.match(response.headers.get('content-type'), /^application\/json/);
  assert.deepEqual(await response.json(), { error: 'Dato inválido.' });
});

test('la validación de origen acepta el despliegue actual aunque una URL configurada haya quedado antigua', () => {
  const originalEnvironment = {
    PRODUCT_ANALYSIS_ALLOWED_ORIGIN: process.env.PRODUCT_ANALYSIS_ALLOWED_ORIGIN,
    PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL,
    URL: process.env.URL,
    DEPLOY_PRIME_URL: process.env.DEPLOY_PRIME_URL,
    DEPLOY_URL: process.env.DEPLOY_URL
  };

  try {
    delete process.env.PRODUCT_ANALYSIS_ALLOWED_ORIGIN;
    process.env.PUBLIC_SITE_URL = 'https://boegrowclub.netlify.app';
    process.env.URL = 'https://boeweb.netlify.app';
    delete process.env.DEPLOY_PRIME_URL;
    delete process.env.DEPLOY_URL;

    const sameOriginRequest = {
      url: 'https://boeweb.netlify.app/.netlify/functions/lookup-product',
      headers: new Headers({ Origin: 'https://boeweb.netlify.app' })
    };
    const externalRequest = {
      ...sameOriginRequest,
      headers: new Headers({ Origin: 'https://sitio-ajeno.example' })
    };

    assert.equal(isAllowedRequestOrigin(sameOriginRequest), true);
    assert.equal(isAllowedRequestOrigin(externalRequest), false);
  } finally {
    Object.entries(originalEnvironment).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test('la configuración server-side recupera la URL pública canónica si Netlify contiene un valor inválido', () => {
  const originalEnvironment = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL,
    SUPABASE_PROJECT_URL: process.env.SUPABASE_PROJECT_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  };

  try {
    process.env.SUPABASE_URL = 'SUPABASE_URL';
    delete process.env.PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_PROJECT_URL;
    const serviceRoleKey = createTestServiceRoleJwt();
    process.env.SUPABASE_SERVICE_ROLE_KEY = `"${serviceRoleKey}"`;

    assert.deepEqual(requireServerConfig(), {
      supabaseUrl: 'https://sxbhrgvizqylnfcqzhin.supabase.co',
      serviceRoleKey
    });
  } finally {
    Object.entries(originalEnvironment).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test('la configuración server-side nunca envía la service key a otro host', () => {
  const originalEnvironment = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL,
    SUPABASE_PROJECT_URL: process.env.SUPABASE_PROJECT_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  };

  try {
    delete process.env.PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_PROJECT_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_unit_test';

    const unsafeUrls = [
      'http://sxbhrgvizqylnfcqzhin.supabase.co',
      'https://captura-claves.example',
      'https://sxbhrgvizqylnfcqzhin.supabase.co.evil.example',
      'https://sub.sxbhrgvizqylnfcqzhin.supabase.co',
      'https://sxbhrgvizqylnfcqzhin.supabase.co:444',
      'https://usuario@sxbhrgvizqylnfcqzhin.supabase.co',
      'https://sxbhrgvizqylnfcqzhin.supabase.co/rest',
      'https://sxbhrgvizqylnfcqzhin.supabase.co?debug=1',
      'https://sxbhrgvizqylnfcqzhin.supabase.co#fragmento'
    ];
    unsafeUrls.forEach(url => {
      process.env.SUPABASE_URL = url;
      assert.throws(requireServerConfig, error => error.statusCode === 503);
    });
  } finally {
    Object.entries(originalEnvironment).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test('la configuración server-side rechaza JWT sin rol service_role o ligados a otro proyecto', () => {
  const originalEnvironment = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  try {
    process.env.SUPABASE_URL = 'https://sxbhrgvizqylnfcqzhin.supabase.co';
    const invalidKeys = [
      createTestServiceRoleJwt('otroproyecto'),
      createTestServiceRoleJwt('sxbhrgvizqylnfcqzhin', 'anon'),
      [encodeJwtPart({ alg: 'HS256' }), encodeJwtPart({}), 'firma-de-prueba'].join('.'),
      'cabecera.payload-invalido.firma'
    ];
    invalidKeys.forEach(key => {
      process.env.SUPABASE_SERVICE_ROLE_KEY = key;
      assert.throws(requireServerConfig, error => error.statusCode === 503);
    });
  } finally {
    Object.entries(originalEnvironment).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test('una clave opaca requiere que la URL canónica esté configurada explícitamente', () => {
  const originalEnvironment = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL,
    SUPABASE_PROJECT_URL: process.env.SUPABASE_PROJECT_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
  };

  try {
    process.env.SUPABASE_URL = 'SUPABASE_URL';
    delete process.env.PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_PROJECT_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_unit_test';
    assert.throws(requireServerConfig, error => error.statusCode === 503);

    process.env.SUPABASE_URL = '"https://sxbhrgvizqylnfcqzhin.supabase.co"';
    assert.equal(requireServerConfig().serviceRoleKey, 'sb_secret_unit_test');

    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.throws(requireServerConfig, error => error.statusCode === 503);
  } finally {
    Object.entries(originalEnvironment).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});
