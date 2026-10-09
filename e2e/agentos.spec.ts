import { spawnSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'e2e-password-not-real';
const ADMIN = 'e2e-aos-admin@example.test';
const READONLY = 'e2e-aos-readonly@example.test';
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
  runTs('server/src/jobs/create-user.ts', ['--email', ADMIN, '--name', 'Aos Admin', '--role', 'admin']);
  runTs('server/src/jobs/create-user.ts', ['--email', READONLY, '--name', 'Aos Readonly', '--role', 'readonly']);
  runTs('server/test/fixtures/agentos-reassign-seed.ts', []);
});

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Sections' });
const filter = (page: Page, label: string) =>
  page.getByRole('radiogroup', { name: 'Status filter' }).getByText(new RegExp(`^${label}`));

const CSV = [
  'Date,TID,Payer Name,Amount,Type,Will deposit to,Description',
  `01/09/2026,9201,Alex Testperson,100.00,Cash,Test Lettings - Client Account,Rent ${RUN}`,
  `02/09/2026,,Alex Testperson,5.00,Cash,Test Lettings - Client Account,blank ${RUN}`,
  `03/09/2026,9203,Testshire Council HB,20.00,Cash,Test Lettings - Client Account,council ${RUN}`,
  `04/09/2026,9299,Alex Testperson,7.00,Cash,Test Lettings - Client Account,unknown ${RUN}`,
].join('\n');

test('1: an admin uploads a bank file from the agentOS page', async ({ page }) => {
  await signIn(page, ADMIN);
  await nav(page).getByRole('link', { name: 'agentOS receipts' }).click();
  await expect(page.getByRole('heading', { name: 'agentOS receipts', level: 1 })).toBeVisible();
  await page.getByTestId('agentos-file').setInputFiles({ name: `agentos-${RUN}.csv`, mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page.getByText(/Uploaded 4 lines/)).toBeVisible();
  await expect(page.getByTestId('line-2')).toContainText('Matched');
  await expect(page.getByTestId('line-2')).toContainText('Unknown account');
  await expect(page.getByTestId('line-4')).toContainText('Council / third party');
});

test('2: the Unmatched filter shows lines 3 and 5 and the export count is 2', async ({ page }) => {
  await signIn(page, ADMIN);
  await nav(page).getByRole('link', { name: 'agentOS receipts' }).click();
  await filter(page, 'Unmatched').click();
  await expect(page.getByTestId('line-3')).toBeVisible();
  await expect(page.getByTestId('line-5')).toBeVisible();
  await expect(page.getByTestId('line-2')).toHaveCount(0);
  await expect(page.getByTestId('line-4')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export matched lines (2)' })).toBeVisible();
});

test('3: reassigning line 3 to 9201 matches it and raises the export count to 3', async ({ page }) => {
  await signIn(page, ADMIN);
  await nav(page).getByRole('link', { name: 'agentOS receipts' }).click();
  await page.getByTestId('line-3').getByRole('button', { name: 'Reassign TID' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'agentOS tenant' }).click();
  await page.getByRole('option', { name: /9201 Alex Testperson/ }).click();
  await dialog.getByRole('button', { name: 'Reassign', exact: true }).click();
  await expect(page.getByTestId('line-3')).toContainText('Matched');
  await expect(page.getByRole('button', { name: 'Export matched lines (3)' })).toBeVisible();
});

test('4: export downloads the CSV and marks lines 2, 3 and 4 exported', async ({ page }) => {
  await signIn(page, ADMIN);
  await nav(page).getByRole('link', { name: 'agentOS receipts' }).click();
  await page.getByRole('button', { name: 'Export matched lines (3)' }).click();
  await expect(page.getByText('Exported 3 line(s)')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download CSV' }).click();
  expect((await download).suggestedFilename()).toMatch(/^agentos-take-payment-/);
  await expect(page.getByTestId('line-2')).toContainText('Exported');
});

test('5: mark posted works on an exported line and is absent on the unmatched line 5', async ({ page }) => {
  await signIn(page, ADMIN);
  await nav(page).getByRole('link', { name: 'agentOS receipts' }).click();
  await page.getByTestId('line-2').getByRole('button', { name: 'Mark posted' }).click();
  await expect(page.getByTestId('line-2')).toContainText('Posted');
  await expect(page.getByTestId('line-5').getByRole('button', { name: 'Mark posted' })).toHaveCount(0);
});

test('6: a read-only user sees the table but no write controls', async ({ page }) => {
  await signIn(page, READONLY);
  await nav(page).getByRole('link', { name: 'agentOS receipts' }).click();
  await expect(page.getByTestId('line-2')).toBeVisible();
  await expect(page.getByTestId('agentos-file')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Reassign TID/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Export matched lines/ })).toHaveCount(0);
});
