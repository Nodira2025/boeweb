import { defineConfig, devices } from '@playwright/test';
import { createArgosReporterOptions } from '@argos-ci/playwright/reporter';

const reporters = [['list']];
if (process.env.CI && process.env.ARGOS_TOKEN) {
  reporters.push(['@argos-ci/playwright/reporter', createArgosReporterOptions({ uploadToArgos: true })]);
}

export default defineConfig({
  testDir: './quality/e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: reporters,
  use: {
    baseURL: 'http://127.0.0.1:4186',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--disable-lcd-text', '--font-render-hinting=none'] }
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }
  ],
  webServer: {
    command: 'node local-server.js',
    env: { PORT: '4186' },
    url: 'http://127.0.0.1:4186',
    reuseExistingServer: false,
    timeout: 30_000
  }
});
