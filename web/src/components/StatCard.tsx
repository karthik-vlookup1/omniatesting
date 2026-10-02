import { Card, Group, Stack, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TONE_COLOR, type Tone } from '../theme';

export interface StatCardProps {
  label: string;
  /** Already formatted by the caller (the server owns the figure). */
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  /** Makes the whole card a link to the filtered list behind the figure. */
  to?: string;
}

/** A single key figure. Use sparingly: every card should answer a question staff actually ask. */
export function StatCard({ label, value, hint, icon, tone = 'neutral', to }: StatCardProps) {
  const body = (
    <Card padding="md" h="100%">
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <Stack gap={4} miw={0}>
          <Text fz="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.04em' }}>
            {label}
          </Text>
          <Text fz={26} fw={650} lh={1.15} className="tabular">
            {value}
          </Text>
          {hint && (
            <Text fz="xs" c="dimmed">
              {hint}
            </Text>
          )}
        </Stack>
        {icon && (
          <ThemeIcon variant="light" color={TONE_COLOR[tone]} size={36} radius="md" aria-hidden>
            {icon}
          </ThemeIcon>
        )}
      </Group>
    </Card>
  );
  if (!to) return body;
  return (
    <UnstyledButton component={Link} to={to} aria-label={`${label}: view details`} h="100%" display="block">
      {body}
    </UnstyledButton>
  );
}
