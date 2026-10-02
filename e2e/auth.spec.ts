import { spawnSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

const EMAIL = 'e2e-admin@example.test';
const PASSWORD = 'e2e-password-not-real';

// Seeds the user through the real create-user job against the e2e database the API uses.
// Runs node directly (no shell) so arguments with spaces survive on Windows.
test.beforeAll(() => {
  const args = ['--import', 'tsx', 'server/src/jobs/create-user.ts', '--email', EMAIL, '--name', 'E2E Admin', '--role', 'admin'];
  const res = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'warn',
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgres://omnia:omnia_local_dev@localhost:5432/omnia_e2e',
      HASH_KEY: 'test-only-key',
      ENCRYPTION_KEY: 'dGVzdC1vbmx5LWVuY3J5cHRpb24ta2V5LTMyYnl0ZXM=',
      SESSION_SECRET: 'test-only-session-key-not-for-production',
      OMNIA_NEW_USER_PASSWORD: PASSWORD,
    },
  });
  if (res.status !== 0) throw new Error(`user:create failed:\n${res.stdout}${res.stderr}`);
});

test('unauthenticated visit redirects to the login page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('wrong password shows an error and stays on login', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(EMAIL);
  await page.getByRole('textbox', { name: 'Password' }).fill('definitely-wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('E-mail or password is incorrect');
  await expect(page).toHaveURL(/\/login$/);
});

test('sign in shows the app shell, survives reload, and sign out returns to login', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(EMAIL);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Welcome, E2E Admin' })).toBeVisible();
  await expect(page.getByText('admin', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome, E2E Admin' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});
