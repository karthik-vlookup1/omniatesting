import { SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { ConfirmDialog } from '../../components';
import { errorMessage } from '../../lib/api';
import { PAYER_OPTIONS, useCreateAdjustment, type Payer } from '../receipts/api';
import { formatPence, parsePounds } from '../rent-terms/money';
import { ActionModal } from './ActionModal';

export type AdjustmentKind = 'refund' | 'write_off';

const KIND_LABEL: Record<AdjustmentKind, string> = { refund: 'Refund', write_off: 'Write-off' };

interface Props {
  tid: string;
  title: string;
  /** Outstanding balance shown as context (pence; positive = owed). */
  balancePence: number | null;
  kind: AdjustmentKind;
  opened: boolean;
  onClose: () => void;
}

interface Values {
  kind: AdjustmentKind;
  payer: Payer;
  amount: string;
  reason: string;
}

/**
 * LetMC "Apply Refund" / write-off, on Recon's adjustments API (POST /api/adjustments,
 * admin + accounts). The server books it to the rent account; nothing is calculated here.
 */
export function AdjustmentModal({ tid, title, balancePence, kind, opened, onClose }: Props) {
  const create = useCreateAdjustment();
  const [pending, setPending] = useState<Values | null>(null);
  const form = useForm<Values>({
    mode: 'controlled',
    initialValues: { kind, payer: 'tenant', amount: '', reason: '' },
    validate: {
      amount: (v) => (parsePounds(v) === null || parsePounds(v) === 0 ? 'Enter an amount in pounds, e.g. 25 or 25.50' : null),
      reason: (v) => (v.trim().length < 3 ? 'Give a reason of at least 3 characters' : v.trim().length > 500 ? 'Keep the reason under 500 characters' : null),
    },
  });

  const close = () => {
    form.reset();
    create.reset();
    setPending(null);
    onClose();
  };

  const confirm = () => {
    if (!pending) return;
    const amountPence = parsePounds(pending.amount)!;
    create.mutate(
      { tid, payer: pending.payer, kind: pending.kind, amountPence, reason: pending.reason.trim() },
      {
        onSuccess: () => {
          notifications.show({
            color: 'teal',
            title: `${KIND_LABEL[pending.kind]} saved`,
            message: `${formatPence(amountPence)} booked to ${tid}.`,
          });
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
        title={`${KIND_LABEL[form.values.kind]} — ${title}`}
        context={
          <>
            <Text span fw={600}>
              Account:
            </Text>{' '}
            {title}
            <br />
            <Text span fw={600}>
              Balance:
            </Text>{' '}
            {balancePence === null ? '—' : formatPence(balancePence)}
          </>
        }
        submitLabel={`Apply ${KIND_LABEL[form.values.kind].toLowerCase()}`}
        onSubmit={form.onSubmit((values) => setPending(values))}
        loading={create.isPending}
        error={create.isError ? errorMessage(create.error) : null}
      >
        <Stack gap="md">
          <SegmentedControl
            aria-label="Adjustment type"
            data={[
              { value: 'refund', label: 'Refund' },
              { value: 'write_off', label: 'Write-off' },
            ]}
            {...form.getInputProps('kind')}
          />
          <SimpleGrid cols={2}>
            <Select label="Payer" data={PAYER_OPTIONS} withAsterisk {...form.getInputProps('payer')} />
            <TextInput label="Amount (£)" placeholder="0.00" withAsterisk inputMode="decimal" {...form.getInputProps('amount')} />
          </SimpleGrid>
          <Textarea
            label="Reason"
            description="Kept on the audit trail, e.g. “Overpayment returned to tenant”."
            withAsterisk
            rows={3}
            {...form.getInputProps('reason')}
          />
        </Stack>
      </ActionModal>
      <ConfirmDialog
        opened={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={confirm}
        loading={create.isPending}
        tone={pending?.kind === 'write_off' ? 'danger' : 'default'}
        title={`Apply this ${pending ? KIND_LABEL[pending.kind].toLowerCase() : ''}?`}
        message={
          pending && (
            <>
              {KIND_LABEL[pending.kind]} of <b>{formatPence(parsePounds(pending.amount) ?? 0)}</b> for{' '}
              <b>{PAYER_OPTIONS.find((p) => p.value === pending.payer)?.label}</b> on {title}. It can be reversed later
              from Adjustments.
            </>
          )
        }
        confirmLabel={`Apply ${pending ? KIND_LABEL[pending.kind].toLowerCase() : ''}`}
      />
    </>
  );
}
