import { defineConfig } from '@playwright/test';

// UI fixtures only; leave the user's running demo and its MongoDB untouched.
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'llm-ui.spec.js', timeout: 30000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5183', headless: true, trace: 'retain-on-failure',
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) },
  webServer: { command: 'node scripts/llm-ui-server.mjs', url: 'http://127.0.0.1:5183', reuseExistingServer: false, timeout: 60000 },
});
