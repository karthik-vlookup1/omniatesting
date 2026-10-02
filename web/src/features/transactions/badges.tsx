import { Badge, Tooltip } from '@mantine/core';
import {
  IconAlertTriangle,
  IconBan,
  IconCircleCheck,
  IconCircleDashed,
  IconHelpCircle,
  IconProgressCheck,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { LINE_STATUS, confidenceColor, methodLabel, type LineStatus, type Suggestion } from '../../data/transactions';
import { formatPercent } from '../../lib/format';

const STATUS_ICON: Record<LineStatus, ReactNode> = {
  matched: <IconCircleCheck size={13} aria-hidden />,
  partially_matched: <IconProgressCheck size={13} aria-hidden />,
  needs_review: <IconHelpCircle size={13} aria-hidden />,
  yet_to_take: <IconAlertTriangle size={13} aria-hidden />,
  excluded: <IconBan size={13} aria-hidden />,
  new: <IconCircleDashed size={13} aria-hidden />,
};

/** Line status with the reference's colour, its own icon and the text label. */
export function LineStatusBadge({ status }: { status: LineStatus }) {
  const s = LINE_STATUS[status];
  return (
    <Badge color={s.color} variant="light" leftSection={STATUS_ICON[status]} data-status={status}>
      {s.label}
    </Badge>
  );
}

/** Confidence as a percentage; the tooltip says how the match was found and why. */
export function ConfidenceBadge({ suggestion }: { suggestion: Pick<Suggestion, 'confidence' | 'method' | 'reason'> }) {
  const label = formatPercent(suggestion.confidence);
  const detail = [methodLabel(suggestion.method), suggestion.reason].filter(Boolean).join(' — ');
  return (
    <Tooltip label={detail || methodLabel(suggestion.method)}>
      <Badge
        color={confidenceColor(suggestion.confidence)}
        variant="light"
        className="tabular"
        tabIndex={0}
        aria-label={`Confidence ${label}: ${detail}`}
      >
        {label}
      </Badge>
    </Tooltip>
  );
}
