import { ActionIcon, Button, Text, Tooltip, VisuallyHidden } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { DataTable, EmptyState, FilterBar, PageHeader, SearchInput, type DataTableColumn } from '../../components';
import { can, useCurrentUser } from '../../data/auth';
import { useLandlords, type Landlord } from './api';
import { LandlordFormModal } from './LandlordFormModal';

/** Landlords that properties belong to. Anyone signed in can read; writers edit. */
export function LandlordsPage() {
  useDocumentTitle('Landlords · Omnia Recon');
  const user = useCurrentUser();
  const canEdit = can(user, 'write');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Landlord | null>(null);
  const [adding, setAdding] = useState(false);
  const landlords = useLandlords(q);

  const columns: DataTableColumn<Landlord>[] = [
    {
      key: 'ref',
      header: 'Reference',
      width: 140,
      cell: (l) =>
        l.landlordRef ? (
          <Text span fz="sm" fw={600} ff="monospace">
            {l.landlordRef}
          </Text>
        ) : (
          '—'
        ),
    },
    { key: 'name', header: 'Name', cell: (l) => l.name },
    { key: 'email', header: 'E-mail', cell: (l) => l.email ?? '—', truncate: { tooltip: (l) => l.email }, width: 260 },
    { key: 'phone', header: 'Phone', cell: (l) => l.phone ?? '—' },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: <VisuallyHidden>Actions</VisuallyHidden>,
            align: 'right' as const,
            width: 56,
            cell: (l: Landlord) => (
              <Tooltip label="Edit">
                <ActionIcon aria-label={`Edit ${l.landlordRef ?? l.name}`} onClick={() => setEditing(l)}>
                  <IconPencil size={16} />
                </ActionIcon>
              </Tooltip>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Landlords"
        description="Landlords that own the managed properties. Search by name, reference or e-mail."
        actions={
          canEdit && (
            <Button leftSection={<IconPlus size={16} aria-hidden />} onClick={() => setAdding(true)}>
              Add landlord
            </Button>
          )
        }
      />
      <FilterBar active={q !== ''} onReset={() => setQ('')}>
        <SearchInput label="Search" placeholder="Name, reference or e-mail" value={q} onSearch={setQ} w={280} />
      </FilterBar>
      <DataTable
        caption="Landlords"
        data={landlords.data}
        loading={landlords.isPending}
        error={landlords.error}
        onRetry={() => void landlords.refetch()}
        columns={columns}
        getRowId={(l) => l.id}
        minWidth={800}
        empty={
          <EmptyState
            size="sm"
            title={q ? 'No landlords found' : 'No landlords yet'}
            description={q ? `Nothing matches "${q}".` : 'Add the first landlord.'}
          />
        }
      />
      <LandlordFormModal
        opened={adding || editing !== null}
        landlord={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    </>
  );
}
