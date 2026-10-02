import { Anchor, Group, Skeleton, Text, Tooltip } from '@mantine/core';
import { Link } from 'react-router-dom';
import { DataTable, EmptyState, type DataTableColumn } from '../../components';
import { useBatchSummary, useImports, type ImportBatch } from '../../data/imports';
import { formatCount, formatDate, formatDateTime } from '../../lib/format';
import { useOnScreen } from './useOnScreen';

/**
 * "Matched / for review" per import (FRONTEND_REFERENCE.md §6.2), fetched lazily once the row is on
 * screen, so a 50-row history does not fire 50 requests at once.
 */
function MatchCell({ batchId, reviewHref }: { batchId: string; reviewHref?: (batchId: string) => string }) {
  const { ref, seen } = useOnScreen<HTMLDivElement>();
  const summary = useBatchSummary(batchId, seen);

  if (summary.isError) {
    return (
      <Text span fz="sm" c="dimmed" ref={ref}>
        —
      </Text>
    );
  }
  if (!summary.data) return <Skeleton ref={ref} height={14} width={96} radius="sm" aria-label="Loading match counts" />;

  const s = summary.data;
  const open = s.needsReview + s.yetToTake + s.partiallyMatched;
  const text = `${formatCount(s.matched)} / ${formatCount(open)}`;
  return (
    <Group gap={6} wrap="nowrap" justify="flex-end" ref={ref}>
      <Tooltip label={`${formatCount(s.matched)} matched (${formatCount(s.autoMatched)} automatically), ${formatCount(open)} for review or yet to take, ${formatCount(s.excluded)} excluded`}>
        {reviewHref && open > 0 ? (
          <Anchor component={Link} to={reviewHref(batchId)} fz="sm" className="tabular">
            {text}
          </Anchor>
        ) : (
          <Text span fz="sm" className="tabular" tabIndex={0}>
            {text}
          </Text>
        )}
      </Tooltip>
    </Group>
  );
}

export function RecentImportsTable({ reviewHref }: { reviewHref?: (batchId: string) => string }) {
  const imports = useImports();

  const columns: DataTableColumn<ImportBatch>[] = [
    {
      key: 'uploadedAt',
      header: 'Uploaded',
      cell: (b) => (
        <Text span fz="sm" className="tabular">
          {formatDateTime(b.uploadedAt)}
        </Text>
      ),
      width: 150,
    },
    { key: 'bank', header: 'Bank', cell: (b) => b.bankCode, width: 110 },
    { key: 'file', header: 'File', cell: (b) => b.fileName, truncate: { tooltip: (b) => b.fileName }, width: 260 },
    {
      key: 'period',
      header: 'Period',
      cell: (b) =>
        b.periodFrom ? (
          <Text span fz="sm" className="tabular">
            {formatDate(b.periodFrom)} – {formatDate(b.periodTo)}
          </Text>
        ) : (
          '—'
        ),
    },
    { key: 'rows', header: 'Rows', align: 'right', cell: (b) => formatCount(b.rowsTotal) },
    { key: 'inserted', header: 'New', align: 'right', cell: (b) => formatCount(b.rowsInserted) },
    { key: 'duplicates', header: 'Duplicates', align: 'right', cell: (b) => formatCount(b.rowsDuplicate) },
    {
      key: 'matching',
      header: 'Matched / for review',
      align: 'right',
      cell: (b) => <MatchCell batchId={b.id} reviewHref={reviewHref} />,
    },
    { key: 'by', header: 'By', cell: (b) => b.uploadedBy ?? '—', truncate: { tooltip: (b) => b.uploadedBy }, width: 160 },
  ];

  return (
    <DataTable
      caption="Recent imports"
      data={imports.data}
      loading={imports.isPending}
      error={imports.error}
      onRetry={() => void imports.refetch()}
      columns={columns}
      getRowId={(b) => b.id}
      minWidth={960}
      maxHeight={520}
      empty={<EmptyState size="sm" title="No statements imported yet" description="Upload a bank statement CSV to get started." />}
    />
  );
}
