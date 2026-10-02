import { ActionIcon, Alert, Badge, Divider, Drawer, Group, Kbd, Paper, SimpleGrid, Stack, Text, Title, Tooltip } from '@mantine/core';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import type { ComponentType, ReactNode } from 'react';
import { ErrorState, LoadingState, MaskedValue, Money } from '../../components';
import { PAYER_LABEL, methodLabel, useLine, type BankLine } from '../../data/transactions';
import { formatDate } from '../../lib/format';
import { ConfidenceBadge, LineStatusBadge } from './badges';

/** What the review feature plugs into the drawer: the decisions a writer can take on a line. */
export interface LineActionsProps {
  line: BankLine;
  /** Called with the server's updated line after any action. */
  onDone: (line: BankLine) => void;
}

export interface LineDrawerProps {
  lineId: string | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  Actions?: ComponentType<LineActionsProps>;
  onDone: (line: BankLine) => void;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={2} miw={0}>
      <Text fz="xs" c="dimmed">
        {label}
      </Text>
      <Text component="div" fz="sm" fw={500} style={{ overflowWrap: 'anywhere' }}>
        {children}
      </Text>
    </Stack>
  );
}

/** Read-only list of suggestions, used when no actions are available (e.g. read-only users). */
function SuggestionList({ line }: { line: BankLine }) {
  if (line.suggestions.length === 0) {
    return (
      <Text fz="sm" c="dimmed">
        No suggestions for this line.
      </Text>
    );
  }
  return (
    <Stack gap="xs">
      {line.suggestions.map((s) => (
        <Paper key={s.id} withBorder p="sm">
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Stack gap={2} miw={0}>
              <Group gap={6}>
                <Text fz="sm" fw={600} ff="monospace">
                  {s.tid}
                </Text>
                <Text fz="sm">{s.tenantName ?? 'Unknown tenant'}</Text>
              </Group>
              <Text fz="xs" c="dimmed">
                {methodLabel(s.method)} · {PAYER_LABEL[s.payer]}
                {s.reason ? ` · ${s.reason}` : ''}
              </Text>
            </Stack>
            <Group gap={6} wrap="nowrap">
              {s.status !== 'open' && (
                <Badge size="sm" variant="outline" color={s.status === 'accepted' ? 'green' : 'gray'}>
                  {s.status === 'accepted' ? 'Accepted' : 'Rejected'}
                </Badge>
              )}
              <ConfidenceBadge suggestion={s} />
            </Group>
          </Group>
        </Paper>
      ))}
    </Stack>
  );
}

function Receipts({ line }: { line: BankLine }) {
  if (line.receipts.length === 0) return null;
  return (
    <Stack gap="xs">
      <Title order={3} fz="sm">
        Receipts
      </Title>
      {line.receipts.map((r) => (
        <Paper key={r.id} withBorder p="sm">
          <Group justify="space-between" wrap="nowrap">
            <Stack gap={2} miw={0}>
              <Group gap={6}>
                <Text fz="sm" fw={600} ff="monospace">
                  {r.tid}
                </Text>
                <Text fz="sm">{PAYER_LABEL[r.payer]}</Text>
              </Group>
              <Text fz="xs" c="dimmed">
                {r.matchedBy ? `Confirmed by ${r.matchedBy}` : 'Matched automatically'} · {methodLabel(r.matchedVia)}
                {r.ledgerCode ? ` · Ledger ${r.ledgerCode}` : ''}
              </Text>
            </Stack>
            <Money value={r.amount} fw={600} />
          </Group>
        </Paper>
      ))}
    </Stack>
  );
}

function LineBody({ line, Actions, onDone }: { line: BankLine; Actions?: ComponentType<LineActionsProps>; onDone: (l: BankLine) => void }) {
  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <LineStatusBadge status={line.status} />
        <Text fz="xs" c="dimmed">
          {line.bankCode} · {formatDate(line.txnDate)}
        </Text>
      </Group>

      <SimpleGrid cols={2} spacing="md" verticalSpacing="sm">
        <Fact label="Amount">
          <Money value={line.amount} signed fz="md" fw={650} />
        </Fact>
        <Fact label="Remaining to match">
          <Money value={line.remaining} fz="md" fw={650} />
        </Fact>
        <Fact label="Reference">{line.reference ?? '—'}</Fact>
        <Fact label="Counterparty">{line.counterparty ?? '—'}</Fact>
        <Fact label="Payer account">
          <MaskedValue kind="account" value={line.payerAccountLast4 ? `••••${line.payerAccountLast4}` : null} />
        </Fact>
        <Fact label="TID found in text">
          <Text span ff="monospace" fz="sm">
            {line.extractedTid ?? '—'}
          </Text>
        </Fact>
      </SimpleGrid>

      {line.status === 'excluded' && line.exclusionReason && (
        <Alert color="gray" title="Excluded" variant="light">
          {line.exclusionReason}
        </Alert>
      )}
      {line.note && (
        <Alert color="blue" variant="light">
          {line.note}
        </Alert>
      )}

      <Divider />
      {Actions ? (
        <Actions line={line} onDone={onDone} />
      ) : (
        <Stack gap="xs">
          <Title order={3} fz="sm">
            Suggestions
          </Title>
          <SuggestionList line={line} />
        </Stack>
      )}
      <Receipts line={line} />
    </Stack>
  );
}

/** FRONTEND_REFERENCE.md §6.1: the line drawer, with j / k to move between lines. */
export function LineDrawer({ lineId, onClose, onPrev, onNext, Actions, onDone }: LineDrawerProps) {
  const line = useLine(lineId);

  const title = (
    <Group gap="xs" wrap="nowrap" miw={0}>
      <Text fw={650} truncate maw={340} title={line.data?.description}>
        {line.data?.description ?? 'Bank line'}
      </Text>
    </Group>
  );

  return (
    <Drawer
      opened={lineId !== null}
      onClose={onClose}
      position="right"
      size={560}
      title={title}
      padding="lg"
    >
      <Group justify="flex-end" gap={4} mb="sm">
        <Text fz="xs" c="dimmed" mr={4}>
          <Kbd size="xs">k</Kbd> / <Kbd size="xs">j</Kbd>
        </Text>
        <Tooltip label="Previous line (k)">
          <ActionIcon variant="default" onClick={onPrev} disabled={!onPrev} aria-label="Previous line">
            <IconChevronUp size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Next line (j)">
          <ActionIcon variant="default" onClick={onNext} disabled={!onNext} aria-label="Next line">
            <IconChevronDown size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
      {line.isError ? (
        <ErrorState error={line.error} title="Could not load this line" onRetry={() => void line.refetch()} />
      ) : !line.data ? (
        <LoadingState label="Loading line…" />
      ) : (
        <LineBody line={line.data} Actions={Actions} onDone={onDone} />
      )}
    </Drawer>
  );
}
