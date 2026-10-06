import { Alert, Button, Group, Modal, Select, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { errorMessage } from '../../lib/api';
import { useAgentosTenants, useReassignLine, type IntakeLine } from './api';

/** Picks the agentOS tenant a line belongs to; the server re-runs the match rules and audits the change. */
export function ReassignModal({ line, onClose }: { line: IntakeLine | null; onClose: () => void }) {
  return (
    <Modal opened={line !== null} onClose={onClose} title={line ? `Reassign TID for line ${line.lineNo}` : ''}>
      {line && <ReassignForm key={line.id} line={line} onClose={onClose} />}
    </Modal>
  );
}

function ReassignForm({ line, onClose }: { line: IntakeLine; onClose: () => void }) {
  const tenants = useAgentosTenants();
  const reassign = useReassignLine();
  const [tid, setTid] = useState<string | null>(null);
  const options = Array.from(
    new Map((tenants.data ?? []).map((t) => [t.tid, { value: t.tid, label: `${t.name} · ${t.depositTo}` }])).values(),
  );

  const submit = () => {
    if (!tid) return;
    reassign.mutate(
      { lineId: line.id, tid },
      {
        onSuccess: () => {
          const label = options.find((o) => o.value === tid)?.label ?? tid;
          notifications.show({ color: 'green', message: `Line ${line.lineNo} is now ${label}` });
          onClose();
        },
      },
    );
  };

  return (
    <Stack gap="sm">
      <Text>
        {line.payerName} (current TID: {line.tid ?? 'none'})
      </Text>
      <Select
        label="agentOS tenant"
        searchable
        data={options}
        value={tid}
        onChange={setTid}
        placeholder="Search by TID or name"
        nothingFoundMessage="No agentOS tenants"
      />
      {reassign.isError && (
        <Alert color="red" role="alert">
          {errorMessage(reassign.error)}
        </Alert>
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!tid} loading={reassign.isPending}>
          Reassign
        </Button>
      </Group>
    </Stack>
  );
}
