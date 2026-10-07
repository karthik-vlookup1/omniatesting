import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'e2e-password-not-real';
const ADMIN = 'e2e-aop-admin@example.test';
const READONLY = 'e2e-aop-readonly@example.test';
const RUN = Date.now().toString(36);

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

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  runTs('server/src/jobs/create-user.ts', ['--email', ADMIN, '--name', 'Aop Admin', '--role', 'admin']);
  runTs('server/src/jobs/create-user.ts', ['--email', READONLY, '--name', 'Aop Readonly', '--role', 'readonly']);
  runTs('server/test/fixtures/agentos-payment-seed.ts', []);
});

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
}

const row = (page: Page) => page.locator('[data-testid^="payment-"]').filter({ hasText: `P-${RUN}` });

/** Reads the shown balance in pence once it has loaded. */
async function balancePence(page: Page): Promise<number> {
  const el = page.getByTestId('ledger-balance');
  await expect(el).toHaveText(/^-?£[\d,]+\.\d{2}$/);
  const text = (await el.textContent()) ?? '';
  return Math.round(Number(text.replace(/[£,]/g, '')) * 100);
}

test('1: an admin takes a card payment, sees the balance rise, exports a 2-line CSV and marks it posted', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/agentos');
  await page.getByRole('combobox', { name: 'Tenant' }).click();
  await page.getByRole('option', { name: /^9201 / }).click();
  await expect(page.getByLabel('Payment From')).toHaveValue(/^9201 /);
  const before = await balancePence(page);

  await page.getByLabel('Amount (£)').fill('12.34');
  await page.getByLabel('Description', { exact: true }).first().fill(`P-${RUN}`);
  await page.getByRole('button', { name: 'Take payment' }).click();
  await expect(row(page)).toContainText('Not exported');
  await expect(row(page)).toContainText('£12.34');
  await expect.poll(() => balancePence(page)).toBe(before + 1234);

  await page.getByRole('button', { name: /^Export payments/ }).click();
  await expect(page.getByText(/Exported 1 payment\(s\)/)).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download payments CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^agentos-take-payment-/);
  const csv = readFileSync(await file.path(), 'utf8');
  expect(csv.trim().split(/\r?\n/)).toHaveLength(2);
  await expect(row(page)).toContainText('Exported');

  await row(page).getByRole('button', { name: 'Mark posted' }).click();
  await expect(row(page)).toContainText('Posted');
  await expect(page.getByRole('button', { name: 'Mark posted' })).toHaveCount(0);
});

test('2: a read-only user sees the payment but no forms', async ({ page }) => {
  await signIn(page, READONLY);
  await page.goto('/agentos');
  await expect(row(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Take payment' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Export payments/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create transfer' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mark posted' })).toHaveCount(0);
});
