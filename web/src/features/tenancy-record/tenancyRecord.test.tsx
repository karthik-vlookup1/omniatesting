import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { STAFF_USER, installFakeAuthApi, renderApp } from '../../app/testing';
import type { AuthUser } from '../../data/auth';
import type { TenancyDetail } from '../../data/tenancies';
import type { ReceiptSummary } from '../receipts/api';
import type { RentAccount } from '../rent-terms/api';
import { agentosTid, currentSchedule, lastReceipt, parseDetailsTab, parseView, totalBalancePence } from './recordModel';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const TENANCY: TenancyDetail = {
  tid: 'T1234',
  status: 'active',
  startDate: '2025-04-01',
  endDate: null,
  managementType: 'MG',
  tenantName: 'Jordan Smith',
  niMasked: '•••••12C',
  propertyRef: 'P-0042',
  unitRef: 'Flat 2',
  postcode: 'B1 1AA',
  address: '1 Example Street, Birmingham',
  branchCode: 'BHM',
  rent: { amount: '650.00', frequency: 'monthly' },
};

const ACCOUNT: RentAccount = {
  tenancy: { id: 'ten-1', tid: 'T1234', startDate: '2025-04-01', endDate: null, status: 'active', chargesFrom: '2025-04-01' },
  schedules: [{ id: 's1', amountPence: 65000, frequency: 'monthly', effectiveFrom: '2025-04-01', effectiveTo: null, reason: null }],
  awards: [],
  splits: [],
  paymentMethods: [],
  periods: [{ periodStart: '2025-04-01', periodEnd: '2025-04-30', dueDate: '2025-04-01', byPayer: { tenant: 65000 }, totalPence: 65000 }],
  payers: [
    {
      payer: 'tenant',
      chargedPence: 130000,
      receivedPence: 42678,
      adjustmentsPence: 0,
      balancePence: 87322,
      lines: [
        { date: '2025-04-01', kind: 'charge', description: 'Rent April', amountPence: 65000, balancePence: 65000 },
        { date: '2025-05-01', kind: 'charge', description: 'Rent May', amountPence: 65000, balancePence: 130000 },
        { date: '2025-05-03', kind: 'receipt', description: 'Payment received', amountPence: -42678, balancePence: 87322 },
      ],
    },
  ],
};

const RECEIPT: ReceiptSummary = {
  id: 'r1',
  tid: 'T1234',
  tenancyId: 'ten-1',
  payer: 'tenant',
  amountPence: 42678,
  receivedOn: '2025-05-03',
  status: 'active',
  matchedVia: 'tid_in_reference',
  allocationMode: 'auto',
  allocatedPence: 42678,
  bankTransactionId: null,
  xeroState: 'none',
  vicoExported: false,
};

/** Fakes the record's endpoints (tenancy, rent, receipts, adjustments, payer accounts, agentOS). */
function installRecordApi(user: AuthUser) {
  installFakeAuthApi({ sessionUser: user });
  const authFetch = globalThis.fetch;
  const posts: { path: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
      const method = init?.method ?? 'GET';
      if (method === 'POST' && !url.pathname.startsWith('/api/auth')) {
        posts.push({ path: url.pathname, body: JSON.parse(String(init?.body ?? '{}')) });
      }
      if (url.pathname === '/api/tenancies/T1234') return json(200, { tenancy: TENANCY });
      if (url.pathname.startsWith('/api/tenancies/')) return json(404, { error: { code: 'not_found', message: 'Tenancy not found' } });
      if (url.pathname === '/api/rent/T1234') return json(200, { account: ACCOUNT });
      if (url.pathname === '/api/receipts') return json(200, { receipts: [RECEIPT], total: 1, page: 1, pageSize: 50 });
      if (url.pathname === '/api/adjustments' && method === 'GET') return json(200, { tid: 'T1234', balances: [], adjustments: [] });
      if (url.pathname === '/api/adjustments' && method === 'POST') return json(201, { tid: 'T1234', balances: [], adjustments: [] });
      if (url.pathname === '/api/payer-accounts') return json(200, { payerAccounts: [] });
      if (url.pathname === '/api/agentos/tenants') return json(200, { tenants: [{ id: 'a1', tid: '1234', name: 'Jordan Smith', depositTo: 'ISL Client Account' }] });
      return authFetch(input, init);
    }),
  );
  return { posts };
}

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('record model helpers', () => {
  it('reads the view and tab from the URL, falling back to the defaults', () => {
    expect(parseView('receipts')).toBe('receipts');
    expect(parseView('nonsense')).toBe('overview');
    expect(parseView(null)).toBe('overview');
    expect(parseDetailsTab('bank')).toBe('bank');
    expect(parseDetailsTab('crm')).toBe('personal');
  });

  it('adds up the server balances and picks the latest active receipt', () => {
    expect(totalBalancePence(ACCOUNT)).toBe(87322);
    expect(totalBalancePence(undefined)).toBeNull();
    const older = { ...RECEIPT, id: 'r0', receivedOn: '2025-01-01' };
    const reversed = { ...RECEIPT, id: 'r9', receivedOn: '2026-01-01', status: 'reversed' as const };
    expect(lastReceipt([older, RECEIPT, reversed])?.id).toBe('r1');
    expect(lastReceipt([])).toBeNull();
  });

  it('finds the schedule in force today and strips the T for agentOS', () => {
    expect(currentSchedule(ACCOUNT, '2026-01-01')?.amountPence).toBe(65000);
    expect(currentSchedule({ ...ACCOUNT, schedules: [] }, '2026-01-01')).toBeNull();
    expect(agentosTid('T6568')).toBe('6568');
    expect(agentosTid('6568')).toBe('6568');
  });
});

