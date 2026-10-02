import { Badge } from '@mantine/core';
import { IconCircleCheck, IconCircleDashed, IconCircleMinus } from '@tabler/icons-react';
import type { TenancyStatus } from '../../data/tenancies';

const STATUS: Record<TenancyStatus, { label: string; color: string; icon: React.ReactNode }> = {
  active: { label: 'Active', color: 'green', icon: <IconCircleCheck size={13} aria-hidden /> },
  pending: { label: 'Pending', color: 'blue', icon: <IconCircleDashed size={13} aria-hidden /> },
  ended: { label: 'Ended', color: 'gray', icon: <IconCircleMinus size={13} aria-hidden /> },
};

export function TenancyStatusBadge({ status }: { status: TenancyStatus }) {
  const s = STATUS[status];
  return (
    <Badge color={s.color} variant="light" leftSection={s.icon}>
      {s.label}
    </Badge>
  );
}
