import { Badge, Box, Group, ScrollArea, Stack, Text, UnstyledButton } from '@mantine/core';
import {
  IconAdjustmentsDollar,
  IconCalendarDollar,
  IconFileText,
  IconLayoutDashboard,
  IconListDetails,
  IconReceipt,
  IconUserCircle,
  IconWallet,
  type Icon,
} from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import type { RecordView } from './recordModel';

interface NavEntry {
  view: RecordView;
  label: string;
  icon: Icon;
  count?: number | null;
}

interface RecordNavProps {
  current: RecordView;
  counts: { receipts: number | null; adjustments: number | null; payers: number | null; periods: number | null; terms: number | null };
  /** Balance block at the top (LetMC has its yellow Notes button here). */
  header: React.ReactNode;
}

/**
 * The tenant record's own left menu (LetMC: Overview / Tenant Details / Tenant / Referencing / Notes
 * groups with counts). Dark in both colour schemes, like LetMC. Each entry is a link to ?view=…,
 * so a view can be bookmarked and the browser Back button works.
 */
export function RecordNav({ current, counts, header }: RecordNavProps) {
  const groups: { label: string; entries: NavEntry[] }[] = [
    {
      label: 'Tenant',
      entries: [
        { view: 'overview', label: 'Overview', icon: IconLayoutDashboard },
        { view: 'details', label: 'Tenant details', icon: IconUserCircle },
      ],
    },
    {
      label: 'Accounts',
      entries: [
        { view: 'account', label: 'Rent account', icon: IconListDetails, count: counts.periods },
        { view: 'receipts', label: 'Receipts', icon: IconReceipt, count: counts.receipts },
        { view: 'adjustments', label: 'Adjustments', icon: IconAdjustmentsDollar, count: counts.adjustments },
        { view: 'payers', label: 'Payer accounts', icon: IconWallet, count: counts.payers },
      ],
    },
    {
      label: 'Rent',
      entries: [
        { view: 'terms', label: 'Rent terms', icon: IconCalendarDollar, count: counts.terms },
        { view: 'statement', label: 'Statement', icon: IconFileText },
      ],
    },
  ];

  return (
    <Box
      component="aside"
      w={250}
      miw={250}
      style={{ background: 'var(--app-record-nav-bg)', color: 'var(--app-record-nav-fg)', alignSelf: 'stretch' }}
      data-print-hidden
    >
      <ScrollArea h="100%" type="hover" scrollbarSize={6}>
        <Box p="md" pb="sm">
          {header}
        </Box>
        <Stack gap="md" component="nav" aria-label="Record sections" pb="lg">
          {groups.map((g) => (
            <Stack key={g.label} gap={0}>
              <Text
                fz={11}
                fw={700}
                tt="uppercase"
                px="md"
                py={6}
                c="var(--app-topbar-muted)"
                style={{ letterSpacing: '0.08em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
              >
                {g.label}
              </Text>
              {g.entries.map((e) => {
                const active = e.view === current;
                return (
                  <UnstyledButton
                    key={e.view}
                    component={Link}
                    to={`?view=${e.view}`}
                    aria-current={active ? 'page' : undefined}
                    px="md"
                    py={9}
                    style={{
                      color: active ? '#fff' : 'var(--app-record-nav-fg)',
                      background: active ? 'var(--app-record-nav-active)' : undefined,
                      boxShadow: active ? 'inset 3px 0 0 var(--app-accent)' : undefined,
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap" gap="xs">
                      <Group gap={10} wrap="nowrap">
                        <e.icon size={17} stroke={1.75} aria-hidden />
                        <Text fz="sm" fw={active ? 650 : 500}>
                          {e.label}
                        </Text>
                      </Group>
                      {e.count !== undefined && (
                        <Badge
                          size="sm"
                          variant={active ? 'filled' : 'light'}
                          color={active ? 'ember.7' : 'gray'}
                          styles={{ root: { minWidth: 26 } }}
                          aria-label={e.count === null ? 'count loading' : `${e.count} items`}
                        >
                          {e.count ?? '·'}
                        </Badge>
                      )}
                    </Group>
                  </UnstyledButton>
                );
              })}
            </Stack>
          ))}
        </Stack>
      </ScrollArea>
    </Box>
  );
}
