import { Alert, Button, Group, MultiSelect, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { can, useCurrentUser } from '../../data/auth';
import { useBankAccounts } from '../../data/imports/queries';
import { errorMessage } from '../../lib/api';
import { downloadStatement, MAX_ROWS, OUTCOMES, useStatementSummary } from './api';

const ALL_BANKS = 'all';
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const label = (o: string) => o.replace(/_/g, ' ');

/** Bank statement download: every bank line with its outcome, as a CSV. */
export function StatementExportPage() {
  const user = useCurrentUser();
  if (!can(user, 'write')) {
    return (
      <Stack>
        <Title order={2}>Bank statement download</Title>
        <Alert color="yellow">You do not have access to this download.</Alert>
      </Stack>
    );
  }
  return <StatementExportView />;
}

function StatementExportView() {
  const banks = useBankAccounts();
  const today = new Date();
  const [bank, setBank] = useState<string>(ALL_BANKS);
  const [from, setFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = useState(iso(today));
  const [status, setStatus] = useState<string[]>([]);
  const filter = { bankAccountId: bank === ALL_BANKS ? '' : bank, from, to, status };
  const summary = useStatementSummary(filter);
  const download = useMutation({ mutationFn: () => downloadStatement(filter) });

  const rows = summary.data?.rows ?? 0;
  const tooBig = rows > MAX_ROWS;

  return (
    <Stack>
      <Title order={2}>Bank statement download</Title>
      <Group align="flex-end">
        <Select
          label="Bank account"
          allowDeselect={false}
          value={bank}
          onChange={(v) => setBank(v ?? ALL_BANKS)}
          data={[
            { value: ALL_BANKS, label: 'All banks' },
            ...(banks.data ?? []).map((b) => ({ value: b.id, label: `${b.code} - ${b.accountName}` })),
          ]}
        />
        <TextInput label="From" type="date" value={from} onChange={(e) => setFrom(e.currentTarget.value)} />
        <TextInput label="To" type="date" value={to} onChange={(e) => setTo(e.currentTarget.value)} />
        <MultiSelect
          label="Status"
          placeholder="All statuses"
          value={status}
          onChange={setStatus}
          data={OUTCOMES.map((o) => ({ value: o, label: label(o) }))}
          clearable
        />
      </Group>

      {summary.isError && (
        <Alert color="red" role="alert">
          {errorMessage(summary.error)}
        </Alert>
      )}
      {summary.data && (
        <Stack gap={4}>
          <Text data-testid="statement-summary">
            {summary.data.lines} bank lines, {summary.data.rows} rows
          </Text>
          <Text size="sm" c="dimmed">
            {OUTCOMES.filter((o) => summary.data.byStatus[o] > 0)
              .map((o) => `${label(o)}: ${summary.data.byStatus[o]}`)
              .join(' · ')}
          </Text>
        </Stack>
      )}
      {tooBig && (
        <Alert color="yellow">
          This download has {rows} rows (max {MAX_ROWS}); narrow the dates or pick one bank.
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

      <Group>
        <Button
          leftSection={<IconDownload size={16} />}
          loading={download.isPending}
          disabled={!summary.data || rows === 0 || tooBig}
          onClick={() => download.mutate()}
        >
          Download CSV
        </Button>
      </Group>
    </Stack>
  );
}
