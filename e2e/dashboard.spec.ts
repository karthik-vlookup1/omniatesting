import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'e2e-password-not-real';
const ADMIN = 'e2e-dash-admin@example.test';
const READONLY = 'e2e-dash-readonly@example.test';
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
  runTs('server/src/jobs/create-user.ts', ['--email', ADMIN, '--name', 'Dash Admin', '--role', 'admin']);
  runTs('server/src/jobs/create-user.ts', ['--email', READONLY, '--name', 'Dash Readonly', '--role', 'readonly']);
  runTs('server/test/fixtures/veco-seed.ts', ['4']);
});

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Sections' });

/** Uploads a one-line statement whose description holds a run id and a TID, so it matches. */
async function seedLine(page: Page): Promise<void> {
  const csv = ['Date,Description,Paid in,Paid out,Balance', `05/09/2026,"DASH E2E ${RUN} T9004",100.00,,100.00`].join('\n');
  const defaults = await page.request.post('/api/bank-accounts/defaults', { headers: { 'X-Requested-With': 'omnia-recon' } });
  expect(defaults.ok()).toBe(true);
  await nav(page).getByRole('link', { name: 'Upload statement' }).click();
  await page.getByRole('combobox', { name: 'Bank account' }).click();
  await page.getByRole('option', { name: /^HSBC/ }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: `dash-${RUN}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: 'Upload and match' }).click();
  await expect(page.getByTestId('match-summary')).toBeVisible();
}

test('A: the dashboard shows the four cards and the bank row with a match rate', async ({ page }) => {
  await signIn(page, ADMIN);
  await seedLine(page);
  await nav(page).getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  for (const title of ["Today's imports", 'Review backlog', 'Balances by payer', 'Arrears ageing']) {
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  }
  await expect(page.getByRole('row', { name: /HSBC/ }).first()).toContainText('%');
});

test('B: an admin downloads a tenant statement as CSV and PDF; an unknown TID shows the server message', async ({ page }) => {
  await signIn(page, ADMIN);
  const rent = await page.request.post('/api/rent/T9004/schedules', {
    headers: { 'X-Requested-With': 'omnia-recon' },
    data: { amountPence: 50000, frequency: 'monthly', effectiveFrom: '2026-09-01' },
  });
  expect([201, 409]).toContain(rent.status());

  await nav(page).getByRole('link', { name: 'Dashboard' }).click();
  await page.getByRole('main').getByLabel('TID', { exact: true }).fill('T9004');
  await page.getByRole('main').getByLabel('From', { exact: true }).fill('2026-09-01');

  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const csv = await csvDownload;
  expect(csv.suggestedFilename()).toMatch(/^rent_statement_T9004_2026-09-01_\d{4}-\d{2}-\d{2}\.csv$/);
  const text = readFileSync((await csv.path())!, 'utf8');
  expect(text).toContain('Opening balance');
  expect(text).toContain('T9004');

  const pdfDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const pdf = await pdfDownload;
  expect(pdf.suggestedFilename().endsWith('.pdf')).toBe(true);
  expect(readFileSync((await pdf.path())!).subarray(0, 5).toString('latin1')).toBe('%PDF-');

  await page.getByRole('main').getByLabel('TID', { exact: true }).fill('T0000');
  await page.getByRole('button', { name: 'Show' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Unknown TID T0000' })).toBeVisible();
});

test('C: a read-only user sees the dashboard but cannot download statements', async ({ page }) => {
  await signIn(page, READONLY);
  await nav(page).getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await expect(page.getByText('Statements can be downloaded by staff, accounts and admin users.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download CSV' })).toHaveCount(0);
});
