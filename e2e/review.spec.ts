import { spawnSync } from 'node:child_process';
import { expect, test, type Locator, type Page } from '@playwright/test';

const PASSWORD = 'e2e-password-not-real';
const ADMIN = 'e2e-rev-admin@example.test';
const STAFF = 'e2e-rev-staff@example.test';
const READONLY = 'e2e-rev-readonly@example.test';

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

// Synthetic HSBC statement: one TID line (auto), two name-only lines (review), two unknown payers (yet to take).
const STATEMENT = [
  'Date,Description,Paid in,Paid out,Balance',
  '01/09/2026,"COUNCIL HB T9001 SEP RENT",650.00,,1650.00',
  '02/09/2026,"STANDING ORDER TEST TENANT2",650.00,,2300.00',
  '02/09/2026,"BACS TEST TENANT4",650.00,,2950.00',
  '03/09/2026,"UNKNOWN PAYER RENT",500.00,,3450.00',
  '04/09/2026,"MYSTERY CREDIT",20.00,,3470.00',
].join('\n');

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  runTs('server/src/jobs/create-user.ts', ['--email', ADMIN, '--name', 'Rev Admin', '--role', 'admin']);
  runTs('server/src/jobs/create-user.ts', ['--email', STAFF, '--name', 'Rev Staff', '--role', 'staff']);
  runTs('server/src/jobs/create-user.ts', ['--email', READONLY, '--name', 'Rev Reader', '--role', 'readonly']);
  runTs('server/test/fixtures/veco-seed.ts', ['6']);
});

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function signOut(page: Page, name: string) {
  await page.getByRole('button', { name: `Account menu for ${name}` }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Sections' });

async function uploadCsv(page: Page, name: string, csv: string) {
  await nav(page).getByRole('link', { name: 'Upload statement' }).click();
  await page.getByRole('combobox', { name: 'Bank account' }).click();
  await page.getByRole('option', { name: /^HSBC/ }).click();
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: 'Upload and match' }).click();
}

const linesTable = (page: Page) => page.getByRole('table', { name: 'Bank lines' });
const lineRow = (page: Page, description: string) =>
  linesTable(page).getByRole('row', { name: new RegExp(description) });
/** The line's status badge in the drawer (badges carry data-status). */
const statusOf = (drawer: Locator) => drawer.locator('[data-status]').first();

async function openLine(page: Page, description: string) {
  await lineRow(page, description).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(description).first()).toBeVisible();
  return drawer;
}

const confirmButton = (drawer: Locator) => drawer.getByRole('button', { name: 'Confirm', exact: true });

test('staff upload a statement and see what was matched automatically', async ({ page }) => {
  await signIn(page, ADMIN);
  const res = await page.request.post('/api/bank-accounts/defaults', {
    headers: { 'X-Requested-With': 'omnia-recon' },
  });
  expect(res.ok()).toBe(true);
  await signOut(page, 'Rev Admin');

  await signIn(page, STAFF);
  await uploadCsv(page, 'hsbc-review.csv', STATEMENT);
  await expect(page.getByTestId('match-summary')).toHaveText(
    '1 matched automatically, 2 for review, 2 yet to take, 0 excluded',
  );

  await page.getByRole('link', { name: 'Review these lines' }).click();
  await expect(page.getByRole('heading', { name: 'Review queue' })).toBeVisible();
  await expect(linesTable(page).getByRole('row')).toHaveCount(5); // header + 4 open lines
  await expect(linesTable(page)).not.toContainText('COUNCIL HB T9001');
});

