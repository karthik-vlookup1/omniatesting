import { Alert, Button, Group, Modal, NativeSelect, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { useConfirmAction } from '../../components';
import { errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { FREQUENCY_OPTIONS, useAddAward, type AwardInput, type Frequency } from './api';
import { parsePounds } from './money';

export interface ModalProps {
  tid: string;
  opened: boolean;
  onClose: () => void;
}

export function BenefitAwardModal({ tid, opened, onClose }: ModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="Add benefit award">
      <AwardForm tid={tid} onDone={onClose} />
    </Modal>
  );
}

function AwardForm({ tid, onDone }: { tid: string; onDone: () => void }) {
  const confirm = useConfirmAction();
  const add = useAddAward(tid);
  const [benefit, setBenefit] = useState<AwardInput['benefit']>('HB');
  const [payingBody, setPayingBody] = useState('');
  const [claimReference, setClaimReference] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('weekly');
  const [paidTo, setPaidTo] = useState<AwardInput['paidTo']>('landlord_direct');
  const [from, setFrom] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const awardPence = parsePounds(amount);
    if (!payingBody.trim()) return setProblem('Enter the paying body');
    if (awardPence === null) return setProblem('Enter the award as pounds, e.g. 60 or 60.50');
    if (!from) return setProblem('Choose the date the award starts');
    setProblem(null);
    confirm.ask({ title: 'Add this benefit award?', message: `${benefit} award of £${amount.trim()} from ${formatDate(from)}, paid by ${payingBody.trim()}.`, confirmLabel: 'Add award' }, () =>
      add.mutate(
        { benefit, payingBody: payingBody.trim(), claimReference: claimReference.trim() || null, awardPence, awardFrequency: frequency, paidTo, effectiveFrom: from },
        {
          onSuccess: () => {
            notifications.show({ color: 'teal', title: 'Award added', message: `${benefit} award saved.` });
            onDone();
          },
        },
      ),
    );
  };

  const message = problem ?? (add.isError ? errorMessage(add.error) : null);
  return (
    <form noValidate onSubmit={submit}>
      {confirm.dialog}
      <Stack gap="md">
        <NativeSelect label="Benefit" value={benefit} onChange={(e) => setBenefit(e.currentTarget.value as AwardInput['benefit'])} data={['HB', 'UC', 'DHP']} />
        <TextInput label="Paying body" required value={payingBody} onChange={(e) => setPayingBody(e.currentTarget.value)} />
        <TextInput label="Claim reference" value={claimReference} onChange={(e) => setClaimReference(e.currentTarget.value)} />
        <Group grow align="flex-start">
          <TextInput label="Award (£)" required value={amount} onChange={(e) => setAmount(e.currentTarget.value)} />
          <NativeSelect label="Award cycle" value={frequency} onChange={(e) => setFrequency(e.currentTarget.value as Frequency)} data={FREQUENCY_OPTIONS} />
        </Group>
        <NativeSelect
          label="Paid to"
          value={paidTo}
          onChange={(e) => setPaidTo(e.currentTarget.value as AwardInput['paidTo'])}
          data={[
            { value: 'landlord_direct', label: 'Landlord direct' },
            { value: 'tenant', label: 'Tenant' },
          ]}
        />
        <TextInput type="date" label="Effective from" required value={from} onChange={(e) => setFrom(e.currentTarget.value)} />
        <Text fz="xs" c="dimmed">
          An award paid direct to the landlord becomes the paying body&apos;s share of each rent period; the tenant owes the rest.
        </Text>
        {message && <Alert color="red">{message}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={add.isPending}>
            Add award
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
