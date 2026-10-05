import { Button, Select, Text, TextInput, VisuallyHidden } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { DataTable, EmptyState, FilterBar, PageHeader, StatusBadge, type DataTableColumn } from '../../components';
import { can, useCurrentUser } from '../../data/auth';
import { errorMessage } from '../../lib/api';
import { useLandlords } from '../landlords/api';
import { usePayerAccounts, useUpdatePayerAccount, type PayerAccount, type PayerKind } from './api';
import { AddPayerAccountModal } from './AddPayerAccountModal';

const PAYS_FOR: Record<PayerKind, string> = {
  tenant: 'Tenant share',
  council_hb: 'Council (HB)',
  dwp_uc: 'DWP (UC)',
  other_third_party: 'Other third party',
};

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Known payer accounts (hash + last 4 only). Anyone signed in can read; writers add and (de)activate. */
export function PayerAccountsPage() {
  useDocumentTitle('Payer accounts · Omnia Recon');
  const user = useCurrentUser();
  const canEdit = can(user, 'write');
  const [tid, setTid] = useState('');
  const [landlordId, setLandlordId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const landlords = useLandlords('');
  const update = useUpdatePayerAccount();
  const validTid = /^[Tt]\d{3,6}$/.test(tid.trim());
  const accounts = usePayerAccounts({ tid: validTid ? tid.trim() : undefined, landlordId: landlordId ?? undefined });

  const columns: DataTableColumn<PayerAccount>[] = [
    {
      key: 'account',
      header: 'Account',
      cell: (a) => (
        <Text span fz="sm" fw={600} ff="monospace">
          {a.account}
        </Text>
      ),
    },
    { key: 'holder', header: 'Holder', cell: (a) => a.holderName ?? '—' },
    { key: 'type', header: 'Type', cell: (a) => capitalise(a.holderType) },
    { key: 'pays', header: 'Pays for', cell: (a) => PAYS_FOR[a.payer] },
    { key: 'linked', header: 'Linked to', cell: (a) => a.tid ?? a.landlordName ?? '—' },
    { key: 'source', header: 'Source', cell: (a) => capitalise(a.source) },
    {
      key: 'status',
      header: 'Status',
      cell: (a) => <StatusBadge tone={a.isActive ? 'success' : 'neutral'} label={a.isActive ? 'Active' : 'Inactive'} />,
    },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: <VisuallyHidden>Actions</VisuallyHidden>,
            align: 'right' as const,
            cell: (a: PayerAccount) => (
              <Button
                size="compact-sm"
                variant="default"
                aria-label={`${a.isActive ? 'Deactivate' : 'Reactivate'} ${a.account}`}
                loading={update.isPending && update.variables?.id === a.id}
                onClick={() => update.mutate({ id: a.id, input: { isActive: !a.isActive } })}
              >
                {a.isActive ? 'Deactivate' : 'Reactivate'}
              </Button>
            ),
          },
        ]
      : []),
  ];

  const filtered = tid !== '' || landlordId !== null;
  return (
    <>
      <PageHeader
        title="Known payer accounts"
        description="Bank accounts that pay rent for a tenancy or landlord. Only the last 4 digits are kept."
        actions={
          canEdit && (
            <Button leftSection={<IconPlus size={16} aria-hidden />} onClick={() => setAdding(true)}>
              Add payer account
            </Button>
          )
        }
      />
      <FilterBar
        active={filtered}
        onReset={() => {
          setTid('');
          setLandlordId(null);
        }}
      >
        <TextInput label="Tenancy ID" value={tid} onChange={(e) => setTid(e.currentTarget.value)} w={160} />
        <Select
          label="Landlord"
          clearable
          searchable
          value={landlordId}
          onChange={setLandlordId}
          data={(landlords.data ?? []).map((l) => ({ value: l.id, label: l.name }))}
          w={260}
        />
      </FilterBar>
      {update.isError && (
        <Text c="red" role="alert" fz="sm" mb="xs">
          {errorMessage(update.error)}
        </Text>
      )}
      <DataTable
        caption="Known payer accounts"
        data={accounts.data}
        loading={accounts.isPending}
        error={accounts.error}
        onRetry={() => void accounts.refetch()}
        columns={columns}
        getRowId={(a) => a.id}
        minWidth={900}
        empty={<EmptyState size="sm" title="No payer accounts" description={filtered ? 'Nothing matches the filters.' : 'Add the first payer account.'} />}
      />
      <AddPayerAccountModal opened={adding} onClose={() => setAdding(false)} />
    </>
  );
}
