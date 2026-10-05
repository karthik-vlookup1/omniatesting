import { ActionIcon, Badge, Button, Text, Tooltip, VisuallyHidden } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { DataTable, EmptyState, FilterBar, PageHeader, SearchInput, type DataTableColumn } from '../../components';
import { can, useCurrentUser } from '../../data/auth';
import { useBankAccountList, type BankAccountRow } from './api';
import { BankAccountFormModal } from './BankAccountFormModal';

/** Bank accounts that statements are imported against. Admin only to change. */
export function BankAccountsPage() {
  useDocumentTitle('Bank accounts · Omnia Recon');
  const user = useCurrentUser();
  const canEdit = can(user, 'settings');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<BankAccountRow | null>(null);
  const [adding, setAdding] = useState(false);
  const accounts = useBankAccountList();

  const rows = useMemo(() => {
    const needle = q.toLowerCase();
    return (accounts.data ?? []).filter(
      (a) => !needle || a.code.toLowerCase().includes(needle) || a.bankName.toLowerCase().includes(needle) || a.accountName.toLowerCase().includes(needle),
    );
  }, [accounts.data, q]);

  const columns: DataTableColumn<BankAccountRow>[] = [
    {
      key: 'code',
      header: 'Code',
      width: 140,
      cell: (a) => (
        <Text span fz="sm" fw={600} ff="monospace">
          {a.code}
        </Text>
      ),
    },
    { key: 'bank', header: 'Bank', cell: (a) => a.bankName },
    { key: 'account', header: 'Account name', cell: (a) => a.accountName },
    {
      key: 'status',
      header: 'Status',
      cell: (a) => (
        <Badge variant="light" color={a.isActive ? 'teal' : 'gray'}>
          {a.isActive ? 'Active' : 'Inactive'}
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
            cell: (a: BankAccountRow) => (
              <Tooltip label="Edit">
                <ActionIcon aria-label={`Edit ${a.code}`} onClick={() => setEditing(a)}>
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
        title="Bank accounts"
        description="The bank accounts statements are imported against. Only the last digits of sort codes and account numbers are kept."
        actions={
          canEdit && (
            <Button leftSection={<IconPlus size={16} aria-hidden />} onClick={() => setAdding(true)}>
              Add bank account
            </Button>
          )
        }
      />
      <FilterBar active={q !== ''} onReset={() => setQ('')}>
        <SearchInput label="Search" placeholder="Code, bank or account name" value={q} onSearch={setQ} w={280} debounceMs={150} />
      </FilterBar>
      <DataTable
        caption="Bank accounts"
        data={accounts.data ? rows : undefined}
        loading={accounts.isPending}
        error={accounts.error}
        onRetry={() => void accounts.refetch()}
        columns={columns}
        getRowId={(a) => a.id}
        minWidth={700}
        empty={
          <EmptyState
            size="sm"
            title={q ? 'No bank accounts found' : 'No bank accounts yet'}
            description={q ? `Nothing matches "${q}".` : 'Add the first bank account.'}
          />
        }
      />
      <BankAccountFormModal
        opened={adding || editing !== null}
        account={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    </>
  );
}
