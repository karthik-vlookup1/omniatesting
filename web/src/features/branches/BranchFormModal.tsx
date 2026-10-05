import { Alert, Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { errorMessage, fieldErrors, isApiError } from '../../lib/api';
import { useCreateBranch, useUpdateBranch, type Branch } from './api';

export interface BranchFormModalProps {
  opened: boolean;
  onClose: () => void;
  /** Edit this branch; omit to add a new one. */
  branch?: Branch | null;
}

export function BranchFormModal({ opened, onClose, branch }: BranchFormModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={branch ? `Edit ${branch.code}` : 'Add branch'} size="md">
      <BranchForm key={branch?.id ?? 'new'} branch={branch ?? null} onDone={onClose} />
    </Modal>
  );
}

function BranchForm({ branch, onDone }: { branch: Branch | null; onDone: () => void }) {
  const create = useCreateBranch();
  const update = useUpdateBranch();
  const mutation = branch ? update : create;
  const form = useForm({
    initialValues: { code: branch?.code ?? '', name: branch?.name ?? '', xeroTrackingOption: branch?.xeroTrackingOption ?? '' },
    validate: {
      code: (v) => (branch || /^[A-Za-z0-9]{2,10}$/.test(v.trim()) ? null : 'Use 2-10 letters or digits'),
      name: (v) => (v.trim() && v.trim().length <= 100 ? null : 'Enter a name (up to 100 characters)'),
    },
  });

  const onError = (err: unknown) => {
    if (isApiError(err) && err.code === 'conflict') form.setFieldError('code', err.message);
    for (const [path, message] of Object.entries(fieldErrors(err))) form.setFieldError(path, message);
  };
  const handledOnFields =
    isApiError(mutation.error) && (mutation.error.code === 'conflict' || Object.keys(fieldErrors(mutation.error)).length > 0);
  const general = mutation.isError && !handledOnFields ? errorMessage(mutation.error) : null;

  const submit = form.onSubmit((v) => {
    const xero = v.xeroTrackingOption.trim() || null;
    if (branch) {
      update.mutate(
        { id: branch.id, input: { name: v.name.trim(), xeroTrackingOption: xero } },
        {
          onSuccess: () => {
            notifications.show({ color: 'teal', title: 'Branch updated', message: `${branch.code} has been saved.` });
            onDone();
          },
          onError,
        },
      );
    } else {
      create.mutate(
        { code: v.code.trim(), name: v.name.trim(), xeroTrackingOption: xero },
        {
          onSuccess: () => {
            notifications.show({ color: 'teal', title: 'Branch added', message: `${v.code.trim().toUpperCase()} has been added.` });
            onDone();
          },
          onError,
        },
      );
    }
  });

  return (
    <form noValidate onSubmit={submit}>
      <Stack gap="md">
        <TextInput
          label="Code"
          required
          disabled={branch !== null}
          description={branch ? 'The code cannot be changed.' : 'Short code, as used in Xero and Veco.'}
          data-autofocus={!branch}
          {...form.getInputProps('code')}
        />
        <TextInput label="Name" required data-autofocus={branch !== null} {...form.getInputProps('name')} />
        <TextInput label="Xero tracking option" {...form.getInputProps('xeroTrackingOption')} />
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
            {branch ? 'Save changes' : 'Add branch'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
