import { Alert, Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { formatPence, parsePounds } from '../rent-terms/money';
import { useResetAllocations, useSaveAllocations, type ReceiptDetail } from './api';

/** Pin a receipt's money to specific rent periods, or hand it back to automatic oldest-first. */
export function AllocationEditor({ receipt }: { receipt: ReceiptDetail }) {
  const save = useSaveAllocations(receipt.id);
  const reset = useResetAllocations(receipt.id);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const current = (chargeId: string): string => {
    if (drafts[chargeId] !== undefined) return drafts[chargeId];
    const held = receipt.allocations.find((a) => a.rentChargeId === chargeId);
    return held ? (held.amountPence / 100).toFixed(2) : '';
  };

  const lines = receipt.openCharges.map((c) => {
    const text = current(c.id);
    return { charge: c, text, pence: text.trim() === '' ? 0 : parsePounds(text) };
  });
  const invalid = lines.some((l) => l.pence === null || (l.pence ?? 0) > l.charge.outstandingPence);
  const total = lines.reduce((s, l) => s + (l.pence ?? 0), 0);
  const over = total > receipt.amountPence;
  const busy = save.isPending || reset.isPending;

  return (
    <Stack gap="xs">
      {receipt.openCharges.length === 0 ? (
        <Text fz="sm" c="dimmed">
          There are no rent periods to allocate this receipt to.
        </Text>
      ) : (
        lines.map(({ charge, text }) => (
          <Group key={charge.id} justify="space-between" wrap="nowrap">
            <Text fz="sm">
              {formatDate(charge.periodStart)} (due {formatDate(charge.dueDate)}), up to {formatPence(charge.outstandingPence)}
            </Text>
            <TextInput
              aria-label={`Allocation for ${charge.periodStart}`}
              placeholder="0.00"
              value={text}
              onChange={(e) => setDrafts((d) => ({ ...d, [charge.id]: e.currentTarget.value }))}
              w={110}
            />
          </Group>
        ))
      )}
      <Text fz="sm" className="tabular" c={over ? 'red' : undefined}>
        Allocated {formatPence(total)} of {formatPence(receipt.amountPence)}
      </Text>
      {(save.isError || reset.isError) && <Alert color="red">{errorMessage(save.error ?? reset.error)}</Alert>}
      <Group justify="flex-end">
        <Button
          variant="default"
          loading={reset.isPending}
          disabled={busy || receipt.allocationMode === 'auto'}
          onClick={() =>
            reset.mutate(undefined, {
              onSuccess: () => {
                setDrafts({});
                notifications.show({ color: 'teal', title: 'Back to automatic', message: 'The receipt is allocated oldest first again.' });
              },
            })
          }
        >
          Back to automatic
        </Button>
        <Button
          loading={save.isPending}
          disabled={busy || invalid || over}
          onClick={() =>
            save.mutate(
              lines.filter((l) => (l.pence ?? 0) > 0).map((l) => ({ rentChargeId: l.charge.id, amountPence: l.pence! })),
              {
                onSuccess: () => {
                  setDrafts({});
                  notifications.show({ color: 'teal', title: 'Allocations saved', message: 'The receipt is now allocated by hand.' });
                },
              },
            )
          }
        >
          Save allocations
        </Button>
      </Group>
    </Stack>
  );
}
