import { Alert, Button, Card, Group, Modal, Paper, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconDownload, IconFileExport } from '@tabler/icons-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../../components';
import { can, useCurrentUser } from '../../data/auth';
import { errorMessage } from '../../lib/api';
import {
  useCreateVicoExport,
  useDownloadVicoExport,
  useSaveVicoSettings,
  useVicoExports,
  useVicoPending,
  useVicoSettings,
  type VicoSettings,
} from './api';

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const money = (amount: string) => GBP.format(Number(amount));
const ukDate = (iso: string) => iso.split('-').reverse().join('/');

/** Confirmed receipts waiting for Vico, the one-click export file, and earlier exports. */
export function VicoPage() {
  const user = useCurrentUser();
  if (!can(user, 'finance')) {
    return (
      <Stack gap="lg">
        <PageHeader title="Vico export" />
        <Alert color="yellow">Only admin and accounts users can export to Vico.</Alert>
      </Stack>
    );
  }
  return <VicoExportView isAdmin={can(user, 'settings')} />;
}

function VicoExportView({ isAdmin }: { isAdmin: boolean }) {
  const settings = useVicoSettings();
  const pending = useVicoPending();
  const exports = useVicoExports();
  const create = useCreateVicoExport();
  const redownload = useDownloadVicoExport();
  const [confirming, setConfirming] = useState(false);
  const configured = Boolean(settings.data?.sortCode && settings.data.accountNumber);
  const total = pending.data?.total ?? 0;

  const runExport = () =>
    create.mutate(pending.data?.rows.map((r) => r.receiptId) ?? [], {
      onSettled: () => setConfirming(false),
    });

  return (
    <Stack gap="lg">
      <PageHeader
        title="Vico export"
        description="Confirmed receipts go to Vico as one file. Each receipt is exported once; earlier files can be downloaded again."
      />

      {settings.isError && <ErrorState error={settings.error} title="Vico settings unavailable" onRetry={() => void settings.refetch()} />}
      {settings.data && <BankDetails settings={settings.data} canEdit={isAdmin} />}

      {create.isSuccess && (
        <Alert color="green" role="status" title="File downloaded">
          {create.data.fileName}: {create.data.rows} receipts, {money(create.data.totalAmount)}. Upload it to Vico.
        </Alert>
      )}
      {create.isError && (
        <Alert color="red" role="alert">
          {errorMessage(create.error)}
        </Alert>
      )}

      <Card>
        <Stack gap="sm">
          <Title order={2} fz="md">
            Waiting for Vico
          </Title>
          <Group justify="space-between">
            <Text data-testid="vico-pending-summary">
              {total} {total === 1 ? 'receipt' : 'receipts'} waiting for Vico · {money(pending.data?.totalAmount ?? '0')}
            </Text>
            <Button
              leftSection={<IconFileExport size={16} />}
              disabled={total === 0 || !configured}
              onClick={() => setConfirming(true)}
            >
              Download Vico file
            </Button>
          </Group>

          <Table striped aria-label="Receipts waiting for Vico">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Received</Table.Th>
                <Table.Th>TID</Table.Th>
                <Table.Th>Tenant</Table.Th>
                <Table.Th>Bank</Table.Th>
                <Table.Th>MG/RG</Table.Th>
                <Table.Th ta="right">Amount</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pending.data?.rows.map((r) => (
                <Table.Tr key={r.receiptId}>
                  <Table.Td>{ukDate(r.receivedOn)}</Table.Td>
                  <Table.Td>{r.tid}</Table.Td>
                  <Table.Td>{r.tenantName ?? '—'}</Table.Td>
                  <Table.Td>{r.bankCode ?? '—'}</Table.Td>
                  <Table.Td>{r.managementType}</Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {money(r.amount)}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {pending.isPending && <LoadingState variant="skeleton" rows={3} label="Loading receipts waiting for Vico…" />}
          {pending.isError && <ErrorState error={pending.error} title="Could not load waiting receipts" onRetry={() => void pending.refetch()} />}
          {pending.isSuccess && total === 0 && (
            <EmptyState size="sm" title="Nothing waiting" description="Every confirmed receipt is already in Vico." />
          )}
        </Stack>
      </Card>

      <Card>
        <Stack gap="sm">
          <Title order={2} fz="md">
            Earlier exports
          </Title>
          <Text size="xs" c="dimmed">
            Downloading again rebuilds the file with today's bank details above.
          </Text>
          {redownload.isError && (
            <Alert color="red" role="alert">
              {errorMessage(redownload.error)}
            </Alert>
          )}
          <Table striped aria-label="Earlier Vico exports">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Exported</Table.Th>
                <Table.Th>File</Table.Th>
                <Table.Th ta="right">Receipts</Table.Th>
                <Table.Th ta="right">Total</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {exports.data?.map((e) => (
                <Table.Tr key={e.exportId}>
                  <Table.Td>{new Date(e.createdAt).toLocaleString('en-GB')}</Table.Td>
                  <Table.Td>{e.fileName}</Table.Td>
                  <Table.Td ta="right">{e.rows}</Table.Td>
                  <Table.Td ta="right">{money(e.totalAmount)}</Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      variant="subtle"
                      leftSection={<IconDownload size={14} />}
                      aria-label={`Download ${e.fileName} again`}
                      loading={redownload.isPending && redownload.variables === e.exportId}
                      onClick={() => redownload.mutate(e.exportId)}
                    >
                      Download
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {exports.isPending && <LoadingState variant="skeleton" rows={2} label="Loading earlier exports…" />}
          {exports.isError && <ErrorState error={exports.error} title="Could not load earlier exports" onRetry={() => void exports.refetch()} />}
          {exports.isSuccess && exports.data.length === 0 && <EmptyState size="sm" title="No exports yet" description="Files you download from Vico export are listed here." />}
        </Stack>
      </Card>

      <Modal opened={confirming} onClose={() => setConfirming(false)} title="Export to Vico">
        <Stack>
          <Text>
            Export {total} {total === 1 ? 'receipt' : 'receipts'} totalling {money(pending.data?.totalAmount ?? '0')}?
            Each receipt can only be exported once.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button onClick={runExport} loading={create.isPending}>
              Export and download
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

/** The sort code and account number written on every Vico row; admin sets them once. */
function BankDetails({ settings, canEdit }: { settings: VicoSettings; canEdit: boolean }) {
  const save = useSaveVicoSettings();
  const [sortCode, setSortCode] = useState(settings.sortCode ?? '');
  const [accountNumber, setAccountNumber] = useState(settings.accountNumber ?? '');
  const configured = Boolean(settings.sortCode && settings.accountNumber);

  if (!canEdit) {
    return configured ? (
      <Text size="sm" c="dimmed">
        Vico rows use sort code {settings.sortCode}, account {settings.accountNumber}.
      </Text>
    ) : (
      <Alert color="yellow">An admin must set the Vico sort code and account number before exporting.</Alert>
    );
  }

  return (
    <Paper withBorder p="sm">
      <Text size="sm" fw={500} mb="xs">
        Bank details on every Vico row
      </Text>
      <Group align="end">
        <TextInput
          label="Sort code"
          placeholder="12-34-56"
          value={sortCode}
          onChange={(e) => setSortCode(e.currentTarget.value)}
          w={140}
        />
        <TextInput
          label="Account number"
          placeholder="12345678"
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.currentTarget.value)}
          w={160}
        />
        <Button variant="light" loading={save.isPending} onClick={() => save.mutate({ sortCode, accountNumber })}>
          Save bank details
        </Button>
      </Group>
      {save.isError && (
        <Alert color="red" role="alert" mt="xs">
          {errorMessage(save.error)}
        </Alert>
      )}
      {save.isSuccess && (
        <Text size="sm" c="green" mt="xs" role="status">
          Saved.
        </Text>
      )}
    </Paper>
  );
}
