import { ActionIcon, Alert, Button, CopyButton, Group, Modal, PasswordInput, Select, Stack, Switch, Text, TextInput, Tooltip } from '@mantine/core';
import { useForm, type GetInputPropsReturnType } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconCopy, IconWand } from '@tabler/icons-react';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, ROLES, ROLE_LABEL, type Role } from '../../data/auth';
import { ROLE_DESCRIPTION, useCreateUser, useUpdateUser, type UpdateUserInput, type UserSummary } from '../../data/users';
import { errorMessage, fieldErrors, isApiError } from '../../lib/api';
import { generateTemporaryPassword } from './password';

export interface UserFormModalProps {
  opened: boolean;
  onClose: () => void;
  /** Edit this user; omit to add a new one. */
  user?: UserSummary | null;
  /** The signed-in admin: the server refuses to let them demote or deactivate themself. */
  currentUserId: string;
}

const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));
const FULL_NAME_MAX = 200;

export function UserFormModal({ opened, onClose, user, currentUserId }: UserFormModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={user ? `Edit ${user.fullName}` : 'Add user'} size="md">
      {user ? <EditUserForm user={user} isSelf={user.id === currentUserId} onDone={onClose} /> : <CreateUserForm onDone={onClose} />}
    </Modal>
  );
}

