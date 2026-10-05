import { Alert, Anchor, Card, Group, Stack, Table, Text, Title } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components';
import { errorMessage } from '../../lib/api';
import { gbp, PAYER_LABEL, useDashboard, type Dashboard } from './api';
import { StatementCard } from './StatementCard';

const pct = (p: number | null): string => (p === null ? '—' : `${p.toFixed(1)}%`);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card withBorder padding="lg">
      <Stack gap="sm">
        <Title order={2} fz="md">
          {title}
        </Title>
        {children}
      </Stack>
    </Card>
  );
}

function ImportsCard({ data }: { data: Dashboard['imports'] }) {
  const t = data.total;
  return (
    <Section title="Today's imports">
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Bank</Table.Th>
            <Table.Th ta="right">Files</Table.Th>
            <Table.Th ta="right">Lines</Table.Th>
            <Table.Th ta="right">Incoming</Table.Th>
            <Table.Th ta="right">Auto-matched</Table.Th>
            <Table.Th ta="right">Auto-match rate</Table.Th>
            <Table.Th>Last upload</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.banks.map((b) => (
            <Table.Tr key={b.bankAccountId}>
              <Table.Td>{b.code}</Table.Td>
              <Table.Td ta="right">{b.files}</Table.Td>
              <Table.Td ta="right">{b.lines}</Table.Td>
              <Table.Td ta="right">{b.incoming}</Table.Td>
              <Table.Td ta="right">{b.autoMatched}</Table.Td>
              <Table.Td ta="right">{pct(b.ratePct)}</Table.Td>
              <Table.Td>{b.lastUpload ?? '—'}</Table.Td>
            </Table.Tr>
          ))}
          <Table.Tr fw={700}>
            <Table.Td>Total</Table.Td>
            <Table.Td ta="right">{t.files}</Table.Td>
            <Table.Td ta="right">{t.lines}</Table.Td>
            <Table.Td ta="right">{t.incoming}</Table.Td>
            <Table.Td ta="right">{t.autoMatched}</Table.Td>
            <Table.Td ta="right">{pct(t.ratePct)}</Table.Td>
            <Table.Td>{t.lastUpload ?? '—'}</Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
    </Section>
  );
}

function BacklogCard({ data }: { data: Dashboard['backlog'] }) {
  return (
    <Section title="Review backlog">
      <Group gap="xl">
        <Stack gap={0}>
          <Text fz={28} fw={700}>
            {data.backlog}
          </Text>
          <Text size="sm" c="dimmed">
            to review
          </Text>
        </Stack>
        <Text size="sm">
          New {data.new} · Needs review {data.needsReview} · Partially matched {data.partiallyMatched} · Yet to take {data.yetToTake}
        </Text>
      </Group>
      {data.oldestDays !== null && <Text size="sm">Oldest: {data.oldestDays} days</Text>}
      <Anchor component={Link} to="/review?status=needs_review" size="sm">
        Open the review queue
      </Anchor>
    </Section>
  );
}

function BalancesCard({ data }: { data: Dashboard['balances'] }) {
  return (
    <Section title="Balances by payer">
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Payer</Table.Th>
            <Table.Th ta="right">Accounts</Table.Th>
            <Table.Th ta="right">Arrears</Table.Th>
            <Table.Th ta="right">Credit</Table.Th>
            <Table.Th ta="right">Net</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.map((r) => (
            <Table.Tr key={r.payer} fw={r.payer === 'total' ? 700 : undefined}>
              <Table.Td>{PAYER_LABEL[r.payer]}</Table.Td>
              <Table.Td ta="right">{r.accounts}</Table.Td>
              <Table.Td ta="right">{gbp(r.arrearsPence)}</Table.Td>
              <Table.Td ta="right">{gbp(r.creditPence)}</Table.Td>
              <Table.Td ta="right">{gbp(r.netPence)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Section>
  );
}

function AgeingCard({ data }: { data: Dashboard['ageing'] }) {
  return (
    <Section title="Arrears ageing">
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Payer</Table.Th>
            <Table.Th ta="right">0-30 days</Table.Th>
            <Table.Th ta="right">31-60 days</Table.Th>
            <Table.Th ta="right">61-90 days</Table.Th>
            <Table.Th ta="right">91+ days</Table.Th>
            <Table.Th ta="right">Total</Table.Th>
            <Table.Th ta="right">Accounts in arrears</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.map((r) => (
            <Table.Tr key={r.payer} fw={r.payer === 'total' ? 700 : undefined}>
              <Table.Td>{PAYER_LABEL[r.payer]}</Table.Td>
              <Table.Td ta="right">{gbp(r.d0_30)}</Table.Td>
              <Table.Td ta="right">{gbp(r.d31_60)}</Table.Td>
              <Table.Td ta="right">{gbp(r.d61_90)}</Table.Td>
              <Table.Td ta="right">{gbp(r.d91Plus)}</Table.Td>
              <Table.Td ta="right">{gbp(r.totalPence)}</Table.Td>
              <Table.Td ta="right">{r.accountsInArrears}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Section>
  );
}

/** Today at a glance: imports, review backlog, balances and arrears ageing, plus tenant statements. */
export function DashboardPage() {
  useDocumentTitle('Dashboard');
  const q = useDashboard();
  return (
    <>
      <PageHeader title="Dashboard" description={q.data ? `Figures for ${q.data.date}` : undefined} />
      <Stack gap="lg">
        {q.isError && (
          <Alert color="red" role="alert">
            {errorMessage(q.error)}
          </Alert>
        )}
        {q.data && (
          <>
            <ImportsCard data={q.data.imports} />
            <BacklogCard data={q.data.backlog} />
            <BalancesCard data={q.data.balances} />
            <AgeingCard data={q.data.ageing} />
          </>
        )}
        <StatementCard />
      </Stack>
    </>
  );
}
