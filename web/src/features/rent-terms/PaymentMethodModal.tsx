import { Alert, Button, Group, Modal, NativeSelect, Stack, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { errorMessage } from '../../lib/api';
import { FREQUENCY_OPTIONS, PAYER_LABEL, PAY_METHOD_OPTIONS, useAddMethod, type Frequency, type Payer } from './api';
import type { ModalProps } from './BenefitAwardModal';
import { parsePounds } from './money';

export function PaymentMethodModal({ tid, opened, onClose }: ModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="Add payment method">
      <MethodForm tid={tid} onDone={onClose} />
    </Modal>
  );
}

function MethodForm({ tid, onDone }: { tid: string; onDone: () => void }) {
  const add = useAddMethod(tid);
  const [payer, setPayer] = useState<Payer>('tenant');
  const [method, setMethod] = useState('standing_order');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency | ''>('');
  const [day, setDay] = useState('');
  const [hint, setHint] = useState('');
  const [from, setFrom] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    let expectedPence: number | null = null;
    if (amount.trim()) {
      expectedPence = parsePounds(amount);
      if (expectedPence === null) return setProblem('Enter the expected amount as pounds, e.g. 40 or 40.50');
    }
    const expectedDay = day.trim() ? Number(day) : null;
    if (expectedDay !== null && (!Number.isInteger(expectedDay) || expectedDay < 1 || expectedDay > 31)) return setProblem('Expected day must be 1 to 31');
    if (!from) return setProblem('Choose the date the method starts');
    setProblem(null);
    add.mutate(
      {
        payer,
        method,
        expectedPence,
        expectedFrequency: frequency === '' ? null : frequency,
        expectedDay,
        referenceHint: hint.trim() || null,
        effectiveFrom: from,
      },
      {
        onSuccess: () => {
          notifications.show({ color: 'teal', title: 'Payment method added', message: 'Saved.' });
          onDone();
        },
      },
    );
  };

  const message = problem ?? (add.isError ? errorMessage(add.error) : null);
  return (
    <form noValidate onSubmit={submit}>
      <Stack gap="md">
        <NativeSelect
          label="Payer"
          value={payer}
          onChange={(e) => setPayer(e.currentTarget.value as Payer)}
          data={(Object.keys(PAYER_LABEL) as Payer[]).map((p) => ({ value: p, label: PAYER_LABEL[p] }))}
        />
        <NativeSelect label="Method" value={method} onChange={(e) => setMethod(e.currentTarget.value)} data={PAY_METHOD_OPTIONS} />
        <Group grow align="flex-start">
          <TextInput label="Expected amount (£)" value={amount} onChange={(e) => setAmount(e.currentTarget.value)} />
          <NativeSelect
            label="Expected cycle"
            value={frequency}
            onChange={(e) => setFrequency(e.currentTarget.value as Frequency | '')}
            data={[{ value: '', label: 'Not set' }, ...FREQUENCY_OPTIONS]}
          />
        </Group>
        <Group grow align="flex-start">
          <TextInput label="Expected day of month" value={day} onChange={(e) => setDay(e.currentTarget.value)} />
          <TextInput label="Reference hint" maxLength={50} value={hint} onChange={(e) => setHint(e.currentTarget.value)} />
        </Group>
        <TextInput type="date" label="Effective from" required value={from} onChange={(e) => setFrom(e.currentTarget.value)} />
        {message && <Alert color="red">{message}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={add.isPending}>
            Add payment method
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