// The record page is a large lazy route; compiling it the first time in a busy parallel run can take
// longer than the 3 s query wait, so it is loaded once up front and these tests get more time.
const FIRST_RENDER = { timeout: 10_000 };

describe('tenant record page', { timeout: 20_000 }, () => {
  beforeAll(async () => {
    await import('./TenancyRecordPage');
  }, 30_000);

  it('shows the LetMC-style header, balance, rent chase and agentOS cards, and opens a record tab', async () => {
    installRecordApi({ ...STAFF_USER, role: 'accounts' });
    renderApp('/tenancies/T1234');
    expect(await screen.findByRole('heading', { name: 'T1234 Jordan Smith', level: 1 }, FIRST_RENDER)).toBeInTheDocument();
    expect(await screen.findByTestId('record-balance')).toHaveTextContent('£873.22');
    const chase = screen.getByRole('region', { name: 'Rent chase' });
    expect(await within(chase).findByText(/£426\.78 \(Tenant\) received on 03\/05\/2025/)).toBeInTheDocument();
    expect(await within(screen.getByRole('region', { name: 'agentOS' })).findByText('ISL Client Account')).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Open records' })).getByRole('link', { name: /T1234 Jordan Smith/ })).toHaveAttribute('aria-current', 'page');
  });

  it('gives a read-only user no actions', async () => {
    installRecordApi({ ...STAFF_USER, role: 'readonly' });
    renderApp('/tenancies/T1234');
    expect(await screen.findByRole('heading', { name: 'T1234 Jordan Smith', level: 1 }, FIRST_RENDER)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions' })).toBeDisabled();
  });

  it('says plainly when the TID does not exist', async () => {
    installRecordApi(STAFF_USER);
    renderApp('/tenancies/T0000');
    expect(await screen.findByText('No tenancy T0000', {}, FIRST_RENDER)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to tenancies' })).toHaveAttribute('href', '/tenancies');
  });

  it('applies a refund only after field checks and a confirmation, sending pence to the server', async () => {
    const { posts } = installRecordApi({ ...STAFF_USER, role: 'accounts' });
    const user = userEvent.setup();
    renderApp('/tenancies/T1234');
    await screen.findByRole('heading', { name: 'T1234 Jordan Smith', level: 1 }, FIRST_RENDER);

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Apply refund' }));
    const dialog = await screen.findByRole('dialog', { name: /Refund — T1234 Jordan Smith/ });
    await user.click(within(dialog).getByRole('button', { name: 'Apply refund' }));
    expect(await within(dialog).findByText('Enter an amount in pounds, e.g. 25 or 25.50')).toBeInTheDocument();
    expect(within(dialog).getByText('Give a reason of at least 3 characters')).toBeInTheDocument();
    expect(posts).toHaveLength(0);

    await user.type(within(dialog).getByRole('textbox', { name: /Amount/ }), '25.50');
    await user.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Overpayment returned');
    await user.click(within(dialog).getByRole('button', { name: 'Apply refund' }));
    const confirm = await screen.findByRole('dialog', { name: 'Apply this refund?' });
    await user.click(within(confirm).getByRole('button', { name: 'Apply refund' }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      path: '/api/adjustments',
      body: { tid: 'T1234', payer: 'tenant', kind: 'refund', amountPence: 2550, reason: 'Overpayment returned' },
    });
    expect(await screen.findByText('Refund saved')).toBeInTheDocument();
  });
});
