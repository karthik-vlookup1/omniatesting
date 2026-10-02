import { Badge, Button, Drawer, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { ErrorState, LoadingState, MaskedValue, Money } from '../../components';
import { useTenancy, type TenancyDetail } from '../../data/tenancies';
import { formatDate, humanize } from '../../lib/format';
import { TenancyStatusBadge } from './TenancyStatusBadge';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={2} miw={0}>
      <Text fz="xs" c="dimmed">
        {label}
      </Text>
      <Text component="div" fz="sm" fw={500} style={{ overflowWrap: 'anywhere' }}>
        {children}
      </Text>
    </Stack>
  );
}

/**
 * The full NI number is only in the response for admin / accounts (the server decides). Even then
 * it stays masked until the person chooses to reveal it, and is hidden again when the drawer closes.
 */
function NiField({ tenancy }: { tenancy: TenancyDetail }) {
  const [shown, setShown] = useState(false);
  if (!tenancy.ni) return <MaskedValue kind="ni" value={tenancy.niMasked} />;
  return (
    <Group gap="xs" wrap="nowrap">
      {shown ? (
        <Text span ff="monospace" fz="sm" aria-label={`NI number ${tenancy.ni}`}>
          {tenancy.ni}
        </Text>
      ) : (
        <MaskedValue kind="ni" value={tenancy.niMasked} />
      )}
      <Button
        size="compact-xs"
        variant="subtle"
        leftSection={shown ? <IconEyeOff size={12} aria-hidden /> : <IconEye size={12} aria-hidden />}
        onClick={() => setShown((v) => !v)}
      >
        {shown ? 'Hide' : 'Show full NI'}
      </Button>
    </Group>
  );
}

export function TenancyDrawer({ tid, onClose }: { tid: string | null; onClose: () => void }) {
  const tenancy = useTenancy(tid);
  const t = tenancy.data;

  return (
    <Drawer opened={tid !== null} onClose={onClose} position="right" size={480} padding="lg" title={<Text fw={650}>{t ? `${t.tid} · ${t.tenantName ?? 'Unknown tenant'}` : tid}</Text>}>
      {tenancy.isError ? (
        <ErrorState error={tenancy.error} title="Could not load this tenancy" onRetry={() => void tenancy.refetch()} />
      ) : !t ? (
        <LoadingState label="Loading tenancy…" />
      ) : (
        <Stack gap="lg">
          <Group gap="xs">
            <TenancyStatusBadge status={t.status} />
            <Badge variant="outline" color="gray">
              {t.managementType}
            </Badge>
            <Badge variant="outline" color="gray">
              Branch {t.branchCode}
            </Badge>
          </Group>
          <SimpleGrid cols={2} spacing="md" verticalSpacing="sm">
            <Fact label="Tenant">{t.tenantName ?? '—'}</Fact>
            <Fact label="NI number">
              {/* Keyed by TID so a revealed NI never carries over to another tenancy. */}
              <NiField key={t.tid} tenancy={t} />
            </Fact>
            <Fact label="Start date">{formatDate(t.startDate)}</Fact>
            <Fact label="End date">{t.endDate ? formatDate(t.endDate) : 'Ongoing'}</Fact>
            <Fact label="Rent">
              {t.rent ? (
                <>
                  <Money value={t.rent.amount} fw={600} /> <Text span fz="sm" c="dimmed">{humanize(t.rent.frequency).toLowerCase()}</Text>
                </>
              ) : (
                '—'
              )}
            </Fact>
            <Fact label="Property">
              {t.propertyRef}
              {t.unitRef ? ` / ${t.unitRef}` : ''}
            </Fact>
          </SimpleGrid>
          <Fact label="Address">
            {t.address}, {t.postcode}
          </Fact>
        </Stack>
      )}
    </Drawer>
  );
}
