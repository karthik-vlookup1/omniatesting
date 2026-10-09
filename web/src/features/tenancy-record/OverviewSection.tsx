import { Anchor, Badge, Box, Divider, Group, SimpleGrid, Skeleton, Stack, Table, Text } from '@mantine/core';
import { IconCalendarDollar, IconCash, IconLink, IconReceipt, IconScale, IconSearch } from '@tabler/icons-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ErrorState } from '../../components';
import { managementLabel, type TenancyDetail } from '../../data/tenancies';
import { formatDate, humanize } from '../../lib/format';
import type { AgentosTenant } from '../agentos/api';
import { PAYER_LABEL, type ReceiptSummary } from '../receipts/api';
import { frequencyLabel, type RentAccount } from '../rent-terms/api';
import { formatPence } from '../rent-terms/money';
import { Fact, RecordCard } from './RecordCard';
import { agentosTid, currentSchedule, lastDuePeriod, lastReceipt, todayIso, totalBalancePence } from './recordModel';

interface Props {
  tenancy: TenancyDetail;
  rent: UseQueryResult<RentAccount>;
  receipts: UseQueryResult<{ receipts: ReceiptSummary[]; total: number }>;
  agentos: UseQueryResult<AgentosTenant[]>;
}

/** Positive = owed (red), zero or negative = paid up / in credit (green), as the server signs it. */
function balanceColour(pence: number): string {
  return pence > 0 ? 'red.8' : 'teal.8';
}

/**
 * LetMC's Overview (guide step 3): cards for Balances, Rent Chase, rent terms, agentOS and recent
 * payments. Every figure comes from the server (rent account, receipts, agentOS tenants).
 */
