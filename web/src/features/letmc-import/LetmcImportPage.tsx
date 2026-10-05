import { Alert, Button, Card, Group, NativeSelect, Stack, Text, TextInput, Title } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import { IconCheck, IconDownload, IconEye } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DataTable, EmptyState, PageHeader, type DataTableColumn } from '../../components';
import { errorMessage } from '../../lib/api';
import { formatCount, formatDateTime, formatMoney } from '../../lib/format';
import {
  commitImport,
  letmcKeys,
  previewImport,
  useLetmcLayout,
  useLetmcRuns,
  type EntityType,
  type FieldSpec,
  type LetmcReport,
  type LetmcRun,
  type ReportError,
  type ReportRow,
} from './api';
import { CsvFilePicker } from './CsvFilePicker';
import { downloadErrorCsv } from './errorReport';

const TYPE_OPTIONS: { value: EntityType; label: string }[] = [
  { value: 'landlords', label: 'Landlords' },
  { value: 'properties', label: 'Properties' },
  { value: 'tenants', label: 'Tenants' },
  { value: 'tenancies', label: 'Tenancies and opening balances' },
];

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const REQUIRED_TEXT: Record<string, string> = { always: 'Always', create: 'When creating' };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={0} data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`} miw={110}>
      <Text fz="xs" c="dimmed">
        {label}
      </Text>
      <Text fz="lg" fw={600} className="tabular">
        {value}
      </Text>
    </Stack>
  );
}

const layoutColumns: DataTableColumn<FieldSpec>[] = [
  { key: 'label', header: 'Column', cell: (f) => f.label },
  { key: 'aliases', header: 'Also accepted as', cell: (f) => (f.aliases.length > 0 ? f.aliases.join(', ') : '—') },
  { key: 'required', header: 'Required', cell: (f) => (f.required ? REQUIRED_TEXT[f.required] : 'Optional') },
];

const errorColumns: DataTableColumn<ReportError>[] = [
  { key: 'line', header: 'Row', align: 'right', cell: (e) => formatCount(e.line) },
  { key: 'key', header: 'Key', cell: (e) => e.key || '—' },
  { key: 'field', header: 'Field', cell: (e) => e.field },
  { key: 'reason', header: 'Reason', cell: (e) => e.reason },
];

const rowColumns: DataTableColumn<ReportRow>[] = [
  { key: 'line', header: 'Row', align: 'right', cell: (r) => formatCount(r.line) },
  { key: 'key', header: 'Key', cell: (r) => r.key },
  { key: 'action', header: 'Action', cell: (r) => capitalise(r.action) },
  { key: 'changes', header: 'Changes', cell: (r) => (r.changes.length > 0 ? r.changes.join(', ') : '—') },
  { key: 'notes', header: 'Notes', cell: (r) => (r.warnings.length > 0 ? r.warnings.join('; ') : '—') },
];

const runColumns: DataTableColumn<LetmcRun>[] = [
  { key: 'when', header: 'Imported', cell: (r) => formatDateTime(r.createdAt) },
  { key: 'type', header: 'Record type', cell: (r) => capitalise(r.entityType) },
  { key: 'file', header: 'File', cell: (r) => r.fileName },
  { key: 'cutover', header: 'Cutover', cell: (r) => r.cutoverDate ?? '—' },
  {
    key: 'counts',
    header: 'Result',
    cell: (r) => `${formatCount(r.counts.create)} created, ${formatCount(r.counts.update)} updated, ${formatCount(r.counts.unchanged)} unchanged`,
  },
];

/** Import LetMC master records from CSV: preview every row first, then commit all-or-nothing. */
export function LetmcImportPage() {
  useDocumentTitle('Import from LetMC · Omnia Recon');
  const qc = useQueryClient();
  const layout = useLetmcLayout();
  const runs = useLetmcRuns();
  const [type, setType] = useState<EntityType>('landlords');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [cutover, setCutover] = useState('');
  const [preview, setPreview] = useState<LetmcReport | null>(null);
  const [committed, setCommitted] = useState<LetmcReport | null>(null);

  const clear = () => {
    setPreview(null);
    setCommitted(null);
    previewMutation.reset();
    commitMutation.reset();
  };

  const input = file ? { entityType: type, file, cutoverDate: type === 'tenancies' ? cutover : undefined } : null;
  const needsCutover = type === 'tenancies' && cutover === '';

  const previewMutation = useMutation({
    mutationFn: previewImport,
    onSuccess: (report) => setPreview(report),
  });
  const commitMutation = useMutation({
    mutationFn: commitImport,
    onSuccess: ({ report }) => {
      setCommitted(report);
      setPreview(null);
      void qc.invalidateQueries({ queryKey: letmcKeys.runs });
    },
  });

  const chooseFile = (f: File | null) => {
    clear();
    setFile(f);
    if (!f) return setFileError(null);
    if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') return setFileError('Choose a .csv file exported from LetMC.');
    if (f.size === 0) return setFileError('This file is empty.');
    if (f.size > MAX_UPLOAD_BYTES) return setFileError('The file is larger than 10 MB.');
    setFileError(null);
  };

  const busy = previewMutation.isPending || commitMutation.isPending;
  const canPreview = input !== null && fileError === null && !needsCutover && !busy;
  const canCommit = preview !== null && preview.counts.rejected === 0 && input !== null && !busy;
  const opening = preview?.openingBalances;

  return (
    <>
      <PageHeader
        title="Import from LetMC"
        description="Import in order: Landlords, Properties, Tenants, then Tenancies and opening balances. Recon never overwrites values it already has; Veco owns active tenancies."
      />

      <Card mb="lg">
        <Stack gap="md">
          <Group align="flex-end" gap="md">
            <NativeSelect
              label="Record type"
              data={TYPE_OPTIONS}
              value={type}
              onChange={(e) => {
                clear();
                setType(e.currentTarget.value as EntityType);
              }}
              w={300}
            />
            {type === 'tenancies' && (
              <TextInput
                type="date"
                label="Cutover date"
                description="Balances in the file are the amounts owed at this date"
                value={cutover}
                onChange={(e) => {
                  clear();
                  setCutover(e.currentTarget.value);
                }}
                required
              />
            )}
          </Group>

          <Stack gap="xs">
            <Title order={2} fz="md">
              Expected columns
            </Title>
            <DataTable
              caption="Expected columns"
              data={layout.data?.[type]}
              loading={layout.isPending}
              error={layout.error}
              onRetry={() => void layout.refetch()}
              columns={layoutColumns}
              getRowId={(f) => f.field}
              minWidth={500}
            />
          </Stack>

          <CsvFilePicker file={file} onChange={chooseFile} disabled={busy} error={fileError} />

          {previewMutation.isError && (
            <Alert color="red" title="The file could not be read" role="alert">
              {errorMessage(previewMutation.error)}
            </Alert>
          )}
          {commitMutation.isError && (
            <Alert color="red" title="Nothing was imported" role="alert">
              {errorMessage(commitMutation.error)}
            </Alert>
          )}
          {committed && (
            <Alert color="green" icon={<IconCheck size={18} aria-hidden />} role="status">
              {`Import committed: ${formatCount(committed.counts.create)} created, ${formatCount(committed.counts.update)} updated, ${formatCount(committed.counts.unchanged)} unchanged`}
            </Alert>
          )}

          <Group justify="flex-end">
            <Button
              variant="default"
              leftSection={<IconEye size={16} aria-hidden />}
              loading={previewMutation.isPending}
              disabled={!canPreview}
              onClick={() => {
                if (!input) return;
                setCommitted(null);
                commitMutation.reset();
                previewMutation.mutate(input);
              }}
            >
              Preview
            </Button>
            <Button
              loading={commitMutation.isPending}
              disabled={!canCommit}
              onClick={() => input && preview && commitMutation.mutate({ ...input, previewSha256: preview.fileSha256 })}
            >
              Commit import
            </Button>
          </Group>
        </Stack>
      </Card>

      {preview && (
        <Card mb="lg">
          <Stack gap="md">
            <Title order={2} fz="md">
              Preview of {preview.fileName}
            </Title>
            <Group gap="xl">
              <Stat label="Rows" value={formatCount(preview.counts.rows)} />
              <Stat label="Will create" value={formatCount(preview.counts.create)} />
              <Stat label="Will update" value={formatCount(preview.counts.update)} />
              <Stat label="Unchanged" value={formatCount(preview.counts.unchanged)} />
              <Stat label="Duplicates" value={formatCount(preview.counts.duplicate)} />
              <Stat label="Rejected" value={formatCount(preview.counts.rejected)} />
              {opening && preview.entityType === 'tenancies' && (
                <>
                  <Stat
                    label="Opening arrears"
                    value={`${formatCount(opening.charges.count)} (${formatMoney(opening.charges.totalPence / 100)})`}
                  />
                  <Stat
                    label="Opening credits"
                    value={`${formatCount(opening.credits.count)} (${formatMoney(opening.credits.totalPence / 100)})`}
                  />
                </>
              )}
            </Group>

            {preview.errors.length > 0 && (
              <Stack gap="xs">
                <Group justify="space-between">
                  <Title order={3} fz="sm">
                    Rejected rows
                  </Title>
                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<IconDownload size={14} aria-hidden />}
                    onClick={() => downloadErrorCsv(preview.entityType, preview.errors)}
                  >
                    Download error report
                  </Button>
                </Group>
                <Text fz="sm" c="dimmed">
                  Fix these rows in the file and preview again. Nothing can be committed while rows are rejected.
                </Text>
                <DataTable
                  caption="Rejected rows"
                  data={preview.errors}
                  columns={errorColumns}
                  getRowId={(e) => `${e.line}|${e.field}|${e.reason}`}
                  minWidth={600}
                  maxHeight={360}
                />
              </Stack>
            )}

            <Stack gap="xs">
              <Title order={3} fz="sm">
                Rows that will be imported
              </Title>
              <DataTable
                caption="Preview rows"
                data={preview.rows}
                columns={rowColumns}
                getRowId={(r) => `${r.line}|${r.key}`}
                minWidth={700}
                maxHeight={420}
                empty={<EmptyState size="sm" title="No importable rows" description="Every row was rejected." />}
              />
            </Stack>
          </Stack>
        </Card>
      )}

      <Card>
        <Stack gap="xs">
          <Title order={2} fz="md">
            Recent LetMC imports
          </Title>
          <DataTable
            caption="Recent LetMC imports"
            data={runs.data}
            loading={runs.isPending}
            error={runs.error}
            onRetry={() => void runs.refetch()}
            columns={runColumns}
            getRowId={(r) => r.id}
            minWidth={700}
            empty={<EmptyState size="sm" title="No imports yet" description="Committed imports are listed here." />}
          />
        </Stack>
      </Card>
    </>
  );
}
