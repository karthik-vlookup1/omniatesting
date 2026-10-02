import { spawnSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

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

const linesTable = (page: Page) => page.getByRole('table', { name: 'Bank lines' });

async function openLine(page: Page, description: string) {
  await linesTable(page).getByRole('row').filter({ hasText: description }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  return drawer;
}

test('staff upload a statement and see what was matched automatically', async ({ page }) => {
  await signIn(page, ADMIN);
  const res = await page.request.post('/api/bank-accounts/defaults', { headers: { 'X-Requested-With': 'omnia-recon' } });
  expect(res.ok()).toBe(true);
  await page.getByRole('button', { name: 'Sign out' }).click();

  await signIn(page, STAFF);
  await page.getByRole('link', { name: 'Upload statement' }).click();
  await page.getByRole('combobox', { name: 'Bank account' }).click();
  await page.getByRole('option', { name: /^HSBC/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'hsbc-review.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(STATEMENT),
  });
  await page.getByRole('button', { name: 'Upload' }).click();
  await expect(page.getByTestId('match-summary')).toHaveText(
    '1 matched automatically, 2 for review, 2 yet to take, 0 excluded',
  );

  await page.getByRole('link', { name: /Review queue/ }).click();
  await expect(page.getByRole('heading', { name: 'Review queue' })).toBeVisible();
  await expect(linesTable(page).getByRole('row')).toHaveCount(5); // header + 4 open lines
  await expect(linesTable(page)).not.toContainText('COUNCIL HB T9001');
});

test('staff accept a suggestion and the line leaves the open queue', async ({ page }) => {
  await signIn(page, STAFF);
  await page.goto('/review');
  const drawer = await openLine(page, 'STANDING ORDER TEST TENANT2');
  await expect(drawer.getByRole('button', { name: 'Accept T9002' })).toBeVisible();
  await drawer.getByRole('button', { name: 'Accept T9002' }).click();
  await expect(drawer.getByLabel('Amount (£)')).toHaveValue('650.00');
  await drawer.getByRole('button', { name: 'Confirm T9002' }).click();

  await expect(drawer.getByRole('status')).toContainText('Matched to T9002');
  await expect(drawer.getByTestId('line-status')).toHaveText('Matched');
  await expect(drawer.getByRole('table', { name: 'Receipts' })).toContainText('Rev Staff');
  await page.keyboard.press('Escape');
  await expect(linesTable(page).getByRole('row')).toHaveCount(4);
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
  await expect(drawer.getByTestId('line-status')).toHaveText('Yet to take');
  await expect(drawer.getByRole('heading', { name: 'Match to a tenancy' })).toBeVisible();
});

test('staff match a yet-to-take line by hand, by TID', async ({ page }) => {
  await signIn(page, STAFF);
  await page.goto('/review?status=yet_to_take');
  const drawer = await openLine(page, 'UNKNOWN PAYER RENT');
  await drawer.getByLabel('Find tenancy').fill('T9003');
  await drawer.getByRole('button', { name: 'Choose T9003' }).click();
  await expect(drawer.getByLabel('Amount (£)')).toHaveValue('500.00');
  await drawer.getByRole('button', { name: 'Confirm T9003' }).click();
  await expect(drawer.getByTestId('line-status')).toHaveText('Matched');
  await expect(drawer.getByRole('table', { name: 'Receipts' })).toContainText('T9003');
});

test('a part payment leaves the rest of the line to match', async ({ page }) => {
  await signIn(page, STAFF);
  await page.goto('/review?status=yet_to_take');
  const drawer = await openLine(page, 'BACS TEST TENANT4');
  await drawer.getByLabel('Find tenancy').fill('Test Tenant4');
  await drawer.getByRole('button', { name: 'Choose T9004' }).click();
  await drawer.getByLabel('Amount (£)').fill('400');
  await drawer.getByRole('button', { name: 'Confirm T9004' }).click();
  await expect(drawer.getByTestId('line-status')).toHaveText('Part matched');
  await expect(drawer).toContainText('£250.00');
});

test('staff exclude a line that is not rent, then include it again', async ({ page }) => {
  await signIn(page, STAFF);
  await page.goto('/review');
  const drawer = await openLine(page, 'MYSTERY CREDIT');
  await drawer.getByLabel('Reason for excluding').fill('Internal transfer');
  await drawer.getByRole('button', { name: 'Exclude line' }).click();
  await expect(drawer.getByTestId('line-status')).toHaveText('Excluded');
  await expect(drawer).toContainText('Internal transfer');

  await drawer.getByRole('button', { name: 'Include again' }).click();
  await expect(drawer.getByTestId('line-status')).toHaveText('Yet to take');
});

test('a line can be opened from the keyboard', async ({ page }) => {
  await signIn(page, STAFF);
  await page.goto('/review?status=matched');
  await page.getByRole('button', { name: 'Open line COUNCIL HB T9001 SEP RENT' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByTestId('line-status')).toHaveText('Matched');
});

test('readonly users can look at lines but not change them', async ({ page }) => {
  await signIn(page, READONLY);
  await page.goto('/review');
  const drawer = await openLine(page, 'MYSTERY CREDIT');
  await expect(drawer.getByLabel('Find tenancy')).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: 'Exclude line' })).toHaveCount(0);
});

