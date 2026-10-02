import { Alert, Button, Group, Text } from '@mantine/core';
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import { errorMessage, isApiError } from '../lib/api';

export interface ErrorStateProps {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  retrying?: boolean;
}

/**
 * Shows a failed load in plain language. The request id (if the server sent one) is included so
 * staff can quote it to support; no stack traces or raw payloads are ever shown.
 */
export function ErrorState({ error, title = 'Could not load this information', onRetry, retrying }: ErrorStateProps) {
  const requestId = isApiError(error) ? error.requestId : null;
  return (
    <Alert color="red" title={title} icon={<IconAlertCircle size={18} aria-hidden />} role="alert">
      <Text fz="sm">{errorMessage(error)}</Text>
      {(onRetry || requestId) && (
        <Group mt="sm" gap="md" justify="space-between">
          {onRetry ? (
            <Button
              size="xs"
              variant="default"
              leftSection={<IconRefresh size={14} aria-hidden />}
              onClick={onRetry}
              loading={retrying}
            >
              Try again
            </Button>
          ) : (
            <span />
          )}
          {requestId && (
            <Text fz="xs" c="slate.6" ff="monospace">
              Ref {requestId}
            </Text>
          )}
        </Group>
      )}
    </Alert>
  );
}
