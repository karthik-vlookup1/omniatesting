import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import { exportCsvUrl, isExportable, poundsToPence, type IntakeLine } from './api';
import { JournalSection } from './JournalSection';
import { LinesTable } from './LinesTable';
import { TakePaymentSection } from './TakePaymentSection';

const line = (over: Partial<IntakeLine>): IntakeLine => ({
  id: 'id-1',
  lineNo: 2,
  receivedOn: '2026-09-01',
  tid: '9201',
  payerName: 'Alex Testperson',
  amountPence: 10000,
  paymentType: 'Cash',
  depositTo: 'Test Lettings - Client Account',
  description: '',
  warnings: [],
  matchStatus: 'matched',
  agentosTenantId: 'ten-1',
  postingStatus: 'not_ready',
  payerType: 'third_party',
  reference: null,
  receivingAccount: 'HSBC',
  ...over,
});

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <MantineProvider>
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    </MantineProvider>
  );
}

describe('isExportable', () => {
  it('only exports matched, linked, unexported lines', () => {
    expect(isExportable(line({}))).toBe(true);
    expect(isExportable(line({ postingStatus: 'ready' }))).toBe(true);
    expect(isExportable(line({ matchStatus: 'unmatched' }))).toBe(false);
    expect(isExportable(line({ matchStatus: 'ambiguous' }))).toBe(false);
    expect(isExportable(line({ agentosTenantId: null }))).toBe(false);
    expect(isExportable(line({ postingStatus: 'exported' }))).toBe(false);
    expect(isExportable(line({ postingStatus: 'posted' }))).toBe(false);
  });

  it('builds the CSV url under /api', () => {
    expect(exportCsvUrl('abc')).toBe('/api/agentos/exports/abc.csv');
  });
});

describe('LinesTable', () => {
  const lines = [
    line({}),
    line({ id: 'id-2', lineNo: 3, postingStatus: 'exported' }),
    line({ id: 'id-3', lineNo: 4, matchStatus: 'ambiguous', payerType: null, postingStatus: 'posted' }),
    line({ id: 'id-4', lineNo: 5, tid: null, reference: '•••••56C', payerType: 'tenant', receivingAccount: null }),
  ];

  it('shows actions to writers by posting status', async () => {
    const onReassign = vi.fn();
    render(<LinesTable lines={lines} writer onReassign={onReassign} />, { wrapper: Wrapper });
    expect(screen.getAllByRole('button', { name: 'Reassign TID' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Mark posted' })).toHaveLength(1);
    await userEvent.click(screen.getAllByRole('button', { name: 'Reassign TID' })[0]!);
    expect(onReassign).toHaveBeenCalledWith(lines[0]);
    expect(screen.getByTestId('line-4')).toHaveTextContent('Ambiguous');
    expect(screen.getByTestId('line-2')).toHaveTextContent('Council / third party');
    expect(screen.getByTestId('line-5')).toHaveTextContent('Tenant paid');
    expect(screen.getByTestId('line-5')).toHaveTextContent('•••••56C');
    expect(screen.getByTestId('line-5')).toHaveTextContent('Unknown account');
    expect(screen.getByTestId('line-2')).not.toHaveTextContent('Unknown account');
  });

  it('shows no actions to read-only users and an empty message for no lines', () => {
    const { rerender } = render(<LinesTable lines={lines} writer={false} onReassign={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<LinesTable lines={[]} writer onReassign={vi.fn()} />);
    expect(screen.getByText('No lines with this status')).toBeInTheDocument();
  });
});

describe('poundsToPence', () => {
  it('converts with integer maths and rejects bad input', () => {
    expect(poundsToPence('12.34')).toBe(1234);
    expect(poundsToPence('0.1')).toBe(10);
    expect(poundsToPence('-4')).toBe(-400);
    expect(poundsToPence(1.15)).toBe(115);
    expect(poundsToPence('1.234')).toBeNull();
    expect(poundsToPence('abc')).toBeNull();
  });
});

const TENANTS = [
  { id: 'u1', tid: '9201', name: '9201 Alex Testperson' },
  { id: 'u2', tid: '9202', name: '9202 Mary Jo Testson' },
];

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = handler(String(url), init);
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

const apiHandler = (url: string): unknown => {
  if (url.includes('/agentos/tenants')) return { tenants: TENANTS };
  if (url.includes('/agentos/journal/transfers')) return { transfers: [] };
  if (url.includes('/agentos/payments/options'))
    return { depositAccounts: [{ code: 'E2E_CLIENT', label: 'Client' }], paymentTypes: [{ code: 'CARD', label: 'Card' }] };
  if (url.includes('/agentos/payments')) return { payments: [] };
  if (url.includes('/agentos/ledger/')) return { tid: '9201', balancePence: 500, postings: [] };
  return {};
};

describe('JournalSection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('hides the form from users who cannot post', async () => {
    stubFetch(apiHandler);
    render(<JournalSection writer={false} />, { wrapper: Wrapper });
    expect(await screen.findByText('No journal transfers yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create transfer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add row' })).toBeNull();
  });

  it('enables submit only when 2+ rows total 0.00, and supports add and remove row', async () => {
    stubFetch(apiHandler);
    render(<JournalSection writer />, { wrapper: Wrapper });
    const submit = await screen.findByRole('button', { name: 'Create transfer' });
    expect(screen.getByTestId('journal-total')).toHaveTextContent('£0.00');
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Amount 1'), '-5.00');
    await userEvent.type(screen.getByLabelText('Amount 2'), '3.00');
    expect(screen.getByTestId('journal-total')).toHaveTextContent('-£2.00');
    await userEvent.click(screen.getByRole('button', { name: 'Add row' }));
    await userEvent.type(screen.getByLabelText('Amount 3'), '2.00');
    expect(screen.getByTestId('journal-total')).toHaveTextContent('£0.00');
    expect(screen.getAllByRole('button', { name: 'Remove row' })).toHaveLength(3);
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove row' })[2]!);
    expect(screen.getAllByRole('button', { name: 'Remove row' })[0]).toBeDisabled();
    expect(submit).toBeDisabled();
  });
});

describe('TakePaymentSection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the table but no form to read-only users', async () => {
    stubFetch(apiHandler);
    render(<TakePaymentSection writer={false} />, { wrapper: Wrapper });
    expect(await screen.findByText('No payments yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Take payment' })).toBeNull();
    expect(screen.queryByLabelText('Amount (£)')).toBeNull();
  });

  it('requires a tenant and a valid 2dp amount before taking a payment', async () => {
    stubFetch(apiHandler);
    render(<TakePaymentSection writer />, { wrapper: Wrapper });
    const submit = await screen.findByRole('button', { name: 'Take payment' });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Amount (£)'), '1.234');
    expect(screen.getByText('Enter an amount with up to 2 decimal places')).toBeInTheDocument();
    expect(submit).toBeDisabled();
    expect(api.gbp(1234)).toBe('£12.34');
  });
});