test('staff accept a suggestion and the line leaves the open queue', async ({ page }) => {
  await signIn(page, STAFF);
  await page.goto('/review');
  const drawer = await openLine(page, 'STANDING ORDER TEST TENANT2');
  await drawer.getByRole('button', { name: 'Accept T9002' }).click();
  await expect(drawer.getByLabel('Amount (£)')).toHaveValue('650.00');
  await confirmButton(drawer).click();

  await expect(page.getByText('Match confirmed')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(linesTable(page).getByRole('row')).toHaveCount(4);
  await expect(linesTable(page)).not.toContainText('TENANT2');

  await page.goto('/review?status=matched');
  const matched = await openLine(page, 'STANDING ORDER TEST TENANT2');
  await expect(statusOf(matched)).toHaveText('Matched');
  await expect(matched).toContainText('Confirmed by Rev Staff');
});

test('rejecting every suggestion moves the line to yet to take', async ({ page }) => {
  await signIn(page, STAFF);
  await page.goto('/review?status=needs_review');
  const drawer = await openLine(page, 'BACS TEST TENANT4');
  const rejects = drawer.getByRole('button', { name: /^Reject T/ });
  while ((await rejects.count()) > 0) {
    const before = await rejects.count();
    await rejects.first().click();
    await expect(rejects).toHaveCount(before - 1);
  }
  await expect(statusOf(drawer)).toHaveText('Yet to take');
  await expect(drawer.getByLabel('Find a tenancy')).toBeVisible();
});

test('staff match a yet-to-take line by hand, by TID', async ({ page }) => {
  await signIn(page, STAFF);
  await page.goto('/review?status=yet_to_take');
  const drawer = await openLine(page, 'UNKNOWN PAYER RENT');
  await drawer.getByLabel('Find a tenancy').fill('T9003');
  await drawer.getByRole('option', { name: /^Choose T9003/ }).click();
  await expect(drawer.getByLabel('Amount (£)')).toHaveValue('500.00');
  await confirmButton(drawer).click();
  await expect(page.getByText('Match confirmed')).toBeVisible();

  await page.goto('/review?status=matched');
  const matched = await openLine(page, 'UNKNOWN PAYER RENT');
  await expect(statusOf(matched)).toHaveText('Matched');
  await expect(matched).toContainText('T9003');
});

test('a part payment leaves the rest of the line to match', async ({ page }) => {
  await signIn(page, STAFF);
  await page.goto('/review?status=yet_to_take');
  const drawer = await openLine(page, 'BACS TEST TENANT4');
  await drawer.getByLabel('Find a tenancy').fill('Test Tenant4');
  await drawer.getByRole('option', { name: /^Choose T9004/ }).click();
  await drawer.getByLabel('Amount (£)').fill('400');
  await confirmButton(drawer).click();
  await expect(page.getByText('Match confirmed')).toBeVisible();

  await page.goto('/review?status=partially_matched');
  await expect(lineRow(page, 'BACS TEST TENANT4')).toContainText('£250.00');
  const part = await openLine(page, 'BACS TEST TENANT4');
  await expect(statusOf(part)).toHaveText('Part matched');
});

test('staff exclude a line that is not rent, then include it again', async ({ page }) => {
  await signIn(page, STAFF);
  await page.goto('/review');
  const drawer = await openLine(page, 'MYSTERY CREDIT');
  await drawer.getByRole('button', { name: 'Exclude', exact: true }).click();
  await drawer.getByLabel('Reason').fill('Internal transfer');
  await drawer.getByRole('button', { name: 'Exclude line' }).click();
  await expect(page.getByText('Excluded: Internal transfer')).toBeVisible();

  await page.goto('/review?status=excluded');
  const excluded = await openLine(page, 'MYSTERY CREDIT');
  await expect(statusOf(excluded)).toHaveText('Excluded');
  await expect(excluded).toContainText('Internal transfer');
  await excluded.getByRole('button', { name: 'Include again' }).click();
  await expect(page.getByText('It is back in the review queue.')).toBeVisible();

  await page.goto('/review?status=yet_to_take');
  await expect(lineRow(page, 'MYSTERY CREDIT')).toBeVisible();
});

test('a line can be opened from the keyboard', async ({ page }) => {
  await signIn(page, STAFF);
  await page.goto('/review?status=matched');
  await lineRow(page, 'COUNCIL HB T9001 SEP RENT').focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await expect(statusOf(drawer)).toHaveText('Matched');
});

test('readonly users can look at lines but not change them', async ({ page }) => {
  await signIn(page, READONLY);
  await page.goto('/review');
  const drawer = await openLine(page, 'MYSTERY CREDIT');
  await expect(drawer).toContainText('Your role can view lines but not decide them.');
  await expect(drawer.getByLabel('Find a tenancy')).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: 'Exclude', exact: true })).toHaveCount(0);
});

