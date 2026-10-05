import { ActionIcon, Badge, Button, Select, Stack, Text, Tooltip, VisuallyHidden } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { DataTable, EmptyState, FilterBar, PageHeader, SearchInput, type DataTableColumn } from '../../components';
import { can, useCurrentUser } from '../../data/auth';
import { useBranches } from '../branches/api';
import { useProperties, type Property, type PropertyStatusFilter } from './api';
import { PropertyFormModal } from './PropertyFormModal';

const SEARCH_LIMIT = 200;

/** Properties under management. Anyone signed in can read; writers edit. */
export function PropertiesPage() {
  useDocumentTitle('Properties · Omnia Recon');
  const user = useCurrentUser();
  const canEdit = can(user, 'write');
  const [q, setQ] = useState('');
  const [branchId, setBranchId] = useState<string | null>(null);
  const [status, setStatus] = useState<PropertyStatusFilter>('all');
  const [editing, setEditing] = useState<Property | null>(null);
  const [adding, setAdding] = useState(false);
  const branches = useBranches('');
  const properties = useProperties({ q, branchId, status });

  const columns: DataTableColumn<Property>[] = [
    {
      key: 'ref',
      header: 'Reference',
      width: 130,
      cell: (p) => (
        <Text span fz="sm" fw={600} ff="monospace">
          {p.propertyRef}
        </Text>
      ),
    },
    {
      key: 'address',
      header: 'Address',
      cell: (p) => (
        <Stack gap={0} miw={0} maw={320}>
          <Text fz="sm" truncate title={p.addressLine1}>
            {p.addressLine1}
          </Text>
          <Text fz="xs" c="dimmed" truncate>
            {p.town ? `${p.town} · ` : ''}
            {p.postcode}
          </Text>
        </Stack>
      ),
    },
    { key: 'town', header: 'Town', width: 140, cell: (p) => p.town ?? '—' },
    { key: 'branch', header: 'Branch', width: 90, cell: (p) => p.branchCode },
    { key: 'landlord', header: 'Landlord', cell: (p) => p.landlordName ?? '—' },
    {
      key: 'status',
      header: 'Status',
      cell: (p) => (
        <Badge variant="light" color={p.isActive ? 'teal' : 'gray'}>
          {p.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: <VisuallyHidden>Actions</VisuallyHidden>,
            align: 'right' as const,
            width: 56,
            cell: (p: Property) => (
              <Tooltip label="Edit">
                <ActionIcon aria-label={`Edit ${p.propertyRef}`} onClick={() => setEditing(p)}>
                  <IconPencil size={16} />
                </ActionIcon>
              </Tooltip>
            ),
          },
        ]
      : []),
  ];

  const filtered = q !== '' || branchId !== null || status !== 'all';
  const capped = (properties.data?.length ?? 0) >= SEARCH_LIMIT;

  return (
    <>
      <PageHeader
        title="Properties"
        description="Properties come from Veco and can be corrected here. Search by reference, address, town or postcode."
        actions={
          canEdit && (
            <Button leftSection={<IconPlus size={16} aria-hidden />} onClick={() => setAdding(true)}>
              Add property
            </Button>
          )
        }
      />
      <FilterBar
        active={filtered}
        onReset={() => {
          setQ('');
          setBranchId(null);
          setStatus('all');
        }}
      >
        <SearchInput label="Search" placeholder="Reference, address, town or postcode" value={q} onSearch={setQ} w={320} />
        <Select
          label="Branch filter"
          w={200}
          clearable
          placeholder="All branches"
          value={branchId}
          onChange={setBranchId}
          data={(branches.data ?? []).map((b) => ({ value: b.id, label: `${b.code} - ${b.name}` }))}
        />
        <Select
          label="Status"
          w={140}
          allowDeselect={false}
          value={status}
          onChange={(v) => setStatus((v as PropertyStatusFilter | null) ?? 'all')}
          data={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />
      </FilterBar>
      <DataTable
        caption="Properties"
        data={properties.data}
        loading={properties.isPending}
        error={properties.error}
        onRetry={() => void properties.refetch()}
        columns={columns}
        getRowId={(p) => p.id}
        minWidth={1000}
        empty={
          <EmptyState
            size="sm"
            title={filtered ? 'No properties found' : 'No properties yet'}
            description={filtered ? 'Nothing matches these filters.' : 'Add a property, or wait for the Veco sync.'}
          />
        }
      />
      {capped && (
        <Text fz="xs" c="dimmed" mt="xs">
          Showing the first {SEARCH_LIMIT} results. Narrow the search to find a specific property.
        </Text>
      )}
      <PropertyFormModal
        opened={adding || editing !== null}
        property={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    </>
  );
}
