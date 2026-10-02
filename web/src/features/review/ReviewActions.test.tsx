import { notifications } from '@mantine/notifications';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STAFF_USER, installFakeAuthApi, renderApp } from '../../app/testing';
import type { AuthUser } from '../../data/auth';
import type { TenancySummary } from '../../data/tenancies';
import type { BankLine } from '../../data/transactions';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function line(n: number, patch: Partial<BankLine> = {}): BankLine {
  return {
    id: id(n),
    bankCode: 'HSBC',
    importBatchId: id(900),
    txnDate: '2026-09-15',
    amount: '450.00',
    remaining: '450.00',
    description: `RENT LINE ${n}`,
    reference: `REF ${n}`,
    counterparty: 'J SMITH',
    payerAccountLast4: null,
    extractedTid: null,
    status: 'needs_review',
    exclusionReason: null,
    note: null,
    suggestions: [
      { id: id(100 + n), tid: 'T1234', tenantName: 'Jordan Smith', payer: 'council_hb', method: 'ni_in_reference', confidence: 0.6, reason: 'NI matches two live tenancies', status: 'open' },
      { id: id(200 + n), tid: 'T1235', tenantName: 'Jordan Smith', payer: 'tenant', method: 'ni_in_reference', confidence: 0.6, reason: null, status: 'open' },
    ],
    receipts: [],
    ...patch,
  };
}

const PICKABLE: TenancySummary = {
  tid: 'T9999',
  status: 'active',
  startDate: '2025-01-01',
  endDate: null,
  managementType: 'RG',
  tenantName: 'Casey Jones',
  niMasked: '•••••99A',
  propertyRef: 'P-1',
  unitRef: null,
  postcode: 'B2 2BB',
  address: '2 Sample Road',
  branchCode: 'BHM',
  rent: null,
};

/** Fake of /api/matching (lines + actions) and /api/tenancies search, with backend state rules. */
function installFakeReviewApi(user: AuthUser, initial: BankLine[]) {
  installFakeAuthApi({ sessionUser: user });
  const authFetch = globalThis.fetch;
  const lines = initial.map((l) => structuredClone(l));
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  const OPEN = ['needs_review', 'yet_to_take', 'partially_matched'];

  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      if (url.pathname === '/api/bank-accounts') return json(200, { bankAccounts: [] });
      if (url.pathname === '/api/tenancies') return json(200, { tenancies: (url.searchParams.get('q') ?? '').toUpperCase().startsWith('T9') ? [PICKABLE] : [] });
      if (url.pathname === '/api/matching/lines') {
        const status = url.searchParams.get('status') ?? 'open';
        const rows = lines.filter((l) => (status === 'open' ? OPEN.includes(l.status) : l.status === status));
        return json(200, { lines: rows, total: rows.length });
      }
      const m = url.pathname.match(/^\/api\/matching\/lines\/([^/]+)(\/.*)?$/);
      if (!m) return authFetch(input, init);
      const l = lines.find((x) => x.id === m[1]);
      if (!l) return json(404, { error: { code: 'not_found', message: 'No such bank line' } });
      if (method === 'GET') return json(200, { line: l });
      if (user.role === 'readonly') return json(403, { error: { code: 'forbidden', message: 'You do not have permission to do this' } });
      posts.push({ path: m[2] ?? '', body });

      if (m[2] === '/confirm') {
        let tid: string;
        let payer: string;
        if (body.suggestionId) {
          const s = l.suggestions.find((x) => x.id === body.suggestionId)!;
          s.status = 'accepted';
          tid = s.tid;
          payer = (body.payer as string) ?? s.payer;
        } else {
          tid = body.tid as string;
          if (tid !== 'T9999') return json(400, { error: { code: 'bad_request', message: `No tenancy with TID ${tid}` } });
          payer = (body.payer as string) ?? 'tenant';
        }
        const amount = (body.amount as string) ?? l.remaining;
        const left = (Number(l.remaining) - Number(amount)).toFixed(2);
        l.receipts.push({ id: `r-${l.receipts.length}`, tid, payer: payer as BankLine['receipts'][0]['payer'], amount, ledgerCode: '001', matchedVia: 'manual', matchedBy: user.fullName });
        l.remaining = left;
        l.status = Number(left) === 0 ? 'matched' : 'partially_matched';
        return json(200, { line: l });
      }
      const rj = m[2]?.match(/^\/suggestions\/([^/]+)\/reject$/);
      if (rj) {
        l.suggestions.find((x) => x.id === rj[1])!.status = 'rejected';
        if (!l.suggestions.some((x) => x.status === 'open')) l.status = 'yet_to_take';
        return json(200, { line: l });
      }
      if (m[2] === '/exclude') {
        l.status = 'excluded';
        l.exclusionReason = body.reason as string;
        return json(200, { line: l });
      }
      if (m[2] === '/include') {
        l.status = 'needs_review';
        l.exclusionReason = null;
        return json(200, { line: l });
      }
      return json(404, { error: { code: 'not_found', message: 'Not found' } });
    }),
  );
  return { lines, posts };
}

