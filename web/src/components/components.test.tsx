import { MantineProvider } from '@mantine/core';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api';
import { theme } from '../theme';
import {
  ConfirmDialog,
  DataTable,
  ErrorState,
  MaskedValue,
  PageHeader,
  SearchInput,
  StatusBadge,
  TablePagination,
  type DataTableColumn,
} from '.';

function renderUi(ui: ReactElement) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <MantineProvider theme={theme}>
      <MemoryRouter>{children}</MemoryRouter>
    </MantineProvider>
  );
  return render(ui, { wrapper: Wrapper });
}

interface Row {
  id: string;
  date: string;
  description: string;
  amount: string;
}

const rows: Row[] = [
  { id: 'a', date: '2026-10-01', description: 'HB PAYMENT T1234 BIRMINGHAM CITY COUNCIL HOUSING BENEFIT', amount: '450.00' },
  { id: 'b', date: '2026-10-02', description: 'SO RENT', amount: '120.50' },
];

const columns: DataTableColumn<Row>[] = [
  { key: 'date', header: 'Date', cell: (r) => r.date, sortable: true },
  { key: 'description', header: 'Description', cell: (r) => r.description, truncate: { tooltip: (r) => r.description } },
  { key: 'amount', header: 'Amount', cell: (r) => r.amount, align: 'right' },
];

describe('StatusBadge', () => {
  it('always shows the status as text', () => {
    renderUi(<StatusBadge tone="warning" label="Needs review" />);
    expect(screen.getByText('Needs review')).toBeInTheDocument();
  });
});

describe('PageHeader', () => {
  it('renders the title as the page heading with actions', () => {
    renderUi(<PageHeader title="Imports" description="Bank CSVs" actions={<button>Upload</button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Imports' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
  });
});

describe('DataTable', () => {
  it('renders headers, rows and right-aligned numbers', () => {
    renderUi(<DataTable data={rows} columns={columns} getRowId={(r) => r.id} caption="Bank transactions" />);
    const table = screen.getByRole('table', { name: 'Bank transactions' });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('450.00').closest('td')).toHaveStyle({ textAlign: 'right' });
  });

  it('shows the empty state for an empty list', () => {
    renderUi(
      <DataTable data={[]} columns={columns} getRowId={(r) => r.id} caption="Imports" empty={<p>No imports yet</p>} />,
    );
    expect(screen.getByText('No imports yet')).toBeInTheDocument();
  });

  it('shows a loading skeleton before the first data arrives', () => {
    renderUi(<DataTable data={undefined} loading columns={columns} getRowId={(r) => r.id} caption="Imports" />);
    expect(screen.getByRole('status', { name: 'Loading imports' })).toBeInTheDocument();
  });

  it('shows the error with a retry action', async () => {
    const onRetry = vi.fn();
    renderUi(
      <DataTable
        data={undefined}
        error={new ApiError({ status: 503, code: 'internal', message: '' })}
        onRetry={onRetry}
        columns={columns}
        getRowId={(r) => r.id}
        caption="Imports"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('opens rows by click and by keyboard', async () => {
    const onRowClick = vi.fn();
    renderUi(
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        caption="Bank transactions"
        onRowClick={onRowClick}
        rowLabel={(r) => `Open ${r.description}`}
      />,
    );
    const row = screen.getByRole('row', { name: 'Open SO RENT' });
    await userEvent.click(row);
    row.focus();
    await userEvent.keyboard('{Enter}');
    expect(onRowClick).toHaveBeenCalledTimes(2);
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });

  it('reports sort requests and marks the sorted column', async () => {
    const onSortChange = vi.fn();
    renderUi(
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        caption="Bank transactions"
        sort={{ key: 'date', direction: 'asc' }}
        onSortChange={onSortChange}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Date' })).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.click(screen.getByRole('button', { name: 'Date' }));
    expect(onSortChange).toHaveBeenCalledWith({ key: 'date', direction: 'desc' });
  });
});

describe('ConfirmDialog', () => {
  it('requires a reason before confirming when asked', async () => {
    const onConfirm = vi.fn();
    renderUi(
      <ConfirmDialog
        opened
        onClose={() => {}}
        onConfirm={onConfirm}
        title="Reverse receipt"
        message="This removes the receipt's allocations."
        confirmLabel="Reverse receipt"
        tone="danger"
        reasonLabel="Reason"
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Reverse receipt' });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: /Reason/ }), '  Paid into wrong account ');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('Paid into wrong account');
  });
});

describe('ErrorState', () => {
  it('shows the server message and the request reference', () => {
    renderUi(<ErrorState error={new ApiError({ status: 403, code: 'forbidden', message: 'No access', requestId: 'r-1' })} onRetry={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('No access');
    expect(screen.getByText('Ref r-1')).toBeInTheDocument();
  });
});

describe('MaskedValue', () => {
  it('shows only what the server sent', () => {
    renderUi(<MaskedValue kind="ni" value="•••••12C" />);
    expect(screen.getByLabelText('NI number, masked: •••••12C')).toBeInTheDocument();
  });

  it('shows a dash when nothing is recorded', () => {
    renderUi(<MaskedValue kind="account" value={null} />);
    expect(screen.getByLabelText('Payer account not recorded')).toHaveTextContent('—');
  });
});

describe('TablePagination', () => {
  it('summarises the visible range', () => {
    renderUi(<TablePagination page={2} pageSize={50} total={1240} onPageChange={() => {}} />);
    expect(screen.getByText('Showing 51–100 of 1,240')).toBeInTheDocument();
  });

  it('renders nothing for an empty list', () => {
    const { container } = renderUi(<TablePagination page={1} pageSize={50} total={0} onPageChange={() => {}} />);
    expect(container.querySelector('[aria-live]')).toBeNull();
    expect(screen.queryByText(/Showing/)).toBeNull();
  });
});

describe('SearchInput', () => {
  it('debounces typing and clears immediately', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onSearch = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderUi(<SearchInput value="" onSearch={onSearch} placeholder="Search TID or name" debounceMs={300} />);
    await user.type(screen.getByRole('searchbox', { name: 'Search TID or name' }), 'T1234');
    expect(onSearch).not.toHaveBeenCalledWith('T1234');
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onSearch).toHaveBeenLastCalledWith('T1234');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onSearch).toHaveBeenLastCalledWith('');
    vi.useRealTimers();
  });
});
