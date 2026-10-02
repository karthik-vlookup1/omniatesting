import { Alert, Button, Group, Modal, PasswordInput, Stack, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCheck } from '@tabler/icons-react';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, useChangePassword } from '../../data/auth';
import { errorMessage, fieldErrors, isApiError } from '../../lib/api';

export interface ChangePasswordModalProps {
  opened: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ opened, onClose }: ChangePasswordModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="Change password" size="sm">
      <ChangePasswordForm onDone={onClose} />
    </Modal>
  );
}

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const mutation = useChangePassword();
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    validate: {
      currentPassword: (v) => (v ? null : 'Enter your current password'),
      newPassword: (v, values) => {
        if (v.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
        if (v.length > PASSWORD_MAX_LENGTH) return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
        if (v === values.currentPassword) return 'Choose a password different from the current one';
        return null;
      },
      confirmPassword: (v, values) => (v === values.newPassword ? null : 'Passwords do not match'),
    },
  });

  const generalError =
    mutation.isError && !(isApiError(mutation.error) && ['invalid_credentials', 'bad_request'].includes(mutation.error.code))
      ? errorMessage(mutation.error)
      : null;

  return (
    <form
      noValidate
      onSubmit={form.onSubmit(({ currentPassword, newPassword }) =>
        mutation.mutate(
          { currentPassword, newPassword },
          {
            onSuccess: () => {
              notifications.show({
                color: 'teal',
                icon: <IconCheck size={16} aria-hidden />,
                title: 'Password changed',
                message: 'You have been signed out on every other device.',
              });
              onDone();
            },
            onError: (err) => {
              if (isApiError(err) && err.code === 'invalid_credentials') {
                form.setFieldError('currentPassword', 'Current password is incorrect');
              }
              const issues = fieldErrors(err);
              if (issues.newPassword) form.setFieldError('newPassword', issues.newPassword);
            },
          },
        ),
      )}
    >
      <Stack gap="md">
        <Text fz="sm" c="dimmed">
          At least {PASSWORD_MIN_LENGTH} characters. A short phrase of unrelated words works well.
        </Text>
        <PasswordInput
          label="Current password"
          autoComplete="current-password"
          required
          data-autofocus
          key={form.key('currentPassword')}
          {...form.getInputProps('currentPassword')}
        />
        <PasswordInput
          label="New password"
          autoComplete="new-password"
          required
          key={form.key('newPassword')}
          {...form.getInputProps('newPassword')}
        />
        <PasswordInput
          label="Confirm new password"
          autoComplete="new-password"
          required
          key={form.key('confirmPassword')}
          {...form.getInputProps('confirmPassword')}
        />
        {generalError && (
          <Alert color="red" role="alert">
            {generalError}
          </Alert>
        )}
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onDone} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Change password
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
