import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { IconBuildingBank, IconPencil } from '@tabler/icons-react';
import { useState } from 'react';
import { can, useCurrentUser } from '../../data/auth';
import { errorMessage } from '../../lib/api';
import {
  CANONICAL_FIELDS,
  DATE_FORMATS,
  useBankAccounts,
  useInstallDefaultBanks,
  useSaveProfile,
  type BankAccount,
  type CanonicalField,
  type ProfileInput,
} from './api';

const FIELD_LABELS: Record<CanonicalField, string> = {
  txn_date: 'Date',
  description: 'Description',
  reference: 'Reference',
  amount: 'Amount (signed)',
  paid_in: 'Paid in',
  paid_out: 'Paid out',
  counterparty: 'Payer / counterparty name',
  payer_sort_code: 'Payer sort code',
  payer_account_number: 'Payer account number',
  balance: 'Balance',
  bank_txn_id: 'Bank transaction id',
  tid: 'Tenancy ID (TID)',
  ni_number: 'NI number',
};

/** How each bank's CSV is read. Editing saves a new version; the old one is kept. */
export function CsvProfilesPage() {
  const user = useCurrentUser();
  const banks = useBankAccounts();
  const install = useInstallDefaultBanks();
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const canEdit = can(user, 'finance');

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Bank CSV profiles</Title>
        {can(user, 'settings') && (
          <Button
            variant="default"
            leftSection={<IconBuildingBank size={16} />}
            onClick={() => install.mutate()}
            loading={install.isPending}
          >
            Add default banks
          </Button>
        )}
      </Group>
      <Text c="dimmed" size="sm">
        Columns are found by header name, never by position. When a bank renames a column, add the new name as another
        alias — that saves a new profile version and no code changes are needed.
      </Text>
      {install.data && (
        <Alert color="green" role="status">
          {install.data.created.length
            ? `Added: ${install.data.created.join(', ')}`
            : 'All default banks already exist.'}
        </Alert>
      )}
      <Table striped aria-label="Bank accounts">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Bank</Table.Th>
            <Table.Th>Profile</Table.Th>
            <Table.Th>Amounts</Table.Th>
            <Table.Th>Date format</Table.Th>
            <Table.Th>Headers</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {banks.data?.map((b) => (
            <Table.Tr key={b.id}>
              <Table.Td>
                <Text fw={500}>{b.code}</Text>
                <Text size="xs" c="dimmed">
                  {b.accountName}
                </Text>
              </Table.Td>
              <Table.Td>
                {b.profile ? <Badge variant="light">v{b.profile.version}</Badge> : <Badge color="gray">none</Badge>}
              </Table.Td>
              <Table.Td>
                {b.profile?.amountMode === 'signed' ? 'one signed column' : b.profile ? 'paid in / out' : '—'}
              </Table.Td>
              <Table.Td>{b.profile?.dateFormat ?? '—'}</Table.Td>
              <Table.Td>
                <Text size="xs">
                  {b.profile
                    ? Object.entries(b.profile.headerAliases)
                        .map(([f, a]) => `${f}: ${a.join(' / ')}`)
                        .join(' · ')
                    : '—'}
                </Text>
              </Table.Td>
              <Table.Td>
                {canEdit && (
                  <Button
                    size="xs"
                    variant="subtle"
                    leftSection={<IconPencil size={14} />}
                    onClick={() => setEditing(b)}
                  >
                    Edit
                  </Button>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {editing && <ProfileEditor bank={editing} onClose={() => setEditing(null)} />}
    </Stack>
  );
}

function ProfileEditor({ bank, onClose }: { bank: BankAccount; onClose: () => void }) {
  const save = useSaveProfile();
  const p = bank.profile;
  const [aliases, setAliases] = useState<Record<CanonicalField, string>>(
    () =>
      Object.fromEntries(CANONICAL_FIELDS.map((f) => [f, (p?.headerAliases[f] ?? []).join(', ')])) as Record<
        CanonicalField,
        string
      >,
  );
  const [amountMode, setAmountMode] = useState<ProfileInput['amountMode']>(p?.amountMode ?? 'signed');
  const [dateFormat, setDateFormat] = useState(p?.dateFormat ?? 'DD/MM/YYYY');
  const [skipRows, setSkipRows] = useState(p?.skipRows ?? 0);
  const [notes, setNotes] = useState('');

  const submit = () => {
    const headerAliases: ProfileInput['headerAliases'] = {};
    for (const f of CANONICAL_FIELDS) {
      const list = aliases[f]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length) headerAliases[f] = list;
    }
    save.mutate(
      {
        bankAccountId: bank.id,
        profile: {
          headerAliases,
          requiredFields: p?.requiredFields ?? ['txn_date', 'description'],
          amountMode,
          dateFormat,
          skipRows,
          notes: notes || null,
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal opened onClose={onClose} title={`CSV profile — ${bank.code}`} size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          Header names for each field, comma-separated. Leave a field empty if the bank doesn&apos;t have it.
        </Text>
        <SimpleGrid cols={2}>
          {CANONICAL_FIELDS.map((f) => (
            <TextInput
              key={f}
              label={FIELD_LABELS[f]}
              value={aliases[f]}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setAliases((a) => ({ ...a, [f]: v }));
              }}
            />
          ))}
        </SimpleGrid>
        <Group grow>
          <Select
            label="Amounts"
            value={amountMode}
            onChange={(v) => setAmountMode((v as ProfileInput['amountMode'] | null) ?? 'signed')}
            data={[
              { value: 'signed', label: 'One signed amount column' },
              { value: 'split_in_out', label: 'Separate paid in / paid out' },
            ]}
          />
          <Select
            label="Date format"
            value={dateFormat}
            onChange={(v) => setDateFormat(v ?? 'DD/MM/YYYY')}
            data={[...DATE_FORMATS]}
          />
          <NumberInput
            label="Lines before the header"
            min={0}
            max={50}
            value={skipRows}
            onChange={(v) => setSkipRows(Number(v) || 0)}
          />
        </Group>
        <Textarea label="What changed (optional)" value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
        {save.isError && <Alert color="red">{errorMessage(save.error)}</Alert>}
        <Group justify="end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save as v{(p?.version ?? 0) + 1}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
