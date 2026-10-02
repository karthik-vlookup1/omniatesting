import { Alert, Button, Checkbox, Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck } from '@tabler/icons-react';
import { useState } from 'react';
import { amountError, useConfirmLine, type ConfirmInput } from '../../data/review';
import { PAYER_LABEL, type BankLine, type Payer, type Suggestion } from '../../data/transactions';
import { errorMessage } from '../../lib/api';
import { formatMoney } from '../../lib/format';

export type MatchTarget =
  | { kind: 'suggestion'; suggestion: Suggestion }
  | { kind: 'tid'; tid: string; tenantName: string | null };

const PAYER_OPTIONS = (Object.keys(PAYER_LABEL) as Payer[]).map((p) => ({ value: p, label: PAYER_LABEL[p] }));

export interface ConfirmMatchFormProps {
  line: BankLine;
  target: MatchTarget;
  onCancel: () => void;
  onDone: (line: BankLine) => void;
}

/**
 * Payer, amount and "remember" before confirming (FRONTEND_REFERENCE.md §6.1). Defaults match what
 * the server would do if left out: the suggestion's payer (tenant for a picked TID) and the whole
 * remaining amount. The amount is only sent when changed, for a part payment.
 */
export function ConfirmMatchForm({ line, target, onCancel, onDone }: ConfirmMatchFormProps) {
  const confirm = useConfirmLine();
  const defaultPayer: Payer = target.kind === 'suggestion' ? target.suggestion.payer : 'tenant';
  const [payer, setPayer] = useState<Payer>(defaultPayer);
  const [amount, setAmount] = useState(line.remaining);
  const [remember, setRemember] = useState(false);
  const [touched, setTouched] = useState(false);

  const tid = target.kind === 'suggestion' ? target.suggestion.tid : target.tid;
  const tenant = target.kind === 'suggestion' ? target.suggestion.tenantName : target.tenantName;
  const amountProblem = amountError(amount, line.remaining);

  const submit = () => {
    setTouched(true);
    if (amountProblem) return;
    const partial = amount.trim() !== line.remaining ? amount.trim() : undefined;
    const base = { payer: payer !== defaultPayer || target.kind === 'tid' ? payer : undefined, remember, amount: partial };
    const input: ConfirmInput =
      target.kind === 'suggestion' ? { suggestionId: target.suggestion.id, ...base } : { tid: target.tid, ...base };
    confirm.mutate(
      { lineId: line.id, input },
      {
        onSuccess: (updated) => {
          notifications.show({
            color: 'teal',
            icon: <IconCheck size={16} aria-hidden />,
            title: 'Match confirmed',
            message: `${formatMoney(partial ?? line.remaining)} to ${tid}${tenant ? ` (${tenant})` : ''}.`,
          });
          onDone(updated);
        },
      },
    );
  };

  return (
    <Paper withBorder p="md" radius="md" bg="var(--app-surface-subtle)">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        aria-label={`Confirm match to ${tid}`}
      >
        <Stack gap="sm">
          <Text fz="sm" fw={600}>
            Confirm {tid}
            {tenant ? ` · ${tenant}` : ''}
          </Text>
          <Group grow align="flex-start" gap="sm">
            <Select label="Payer" data={PAYER_OPTIONS} value={payer} onChange={(v) => v && setPayer(v as Payer)} required />
            <TextInput
              label="Amount (£)"
              value={amount}
              onChange={(e) => setAmount(e.currentTarget.value)}
              onBlur={() => setTouched(true)}
              error={touched ? amountProblem : null}
              description={`Remaining ${formatMoney(line.remaining)}. Lower it for a part payment.`}
              inputMode="decimal"
              required
              data-autofocus
            />
          </Group>
          {line.payerAccountLast4 && (
            <Checkbox
              label={`Remember this payer account (••••${line.payerAccountLast4}) for this tenancy`}
              description="Future payments from this account will be matched to this tenancy automatically."
              checked={remember}
              onChange={(e) => setRemember(e.currentTarget.checked)}
            />
          )}
          {confirm.isError && (
            <Alert color="red" role="alert" p="xs">
              <Text fz="sm">{errorMessage(confirm.error)}</Text>
            </Alert>
          )}
          <Group justify="flex-end" gap="xs">
            <Button variant="default" size="xs" onClick={onCancel} disabled={confirm.isPending}>
              Cancel
            </Button>
            <Button type="submit" size="xs" loading={confirm.isPending}>
              Confirm
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}
