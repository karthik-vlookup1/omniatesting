import { Badge, Group, Loader, Paper, Stack, Text, UnstyledButton } from '@mantine/core';
import { useState } from 'react';
import { MaskedValue, SearchInput } from '../../components';
import { useTenancySearch, type TenancySummary } from '../../data/tenancies';

const MIN_QUERY = 2;
const MAX_SHOWN = 8;

/** "Pick another tenancy": search by TID, name or full NI (GET /api/tenancies?q=). */
export function TenancyPicker({ onPick }: { onPick: (t: TenancySummary) => void }) {
  const [q, setQ] = useState('');
  const enabled = q.length >= MIN_QUERY;
  const results = useTenancySearch(q, 'all', { enabled });
  const rows = enabled ? (results.data ?? []).slice(0, MAX_SHOWN) : [];

  return (
    <Stack gap="xs">
      <SearchInput
        label="Find a tenancy"
        placeholder="TID, tenant name or full NI number"
        value={q}
        onSearch={setQ}
        rightSection={enabled && results.isFetching ? <Loader size="xs" /> : undefined}
        autoComplete="off"
      />
      {enabled && results.isSuccess && rows.length === 0 && (
        <Text fz="sm" c="dimmed">
          No tenancy matches “{q}”.
        </Text>
      )}
      {rows.length > 0 && (
        <Stack gap={4} role="listbox" aria-label="Tenancies found">
          {rows.map((t) => (
            <UnstyledButton
              key={t.tid}
              role="option"
              aria-selected={false}
              aria-label={`Choose ${t.tid}${t.tenantName ? `, ${t.tenantName}` : ''}`}
              onClick={() => onPick(t)}
              data-focusable
              style={{ borderRadius: 'var(--mantine-radius-md)' }}
            >
              <Paper withBorder p="xs" radius="md">
                <Group justify="space-between" wrap="nowrap">
                  <Stack gap={0} miw={0}>
                    <Group gap={6} wrap="nowrap">
                      <Text fz="sm" fw={600} ff="monospace">
                        {t.tid}
                      </Text>
                      <Text fz="sm" truncate>
                        {t.tenantName ?? 'Unknown tenant'}
                      </Text>
                    </Group>
                    <Text fz="xs" c="dimmed" truncate>
                      {t.address}, {t.postcode}
                    </Text>
                  </Stack>
                  <Group gap={6} wrap="nowrap">
                    <MaskedValue kind="ni" value={t.niMasked} />
                    {t.status !== 'active' && (
                      <Badge size="xs" variant="outline" color="gray">
                        {t.status === 'ended' ? 'Ended' : 'Pending'}
                      </Badge>
                    )}
                  </Group>
                </Group>
              </Paper>
            </UnstyledButton>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
