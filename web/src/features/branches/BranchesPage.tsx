import { ActionIcon, Button, Text, Tooltip, VisuallyHidden } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { DataTable, EmptyState, FilterBar, PageHeader, SearchInput, type DataTableColumn } from '../../components';
import { can, useCurrentUser } from '../../data/auth';
import { useBranches, type Branch } from './api';
import { BranchFormModal } from './BranchFormModal';

/** Branches (the Xero tracking dimension). Anyone signed in can read; admins edit. */
export function BranchesPage() {
  useDocumentTitle('Branches · Omnia Recon');
  const user = useCurrentUser();
  const canEdit = can(user, 'settings');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Branch | null>(null);
  const [adding, setAdding] = useState(false);
  const branches = useBranches(q);

  const columns: DataTableColumn<Branch>[] = [
    {
      key: 'code',
      header: 'Code',
      width: 120,
      cell: (b) => (
        <Text span fz="sm" fw={600} ff="monospace">
          {b.code}
        </Text>
      ),
    },
    { key: 'name', header: 'Name', cell: (b) => b.name },
    { key: 'xero', header: 'Xero tracking option', cell: (b) => b.xeroTrackingOption ?? '—' },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: <VisuallyHidden>Actions</VisuallyHidden>,
            align: 'right' as const,
            width: 56,
            cell: (b: Branch) => (
              <Tooltip label="Edit">
                <ActionIcon aria-label={`Edit ${b.code}`} onClick={() => setEditing(b)}>
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
        title="Branches"
        description="Branches group properties and map to the Xero tracking category. The code cannot be changed once created."
        actions={
          canEdit && (
            <Button leftSection={<IconPlus size={16} aria-hidden />} onClick={() => setAdding(true)}>
              Add branch
            </Button>
          )
        }
      />
      <FilterBar active={q !== ''} onReset={() => setQ('')}>
        <SearchInput label="Search" placeholder="Code or name" value={q} onSearch={setQ} w={260} />
      </FilterBar>
      <DataTable
        caption="Branches"
        data={branches.data}
        loading={branches.isPending}
        error={branches.error}
        onRetry={() => void branches.refetch()}
        columns={columns}
        getRowId={(b) => b.id}
        minWidth={600}
        empty={
          <EmptyState
            size="sm"
            title={q ? 'No branches found' : 'No branches yet'}
            description={q ? `Nothing matches "${q}".` : 'Add the first branch.'}
          />
        }
      />
      <BranchFormModal
        opened={adding || editing !== null}
        branch={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    </>
  );
}
