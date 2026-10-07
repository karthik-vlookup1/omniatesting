import { ActionIcon, Box, Group, Paper, Text, ThemeIcon, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import type { ReactNode } from 'react';

interface RecordCardProps {
  title: string;
  icon: ReactNode;
  /** Shown top-right like LetMC's card timestamp, e.g. when the data was fetched. */
  updatedAt?: number;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Extra controls in the title bar (e.g. a link). */
  action?: ReactNode;
  children: ReactNode;
  /** Accent stripe colour on the left of the title bar. */
  accent?: string;
}

const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

/** A LetMC overview card: icon + title + time + refresh in a title bar, then the body. */
export function RecordCard({ title, icon, updatedAt, onRefresh, refreshing, action, children, accent }: RecordCardProps) {
  return (
    <Paper withBorder radius="md" shadow="xs" style={{ overflow: 'hidden' }} component="section" aria-label={title}>
      <Group
        justify="space-between"
        wrap="nowrap"
        px="md"
        py={10}
        style={{
          borderBottom: '1px solid var(--app-border-subtle)',
          background: 'var(--app-surface-subtle)',
          boxShadow: accent ? `inset 3px 0 0 ${accent}` : undefined,
        }}
      >
        <Group gap="xs" wrap="nowrap" miw={0}>
          <ThemeIcon variant="light" color="navy" size={26} radius="md" aria-hidden>
            {icon}
          </ThemeIcon>
          <Text fw={650} fz="sm" truncate>
            {title}
          </Text>
        </Group>
        <Group gap={6} wrap="nowrap">
          {action}
          {updatedAt ? (
            <Text fz="xs" c="dimmed" className="tabular">
              {time.format(updatedAt)}
            </Text>
          ) : null}
          {onRefresh && (
            <Tooltip label={`Refresh ${title.toLowerCase()}`}>
              <ActionIcon size="sm" aria-label={`Refresh ${title}`} onClick={onRefresh} loading={refreshing}>
                <IconRefresh size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>
      <Box p="md">{children}</Box>
    </Paper>
  );
}

/** Label/value line inside a card ("Amount outstanding: £873.22"). */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Group gap={6} wrap="nowrap" align="baseline" py={3}>
      <Text fz="sm" fw={600} c="dimmed" style={{ whiteSpace: 'nowrap' }}>
        {label}:
      </Text>
      <Text fz="sm" fw={600} component="div" style={{ minWidth: 0 }}>
        {children}
      </Text>
    </Group>
  );
}
