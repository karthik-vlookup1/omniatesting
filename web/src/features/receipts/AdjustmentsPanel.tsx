import { Alert, Button, Card, Group, NativeSelect, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { DataTable, type DataTableColumn } from '../../components';
import { errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { formatPence, parsePounds } from '../rent-terms/money';
import { PAYER_LABEL, PAYER_OPTIONS, useAdjustments, useCreateAdjustment, useReverseAdjustment, type AdjustmentRow, type Payer } from './api';

const KIND_LABEL: Record<string, string> = {
  write_off: 'Write-off',
  refund_paid: 'Refund',
  correction: 'Reversal',
  credit_note: 'Credit note',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  opening_balance: 'Opening balance',
};

/** Look up a tenancy by TID: balances per payer, write-offs and refunds, and the history with Reverse. */
export function AdjustmentsPanel() {
  const [search, setSearch] = useState('');
  const [tid, setTid] = useState<string | null>(null);
  const data = useAdjustments(tid);
  const [form, setForm] = useState<'write_off' | 'refund' | null>(null);
  const [reversing, setReversing] = useState<string | null>(null);

  const columns: DataTableColumn<AdjustmentRow>[] = [
    { key: 'date', header: 'Date', cell: (a) => formatDate(a.effectiveOn) },
    { key: 'kind', header: 'Type', cell: (a) => KIND_LABEL[a.kind] ?? a.kind },
    { key: 'payer', header: 'Payer', cell: (a) => PAYER_LABEL[a.payer] },
    { key: 'amount', header: 'Amount', align: 'right', cell: (a) => formatPence(a.amountPence) },
    { key: 'reason', header: 'Reason', cell: (a) => a.reason },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      cell: (a) =>
        (a.kind === 'write_off' || a.kind === 'refund_paid') && !a.reversedByAdjustmentId ? (
          <Button size="xs" variant="default" aria-label={`Reverse ${KIND_LABEL[a.kind]!.toLowerCase()} of ${formatPence(Math.abs(a.amountPence))}`} onClick={() => setReversing(a.id)}>
            Reverse
          </Button>
        ) : a.reversedByAdjustmentId ? (
          <Text fz="xs" c="dimmed">
            Reversed
          </Text>
        ) : null,
    },
  ];

  return (
    <Card>
      <Stack gap="md">
        <Title order={2} fz="md">
          Write-offs and refunds
        </Title>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const t = search.trim().toUpperCase();
            if (t) {
              setTid(t);
              setForm(null);
              setReversing(null);
            }
          }}
        >
          <Group align="flex-end" gap="sm">
            <TextInput label="Tenancy (TID)" placeholder="T1234" value={search} onChange={(e) => setSearch(e.currentTarget.value)} w={160} />
            <Button type="submit" variant="default">
              Look up
            </Button>
          </Group>
        </form>
        {data.isError && <Alert color="red">{errorMessage(data.error)}</Alert>}
        {data.data && (
          <Stack gap="sm">
            <Group gap="xl">
              {data.data.balances.length === 0 && <Text fz="sm" c="dimmed">No balance on {data.data.tid} yet.</Text>}
              {data.data.balances.map((b) => (
                <Stack key={b.payer} gap={0}>
                  <Text fz="xs" c="dimmed">
                    {PAYER_LABEL[b.payer]} {b.balancePence < 0 ? 'credit' : 'arrears'}
                  </Text>
                  <Text fz="lg" fw={600} className="tabular">
                    {formatPence(Math.abs(b.balancePence))}
                  </Text>
                </Stack>
              ))}
            </Group>
            <Group>
              <Button variant="default" onClick={() => setForm('write_off')}>
                Write off
              </Button>
              <Button variant="default" onClick={() => setForm('refund')}>
                Record refund
              </Button>
            </Group>
            {form && <AdjustmentForm key={form} tid={data.data.tid} kind={form} onDone={() => setForm(null)} />}
            {reversing && <ReverseForm key={reversing} id={reversing} onDone={() => setReversing(null)} />}
            <DataTable caption="Adjustment history" data={data.data.adjustments} columns={columns} getRowId={(a) => a.id} minWidth={640} empty={<Text fz="sm" c="dimmed">No write-offs or refunds yet.</Text>} />
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

function AdjustmentForm({ tid, kind, onDone }: { tid: string; kind: 'write_off' | 'refund'; onDone: () => void }) {
  const create = useCreateAdjustment();
  const [payer, setPayer] = useState<Payer>('tenant');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const pence = parsePounds(amount);
  const ready = pence !== null && pence > 0 && reason.trim().length >= 3;
  const label = kind === 'write_off' ? 'Write off' : 'Record refund';
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        create.mutate(
          { tid, payer, kind, amountPence: pence, reason: reason.trim() },
          {
            onSuccess: () => {
              notifications.show({ color: 'teal', title: kind === 'write_off' ? 'Written off' : 'Refund recorded', message: `${tid} has been updated.` });
              onDone();
            },
          },
        );
      }}
    >
      <Stack gap="sm">
        <Group align="flex-end" gap="sm" wrap="wrap">
          <NativeSelect label="Payer" data={PAYER_OPTIONS} value={payer} onChange={(e) => setPayer(e.currentTarget.value as Payer)} />
          <TextInput label="Amount (£)" value={amount} onChange={(e) => setAmount(e.currentTarget.value)} w={120} />
          <TextInput label="Reason" value={reason} onChange={(e) => setReason(e.currentTarget.value)} style={{ flex: 1, minWidth: 200 }} />
        </Group>
        {create.isError && <Alert color="red">{errorMessage(create.error)}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={!ready} loading={create.isPending}>
            {label}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function ReverseForm({ id, onDone }: { id: string; onDone: () => void }) {
  const reverse = useReverseAdjustment();
  const [reason, setReason] = useState('');
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (reason.trim().length < 3) return;
        reverse.mutate({ id, reason: reason.trim() }, { onSuccess: onDone });
      }}
    >
      <Stack gap="sm">
        <TextInput label="Reason for reversing" value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
        {reverse.isError && <Alert color="red">{errorMessage(reverse.error)}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={reason.trim().length < 3} loading={reverse.isPending}>
            Confirm reversal
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
