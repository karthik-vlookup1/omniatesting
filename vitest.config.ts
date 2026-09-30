import { defineConfig } from 'vitest/config';

// Synthetic, test-only keys. Real keys come from the environment (see .env.example).
// HASH_KEY matches the key db/tests/002_matching_scenarios.sql uses, so TS and SQL hashes line up.
const testEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  HASH_KEY: 'test-only-key',
  ENCRYPTION_KEY: 'dGVzdC1vbmx5LWVuY3J5cHRpb24ta2V5LTMyYnl0ZXM=', // base64 of 32 synthetic bytes
  SESSION_SECRET: 'test-only-session-key-not-for-production',
  AUTO_MATCH_THRESHOLD: '0.95',
  PORT: '3001',
};

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://omnia:omnia_local_dev@localhost:5432/omnia_test';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['server/test/unit/**/*.test.ts'],
          env: { ...testEnv, DATABASE_URL: 'postgres://unit-tests-must-not-connect@invalid/none' },
        },
      },
      {
        test: {
          name: 'int',
          environment: 'node',
          include: ['server/test/int/**/*.test.ts'],
          // Creates a fresh omnia_test database and applies every migration once per run.
          globalSetup: ['scripts/db-test.setup.ts'],
          // One shared database: run files one at a time.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
          env: { ...testEnv, DATABASE_URL: testDatabaseUrl },
        },
      },
    ],
  },
});
