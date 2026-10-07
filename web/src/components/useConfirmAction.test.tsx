import { MantineProvider } from '@mantine/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { theme } from '../theme';
import { useConfirmAction } from './useConfirmAction';

function SaveForm({ save }: { save: () => void }) {
  const confirm = useConfirmAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        confirm.ask({ title: 'Save this rent?', message: '£650.00 weekly from 01/04/2025.', confirmLabel: 'Save rent' }, save);
      }}
    >
      {confirm.dialog}
      <button type="submit">Save rent</button>
    </form>
  );
}

function renderForm(save: () => void) {
  return render(
    <MantineProvider theme={theme}>
      <SaveForm save={save} />
    </MantineProvider>,
  );
}

describe('useConfirmAction', () => {
  it('runs the save only after Confirm', async () => {
    const save = vi.fn();
    const user = userEvent.setup();
    renderForm(save);
    await user.click(screen.getByRole('button', { name: 'Save rent' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save this rent?' });
    expect(within(dialog).getByText('£650.00 weekly from 01/04/2025.')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Save rent' }));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the person cancels', async () => {
    const save = vi.fn();
    const user = userEvent.setup();
    renderForm(save);
    await user.click(screen.getByRole('button', { name: 'Save rent' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save this rent?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(save).not.toHaveBeenCalled();
  });
});
