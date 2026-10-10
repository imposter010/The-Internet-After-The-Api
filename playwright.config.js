import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 60000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) },
  webServer: { command: 'node scripts/e2e-server.mjs', url: 'http://127.0.0.1:8000/health', reuseExistingServer: false, timeout: 120000 },
});
