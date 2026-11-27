import http from 'k6/http';
import { check } from 'k6';

const baseUrl = __ENV.K6_BASE_URL || 'http://127.0.0.1:4173';
const localTarget = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(baseUrl);

if (!localTarget && __ENV.K6_ALLOW_REMOTE !== 'true') {
  throw new Error('Definí K6_ALLOW_REMOTE=true para probar un entorno remoto autorizado.');
}

export const options = {
  scenarios: {
    public_home: {
      executor: 'constant-arrival-rate',
      rate: 2,
      timeUnit: '1s',
      duration: '15s',
      preAllocatedVUs: 2,
      maxVUs: 4
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
    checks: ['rate>0.99']
  }
};

export default function () {
  const response = http.get(`${baseUrl}/`, { tags: { route: 'public_home' } });
  check(response, {
    'portada responde 200': result => result.status === 200,
    'portada conserva catálogo': result => result.body.includes('id="catalog-section"')
  });
}
