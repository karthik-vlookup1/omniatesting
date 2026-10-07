import { Alert, Box, Button, Group, Modal, Text } from '@mantine/core';
import type { FormEventHandler, ReactNode } from 'react';

interface ActionModalProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  /** e.g. "Payment from: 6568 Jason Morgan (…)" — LetMC's context lines above the form. */
  context?: ReactNode;
  submitLabel: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  loading?: boolean;
  /** Disables the action button (e.g. the record cannot take this action), with the reason shown in the body. */
  submitDisabled?: boolean;
  error?: string | null;
  size?: string | number;
  children: ReactNode;
}

/**
 * LetMC-style action dialog (guide: "Take a Payment", "Journal Transfer"): dark title bar,
 * context lines, the form, then Close + the action button bottom-right. The action button
 * submits the form; callers confirm before writing (ConfirmDialog) and show the server's error here.
 */
export function ActionModal({ opened, onClose, title, context, submitLabel, onSubmit, loading, submitDisabled, error, size = 'lg', children }: ActionModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      size={size}
      padding={0}
      styles={{
        header: { background: 'var(--app-topbar-bg)', color: '#fff', paddingInline: 20, minHeight: 52 },
        title: { fontWeight: 650 },
        close: { color: 'var(--app-topbar-fg)' },
      }}
    >
      <form noValidate onSubmit={onSubmit}>
        <Box px={20} py="md">
          {context && (
            <Box mb="md" p="sm" style={{ borderRadius: 6, background: 'var(--app-surface-subtle)', border: '1px solid var(--app-border-subtle)' }}>
              <Text fz="sm" component="div">
                {context}
              </Text>
            </Box>
          )}
          {children}
          {error && (
            <Alert color="red" role="alert" mt="md" title="The server refused this">
              {error}
            </Alert>
          )}
        </Box>
        <Group justify="flex-end" gap="sm" px={20} py="sm" style={{ borderTop: '1px solid var(--app-border-subtle)', background: 'var(--app-surface-subtle)' }}>
          <Button variant="default" onClick={onClose} disabled={loading}>
            Close
          </Button>
          <Button type="submit" color="ember.8" loading={loading} disabled={submitDisabled}>
            {submitLabel}
          </Button>
        </Group>
      </form>
    </Modal>
  );
}
