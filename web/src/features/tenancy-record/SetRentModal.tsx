import { Select, SimpleGrid, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { ConfirmDialog } from '../../components';
import { errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { FREQUENCY_OPTIONS, frequencyLabel, useSetRent, type Frequency } from '../rent-terms/api';
import { formatPence, parsePounds } from '../rent-terms/money';
import { ActionModal } from './ActionModal';

interface Props {
  tid: string;
  title: string;
  opened: boolean;
  onClose: () => void;
}

interface Values {
  amount: string;
  frequency: Frequency;
  effectiveFrom: string;
}

/**
 * Recon's "Make Rent Due": a new rent schedule from a date (POST /api/rent/:tid/schedules, writers).
 * The server's nightly job raises the charges; this only records the terms.
 */
export function SetRentModal({ tid, title, opened, onClose }: Props) {
  const set = useSetRent(tid);
  const [pending, setPending] = useState<Values | null>(null);
  const form = useForm<Values>({
    mode: 'controlled',
    initialValues: { amount: '', frequency: 'weekly', effectiveFrom: '' },
    validate: {
      amount: (v) => (parsePounds(v) === null || parsePounds(v) === 0 ? 'Enter the rent in pounds, e.g. 650 or 650.50' : null),
      effectiveFrom: (v) => (!/^\d{4}-\d{2}-\d{2}$/.test(v) ? 'Choose the date the rent starts' : null),
    },
  });

  const close = () => {
    form.reset();
    set.reset();
    setPending(null);
    onClose();
  };

  const confirm = () => {
    if (!pending) return;
    const amountPence = parsePounds(pending.amount)!;
    set.mutate(
      { amountPence, frequency: pending.frequency, effectiveFrom: pending.effectiveFrom },
      {
        onSuccess: () => {
          notifications.show({ color: 'teal', title: 'Rent saved', message: `${formatPence(amountPence)} ${frequencyLabel(pending.frequency).toLowerCase()} from ${formatDate(pending.effectiveFrom)}.` });
          close();
        },
        onError: () => setPending(null),
      },
    );
  };

  return (
    <>
      <ActionModal
        opened={opened}
        onClose={close}
        title={`Set rent — ${title}`}
        size="md"
        context={<Text fz="sm">A new rent replaces the current one from its start date. Earlier charges are not changed.</Text>}
        submitLabel="Save rent"
        onSubmit={form.onSubmit((values) => setPending(values))}
        loading={set.isPending}
        error={set.isError ? errorMessage(set.error) : null}
      >
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <TextInput label="Rent (£)" placeholder="0.00" withAsterisk inputMode="decimal" {...form.getInputProps('amount')} />
          <Select label="Cycle" data={FREQUENCY_OPTIONS} withAsterisk {...form.getInputProps('frequency')} />
          <TextInput type="date" label="Effective from" withAsterisk {...form.getInputProps('effectiveFrom')} />
        </SimpleGrid>
      </ActionModal>
      <ConfirmDialog
        opened={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={confirm}
        loading={set.isPending}
        title="Save this rent?"
        message={
          pending && (
            <>
              <b>{formatPence(parsePounds(pending.amount) ?? 0)}</b> {frequencyLabel(pending.frequency).toLowerCase()} for {title}, from{' '}
              <b>{formatDate(pending.effectiveFrom)}</b>.
            </>
          )
        }
        confirmLabel="Save rent"
      />
    </>
  );
}
