import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const baseURL = process.env.ROOTS_UI_BASE_URL || 'http://127.0.0.1:4183';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results',
  timeout: 20_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    permissions: ['microphone'],
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync(localChrome) ? localChrome : undefined),
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: process.env.ROOTS_UI_BASE_URL ? undefined : {
    command: 'npm run dev -- --port 4183 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
