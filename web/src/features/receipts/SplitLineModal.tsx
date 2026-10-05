import { Alert, Button, Group, Modal, NativeSelect, Stack, Tabs, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { errorMessage } from '../../lib/api';
import { formatPence, parsePounds } from '../rent-terms/money';
import { PAYER_OPTIONS, useBankLine, useSplitLine, type Payer } from './api';
import { RemittanceUpload } from './RemittanceUpload';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PartDraft {
  key: number;
  tid: string;
  payer: Payer;
  amount: string;
}

export interface SplitLineModalProps {
  opened: boolean;
  onClose: () => void;
  /** Bank line id from the page URL (?line=). */
  initialLineId?: string;
}

/** Split one bank line into receipts for several tenancies, by hand or from a remittance file. */
export function SplitLineModal({ opened, onClose, initialLineId }: SplitLineModalProps) {
  const [lineText, setLineText] = useState(initialLineId ?? '');
  const lineId = UUID.test(lineText.trim()) ? lineText.trim() : null;
  const line = useBankLine(lineId);

  return (
    <Modal opened={opened} onClose={onClose} title="Split a bank line" size="xl">
      <Stack gap="md">
        <TextInput label="Bank line id" description="Open a line in the review queue to copy its id" value={lineText} onChange={(e) => setLineText(e.currentTarget.value)} />
        {lineId && line.isError && <Alert color="red">{errorMessage(line.error)}</Alert>}
        {line.data && (
          <Text fz="sm">
            {line.data.txnDate} · {line.data.description} · {formatPence(line.data.amountPence)} ({formatPence(line.data.remainingPence)} not yet applied to a tenancy)
          </Text>
        )}
        {line.data && (
          <Tabs defaultValue="hand" keepMounted={false}>
            <Tabs.List>
              <Tabs.Tab value="hand">Split by hand</Tabs.Tab>
              <Tabs.Tab value="upload">Upload remittance</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="hand" pt="md">
              <ByHand lineId={line.data.id} remainingPence={line.data.remainingPence} onDone={onClose} />
            </Tabs.Panel>
            <Tabs.Panel value="upload" pt="md">
              <RemittanceUpload lineId={line.data.id} onDone={onClose} />
            </Tabs.Panel>
          </Tabs>
        )}
      </Stack>
    </Modal>
  );
}

function ByHand({ lineId, remainingPence, onDone }: { lineId: string; remainingPence: number; onDone: () => void }) {
  const split = useSplitLine();
  const [nextKey, setNextKey] = useState(3);
  const [parts, setParts] = useState<PartDraft[]>([
    { key: 1, tid: '', payer: 'tenant', amount: '' },
    { key: 2, tid: '', payer: 'tenant', amount: '' },
  ]);

  const pence = parts.map((p) => parsePounds(p.amount));
  const sum = pence.reduce<number>((s, p) => s + (p ?? 0), 0);
  const left = remainingPence - sum;
  const complete = parts.every((p, i) => p.tid.trim() !== '' && (pence[i] ?? 0) > 0);
  const canSave = left === 0 && complete && parts.length >= 2 && !split.isPending;

  const update = (key: number, patch: Partial<PartDraft>) => setParts((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) return;
        split.mutate(
          { bankTransactionId: lineId, parts: parts.map((p, i) => ({ tid: p.tid.trim().toUpperCase(), payer: p.payer, amountPence: pence[i]! })) },
          {
            onSuccess: () => {
              notifications.show({ color: 'teal', title: 'Bank line split', message: 'The receipts have been created.' });
              onDone();
            },
          },
        );
      }}
    >
      <Stack gap="sm">
        {parts.map((p, i) => (
          <Group key={p.key} align="flex-end" gap="sm" wrap="nowrap">
            <TextInput label={i === 0 ? 'TID' : undefined} aria-label={`TID ${i + 1}`} placeholder="T1234" value={p.tid} onChange={(e) => update(p.key, { tid: e.currentTarget.value })} w={120} />
            <NativeSelect
              label={i === 0 ? 'Payer' : undefined}
              aria-label={`Payer ${i + 1}`}
              data={PAYER_OPTIONS}
              value={p.payer}
              onChange={(e) => update(p.key, { payer: e.currentTarget.value as Payer })}
            />
            <TextInput label={i === 0 ? 'Amount (£)' : undefined} aria-label={`Amount ${i + 1}`} placeholder="0.00" value={p.amount} onChange={(e) => update(p.key, { amount: e.currentTarget.value })} w={120} />
            <Button
              variant="subtle"
              color="gray"
              aria-label={`Remove part ${i + 1}`}
              disabled={parts.length <= 2}
              onClick={() => setParts((ps) => ps.filter((x) => x.key !== p.key))}
            >
              <IconTrash size={16} aria-hidden />
            </Button>
          </Group>
        ))}
        <Group justify="space-between">
          <Button
            variant="default"
            leftSection={<IconPlus size={14} aria-hidden />}
            onClick={() => {
              setParts((ps) => [...ps, { key: nextKey, tid: '', payer: 'tenant', amount: '' }]);
              setNextKey((k) => k + 1);
            }}
          >
            Add part
          </Button>
          <Text fw={600} className="tabular" aria-live="polite">
            Left to split {formatPence(left)}
          </Text>
        </Group>
        {split.isError && <Alert color="red">{errorMessage(split.error)}</Alert>}
        <Group justify="flex-end">
          <Button type="submit" disabled={!canSave} loading={split.isPending}>
            Save split
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
