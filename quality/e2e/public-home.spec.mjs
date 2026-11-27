import { test, expect } from '@playwright/test';
import { argosScreenshot } from '@argos-ci/playwright';

test.beforeEach(async ({ page }) => {
  // The homepage decorates itself with random leaves. Use the same seed so their
  // positions do not produce visual changes when the application code is unchanged.
  await page.addInitScript(() => {
    let seed = 18731;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  });
});

test('portada y catálogo accesibles', async ({ page }) => {
  // Keep CI deterministic: do not read the live inventory or send telemetry.
  await page.route(/supabase\.co|sentry\.io|sentry-cdn\.com/, route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('#catalog-section')).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Buscar productos' })).toBeVisible();
  await argosScreenshot(page, 'BÔ portada y catálogo', { root: './.argos' });
});

test('carrito abre y conserva su control de cierre', async ({ page }) => {
  await page.route(/supabase\.co|sentry\.io|sentry-cdn\.com/, route => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Ver carrito', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Tu Pedido' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrar carrito' })).toBeVisible();
  await argosScreenshot(page, 'BÔ carrito abierto', { root: './.argos' });
});
