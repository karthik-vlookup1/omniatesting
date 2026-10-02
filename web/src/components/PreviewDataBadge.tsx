import { Badge, Tooltip } from '@mantine/core';
import { IconFlask } from '@tabler/icons-react';

/**
 * Marks a screen whose data comes from the typed mock layer because the backend endpoint does not
 * exist yet. Staff must never mistake sample figures for real ones.
 */
export function PreviewDataBadge() {
  return (
    <Tooltip label="The backend for this screen is not built yet. Figures shown are synthetic sample data.">
      <Badge color="orange" variant="outline" leftSection={<IconFlask size={12} aria-hidden />} tabIndex={0}>
        Preview data
      </Badge>
    </Tooltip>
  );
}
