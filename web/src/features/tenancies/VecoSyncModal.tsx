import { Alert, Button, Checkbox, Group, List, Modal, SimpleGrid, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconInfoCircle, IconRefresh } from '@tabler/icons-react';
import { useState } from 'react';
import { useVecoSync, type SyncSummary } from '../../data/tenancies';
import { errorMessage, isApiError } from '../../lib/api';
import { formatCount } from '../../lib/format';

function Count({ label, value }: { label: string; value: number }) {
  return (
    <Stack gap={0}>
      <Text fz="xs" c="dimmed">
        {label}
      </Text>
      <Text fz="sm" fw={600} className="tabular">
        {formatCount(value)}
      </Text>
    </Stack>
  );
}

function SummaryView({ s }: { s: SyncSummary }) {
  return (
    <Stack gap="sm" data-testid="sync-summary">
      <Text fz="sm" fw={600}>
        {s.dryRun ? 'Dry run: nothing has been saved' : 'Sync complete'} · {formatCount(s.fetched)} rows read from Veco
      </Text>
      <SimpleGrid cols={4} spacing="sm">
        <Count label="New tenancies" value={s.tenancies.inserted} />
        <Count label="Updated" value={s.tenancies.updated} />
        <Count label="Reactivated" value={s.tenancies.reactivated} />
        <Count label="Ended" value={s.tenancies.ended} />
        <Count label="New tenants" value={s.tenants.inserted} />
        <Count label="Rent changes" value={s.rentChanges} />
        <Count label="NI missing / invalid" value={s.ni.missing + s.ni.invalid} />
        <Count label="NI conflicts" value={s.ni.conflicts} />
      </SimpleGrid>
      {s.managementType.defaultedToRG > 0 && (
        <Text fz="xs" c="dimmed">
          {formatCount(s.managementType.defaultedToRG)} tenancies had no management type and were set to RG.
        </Text>
      )}
      {s.rejected.length > 0 && (
        <Alert color="orange" variant="light" title={`${formatCount(s.rejected.length)} rows rejected`}>
          <List size="xs" spacing={2}>
            {s.rejected.slice(0, 10).map((r, i) => (
              <List.Item key={`${r.tid ?? 'none'}-${i}`}>
                {r.tid ?? 'No TID'}: {r.reason}
              </List.Item>
            ))}
          </List>
          {s.rejected.length > 10 && (
            <Text fz="xs" c="dimmed" mt={4}>
              …and {formatCount(s.rejected.length - 10)} more.
            </Text>
          )}
        </Alert>
      )}
    </Stack>
  );
}

/**
 * FRONTEND_REFERENCE.md §5.3: dry run first, then run. The backend refuses a sync that looks wrong
 * (empty feed, or would end more than 20% of tenancies) with 409; forcing it needs explicit consent.
 * Branches on HTTP status because these codes are specific to this one endpoint.
 */
function SyncBody({ onClose }: { onClose: () => void }) {
  const sync = useVecoSync();
  const [dry, setDry] = useState<SyncSummary | null>(null);
  const [forceAgreed, setForceAgreed] = useState(false);

  const status = isApiError(sync.error) ? sync.error.status : null;
  const refused = status === 409;
  const notConfigured = status === 503;

  const run = (dryRun: boolean, force = false) =>
    sync.mutate(
      { dryRun, force },
      {
        onSuccess: (summary) => {
          if (summary.dryRun) return setDry(summary);
          notifications.show({
            color: 'teal',
            title: 'Veco sync complete',
            message: `${formatCount(summary.tenancies.inserted)} new, ${formatCount(summary.tenancies.updated)} updated, ${formatCount(summary.tenancies.ended)} ended.`,
          });
          onClose();
        },
      },
    );

  return (
    <Stack gap="md">
      <Text fz="sm">
        Brings tenancies, tenants, rent and NI numbers in from Veco. Start with a dry run to see what would change.
      </Text>
      {dry && <SummaryView s={dry} />}
      {sync.isError &&
        (notConfigured ? (
          <Alert color="blue" icon={<IconInfoCircle size={18} aria-hidden />} title="Veco sync is not set up">
            {errorMessage(sync.error)}
          </Alert>
        ) : (
          <Alert
            color={refused ? 'orange' : 'red'}
            icon={<IconAlertTriangle size={18} aria-hidden />}
            title={refused ? 'Sync refused as a safety check' : 'Sync failed'}
            role="alert"
          >
            <Text fz="sm">{errorMessage(sync.error)}</Text>
            {refused && (
              <Checkbox
                mt="sm"
                label="I have checked the Veco feed and want to apply it anyway"
                checked={forceAgreed}
                onChange={(e) => setForceAgreed(e.currentTarget.checked)}
              />
            )}
          </Alert>
        ))}
      <Group justify="flex-end" gap="xs">
        <Button variant="default" onClick={onClose} disabled={sync.isPending}>
          Close
        </Button>
        {refused ? (
          <Button color="orange" onClick={() => run(false, true)} disabled={!forceAgreed} loading={sync.isPending}>
            Force sync
          </Button>
        ) : (
          <>
            <Button variant="default" onClick={() => run(true)} loading={sync.isPending && sync.variables?.dryRun} disabled={notConfigured}>
              {dry ? 'Dry run again' : 'Dry run'}
            </Button>
            <Button
              leftSection={<IconRefresh size={16} aria-hidden />}
              onClick={() => run(false)}
              disabled={!dry || notConfigured}
              loading={sync.isPending && !sync.variables?.dryRun}
            >
              Run sync
            </Button>
          </>
        )}
      </Group>
    </Stack>
  );
}

export function VecoSyncModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  return (
    <Modal opened={opened} onClose={onClose} title="Sync from Veco" size="lg">
      <SyncBody onClose={onClose} />
    </Modal>
  );
}
