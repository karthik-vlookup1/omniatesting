import { Alert, Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { errorMessage, fieldErrors, isApiError } from '../../lib/api';
import { useCreateLandlord, useUpdateLandlord, type Landlord } from './api';

export interface LandlordFormModalProps {
  opened: boolean;
  onClose: () => void;
  /** Edit this landlord; omit to add a new one. */
  landlord?: Landlord | null;
}

export function LandlordFormModal({ opened, onClose, landlord }: LandlordFormModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={landlord ? `Edit ${landlord.name}` : 'Add landlord'} size="md">
      <LandlordForm key={landlord?.id ?? 'new'} landlord={landlord ?? null} onDone={onClose} />
    </Modal>
  );
}

function LandlordForm({ landlord, onDone }: { landlord: Landlord | null; onDone: () => void }) {
  const create = useCreateLandlord();
  const update = useUpdateLandlord();
  const mutation = landlord ? update : create;
  const form = useForm({
    initialValues: {
      name: landlord?.name ?? '',
      landlordRef: landlord?.landlordRef ?? '',
      email: landlord?.email ?? '',
      phone: landlord?.phone ?? '',
    },
    validate: {
      name: (v) => (v.trim() && v.trim().length <= 200 ? null : 'Enter a name (up to 200 characters)'),
      landlordRef: (v) => (v.trim().length <= 50 ? null : 'Use at most 50 characters'),
      email: (v) => (v.trim() === '' || /^\S+@\S+\.\S+$/.test(v.trim()) ? null : 'Enter a valid e-mail address'),
      phone: (v) => (v.trim() === '' || /^[0-9 +()-]{6,20}$/.test(v.trim()) ? null : 'Use 6-20 digits, spaces or + ( ) -'),
    },
  });

  const onError = (err: unknown) => {
    if (isApiError(err) && err.code === 'conflict') form.setFieldError('landlordRef', err.message);
    for (const [path, message] of Object.entries(fieldErrors(err))) form.setFieldError(path, message);
  };
  const handledOnFields =
    isApiError(mutation.error) && (mutation.error.code === 'conflict' || Object.keys(fieldErrors(mutation.error)).length > 0);
  const general = mutation.isError && !handledOnFields ? errorMessage(mutation.error) : null;

  const submit = form.onSubmit((v) => {
    const input = {
      name: v.name.trim(),
      landlordRef: v.landlordRef.trim() || null,
      email: v.email.trim() || null,
      phone: v.phone.trim() || null,
    };
    if (landlord) {
      update.mutate(
        { id: landlord.id, input },
        {
          onSuccess: () => {
            notifications.show({ color: 'teal', title: 'Landlord updated', message: `${input.name} has been saved.` });
            onDone();
          },
          onError,
        },
      );
    } else {
      create.mutate(input, {
        onSuccess: () => {
          notifications.show({ color: 'teal', title: 'Landlord added', message: `${input.name} has been added.` });
          onDone();
        },
        onError,
      });
    }
  });

  return (
    <form noValidate onSubmit={submit}>
      <Stack gap="md">
        <TextInput label="Name" required data-autofocus {...form.getInputProps('name')} />
        <TextInput label="Reference" description="Internal reference, optional." {...form.getInputProps('landlordRef')} />
        <TextInput label="E-mail" type="email" autoComplete="off" {...form.getInputProps('email')} />
        <TextInput label="Phone" type="tel" autoComplete="off" {...form.getInputProps('phone')} />
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
            {landlord ? 'Save changes' : 'Add landlord'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
