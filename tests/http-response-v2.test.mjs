import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedRequestOrigin, jsonResponse } from '../netlify/functions/_shared/http-auth.mjs';

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
