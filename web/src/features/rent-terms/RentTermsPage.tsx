import { Alert, Button, Group, NativeSelect, Paper, Stack, Text, TextInput, Title, VisuallyHidden } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { DataTable, EmptyState, PageHeader, type DataTableColumn } from '../../components';
import { can, useCurrentUser } from '../../data/auth';
import { errorMessage } from '../../lib/api';
import {
  FREQUENCY_OPTIONS,
  PAYER_LABEL,
  frequencyLabel,
  useEnd,
  useRentAccount,
  useSetRent,
  type EndKind,
  type Frequency,
  type Payer,
  type RentAccount,
} from './api';
import { BenefitAwardModal } from './BenefitAwardModal';
import { formatPence, parsePounds } from './money';
import { PayerSplitModal } from './PayerSplitModal';
import { PaymentMethodModal } from './PaymentMethodModal';

type Modals = 'award' | 'split' | 'method' | null;
const dash = (v: string | null) => v ?? '—';
const range = (from: string, to: string | null) => `${from} to ${to ?? 'open'}`;
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Rent terms and the rent account of one tenancy. Anyone signed in can read; writers edit. */
export function RentTermsPage() {
  const { tid = '' } = useParams();
  useDocumentTitle(`Rent ${tid} · Omnia Recon`);
  const canEdit = can(useCurrentUser(), 'write');
  const query = useRentAccount(tid);
  const [modal, setModal] = useState<Modals>(null);
  const end = useEnd(tid);
  const close = () => setModal(null);

  if (query.isError) {
    return (
      <>
        <PageHeader title={`Rent terms ${tid}`} breadcrumbs={[{ label: 'Rent', to: '/rent' }, { label: tid }]} />
        <Alert color="red">{errorMessage(query.error)}</Alert>
      </>
    );
  }
  const account = query.data;

  const endRow = (kind: EndKind, id: string, label: string) => (
    <Button
      size="compact-sm"
      variant="default"
      aria-label={`End ${label}`}
      loading={end.isPending && end.variables?.id === id}
      onClick={() =>
        end.mutate(
          { kind, id, effectiveTo: todayIso() },
          { onError: (err) => notifications.show({ color: 'red', title: 'Could not end it', message: errorMessage(err) }) },
        )
      }
    >
      End
    </Button>
  );
  const actions = <T extends { id: string; effectiveTo: string | null }>(kind: EndKind, label: (r: T) => string): DataTableColumn<T> => ({
    key: 'actions',
    header: <VisuallyHidden>Actions</VisuallyHidden>,
    align: 'right',
    width: 80,
    cell: (r) => (canEdit && r.effectiveTo === null ? endRow(kind, r.id, label(r)) : null),
  });

  const empty = (title: string) => <EmptyState size="sm" title={title} />;

  return (
    <Stack gap="xl">
      <div>
        <PageHeader
          title={`Rent terms ${tid}`}
          description={
            account
              ? `Tenancy started ${account.tenancy.startDate}${account.tenancy.endDate ? `, ended ${account.tenancy.endDate}` : ''}. Xero stays the ledger of record; nothing here posts to Xero.`
              : undefined
          }
          breadcrumbs={[{ label: 'Rent', to: '/rent' }, { label: tid }]}
        />
        {canEdit && <RentForm tid={tid} />}
        <Text fz="xs" c="dimmed" mt="xs">
          Veco sync replaces rent that differs from Veco.
        </Text>
      </div>

      <Section title="Rent history" action={null}>
        <DataTable
          caption="Rent history"
          data={account?.schedules}
          loading={query.isPending}
          getRowId={(s) => s.id}
          empty={empty('No rent set yet')}
          columns={[
            { key: 'amount', header: 'Rent', align: 'right', cell: (s) => formatPence(s.amountPence) },
            { key: 'freq', header: 'Cycle', cell: (s) => frequencyLabel(s.frequency) },
            { key: 'when', header: 'Dates', cell: (s) => range(s.effectiveFrom, s.effectiveTo) },
            { key: 'reason', header: 'Reason', cell: (s) => dash(s.reason) },
          ]}
        />
      </Section>

      <Section title="Benefit awards" action={canEdit ? <AddButton label="Add benefit award" onClick={() => setModal('award')} /> : null}>
        <DataTable
          caption="Benefit awards"
          data={account?.awards}
          loading={query.isPending}
          getRowId={(a) => a.id}
          empty={empty('No benefit awards')}
          columns={[
            { key: 'benefit', header: 'Benefit', cell: (a) => a.benefit },
            { key: 'body', header: 'Paying body', cell: (a) => a.payingBody },
            { key: 'ref', header: 'Claim reference', cell: (a) => dash(a.claimReference) },
            { key: 'amount', header: 'Award', align: 'right', cell: (a) => `${formatPence(a.awardPence)} ${frequencyLabel(a.awardFrequency).toLowerCase()}` },
            { key: 'to', header: 'Paid to', cell: (a) => (a.paidTo === 'landlord_direct' ? 'Landlord direct' : 'Tenant') },
            { key: 'when', header: 'Dates', cell: (a) => range(a.effectiveFrom, a.effectiveTo) },
            actions<RentAccount['awards'][number]>('benefit-awards', (a) => `${a.benefit} award from ${a.effectiveFrom}`),
          ]}
        />
      </Section>

      <Section title="Payer splits" action={canEdit ? <AddButton label="Add payer split" onClick={() => setModal('split')} /> : null}>
        <DataTable
          caption="Payer splits"
          data={account?.splits}
          loading={query.isPending}
          getRowId={(s) => s.id}
          empty={empty('No payer splits: the tenant owes the whole rent')}
          columns={[
            { key: 'payer', header: 'Payer', cell: (s) => PAYER_LABEL[s.payer] },
            {
              key: 'share',
              header: 'Share',
              align: 'right',
              cell: (s) => (s.fixedPence !== null ? `${formatPence(s.fixedPence)} per period` : `${s.sharePercent ?? ''}%`),
            },
            { key: 'source', header: 'Source', cell: (s) => (s.benefitAwardId ? 'Benefit award' : 'Manual') },
            { key: 'when', header: 'Dates', cell: (s) => range(s.effectiveFrom, s.effectiveTo) },
            {
              key: 'actions',
              header: <VisuallyHidden>Actions</VisuallyHidden>,
              align: 'right',
              width: 80,
              cell: (s) =>
                canEdit && s.effectiveTo === null && !s.benefitAwardId ? endRow('payer-splits', s.id, `${PAYER_LABEL[s.payer]} split from ${s.effectiveFrom}`) : null,
            },
          ]}
        />
      </Section>

      <Section title="Payment methods" action={canEdit ? <AddButton label="Add payment method" onClick={() => setModal('method')} /> : null}>
        <DataTable
          caption="Payment methods"
          data={account?.paymentMethods}
          loading={query.isPending}
          getRowId={(m) => m.id}
          empty={empty('No payment methods recorded')}
          columns={[
            { key: 'payer', header: 'Payer', cell: (m) => PAYER_LABEL[m.payer] },
            { key: 'method', header: 'Method', cell: (m) => m.method.replace(/_/g, ' ') },
            {
              key: 'expected',
              header: 'Expected',
              align: 'right',
              cell: (m) => (m.expectedPence === null ? '—' : `${formatPence(m.expectedPence)} ${frequencyLabel(m.expectedFrequency).toLowerCase()}`.trim()),
            },
            { key: 'hint', header: 'Reference hint', cell: (m) => dash(m.referenceHint) },
            { key: 'when', header: 'Dates', cell: (m) => range(m.effectiveFrom, m.effectiveTo) },
            actions<RentAccount['paymentMethods'][number]>('payment-methods', (m) => `${PAYER_LABEL[m.payer]} payment method from ${m.effectiveFrom}`),
          ]}
        />
      </Section>

      <Section title="Rent periods" action={null}>
        <DataTable
          caption="Rent periods"
          data={account?.periods}
          loading={query.isPending}
          getRowId={(p) => p.periodStart}
          empty={empty(account?.tenancy.chargesFrom ? 'Nothing is due yet' : 'No rent account yet: save the rent to start one')}
          columns={periodColumns}
        />
      </Section>

      <Section title="Balance by payer" action={null}>
        <DataTable
          caption="Balance by payer"
          data={account?.payers}
          loading={query.isPending}
          getRowId={(p) => p.payer}
          empty={empty('No charges yet')}
          columns={[
            { key: 'payer', header: 'Payer', cell: (p) => PAYER_LABEL[p.payer] },
            { key: 'charged', header: 'Charged', align: 'right', cell: (p) => formatPence(p.chargedPence) },
            { key: 'received', header: 'Received', align: 'right', cell: (p) => formatPence(p.receivedPence) },
            { key: 'balance', header: 'Balance', align: 'right', cell: (p) => formatPence(p.balancePence) },
          ]}
        />
        <Text fz="xs" c="dimmed" mt="xs">
          A positive balance is arrears; a negative balance is credit.
        </Text>
      </Section>

      {account?.payers.map((p) => (
        <Section key={p.payer} title={`Statement ${PAYER_LABEL[p.payer]}`} action={null}>
          <DataTable
            caption={`Statement ${PAYER_LABEL[p.payer]}`}
            data={p.lines}
            getRowId={(l) => `${l.date}|${l.kind}|${l.description}|${l.balancePence}`}
            columns={[
              { key: 'date', header: 'Date', cell: (l) => l.date },
              { key: 'desc', header: 'Description', cell: (l) => l.description },
              { key: 'amount', header: 'Amount', align: 'right', cell: (l) => formatPence(l.amountPence) },
              { key: 'balance', header: 'Balance', align: 'right', cell: (l) => formatPence(l.balancePence) },
            ]}
          />
        </Section>
      ))}

      <BenefitAwardModal tid={tid} opened={modal === 'award'} onClose={close} />
      <PayerSplitModal tid={tid} opened={modal === 'split'} onClose={close} />
      <PaymentMethodModal tid={tid} opened={modal === 'method'} onClose={close} />
    </Stack>
  );
}

