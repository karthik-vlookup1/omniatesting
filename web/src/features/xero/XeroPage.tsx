import {
  Accordion,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  SegmentedControl,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconRefresh, IconSend } from '@tabler/icons-react';
import { useState } from 'react';
import { can, useCurrentUser } from '../../data/auth';
import { errorMessage } from '../../lib/api';
import { useBankAccounts } from '../../data/imports';
import {
  useRefreshPropertyMap,
  useRetryBatch,
  useRunXero,
  useSaveXeroSettings,
  useStageInvoices,
  useXeroOutbox,
  useXeroPending,
  useXeroSettings,
  useXeroStatus,
  type InvoiceDraft,
  type OutboxStatus,
  type XeroSettings,
  type XeroStatus,
} from './api';

const GBP = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
});
const money = (amount: string) => GBP.format(Number(amount));
const ukDate = (iso: string) => iso.split('-').reverse().join('/');

const STATUS_COLOR: Record<OutboxStatus, string> = {
  pending: 'blue',
  in_flight: 'cyan',
  done: 'green',
  failed: 'orange',
  dead: 'red',
};

/** Posts confirmed receipts to Xero: one invoice per bank per bank date, through the Xero bridge. */
export function XeroPage() {
  const user = useCurrentUser();
  if (!can(user, 'finance')) {
    return (
      <Stack>
        <Title order={2}>Xero</Title>
        <Alert color="yellow">Only admin and accounts users can post to Xero.</Alert>
      </Stack>
    );
  }
  return <XeroView isAdmin={can(user, 'settings')} />;
}

function XeroView({ isAdmin }: { isAdmin: boolean }) {
  const status = useXeroStatus();
  return (
    <Stack>
      <Title order={2}>Xero</Title>
      {status.data && <StatusCard status={status.data} />}
      <PendingInvoices />
      <Outbox status={status.data} />
      {isAdmin && <SettingsCard />}
    </Stack>
  );
}

function StatusCard({ status }: { status: XeroStatus }) {
  const live = status.targetEnv === 'live';
  return (
    <Paper withBorder p="sm">
      <Group gap="sm">
        <Badge color={live ? 'red' : 'yellow'} size="lg" data-testid="xero-target">
          {live ? 'LIVE' : 'DEMO'}
        </Badge>
        {!status.configured && (
          <Text size="sm">Xero bridge not configured: set XERO_BRIDGE_URL and the key on the server.</Text>
        )}
        {status.bridge && (
          <Text size="sm" c={status.bridge.reachable ? undefined : 'red'}>
            {status.bridge.reachable
              ? 'Bridge reachable'
              : `Bridge not reachable${status.bridge.error ? `: ${status.bridge.error}` : ''}`}
            {status.bridge.tenantId ? ` · organisation ${status.bridge.tenantId}` : ''}
          </Text>
        )}
      </Group>
      {live && (
        <Text size="xs" c="red" mt={4}>
          This server posts to a live Xero organisation. Every send asks you to confirm.
        </Text>
      )}
    </Paper>
  );
}

