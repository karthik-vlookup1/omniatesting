import { spawnSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'e2e-password-not-real';
const ADMIN = 'e2e-aoj-admin@example.test';
const READONLY = 'e2e-aoj-readonly@example.test';
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
  runTs('server/src/jobs/create-user.ts', ['--email', ADMIN, '--name', 'Aoj Admin', '--role', 'admin']);
  runTs('server/src/jobs/create-user.ts', ['--email', READONLY, '--name', 'Aoj Readonly', '--role', 'readonly']);
  runTs('server/test/fixtures/agentos-reassign-seed.ts', []);
});

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
}

const row = (page: Page) => page.locator('[data-testid^="journal-"]').filter({ hasText: `J-${RUN}` });

test('1: an admin posts a 3-row journal only when the total is 0.00, then exports and posts it', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.goto('/agentos');
  const pick = async (n: number, tid: string) => {
    await page.getByRole('combobox', { name: `Person ${n}` }).click();
    await page.getByRole('option', { name: new RegExp(`^${tid} `) }).click();
  };
  await page.getByLabel('Description', { exact: true }).last().fill(`J-${RUN}`);
  await page.getByLabel('Nominal Code').fill('1100');
  await page.getByRole('button', { name: 'Add row' }).click();
  const rowsSpec: [number, string, string][] = [
    [1, '9201', '-10.00'],
    [2, '9202', '4.00'],
    [3, '9203', '5.00'],
  ];
  for (const [n, tid, amount] of rowsSpec) {
    await pick(n, tid);
    await page.getByLabel(`Account Type ${n}`).fill('Rent');
    await page.getByLabel(`Amount ${n}`).fill(amount);
  }
  await expect(page.getByTestId('journal-total')).toContainText('-£1.00');
  await expect(page.getByRole('button', { name: 'Create transfer' })).toBeDisabled();
  await page.getByLabel('Amount 3').fill('6.00');
  await expect(page.getByTestId('journal-total')).toContainText('£0.00');
  await page.getByRole('button', { name: 'Create transfer' }).click();
  await expect(row(page)).toContainText('Not exported');
  await expect(row(page)).toContainText('9203');

  await page.getByRole('button', { name: /^Export journal transfers/ }).click();
  await expect(page.getByText(/Exported \d+ transfer\(s\)/)).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download journal CSV' }).click();
  expect((await download).suggestedFilename()).toMatch(/^agentos-journal-transfer-/);
  await expect(row(page)).toContainText('Exported');

  await row(page).getByRole('button', { name: 'Mark posted' }).click();
  await expect(row(page)).toContainText('Posted');
});

test('2: a read-only user sees the transfer but no write controls', async ({ page }) => {
  await signIn(page, READONLY);
  await page.goto('/agentos');
  await expect(row(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create transfer' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Export journal transfers/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mark posted' })).toHaveCount(0);
});
