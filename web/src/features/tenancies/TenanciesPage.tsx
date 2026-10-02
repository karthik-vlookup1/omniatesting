import {
  Alert,
  Badge,
  Button,
  Drawer,
  Group,
  List,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconRefresh, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { hasRole, useCurrentUser } from '../auth/useAuth';
import { useTenancy, useTenancySearch, useVecoSync, type StatusFilter, type SyncSummary } from './api';

const FREQUENCY: Record<string, string> = {
  weekly: 'weekly',
  fortnightly: 'fortnightly',
  four_weekly: '4-weekly',
  monthly: 'monthly',
  quarterly: 'quarterly',
};

function rentText(rent: { amount: string; frequency: string } | null): string {
  return rent ? `£${rent.amount} ${FREQUENCY[rent.frequency] ?? rent.frequency}` : '—';
}

/** Tenancies synced from Veco: search by TID, NI or name; admins can pull from Veco now. */
export function TenanciesPage() {
  const { data: user } = useCurrentUser();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [debounced] = useDebouncedValue(q, 250);
  const [selected, setSelected] = useState<string | null>(null);
  const search = useTenancySearch(debounced, status);

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Tenancies</Title>
        {hasRole(user?.role) && <SyncPanel />}
      </Group>
      <Group align="end">
        <TextInput
          label="Search"
          placeholder="TID, full NI number, name, room or postcode"
          leftSection={<IconSearch size={16} />}
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          w={360}
        />
        <SegmentedControl
          aria-label="Status"
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
          data={[
            { value: 'active', label: 'Active' },
            { value: 'ended', label: 'Ended' },
            { value: 'all', label: 'All' },
          ]}
        />
      </Group>
      {search.isError && <Alert color="red">{search.error.message}</Alert>}
      <Table striped highlightOnHover aria-label="Tenancies">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>TID</Table.Th>
            <Table.Th>Tenant</Table.Th>
            <Table.Th>NI</Table.Th>
            <Table.Th>Room</Table.Th>
            <Table.Th>Branch</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Rent</Table.Th>
            <Table.Th>Status</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {search.data?.map((t) => (
            <Table.Tr key={t.tid} onClick={() => setSelected(t.tid)} style={{ cursor: 'pointer' }}>
              <Table.Td>{t.tid}</Table.Td>
              <Table.Td>{t.tenantName ?? '—'}</Table.Td>
              <Table.Td>{t.niMasked ?? '—'}</Table.Td>
              <Table.Td>{t.unitRef ?? t.propertyRef}</Table.Td>
              <Table.Td>{t.branchCode}</Table.Td>
              <Table.Td>{t.managementType}</Table.Td>
              <Table.Td>{rentText(t.rent)}</Table.Td>
              <Table.Td>
                <Badge variant="light" color={t.status === 'active' ? 'green' : 'gray'}>
                  {t.status}
                </Badge>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {search.data?.length === 0 && <Text c="dimmed">No tenancies match.</Text>}
      {search.data?.length === 50 && <Text c="dimmed">Showing the first 50 — narrow the search.</Text>}
      <TenancyDrawer tid={selected} onClose={() => setSelected(null)} />
    </Stack>
  );
}

function TenancyDrawer({ tid, onClose }: { tid: string | null; onClose: () => void }) {
  const { data: t, isError, error } = useTenancy(tid);
  return (
    <Drawer opened={tid !== null} onClose={onClose} position="right" title={tid ? `Tenancy ${tid}` : ''}>
      {isError && <Alert color="red">{error.message}</Alert>}
      {t && (
        <Stack gap="xs">
          <Text>
            <b>Tenant:</b> {t.tenantName ?? '—'}
          </Text>
          <Text>
            <b>NI:</b> <span data-testid="tenancy-ni">{t.ni ?? t.niMasked ?? '—'}</span>
          </Text>
          <Text>
            <b>Room:</b> {t.unitRef ?? '—'} ({t.propertyRef}), {t.address}, {t.postcode}
          </Text>
          <Text>
            <b>Branch:</b> {t.branchCode} · <b>Type:</b> {t.managementType}
          </Text>
          <Text>
            <b>Rent:</b> {rentText(t.rent)}
          </Text>
          <Text>
            <b>Dates:</b> from {t.startDate}
            {t.endDate ? ` to ${t.endDate}` : ''} ({t.status})
          </Text>
          <Text size="xs" c="dimmed">
            Source: Veco (read-only). Change tenancy details in Veco; they arrive with the next sync.
          </Text>
        </Stack>
      )}
    </Drawer>
  );
}

function SyncPanel() {
  const sync = useVecoSync();
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const run = (dryRun: boolean) => sync.mutate({ dryRun }, { onSuccess: setSummary });
  return (
    <Stack gap="xs" align="end">
      <Group gap="xs">
        <Button variant="default" size="xs" onClick={() => run(true)} loading={sync.isPending}>
          Preview sync
        </Button>
        <Button size="xs" leftSection={<IconRefresh size={16} />} onClick={() => run(false)} loading={sync.isPending}>
          Sync from Veco now
        </Button>
      </Group>
      {sync.isError && (
        <Alert color="red" maw={420}>
          {sync.error.message}
        </Alert>
      )}
      {summary && !sync.isPending && <SyncResult s={summary} />}
    </Stack>
  );
}

function SyncResult({ s }: { s: SyncSummary }) {
  return (
    <Alert color={s.dryRun ? 'blue' : 'green'} title={s.dryRun ? 'Preview (nothing saved)' : 'Sync complete'} maw={420}>
      <List size="sm" spacing={2}>
        <List.Item>
          {s.fetched} from Veco: {s.tenancies.inserted} new, {s.tenancies.updated} updated, {s.tenancies.reactivated}{' '}
          reactivated, {s.tenancies.ended} ended
        </List.Item>
        <List.Item>{s.rentChanges} rent changes</List.Item>
        <List.Item>
          Type: {s.managementType.IRG} IRG, {s.managementType.RG} RG ({s.managementType.defaultedToRG} assumed RG — no owner
          record)
        </List.Item>
        <List.Item>
          NI: {s.ni.missing} missing, {s.ni.invalid} invalid, {s.ni.conflicts} shared with another tenant
        </List.Item>
        {s.rejected.length > 0 && (
          <List.Item>
            {s.rejected.length} rows rejected: {s.rejected.slice(0, 5).map((r) => `${r.tid ?? '?'} (${r.reason})`).join('; ')}
          </List.Item>
        )}
      </List>
    </Alert>
  );
}