function validatePassword(v: string, optional: boolean): string | null {
  if (optional && v === '') return null;
  if (v.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  if (v.length > PASSWORD_MAX_LENGTH) return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  return null;
}

function validateFullName(v: string): string | null {
  const t = v.trim();
  if (!t) return 'Enter the full name';
  return t.length > FULL_NAME_MAX ? `Use at most ${FULL_NAME_MAX} characters` : null;
}

interface PasswordFieldProps {
  label: string;
  description: string;
  value: string;
  inputProps: GetInputPropsReturnType;
  onGenerate: () => void;
  required?: boolean;
}

/** Password input with "generate" and "copy" helpers, so admins hand over strong temporary passwords. */
function PasswordField({ label, description, value, inputProps, onGenerate, required }: PasswordFieldProps) {
  return (
    <Group align="flex-end" gap="xs" wrap="nowrap">
      <PasswordInput label={label} description={description} autoComplete="new-password" required={required} style={{ flex: 1 }} {...inputProps} />
      <Tooltip label="Generate a strong password">
        <ActionIcon variant="default" size={36} onClick={onGenerate} aria-label="Generate a strong password">
          <IconWand size={16} />
        </ActionIcon>
      </Tooltip>
      <CopyButton value={value}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? 'Copied' : 'Copy password'}>
            <ActionIcon variant="default" size={36} onClick={copy} disabled={!value} aria-label="Copy password">
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}

function CreateUserForm({ onDone }: { onDone: () => void }) {
  const mutation = useCreateUser();
  const form = useForm({
    initialValues: { email: '', fullName: '', role: 'staff' as Role, password: '' },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v.trim()) ? null : 'Enter a valid e-mail address'),
      fullName: validateFullName,
      password: (v) => validatePassword(v, false),
    },
  });

  const handledOnFields =
    isApiError(mutation.error) && (mutation.error.code === 'conflict' || Object.keys(fieldErrors(mutation.error)).length > 0);
  const general = mutation.isError && !handledOnFields ? errorMessage(mutation.error) : null;

  return (
    <form
      noValidate
      onSubmit={form.onSubmit((values) =>
        mutation.mutate(values, {
          onSuccess: (user) => {
            notifications.show({
              color: 'teal',
              title: 'User added',
              message: `${user.fullName} can now sign in with the temporary password you set.`,
            });
            onDone();
          },
          onError: (err) => {
            if (isApiError(err) && err.code === 'conflict') {
              form.setFieldError('email', err.message || 'A user with this e-mail already exists');
            }
            for (const [path, message] of Object.entries(fieldErrors(err))) form.setFieldError(path, message);
          },
        }),
      )}
    >
      <Stack gap="md">
        <TextInput label="E-mail" type="email" autoComplete="off" required data-autofocus {...form.getInputProps('email')} />
        <TextInput label="Full name" autoComplete="off" required {...form.getInputProps('fullName')} />
        <Select
          label="Role"
          data={ROLE_OPTIONS}
          required
          description={ROLE_DESCRIPTION[form.values.role]}
          {...form.getInputProps('role')}
        />
        <PasswordField
          label="Temporary password"
          description={`At least ${PASSWORD_MIN_LENGTH} characters. Share it securely; they can change it after signing in.`}
          value={form.values.password}
          inputProps={form.getInputProps('password')}
          onGenerate={() => form.setFieldValue('password', generateTemporaryPassword())}
          required
        />
        {general && (
          <Alert color="red" role="alert">
            {general}
          </Alert>
        )}
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onDone} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Add user
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function EditUserForm({ user, isSelf, onDone }: { user: UserSummary; isSelf: boolean; onDone: () => void }) {
  const mutation = useUpdateUser();
  const form = useForm({
    initialValues: { fullName: user.fullName, role: user.role, isActive: user.isActive, password: '' },
    validate: {
      fullName: validateFullName,
      password: (v) => validatePassword(v, true),
    },
  });

  /** Only what changed: the server rejects an empty update, and every field it receives is audited. */
  const changes = (): UpdateUserInput => {
    const v = form.values;
    const out: UpdateUserInput = {};
    if (v.fullName.trim() !== user.fullName) out.fullName = v.fullName.trim();
    if (v.role !== user.role) out.role = v.role;
    if (v.isActive !== user.isActive) out.isActive = v.isActive;
    if (v.password) out.password = v.password;
    return out;
  };
  const dirty = Object.keys(changes()).length > 0;
  const endsSessions = form.values.password !== '' || form.values.role !== user.role || (user.isActive && !form.values.isActive);
  const general = mutation.isError && Object.keys(fieldErrors(mutation.error)).length === 0 ? errorMessage(mutation.error) : null;

  return (
    <form
      noValidate
      onSubmit={form.onSubmit(() =>
        mutation.mutate(
          { id: user.id, input: changes() },
          {
            onSuccess: (updated) => {
              notifications.show({ color: 'teal', title: 'User updated', message: `${updated.fullName} has been saved.` });
              onDone();
            },
            onError: (err) => {
              for (const [path, message] of Object.entries(fieldErrors(err))) form.setFieldError(path, message);
            },
          },
        ),
      )}
    >
      <Stack gap="md">
        <TextInput label="E-mail" value={user.email} readOnly disabled description="E-mail addresses cannot be changed." />
        <TextInput label="Full name" required data-autofocus {...form.getInputProps('fullName')} />
        <Select
          label="Role"
          data={ROLE_OPTIONS}
          required
          disabled={isSelf}
          description={isSelf ? 'You cannot change your own role.' : ROLE_DESCRIPTION[form.values.role]}
          {...form.getInputProps('role')}
        />
        <Switch
          label="Active"
          description={isSelf ? 'You cannot deactivate your own account.' : 'Inactive users cannot sign in.'}
          disabled={isSelf}
          {...form.getInputProps('isActive', { type: 'checkbox' })}
        />
        <PasswordField
          label="Reset password"
          description="Leave empty to keep the current password. Setting one also unlocks the account."
          value={form.values.password}
          inputProps={form.getInputProps('password')}
          onGenerate={() => form.setFieldValue('password', generateTemporaryPassword())}
        />
        {endsSessions && (
          <Text fz="xs" c="dimmed">
            Saving signs {user.fullName} out on every device.
          </Text>
        )}
        {general && (
          <Alert color="red" role="alert">
            {general}
          </Alert>
        )}
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onDone} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={!dirty}>
            Save changes
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
