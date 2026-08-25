import test from 'node:test';
import assert from 'node:assert/strict';
import analyzeProduct from '../netlify/functions/analyze-product.mjs';
import lookupProduct from '../netlify/functions/lookup-product.mjs';

const ENVIRONMENT_KEYS = [
  'SUPABASE_URL',
  'PUBLIC_SUPABASE_URL',
  'SUPABASE_PROJECT_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'PRODUCT_ANALYSIS_ALLOWED_ORIGIN',
  'PUBLIC_SITE_URL',
  'URL',
  'DEPLOY_PRIME_URL',
  'DEPLOY_URL'
];

function recognitionRequest(origin) {
  return {
    method: 'POST',
    url: 'https://boeweb.netlify.app/.netlify/functions/recognize-product',
    headers: new Headers({ Origin: origin }),
    json: async () => ({ barcode: '8414606516469' })
  };
}

function createTestServiceRoleJwt() {
  const encodePart = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return [
    encodePart({ alg: 'HS256', typ: 'JWT' }),
    encodePart({ role: 'service_role', ref: 'sxbhrgvizqylnfcqzhin' }),
    'firma-de-prueba'
  ].join('.');
}

test('búsqueda y análisis aceptan el sitio actual aunque PUBLIC_SITE_URL todavía apunte al dominio anterior', async () => {
  const originalEnvironment = Object.fromEntries(
    ENVIRONMENT_KEYS.map(key => [key, process.env[key]])
  );

  try {
    process.env.SUPABASE_URL = 'https://sxbhrgvizqylnfcqzhin.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = createTestServiceRoleJwt();
    delete process.env.PRODUCT_ANALYSIS_ALLOWED_ORIGIN;
    process.env.PUBLIC_SITE_URL = 'https://boegrowclub.netlify.app';
    delete process.env.URL;
    delete process.env.DEPLOY_PRIME_URL;
    delete process.env.DEPLOY_URL;

    const [lookupResponse, analysisResponse] = await Promise.all([
      lookupProduct(recognitionRequest('https://boeweb.netlify.app'), { ip: 'origin-lookup' }),
      analyzeProduct(recognitionRequest('https://boeweb.netlify.app'), { ip: 'origin-analysis' })
    ]);

    assert.equal(lookupResponse.status, 401);
    assert.equal(analysisResponse.status, 401);

    const externalResponse = await lookupProduct(
      recognitionRequest('https://sitio-ajeno.example'),
      { ip: 'origin-external' }
    );
    assert.equal(externalResponse.status, 403);
  } finally {
    Object.entries(originalEnvironment).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test('búsqueda y análisis avanzan a autenticación cuando SUPABASE_URL está malformada en Netlify', async () => {
  const originalEnvironment = Object.fromEntries(
    ENVIRONMENT_KEYS.map(key => [key, process.env[key]])
  );

  try {
    process.env.SUPABASE_URL = 'SUPABASE_URL';
    process.env.SUPABASE_SERVICE_ROLE_KEY = createTestServiceRoleJwt();
    process.env.PUBLIC_SITE_URL = 'https://boeweb.netlify.app';

    const [lookupResponse, analysisResponse] = await Promise.all([
      lookupProduct(recognitionRequest('https://boeweb.netlify.app'), { ip: 'config-lookup' }),
      analyzeProduct(recognitionRequest('https://boeweb.netlify.app'), { ip: 'config-analysis' })
    ]);

    assert.equal(lookupResponse.status, 401);
    assert.equal(analysisResponse.status, 401);
  } finally {
    Object.entries(originalEnvironment).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});
