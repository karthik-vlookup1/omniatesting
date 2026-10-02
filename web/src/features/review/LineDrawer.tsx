import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Divider,
  Drawer,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconCheck, IconSearch, IconX } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { useTenancySearch } from '../tenancies/api';
import {
  PAYERS,
  useConfirmLine,
  useExcludeLine,
  useIncludeLine,
  useLine,
  useRejectSuggestion,
  type BankLine,
  type Payer,
  type Suggestion,
} from './api';
import { confidenceColor, methodLabel, money, payerLabel, percent, STATUS_COLOR, STATUS_LABEL, ukDate } from './format';

const AMOUNT_RE = /^\d{1,10}(\.\d{1,2})?$/;

/** One bank line: its facts, suggestions to accept or reject, manual match, exclude / include, and receipts. */
export function LineDrawer({ lineId, canWrite, onClose }: { lineId: string | null; canWrite: boolean; onClose: () => void }) {
  const { data: line, isError, error, isPending } = useLine(lineId);
  return (
    <Drawer opened={lineId !== null} onClose={onClose} position="right" size="lg" title={line?.description ?? 'Bank line'}>
      {isError && <Alert color="red" role="alert">{error.message}</Alert>}
      {lineId !== null && isPending && <Loader size="sm" aria-label="Loading line" />}
      {line && <LineBody key={line.id} line={line} canWrite={canWrite} />}
    </Drawer>
  );
}

