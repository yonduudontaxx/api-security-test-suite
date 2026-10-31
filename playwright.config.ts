import { defineConfig } from '@playwright/test';
import { API_URL, TEST_ENV, UPSTREAM_URL } from './tests/support/env.js';

const mode = process.env.SECURITY_MODE ?? 'hardened';

export default defineConfig({
  testDir: './tests/api',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  timeout: 20_000,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['html', { open: 'never', outputFolder: 'playwright-report', title: `OWASP API Top 10 suite (${mode} target)` }],
  ],
  use: {
    baseURL: API_URL,
    extraHTTPHeaders: { accept: 'application/json' },
  },
  webServer: [
    {
      command: 'npx tsx tests/support/upstream-stub.ts',
      url: `${UPSTREAM_URL}/health`,
      reuseExistingServer: false,
      env: { API_ORIGIN: API_URL },
    },
    {
      command: 'npx tsx src/server.ts',
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      env: { ...TEST_ENV, SECURITY_MODE: mode },
    },
  ],
});
