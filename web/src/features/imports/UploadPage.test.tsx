import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STAFF_USER, installFakeAuthApi, renderApp } from '../../app/testing';
import type { AuthUser } from '../../data/auth';
import type { BankAccount, ImportBatch, MatchSummary, UploadResponse } from '../../data/imports';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const PROFILE = { id: 'p1', version: 3, headerAliases: {}, requiredFields: [], amountMode: 'signed' as const, dateFormat: 'DD/MM/YYYY', skipRows: 0, notes: null };
const HSBC: BankAccount = { id: '11111111-1111-4111-8111-111111111111', code: 'HSBC', bankName: 'HSBC', accountName: 'Rent account', isActive: true, profile: PROFILE };
const ARMY: BankAccount = { id: '22222222-2222-4222-8222-222222222222', code: 'ARMY', bankName: 'Army', accountName: 'Army rent', isActive: true, profile: null };
const OLD: BankAccount = { id: '33333333-3333-4333-8333-333333333333', code: 'OLD', bankName: 'Old', accountName: 'Closed', isActive: false, profile: PROFILE };

const SUMMARY: MatchSummary = { lines: 42, autoMatched: 30, matched: 31, partiallyMatched: 1, needsReview: 6, yetToTake: 4, excluded: 1, unprocessed: 0 };
const UPLOADED: UploadResponse = {
  import: {
    batchId: 'b-new',
    rowsTotal: 45,
    rowsInserted: 42,
    rowsDuplicate: 3,
    rowsSkipped: 0,
    periodFrom: '2026-09-01',
    periodTo: '2026-09-30',
    withTid: 25,
    withNi: 8,
    withPayerAccount: 5,
    moneyIn: 18450.5,
    moneyOut: -120,
  },
  matching: SUMMARY,
};
const PAST: ImportBatch = {
  id: 'b-old',
  bankCode: 'HSBC',
  fileName: 'hsbc-august.csv',
  periodFrom: '2026-08-01',
  periodTo: '2026-08-31',
  rowsTotal: 50,
  rowsInserted: 50,
  rowsDuplicate: 0,
  uploadedAt: '2026-09-01T09:15:00Z',
  uploadedBy: 'Sam Taylor',
};

/** Fake of server/src/api/ingest/routes.ts + /matching/imports/:id/summary, over the auth fake. */
function installFakeImportsApi(user: AuthUser, upload: (form: FormData) => Response = () => json(201, UPLOADED)) {
  installFakeAuthApi({ sessionUser: user });
  const authFetch = globalThis.fetch;
  const imports: ImportBatch[] = [PAST];
  const posts: FormData[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const method = (init?.method ?? 'GET').toUpperCase();
      if (path === '/api/bank-accounts') return json(200, { bankAccounts: [HSBC, ARMY, OLD] });
      if (path === '/api/imports' && method === 'GET') return json(200, { imports });
      if (path === '/api/imports' && method === 'POST') {
        if (new Headers(init?.headers).get('x-requested-with') !== 'omnia-recon') return json(403, { error: { code: 'forbidden', message: 'Missing x-requested-with header' } });
        if (user.role === 'readonly') return json(403, { error: { code: 'forbidden', message: 'You do not have permission to do this' } });
        const form = init?.body as FormData;
        posts.push(form);
        const res = upload(form);
        if (res.status === 201) imports.unshift({ ...PAST, id: 'b-new', fileName: (form.get('file') as File).name });
        return res;
      }
      if (path.startsWith('/api/matching/imports/')) return json(200, { summary: SUMMARY });
      return authFetch(input, init);
    }),
  );
  return { posts };
}

const csv = (name = 'hsbc-september.csv', size?: number) => {
  const f = new File(['Date,Description,Amount\n01/09/2026,T1234 RENT,450.00\n'], name, { type: 'text/csv' });
  if (size !== undefined) Object.defineProperty(f, 'size', { value: size });
  return f;
};

async function chooseBank(name: RegExp) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('textbox', { name: /Bank account/ }).catch(() => screen.getByRole('combobox', { name: /Bank account/ })));
  await user.click(await screen.findByRole('option', { name }));
}

