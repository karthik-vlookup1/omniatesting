import { Alert, Anchor, Badge, Button, Group, NumberInput, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { errorMessage } from '../../lib/api';
import {
  gbp,
  journalCsvUrl,
  JOURNAL_STATUS_LABELS,
  useAgentosTenants,
  useCreateJournalExport,
  useCreateJournalTransfer,
  useJournalTransfers,
  useMarkJournalPosted,
  type JournalExport,
} from './api';

const COLOUR = { not_exported: 'gray', exported: 'blue', posted: 'green' } as const;

export function JournalSection({ writer }: { writer: boolean }) {
  const transfers = useJournalTransfers();
  const tenants = useAgentosTenants();
  const create = useCreateJournalTransfer();
  const createExport = useCreateJournalExport();
  const posted = useMarkJournalPosted();
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | string>('');
  const [description, setDescription] = useState('');
  const [nominalCode, setNominalCode] = useState('');
  const [accountType, setAccountType] = useState('');
  const [exported, setExported] = useState<JournalExport | null>(null);

  const options = (tenants.data ?? []).map((t) => ({ value: t.tid, label: t.name }));
  const amountNumber = typeof amount === 'number' ? amount : Number.NaN;
  const ready =
    from !== null &&
    to !== null &&
    from !== to &&
    amountNumber > 0 &&
    description.trim() !== '' &&
    nominalCode.trim() !== '' &&
    accountType.trim() !== '';
  const rows = transfers.data ?? [];
  const pending = rows.filter((t) => t.postingStatus === 'not_exported').length;

  const submit = () => {
    if (!ready) return;
    create.mutate(
      { fromTid: from, toTid: to, amountPence: Math.round(amountNumber * 100), description, nominalCode, accountType },
      {
        onSuccess: () => {
          setAmount('');
          setDescription('');
          setNominalCode('');
          setAccountType('');
        },
      },
    );
  };

  return (
    <Stack gap="md">
      <Title order={2} fz="md">
        Journal transfers
      </Title>
      {writer && (
        <Stack gap="xs">
          <Group align="flex-end">
            <Select label="From tenant" searchable data={options} value={from} onChange={setFrom} w={260} />
            <Select label="To tenant" searchable data={options} value={to} onChange={setTo} w={260} />
            <NumberInput
              label="Amount (£)"
              min={0.01}
              decimalScale={2}
              fixedDecimalScale
              value={amount}
              onChange={setAmount}
              w={140}
            />
          </Group>
          <Group align="flex-end">
            <TextInput label="Description" value={description} onChange={(e) => setDescription(e.currentTarget.value)} />
            <TextInput label="Nominal Code" value={nominalCode} onChange={(e) => setNominalCode(e.currentTarget.value)} />
            <TextInput label="Account Type" value={accountType} onChange={(e) => setAccountType(e.currentTarget.value)} />
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
                <Table.Th>From</Table.Th>
                <Table.Th>To</Table.Th>
                <Table.Th>Amount</Table.Th>
                <Table.Th>Description</Table.Th>
                <Table.Th>Nominal Code</Table.Th>
                <Table.Th>Account Type</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((t) => (
                <Table.Tr key={t.id} data-testid={`journal-${t.id}`}>
                  <Table.Td>{t.createdAt.slice(0, 10)}</Table.Td>
                  <Table.Td>{t.fromTid}</Table.Td>
                  <Table.Td>{t.toTid}</Table.Td>
                  <Table.Td>{gbp(t.amountPence)}</Table.Td>
                  <Table.Td>{t.description}</Table.Td>
                  <Table.Td>{t.nominalCode}</Table.Td>
                  <Table.Td>{t.accountType}</Table.Td>
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
