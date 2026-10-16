import { Alert, Button, Card, Group, Modal, Stack, Table, Text, Title } from '@mantine/core';
import { IconDownload, IconEye, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../../components';
import { errorMessage } from '../../lib/api';
import { CrossCheckView } from './CrossCheckView';
import {
  useDeleteVecoPush,
  useDownloadVecoReadback,
  useVecoPushes,
  useVerifyVecoPush,
  type VecoPushBatch,
} from './vecoPushApi';

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const money = (amount: string) => GBP.format(Number(amount));

function checkLabel(b: VecoPushBatch): string {
  if (b.status === 'deleted') return 'Deleted';
  if (b.status === 'failed') return 'Failed';
  if (b.status === 'pushing') return 'Not confirmed';
  if (b.verifyOk === true) return '✅ matches VECO';
  if (b.verifyOk === false) return '❌ differs';
  return '—';
}

/** Earlier pushes to the VECO test database: view (re-runs the cross-check), download the read-back, delete. */
export function EarlierVecoPushes() {
  const pushes = useVecoPushes();
  const verify = useVerifyVecoPush();
  const download = useDownloadVecoReadback();
  const remove = useDeleteVecoPush();
  const [viewing, setViewing] = useState<VecoPushBatch | null>(null);
  const [deleting, setDeleting] = useState<VecoPushBatch | null>(null);

  const view = (b: VecoPushBatch) => {
    setViewing(b);
    verify.mutate(b.id);
  };
  const confirmDelete = () => {
    if (deleting) remove.mutate(deleting.id, { onSettled: () => setDeleting(null) });
  };
  const live = (b: VecoPushBatch) => b.status === 'pushed' || b.status === 'verified';

  return (
    <Card>
      <Stack gap="sm">
        <Title order={2} fz="md">
          Earlier VECO pushes
        </Title>
        <Text size="xs" c="dimmed">
          Pushes to the VECO test database. View re-reads the rows from VECO and checks them again.
        </Text>
        {download.isError && (
          <Alert color="red" role="alert">
            {errorMessage(download.error)}
          </Alert>
        )}
        {remove.isError && (
          <Alert color="red" role="alert">
            {errorMessage(remove.error)}
          </Alert>
        )}
        {remove.isSuccess && (
          <Alert color="green" role="status">
            Deleted from VECO: {remove.data.remaining.transactions + remove.data.remaining.allocations} rows /{' '}
            {money(remove.data.remaining.total)} remain. The receipts are waiting again.
          </Alert>
        )}
        <Table striped aria-label="Earlier VECO pushes">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Pushed</Table.Th>
              <Table.Th>Batch ref</Table.Th>
              <Table.Th>Pushed by</Table.Th>
              <Table.Th ta="right">Receipts</Table.Th>
              <Table.Th ta="right">Total</Table.Th>
              <Table.Th>Check</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {pushes.data?.map((b) => (
              <Table.Tr key={b.id}>
                <Table.Td>{new Date(b.createdAt).toLocaleString('en-GB')}</Table.Td>
                <Table.Td>{b.batchReference}</Table.Td>
                <Table.Td>{b.pushedBy}</Table.Td>
                <Table.Td ta="right">{b.receipts}</Table.Td>
                <Table.Td ta="right">{money(b.total)}</Table.Td>
                <Table.Td>{checkLabel(b)}</Table.Td>
                <Table.Td>
                  <Group gap="xs" wrap="nowrap">
                    {(live(b) || b.status === 'pushing') && (
                      <Button
                        size="xs"
                        variant="subtle"
                        leftSection={<IconEye size={14} />}
                        aria-label={`View ${b.batchReference}`}
                        onClick={() => view(b)}
                      >
                        View
                      </Button>
                    )}
                    {live(b) && (
                      <>
                        <Button
                          size="xs"
                          variant="subtle"
                          leftSection={<IconDownload size={14} />}
                          aria-label={`Download ${b.batchReference}`}
                          loading={download.isPending && download.variables === b.id}
                          onClick={() => download.mutate(b.id)}
                        >
                          Download
                        </Button>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          aria-label={`Delete ${b.batchReference}`}
                          onClick={() => setDeleting(b)}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {pushes.isPending && <LoadingState variant="skeleton" rows={2} label="Loading earlier VECO pushes…" />}
        {pushes.isError && <ErrorState error={pushes.error} title="Could not load earlier VECO pushes" onRetry={() => void pushes.refetch()} />}
        {pushes.isSuccess && pushes.data.length === 0 && (
          <EmptyState size="sm" title="No VECO pushes yet" description="Pushes to the VECO test database are listed here." />
        )}
      </Stack>

      <Modal opened={viewing !== null} onClose={() => setViewing(null)} title={`VECO push ${viewing?.batchReference ?? ''}`} size="xl">
        <Stack>
          {verify.isPending && <Text>Reading the rows back from VECO…</Text>}
          {verify.isError && (
            <Alert color="red" role="alert">
              {errorMessage(verify.error)}
            </Alert>
          )}
          {verify.data?.verify && <CrossCheckView verify={verify.data.verify} />}
          {verify.data && !verify.data.verify && (
            <Alert color="yellow">{verify.data.batch.error ?? 'Nothing to check for this push.'}</Alert>
          )}
        </Stack>
      </Modal>

      <Modal opened={deleting !== null} onClose={() => setDeleting(null)} title="Delete from VECO">
        <Stack>
          <Text>
            Delete the {deleting?.receipts} receipts of push {deleting?.batchReference} from the VECO test database? Only
            the rows this push created are removed, and the receipts become available to send again.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button color="red" onClick={confirmDelete} loading={remove.isPending}>
              Delete from VECO
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}
