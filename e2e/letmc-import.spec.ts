import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'e2e-password-not-real';
const ADMIN = 'e2e-letmc-admin@example.test';
const STAFF = 'e2e-letmc-staff@example.test';

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

const fixture = (name: string) => path.resolve('fixtures', 'letmc', name);

test.beforeAll(() => {
  runTs('server/src/jobs/create-user.ts', ['--email', ADMIN, '--name', 'LetMC Admin', '--role', 'admin']);
  runTs('server/src/jobs/create-user.ts', ['--email', STAFF, '--name', 'LetMC Staff', '--role', 'staff']);
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

async function openImport(page: Page) {
  await signIn(page, ADMIN);
  await page.getByRole('link', { name: 'LetMC import' }).click();
  await expect(page.getByRole('heading', { name: 'Import from LetMC' })).toBeVisible();
  await expect(page.getByLabel('Record type')).toHaveValue('landlords');
}

test('a landlords file with bad rows previews its rejects and cannot be committed', async ({ page }) => {
  await openImport(page);
  await page.locator('input[type="file"]').setInputFiles(fixture('landlords.csv'));
  await page.getByRole('button', { name: 'Preview' }).click();

  await expect(page.getByTestId('stat-rejected')).toContainText('2');
  await expect(page.getByTestId('stat-rows')).toContainText('6');
  const rejected = table(page, 'Rejected rows');
  await expect(rejected.getByRole('row', { name: /Email/ })).toBeVisible();
  await expect(rejected.getByRole('row', { name: /Landlord Name/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download error report' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Commit import' })).toBeDisabled();
});

test('a clean landlords file previews and commits', async ({ page }) => {
  await openImport(page);
  await page.locator('input[type="file"]').setInputFiles(fixture('landlords-clean.csv'));
  await page.getByRole('button', { name: 'Preview' }).click();

  await expect(page.getByTestId('stat-will-create')).toContainText('3');
  await expect(page.getByTestId('stat-rejected')).toContainText('0');
  await expect(page.getByRole('button', { name: 'Commit import' })).toBeEnabled();
  await page.getByRole('button', { name: 'Commit import' }).click();

  await expect(page.getByText('Import committed: 3 created')).toBeVisible();
  await expect(table(page, 'Recent LetMC imports').getByRole('row', { name: /landlords-clean\.csv/ })).toBeVisible();
});

test('a staff user is not offered the LetMC import', async ({ page }) => {
  await signIn(page, STAFF);
  const nav = page.getByRole('navigation', { name: 'Sections' });
  await expect(nav.getByRole('link', { name: 'Upload statement' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'LetMC import' })).toHaveCount(0);
});

test('the error report downloads as a CSV listing each bad row (row, field, reason) and no row values', async ({ page }) => {
  await openImport(page);
  await page.locator('input[type="file"]').setInputFiles(fixture('landlords.csv'));
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByTestId('stat-rejected')).toContainText('2');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download error report' }).click()]);
  expect(download.suggestedFilename()).toBe('letmc-landlords-errors.csv');
  const lines = readFileSync(await download.path(), 'utf8').trim().split(/\r?\n/);
  expect(lines[0]).toBe('Row,Key,Field,Reason');
  expect(lines).toHaveLength(3);
  expect(lines[1]).toMatch(/^6,L8004,Email,/);
  expect(lines[2]).toMatch(/^7,L8005,Landlord Name,/);
  expect(lines.join('')).not.toContain('not-an-email');
});
