import { Alert, Anchor, Button, Divider, Group, Loader, SegmentedControl, Select, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components';
import { can, useCurrentUser } from '../../data/auth';
import { errorMessage } from '../../lib/api';
import {
  exportCsvUrl,
  isExportable,
  STATUS_LABELS,
  useCreateExport,
  useIntakeBatch,
  useIntakeBatches,
  type AgentosExport,
  type IntakeLine,
  type MatchStatus,
} from './api';
import { IntakeUploadCard } from './IntakeUploadCard';
import { JournalSection } from './JournalSection';
import { LinesTable } from './LinesTable';
import { ReassignModal } from './ReassignModal';
import { TakePaymentSection } from './TakePaymentSection';

const STATUSES = Object.keys(STATUS_LABELS) as MatchStatus[];

export function AgentosPage() {
  const user = useCurrentUser();
  const writer = can(user, 'write');
  // Payments, journals, their exports and mark-posted are accounts/admin only on the server.
  const accounts = can(user, 'finance');
  const [params, setParams] = useSearchParams();
  const batches = useIntakeBatches();
  const batchId = params.get('batch') ?? batches.data?.[0]?.id ?? null;
  const rawStatus = params.get('status');
  const status: 'all' | MatchStatus = STATUSES.includes(rawStatus as MatchStatus) ? (rawStatus as MatchStatus) : 'all';
  const detail = useIntakeBatch(batchId);
  const [reassigning, setReassigning] = useState<IntakeLine | null>(null);
  const [exported, setExported] = useState<AgentosExport | null>(null);
  const createExport = useCreateExport();

  const setStatus = (value: string) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('status');
    else next.set('status', value);
    setParams(next, { replace: true });
  };
  const selectBatch = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('batch', id);
    next.delete('status');
    setParams(next, { replace: true });
    setExported(null);
  };

  const lines = detail.data?.lines ?? [];
  const shown = status === 'all' ? lines : lines.filter((l) => l.matchStatus === status);
  const count = (s: MatchStatus) => lines.filter((l) => l.matchStatus === s).length;
  const exportable = lines.filter(isExportable).length;

  const doExport = () => {
    if (!batchId) return;
    createExport.mutate(batchId, { onSuccess: (e) => setExported(e) });
  };

  return (
    <Stack gap="md">
      <PageHeader title="agentOS receipts" />
      {writer && <IntakeUploadCard onBatch={selectBatch} />}
      {batches.isError && (
        <Alert color="red" role="alert">
          {errorMessage(batches.error)}
        </Alert>
      )}
      <Select
        label="Batch"
        placeholder={batches.isLoading ? 'Loading' : 'No batches uploaded yet'}
        data={(batches.data ?? []).map((b) => ({ value: b.id, label: `${b.fileName} · ${b.uploadedAt.slice(0, 10)}` }))}
        value={batchId}
        onChange={(v) => v && selectBatch(v)}
        allowDeselect={false}
        maw={480}
      />
      {batchId && (
        <>
          <SegmentedControl
            aria-label="Status filter"
            value={status}
            onChange={setStatus}
            data={[
              { value: 'all', label: `All (${lines.length})` },
              ...STATUSES.map((s) => ({ value: s, label: `${STATUS_LABELS[s]} (${count(s)})` })),
            ]}
          />
          {writer && (
            <Stack gap="xs">
              <Group align="center">
                <Button onClick={doExport} disabled={exportable === 0} loading={createExport.isPending}>
                  Export matched lines ({exportable})
                </Button>
                {exportable === 0 && <Text c="dimmed">Only matched lines can be exported</Text>}
              </Group>
              {createExport.isError && (
                <Alert color="red" role="alert">
                  {errorMessage(createExport.error)}
                </Alert>
              )}
              {exported && (
                <Alert color="green" role="status">
                  Exported {exported.rowsTotal} line(s){' '}
                  <Anchor href={exportCsvUrl(exported.id)} download>
                    Download CSV
                  </Anchor>
                </Alert>
              )}
            </Stack>
          )}
          {detail.isLoading ? (
            <Loader size="sm" />
          ) : detail.isError ? (
            <Alert color="red" role="alert">
              {errorMessage(detail.error)}
            </Alert>
          ) : (
            <LinesTable lines={shown} writer={writer} onReassign={setReassigning} />
          )}
        </>
      )}
      <Divider />
      <TakePaymentSection writer={accounts} />
      <Divider />
      <JournalSection writer={accounts} />
      <ReassignModal line={reassigning} onClose={() => setReassigning(null)} />
    </Stack>
  );
}
