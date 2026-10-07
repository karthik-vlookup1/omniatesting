import { Alert, Anchor, Badge, Button, Group, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { errorMessage } from '../../lib/api';
import {
  gbp,
  journalCsvUrl,
  JOURNAL_STATUS_LABELS,
  poundsToPence,
  useAgentosTenants,
  useCreateJournalExport,
  useCreateJournalTransfer,
  useJournalTransfers,
  useMarkJournalPosted,
  useTenantLedger,
  type AgentosTenant,
  type JournalExport,
} from './api';

const COLOUR = { not_exported: 'gray', exported: 'blue', posted: 'green' } as const;
const SIGNED_RE = /^-?\d+(\.\d{1,2})?$/;

interface Row {
  key: number;
  tid: string | null;
  accountType: string;
  amount: string;
}

const emptyRow = (key: number): Row => ({ key, tid: null, accountType: '', amount: '' });
const signedPence = (v: string): number | null => (SIGNED_RE.test(v.trim()) ? poundsToPence(v) : null);

function JournalRow(props: {
  row: Row;
  index: number;
  tenants: AgentosTenant[];
  canRemove: boolean;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
}) {
  const { row, index, tenants, canRemove, onChange, onRemove } = props;
  const tenant = tenants.find((t) => t.tid === row.tid) ?? null;
  const ledger = useTenantLedger(row.tid);
  const n = index + 1;
  return (
    <Table.Tr data-testid={`journal-row-${n}`}>
      <Table.Td>
        <Select
          aria-label={`Person ${n}`}
          searchable
          data={tenants.map((t) => ({ value: t.tid, label: t.name }))}
          value={row.tid}
          onChange={(v) => onChange({ tid: v })}
          w={240}
        />
      </Table.Td>
      <Table.Td>{tenant?.branch ?? '-'}</Table.Td>
      <Table.Td>{tenant?.property ?? '-'}</Table.Td>
      <Table.Td>
        <TextInput
          aria-label={`Account Type ${n}`}
          value={row.accountType}
          onChange={(e) => onChange({ accountType: e.currentTarget.value })}
        />
      </Table.Td>
      <Table.Td data-testid={`journal-balance-${n}`}>
        {row.tid === null ? '' : ledger.data ? gbp(ledger.data.balancePence) : ledger.isError ? 'Unavailable' : '...'}
      </Table.Td>
      <Table.Td>
        <TextInput
          aria-label={`Amount ${n}`}
          inputMode="decimal"
          placeholder="-0.00"
          value={row.amount}
          onChange={(e) => onChange({ amount: e.currentTarget.value })}
          error={row.amount !== '' && signedPence(row.amount) === null ? 'Invalid amount' : undefined}
          w={130}
        />
      </Table.Td>
      <Table.Td>
        <Button size="xs" variant="subtle" color="red" onClick={onRemove} disabled={!canRemove}>
          Remove row
        </Button>
      </Table.Td>
    </Table.Tr>
  );
}

/** `writer` here means "may post journals": accounts and admin only (the server returns 403 for anyone else). */
export function JournalSection({ writer }: { writer: boolean }) {
  const transfers = useJournalTransfers();
  const tenants = useAgentosTenants();
  const create = useCreateJournalTransfer();
  const createExport = useCreateJournalExport();
  const posted = useMarkJournalPosted();
  const [nextKey, setNextKey] = useState(3);
  const [grid, setGrid] = useState<Row[]>([emptyRow(1), emptyRow(2)]);
  const [description, setDescription] = useState('');
  const [nominalCode, setNominalCode] = useState('');
  const [requestId, setRequestId] = useState(() => globalThis.crypto.randomUUID());
  const [exported, setExported] = useState<JournalExport | null>(null);

  const tenantList = tenants.data ?? [];
  const amounts = grid.map((r) => signedPence(r.amount));
  const allAmountsOk = amounts.every((a) => a !== null && a !== 0);
  const totalPence = amounts.reduce<number>((sum, a) => sum + (a ?? 0), 0);
  const ready =
    grid.length >= 2 &&
    grid.length <= 20 &&
    allAmountsOk &&
    totalPence === 0 &&
    grid.every((r) => r.tid !== null && r.accountType.trim() !== '') &&
    description.trim() !== '' &&
    nominalCode.trim() !== '';
  const rows = transfers.data ?? [];
  const pending = rows.filter((t) => t.postingStatus === 'not_exported').length;

  const patchRow = (key: number, patch: Partial<Row>) => setGrid((g) => g.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => {
    setGrid((g) => [...g, emptyRow(nextKey)]);
    setNextKey((k) => k + 1);
  };

  const submit = () => {
    if (!ready) return;
    const entries = grid.map((r, i) => ({
      agentosTenantId: tenantList.find((t) => t.tid === r.tid)?.id ?? '',
      accountType: r.accountType.trim(),
      amountPence: amounts[i] ?? 0,
    }));
    if (entries.some((e) => e.agentosTenantId === '')) return;
    create.mutate(
      { clientRequestId: requestId, description: description.trim(), nominalCode: nominalCode.trim(), entries },
      {
        onSuccess: () => {
          setGrid([emptyRow(nextKey), emptyRow(nextKey + 1)]);
          setNextKey((k) => k + 2);
          setDescription('');
          setNominalCode('');
          setRequestId(globalThis.crypto.randomUUID());
        },
      },
    );
  };

  return (
    <Stack gap="md">
      <Title order={3}>Journal transfers</Title>
      {writer && (
        <Stack gap="xs">
          <Group align="flex-end">
            <TextInput label="Description" value={description} onChange={(e) => setDescription(e.currentTarget.value)} w={320} />
            <TextInput label="Nominal Code" value={nominalCode} onChange={(e) => setNominalCode(e.currentTarget.value)} />
          </Group>
          <Table.ScrollContainer minWidth={900}>
            <Table withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Person</Table.Th>
                  <Table.Th>Branch</Table.Th>
                  <Table.Th>Property</Table.Th>
                  <Table.Th>Account Type</Table.Th>
                  <Table.Th>Account Balance</Table.Th>
                  <Table.Th>Amount</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {grid.map((r, i) => (
                  <JournalRow
                    key={r.key}
                    row={r}
                    index={i}
                    tenants={tenantList}
                    canRemove={grid.length > 2}
                    onChange={(patch) => patchRow(r.key, patch)}
                    onRemove={() => setGrid((g) => g.filter((x) => x.key !== r.key))}
                  />
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Group align="center">
            <Button variant="light" onClick={addRow} disabled={grid.length >= 20}>
              Add row
            </Button>
            <Text fw={500} data-testid="journal-total" c={totalPence === 0 ? 'green' : 'red'}>
              Total {gbp(totalPence)}
            </Text>
            <Button onClick={submit} disabled={!ready} loading={create.isPending}>
              Create transfer
            </Button>
          </Group>
          {create.isError && (
            <Alert color="red" role="alert">
              {errorMessage(create.error)}
            </Alert>
          )}
          <Group align="center">
            <Button
              onClick={() => createExport.mutate(undefined, { onSuccess: (e) => setExported(e) })}
              disabled={pending === 0}
              loading={createExport.isPending}
            >
              Export journal transfers ({pending})
            </Button>
          </Group>
          {createExport.isError && (
            <Alert color="red" role="alert">
              {errorMessage(createExport.error)}
            </Alert>
          )}
          {posted.isError && (
            <Alert color="red" role="alert">
              {errorMessage(posted.error)}
            </Alert>
          )}
          {exported && (
            <Alert color="green" role="status">
              Exported {exported.transfersTotal} transfer(s){' '}
              <Anchor href={journalCsvUrl(exported.id)} download>
                Download journal CSV
              </Anchor>
            </Alert>
          )}
        </Stack>
      )}
      {transfers.isError && (
        <Alert color="red" role="alert">
          {errorMessage(transfers.error)}
        </Alert>
      )}
      {rows.length === 0 ? (
        <Text c="dimmed">No journal transfers yet</Text>
      ) : (
        <Table.ScrollContainer minWidth={900}>
          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Created</Table.Th>
                <Table.Th>Entries</Table.Th>
                <Table.Th>Amount</Table.Th>
                <Table.Th>Description</Table.Th>
                <Table.Th>Nominal Code</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((t) => (
                <Table.Tr key={t.id} data-testid={`journal-${t.id}`}>
                  <Table.Td>{t.createdAt.slice(0, 10)}</Table.Td>
                  <Table.Td>
                    {t.entries.map((e) => (
                      <div key={e.lineNo}>
                        {e.tid} {e.person} {e.accountType} {gbp(e.amountPence)}
                      </div>
                    ))}
                  </Table.Td>
                  <Table.Td>{gbp(t.amountPence)}</Table.Td>
                  <Table.Td>{t.description}</Table.Td>
                  <Table.Td>{t.nominalCode}</Table.Td>
                  <Table.Td>
                    <Badge color={COLOUR[t.postingStatus]} variant="light">
                      {JOURNAL_STATUS_LABELS[t.postingStatus]}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {writer && t.postingStatus === 'exported' && (
                      <Button size="xs" variant="light" onClick={() => posted.mutate(t.id)}>
                        Mark posted
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}
