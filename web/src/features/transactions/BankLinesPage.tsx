import { Badge, Button, CloseButton, Group, ScrollArea, SegmentedControl, Select, Stack, Text } from '@mantine/core';
import { useDocumentTitle, useHotkeys } from '@mantine/hooks';
import { IconFileUpload } from '@tabler/icons-react';
import { useCallback, useMemo, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, FilterBar, PageHeader, TablePagination } from '../../components';
import { useBankAccounts } from '../../data/imports';
import { PAGE_SIZE, STATUS_FILTERS, useLines, type BankLine, type LineStatusFilter } from '../../data/transactions';
import { formatCount } from '../../lib/format';
import { BankLinesTable } from './BankLinesTable';
import { LineDrawer, type LineActionsProps } from './LineDrawer';
import { useLineFilters } from './useLineFilters';

export interface BankLinesPageProps {
  /** Review actions for the drawer; without them the drawer is read-only. */
  Actions?: ComponentType<LineActionsProps>;
}

function emptyFor(status: LineStatusFilter, filtered: boolean) {
  if (filtered) return <EmptyState size="sm" title="No lines match these filters" description="Try another bank, status or import." />;
  if (status === 'open') {
    return (
      <EmptyState
        size="sm"
        title="Nothing to review"
        description="Every line has been matched or excluded. Upload a statement to bring in new lines."
        action={
          <Button component={Link} to="/upload" variant="default" leftSection={<IconFileUpload size={16} aria-hidden />}>
            Upload statement
          </Button>
        }
      />
    );
  }
  const label = STATUS_FILTERS.find((s) => s.value === status)?.label.toLowerCase() ?? 'matching';
  return <EmptyState size="sm" title={`No ${label} lines`} description="Lines appear here as statements are uploaded and reviewed." />;
}

/** FRONTEND_REFERENCE.md §6.1: every bank line, filtered by status, bank and import. */
export function BankLinesPage({ Actions }: BankLinesPageProps) {
  useDocumentTitle('Review queue · Omnia Recon');
  const { filters, query, update } = useLineFilters();
  const lines = useLines(query);
  const banks = useBankAccounts();

  const list = useMemo(() => lines.data?.lines ?? [], [lines.data]);
  const index = filters.lineId ? list.findIndex((l) => l.id === filters.lineId) : -1;

  const open = useCallback((line: BankLine | undefined) => update({ lineId: line?.id ?? null }, { replace: true }), [update]);
  const prev = index > 0 ? () => open(list[index - 1]) : undefined;
  const next = index >= 0 && index < list.length - 1 ? () => open(list[index + 1]) : undefined;

  useHotkeys([
    ['j', () => (filters.lineId ? next?.() : open(list[0]))],
    ['k', () => prev?.()],
  ]);

  /** After an action, go to the next line in the queue, as staff work through it top to bottom. */
  const onDone = useCallback(
    (updated: BankLine) => {
      const i = list.findIndex((l) => l.id === updated.id);
      const following = i >= 0 ? list[i + 1] : undefined;
      update({ lineId: following?.id ?? null }, { replace: true });
    },
    [list, update],
  );

  const bankOptions = (banks.data ?? []).map((b) => ({ value: b.id, label: `${b.code} · ${b.accountName}` }));
  const filtered = Boolean(filters.bankAccountId || filters.batchId);
  const total = lines.data?.total ?? 0;

  return (
    <>
      <PageHeader
        title="Review queue"
        description="Clear every line that was not matched automatically: accept a suggestion, pick another tenancy, or exclude lines that are not rent."
        meta={
          lines.data && (
            <Text fz="sm" c="dimmed" className="tabular" aria-live="polite">
              {formatCount(total)} line{total === 1 ? '' : 's'}
            </Text>
          )
        }
      />

      <FilterBar
        active={filtered || filters.status !== 'open'}
        onReset={() => update({ status: 'open', bankAccountId: null, batchId: null })}
      >
        <Stack gap={4}>
          <Text fz="sm" fw={500} id="status-filter-label">
            Status
          </Text>
          <ScrollArea type="never" maw="100%">
            <SegmentedControl
              aria-labelledby="status-filter-label"
              value={filters.status}
              onChange={(v) => update({ status: v as LineStatusFilter })}
              data={STATUS_FILTERS}
              size="sm"
            />
          </ScrollArea>
        </Stack>
        <Select
          label="Bank"
          placeholder="All banks"
          w={220}
          data={bankOptions}
          value={filters.bankAccountId}
          onChange={(v) => update({ bankAccountId: v })}
          clearable
          allowDeselect
          searchable
          disabled={banks.isPending}
        />
        {filters.batchId && (
          <Stack gap={4}>
            <Text fz="sm" fw={500}>
              Import
            </Text>
            <Badge
              size="lg"
              variant="light"
              h={36}
              rightSection={<CloseButton size="xs" aria-label="Show all imports" onClick={() => update({ batchId: null })} />}
            >
              One import only
            </Badge>
          </Stack>
        )}
      </FilterBar>

      <BankLinesTable
        lines={lines.data?.lines}
        loading={lines.isPending}
        error={lines.error}
        onRetry={() => void lines.refetch()}
        onOpen={open}
        selectedId={filters.lineId}
        empty={emptyFor(filters.status, filtered)}
      />
      <Group justify="flex-end">
        <TablePagination page={filters.page} pageSize={PAGE_SIZE} total={total} onPageChange={(page) => update({ page })} />
      </Group>

      <LineDrawer
        lineId={filters.lineId}
        onClose={() => open(undefined)}
        onPrev={prev}
        onNext={next}
        Actions={Actions}
        onDone={onDone}
      />
    </>
  );
}
