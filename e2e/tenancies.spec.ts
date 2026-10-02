import { spawnSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'e2e-password-not-real';
const STAFF = 'e2e-ten-staff@example.test';
const ADMIN = 'e2e-ten-admin@example.test';

const env = {
  ...process.env,
  NODE_ENV: 'test',
  LOG_LEVEL: 'warn',
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgres://omnia:omnia_local_dev@localhost:5433/omnia_e2e',
  HASH_KEY: 'test-only-key',
  ENCRYPTION_KEY: 'dGVzdC1vbmx5LWVuY3J5cHRpb24ta2V5LTMyYnl0ZXM=',
  SESSION_SECRET: 'test-only-session-key-not-for-production',
  OMNIA_NEW_USER_PASSWORD: PASSWORD,
};

/** Runs a TypeScript script with node directly (no shell) so arguments survive on Windows. */
function runTs(script: string, args: string[]): void {
  const res = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], { encoding: 'utf8', env });
  if (res.status !== 0) throw new Error(`${script} failed:\n${res.stdout}${res.stderr}`);
}

test.beforeAll(() => {
  runTs('server/src/jobs/create-user.ts', ['--email', STAFF, '--name', 'Ten Staff', '--role', 'staff']);
  runTs('server/src/jobs/create-user.ts', ['--email', ADMIN, '--name', 'Ten Admin', '--role', 'admin']);
  runTs('server/test/fixtures/veco-seed.ts', ['6']);
});

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
}

test('staff search a tenancy by TID and see only the masked NI', async ({ page }) => {
  await signIn(page, STAFF);
  await page.getByRole('link', { name: 'Tenancies' }).click();
  await expect(page.getByRole('heading', { name: 'Tenancies' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Tenancies' }).getByRole('row')).toHaveCount(7); // header + 6

  await page.getByLabel('Search').fill('t9006');
  const rows = page.getByRole('table', { name: 'Tenancies' }).getByRole('row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText('Zara Q Sample');
  await expect(rows.nth(1)).toContainText('•••••56D');

  await rows.nth(1).click();
  await expect(page.getByTestId('tenancy-ni')).toHaveText('•••••56D');
  await expect(page.getByRole('button', { name: 'Sync from Veco now' })).toHaveCount(0);
});

test('staff can search by full NI number', async ({ page }) => {
  await signIn(page, STAFF);
  await page.goto('/tenancies');
  await page.getByLabel('Search').fill('CE 12 34 56 D');
  const rows = page.getByRole('table', { name: 'Tenancies' }).getByRole('row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText('T9006');
});

test('admin sees the full NI and gets a clear message when Veco is not configured', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/tenancies');
  await page.getByLabel('Search').fill('Zara');
  const rows = page.getByRole('table', { name: 'Tenancies' }).getByRole('row');
  await expect(rows).toHaveCount(2); // wait for the debounced search to apply
  await rows.nth(1).click();
  await expect(page.getByTestId('tenancy-ni')).toHaveText('CE123456D');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Preview sync' }).click();
  await expect(page.getByRole('alert')).toContainText('Veco sync is not configured');
});