function LineBody({ line, canWrite }: { line: BankLine; canWrite: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const open = line.suggestions.filter((s) => s.status === 'open');
  const moneyIn = Number(line.amount) > 0;
  const matchable = canWrite && moneyIn && ['needs_review', 'yet_to_take', 'partially_matched'].includes(line.status);

  return (
    <Stack gap="md">
      <LineFacts line={line} />
      {message && (
        <Alert color="green" role="status" withCloseButton onClose={() => setMessage(null)}>
          {message}
        </Alert>
      )}

      {open.length > 0 && (
        <Stack gap="xs">
          <Title order={5}>Suggestions</Title>
          {open.map((s) => (
            <SuggestionCard key={s.id} line={line} suggestion={s} canAct={matchable} onDone={setMessage} />
          ))}
        </Stack>
      )}

      {matchable && <ManualMatch line={line} onDone={setMessage} />}

      {line.receipts.length > 0 && <Receipts line={line} />}

      {canWrite && line.status !== 'matched' && line.status !== 'partially_matched' && (
        <ExcludeInclude line={line} onDone={setMessage} />
      )}
    </Stack>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm">{children ?? '—'}</Text>
    </div>
  );
}

function LineFacts({ line }: { line: BankLine }) {
  return (
    <Paper withBorder p="sm">
      <Group justify="space-between" mb="xs">
        <Badge color={STATUS_COLOR[line.status]} data-testid="line-status">
          {STATUS_LABEL[line.status]}
        </Badge>
        <Text size="sm" c="dimmed">
          {line.bankCode}
        </Text>
      </Group>
      <SimpleGrid cols={3} spacing="xs">
        <Fact label="Date">{ukDate(line.txnDate)}</Fact>
        <Fact label="Amount">{money(line.amount)}</Fact>
        <Fact label="Left to match">{money(line.remaining)}</Fact>
        <Fact label="Reference">{line.reference}</Fact>
        <Fact label="Counterparty">{line.counterparty}</Fact>
        <Fact label="Payer account">{line.payerAccountLast4 ? `••••${line.payerAccountLast4}` : null}</Fact>
        <Fact label="TID in text">{line.extractedTid}</Fact>
        {line.exclusionReason && <Fact label="Excluded because">{line.exclusionReason}</Fact>}
        {line.note && <Fact label="Note">{line.note}</Fact>}
      </SimpleGrid>
    </Paper>
  );
}

/** Payer, amount and "remember" — shared by accepting a suggestion and matching by hand. */
function ConfirmForm({
  line,
  defaultPayer,
  submitLabel,
  onSubmit,
  pending,
}: {
  line: BankLine;
  defaultPayer: Payer;
  submitLabel: string;
  onSubmit: (v: { payer: Payer; amount: string; remember: boolean }) => void;
  pending: boolean;
}) {
  const [payer, setPayer] = useState<Payer>(defaultPayer);
  const [amount, setAmount] = useState(line.remaining);
  const [remember, setRemember] = useState(false);
  const amountOk = AMOUNT_RE.test(amount.trim()) && Number(amount) > 0;

  return (
    <Stack gap="xs">
      <Group grow align="start">
        <Select
          label="Paid by"
          data={PAYERS}
          value={payer}
          onChange={(v) => v && setPayer(v as Payer)}
          allowDeselect={false}
        />
        <TextInput
          label="Amount (£)"
          value={amount}
          onChange={(e) => setAmount(e.currentTarget.value)}
          error={amountOk ? undefined : 'Pounds and pence, e.g. 325.00'}
        />
      </Group>
      {line.payerAccountLast4 && (
        <Checkbox
          label={`Remember account ••••${line.payerAccountLast4} for this tenancy`}
          checked={remember}
          onChange={(e) => setRemember(e.currentTarget.checked)}
        />
      )}
      <Group>
        <Button
          leftSection={<IconCheck size={16} />}
          disabled={!amountOk}
          loading={pending}
          onClick={() => onSubmit({ payer, amount: amount.trim(), remember })}
        >
          {submitLabel}
        </Button>
      </Group>
    </Stack>
  );
}

function SuggestionCard({
  line,
  suggestion: s,
  canAct,
  onDone,
}: {
  line: BankLine;
  suggestion: Suggestion;
  canAct: boolean;
  onDone: (msg: string) => void;
}) {
  const [accepting, setAccepting] = useState(false);
  const confirm = useConfirmLine();
  const reject = useRejectSuggestion();
  const error = confirm.error ?? reject.error;
  const doReject = () => {
    confirm.reset();
    reject.mutate({ lineId: line.id, suggestionId: s.id }, { onSuccess: () => onDone(`Suggestion ${s.tid} rejected`) });
  };
  const doConfirm = (v: { payer: Payer; amount: string; remember: boolean }) => {
    reject.reset();
    confirm.mutate({ lineId: line.id, input: { suggestionId: s.id, ...v } }, { onSuccess: () => onDone(`Matched to ${s.tid}`) });
  };

  return (
    <Paper withBorder p="sm" aria-label={`Suggestion ${s.tid}`}>
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Text fw={600}>
            {s.tid} · {s.tenantName ?? 'Name not known'}
          </Text>
          <Text size="xs" c="dimmed">
            {methodLabel(s.method)} · paid by {payerLabel(s.payer)}
            {s.reason ? ` · ${s.reason}` : ''}
          </Text>
        </div>
        <Badge color={confidenceColor(s.confidence)} variant="light">
          {percent(s.confidence)}
        </Badge>
      </Group>
      {canAct && !accepting && (
        <Group mt="xs" gap="xs">
          <Button size="xs" aria-label={`Accept ${s.tid}`} onClick={() => setAccepting(true)}>
            Accept
          </Button>
          <Button
            size="xs"
            variant="default"
            aria-label={`Reject ${s.tid}`}
            leftSection={<IconX size={14} />}
            loading={reject.isPending}
            onClick={doReject}
          >
            Reject
          </Button>
        </Group>
      )}
      {canAct && accepting && (
        <>
          <Divider my="xs" />
          <ConfirmForm
            line={line}
            defaultPayer={s.payer}
            submitLabel={`Confirm ${s.tid}`}
            pending={confirm.isPending}
            onSubmit={doConfirm}
          />
        </>
      )}
      {error && (
        <Alert color="red" role="alert" mt="xs">
          {error.message}
        </Alert>
      )}
    </Paper>
  );
}

/** "Pick another tenancy": search by TID, name or NI, choose one, then confirm. */
function ManualMatch({ line, onDone }: { line: BankLine; onDone: (msg: string) => void }) {
  const [q, setQ] = useState('');
  const [debounced] = useDebouncedValue(q, 250);
  const [tid, setTid] = useState<string | null>(null);
  const search = useTenancySearch(debounced, 'all');
  const confirm = useConfirmLine();
  const results = debounced.trim().length >= 2 ? (search.data ?? []).slice(0, 8) : [];

  return (
    <Stack gap="xs">
      <Title order={5}>{line.suggestions.some((s) => s.status === 'open') ? 'Pick another tenancy' : 'Match to a tenancy'}</Title>
      <TextInput
        label="Find tenancy"
        placeholder="TID, tenant name or NI number"
        leftSection={<IconSearch size={16} />}
        value={q}
        onChange={(e) => {
          setQ(e.currentTarget.value);
          setTid(null);
        }}
      />
      {results.length > 0 && !tid && (
        <Table aria-label="Tenancy results" highlightOnHover>
          <Table.Tbody>
            {results.map((t) => (
              <Table.Tr key={t.tid}>
                <Table.Td>{t.tid}</Table.Td>
                <Table.Td>{t.tenantName ?? '—'}</Table.Td>
                <Table.Td>{t.rent ? `${money(t.rent.amount)} ${t.rent.frequency}` : '—'}</Table.Td>
                <Table.Td>
                  <Button size="xs" variant="light" aria-label={`Choose ${t.tid}`} onClick={() => setTid(t.tid)}>
                    Choose
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {debounced.trim().length >= 2 && search.isSuccess && results.length === 0 && (
        <Text size="sm" c="dimmed">
          No tenancy found.
        </Text>
      )}
      {tid && (
        <Paper withBorder p="sm">
          <Text size="sm" mb="xs">
            Match to <b>{tid}</b>
          </Text>
          <ConfirmForm
            key={tid}
            line={line}
            defaultPayer="tenant"
            submitLabel={`Confirm ${tid}`}
            pending={confirm.isPending}
            onSubmit={(v) =>
              confirm.mutate(
                { lineId: line.id, input: { tid, ...v } },
                {
                  onSuccess: () => {
                    onDone(`Matched to ${tid}`);
                    setTid(null);
                    setQ('');
                  },
                },
              )
            }
          />
        </Paper>
      )}
      {confirm.error && (
        <Alert color="red" role="alert">
          {confirm.error.message}
        </Alert>
      )}
    </Stack>
  );
}

function Receipts({ line }: { line: BankLine }) {
  return (
    <Stack gap="xs">
      <Title order={5}>Receipts</Title>
      <Table aria-label="Receipts" striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>TID</Table.Th>
            <Table.Th>Paid by</Table.Th>
            <Table.Th ta="right">Amount</Table.Th>
            <Table.Th>Ledger code</Table.Th>
            <Table.Th>Matched</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {line.receipts.map((r) => (
            <Table.Tr key={r.id}>
              <Table.Td>{r.tid}</Table.Td>
              <Table.Td>{payerLabel(r.payer)}</Table.Td>
              <Table.Td ta="right">{money(r.amount)}</Table.Td>
              <Table.Td>{r.ledgerCode ?? '—'}</Table.Td>
              <Table.Td>
                {methodLabel(r.matchedVia)} · {r.matchedBy ?? 'Automatic'}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function ExcludeInclude({ line, onDone }: { line: BankLine; onDone: (msg: string) => void }) {
  const [reason, setReason] = useState('');
  const exclude = useExcludeLine();
  const include = useIncludeLine();
  const error = exclude.error ?? include.error;

  if (line.status === 'excluded') {
    if (Number(line.amount) <= 0) return null; // money going out always stays excluded
    return (
      <Stack gap="xs">
        <Divider />
        <Group>
          <Button
            variant="default"
            loading={include.isPending}
            onClick={() =>
              include.mutate({ lineId: line.id }, { onSuccess: (l) => onDone(`Included again: ${STATUS_LABEL[l.status].toLowerCase()}`) })
            }
          >
            Include again
          </Button>
        </Group>
        {error && <Alert color="red" role="alert">{error.message}</Alert>}
      </Stack>
    );
  }

  const ok = reason.trim().length >= 2;
  return (
    <Stack gap="xs">
      <Divider />
      <Title order={5}>Not rent?</Title>
      <Textarea
        label="Reason for excluding"
        placeholder="e.g. internal transfer, bank charge"
        maxLength={200}
        value={reason}
        onChange={(e) => setReason(e.currentTarget.value)}
        autosize
        minRows={1}
      />
      <Group>
        <Button
          color="gray"
          disabled={!ok}
          loading={exclude.isPending}
          onClick={() =>
            exclude.mutate({ lineId: line.id, reason: reason.trim() }, { onSuccess: () => onDone('Line excluded') })
          }
        >
          Exclude line
        </Button>
      </Group>
      {error && <Alert color="red" role="alert">{error.message}</Alert>}
    </Stack>
  );
}