async function pickFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.setup().upload(input, file);
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('UploadPage', { timeout: 15_000 }, () => {
  it('uploads a statement and shows what was imported and matched', async () => {
    const api = installFakeImportsApi(STAFF_USER);
    renderApp('/upload');
    await chooseBank(/HSBC · Rent account/);
    await pickFile(csv());
    await userEvent.setup().click(screen.getByRole('button', { name: 'Upload and match' }));

    expect(await screen.findByTestId('match-summary')).toHaveTextContent('30 matched automatically, 6 for review, 4 yet to take, 1 excluded');
    expect(screen.getByText('Imported 42 new lines')).toBeInTheDocument();
    expect(screen.getByText('£18,450.50')).toBeInTheDocument();
    expect(screen.getByText('HSBC · Rent account · hsbc-september.csv · 01/09/2026 – 30/09/2026')).toBeInTheDocument();

    const form = api.posts[0]!;
    expect(form.get('bankAccountId')).toBe(HSBC.id);
    expect((form.get('file') as File).name).toBe('hsbc-september.csv');
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Recent imports' })).getByText('hsbc-september.csv')).toBeInTheDocument());
    expect(window.localStorage.getItem('omnia.upload.lastBankAccountId')).toBe(HSBC.id);
  });

  it('only offers active banks, and disables those without a CSV profile', async () => {
    installFakeImportsApi(STAFF_USER);
    renderApp('/upload');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('combobox', { name: /Bank account/ }));
    expect(await screen.findByRole('option', { name: /ARMY · Army rent — no CSV profile yet/ })).toHaveAttribute('data-combobox-disabled', 'true');
    expect(screen.queryByRole('option', { name: /OLD/ })).toBeNull();
  });

  it('validates the bank and file before sending anything', async () => {
    const api = installFakeImportsApi(STAFF_USER);
    renderApp('/upload');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Upload and match' }));
    expect(await screen.findByText('Choose the bank account this statement is from')).toBeInTheDocument();
    expect(screen.getByText('Choose a statement file')).toBeInTheDocument();
    await pickFile(csv('big.csv', 11 * 1024 * 1024));
    expect(await screen.findByText('The file is larger than 10 MB.')).toBeInTheDocument();
    expect(api.posts).toHaveLength(0);
  });

  it('explains a file that was already imported', async () => {
    installFakeImportsApi(STAFF_USER, () =>
      json(409, { error: { code: 'conflict', message: 'This exact file was already imported (as "hsbc-august.csv" on 2026-09-01)', details: { batchId: 'b-old' } } }),
    );
    renderApp('/upload');
    await chooseBank(/HSBC/);
    await pickFile(csv());
    await userEvent.setup().click(screen.getByRole('button', { name: 'Upload and match' }));
    expect(await screen.findByText('Already imported')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('This exact file was already imported');
  });

  it('lists the columns the bank profile could not find', async () => {
    installFakeImportsApi(STAFF_USER, () =>
      json(400, { error: { code: 'bad_request', message: 'Missing required columns', details: { reason: 'missing_fields', missingFields: ['txn_date', 'amount'] } } }),
    );
    renderApp('/upload');
    await chooseBank(/HSBC/);
    await pickFile(csv());
    await userEvent.setup().click(screen.getByRole('button', { name: 'Upload and match' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText("This file does not match the bank's CSV layout")).toBeInTheDocument();
    expect(within(alert).getByText('Date')).toBeInTheDocument();
    expect(within(alert).getByText('Amount')).toBeInTheDocument();
  });

  it('lists unreadable rows as "Line N", capped with a count', async () => {
    const rowErrors = Array.from({ length: 23 }, (_, i) => ({ line: i + 2, error: 'invalid date' }));
    installFakeImportsApi(STAFF_USER, () => json(400, { error: { code: 'bad_request', message: '23 rows could not be read.', details: { rowErrors } } }));
    renderApp('/upload');
    await chooseBank(/HSBC/);
    await pickFile(csv());
    await userEvent.setup().click(screen.getByRole('button', { name: 'Upload and match' }));
    expect(await screen.findByText('Some rows could not be read')).toBeInTheDocument();
    expect(screen.getByText('Line 2:')).toBeInTheDocument();
    expect(screen.getByText('…and 3 more.')).toBeInTheDocument();
  });

  it('says when matching did not run after a successful import', async () => {
    installFakeImportsApi(STAFF_USER, () => json(201, { ...UPLOADED, matching: null }));
    renderApp('/upload');
    await chooseBank(/HSBC/);
    await pickFile(csv());
    await userEvent.setup().click(screen.getByRole('button', { name: 'Upload and match' }));
    expect(await screen.findByText('Matching did not run')).toBeInTheDocument();
  });

  it('shows matched / for-review counts per past import', async () => {
    installFakeImportsApi(STAFF_USER);
    renderApp('/upload');
    const table = await screen.findByRole('table', { name: 'Recent imports' });
    expect(await within(table).findByText('31 / 11')).toBeInTheDocument();
    expect(within(table).getByText('Sam Taylor')).toBeInTheDocument();
  });

  it('is view-only for readonly users', async () => {
    installFakeImportsApi({ ...STAFF_USER, role: 'readonly' });
    renderApp('/upload');
    expect(await screen.findByText('View only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload and match' })).toBeNull();
    expect(await screen.findByRole('table', { name: 'Recent imports' })).toBeInTheDocument();
  });
});