afterEach(() => {
  vi.unstubAllGlobals();
  notifications.clean();
});

async function openLine(name: string) {
  const drawer = await screen.findByRole('dialog', { name });
  return within(drawer);
}

describe('Review actions', { timeout: 20_000 }, () => {
  it('accepts the top suggestion with server defaults, then moves to the next line', async () => {
    const api = installFakeReviewApi(STAFF_USER, [line(1), line(2)]);
    const { router } = renderApp(`/review?line=${id(1)}`);
    const user = userEvent.setup();
    const d = await openLine('RENT LINE 1');
    await user.click(d.getByRole('button', { name: 'Accept T1234' }));
    const form = d.getByRole('form', { name: 'Confirm match to T1234' });
    expect(within(form).getByRole('textbox', { name: /Amount/ })).toHaveValue('450.00');
    expect(within(form).getByRole('combobox', { name: /Payer/ })).toHaveValue('Council (Housing Benefit)');
    await user.click(within(form).getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Match confirmed')).toBeInTheDocument();
    expect(api.posts[0]).toEqual({ path: '/confirm', body: { remember: false, suggestionId: id(101) } });
    await waitFor(() => expect(router.state.location.search).toContain(`line=${id(2)}`));
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Bank lines' })).queryByText('RENT LINE 1')).toBeNull());
  });

  it('confirms a part payment and validates the amount first', async () => {
    const api = installFakeReviewApi(STAFF_USER, [line(1)]);
    renderApp(`/review?line=${id(1)}`);
    const user = userEvent.setup();
    const d = await openLine('RENT LINE 1');
    await user.click(d.getByRole('button', { name: 'Accept T1234' }));
    const amount = d.getByRole('textbox', { name: /Amount/ });
    await user.clear(amount);
    await user.type(amount, '500');
    await user.click(d.getByRole('button', { name: 'Confirm' }));
    expect(await d.findByText('Cannot be more than the £450.00 remaining')).toBeInTheDocument();
    expect(api.posts).toHaveLength(0);
    await user.clear(amount);
    await user.type(amount, '200.00');
    await user.click(d.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(api.posts[0]?.body).toEqual({ remember: false, suggestionId: id(101), amount: '200.00' }));
    expect(api.lines[0]!.status).toBe('partially_matched');
  });

  it('offers "remember this payer" only when the line has a payer account', async () => {
    const api = installFakeReviewApi(STAFF_USER, [line(1, { payerAccountLast4: '4321' })]);
    renderApp(`/review?line=${id(1)}`);
    const user = userEvent.setup();
    const d = await openLine('RENT LINE 1');
    await user.click(d.getByRole('button', { name: 'Accept T1235' }));
    await user.click(d.getByRole('checkbox', { name: /Remember this payer account \(••••4321\)/ }));
    await user.click(d.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(api.posts[0]?.body).toEqual({ remember: true, suggestionId: id(201) }));
  });

  it('leads with "pick another tenancy" for yet-to-take lines and confirms by TID', async () => {
    const api = installFakeReviewApi(STAFF_USER, [line(3, { status: 'yet_to_take', suggestions: [] })]);
    renderApp(`/review?line=${id(3)}`);
    const user = userEvent.setup();
    const d = await openLine('RENT LINE 3');
    expect(d.getByText('Pick another tenancy')).toBeInTheDocument();
    await user.type(d.getByRole('searchbox', { name: 'Find a tenancy' }), 'T99');
    await user.click(await d.findByRole('option', { name: 'Choose T9999, Casey Jones' }));
    await user.click(d.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(api.posts[0]?.body).toEqual({ remember: false, tid: 'T9999', payer: 'tenant' }));
    expect(api.lines[0]!.status).toBe('matched');
  });

  it('shows the server message inline when a confirm is refused', async () => {
    installFakeReviewApi(STAFF_USER, [line(1)]);
    renderApp(`/review?line=${id(1)}`);
    const user = userEvent.setup();
    const d = await openLine('RENT LINE 1');
    await user.click(d.getByRole('button', { name: 'Pick another tenancy' }));
    await user.type(d.getByRole('searchbox', { name: 'Find a tenancy' }), 'T99');
    await user.click(await d.findByRole('option', { name: /Choose T9999/ }));
    // Simulate the tenancy disappearing between search and confirm.
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const original = fetchMock.getMockImplementation() as typeof fetch;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith('/confirm') ? Promise.resolve(json(400, { error: { code: 'bad_request', message: 'No tenancy with TID T9999' } })) : original(input, init),
    );
    await user.click(d.getByRole('button', { name: 'Confirm' }));
    expect(await d.findByText('No tenancy with TID T9999')).toBeInTheDocument();
  });

  it('rejecting the last suggestion makes the line yet to take and opens the picker', async () => {
    const api = installFakeReviewApi(STAFF_USER, [line(1, { suggestions: [line(1).suggestions[0]!] })]);
    renderApp(`/review?line=${id(1)}`);
    const user = userEvent.setup();
    const d = await openLine('RENT LINE 1');
    await user.click(d.getByRole('button', { name: 'Reject T1234' }));
    expect(await screen.findByText(/No suggestions left: the line is now yet to take/)).toBeInTheDocument();
    expect(api.posts[0]?.path).toBe(`/suggestions/${id(101)}/reject`);
    expect(await d.findByRole('searchbox', { name: 'Find a tenancy' })).toBeInTheDocument();
  });

  it('excludes with a reason, and includes again from the Excluded tab', async () => {
    const api = installFakeReviewApi(STAFF_USER, [line(1)]);
    const { router } = renderApp(`/review?line=${id(1)}`);
    const user = userEvent.setup();
    const d = await openLine('RENT LINE 1');
    await user.click(d.getByRole('button', { name: 'Exclude' }));
    await user.click(d.getByRole('button', { name: 'Exclude line' }));
    expect(await d.findByText('Give a reason (at least 2 characters)')).toBeInTheDocument();
    await user.click(d.getByLabelText('Bank charge'));
    await user.click(d.getByRole('button', { name: 'Exclude line' }));
    expect(await screen.findByText('Line excluded')).toBeInTheDocument();
    expect(api.posts[0]).toEqual({ path: '/exclude', body: { reason: 'Bank charge' } });

    await router.navigate(`/review?status=excluded&line=${id(1)}`);
    const again = await openLine('RENT LINE 1');
    await user.click(await again.findByRole('button', { name: 'Include again' }));
    expect(await screen.findByText('Line included again')).toBeInTheDocument();
    expect(api.posts[1]?.path).toBe('/include');
  });

  it('opens the confirm form for the top suggestion with the a key', async () => {
    installFakeReviewApi(STAFF_USER, [line(1)]);
    renderApp(`/review?line=${id(1)}`);
    await openLine('RENT LINE 1');
    await userEvent.setup().keyboard('a');
    expect(await screen.findByRole('form', { name: 'Confirm match to T1234' })).toBeInTheDocument();
  });

  it('only allows excluding money going out', async () => {
    installFakeReviewApi(STAFF_USER, [line(4, { amount: '-25.00', remaining: '-25.00', suggestions: [], status: 'yet_to_take' })]);
    renderApp(`/review?line=${id(4)}`);
    const d = await openLine('RENT LINE 4');
    expect(d.getByText(/Money going out cannot be matched to rent/)).toBeInTheDocument();
    expect(d.queryByRole('button', { name: 'Pick another tenancy' })).toBeNull();
    expect(d.getByRole('button', { name: 'Exclude' })).toBeInTheDocument();
  });

  it('shows read-only users the suggestions without any action', async () => {
    installFakeReviewApi({ ...STAFF_USER, role: 'readonly' }, [line(1)]);
    renderApp(`/review?line=${id(1)}`);
    const d = await openLine('RENT LINE 1');
    expect(d.getAllByText('T1234').length).toBeGreaterThan(0);
    expect(d.queryByRole('button', { name: /Accept|Reject|Exclude|Pick another/ })).toBeNull();
    expect(d.getByText('Your role can view lines but not decide them.')).toBeInTheDocument();
  });
});
