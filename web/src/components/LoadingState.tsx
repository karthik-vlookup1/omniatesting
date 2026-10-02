import { Center, Loader, Skeleton, Stack, Text } from '@mantine/core';

export interface LoadingStateProps {
  /** Announced to screen readers and shown under the spinner. */
  label?: string;
  /** `skeleton` reserves the shape of a table while it loads, so the page does not jump. */
  variant?: 'spinner' | 'skeleton';
  rows?: number;
  /** Fill the viewport (used while the session is checked on start-up). */
  fullScreen?: boolean;
}

export function LoadingState({ label = 'Loading…', variant = 'spinner', rows = 6, fullScreen }: LoadingStateProps) {
  if (variant === 'skeleton') {
    return (
      <Stack gap={8} role="status" aria-live="polite" aria-label={label}>
        <Skeleton height={32} radius="sm" />
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} height={28} radius="sm" opacity={1 - i * (0.6 / rows)} />
        ))}
      </Stack>
    );
  }
  return (
    <Center mih={fullScreen ? '100vh' : 200} role="status" aria-live="polite">
      <Stack align="center" gap="sm">
        <Loader size="sm" aria-hidden />
        <Text fz="sm" c="slate.6">
          {label}
        </Text>
      </Stack>
    </Center>
  );
}
