import test from 'node:test';
import assert from 'node:assert/strict';
import analyzeProduct from '../netlify/functions/analyze-product.mjs';
import lookupProduct from '../netlify/functions/lookup-product.mjs';

const ENVIRONMENT_KEYS = [
  'SUPABASE_URL',
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

test('búsqueda y análisis aceptan el sitio actual aunque PUBLIC_SITE_URL todavía apunte al dominio anterior', async () => {
  const originalEnvironment = Object.fromEntries(
    ENVIRONMENT_KEYS.map(key => [key, process.env[key]])
  );

  try {
    process.env.SUPABASE_URL = 'https://unit-test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'unit-test-service-role';
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
