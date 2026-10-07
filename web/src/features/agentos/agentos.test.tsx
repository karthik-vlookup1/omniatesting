import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { exportCsvUrl, isExportable, type IntakeLine } from './api';
import { LinesTable } from './LinesTable';

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
