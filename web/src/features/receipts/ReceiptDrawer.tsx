import { Alert, Button, Divider, Drawer, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { StatusBadge, DataTable, type DataTableColumn } from '../../components';
import { errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { formatPence } from '../rent-terms/money';
import { PAYER_LABEL, XERO_LABEL, useReceipt, useReverseReceipt, type ReceiptDetail } from './api';
import { AllocationEditor } from './AllocationEditor';

type Allocation = ReceiptDetail['allocations'][number];
const allocationColumns: DataTableColumn<Allocation>[] = [
  { key: 'period', header: 'Rent period', cell: (a) => formatDate(a.periodStart) },
  { key: 'due', header: 'Due', cell: (a) => formatDate(a.dueDate) },
  { key: 'amount', header: 'Amount', align: 'right', cell: (a) => formatPence(a.amountPence) },
  { key: 'by', header: 'Allocated by', cell: (a) => (a.allocatedBy === 'auto_oldest_first' ? 'Automatic' : a.allocatedBy) },
];

export function ReceiptDrawer({ receiptId, onClose }: { receiptId: string | null; onClose: () => void }) {
  const receipt = useReceipt(receiptId);
  return (
    <Drawer opened={receiptId !== null} onClose={onClose} position="right" size="lg" title={receipt.data ? `Receipt ${receipt.data.tid}` : 'Receipt'}>
      {receipt.isError && <Alert color="red">{errorMessage(receipt.error)}</Alert>}
      {receipt.data && <Body key={receipt.data.id} receipt={receipt.data} />}
    </Drawer>
  );
}

function Body({ receipt }: { receipt: ReceiptDetail }) {
  const active = receipt.status === 'active';
  return (
    <Stack gap="md">
      <Group gap="sm">
        <StatusBadge tone={active ? 'success' : 'neutral'} label={active ? 'Active' : 'Reversed'} />
        <Text fz="sm">
          {PAYER_LABEL[receipt.payer]} · {formatPence(receipt.amountPence)} · received {formatDate(receipt.receivedOn)}
        </Text>
      </Group>
      <Text fz="sm" c="dimmed">
        Xero: {XERO_LABEL[receipt.xeroState]} · Vico: {receipt.vicoExported ? 'Exported' : 'Not exported'} · Allocation:{' '}
        {receipt.allocationMode === 'manual' ? 'By hand' : 'Automatic'}
        {receipt.bankLine ? ` · Bank line: ${receipt.bankLine.description}` : ''}
      </Text>
      {!active && (
        <Alert color="gray" title="Reversed">
          {receipt.reversedReason}
          {receipt.externalCorrection ? ` (${receipt.externalCorrection})` : ''}
        </Alert>
      )}

      <Divider />
      <Title order={3} fz="sm">
        Allocations
      </Title>
      <DataTable
        caption="Receipt allocations"
        data={receipt.allocations}
        columns={allocationColumns}
        getRowId={(a) => a.id}
        minWidth={420}
        empty={<Text fz="sm" c="dimmed">Nothing is allocated to rent; the money is held as credit.</Text>}
      />
      {active && (
        <>
          <Title order={3} fz="sm">
            Change allocations
          </Title>
          <AllocationEditor key={receipt.allocations.map((a) => `${a.rentChargeId}:${a.amountPence}`).join('|')} receipt={receipt} />
          <Divider />
          <ReverseForm receipt={receipt} />
        </>
      )}
    </Stack>
  );
}

function ReverseForm({ receipt }: { receipt: ReceiptDetail }) {
  const reverse = useReverseReceipt(receipt.id);
  const [reason, setReason] = useState('');
  const [xeroRef, setXeroRef] = useState('');
  const [vicoNote, setVicoNote] = useState('');
  const blocked = receipt.xeroState === 'sending' || receipt.xeroState === 'stuck';
  const needsXero = receipt.xeroState === 'sent';
  const needsVico = receipt.vicoExported;
  const ready = reason.trim().length >= 3 && (!needsXero || xeroRef.trim() !== '') && (!needsVico || vicoNote.trim() !== '') && !blocked;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        reverse.mutate(
          { reason: reason.trim(), xeroCreditRef: needsXero ? xeroRef.trim() : undefined, vicoNote: needsVico ? vicoNote.trim() : undefined },
          { onSuccess: () => notifications.show({ color: 'teal', title: 'Receipt reversed', message: 'The bank line is back for review.' }) },
        );
      }}
    >
      <Stack gap="sm">
        <Title order={3} fz="sm">
          Reverse this receipt
        </Title>
        {blocked && (
          <Alert color="orange">
            {receipt.xeroState === 'sending'
              ? 'This receipt is being sent to Xero. Sort it out on the Xero page first.'
              : 'Its Xero batch failed. Sort it out on the Xero page first.'}
          </Alert>
        )}
        <TextInput label="Reason" required value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
        {needsXero && (
          <TextInput
            label="Xero credit note number"
            description="This receipt is already in Xero. Raise a credit note there and enter its number."
            required
            value={xeroRef}
            onChange={(e) => setXeroRef(e.currentTarget.value)}
          />
        )}
        {needsVico && (
          <TextInput
            label="Vico correction note"
            description="This receipt was exported to Vico. Say how it was corrected there."
            required
            value={vicoNote}
            onChange={(e) => setVicoNote(e.currentTarget.value)}
          />
        )}
        {reverse.isError && <Alert color="red">{errorMessage(reverse.error)}</Alert>}
        <Group justify="flex-end">
          <Button type="submit" color="red" disabled={!ready} loading={reverse.isPending}>
            Reverse receipt
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
