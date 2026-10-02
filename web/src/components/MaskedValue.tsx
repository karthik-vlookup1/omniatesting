import { Group, Text, Tooltip } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { EMPTY_VALUE } from '../lib/format';

export interface MaskedValueProps {
  /**
   * Exactly what the server returned, e.g. `•••••12C` (NI, last 3) or `****1234` (account, last 4).
   * This component never receives or reveals more than the server chose to send.
   */
  value: string | null | undefined;
  kind: 'ni' | 'account';
}

const LABEL = { ni: 'NI number', account: 'Payer account' } as const;

export function MaskedValue({ value, kind }: MaskedValueProps) {
  if (!value) {
    return (
      <Text span c="slate.5" fz="sm" aria-label={`${LABEL[kind]} not recorded`}>
        {EMPTY_VALUE}
      </Text>
    );
  }
  return (
    <Tooltip label={`${LABEL[kind]} — masked for data protection`}>
      <Group gap={4} wrap="nowrap" component="span" display="inline-flex">
        <IconLock size={12} stroke={1.75} color="var(--mantine-color-slate-5)" aria-hidden />
        <Text span ff="monospace" fz="sm" aria-label={`${LABEL[kind]}, masked: ${value}`}>
          {value}
        </Text>
      </Group>
    </Tooltip>
  );
}
