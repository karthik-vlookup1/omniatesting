import { Alert, Button, Chip, Group, Paper, Stack, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { useExcludeLine } from '../../data/review';
import type { BankLine } from '../../data/transactions';
import { errorMessage } from '../../lib/api';

const REASON_MIN = 2;
const REASON_MAX = 200;
/** Common reasons from the manual process (FRONTEND_REFERENCE.md §6.1). Staff can type any reason. */
const QUICK_REASONS = ['Internal transfer', 'Bank charge', 'Not rent'];

export function ExcludeForm({ line, onCancel, onDone }: { line: BankLine; onCancel: () => void; onDone: (l: BankLine) => void }) {
  const exclude = useExcludeLine();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const trimmed = reason.trim();
  const problem =
    trimmed.length < REASON_MIN ? 'Give a reason (at least 2 characters)' : trimmed.length > REASON_MAX ? `Use at most ${REASON_MAX} characters` : null;

  const submit = () => {
    setTouched(true);
    if (problem) return;
    exclude.mutate(
      { lineId: line.id, reason: trimmed },
      {
        onSuccess: (updated) => {
          notifications.show({ color: 'teal', title: 'Line excluded', message: `Excluded: ${trimmed}` });
          onDone(updated);
        },
      },
    );
  };

  return (
    <Paper withBorder p="md" radius="md" bg="var(--app-surface-subtle)">
      <form
        noValidate
        aria-label="Exclude this line"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Stack gap="sm">
          <Text fz="sm" fw={600}>
            Exclude this line
          </Text>
          <Text fz="xs" c="dimmed">
            Excluded lines are not rent and never reach Vico or Xero. They can be included again later.
          </Text>
          <Chip.Group>
            <Group gap={6}>
              {QUICK_REASONS.map((r) => (
                <Chip key={r} size="xs" variant="outline" checked={trimmed === r} onChange={() => setReason(r)}>
                  {r}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
          <Textarea
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            onBlur={() => setTouched(true)}
            error={touched ? problem : null}
            maxLength={REASON_MAX}
            required
            data-autofocus
          />
          {exclude.isError && (
            <Alert color="red" role="alert" p="xs">
              <Text fz="sm">{errorMessage(exclude.error)}</Text>
            </Alert>
          )}
          <Group justify="flex-end" gap="xs">
            <Button variant="default" size="xs" onClick={onCancel} disabled={exclude.isPending}>
              Cancel
            </Button>
            <Button type="submit" size="xs" color="gray" loading={exclude.isPending}>
              Exclude line
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}
