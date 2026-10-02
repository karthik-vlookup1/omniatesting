import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STAFF_USER, installFakeAuthApi, renderApp } from '../../app/testing';
import type { AuthUser } from '../../data/auth';
import type { BankLine } from '../../data/transactions';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const HSBC_ID = '11111111-1111-4111-8111-111111111111';
const BATCH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function line(i: number, patch: Partial<BankLine> = {}): BankLine {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    bankCode: 'HSBC',
    importBatchId: BATCH,
    txnDate: '2026-09-15',
    amount: '450.00',
    remaining: '450.00',
    description: `BGC RENT LINE ${i}`,
    reference: `REF ${i}`,
    counterparty: 'J SMITH',
    payerAccountLast4: '1234',
    extractedTid: null,
    status: 'needs_review',
    exclusionReason: null,
    note: null,
    suggestions: [
      { id: `s-${i}`, tid: 'T1234', tenantName: 'Jordan Smith', payer: 'tenant', method: 'ni_in_reference', confidence: 0.6, reason: 'NI number matches two live tenancies', status: 'open' },
    ],
    receipts: [],
    ...patch,
  };
}

const OPEN = [line(1), line(2, { status: 'yet_to_take', suggestions: [], description: 'UNKNOWN PAYMENT' }), line(3)];
const MATCHED = [
  line(4, {
    status: 'matched',
    remaining: '0.00',
    suggestions: [{ id: 's-4', tid: 'T5555', tenantName: 'Ava Brown', payer: 'council_hb', method: 'tid_in_reference', confidence: 1, reason: 'TID T5555 found in reference', status: 'accepted' }],
    receipts: [{ id: 'r-4', tid: 'T5555', payer: 'council_hb', amount: '450.00', ledgerCode: '001', matchedVia: 'tid_in_reference', matchedBy: null }],
  }),
];
const OUT = [line(5, { status: 'excluded', amount: '-12.00', remaining: '-12.00', exclusionReason: 'Bank charge', suggestions: [] })];

/** Fake of GET /api/matching/lines(/:id) and /api/bank-accounts, filtering like the backend. */
function installFakeLinesApi(options: { open?: BankLine[]; total?: number; user?: AuthUser } = {}) {
  installFakeAuthApi({ sessionUser: options.user ?? STAFF_USER });
  const authFetch = globalThis.fetch;
  const open = options.open ?? OPEN;
  const all = [...open, ...MATCHED, ...OUT];
  const queries: URLSearchParams[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
      if (url.pathname === '/api/bank-accounts') {
        return json(200, { bankAccounts: [{ id: HSBC_ID, code: 'HSBC', bankName: 'HSBC', accountName: 'Rent account', isActive: true, profile: null }] });
      }
      if (url.pathname === '/api/matching/lines') {
        queries.push(url.searchParams);
        const status = url.searchParams.get('status') ?? 'open';
        const rows = status === 'open' ? open : all.filter((l) => l.status === status);
        return json(200, { lines: rows, total: options.total ?? rows.length });
      }
      const m = url.pathname.match(/^\/api\/matching\/lines\/([^/]+)$/);
      if (m) {
        const hit = all.find((l) => l.id === m[1]);
        return hit ? json(200, { line: hit }) : json(404, { error: { code: 'not_found', message: 'No such bank line' } });
      }
      return authFetch(input, init);
    }),
  );
  return { queries };
}

afterEach(() => vi.unstubAllGlobals());

