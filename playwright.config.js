// ══════════════════════════════════════════════
// TRACE — Playwright E2E Test Configuration
// ══════════════════════════════════════════════

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.test.js',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'node trace_server.js',
    port: 3000,
    timeout: 15000,
    reuseExistingServer: false,
  },
});
