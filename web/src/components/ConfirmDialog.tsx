import { Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core';
import { useState, type ReactNode } from 'react';

export interface ConfirmDialogProps {
  opened: boolean;
  onClose: () => void;
  /** Receives the reason when `reasonLabel` is set, otherwise an empty string. */
  onConfirm: (reason: string) => void;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` for irreversible or money-affecting actions. */
  tone?: 'default' | 'danger';
  loading?: boolean;
  /** When set, a reason is required before the action can be confirmed (e.g. reversing a receipt). */
  reasonLabel?: string;
  /** Server error from the last attempt, shown inside the dialog. */
  error?: ReactNode;
}

export function ConfirmDialog({ opened, onClose, title, loading, ...body }: ConfirmDialogProps) {
  return (
    <Modal opened={opened} onClose={loading ? () => {} : onClose} title={title} size="md">
      {/* The modal unmounts its content when closed, so the reason resets on every open. */}
      <ConfirmBody onClose={onClose} loading={loading} {...body} />
    </Modal>
  );
}

function ConfirmBody({
  onClose,
  onConfirm,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  loading,
  reasonLabel,
  error,
}: Omit<ConfirmDialogProps, 'opened' | 'title'>) {
  const [reason, setReason] = useState('');
  const needsReason = Boolean(reasonLabel);
  const canConfirm = !needsReason || reason.trim().length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canConfirm && !loading) onConfirm(reason.trim());
      }}
    >
      <Stack gap="md">
        <Text fz="sm">{message}</Text>
        {needsReason && (
          <Textarea
            label={reasonLabel}
            required
            data-autofocus
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            maxLength={500}
          />
        )}
        {error && (
          <Text fz="sm" c="red.8" role="alert">
            {error}
          </Text>
        )}
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button type="submit" color={tone === 'danger' ? 'red' : undefined} loading={loading} disabled={!canConfirm}>
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
