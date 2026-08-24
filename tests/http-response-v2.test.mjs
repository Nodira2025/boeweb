import test from 'node:test';
import assert from 'node:assert/strict';
import { jsonResponse } from '../netlify/functions/_shared/http-auth.mjs';

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
