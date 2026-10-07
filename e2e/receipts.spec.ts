import { spawnSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'e2e-password-not-real';
const ADMIN = 'e2e-rcpt-admin@example.test';
const STAFF = 'e2e-rcpt-staff@example.test';

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
  runTs('server/src/jobs/create-user.ts', ['--email', ADMIN, '--name', 'Rcpt Admin', '--role', 'admin']);
  runTs('server/src/jobs/create-user.ts', ['--email', STAFF, '--name', 'Rcpt Staff', '--role', 'staff']);
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

/** Uploads a one-line statement (no TID, so it stays unmatched) and returns the bank line id. */
async function seedLine(page: Page): Promise<string> {
  const csv = ['Date,Description,Paid in,Paid out,Balance', '05/09/2026,"RECEIPTS E2E SPLIT LINE",300.00,,300.00'].join('\n');
  const defaults = await page.request.post('/api/bank-accounts/defaults', { headers: { 'X-Requested-With': 'omnia-recon' } });
  expect(defaults.ok()).toBe(true);
  await nav(page).getByRole('link', { name: 'Upload statement' }).click();
  await page.getByRole('combobox', { name: 'Bank account' }).click();
  await page.getByRole('option', { name: /^HSBC/ }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'receipts-e2e.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: 'Upload and match' }).click();
  await expect(page.getByTestId('match-summary')).toBeVisible();
  const res = await page.request.get('/api/matching/lines?status=open&limit=200');
  const lines = (await res.json()).lines as { id: string; description: string }[];
  return lines.find((l) => l.description === 'RECEIPTS E2E SPLIT LINE')!.id;
}

test('A: an accounts user splits a bank line into two receipts', async ({ page }) => {
  await signIn(page, ADMIN);
  const lineId = await seedLine(page);
  await page.goto(`/receipts?line=${lineId}`);
  const modal = page.getByRole('dialog', { name: 'Split a bank line' });
  await expect(modal.getByText('Left to split £300.00')).toBeVisible();
  await modal.getByLabel('TID 1').fill('T9001');
  await modal.getByLabel('Amount 1').fill('100');
  await modal.getByLabel('TID 2').fill('T9002');
  await modal.getByLabel('Amount 2').fill('150');
  await expect(modal.getByText('Left to split £50.00')).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Save split' })).toBeDisabled();
  await modal.getByLabel('Amount 2').fill('200');
  await expect(modal.getByText('Left to split £0.00')).toBeVisible();
  await modal.getByRole('button', { name: 'Save split' }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByRole('row', { name: 'Open receipt T9001' })).toBeVisible();
  await expect(page.getByRole('row', { name: 'Open receipt T9002' })).toBeVisible();
});

test('B: reversing a receipt with a reason marks it Reversed', async ({ page }) => {
  await signIn(page, ADMIN);
  await nav(page).getByRole('link', { name: 'Receipts', exact: true }).click();
  await page.getByRole('row', { name: 'Open receipt T9001' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('Reason').fill('Paid to the wrong tenancy');
  await drawer.getByRole('button', { name: 'Reverse receipt' }).click();
  await expect(drawer.getByText('Reversed', { exact: true }).first()).toBeVisible();
});

test('C: a staff user is not offered Receipts', async ({ page }) => {
  await signIn(page, STAFF);
  await expect(nav(page).getByRole('link', { name: 'Upload statement' })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Receipts', exact: true })).toHaveCount(0);
});
