import { Alert, Button, Group, Paper, SimpleGrid, Skeleton, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconExternalLink, IconFileTypeCsv, IconFileTypePdf, IconPlus } from '@tabler/icons-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState } from '../../components';
import { errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { downloadTenantStatement, useTenantStatement } from '../dashboard/api';
import { PAYER_LABEL } from '../receipts/api';
import { PAY_METHOD_OPTIONS, frequencyLabel, type RentAccount } from '../rent-terms/api';
import { formatPence } from '../rent-terms/money';
import { todayIso, type RentAction } from './recordModel';

function TermsTable({ title, empty, head, rows, action }: { title: string; empty: string; head: string[]; rows: ReactNode[][]; action?: ReactNode }) {
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Title order={3} fz="sm">
          {title}
        </Title>
        {action}
      </Group>
      {rows.length === 0 ? (
        <Text fz="sm" c="dimmed">
          {empty}
        </Text>
      ) : (
        <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
          <Table striped aria-label={title}>
            <Table.Thead>
              <Table.Tr>
                {head.map((h) => (
                  <Table.Th key={h}>{h}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r, i) => (
                <Table.Tr key={i}>
                  {r.map((c, j) => (
                    <Table.Td key={j}>{c}</Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}

const range = (from: string, to: string | null) => `${formatDate(from)} – ${to ? formatDate(to) : 'open'}`;
const methodLabel = (m: string) => PAY_METHOD_OPTIONS.find((o) => o.value === m)?.label ?? m;

interface TermsProps {
  tid: string;
  rent: UseQueryResult<RentAccount>;
  canWrite: boolean;
  onAction: (action: RentAction) => void;
}

/** Rent terms summary (GET /api/rent/:tid). Edits open the same dialogs as the Actions menu. */
export function TermsSection({ tid, rent, canWrite, onAction }: TermsProps) {
  if (rent.isPending) return <Skeleton h={240} />;
  if (rent.isError) return <ErrorState error={rent.error} title="Rent terms unavailable" onRetry={() => void rent.refetch()} retrying={rent.isFetching} />;
  const a = rent.data;
  const add = (label: string, action: RentAction) =>
    canWrite ? (
      <Button size="compact-sm" variant="light" leftSection={<IconPlus size={14} />} onClick={() => onAction(action)}>
        {label}
      </Button>
    ) : null;

  return (
    <Stack gap="xl">
      <Group justify="space-between">
        <Text fz="sm" c="dimmed">
          Charges from {formatDate(a.tenancy.chargesFrom)}. Ending a term is done on the full rent terms page.
        </Text>
        <Button component={Link} to={`/rent/${encodeURIComponent(tid)}`} variant="default" rightSection={<IconExternalLink size={14} />}>
          Full rent terms page
        </Button>
      </Group>
      <TermsTable
        title="Rent schedules"
        empty="No rent set yet."
        head={['Rent', 'Cycle', 'Effective', 'Reason']}
        rows={[...a.schedules].reverse().map((s) => [formatPence(s.amountPence), frequencyLabel(s.frequency), range(s.effectiveFrom, s.effectiveTo), s.reason ?? '—'])}
        action={add('Set rent', 'rent')}
      />
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="xl">
        <TermsTable
          title="Benefit awards"
          empty="No benefit awards."
          head={['Benefit', 'Paying body', 'Award', 'Paid to', 'Effective']}
          rows={a.awards.map((w) => [w.benefit, w.payingBody, `${formatPence(w.awardPence)} ${frequencyLabel(w.awardFrequency).toLowerCase()}`, w.paidTo === 'landlord_direct' ? 'Landlord direct' : 'Tenant', range(w.effectiveFrom, w.effectiveTo)])}
          action={add('Add award', 'award')}
        />
        <TermsTable
          title="Payer splits"
          empty="No payer splits: the tenant pays the whole rent."
          head={['Payer', 'Share', 'Effective']}
          rows={a.splits.map((s) => [PAYER_LABEL[s.payer], s.sharePercent ? `${s.sharePercent}%` : s.fixedPence !== null ? formatPence(s.fixedPence) : '—', range(s.effectiveFrom, s.effectiveTo)])}
          action={add('Add split', 'split')}
        />
      </SimpleGrid>
      <TermsTable
        title="Payment methods"
        empty="No expected payment methods recorded."
        head={['Payer', 'Method', 'Expected', 'Reference hint', 'Effective']}
        rows={a.paymentMethods.map((m) => [
          PAYER_LABEL[m.payer],
          methodLabel(m.method),
          m.expectedPence !== null ? `${formatPence(m.expectedPence)} ${frequencyLabel(m.expectedFrequency).toLowerCase()}` : '—',
          m.referenceHint ?? '—',
          range(m.effectiveFrom, m.effectiveTo),
        ])}
        action={add('Add method', 'method')}
      />
    </Stack>
  );
}

function yearStart(today: string): string {
  return `${today.slice(0, 4)}-01-01`;
}

/** Tenant rent statement for a date range: preview, then PDF / CSV (GET /api/reports/statement/:tid…, writers). */
export function StatementSection({ tid, canWrite }: { tid: string; canWrite: boolean }) {
  const today = todayIso();
  const [from, setFrom] = useState(yearStart(today));
  const [to, setTo] = useState(today);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
  const statement = useTenantStatement(tid, from, to, canWrite && valid);
  const download = useMutation({
    mutationFn: (format: 'csv' | 'pdf') => downloadTenantStatement(tid, from, to, format),
    onSuccess: (d) => notifications.show({ color: 'teal', title: 'Statement downloaded', message: d.fileName }),
    onError: (e) => notifications.show({ color: 'red', title: 'Download failed', message: errorMessage(e) }),
  });

  if (!canWrite)
    return <EmptyState title="Statements need a staff, accounts or admin account" description="Read-only users can see the rent account but cannot produce tenant statements." />;

  return (
    <Stack gap="lg">
      <Group align="flex-end" wrap="wrap">
        <TextInput type="date" label="From" value={from} onChange={(e) => setFrom(e.currentTarget.value)} error={valid ? null : from > to ? 'From must be before To' : null} />
        <TextInput type="date" label="To" value={to} onChange={(e) => setTo(e.currentTarget.value)} />
        <Button leftSection={<IconFileTypePdf size={16} />} disabled={!valid} loading={download.isPending && download.variables === 'pdf'} onClick={() => download.mutate('pdf')}>
          Download PDF
        </Button>
        <Button variant="default" leftSection={<IconFileTypeCsv size={16} />} disabled={!valid} loading={download.isPending && download.variables === 'csv'} onClick={() => download.mutate('csv')}>
          Download CSV
        </Button>
      </Group>

      {!valid ? (
        <Alert color="orange">Choose a From date on or before the To date.</Alert>
      ) : statement.isPending ? (
        <Skeleton h={200} />
      ) : statement.isError ? (
        <ErrorState error={statement.error} title="Statement unavailable" onRetry={() => void statement.refetch()} />
      ) : statement.data.payers.length === 0 ? (
        <EmptyState icon={<IconDownload size={20} />} title="Nothing in this period" description="No charges, payments or adjustments between these dates." />
      ) : (
        statement.data.payers.map((p) => (
          <Stack key={p.payer} gap="xs">
            <Group justify="space-between">
              <Title order={3} fz="sm">
                {p.label}
              </Title>
              <Text fz="sm">
                Opening <b className="tabular">{formatPence(p.openingPence)}</b> · Closing{' '}
                <Text span fw={700} c={p.closingPence > 0 ? 'red.8' : 'teal.8'} className="tabular">
                  {formatPence(p.closingPence)}
                </Text>
              </Text>
            </Group>
            <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
              <Table striped aria-label={`Statement, ${p.label}`}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={110}>Date</Table.Th>
                    <Table.Th w={120}>Type</Table.Th>
                    <Table.Th>Description</Table.Th>
                    <Table.Th ta="right">Debit</Table.Th>
                    <Table.Th ta="right">Credit</Table.Th>
                    <Table.Th ta="right">Balance</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {p.lines.map((l, i) => (
                    <Table.Tr key={i}>
                      <Table.Td className="tabular">{formatDate(l.date)}</Table.Td>
                      <Table.Td>{l.type}</Table.Td>
                      <Table.Td>{l.description}</Table.Td>
                      <Table.Td ta="right" className="tabular">
                        {l.debitPence !== null ? formatPence(l.debitPence) : ''}
                      </Table.Td>
                      <Table.Td ta="right" className="tabular">
                        {l.creditPence !== null ? formatPence(l.creditPence) : ''}
                      </Table.Td>
                      <Table.Td ta="right" fw={600} className="tabular">
                        {formatPence(l.balancePence)}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          </Stack>
        ))
      )}
    </Stack>
  );
}