test('a part-matched line cannot be excluded, refuses more than is left, then matches the rest', async ({ page }) => {
  await signIn(page, STAFF);
  await page.goto('/review?status=partially_matched');
  const drawer = await openLine(page, 'BACS TEST TENANT4');
  await expect(drawer.getByRole('button', { name: 'Exclude', exact: true })).toHaveCount(0);
  await expect(drawer.getByLabel('Amount (£)')).toHaveCount(0);

  await drawer.getByRole('button', { name: 'Pick another tenancy' }).click();
  await drawer.getByLabel('Find a tenancy').fill('T9004');
  await drawer.getByRole('option', { name: /^Choose T9004/ }).click();
  const amount = drawer.getByLabel('Amount (£)');
  await expect(amount).toHaveValue('250.00');
  await amount.fill('300.00');
  await confirmButton(drawer).click();
  await expect(drawer).toContainText('Cannot be more than the £250.00 remaining');
  await expect(statusOf(drawer)).toHaveText('Part matched');

  await amount.fill('250.00');
  await confirmButton(drawer).click();
  await expect(page.getByText('Match confirmed')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('No part matched lines')).toBeVisible();

  await page.goto('/review?status=matched');
  const matched = await openLine(page, 'BACS TEST TENANT4');
  await expect(statusOf(matched)).toHaveText('Matched');
});

test('a bad amount is refused before anything is sent', async ({ page }) => {
  await signIn(page, STAFF);
  await page.goto('/review');
  const drawer = await openLine(page, 'MYSTERY CREDIT');
  await drawer.getByLabel('Find a tenancy').fill('T9005');
  await drawer.getByRole('option', { name: /^Choose T9005/ }).click();
  const amount = drawer.getByLabel('Amount (£)');
  for (const bad of ['0', '-5', '1.234', 'abc', '']) {
    await amount.fill(bad);
    await confirmButton(drawer).click();
    await expect(amount).toHaveAttribute('aria-invalid', 'true');
  }
  await expect(statusOf(drawer)).toHaveText('Yet to take');
});

test('money going out is excluded on upload and cannot be included again', async ({ page }) => {
  await signIn(page, STAFF);
  await uploadCsv(
    page,
    'hsbc-review-out.csv',
    'Date,Description,Paid in,Paid out,Balance\n05/09/2026,"DD BANK CHARGE",,12.50,3457.50',
  );
  await expect(page.getByTestId('match-summary')).toContainText('1 excluded');

  await page.goto('/review?status=excluded');
  const drawer = await openLine(page, 'DD BANK CHARGE');
  await expect(drawer).toContainText('−£12.50');
  await expect(statusOf(drawer)).toHaveText('Excluded');
  await expect(drawer).toContainText('Money going out stays excluded.');
  await expect(drawer.getByLabel('Find a tenancy')).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: 'Include again' })).toHaveCount(0);
});

test('confirmed receipts wait for Vico and Xero; only admin and accounts see those pages', async ({ page }) => {
  await signIn(page, STAFF);
  await expect(nav(page).getByRole('link', { name: 'Upload statement' })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Vico export' })).toHaveCount(0);
  await expect(nav(page).getByRole('link', { name: 'Xero' })).toHaveCount(0);
  await signOut(page, 'Rev Staff');

  await signIn(page, ADMIN);
  await nav(page).getByRole('link', { name: 'Vico export' }).click();
  await expect(page.getByRole('heading', { name: 'Vico export' })).toBeVisible();
  for (const tid of ['T9001', 'T9002', 'T9003', 'T9004']) await expect(page.getByRole('main')).toContainText(tid);

  await nav(page).getByRole('link', { name: 'Xero' }).click();
  await expect(page.getByRole('heading', { name: 'Xero', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('T9002');

  await nav(page).getByRole('link', { name: 'CSV profiles' }).click();
  await expect(page.getByRole('main')).toContainText('HSBC');
});
