import { Alert, Button, Card, Group, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { can, useCurrentUser } from '../../data/auth';
import { errorMessage } from '../../lib/api';
import { downloadTenantStatement, gbp, useTenantStatement } from './api';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Tenant rent statement for one tenancy and a date range, as a preview, CSV or PDF. */
export function StatementCard() {
  const user = useCurrentUser();
  return (
    <Card withBorder padding="lg">
      <Stack gap="sm">
        <Title order={2} fz="md">
          Tenant rent statement
        </Title>
        {can(user, 'write') ? <StatementForm /> : <Text>Statements can be downloaded by staff, accounts and admin users.</Text>}
      </Stack>
    </Card>
  );
}

function StatementForm() {
  const now = new Date();
  const [tid, setTid] = useState('');
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)));
  const [to, setTo] = useState(iso(now));
  const [shown, setShown] = useState<{ tid: string; from: string; to: string } | null>(null);
  const preview = useTenantStatement(shown?.tid ?? '', shown?.from ?? '', shown?.to ?? '', shown !== null);
  const download = useMutation({
    mutationFn: (format: 'csv' | 'pdf') => downloadTenantStatement(tid.trim(), from, to, format),
  });
  const ready = tid.trim() !== '' && from !== '' && to !== '';

  return (
    <Stack gap="sm">
      <Group align="flex-end">
        <TextInput label="TID" value={tid} onChange={(e) => setTid(e.currentTarget.value)} />
        <TextInput label="From" type="date" value={from} onChange={(e) => setFrom(e.currentTarget.value)} />
        <TextInput label="To" type="date" value={to} onChange={(e) => setTo(e.currentTarget.value)} />
        <Button variant="default" disabled={!ready} onClick={() => setShown({ tid: tid.trim(), from, to })}>
          Show
        </Button>
        <Button leftSection={<IconDownload size={16} />} disabled={!ready} loading={download.isPending && download.variables === 'csv'} onClick={() => download.mutate('csv')}>
          Download CSV
        </Button>
        <Button leftSection={<IconDownload size={16} />} disabled={!ready} loading={download.isPending && download.variables === 'pdf'} onClick={() => download.mutate('pdf')}>
          Download PDF
        </Button>
      </Group>
      {preview.isError && (
        <Alert color="red" role="alert">
          {errorMessage(preview.error)}
        </Alert>
      )}
      {download.isError && (
        <Alert color="red" role="alert">
          {errorMessage(download.error)}
        </Alert>
      )}
      {download.isSuccess && (
        <Alert color="green" role="status">
          {download.data.fileName}: {download.data.rows} rows downloaded.
        </Alert>
      )}
      {preview.data && (
        <Stack gap={4}>
          <Text size="sm" c="dimmed">
            {preview.data.tenancy.tid} · {preview.data.tenancy.tenant ?? ''} · {preview.data.from} to {preview.data.to}
          </Text>
          {preview.data.payers.length === 0 ? (
            <Text size="sm">No rent activity up to {preview.data.to}.</Text>
          ) : (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Payer</Table.Th>
                  <Table.Th ta="right">Opening</Table.Th>
                  <Table.Th ta="right">Closing</Table.Th>
                  <Table.Th ta="right">Lines</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {preview.data.payers.map((p) => (
                  <Table.Tr key={p.payer}>
                    <Table.Td>{p.label}</Table.Td>
                    <Table.Td ta="right">{gbp(p.openingPence)}</Table.Td>
                    <Table.Td ta="right">{gbp(p.closingPence)}</Table.Td>
                    <Table.Td ta="right">{p.lines.length}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Stack>
      )}
    </Stack>
  );
}
