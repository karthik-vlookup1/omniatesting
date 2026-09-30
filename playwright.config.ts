import { defineConfig, devices } from '@playwright/test';

const e2eDatabaseUrl =
  process.env.E2E_DATABASE_URL ?? 'postgres://omnia:omnia_local_dev@localhost:5432/omnia_e2e';

// Synthetic, test-only keys for the e2e server. Never real keys.
const serverEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'warn',
  PORT: '3001',
  DATABASE_URL: e2eDatabaseUrl,
  HASH_KEY: 'test-only-key',
  ENCRYPTION_KEY: 'dGVzdC1vbmx5LWVuY3J5cHRpb24ta2V5LTMyYnl0ZXM=',
  SESSION_SECRET: 'test-only-session-key-not-for-production',
  AUTO_MATCH_THRESHOLD: '0.95',
};

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Recreates the e2e database, applies migrations, then starts the API.
      command: 'npm run start:e2e -w server',
      url: 'http://localhost:3001/api/health',
      env: serverEnv,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -w web',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
