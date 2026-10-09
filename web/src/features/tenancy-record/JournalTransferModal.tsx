import { Alert, Select, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { ConfirmDialog } from '../../components';
import { errorMessage } from '../../lib/api';
import { useAgentosTenants, useCreateJournalTransfer } from '../agentos/api';
import { formatPence, parsePounds } from '../rent-terms/money';
import { ActionModal } from './ActionModal';
import { agentosTid } from './recordModel';

interface Props {
  tid: string;
  title: string;
  opened: boolean;
  onClose: () => void;
}

interface Values {
  description: string;
  nominalCode: string;
  accountType: string;
  toTid: string | null;
  amount: string;
}

/**
 * LetMC "Journal Transfer" (guide: journal transfer.png) on Recon's agentOS journal API
 * (POST /api/agentos/journal/transfers, writers). Moves an amount from this tenant's agentOS
 * account to another one: it sends two entries (-amount from this tenant, +amount to the other) that net to zero
 * (recon-602 entries API); the server builds the export file.
 */
export function JournalTransferModal({ tid, title, opened, onClose }: Props) {
  const tenants = useAgentosTenants();
  const create = useCreateJournalTransfer();
  const [pending, setPending] = useState<Values | null>(null);
  const [requestId, setRequestId] = useState(() => globalThis.crypto.randomUUID());
  const fromTid = agentosTid(tid);
  const from = tenants.data?.find((t) => t.tid === fromTid) ?? null;

  const form = useForm<Values>({
    mode: 'controlled',
    initialValues: { description: '', nominalCode: '', accountType: '', toTid: null, amount: '' },
    validate: {
      description: (v) => (!v.trim() ? 'Enter a description' : v.trim().length > 200 ? 'Keep it under 200 characters' : null),
      nominalCode: (v) => (!v.trim() ? 'Enter the nominal code' : null),
      accountType: (v) => (!v.trim() ? 'Enter the account type' : null),
      toTid: (v) => (!v ? 'Choose the tenant to move the money to' : v === fromTid ? 'Choose a different tenant' : null),
      amount: (v) => (parsePounds(v) === null || parsePounds(v) === 0 ? 'Enter an amount in pounds, e.g. 120 or 120.50' : null),
    },
  });

  const options = (tenants.data ?? [])
    .filter((t) => t.tid !== fromTid)
    .map((t) => ({ value: t.tid, label: `${t.tid} ${t.name}` }));
  const to = tenants.data?.find((t) => t.tid === form.values.toTid) ?? null;
  const amountPence = parsePounds(form.values.amount) ?? 0;

  const close = () => {
    form.reset();
    create.reset();
    setPending(null);
    setRequestId(globalThis.crypto.randomUUID());
    onClose();
  };

  const confirm = () => {
    const toTenant = tenants.data?.find((t) => t.tid === pending?.toTid) ?? null;
    if (!pending || !from || !toTenant) return;
    const pence = parsePounds(pending.amount)!;
    const accountType = pending.accountType.trim();
    create.mutate(
      {
        clientRequestId: requestId,
        description: pending.description.trim(),
        nominalCode: pending.nominalCode.trim(),
        entries: [
          { agentosTenantId: from.id, accountType, amountPence: -pence },
          { agentosTenantId: toTenant.id, accountType, amountPence: pence },
        ],
      },
      {
        onSuccess: () => {
          notifications.show({
            color: 'teal',
            title: 'Journal transfer created',
            message: `${formatPence(pence)} from ${fromTid} to ${pending.toTid}. Export it from agentOS receipts.`,
          });
          setRequestId(globalThis.crypto.randomUUID());
          close();
        },
        onError: () => setPending(null),
      },
    );
  };

  const notInAgentos = tenants.isSuccess && !from;

  return (
    <>
      <ActionModal
        opened={opened}
        onClose={close}
        title="Journal Transfer"
        size="xl"
        submitLabel="Journal Transfer"
        submitDisabled={notInAgentos}
        onSubmit={form.onSubmit((values) => setPending(values))}
        loading={create.isPending}
        error={create.isError ? errorMessage(create.error) : tenants.isError ? errorMessage(tenants.error) : null}
      >
        <Stack gap="md">
          {notInAgentos && (
            <Alert color="orange" title="Not in the agentOS tenant list">
              Journal transfers move money between agentOS tenant accounts, and {title} has no agentOS record (TID {fromTid}).
              Run the agentOS sync, or start the transfer from agentOS receipts.
            </Alert>
          )}
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <TextInput label="Description" withAsterisk {...form.getInputProps('description')} />
            <TextInput label="Nominal Code" withAsterisk {...form.getInputProps('nominalCode')} />
            <TextInput label="Account Type" withAsterisk {...form.getInputProps('accountType')} />
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <TextInput label="From tenant" value={from ? `${from.tid} ${from.name}` : `${fromTid} (${title})`} readOnly variant="filled" />
            <Select
              label="To tenant"
              placeholder={tenants.isPending ? 'Loading tenants…' : 'Search TID or name'}
              searchable
              withAsterisk
              data={options}
              nothingFoundMessage="No agentOS tenant matches"
              {...form.getInputProps('toTid')}
            />
            <TextInput label="Amount (£)" placeholder="0.00" withAsterisk inputMode="decimal" {...form.getInputProps('amount')} />
          </SimpleGrid>

          <Stack gap={6}>
            <Text fz="sm" fw={600}>
              Journal entries
            </Text>
            <Table withTableBorder aria-label="Journal entries" verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Person</Table.Th>
                  <Table.Th>Account type</Table.Th>
                  <Table.Th ta="right">Amount</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td>{from ? `${from.tid} ${from.name}` : `${fromTid} ${title}`}</Table.Td>
                  <Table.Td>{form.values.accountType || '—'}</Table.Td>
                  <Table.Td ta="right" c="red.8" className="tabular">
                    {formatPence(-amountPence)}
                  </Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>{to ? `${to.tid} ${to.name}` : <Text span c="dimmed">Choose the tenant to credit</Text>}</Table.Td>
                  <Table.Td>{form.values.accountType || '—'}</Table.Td>
                  <Table.Td ta="right" className="tabular">
                    {formatPence(amountPence)}
                  </Table.Td>
                </Table.Tr>
              </Table.Tbody>
              <Table.Tfoot>
                <Table.Tr>
                  <Table.Th colSpan={2}>Net (always zero)</Table.Th>
                  <Table.Th ta="right" className="tabular">
                    {formatPence(0)}
                  </Table.Th>
                </Table.Tr>
              </Table.Tfoot>
            </Table>
          </Stack>
        </Stack>
      </ActionModal>
      <ConfirmDialog
        opened={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={confirm}
        loading={create.isPending}
        title="Create this journal transfer?"
        message={
          pending && (
            <>
              Move <b>{formatPence(parsePounds(pending.amount) ?? 0)}</b> from <b>{fromTid}</b> to <b>{pending.toTid}</b> (
              {pending.description.trim()}). It is added to the next journal export for agentOS.
            </>
          )
        }
        confirmLabel="Create transfer"
      />
    </>
  );
}
