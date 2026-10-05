import { Alert, Button, Group, Modal, NumberInput, Select, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { errorMessage, fieldErrors, isApiError } from '../../lib/api';
import { useBranches } from '../branches/api';
import { useLandlords } from '../landlords/api';
import {
  useCreateProperty,
  useUpdateProperty,
  type ManagementType,
  type Property,
  type PropertyPatchInput,
} from './api';

export interface PropertyFormModalProps {
  opened: boolean;
  onClose: () => void;
  /** Edit this property; omit to add a new one. */
  property?: Property | null;
}

const MANAGEMENT_TYPES = ['RG', 'MG', 'IRG'] as const;
const POSTCODE = /^[A-Za-z]{1,2}\d[A-Za-z\d]? ?\d[A-Za-z]{2}$/;

export function PropertyFormModal({ opened, onClose, property }: PropertyFormModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={property ? `Edit ${property.propertyRef}` : 'Add property'} size="lg">
      <PropertyForm key={property?.id ?? 'new'} property={property ?? null} onDone={onClose} />
    </Modal>
  );
}

function PropertyForm({ property, onDone }: { property: Property | null; onDone: () => void }) {
  const create = useCreateProperty();
  const update = useUpdateProperty();
  const mutation = property ? update : create;
  const branches = useBranches('');
  const landlords = useLandlords('');
  const form = useForm({
    initialValues: {
      propertyRef: property?.propertyRef ?? '',
      branchId: property?.branchId ?? ('' as string),
      landlordId: property?.landlordId ?? (null as string | null),
      addressLine1: property?.addressLine1 ?? '',
      addressLine2: property?.addressLine2 ?? '',
      town: property?.town ?? '',
      postcode: property?.postcode ?? '',
      bedrooms: property?.bedrooms ?? ('' as number | ''),
      brma: property?.brma ?? '',
      defaultManagementType: (property?.defaultManagementType ?? null) as ManagementType | null,
      isActive: property?.isActive ?? true,
    },
    validate: {
      propertyRef: (v) => (property || /^[A-Za-z0-9-]{1,30}$/.test(v.trim()) ? null : 'Use 1-30 letters, digits or -'),
      branchId: (v) => (v ? null : 'Choose a branch'),
      addressLine1: (v) => (v.trim() && v.trim().length <= 200 ? null : 'Enter the first line of the address'),
      postcode: (v) => (POSTCODE.test(v.trim()) ? null : 'Enter a valid UK postcode'),
      bedrooms: (v) => (v === '' || (Number.isInteger(v) && v >= 0 && v <= 50) ? null : 'Enter a whole number from 0 to 50'),
    },
  });

  const onError = (err: unknown) => {
    if (isApiError(err) && err.code === 'conflict') form.setFieldError('propertyRef', err.message);
    for (const [path, message] of Object.entries(fieldErrors(err))) form.setFieldError(path, message);
  };
  const handledOnFields =
    isApiError(mutation.error) && (mutation.error.code === 'conflict' || Object.keys(fieldErrors(mutation.error)).length > 0);
  const general = mutation.isError && !handledOnFields ? errorMessage(mutation.error) : null;

  const submit = form.onSubmit((v) => {
    const values = {
      branchId: v.branchId,
      landlordId: v.landlordId,
      addressLine1: v.addressLine1.trim(),
      addressLine2: v.addressLine2.trim() || null,
      town: v.town.trim() || null,
      postcode: v.postcode.trim().toUpperCase(),
      bedrooms: v.bedrooms === '' ? null : v.bedrooms,
      brma: v.brma.trim() || null,
      defaultManagementType: v.defaultManagementType,
    };
    if (property) {
      // Only what changed: the server audits every field it receives.
      const before: Record<string, unknown> = { ...property };
      const input: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(values)) if (before[key] !== value) input[key] = value;
      if (v.isActive !== property.isActive) input.isActive = v.isActive;
      if (Object.keys(input).length === 0) return onDone();
      update.mutate(
        { id: property.id, input: input as PropertyPatchInput },
        {
          onSuccess: () => {
            notifications.show({ color: 'teal', title: 'Property updated', message: `${property.propertyRef} has been saved.` });
            onDone();
          },
          onError,
        },
      );
    } else {
      create.mutate(
        { propertyRef: v.propertyRef.trim(), ...values },
        {
          onSuccess: () => {
            notifications.show({ color: 'teal', title: 'Property added', message: `${v.propertyRef.trim()} has been added.` });
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
          label="Property reference"
          required
          disabled={property !== null}
          description={property ? 'The reference cannot be changed.' : undefined}
          data-autofocus={!property}
          {...form.getInputProps('propertyRef')}
        />
        <Select
          label="Branch"
          required
          searchable
          data={(branches.data ?? []).map((b) => ({ value: b.id, label: `${b.code} - ${b.name}` }))}
          nothingFoundMessage="No branches"
          {...form.getInputProps('branchId')}
        />
        <Select
          label="Landlord"
          clearable
          searchable
          data={(landlords.data ?? []).map((l) => ({ value: l.id, label: l.landlordRef ? `${l.name} (${l.landlordRef})` : l.name }))}
          nothingFoundMessage="No landlords"
          {...form.getInputProps('landlordId')}
        />
        <TextInput label="Address line 1" required {...form.getInputProps('addressLine1')} />
        <TextInput label="Address line 2" {...form.getInputProps('addressLine2')} />
        <Group grow align="flex-start">
          <TextInput label="Town" {...form.getInputProps('town')} />
          <TextInput label="Postcode" required {...form.getInputProps('postcode')} />
        </Group>
        <Group grow align="flex-start">
          <NumberInput label="Bedrooms" min={0} max={50} allowDecimal={false} {...form.getInputProps('bedrooms')} />
          <TextInput label="BRMA" {...form.getInputProps('brma')} />
          <Select
            label="Management type"
            clearable
            data={MANAGEMENT_TYPES.map((t) => ({ value: t, label: t }))}
            {...form.getInputProps('defaultManagementType')}
          />
        </Group>
        {property && <Switch label="Active" {...form.getInputProps('isActive', { type: 'checkbox' })} />}
        <Text fz="xs" c="dimmed">
          The nightly Veco sync overwrites the branch, first address line, postcode, management type and active flag, so
          changes to those fields may be replaced.
        </Text>
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
            {property ? 'Save changes' : 'Add property'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
