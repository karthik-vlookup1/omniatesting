import { Group, Stack, Text } from '@mantine/core';
import { DataTable, Money, type DataTableColumn } from '../../components';
import type { BankLine } from '../../data/transactions';
import { formatDate } from '../../lib/format';
import { ConfidenceBadge, LineStatusBadge } from './badges';

export interface BankLinesTableProps {
  lines: BankLine[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onOpen: (line: BankLine) => void;
  selectedId: string | null;
  empty: React.ReactNode;
}

function bestOpenSuggestion(line: BankLine) {
  return line.suggestions.find((s) => s.status === 'open') ?? null;
}

const columns: DataTableColumn<BankLine>[] = [
  {
    key: 'date',
    header: 'Date',
    width: 104,
    cell: (l) => (
      <Text span fz="sm" className="tabular">
        {formatDate(l.txnDate)}
      </Text>
    ),
  },
  { key: 'bank', header: 'Bank', width: 96, cell: (l) => l.bankCode },
  {
    key: 'description',
    header: 'Description',
    cell: (l) => {
      const sub = [l.reference, l.counterparty].filter(Boolean).join(' · ');
      return (
        <Stack gap={0} miw={0} maw={360}>
          <Text fz="sm" truncate title={l.description}>
            {l.description}
          </Text>
          {sub && (
            <Text fz="xs" c="dimmed" truncate title={sub}>
              {sub}
            </Text>
          )}
        </Stack>
      );
    },
  },
  { key: 'amount', header: 'Amount', align: 'right', cell: (l) => <Money value={l.amount} signed fw={500} /> },
  {
    key: 'remaining',
    header: 'Remaining',
    align: 'right',
    cell: (l) => <Money value={l.remaining} c={Number(l.remaining) === 0 ? 'dimmed' : undefined} />,
  },
  {
    key: 'suggestion',
    header: 'Best suggestion',
    cell: (l) => {
      const s = bestOpenSuggestion(l);
      if (!s) {
        return (
          <Text span fz="sm" c="dimmed">
            {l.status === 'matched' ? '—' : 'No suggestion'}
          </Text>
        );
      }
      return (
        <Group gap={6} wrap="nowrap">
          <Text span fz="sm" fw={600} ff="monospace">
            {s.tid}
          </Text>
          <Text span fz="sm" truncate maw={160} title={s.tenantName ?? undefined}>
            {s.tenantName ?? 'Unknown tenant'}
          </Text>
          <ConfidenceBadge suggestion={s} />
        </Group>
      );
    },
  },
  { key: 'status', header: 'Status', cell: (l) => <LineStatusBadge status={l.status} /> },
];

export function BankLinesTable({ lines, loading, error, onRetry, onOpen, selectedId, empty }: BankLinesTableProps) {
  return (
    <DataTable
      caption="Bank lines"
      data={lines}
      loading={loading}
      error={error}
      onRetry={onRetry}
      columns={columns}
      getRowId={(l) => l.id}
      onRowClick={onOpen}
      rowLabel={(l) => `Open line ${formatDate(l.txnDate)}, ${l.description}`}
      selectedRowId={selectedId}
      rowTone={(l) => (l.status === 'needs_review' ? 'warning' : l.status === 'yet_to_take' ? 'danger' : undefined)}
      minWidth={1040}
      empty={empty}
    />
  );
}
