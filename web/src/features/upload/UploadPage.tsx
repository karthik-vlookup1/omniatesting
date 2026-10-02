import { Alert, Button, FileInput, Group, List, Select, Stack, Table, Text, Title } from '@mantine/core';
import { IconFileTypeCsv, IconUpload } from '@tabler/icons-react';
import { useState } from 'react';
import { hasRole, useCurrentUser } from '../auth/useAuth';
import { UploadError, useBankAccounts, useImports, useUpload, type UploadOutcome } from './api';

/** Upload a bank statement CSV for one bank account; shows what was imported and recent imports. */
export function UploadPage() {
  const { data: user } = useCurrentUser();
  const banks = useBankAccounts();
  const imports = useImports();
  const upload = useUpload();
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [outcome, setOutcome] = useState<UploadOutcome | null>(null);
  const canUpload = hasRole(user?.role, 'accounts', 'staff');

  const options = (banks.data ?? [])
    .filter((b) => b.isActive)
    .map((b) => ({ value: b.id, label: `${b.code} — ${b.accountName}`, disabled: !b.profile }));

  const submit = () => {
    if (!bankAccountId || !file) return;
    setOutcome(null);
    upload.mutate(
      { bankAccountId, file },
      {
        onSuccess: (r) => {
          setOutcome(r);
          setFile(null);
        },
      },
    );
  };

  return (
    <Stack>
      <Title order={2}>Upload bank statement</Title>
      {banks.data?.length === 0 && (
        <Alert color="yellow">No bank accounts yet. An admin can add the default banks on the CSV profiles page.</Alert>
      )}
      {canUpload ? (
        <Group align="end">
          <Select label="Bank account" placeholder="Choose the bank" data={options} value={bankAccountId} onChange={setBankAccountId} w={320} />
          <FileInput
            label="CSV file"
            placeholder="Choose a .csv file"
            accept=".csv,text/csv"
            leftSection={<IconFileTypeCsv size={16} />}
            value={file}
            onChange={setFile}
            clearable
            w={320}
          />
          <Button leftSection={<IconUpload size={16} />} onClick={submit} disabled={!bankAccountId || !file} loading={upload.isPending}>
            Upload
          </Button>
        </Group>
      ) : (
        <Text c="dimmed">Your role can view imports but not upload statements.</Text>
      )}

      {upload.isError && <UploadErrorAlert error={upload.error} />}
      {outcome && <UploadSummary outcome={outcome} />}

      <Title order={4} mt="md">
        Recent imports
      </Title>
      <Table striped aria-label="Recent imports">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Uploaded</Table.Th>
            <Table.Th>Bank</Table.Th>
            <Table.Th>File</Table.Th>
            <Table.Th>Period</Table.Th>
            <Table.Th>New</Table.Th>
            <Table.Th>Duplicates</Table.Th>
            <Table.Th>By</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {imports.data?.map((i) => (
            <Table.Tr key={i.id}>
              <Table.Td>{new Date(i.uploadedAt).toLocaleString('en-GB')}</Table.Td>
              <Table.Td>{i.bankCode}</Table.Td>
              <Table.Td>{i.fileName}</Table.Td>
              <Table.Td>
                {i.periodFrom} – {i.periodTo}
              </Table.Td>
              <Table.Td>{i.rowsInserted}</Table.Td>
              <Table.Td>{i.rowsDuplicate}</Table.Td>
              <Table.Td>{i.uploadedBy ?? '—'}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {imports.data?.length === 0 && <Text c="dimmed">Nothing imported yet.</Text>}
    </Stack>
  );
}

function UploadErrorAlert({ error }: { error: Error }) {
  const e = error instanceof UploadError ? error : null;
  return (
    <Alert color="red" title="Not imported" role="alert">
      <Text size="sm">{error.message}</Text>
      {e?.rowErrors && (
        <List size="sm" mt="xs">
          {e.rowErrors.map((r) => (
            <List.Item key={r.line}>
              Line {r.line}: {r.error}
            </List.Item>
          ))}
        </List>
      )}
      {e?.missingFields && (
        <Text size="sm" mt="xs">
          If the bank changed its export, update its CSV profile (CSV profiles page).
        </Text>
      )}
    </Alert>
  );
}

function UploadSummary({ outcome: { import: r, matching: m } }: { outcome: UploadOutcome }) {
  return (
    <Alert color="green" title="Statement imported" role="status">
      <List size="sm" spacing={2}>
        <List.Item>
          {r.rowsInserted} new lines, {r.rowsDuplicate} already imported, {r.rowsSkipped} blank/footer rows skipped ·{' '}
          {r.periodFrom} to {r.periodTo}
        </List.Item>
        {m ? (
          <List.Item data-testid="match-summary">
            {m.autoMatched} matched automatically, {m.needsReview} for review, {m.yetToTake} yet to take, {m.excluded}{' '}
            excluded
          </List.Item>
        ) : (
          <List.Item>Matching did not run; the lines will be matched when matching is run again.</List.Item>
        )}
        <List.Item>
          Identifiers found: {r.withTid} TID, {r.withNi} NI number, {r.withPayerAccount} payer account
        </List.Item>
      </List>
    </Alert>
  );
}
