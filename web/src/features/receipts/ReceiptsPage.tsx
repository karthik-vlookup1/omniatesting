import { Button, NativeSelect, TextInput } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import { IconArrowsSplit2 } from '@tabler/icons-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataTable, EmptyState, FilterBar, PageHeader, StatusBadge, TablePagination, type DataTableColumn } from '../../components';
import { formatDate } from '../../lib/format';
import { formatPence } from '../rent-terms/money';
import { PAYER_LABEL, XERO_LABEL, useReceipts, type ReceiptFilters, type ReceiptSummary } from './api';
import { AdjustmentsPanel } from './AdjustmentsPanel';
import { ReceiptDrawer } from './ReceiptDrawer';
import { SplitLineModal } from './SplitLineModal';

const columns: DataTableColumn<ReceiptSummary>[] = [
  { key: 'tid', header: 'TID', cell: (r) => r.tid },
  { key: 'payer', header: 'Payer', cell: (r) => PAYER_LABEL[r.payer] },
  { key: 'amount', header: 'Amount', align: 'right', cell: (r) => formatPence(r.amountPence) },
  { key: 'received', header: 'Received', cell: (r) => formatDate(r.receivedOn) },
  {
    key: 'status',
    header: 'Status',
    cell: (r) => <StatusBadge tone={r.status === 'active' ? 'success' : 'neutral'} label={r.status === 'active' ? 'Active' : 'Reversed'} />,
  },
  { key: 'xero', header: 'Xero', cell: (r) => XERO_LABEL[r.xeroState] },
  { key: 'vico', header: 'Vico', cell: (r) => (r.vicoExported ? 'Exported' : 'Not exported') },
  { key: 'allocation', header: 'Allocation', cell: (r) => (r.allocationMode === 'manual' ? 'By hand' : 'Automatic') },
];

/** Receipts: split a bank line, pin allocations, reverse a receipt, record write-offs and refunds. */
export function ReceiptsPage() {
  useDocumentTitle('Receipts · Omnia Recon');
  const [params, setParams] = useSearchParams();
  const lineParam = params.get('line') ?? '';
  const [filters, setFilters] = useState<ReceiptFilters>({ tid: '', status: '', page: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [splitOpen, setSplitOpen] = useState(lineParam !== '');
  const list = useReceipts(filters);
  const active = filters.tid !== '' || filters.status !== '';

  const closeSplit = () => {
    setSplitOpen(false);
    if (lineParam) {
      const next = new URLSearchParams(params);
      next.delete('line');
      setParams(next, { replace: true });
    }
  };

  return (
    <>
      <PageHeader
        title="Receipts"
        description="Split a bank line between tenancies, change how a receipt is allocated, reverse a receipt, or write off and refund."
        actions={
          <Button leftSection={<IconArrowsSplit2 size={16} aria-hidden />} onClick={() => setSplitOpen(true)}>
            Split a bank line
          </Button>
        }
      />
      <FilterBar active={active} onReset={() => setFilters({ tid: '', status: '', page: 1 })}>
        <TextInput label="TID" placeholder="T1234" value={filters.tid} onChange={(e) => setFilters({ ...filters, tid: e.currentTarget.value, page: 1 })} w={140} />
        <NativeSelect
          label="Status"
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.currentTarget.value as ReceiptFilters['status'], page: 1 })}
          data={[
            { value: '', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'reversed', label: 'Reversed' },
          ]}
        />
      </FilterBar>
      <DataTable
        caption="Receipts"
        data={list.data?.receipts}
        loading={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        columns={columns}
        getRowId={(r) => r.id}
        onRowClick={(r) => setSelected(r.id)}
        rowLabel={(r) => `Open receipt ${r.tid}`}
        selectedRowId={selected}
        minWidth={820}
        empty={<EmptyState size="sm" title="No receipts" description="Receipts appear here once bank lines are matched." />}
      />
      {list.data && <TablePagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPageChange={(page) => setFilters({ ...filters, page })} />}

      <div style={{ marginTop: 'var(--mantine-spacing-xl)' }}>
        <AdjustmentsPanel />
      </div>

      <ReceiptDrawer receiptId={selected} onClose={() => setSelected(null)} />
      {splitOpen && <SplitLineModal opened onClose={closeSplit} initialLineId={lineParam} />}
    </>
  );
}