const PERIOD_PAYERS: Payer[] = ['tenant', 'council_hb', 'dwp_uc', 'other_third_party'];
const periodColumns: DataTableColumn<RentAccount['periods'][number]>[] = [
  { key: 'period', header: 'Period', cell: (p) => `${p.periodStart} to ${p.periodEnd}` },
  ...PERIOD_PAYERS.map((payer) => ({
    key: payer,
    header: PAYER_LABEL[payer],
    align: 'right' as const,
    cell: (p: RentAccount['periods'][number]) => (p.byPayer[payer] === undefined ? '—' : formatPence(p.byPayer[payer])),
  })),
  { key: 'total', header: 'Total', align: 'right', cell: (p) => formatPence(p.totalPence) },
];

function Section({ title, action, children }: { title: string; action: React.ReactNode; children: React.ReactNode }) {
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Title order={2} fz="lg">
          {title}
        </Title>
        {action}
      </Group>
      {children}
    </Stack>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button size="compact-md" leftSection={<IconPlus size={14} aria-hidden />} onClick={onClick}>
      {label}
    </Button>
  );
}

function RentForm({ tid }: { tid: string }) {
  const set = useSetRent(tid);
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('weekly');
  const [from, setFrom] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountPence = parsePounds(amount);
    if (amountPence === null) return setProblem('Enter the rent as pounds, e.g. 650 or 650.50');
    if (!from) return setProblem('Choose the date the rent starts');
    setProblem(null);
    set.mutate(
      { amountPence, frequency, effectiveFrom: from },
      { onSuccess: () => notifications.show({ color: 'teal', title: 'Rent saved', message: 'The rent account has been updated.' }) },
    );
  };

  const message = problem ?? (set.isError ? errorMessage(set.error) : null);
  return (
    <Paper withBorder p="md">
      <form noValidate onSubmit={submit}>
        <Group align="flex-end" wrap="wrap">
          <TextInput label="Rent (£)" value={amount} onChange={(e) => setAmount(e.currentTarget.value)} w={140} />
          <NativeSelect label="Cycle" value={frequency} onChange={(e) => setFrequency(e.currentTarget.value as Frequency)} data={FREQUENCY_OPTIONS} />
          <TextInput type="date" label="Effective from" value={from} onChange={(e) => setFrom(e.currentTarget.value)} />
          <Button type="submit" loading={set.isPending}>
            Save rent
          </Button>
        </Group>
        {message && (
          <Alert color="red" mt="sm">
            {message}
          </Alert>
        )}
      </form>
    </Paper>
  );
}