function PendingInvoices() {
  const pending = useXeroPending();
  const stage = useStageInvoices();
  const invoices = pending.data?.invoices ?? [];

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Title order={4}>Ready to invoice</Title>
        <Button disabled={invoices.length === 0} loading={stage.isPending} onClick={() => stage.mutate()}>
          Prepare {invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'}
        </Button>
      </Group>
      <Text size="sm" c="dimmed" data-testid="xero-pending-summary">
        {pending.data?.receipts ?? 0} confirmed receipts not yet in Xero · {money(pending.data?.total ?? '0')}
      </Text>
      {stage.isError && (
        <Alert color="red" role="alert">
          {errorMessage(stage.error)}
        </Alert>
      )}
      {stage.isSuccess && (
        <Alert color="green" role="status">
          {stage.data.length} {stage.data.length === 1 ? 'invoice' : 'invoices'} prepared. Send them below.
        </Alert>
      )}
      {invoices.length > 0 && (
        <Accordion variant="contained">
          {invoices.map((inv) => (
            <Accordion.Item key={inv.invoiceNumber} value={inv.invoiceNumber}>
              <Accordion.Control>
                <Group justify="space-between" pr="md">
                  <Text size="sm" fw={500}>
                    {inv.invoiceNumber}
                  </Text>
                  <Text size="sm">
                    {inv.lines.length} lines · {money(inv.total)}
                  </Text>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <InvoiceLines invoice={inv} />
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      )}
    </Stack>
  );
}

function InvoiceLines({ invoice }: { invoice: InvoiceDraft }) {
  return (
    <Table striped aria-label={`Lines of ${invoice.invoiceNumber}`}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Item (TID)</Table.Th>
          <Table.Th>Description</Table.Th>
          <Table.Th ta="right">Amount</Table.Th>
          <Table.Th>Account</Table.Th>
          <Table.Th>Properties</Table.Th>
          <Table.Th>Branch</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {invoice.lines.map((l) => (
          <Table.Tr key={l.receiptId}>
            <Table.Td>{l.tid}</Table.Td>
            <Table.Td>{l.tenantName ?? '—'}</Table.Td>
            <Table.Td ta="right">{money(l.amount)}</Table.Td>
            <Table.Td>{l.accountCode}</Table.Td>
            <Table.Td>{l.property ?? '—'}</Table.Td>
            <Table.Td>{l.branch ?? '—'}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function Outbox({ status }: { status: XeroStatus | undefined }) {
  const [tab, setTab] = useState<'open' | 'done' | 'dead'>('open');
  const outbox = useXeroOutbox(tab);
  const runXero = useRunXero();
  const retry = useRetryBatch();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const live = status?.targetEnv === 'live';
  const summary = outbox.data?.summary;
  const waiting = (summary?.pending ?? 0) + (summary?.failed ?? 0) + (summary?.in_flight ?? 0);
  /** Batches that would actually be sent now (not backing off, not mid-send). */
  const ready = outbox.data?.ready ?? 0;
  const closeModal = () => {
    setConfirming(false);
    setTyped('');
  };

  const send = (confirmLive: boolean) =>
    runXero.mutate(
      { confirmLive },
      {
        onSettled: () => {
          setConfirming(false);
          setTyped('');
        },
      },
    );

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Title order={4}>Invoices for Xero</Title>
        <Button
          leftSection={<IconSend size={16} />}
          disabled={!status?.configured || ready === 0}
          loading={runXero.isPending}
          onClick={() => (live ? setConfirming(true) : send(false))}
        >
          Send to Xero
        </Button>
      </Group>
      {runXero.isSuccess && (
        <Alert color={runXero.data.failed + runXero.data.dead > 0 ? 'orange' : 'green'} role="status">
          Sent {runXero.data.sent} of {runXero.data.attempted} to Xero ({runXero.data.targetEnv.toUpperCase()})
          {runXero.data.failed > 0 ? `; ${runXero.data.failed} failed and will be retried` : ''}
          {runXero.data.dead > 0 ? `; ${runXero.data.dead} gave up after 5 tries` : ''}.
        </Alert>
      )}
      {(runXero.error ?? retry.error) && (
        <Alert color="red" role="alert">
          {errorMessage(runXero.error ?? retry.error)}
        </Alert>
      )}
      <SegmentedControl
        aria-label="Batch status"
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
        data={[
          { value: 'open', label: `Waiting (${waiting})` },
          { value: 'done', label: `Sent (${summary?.done ?? 0})` },
          { value: 'dead', label: `Gave up (${summary?.dead ?? 0})` },
        ]}
      />
      <Table striped aria-label="Xero invoices">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Invoice</Table.Th>
            <Table.Th>Date</Table.Th>
            <Table.Th ta="right">Lines</Table.Th>
            <Table.Th ta="right">Total</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Xero</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {outbox.data?.items.map((i) => (
            <Table.Tr key={i.id}>
              <Table.Td>{i.invoiceNumber}</Table.Td>
              <Table.Td>{ukDate(i.date)}</Table.Td>
              <Table.Td ta="right">{i.lines.length}</Table.Td>
              <Table.Td ta="right">{money(i.total)}</Table.Td>
              <Table.Td>
                <Badge color={STATUS_COLOR[i.status]} variant="light">
                  {i.status.replace('_', ' ')}
                </Badge>
                {i.attempts > 0 && i.status !== 'done' && (
                  <Text size="xs" c="dimmed">
                    {i.attempts} of 5 tries
                    {i.lastError ? ` · ${i.lastError}` : ''}
                  </Text>
                )}
              </Table.Td>
              <Table.Td>{i.xeroInvoiceNumber ?? i.xeroInvoiceId ?? '—'}</Table.Td>
              <Table.Td>
                {(i.status === 'failed' || i.status === 'dead') && (
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconRefresh size={14} />}
                    aria-label={`Retry ${i.invoiceNumber}`}
                    loading={retry.isPending && retry.variables === i.id}
                    onClick={() => retry.mutate(i.id)}
                  >
                    Retry
                  </Button>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {outbox.isSuccess && outbox.data.items.length === 0 && <Text c="dimmed">Nothing here.</Text>}

      <Modal opened={confirming} onClose={closeModal} title="Send to LIVE Xero">
        <Stack>
          <Text>
            This posts {ready} {ready === 1 ? 'invoice' : 'invoices'} to the live Xero organisation. Type LIVE to
            confirm.
          </Text>
          <TextInput label="Type LIVE" value={typed} onChange={(e) => setTyped(e.currentTarget.value)} />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeModal}>
              Cancel
            </Button>
            <Button color="red" disabled={typed !== 'LIVE'} loading={runXero.isPending} onClick={() => send(true)}>
              Send to live Xero
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function SettingsCard() {
  const settings = useXeroSettings();
  const banks = useBankAccounts();
  return settings.data && banks.data ? (
    <SettingsForm initial={settings.data} bankCodes={banks.data.map((b) => b.code)} />
  ) : null;
}

function SettingsForm({ initial, bankCodes }: { initial: XeroSettings; bankCodes: string[] }) {
  const save = useSaveXeroSettings();
  const refresh = useRefreshPropertyMap();
  const [contacts, setContacts] = useState<Record<string, string>>(initial.contacts);
  const [extended, setExtended] = useState(initial.extendedFields);

  return (
    <Paper withBorder p="sm">
      <Title order={5} mb="xs">
        Xero settings
      </Title>
      <Text size="sm" c="dimmed" mb="xs">
        The Xero contact each bank's invoices go to (e.g. "Apollo HSBC"). Blank uses the bank account name.
      </Text>
      <Group align="end" wrap="wrap">
        {bankCodes.map((code) => (
          <TextInput
            key={code}
            label={`${code} contact`}
            value={contacts[code] ?? ''}
            onChange={(e) => setContacts({ ...contacts, [code]: e.currentTarget.value })}
            w={200}
          />
        ))}
      </Group>
      <Switch
        mt="sm"
        label="Send invoice number, reference, TID item codes and tracking (only once the bridge accepts them)"
        checked={extended}
        onChange={(e) => setExtended(e.currentTarget.checked)}
      />
      <Group mt="sm">
        <Button
          variant="light"
          loading={save.isPending}
          onClick={() =>
            save.mutate({
              contacts: Object.fromEntries(Object.entries(contacts).filter(([, v]) => v.trim() !== '')),
              extendedFields: extended,
            })
          }
        >
          Save Xero settings
        </Button>
        <Button
          variant="default"
          leftSection={<IconRefresh size={16} />}
          loading={refresh.isPending}
          onClick={() => refresh.mutate()}
        >
          Reload Xero property list from Veco
        </Button>
      </Group>
      {save.isSuccess && (
        <Text size="sm" c="green" mt="xs" role="status">
          Saved.
        </Text>
      )}
      {refresh.isSuccess && (
        <Text size="sm" mt="xs" role="status">
          {refresh.data.matched} buildings linked to a Xero property ({refresh.data.unmatchedProperties} without one,{' '}
          {refresh.data.ambiguous} with more than one option in Xero).
        </Text>
      )}
      {(save.error ?? refresh.error) && (
        <Alert color="red" role="alert" mt="xs">
          {errorMessage(save.error ?? refresh.error)}
        </Alert>
      )}
    </Paper>
  );
}
