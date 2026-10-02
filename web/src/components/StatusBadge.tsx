import { Badge, type BadgeProps } from '@mantine/core';
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleDashed,
  IconCircleX,
  IconInfoCircle,
  IconPoint,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { TONE_COLOR, type Tone } from '../theme';

const TONE_ICON: Record<Tone, ReactNode> = {
  success: <IconCircleCheck size={13} stroke={2} aria-hidden />,
  warning: <IconAlertTriangle size={13} stroke={2} aria-hidden />,
  danger: <IconCircleX size={13} stroke={2} aria-hidden />,
  info: <IconInfoCircle size={13} stroke={2} aria-hidden />,
  neutral: <IconCircleDashed size={13} stroke={2} aria-hidden />,
  brand: <IconPoint size={13} stroke={2} aria-hidden />,
};

export interface StatusBadgeProps extends Omit<BadgeProps, 'color' | 'leftSection' | 'children'> {
  tone: Tone;
  label: string;
  /** Overrides the tone's default icon. Pass `null` to hide it. */
  icon?: ReactNode | null;
}

/**
 * A status pill. The label is always visible text and each tone has its own icon, so status is
 * never conveyed by colour alone.
 */
export function StatusBadge({ tone, label, icon, ...rest }: StatusBadgeProps) {
  const leftSection = icon === null ? undefined : (icon ?? TONE_ICON[tone]);
  return (
    <Badge color={TONE_COLOR[tone]} leftSection={leftSection} data-tone={tone} {...rest}>
      {label}
    </Badge>
  );
}