describe('Review queue list', { timeout: 15_000 }, () => {
  it('lists open lines by default with the best suggestion and status', async () => {
    const api = installFakeLinesApi();
    renderApp('/review');
    const table = await screen.findByRole('table', { name: 'Bank lines' });
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(api.queries[0]?.toString()).toBe('status=open&limit=50&offset=0');
    const first = within(table).getByRole('row', { name: /BGC RENT LINE 1/ });
    expect(within(first).getByText('15/09/2026')).toBeInTheDocument();
    expect(within(first).getByText('T1234')).toBeInTheDocument();
    expect(within(first).getByText('60%')).toBeInTheDocument();
    expect(within(first).getByText('Needs review')).toBeInTheDocument();
    expect(within(table).getByText('No suggestion')).toBeInTheDocument();
    expect(screen.getByText('3 lines')).toBeInTheDocument();
  });

  it('filters by status and bank through the URL', async () => {
    const api = installFakeLinesApi();
    const { router } = renderApp('/review');
    const user = userEvent.setup();
    await screen.findByRole('table', { name: 'Bank lines' });
    await user.click(screen.getByRole('radio', { name: 'Excluded' }));
    await waitFor(() => expect(router.state.location.search).toBe('?status=excluded'));
    expect((await screen.findAllByText('−£12.00')).length).toBe(2);
    await user.click(screen.getByRole('combobox', { name: 'Bank' }));
    await user.click(await screen.findByRole('option', { name: /HSBC · Rent account/ }));
    await waitFor(() => expect(api.queries.at(-1)?.get('bankAccountId')).toBe(HSBC_ID));
    expect(router.state.location.search).toContain(`bank=${HSBC_ID}`);
  });

  it('shows and clears the one-import filter from an upload link', async () => {
    const api = installFakeLinesApi();
    const { router } = renderApp(`/review?batchId=${BATCH}`);
    expect(await screen.findByText('One import only')).toBeInTheDocument();
    expect(api.queries[0]?.get('batchId')).toBe(BATCH);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show all imports' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('ignores malformed URL filters instead of sending them', async () => {
    const api = installFakeLinesApi();
    renderApp('/review?status=bogus&bank=not-a-uuid&page=-3');
    await screen.findByRole('table', { name: 'Bank lines' });
    expect(api.queries[0]?.toString()).toBe('status=open&limit=50&offset=0');
  });

  it('pages through long queues 50 at a time', async () => {
    const api = installFakeLinesApi({ total: 120 });
    renderApp('/review');
    await screen.findByRole('table', { name: 'Bank lines' });
    expect(screen.getByText('Showing 1–50 of 120')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => expect(api.queries.at(-1)?.get('offset')).toBe('50'));
  });

  it('says what to do when there is nothing to review', async () => {
    installFakeLinesApi({ open: [] });
    renderApp('/review');
    expect(await screen.findByText('Nothing to review')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Bank lines' })).getByRole('link', { name: 'Upload statement' })).toBeInTheDocument();
  });
});

describe('Line drawer (read-only)', { timeout: 15_000 }, () => {
  // Since fe-103 writers get review actions here; read-only users must still get none.
  it('opens a line with its facts and suggestions, without actions for read-only users', async () => {
    installFakeLinesApi({ user: { ...STAFF_USER, role: 'readonly' } });
    const { router } = renderApp('/review');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('row', { name: /BGC RENT LINE 1/ }));
    const drawer = await screen.findByRole('dialog', { name: 'BGC RENT LINE 1' });
    expect(router.state.location.search).toContain(`line=${OPEN[0]!.id}`);
    expect(within(drawer).getByText('REF 1')).toBeInTheDocument();
    expect(within(drawer).getByLabelText('Payer account, masked: ••••1234')).toBeInTheDocument();
    expect(within(drawer).getByText(/NI number matches two live tenancies/)).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: /Accept/ })).toBeNull();
  });

  it('moves between lines with j and k', async () => {
    installFakeLinesApi();
    const { router } = renderApp(`/review?line=${OPEN[0]!.id}`);
    const user = userEvent.setup();
    await screen.findByRole('dialog', { name: 'BGC RENT LINE 1' });
    await user.keyboard('j');
    await waitFor(() => expect(router.state.location.search).toContain(`line=${OPEN[1]!.id}`));
    expect(await screen.findByRole('dialog', { name: 'UNKNOWN PAYMENT' })).toBeInTheDocument();
    await user.keyboard('k');
    await waitFor(() => expect(router.state.location.search).toContain(`line=${OPEN[0]!.id}`));
  });

  it('shows receipts and who matched them', async () => {
    installFakeLinesApi();
    renderApp(`/review?status=matched&line=${MATCHED[0]!.id}`);
    const drawer = await screen.findByRole('dialog', { name: /BGC RENT LINE 4/ });
    expect(await within(drawer).findByText(/Matched automatically · TID in reference · Ledger 001/)).toBeInTheDocument();
    expect(within(drawer).getByText('Accepted')).toBeInTheDocument();
  });
});