test('a part-matched line cannot be excluded, refuses more than is left, then matches the rest', async ({ page }) => {
  await signIn(page, STAFF);
  const badge = page.getByLabel(/lines to review$/);
  await expect(badge).toHaveText('2'); // part-matched TENANT4 + MYSTERY CREDIT (yet to take)
  await page.goto('/review?status=partially_matched');
  const drawer = await openLine(page, 'BACS TEST TENANT4');
  await expect(drawer.getByRole('button', { name: 'Exclude line' })).toHaveCount(0);
  await expect(drawer.getByLabel('Amount (£)')).toHaveCount(0);

  await drawer.getByLabel('Find tenancy').fill('T9004');
  await drawer.getByRole('button', { name: 'Choose T9004' }).click();
  await expect(drawer.getByLabel('Amount (£)')).toHaveValue('250.00');
  await drawer.getByLabel('Amount (£)').fill('300.00');
  await drawer.getByRole('button', { name: 'Confirm T9004' }).click();
  await expect(drawer.getByRole('alert')).toBeVisible();
  await expect(drawer.getByTestId('line-status')).toHaveText('Part matched');

  await drawer.getByLabel('Amount (£)').fill('250.00');
  await drawer.getByRole('button', { name: 'Confirm T9004' }).click();
  await expect(drawer.getByTestId('line-status')).toHaveText('Matched');
  await expect(drawer.getByRole('table', { name: 'Receipts' }).getByRole('row')).toHaveCount(3);
  await expect(badge).toHaveText('1');
  await page.keyboard.press('Escape');
  await expect(linesTable(page).getByRole('row')).toHaveCount(1);
});

test('a bad amount keeps Confirm disabled', async ({ page }) => {
  await signIn(page, STAFF);
  await page.goto('/review');
  const drawer = await openLine(page, 'MYSTERY CREDIT');
  await drawer.getByLabel('Find tenancy').fill('T9005');
  await drawer.getByRole('button', { name: 'Choose T9005' }).click();
  for (const bad of ['0', '-5', '1.234', 'abc', '']) {
    await drawer.getByLabel('Amount (£)').fill(bad);
    await expect(drawer.getByRole('button', { name: 'Confirm T9005' })).toBeDisabled();
  }
});

test('money going out is excluded on upload and cannot be included again', async ({ page }) => {
  await signIn(page, STAFF);
  await page.getByRole('link', { name: 'Upload statement' }).click();
  await page.getByRole('combobox', { name: 'Bank account' }).click();
  await page.getByRole('option', { name: /^HSBC/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'hsbc-review-out.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Date,Description,Paid in,Paid out,Balance\n05/09/2026,"DD BANK CHARGE",,12.50,3457.50'),
  });
  await page.getByRole('button', { name: 'Upload' }).click();
  await expect(page.getByTestId('match-summary')).toContainText('1 excluded');

  await page.goto('/review?status=excluded');
  const drawer = await openLine(page, 'DD BANK CHARGE');
  await expect(drawer).toContainText('-£12.50');
  await expect(drawer.getByLabel('Find tenancy')).toHaveCount(0);
  await expect(drawer.getByTestId('line-status')).toHaveText('Excluded');
  await expect(drawer.getByRole('button', { name: 'Include again' })).toHaveCount(0);
});
