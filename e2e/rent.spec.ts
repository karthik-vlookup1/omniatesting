import { spawnSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'e2e-password-not-real';
const ADMIN = 'e2e-rent-admin@example.test';
const READONLY = 'e2e-rent-readonly@example.test';
const TID = 'T9001';

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

/** Today minus 27 days (local), as YYYY-MM-DD: four weekly periods are due by today. */
function startDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 27);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test.beforeAll(() => {
  runTs('server/src/jobs/create-user.ts', ['--email', ADMIN, '--name', 'Rent Admin', '--role', 'admin']);
  runTs('server/src/jobs/create-user.ts', ['--email', READONLY, '--name', 'Rent Readonly', '--role', 'readonly']);
  runTs('server/test/fixtures/veco-seed.ts', ['3']);
});

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
}

const table = (page: Page, name: string) => page.getByRole('table', { name, exact: true });

test('admin sets the rent and a landlord-direct HB award and sees the split and balances', async ({ page }) => {
  const D = startDate();
  await signIn(page, ADMIN);

  await page.getByRole('link', { name: 'Rent', exact: true }).click();
  await page.getByLabel('Tenancy ID').fill(TID);
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: `Rent terms ${TID}` })).toBeVisible();

  await page.getByLabel('Rent (£)').fill('100');
  await page.getByLabel('Cycle', { exact: true }).selectOption('weekly');
  await page.getByLabel('Effective from').fill(D);
  await page.getByRole('button', { name: 'Save rent' }).click();
  await expect(table(page, 'Rent periods').getByRole('row')).toHaveCount(5); // header + 4

  await page.getByRole('button', { name: 'Add benefit award' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Paying body').fill('E2E Council');
  await dialog.getByLabel('Award (£)').fill('60');
  await dialog.getByLabel('Award cycle').selectOption('weekly');
  await dialog.getByLabel('Paid to').selectOption('landlord_direct');
  await dialog.getByLabel('Effective from').fill(D);
  await dialog.getByRole('button', { name: 'Add award' }).click();
  await expect(dialog).toBeHidden();

  const periods = table(page, 'Rent periods').getByRole('row');
  await expect(periods).toHaveCount(5);
  await expect(periods.nth(1)).toContainText('£40.00');
  await expect(periods.nth(1)).toContainText('£60.00');

  const balances = table(page, 'Balance by payer');
  await expect(balances.getByRole('row', { name: /Tenant/ })).toContainText('£160.00');
  await expect(balances.getByRole('row', { name: /Council \(HB\)/ })).toContainText('£240.00');
  await expect(table(page, 'Statement Council (HB)')).toBeVisible();
});

test('a read-only user sees the rent tables but cannot change anything', async ({ page }) => {
  await signIn(page, READONLY);
  await page.goto(`/rent/${TID}`);
  await expect(page.getByRole('heading', { name: `Rent terms ${TID}` })).toBeVisible();
  await expect(table(page, 'Rent history')).toBeVisible();
  await expect(table(page, 'Rent periods')).toBeVisible();
  await expect(table(page, 'Balance by payer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save rent' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Add / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^End / })).toHaveCount(0);
});
