import { Alert, Badge, CloseButton, Group, Pagination, SegmentedControl, Select, Stack, Table, Text, Title, UnstyledButton } from '@mantine/core';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { hasRole, useCurrentUser } from '../auth/useAuth';
import { useBankAccounts } from '../upload/api';
import { useLines, type BankLine, type QueueStatus } from './api';
import { confidenceColor, money, percent, STATUS_COLOR, STATUS_LABEL, ukDate } from './format';
import { LineDrawer } from './LineDrawer';

const PAGE_SIZE = 50;

const STATUS_TABS: { value: QueueStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'yet_to_take', label: 'Yet to take' },
  { value: 'partially_matched', label: 'Part matched' },
  { value: 'matched', label: 'Matched' },
  { value: 'excluded', label: 'Excluded' },
];

const isStatus = (v: string | null): v is QueueStatus => STATUS_TABS.some((t) => t.value === v);

/** Bank lines that need a person: filter by status, bank and import; open a line to match or exclude it. */
export function ReviewPage() {
  const { data: user } = useCurrentUser();
  const canWrite = hasRole(user?.role, 'accounts', 'staff');
  const [params, setParams] = useSearchParams();
  const status: QueueStatus = isStatus(params.get('status')) ? (params.get('status') as QueueStatus) : 'open';
  const bankAccountId = params.get('bankAccountId') ?? undefined;
  const batchId = params.get('batchId') ?? undefined;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [lineId, setLineId] = useState<string | null>(null);

  const banks = useBankAccounts();
  const lines = useLines({ status, bankAccountId, batchId, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const total = lines.data?.total ?? 0;

  /** Filters live in the URL so a filtered queue can be shared; changing one goes back to page 1. */
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Review queue</Title>
        <Text c="dimmed" size="sm" data-testid="queue-total">
          {total} {total === 1 ? 'line' : 'lines'}
        </Text>
      </Group>

      <Group align="end">
        <SegmentedControl
          aria-label="Line status"
          data={STATUS_TABS}
          value={status}
          onChange={(v) => setParam('status', v === 'open' ? null : v)}
        />
        <Select
          label="Bank"
          placeholder="All banks"
          clearable
          data={(banks.data ?? []).map((b) => ({ value: b.id, label: b.code }))}
          value={bankAccountId ?? null}
          onChange={(v) => setParam('bankAccountId', v)}
          w={180}
        />
        {batchId && (
          <Badge
            size="lg"
            variant="light"
            rightSection={<CloseButton size="xs" aria-label="Show all imports" onClick={() => setParam('batchId', null)} />}
          >
            One import only
          </Badge>
        )}
      </Group>

      {lines.isError && (
        <Alert color="red" role="alert">
          {lines.error.message}
        </Alert>
      )}

      <Table striped highlightOnHover verticalSpacing="xs" aria-label="Bank lines">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Date</Table.Th>
            <Table.Th>Bank</Table.Th>
            <Table.Th>Description</Table.Th>
            <Table.Th ta="right">Amount</Table.Th>
            <Table.Th ta="right">Left</Table.Th>
            <Table.Th>Best suggestion</Table.Th>
            <Table.Th>Status</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {lines.data?.lines.map((l) => <LineRow key={l.id} line={l} onOpen={() => setLineId(l.id)} />)}
        </Table.Tbody>
      </Table>
      {lines.isSuccess && lines.data.lines.length === 0 && (
        <Text c="dimmed">{total === 0 && status === 'open' ? 'Nothing to review. Upload a statement to add lines.' : 'No lines here.'}</Text>
      )}
      {total > PAGE_SIZE && (
        <Pagination
          total={Math.ceil(total / PAGE_SIZE)}
          value={page}
          onChange={(p) => setParam('page', p === 1 ? null : String(p))}
        />
      )}

      <LineDrawer lineId={lineId} canWrite={canWrite} onClose={() => setLineId(null)} />
    </Stack>
  );
}

function LineRow({ line: l, onOpen }: { line: BankLine; onOpen: () => void }) {
  const best = l.suggestions.find((s) => s.status === 'open');
  const negative = Number(l.amount) < 0;
  return (
    <Table.Tr onClick={onOpen} style={{ cursor: 'pointer' }}>
      <Table.Td>{ukDate(l.txnDate)}</Table.Td>
      <Table.Td>{l.bankCode}</Table.Td>
      <Table.Td>
        {/* The description is the keyboard / screen-reader way in; the whole row is the mouse shortcut. */}
        <UnstyledButton
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          aria-label={`Open line ${l.description}`}
        >
          <Text size="sm" td="underline" style={{ textDecorationStyle: 'dotted' }}>
            {l.description}
          </Text>
        </UnstyledButton>
        {(l.reference || l.counterparty) && (
          <Text size="xs" c="dimmed">
            {[l.reference, l.counterparty].filter(Boolean).join(' · ')}
          </Text>
        )}
      </Table.Td>
      <Table.Td ta="right" c={negative ? 'red' : undefined} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {money(l.amount)}
      </Table.Td>
      <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {money(l.remaining)}
      </Table.Td>
      <Table.Td>
        {best ? (
          <Group gap={6} wrap="nowrap">
            <Text size="sm">
              {best.tid} {best.tenantName ?? ''}
            </Text>
            <Badge size="sm" variant="light" color={confidenceColor(best.confidence)}>
              {percent(best.confidence)}
            </Badge>
          </Group>
        ) : (
          <Text size="sm" c="dimmed">
            —
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        <Badge color={STATUS_COLOR[l.status]} variant="light">
          {STATUS_LABEL[l.status]}
        </Badge>
      </Table.Td>
    </Table.Tr>
  );
}
