import { Anchor, Badge, Button, Group, Paper, SegmentedControl, Skeleton, Stack, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowBackUp, IconPlus } from '@tabler/icons-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog, EmptyState, ErrorState, MaskedValue, TablePagination } from '../../components';
import { errorMessage } from '../../lib/api';
import { formatDate, humanize } from '../../lib/format';
import { AddPayerAccountModal } from '../payer-accounts/AddPayerAccountModal';
import type { PayerAccount } from '../payer-accounts/api';
import { PAYER_LABEL, XERO_LABEL, useAdjustments, useReceipts, useReverseAdjustment, type AdjustmentRow, type Payer } from '../receipts/api';
import type { RentAccount } from '../rent-terms/api';
import { formatPence } from '../rent-terms/money';

const LEDGER_PAGE = 25;

function Loading() {
  return (
    <Stack gap={8} aria-busy="true" aria-label="Loading">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} h={30} />
      ))}
    </Stack>
  );
}

/** The rent account ledger per payer (GET /api/rent/:tid → payers[].lines), newest first. */
export function RentAccountSection({ rent }: { rent: UseQueryResult<RentAccount> }) {
  const [payer, setPayer] = useState<Payer | null>(null);
  const [page, setPage] = useState(1);

  if (rent.isPending) return <Loading />;
  if (rent.isError) return <ErrorState error={rent.error} title="Rent account unavailable" onRetry={() => void rent.refetch()} retrying={rent.isFetching} />;
  const payers = rent.data.payers;
  if (payers.length === 0)
    return <EmptyState title="The rent account is empty" description="Charges appear once a rent is set and the nightly charge job has run. Payments appear when bank lines are matched." />;

  const selected = payers.find((p) => p.payer === payer) ?? payers[0]!;
  const lines = [...selected.lines].reverse();
  const shown = lines.slice((page - 1) * LEDGER_PAGE, page * LEDGER_PAGE);

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap">
        {payers.length > 1 ? (
          <SegmentedControl
            aria-label="Payer"
            value={selected.payer}
            onChange={(v) => {
              setPayer(v as Payer);
              setPage(1);
            }}
            data={payers.map((p) => ({ value: p.payer, label: PAYER_LABEL[p.payer] }))}
          />
        ) : (
          <Text fw={600}>{PAYER_LABEL[selected.payer]}</Text>
        )}
        <Group gap="lg">
          <Text fz="sm">
            Charged <b className="tabular">{formatPence(selected.chargedPence)}</b>
          </Text>
          <Text fz="sm">
            Received <b className="tabular">{formatPence(selected.receivedPence)}</b>
          </Text>
          <Text fz="sm">
            Balance{' '}
            <Text span fw={700} c={selected.balancePence > 0 ? 'red.8' : 'teal.8'} className="tabular">
              {formatPence(selected.balancePence)}
            </Text>
          </Text>
        </Group>
      </Group>
      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <Table striped aria-label={`Rent account ledger, ${PAYER_LABEL[selected.payer]}`}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={120}>Date</Table.Th>
              <Table.Th w={130}>Type</Table.Th>
              <Table.Th>Description</Table.Th>
              <Table.Th ta="right" w={130}>
                Amount
              </Table.Th>
              <Table.Th ta="right" w={130}>
                Balance
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {shown.map((l, i) => (
              <Table.Tr key={`${l.date}-${i}`}>
                <Table.Td className="tabular">{formatDate(l.date)}</Table.Td>
                <Table.Td>
                  <Badge variant="light" color={l.kind === 'receipt' ? 'teal' : l.kind === 'charge' ? 'navy' : 'orange'}>
                    {l.kind === 'receipt' ? 'Payment' : humanize(l.kind)}
                  </Badge>
                </Table.Td>
                <Table.Td>{l.description}</Table.Td>
                <Table.Td ta="right" className="tabular" c={l.amountPence < 0 ? 'teal.8' : undefined}>
                  {formatPence(l.amountPence)}
                </Table.Td>
                <Table.Td ta="right" fw={600} className="tabular">
                  {formatPence(l.balancePence)}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
      <TablePagination page={page} pageSize={LEDGER_PAGE} total={lines.length} onPageChange={setPage} />
    </Stack>
  );
}

/** Receipts on this tenancy, paged by the server (GET /api/receipts?tid&page). */
export function ReceiptsSection({ tid, canOpenReceipts }: { tid: string; canOpenReceipts: boolean }) {
  const [page, setPage] = useState(1);
  const receipts = useReceipts({ tid, status: '', page });

  if (receipts.isPending) return <Loading />;
  if (receipts.isError) return <ErrorState error={receipts.error} title="Receipts unavailable" onRetry={() => void receipts.refetch()} retrying={receipts.isFetching} />;
  const { receipts: rows, total, pageSize } = receipts.data;
  if (total === 0)
    return <EmptyState title="No receipts yet" description="A receipt is created when a bank line is matched to this tenancy (automatically or in the review queue)." action={<Button component={Link} to="/review" variant="light">Open review queue</Button>} />;

  return (
    <Stack gap="md">
      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <Table striped aria-label="Receipts">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Received</Table.Th>
              <Table.Th>Payer</Table.Th>
              <Table.Th ta="right">Amount</Table.Th>
              <Table.Th ta="right">Allocated</Table.Th>
              <Table.Th>Matched via</Table.Th>
              <Table.Th>Xero</Table.Th>
              <Table.Th>Vico</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td className="tabular">{formatDate(r.receivedOn)}</Table.Td>
                <Table.Td>{PAYER_LABEL[r.payer]}</Table.Td>
                <Table.Td ta="right" fw={600} className="tabular">
                  {formatPence(r.amountPence)}
                </Table.Td>
                <Table.Td ta="right" className="tabular">
                  {formatPence(r.allocatedPence)}
                </Table.Td>
                <Table.Td>{humanize(r.matchedVia)}</Table.Td>
                <Table.Td>{XERO_LABEL[r.xeroState]}</Table.Td>
                <Table.Td>{r.vicoExported ? 'Exported' : 'Pending'}</Table.Td>
                <Table.Td>
                  <Badge variant="light" color={r.status === 'active' ? 'teal' : 'gray'}>
                    {humanize(r.status)}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
      <Group justify="space-between">
        {canOpenReceipts ? (
          <Anchor component={Link} to={`/receipts?tid=${encodeURIComponent(tid)}`} fz="sm">
            Split, re-allocate or reverse in Receipts
          </Anchor>
        ) : (
          <span />
        )}
        <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
      </Group>
    </Stack>
  );
}

const KIND_LABEL: Record<string, string> = { write_off: 'Write-off', refund: 'Refund', correction: 'Reversal' };

/** Adjustments (write-offs, refunds) with Reverse for admin/accounts (POST /api/adjustments/:id/reverse). */
export function AdjustmentsSection({ tid, canAdjust, onNew }: { tid: string; canAdjust: boolean; onNew: () => void }) {
  const adjustments = useAdjustments(tid);
  const reverse = useReverseAdjustment();
  const [target, setTarget] = useState<AdjustmentRow | null>(null);

  if (adjustments.isPending) return <Loading />;
  if (adjustments.isError) return <ErrorState error={adjustments.error} title="Adjustments unavailable" onRetry={() => void adjustments.refetch()} retrying={adjustments.isFetching} />;
  const rows = adjustments.data.adjustments;

  return (
    <Stack gap="md">
      {canAdjust && (
        <Group justify="flex-end">
          <Button leftSection={<IconPlus size={16} />} onClick={onNew}>
            New refund or write-off
          </Button>
        </Group>
      )}
      {rows.length === 0 ? (
        <EmptyState title="No adjustments" description="Refunds and write-offs booked to this rent account appear here." />
      ) : (
        <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
          <Table striped aria-label="Adjustments">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Effective</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Payer</Table.Th>
                <Table.Th>Reason</Table.Th>
                <Table.Th ta="right">Amount</Table.Th>
                <Table.Th>By</Table.Th>
                {canAdjust && <Table.Th aria-label="Actions" />}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((a) => {
                const reversed = a.reversedByAdjustmentId !== null;
                return (
                  <Table.Tr key={a.id} style={{ opacity: reversed ? 0.6 : 1 }}>
                    <Table.Td className="tabular">{formatDate(a.effectiveOn)}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={a.kind === 'refund' ? 'navy' : a.kind === 'write_off' ? 'orange' : 'gray'}>
                        {KIND_LABEL[a.kind] ?? humanize(a.kind)}
                      </Badge>
                      {reversed && (
                        <Badge ml={6} variant="outline" color="gray">
                          Reversed
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>{PAYER_LABEL[a.payer]}</Table.Td>
                    <Table.Td>{a.reason}</Table.Td>
                    <Table.Td ta="right" fw={600} className="tabular">
                      {formatPence(a.amountPence)}
                    </Table.Td>
                    <Table.Td>{a.approvedBy ?? '—'}</Table.Td>
                    {canAdjust && (
                      <Table.Td ta="right">
                        {!reversed && a.reversesAdjustmentId === null && (
                          <Button size="compact-sm" variant="subtle" color="red" leftSection={<IconArrowBackUp size={14} />} onClick={() => setTarget(a)} aria-label={`Reverse ${KIND_LABEL[a.kind] ?? a.kind} of ${formatPence(a.amountPence)}`}>
                            Reverse
                          </Button>
                        )}
                      </Table.Td>
                    )}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
      <ConfirmDialog
        opened={target !== null}
        onClose={() => {
          setTarget(null);
          reverse.reset();
        }}
        tone="danger"
        title="Reverse this adjustment?"
        message={target && <>This books an equal and opposite entry for {formatPence(target.amountPence)} ({target.reason}). The original stays on the audit trail.</>}
        reasonLabel="Reason for reversing"
        confirmLabel="Reverse adjustment"
        loading={reverse.isPending}
        error={reverse.isError ? errorMessage(reverse.error) : null}
        onConfirm={(reason) =>
          target &&
          reverse.mutate(
            { id: target.id, reason },
            {
              onSuccess: () => {
                notifications.show({ color: 'teal', title: 'Adjustment reversed', message: `${formatPence(target.amountPence)} reversed on ${tid}.` });
                setTarget(null);
              },
            },
          )
        }
      />
    </Stack>
  );
}

/** Payer bank accounts linked to this tenancy (last 4 only), with Add for writers. */
export function PayerAccountsSection({ payers, canWrite }: { payers: UseQueryResult<PayerAccount[]>; canWrite: boolean }) {
  const [adding, setAdding] = useState(false);
  return (
    <Stack gap="md">
      {canWrite && (
        <Group justify="flex-end">
          <Button leftSection={<IconPlus size={16} />} onClick={() => setAdding(true)}>
            Add payer account
          </Button>
        </Group>
      )}
      {payers.isPending ? (
        <Loading />
      ) : payers.isError ? (
        <ErrorState error={payers.error} title="Payer accounts unavailable" onRetry={() => void payers.refetch()} />
      ) : payers.data.length === 0 ? (
        <EmptyState title="No payer accounts" description="Accounts are remembered when a matched payment is confirmed with “Remember”, or added here." />
      ) : (
        <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
          <Table striped aria-label="Payer accounts">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Account</Table.Th>
                <Table.Th>Holder</Table.Th>
                <Table.Th>Pays as</Table.Th>
                <Table.Th>Source</Table.Th>
                <Table.Th>Shared with</Table.Th>
                <Table.Th>Added</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {payers.data.map((p) => (
                <Table.Tr key={p.id}>
                  <Table.Td>
                    <MaskedValue value={p.account} kind="account" />
                  </Table.Td>
                  <Table.Td>{p.holderName ?? humanize(p.holderType)}</Table.Td>
                  <Table.Td>{PAYER_LABEL[p.payer]}</Table.Td>
                  <Table.Td>{p.source === 'learned' ? 'Learned' : 'Manual'}</Table.Td>
                  <Table.Td>{p.sharedWith > 0 ? `${p.sharedWith} other tenancies` : '—'}</Table.Td>
                  <Table.Td className="tabular">{formatDate(p.createdAt)}</Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={p.isActive ? 'teal' : 'gray'}>
                      {p.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
      <AddPayerAccountModal opened={adding} onClose={() => setAdding(false)} />
    </Stack>
  );
}
