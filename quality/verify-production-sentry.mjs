import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const response = await page.goto('https://bogrowclub.com.ar/', { waitUntil: 'domcontentloaded' });
    if (response?.status() !== 200) throw new Error('La portada productiva no respondió 200.');
    await page.waitForFunction(() => Boolean(window.Sentry?.getClient?.()), { timeout: 30_000 });
    const evidence = await page.evaluate(async () => {
      const sdk = window.Sentry;
      const options = sdk.getClient().getOptions();
      if (options.environment !== 'production' || options.sendDefaultPii !== false || typeof options.beforeSend !== 'function') {
        throw new Error('Configuración de privacidad Sentry incompleta.');
      }
      let eventId;
      sdk.withScope(scope => {
        scope.setTag('quality_smoke', 'true');
        scope.setTag('component', 'public-home');
        const error = new Error('Verificación sintética de entrega; sin datos de usuarios.');
        error.name = 'BoewebQualitySmokeError';
        eventId = sdk.captureException(error);
      });
      const flushed = await sdk.flush(10_000);
      return { eventId, flushed, environment: options.environment, sendDefaultPii: options.sendDefaultPii };
    });
    if (!evidence.eventId || !evidence.flushed) throw new Error('Sentry no completó el envío de prueba.');
    console.log(JSON.stringify(evidence));
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
