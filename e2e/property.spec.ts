import { spawnSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'e2e-password-not-real';
const ADMIN = 'e2e-prop-admin@example.test';
const READONLY = 'e2e-prop-readonly@example.test';

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
  runTs('server/src/jobs/create-user.ts', ['--email', ADMIN, '--name', 'Prop Admin', '--role', 'admin']);
  runTs('server/src/jobs/create-user.ts', ['--email', READONLY, '--name', 'Prop Readonly', '--role', 'readonly']);
});

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
}

const table = (page: Page, name: string) => page.getByRole('table', { name });

test('admin adds a branch, a landlord and a property, finds it by postcode and edits the town', async ({ page }) => {
  await signIn(page, ADMIN);

  await page.getByRole('link', { name: 'Branches' }).click();
  await expect(page.getByRole('heading', { name: 'Branches' })).toBeVisible();
  await page.getByRole('button', { name: 'Add branch' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Code/).fill('E2EB');
  await dialog.getByLabel(/^Name/).fill('E2E Branch');
  await dialog.getByRole('button', { name: 'Add branch' }).click();
  await expect(table(page, 'Branches').getByRole('row', { name: /E2EB/ })).toBeVisible();

  await page.getByRole('link', { name: 'Landlords' }).click();
  await expect(page.getByRole('heading', { name: 'Landlords' })).toBeVisible();
  await page.getByRole('button', { name: 'Add landlord' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Name/).fill('E2E Landlord');
  await dialog.getByRole('button', { name: 'Add landlord' }).click();
  await expect(table(page, 'Landlords').getByRole('row', { name: /E2E Landlord/ })).toBeVisible();

  await page.getByRole('link', { name: 'Properties' }).click();
  await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible();
  await page.getByRole('button', { name: 'Add property' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Property reference').fill('P-E2E-1');
  await dialog.getByLabel(/^Branch/).click();
  await page.getByRole('option', { name: /E2EB/ }).click();
  await dialog.getByLabel(/^Landlord/).click();
  await page.getByRole('option', { name: /E2E Landlord/ }).click();
  await dialog.getByLabel('Address line 1').fill('1 Test Road');
  await dialog.getByLabel('Postcode').fill('E2 7AA');
  await dialog.getByRole('button', { name: 'Add property' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('E2 7');
  const rows = table(page, 'Properties').getByRole('row');
  await expect(rows).toHaveCount(2); // header + 1
  await expect(rows.nth(1)).toContainText('P-E2E-1');
  await expect(rows.nth(1)).toContainText('E2EB');

  await page.getByRole('button', { name: 'Edit P-E2E-1' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Town').fill('Eastville');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();
  await expect(table(page, 'Properties').getByRole('row', { name: /P-E2E-1/ })).toContainText('Eastville');
});

test('admin adds a bank account and marks it inactive', async ({ page }) => {
  await signIn(page, ADMIN);
  await page.getByRole('link', { name: 'Bank accounts' }).click();
  await expect(page.getByRole('heading', { name: 'Bank accounts' })).toBeVisible();
  await page.getByRole('button', { name: 'Add bank account' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Code/).fill('E2EBANK');
  await dialog.getByLabel('Bank name').fill('E2E Bank');
  await dialog.getByLabel('Account name').fill('E2E Client Account');
  await dialog.getByLabel('Account number (last 4 digits)').fill('1234');
  await dialog.getByRole('button', { name: 'Add bank account' }).click();
  await expect(dialog).toBeHidden();
  await expect(table(page, 'Bank accounts').getByRole('row', { name: /E2EBANK/ })).toContainText('Active');

  await page.getByRole('button', { name: 'Edit E2EBANK' }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Account number (last 4 digits)')).toHaveValue('1234');
  await dialog.getByLabel('Active').uncheck();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();
  await expect(table(page, 'Bank accounts').getByRole('row', { name: /E2EBANK/ })).toContainText('Inactive');
});

test('a read-only user sees the properties but cannot add or edit', async ({ page }) => {
  await signIn(page, READONLY);
  await page.goto('/properties');
  await expect(table(page, 'Properties').getByRole('row', { name: /P-E2E-1/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add property' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(0);
});
