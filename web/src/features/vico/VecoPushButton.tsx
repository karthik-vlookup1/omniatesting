import { Alert, Button, Group, Modal, Select, Stack, Table, Text } from '@mantine/core';
import { IconCloudUpload } from '@tabler/icons-react';
import { useState } from 'react';
import { errorMessage } from '../../lib/api';
import { CrossCheckView } from './CrossCheckView';
import {
  usePreviewVecoPush,
  usePushToVeco,
  useVecoPushStatus,
  type Department,
  type PushRequest,
} from './vecoPushApi';

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const money = (amount: string) => GBP.format(Number(amount));
const ukDate = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '—');

/** The most receipts one push takes; the server refuses more. */
const MAX_RECEIPTS = 500;

/** "Push to VECO (test database)": preview, confirm, push and cross-check, all in one modal. */
export function VecoPushButton({ receiptIds }: { receiptIds: string[] }) {
  const status = useVecoPushStatus();
  const preview = usePreviewVecoPush();
  const push = usePushToVeco();
  const [opened, setOpened] = useState(false);
  const [key, setKey] = useState('');
  const [departments, setDepartments] = useState<Record<string, Department>>({});

  const ids = receiptIds.slice(0, MAX_RECEIPTS);
  const body = (d: Record<string, Department>): PushRequest => ({ receiptIds: ids, departments: d });

  let reason: string | null = null;
  if (status.isError) reason = 'VECO push unavailable';
  else if (status.data && !status.data.configured) reason = 'VECO push is not configured';
  else if (status.data && !status.data.me.linked) reason = 'No VECO user linked';
  else if (status.data && !status.data.me.canPush) reason = 'No VECO push permission';
  else if (status.data && receiptIds.length === 0) reason = 'Nothing waiting';
  const disabled = !status.data || reason !== null;

  const open = () => {
    setDepartments({});
    setKey(crypto.randomUUID());
    push.reset();
    preview.mutate(body({}));
    setOpened(true);
  };
  const pick = (receiptId: string, value: string | null) => {
    if (value !== 'Owner' && value !== 'Tenancy') return;
    const next: Record<string, Department> = { ...departments, [receiptId]: value };
    setDepartments(next);
    preview.mutate(body(next));
  };
  const confirm = () => push.mutate({ ...body(departments), idempotencyKey: key });

  const data = preview.data;
  const readyCount = data?.ready.length ?? 0;
  const done = push.data;

  return (
    <Stack gap={4}>
      <Button
        variant="light"
        leftSection={<IconCloudUpload size={16} />}
        disabled={disabled}
        onClick={open}
      >
        Push to VECO (test database)
      </Button>
      {reason && (
        <Text size="xs" c="dimmed" data-testid="veco-push-reason">
          {reason}
        </Text>
      )}

      <Modal opened={opened} onClose={() => setOpened(false)} title="Push to VECO (test database)" size="xl">
        <Stack>
          {receiptIds.length > MAX_RECEIPTS && (
            <Alert color="yellow">
              {receiptIds.length} waiting: first {MAX_RECEIPTS} by date. Push again for the rest.
            </Alert>
          )}
          {preview.isPending && <Text>Checking VECO (read-only)…</Text>}
          {preview.isError && (
            <Alert color="red" role="alert">
              {errorMessage(preview.error)}
            </Alert>
          )}

          {data && !done && (
            <>
              <Table aria-label="Totals by bank">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Source bank</Table.Th>
                    <Table.Th ta="right">Receipts</Table.Th>
                    <Table.Th ta="right">Total</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.byBank.map((b) => (
                    <Table.Tr key={b.bank}>
                      <Table.Td>{b.bank === 'MANUAL' ? 'Manual / no bank line' : b.bank}</Table.Td>
                      <Table.Td ta="right">{b.count}</Table.Td>
                      <Table.Td ta="right">{money(b.total)}</Table.Td>
                    </Table.Tr>
                  ))}
                  <Table.Tr fw={600}>
                    <Table.Td>All banks</Table.Td>
                    <Table.Td ta="right">{data.ready.length + data.held.length}</Table.Td>
                    <Table.Td ta="right">{money(data.total)}</Table.Td>
                  </Table.Tr>
                </Table.Tbody>
              </Table>

              <Text fw={500}>
                Ready to push: {readyCount} · {money(data.readyTotal)}
              </Text>
              <Table striped aria-label="Ready to push">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>TID</Table.Th>
                    <Table.Th>Tenant</Table.Th>
                    <Table.Th>Bank</Table.Th>
                    <Table.Th>Department</Table.Th>
                    <Table.Th ta="right">Amount</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.ready.map((r) => (
                    <Table.Tr key={r.receiptId}>
                      <Table.Td>{ukDate(r.paymentDate)}</Table.Td>
                      <Table.Td>{r.tid}</Table.Td>
                      <Table.Td>{r.tenantName ?? '—'}</Table.Td>
                      <Table.Td>{r.sourceBank}</Table.Td>
                      <Table.Td>{r.department}</Table.Td>
                      <Table.Td ta="right">{money(r.amount)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>

              {data.held.length > 0 && (
                <>
                  <Text fw={500}>Held back: {data.held.length}</Text>
                  <Table striped aria-label="Held back">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>TID</Table.Th>
                        <Table.Th ta="right">Amount</Table.Th>
                        <Table.Th>Reason</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {data.held.map((h) => (
                        <Table.Tr key={h.receiptId}>
                          <Table.Td>{h.tid || '—'}</Table.Td>
                          <Table.Td ta="right">{money(h.amount)}</Table.Td>
                          <Table.Td>
                            {h.message}
                            {h.needsDepartment && (
                              <Select
                                mt={4}
                                size="xs"
                                aria-label={`Department for ${h.tid}`}
                                placeholder="Department"
                                data={['Owner', 'Tenancy']}
                                value={departments[h.receiptId] ?? null}
                                onChange={(v) => pick(h.receiptId, v)}
                              />
                            )}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </>
              )}
            </>
          )}

          {push.isError && (
            <Alert color="red" role="alert">
              {errorMessage(push.error)}
            </Alert>
          )}
          {done && done.batch.status === 'failed' && (
            <Alert color="red" role="alert" title="Push failed">
              {done.batch.error ?? 'VECO did not take the receipts.'} The receipts are still waiting.
            </Alert>
          )}
          {done?.verify && <CrossCheckView verify={done.verify} />}

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              {done ? 'Close' : 'Cancel'}
            </Button>
            {!done && (
              <Button onClick={confirm} loading={push.isPending} disabled={readyCount === 0 || preview.isPending}>
                Push {readyCount} {readyCount === 1 ? 'receipt' : 'receipts'}
              </Button>
            )}
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
