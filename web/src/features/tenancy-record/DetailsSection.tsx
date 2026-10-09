import { Alert, Badge, Paper, SimpleGrid, Skeleton, Stack, Table, Tabs, Text, TextInput, Title } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, ErrorState, MaskedValue } from '../../components';
import { NiField } from '../tenancies/TenancyDrawer';
import { managementLabel, tenancyAddress, type TenancyDetail } from '../../data/tenancies';
import { formatDate, humanize } from '../../lib/format';
import type { PayerAccount } from '../payer-accounts/api';
import { PAYER_LABEL, type ReceiptSummary } from '../receipts/api';
import type { RentAccount } from '../rent-terms/api';
import { formatPence } from '../rent-terms/money';
import { lastDuePeriod, lastReceipt, totalBalancePence, type DetailsTab } from './recordModel';

interface Props {
  tab: DetailsTab;
  tenancy: TenancyDetail;
  rent: UseQueryResult<RentAccount>;
  receipts: UseQueryResult<{ receipts: ReceiptSummary[] }>;
  payers: UseQueryResult<PayerAccount[]>;
}

/** A read-only field in LetMC's form layout: label above a filled box. */
function Field({ label, value }: { label: string; value: ReactNode }) {
  return typeof value === 'string' || value === null ? (
    <TextInput label={label} value={value ?? '—'} readOnly variant="filled" />
  ) : (
    <Stack gap={4}>
      <Text fz="sm" fw={500}>
        {label}
      </Text>
      <Paper bg="var(--mantine-color-default-hover)" px="sm" py={7} radius="sm">
        {value}
      </Paper>
    </Stack>
  );
}

function Group3({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap="sm">
      <Title order={3} fz="sm">
        {title}
      </Title>
      {children}
    </Stack>
  );
}

/**
 * LetMC's Tenant Details tabs (guide: tenancy_details/*.png). Recon holds only reconciliation data,
 * so the tabs show what the API returns; LetMC's Admin, Notes, Right to Rent and CRM tabs have no
 * Recon data and are not offered (plans/recon-601.md D5).
 */
export function DetailsSection({ tab, tenancy, rent, receipts, payers }: Props) {
  const navigate = useNavigate();
  const account = rent.data;
  const last = lastReceipt(receipts.data?.receipts);
  const lastCharge = account?.payers
    .flatMap((p) => p.lines.filter((l) => l.kind === 'charge'))
    .reduce<string | null>((latest, l) => (latest === null || l.date > latest ? l.date : latest), null);
  const balance = totalBalancePence(account);
  const due = lastDuePeriod(account);

  return (
    <Tabs value={tab} onChange={(v) => v && navigate(`?view=details&tab=${v}`)} variant="pills" color="ember.8" keepMounted={false}>
      <Tabs.List mb="lg" aria-label="Tenant details">
        <Tabs.Tab value="personal">Personal details</Tabs.Tab>
        <Tabs.Tab value="bank">Bank details</Tabs.Tab>
        <Tabs.Tab value="tenancy">Tenancy</Tabs.Tab>
        <Tabs.Tab value="chasing">Rent chasing</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="personal">
        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="xl">
          <Group3 title="Office details">
            <Field label="Tenancy ID (TID)" value={tenancy.tid} />
            <Field label="Managed by" value={`Branch ${tenancy.branchCode}`} />
            <Field label="Management type" value={managementLabel(tenancy.managementType)} />
          </Group3>
          <Group3 title="Tenant details">
            <Field label="Tenant name" value={tenancy.tenantName ?? 'Not held'} />
            <Field
              label="NI number"
              value={tenancy.ni || tenancy.niMasked ? <NiField key={tenancy.tid} tenancy={tenancy} /> : 'Not held'}
            />
          </Group3>
          <Group3 title="Contact details">
            <Alert variant="light" color="gray" icon={<IconInfoCircle size={16} />} p="sm">
              Recon does not hold e-mail, phone or postal preferences. Use agentOS for contact details.
            </Alert>
          </Group3>
        </SimpleGrid>
      </Tabs.Panel>

      <Tabs.Panel value="bank">
        <Stack gap="sm">
          <Text fz="sm" c="dimmed">
            Bank accounts known to pay for this tenancy. Only the last 4 digits are ever shown.
          </Text>
          {payers.isPending ? (
            <Skeleton h={80} />
          ) : payers.isError ? (
            <ErrorState error={payers.error} title="Payer accounts unavailable" onRetry={() => void payers.refetch()} />
          ) : payers.data.length === 0 ? (
            <EmptyState size="sm" title="No payer accounts" description="Recon remembers a payer account when a matched payment is confirmed with “Remember”." />
          ) : (
            <Table withTableBorder striped aria-label="Payer bank accounts">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Account</Table.Th>
                  <Table.Th>Holder</Table.Th>
                  <Table.Th>Pays as</Table.Th>
                  <Table.Th>Source</Table.Th>
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
                    <Table.Td>{p.source === 'learned' ? 'Learned from a match' : 'Added by staff'}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={p.isActive ? 'teal' : 'gray'}>
                        {p.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Stack>
      </Tabs.Panel>

      <Tabs.Panel value="tenancy">
        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="xl">
          <Group3 title="Current tenancy">
            <Field label="Status" value={humanize(tenancy.status)} />
            <Field label="Start date" value={formatDate(tenancy.startDate)} />
            <Field label="End date" value={tenancy.endDate ? formatDate(tenancy.endDate) : 'No end date'} />
          </Group3>
          <Group3 title="Residence">
            <Field label="Property ref" value={tenancy.unitRef ? `${tenancy.propertyRef} / ${tenancy.unitRef}` : tenancy.propertyRef} />
            <Field label="Address" value={tenancyAddress(tenancy)} />
            <Field label="Veco rent" value={tenancy.rent ? `£${tenancy.rent.amount} ${tenancy.rent.frequency}` : 'Not supplied'} />
          </Group3>
          <Group3 title="Account">
            <Field label="Balance" value={rent.isPending ? 'Loading…' : balance === null ? '—' : formatPence(balance)} />
            <Field label="Last credit" value={receipts.isPending ? 'Loading…' : last ? formatDate(last.receivedOn) : 'None'} />
            <Field label="Last debit" value={rent.isPending ? 'Loading…' : lastCharge ? formatDate(lastCharge) : 'None'} />
          </Group3>
        </SimpleGrid>
      </Tabs.Panel>

      <Tabs.Panel value="chasing">
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
          <Group3 title="Rent chase status">
            <Field label="Amount outstanding" value={rent.isPending ? 'Loading…' : formatPence(balance ?? 0)} />
            <Field label="Date of last rent due" value={due ? formatDate(due.dueDate) : 'None'} />
            <Field label="Last paid" value={last ? `${formatPence(last.amountPence)} on ${formatDate(last.receivedOn)}` : 'No payments yet'} />
          </Group3>
          <Group3 title="Chasing workflow">
            <Alert variant="light" color="gray" icon={<IconInfoCircle size={16} />} p="sm">
              Main rent chaser, chase method, reminders and delay dates are kept in agentOS. Recon supplies the figures on the
              left from the bank statements it reconciles.
            </Alert>
          </Group3>
        </SimpleGrid>
      </Tabs.Panel>
    </Tabs>
  );
}
