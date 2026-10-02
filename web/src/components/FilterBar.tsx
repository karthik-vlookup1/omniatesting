import { Button, Group, Paper } from '@mantine/core';
import { IconFilterOff } from '@tabler/icons-react';
import type { ReactNode } from 'react';

export interface FilterBarProps {
  children: ReactNode;
  /** Shown only when at least one filter is active. */
  onReset?: () => void;
  active?: boolean;
  /** Right-aligned extras, e.g. an export button. */
  actions?: ReactNode;
}

/** Holds a list's filters on one wrapping row, aligned to the bottom so labels line up. */
export function FilterBar({ children, onReset, active, actions }: FilterBarProps) {
  return (
    <Paper withBorder p="sm" mb="md" role="search">
      <Group justify="space-between" align="flex-end" gap="sm" wrap="wrap">
        <Group align="flex-end" gap="sm" wrap="wrap" style={{ flex: '1 1 auto' }}>
          {children}
          {active && onReset && (
            <Button variant="subtle" color="gray" leftSection={<IconFilterOff size={15} aria-hidden />} onClick={onReset}>
              Clear filters
            </Button>
          )}
        </Group>
        {actions && <Group gap="xs">{actions}</Group>}
      </Group>
    </Paper>
  );
}
