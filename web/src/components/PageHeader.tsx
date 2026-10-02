import { Anchor, Breadcrumbs, Group, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface Crumb {
  label: string;
  to?: string;
}

export interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Right-aligned page actions (primary action last). */
  actions?: ReactNode;
  /** Shown next to the title, e.g. a status badge or the Preview data marker. */
  meta?: ReactNode;
  breadcrumbs?: Crumb[];
}

/** The one page title block. Every page starts with it so titles, spacing and actions line up. */
export function PageHeader({ title, description, actions, meta, breadcrumbs }: PageHeaderProps) {
  return (
    <Stack gap={6} mb="lg">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs separatorMargin={6} fz="xs" aria-label="Breadcrumb">
          {breadcrumbs.map((c) =>
            c.to ? (
              <Anchor key={c.label} component={Link} to={c.to} fz="xs" c="dimmed">
                {c.label}
              </Anchor>
            ) : (
              <Text key={c.label} fz="xs" c="dimmed" aria-current="page">
                {c.label}
              </Text>
            ),
          )}
        </Breadcrumbs>
      )}
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Stack gap={4} miw={0} style={{ flex: '1 1 320px' }}>
          <Group gap="sm" wrap="wrap">
            <Title order={1}>{title}</Title>
            {meta}
          </Group>
          {description && (
            <Text c="dimmed" fz="sm" maw={760}>
              {description}
            </Text>
          )}
        </Stack>
        {actions && (
          <Group gap="xs" wrap="wrap" justify="flex-end">
            {actions}
          </Group>
        )}
      </Group>
    </Stack>
  );
}