export function OverviewSection({ tenancy, rent, receipts, agentos }: Props) {
  const account = rent.data;
  const total = totalBalancePence(account);
  const last = lastReceipt(receipts.data?.receipts);
  const schedule = currentSchedule(account, todayIso());
  const due = lastDuePeriod(account);
  const charged = account?.payers.reduce((s, p) => s + p.chargedPence, 0) ?? 0;
  const received = account?.payers.reduce((s, p) => s + p.receivedPence, 0) ?? 0;
  const adjusted = account?.payers.reduce((s, p) => s + p.adjustmentsPence, 0) ?? 0;
  const agent = agentos.data?.find((t) => t.tid === agentosTid(tenancy.tid)) ?? null;

  const rentBody = (body: React.ReactNode) =>
    rent.isPending ? (
      <Stack gap={8}>
        <Skeleton h={14} />
        <Skeleton h={14} w="80%" />
        <Skeleton h={14} w="60%" />
      </Stack>
    ) : rent.isError ? (
      <ErrorState error={rent.error} title="Rent account unavailable" onRetry={() => void rent.refetch()} retrying={rent.isFetching} />
    ) : (
      body
    );

  return (
    <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="lg" verticalSpacing="lg">
      <Stack gap="lg">
        <RecordCard
          title="Balances"
          icon={<IconScale size={15} />}
          updatedAt={rent.dataUpdatedAt || undefined}
          onRefresh={() => void rent.refetch()}
          refreshing={rent.isFetching}
          accent="var(--app-accent)"
        >
          {rentBody(
            <Stack gap="sm" align="stretch">
              <Box ta="center" py="xs">
                <Text className="figure" fz={40} fw={700} lh={1.1} c={balanceColour(total ?? 0)} data-testid="record-balance">
                  {formatPence(total ?? 0)}
                </Text>
                <Text fz="sm" c="dimmed" mt={4}>
                  {(total ?? 0) > 0 ? 'Owed by this tenancy' : (total ?? 0) < 0 ? 'In credit' : 'Paid up'}
                </Text>
              </Box>
              {account && account.payers.length > 0 ? (
                <Table verticalSpacing={6} aria-label="Balance by payer">
                  <Table.Tbody>
                    {account.payers.map((p) => (
                      <Table.Tr key={p.payer}>
                        <Table.Td>{PAYER_LABEL[p.payer]}</Table.Td>
                        <Table.Td ta="right" fw={600} c={balanceColour(p.balancePence)} className="tabular">
                          {formatPence(p.balancePence)}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              ) : (
                <Text fz="sm" c="dimmed" ta="center">
                  No charges or payments yet. Set the rent to start the rent account.
                </Text>
              )}
            </Stack>,
          )}
        </RecordCard>

        <RecordCard title="Rent terms" icon={<IconCalendarDollar size={15} />} action={<Anchor component={Link} to="?view=terms" fz="xs">Open</Anchor>}>
          {rentBody(
            <Stack gap={2}>
              <Fact label="Current rent">
                {schedule ? `${formatPence(schedule.amountPence)} ${frequencyLabel(schedule.frequency).toLowerCase()}` : tenancy.rent ? `£${tenancy.rent.amount} ${tenancy.rent.frequency} (from Veco)` : 'Not set'}
              </Fact>
              <Fact label="Charges from">{formatDate(account?.tenancy.chargesFrom)}</Fact>
              <Fact label="Last rent due">{due ? formatDate(due.dueDate) : '—'}</Fact>
              <Fact label="Payer splits">{account?.splits.filter((s) => !s.effectiveTo).length ?? 0} active</Fact>
              <Fact label="Benefit awards">{account?.awards.filter((a) => !a.effectiveTo).length ?? 0} active</Fact>
            </Stack>,
          )}
        </RecordCard>
      </Stack>

      <Stack gap="lg">
        <RecordCard title="Rent chase" icon={<IconSearch size={15} />} updatedAt={rent.dataUpdatedAt || undefined}>
          {rentBody(
            <Stack gap={2}>
              <Fact label="Amount outstanding">
                <Text span fw={700} c={balanceColour(total ?? 0)} className="tabular">
                  {formatPence(total ?? 0)}
                </Text>
              </Fact>
              <Fact label="Property managed by">
                Branch {tenancy.branchCode} · {managementLabel(tenancy.managementType)}
              </Fact>
              <Fact label="Last paid">
                {receipts.isPending ? (
                  <Skeleton h={12} w={160} />
                ) : last ? (
                  <>
                    {formatPence(last.amountPence)} ({PAYER_LABEL[last.payer]}) received on {formatDate(last.receivedOn)}
                  </>
                ) : (
                  'No payments received yet'
                )}
              </Fact>
              <Fact label="Account status">
                <Badge variant="light" color={tenancy.status === 'active' ? 'teal' : tenancy.status === 'ended' ? 'gray' : 'blue'}>
                  {humanize(tenancy.status)}
                </Badge>
              </Fact>
              <Divider my={8} />
              <Fact label="Rent made due">
                <span className="tabular">{formatPence(charged)}</span>
              </Fact>
              <Fact label="Rent paid">
                <span className="tabular">{formatPence(received)}</span>
              </Fact>
              <Fact label="Adjustments">
                <span className="tabular">{formatPence(adjusted)}</span>
              </Fact>
            </Stack>,
          )}
        </RecordCard>
      </Stack>

      <Stack gap="lg">
        <RecordCard
          title="agentOS"
          icon={<IconLink size={15} />}
          updatedAt={agentos.dataUpdatedAt || undefined}
          onRefresh={() => void agentos.refetch()}
          refreshing={agentos.isFetching}
        >
          {agentos.isPending ? (
            <Skeleton h={40} />
          ) : agentos.isError ? (
            <ErrorState error={agentos.error} title="agentOS tenants unavailable" onRetry={() => void agentos.refetch()} />
          ) : agent ? (
            <Stack gap={2}>
              <Fact label="agentOS tenant">
                {agent.tid} {agent.name}
              </Fact>
            </Stack>
          ) : (
            <Text fz="sm" c="dimmed">
              No agentOS tenant with TID {agentosTid(tenancy.tid)}. Payments for this tenancy are not posted to agentOS until
              the agentOS sync brings it in.
            </Text>
          )}
        </RecordCard>

        <RecordCard
          title="Recent payments"
          icon={<IconReceipt size={15} />}
          action={
            <Anchor component={Link} to="?view=receipts" fz="xs">
              All {receipts.data?.total ?? ''}
            </Anchor>
          }
        >
          {receipts.isPending ? (
            <Stack gap={8}>
              <Skeleton h={14} />
              <Skeleton h={14} />
            </Stack>
          ) : receipts.isError ? (
            <ErrorState error={receipts.error} title="Receipts unavailable" onRetry={() => void receipts.refetch()} />
          ) : receipts.data.receipts.length === 0 ? (
            <Group gap="xs" c="dimmed">
              <IconCash size={16} aria-hidden />
              <Text fz="sm">No payments matched to this tenancy yet.</Text>
            </Group>
          ) : (
            <Table verticalSpacing={6} aria-label="Recent payments">
              <Table.Tbody>
                {receipts.data.receipts.slice(0, 5).map((r) => (
                  <Table.Tr key={r.id} style={{ opacity: r.status === 'reversed' ? 0.6 : 1 }}>
                    <Table.Td className="tabular">{formatDate(r.receivedOn)}</Table.Td>
                    <Table.Td>{PAYER_LABEL[r.payer]}</Table.Td>
                    <Table.Td ta="right" fw={600} className="tabular" td={r.status === 'reversed' ? 'line-through' : undefined}>
                      {formatPence(r.amountPence)}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </RecordCard>
      </Stack>
    </SimpleGrid>
  );
}
