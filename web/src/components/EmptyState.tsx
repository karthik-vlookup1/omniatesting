import { EmptyState as MantineEmptyState } from '@mantine/core';
import { IconInbox } from '@tabler/icons-react';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  /** A next step, e.g. "Upload a bank CSV". */
  action?: ReactNode;
  size?: 'sm' | 'md';
}

/** Shown when a list or page has nothing to display. Always says why and, if possible, what next. */
export function EmptyState({ title, description, icon, action, size = 'md' }: EmptyStateProps) {
  return (
    <MantineEmptyState
      py={size === 'sm' ? 'lg' : 'xl'}
      size={size}
      title={title}
      description={description}
      icon={icon ?? <IconInbox stroke={1.5} aria-hidden />}
      withIndicatorBackground
      role="status"
    >
      {action && <MantineEmptyState.Actions>{action}</MantineEmptyState.Actions>}
    </MantineEmptyState>
  );
}
