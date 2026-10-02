import { Badge, Button, Group, SegmentedControl, Stack, Text } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import { IconRefresh } from '@tabler/icons-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataTable, EmptyState, FilterBar, MaskedValue, Money, PageHeader, SearchInput, type DataTableColumn } from '../../components';
import { useCurrentUser } from '../../data/auth';
import { TENANCY_QUERY_MAX, TENANCY_SEARCH_LIMIT, useTenancySearch, type TenancyStatusFilter, type TenancySummary } from '../../data/tenancies';
import { formatDate, humanize } from '../../lib/format';
import { TenancyDrawer } from './TenancyDrawer';
import { TenancyStatusBadge } from './TenancyStatusBadge';
import { VecoSyncModal } from './VecoSyncModal';

const STATUSES: { value: TenancyStatusFilter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'ended', label: 'Ended' },
  { value: 'all', label: 'All' },
];

const columns: DataTableColumn<TenancySummary>[] = [
  {
    key: 'tid',
    header: 'TID',
    width: 90,
    cell: (t) => (
      <Text span fz="sm" fw={600} ff="monospace">
        {t.tid}
      </Text>
    ),
  },
  { key: 'tenant', header: 'Tenant', cell: (t) => t.tenantName ?? '—', truncate: { tooltip: (t) => t.tenantName }, width: 200 },
  { key: 'ni', header: 'NI', width: 120, cell: (t) => <MaskedValue kind="ni" value={t.niMasked} /> },
  {
    key: 'property',
    header: 'Property',
    cell: (t) => (
      <Stack gap={0} miw={0} maw={320}>
        <Text fz="sm" truncate title={`${t.address}, ${t.postcode}`}>
          {t.address}
        </Text>
        <Text fz="xs" c="dimmed" truncate>
          {t.propertyRef}
          {t.unitRef ? ` / ${t.unitRef}` : ''} · {t.postcode}
        </Text>
      </Stack>
    ),
  },
  { key: 'branch', header: 'Branch', width: 80, cell: (t) => t.branchCode },
  {
    key: 'type',
    header: 'Type',
    width: 70,
    cell: (t) => (
      <Badge variant="outline" color="gray" size="sm">
        {t.managementType}
      </Badge>
    ),
  },
  {
    key: 'rent',
    header: 'Rent',
    align: 'right',
    cell: (t) =>
      t.rent ? (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <Money value={t.rent.amount} />
          <Text span fz="xs" c="dimmed">
            {humanize(t.rent.frequency).toLowerCase()}
          </Text>
        </Group>
      ) : (
        '—'
      ),
  },
  {
    key: 'dates',
    header: 'Start – end',
    cell: (t) => (
      <Text span fz="sm" className="tabular">
        {formatDate(t.startDate)} – {t.endDate ? formatDate(t.endDate) : 'now'}
      </Text>
    ),
  },
  { key: 'status', header: 'Status', cell: (t) => <TenancyStatusBadge status={t.status} /> },
];

/** FRONTEND_REFERENCE.md §5.3, §6.3: search tenancies by TID, name or full NI; admins sync from Veco. */
export function TenanciesPage() {
  useDocumentTitle('Tenancies · Omnia Recon');
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').slice(0, TENANCY_QUERY_MAX);
  const status = (STATUSES.find((s) => s.value === params.get('status'))?.value ?? 'active') as TenancyStatusFilter;
  const [open, setOpen] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const results = useTenancySearch(q, status);

  const setFilter = (key: 'q' | 'status', value: string, fallback: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === fallback) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const capped = (results.data?.length ?? 0) >= TENANCY_SEARCH_LIMIT;

  return (
    <>
      <PageHeader
        title="Tenancies"
        description="Tenancies come from Veco. Search by TID, tenant name or a full NI number; NI numbers are only ever shown masked unless your role allows otherwise."
        actions={
          // POST /tenancies/sync is requireRole() on the server: admin only.
          user.role === 'admin' && (
            <Button variant="default" leftSection={<IconRefresh size={16} aria-hidden />} onClick={() => setSyncing(true)}>
              Sync from Veco
            </Button>
          )
        }
      />

      <FilterBar active={q !== '' || status !== 'active'} onReset={() => setParams({}, { replace: true })}>
        <SearchInput
          label="Search"
          placeholder="TID, name or full NI number"
          value={q}
          onSearch={(v) => setFilter('q', v, '')}
          w={300}
          maxLength={TENANCY_QUERY_MAX}
          autoComplete="off"
        />
        <Stack gap={4}>
          <Text fz="sm" fw={500} id="tenancy-status-label">
            Status
          </Text>
          <SegmentedControl aria-labelledby="tenancy-status-label" value={status} onChange={(v) => setFilter('status', v, 'active')} data={STATUSES} />
        </Stack>
      </FilterBar>

      <DataTable
        caption="Tenancies"
        data={results.data}
        loading={results.isPending}
        error={results.error}
        onRetry={() => void results.refetch()}
        columns={columns}
        getRowId={(t) => t.tid}
        onRowClick={(t) => setOpen(t.tid)}
        rowLabel={(t) => `Open tenancy ${t.tid}${t.tenantName ? `, ${t.tenantName}` : ''}`}
        selectedRowId={open}
        minWidth={1100}
        empty={
          q ? (
            <EmptyState size="sm" title="No tenancies found" description={`Nothing matches “${q}”. Check the TID or spelling, or search by full NI number.`} />
          ) : (
            <EmptyState size="sm" title="No tenancies yet" description="Tenancies appear here after the first Veco sync." />
          )
        }
      />
      {capped && (
        <Text fz="xs" c="dimmed" mt="xs">
          Showing the first {TENANCY_SEARCH_LIMIT} results. Narrow the search to find a specific tenancy.
        </Text>
      )}

      <TenancyDrawer tid={open} onClose={() => setOpen(null)} />
      <VecoSyncModal opened={syncing} onClose={() => setSyncing(false)} />
    </>
  );
}
