import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

export interface ConfirmActionOptions {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  tone?: 'default' | 'danger';
}

/**
 * "Are you sure?" in front of a save, for forms that validate first and then call a mutation:
 *   confirm.ask({ title, message, confirmLabel }, () => add.mutate(input, …));
 * Render `confirm.dialog` once inside the form's component. The save runs only after Confirm.
 */
export function useConfirmAction(): { ask: (options: ConfirmActionOptions, run: () => void) => void; dialog: ReactNode } {
  const [pending, setPending] = useState<(ConfirmActionOptions & { run: () => void }) | null>(null);

  const dialog = (
    <ConfirmDialog
      opened={pending !== null}
      onClose={() => setPending(null)}
      title={pending?.title ?? ''}
      message={pending?.message}
      confirmLabel={pending?.confirmLabel ?? 'Confirm'}
      tone={pending?.tone}
      onConfirm={() => {
        pending?.run();
        setPending(null);
      }}
    />
  );

  return { ask: (options, run) => setPending({ ...options, run }), dialog };
}
