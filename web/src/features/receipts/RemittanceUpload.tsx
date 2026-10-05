import { Alert, Button, Group, NativeSelect, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconEye } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { DataTable, type DataTableColumn } from '../../components';
import { errorMessage } from '../../lib/api';
import { formatCount } from '../../lib/format';
import { RemittanceFilePicker } from './RemittanceFilePicker';
import { toErrorCsv } from '../letmc-import/errorReport';
import { previewRemittance, useCommitRemittance, type Payer, type RemittanceReport } from './api';
import { formatPence } from '../rent-terms/money';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const rowColumns: DataTableColumn<RemittanceReport['rows'][number]>[] = [
  { key: 'line', header: 'Row', align: 'right', cell: (r) => formatCount(r.line) },
  { key: 'ref', header: 'TID / claim ref', cell: (r) => r.tid ?? r.claimRef ?? '—' },
  { key: 'tid', header: 'Tenancy', cell: (r) => r.tenancyTid },
  { key: 'amount', header: 'Amount', align: 'right', cell: (r) => formatPence(r.amountPence) },
];
const errorColumns: DataTableColumn<RemittanceReport['errors'][number]>[] = [
  { key: 'line', header: 'Row', align: 'right', cell: (e) => formatCount(e.line) },
  { key: 'key', header: 'Key', cell: (e) => e.key || '—' },
  { key: 'field', header: 'Field', cell: (e) => e.field },
  { key: 'reason', header: 'Reason', cell: (e) => e.reason },
];

function downloadErrors(errors: RemittanceReport['errors']): void {
  const url = URL.createObjectURL(new Blob([toErrorCsv(errors)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'remittance-errors.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Preview a council remittance CSV against one bank line, then commit it as one receipt per row. */
export function RemittanceUpload({ lineId, onDone }: { lineId: string; onDone: () => void }) {
  const commit = useCommitRemittance();
  const [payer, setPayer] = useState<Exclude<Payer, 'tenant'>>('council_hb');
  const [payingBody, setPayingBody] = useState('');
  const [date, setDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [report, setReport] = useState<RemittanceReport | null>(null);

  const preview = useMutation({ mutationFn: previewRemittance, onSuccess: setReport });

  const chooseFile = (f: File | null) => {
    setReport(null);
    preview.reset();
    commit.reset();
    setFile(f);
    if (!f) return setFileError(null);
    if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') return setFileError('Choose a .csv file.');
    if (f.size === 0) return setFileError('This file is empty.');
    if (f.size > MAX_UPLOAD_BYTES) return setFileError('The file is larger than 10 MB.');
    setFileError(null);
  };

  const input = file && lineId && payingBody.trim() && date ? { bankTransactionId: lineId, payer, payingBody: payingBody.trim(), remittanceDate: date, file } : null;
  const busy = preview.isPending || commit.isPending;
  const canCommit = report !== null && report.counts.rejected === 0 && !report.totalMismatch && input !== null && !busy;

  return (
    <Stack gap="md">
      <Group align="flex-end" gap="md" wrap="wrap">
        <NativeSelect
          label="Payer"
          value={payer}
          onChange={(e) => {
            setReport(null);
            setPayer(e.currentTarget.value as Exclude<Payer, 'tenant'>);
          }}
          data={[
            { value: 'council_hb', label: 'Council (HB)' },
            { value: 'dwp_uc', label: 'DWP (UC)' },
            { value: 'other_third_party', label: 'Other' },
          ]}
        />
        <TextInput
          label="Paying body"
          required
          value={payingBody}
          onChange={(e) => {
            setReport(null);
            setPayingBody(e.currentTarget.value);
          }}
        />
        <TextInput
          type="date"
          label="Remittance date"
          required
          value={date}
          onChange={(e) => {
            setReport(null);
            setDate(e.currentTarget.value);
          }}
        />
      </Group>
      <RemittanceFilePicker file={file} onChange={chooseFile} disabled={busy} error={fileError} />

      {preview.isError && (
        <Alert color="red" title="The file could not be read" role="alert">
          {errorMessage(preview.error)}
        </Alert>
      )}
      {commit.isError && (
        <Alert color="red" title="Nothing was imported" role="alert">
          {errorMessage(commit.error)}
        </Alert>
      )}

      <Group justify="flex-end">
        <Button
          variant="default"
          leftSection={<IconEye size={16} aria-hidden />}
          loading={preview.isPending}
          disabled={input === null || fileError !== null || busy}
          onClick={() => input && preview.mutate(input)}
        >
          Preview
        </Button>
        <Button
          loading={commit.isPending}
          disabled={!canCommit}
          onClick={() =>
            input &&
            report &&
            commit.mutate(
              { ...input, previewSha256: report.fileSha256 },
              {
                onSuccess: (r) => {
                  notifications.show({
                    color: 'teal',
                    title: r.alreadyImported ? 'Already imported' : 'Remittance committed',
                    message: r.alreadyImported ? 'This file was already imported for this bank line.' : 'One receipt was created for each row.',
                  });
                  onDone();
                },
              },
            )
          }
        >
          Commit remittance
        </Button>
      </Group>

      {report && (
        <Stack gap="sm">
          <Text fz="sm" className="tabular">
            {formatCount(report.counts.rows)} rows, {formatCount(report.counts.matched)} matched, {formatCount(report.counts.rejected)} rejected. File total{' '}
            {formatPence(report.totalPence)}, bank line {formatPence(report.linePence)}.
          </Text>
          {report.totalMismatch && (
            <Alert color="orange" role="alert">
              The file total does not equal the bank line, so it cannot be committed.
            </Alert>
          )}
          {report.errors.length > 0 && (
            <Stack gap="xs">
              <Group justify="space-between">
                <Title order={3} fz="sm">
                  Rejected rows
                </Title>
                <Button size="xs" variant="default" leftSection={<IconDownload size={14} aria-hidden />} onClick={() => downloadErrors(report.errors)}>
                  Download error report
                </Button>
              </Group>
              <DataTable
                caption="Rejected rows"
                data={report.errors}
                columns={errorColumns}
                getRowId={(e) => `${e.line}|${e.field}|${e.reason}`}
                minWidth={500}
                maxHeight={240}
              />
            </Stack>
          )}
          <Stack gap="xs">
            <Title order={3} fz="sm">
              Rows that will become receipts
            </Title>
            <DataTable caption="Remittance rows" data={report.rows} columns={rowColumns} getRowId={(r) => String(r.line)} minWidth={500} maxHeight={240} />
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}
