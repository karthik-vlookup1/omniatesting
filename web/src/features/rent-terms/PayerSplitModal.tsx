import { Alert, Button, Group, Modal, NativeSelect, Stack, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { errorMessage } from '../../lib/api';
import { useAddSplit, type SplitInput } from './api';
import type { ModalProps } from './BenefitAwardModal';
import { parsePounds } from './money';

export function PayerSplitModal({ tid, opened, onClose }: ModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="Add payer split">
      <SplitForm tid={tid} onDone={onClose} />
    </Modal>
  );
}

function SplitForm({ tid, onDone }: { tid: string; onDone: () => void }) {
  const add = useAddSplit(tid);
  const [payer, setPayer] = useState<SplitInput['payer']>('other_third_party');
  const [basis, setBasis] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('');
  const [from, setFrom] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: SplitInput = { payer, effectiveFrom: from };
    if (basis === 'percent') {
      const pct = Number(value);
      if (!/^\d{1,3}(\.\d{1,2})?$/.test(value.trim()) || pct < 0.01 || pct > 100) return setProblem('Enter a percentage from 0.01 to 100');
      input.sharePercent = pct;
    } else {
      const pence = parsePounds(value);
      if (pence === null) return setProblem('Enter the amount as pounds, e.g. 40 or 40.50');
      input.fixedAmountPence = pence;
    }
    if (!from) return setProblem('Choose the date the split starts');
    setProblem(null);
    add.mutate(input, {
      onSuccess: () => {
        notifications.show({ color: 'teal', title: 'Payer split added', message: 'The rent account has been updated.' });
        onDone();
      },
    });
  };

  const message = problem ?? (add.isError ? errorMessage(add.error) : null);
  return (
    <form noValidate onSubmit={submit}>
      <Stack gap="md">
        <NativeSelect
          label="Payer"
          value={payer}
          onChange={(e) => setPayer(e.currentTarget.value as SplitInput['payer'])}
          data={[
            { value: 'council_hb', label: 'Council (HB)' },
            { value: 'dwp_uc', label: 'DWP (UC)' },
            { value: 'other_third_party', label: 'Other' },
          ]}
        />
        <NativeSelect
          label="Share is"
          value={basis}
          onChange={(e) => setBasis(e.currentTarget.value as 'percent' | 'fixed')}
          data={[
            { value: 'percent', label: 'A percentage of the rent' },
            { value: 'fixed', label: 'A fixed amount per rent period' },
          ]}
        />
        <TextInput label={basis === 'percent' ? 'Percentage' : 'Amount (£)'} required value={value} onChange={(e) => setValue(e.currentTarget.value)} />
        <TextInput type="date" label="Effective from" required value={from} onChange={(e) => setFrom(e.currentTarget.value)} />
        {message && <Alert color="red">{message}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={add.isPending}>
            Add split
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
