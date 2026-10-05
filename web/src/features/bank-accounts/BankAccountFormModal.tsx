import { Alert, Button, Group, Loader, Modal, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { errorMessage, fieldErrors, isApiError } from '../../lib/api';
import {
  useBankAccountDetail,
  useCreateBankAccount,
  useUpdateBankAccount,
  type BankAccountDetail,
  type BankAccountRow,
} from './api';

export interface BankAccountFormModalProps {
  opened: boolean;
  onClose: () => void;
  /** Edit this bank account; omit to add a new one. */
  account?: BankAccountRow | null;
}

export function BankAccountFormModal({ opened, onClose, account }: BankAccountFormModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={account ? `Edit ${account.code}` : 'Add bank account'} size="md">
      {account ? <EditLoader account={account} onDone={onClose} /> : <BankAccountForm detail={null} onDone={onClose} />}
    </Modal>
  );
}

function EditLoader({ account, onDone }: { account: BankAccountRow; onDone: () => void }) {
  const detail = useBankAccountDetail(account.id);
  if (detail.isError) {
    return (
      <Alert color="red" role="alert">
        {errorMessage(detail.error)}
      </Alert>
    );
  }
  if (!detail.data) return <Loader size="sm" aria-label="Loading bank account" />;
  return <BankAccountForm key={account.id} detail={detail.data} onDone={onDone} />;
}

function BankAccountForm({ detail, onDone }: { detail: BankAccountDetail | null; onDone: () => void }) {
  const create = useCreateBankAccount();
  const update = useUpdateBankAccount();
  const mutation = detail ? update : create;
  const form = useForm({
    initialValues: {
      code: detail?.code ?? '',
      bankName: detail?.bankName ?? '',
      accountName: detail?.accountName ?? '',
      sortCodeLast2: detail?.sortCodeLast2 ?? '',
      accountLast4: detail?.accountLast4 ?? '',
      xeroAccountId: detail?.xeroAccountId ?? '',
      isActive: detail?.isActive ?? true,
    },
    validate: {
      code: (v) => (detail || /^[A-Za-z0-9_]{2,20}$/.test(v.trim()) ? null : 'Use 2-20 letters, digits or _'),
      bankName: (v) => (v.trim() && v.trim().length <= 100 ? null : 'Enter the bank name (up to 100 characters)'),
      accountName: (v) => (v.trim() && v.trim().length <= 100 ? null : 'Enter the account name (up to 100 characters)'),
      sortCodeLast2: (v) => (v === '' || /^\d{2}$/.test(v) ? null : 'Enter exactly 2 digits'),
      accountLast4: (v) => (v === '' || /^\d{4}$/.test(v) ? null : 'Enter exactly 4 digits'),
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
    const common = {
      bankName: v.bankName.trim(),
      accountName: v.accountName.trim(),
      sortCodeLast2: v.sortCodeLast2 || null,
      accountLast4: v.accountLast4 || null,
      xeroAccountId: v.xeroAccountId.trim() || null,
    };
    if (detail) {
      update.mutate(
        { id: detail.id, input: { ...common, isActive: v.isActive } },
        {
          onSuccess: () => {
            notifications.show({ color: 'teal', title: 'Bank account updated', message: `${detail.code} has been saved.` });
            onDone();
          },
          onError,
        },
      );
    } else {
      create.mutate(
        { code: v.code.trim(), ...common },
        {
          onSuccess: () => {
            notifications.show({ color: 'teal', title: 'Bank account added', message: `${v.code.trim().toUpperCase()} has been added.` });
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
          disabled={detail !== null}
          description={detail ? 'The code cannot be changed.' : 'Short code, for example HSBC or LLOYDS.'}
          data-autofocus={!detail}
          {...form.getInputProps('code')}
        />
        <TextInput label="Bank name" required data-autofocus={detail !== null} {...form.getInputProps('bankName')} />
        <TextInput label="Account name" required {...form.getInputProps('accountName')} />
        <Group grow align="flex-start">
          <TextInput label="Sort code (last 2 digits)" inputMode="numeric" maxLength={2} {...form.getInputProps('sortCodeLast2')} />
          <TextInput label="Account number (last 4 digits)" inputMode="numeric" maxLength={4} {...form.getInputProps('accountLast4')} />
        </Group>
        <Text fz="xs" c="dimmed">
          Only the last digits are stored. Never enter a full sort code or account number.
        </Text>
        <TextInput label="Xero account ID" {...form.getInputProps('xeroAccountId')} />
        {detail && <Switch label="Active" {...form.getInputProps('isActive', { type: 'checkbox' })} />}
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
            {detail ? 'Save changes' : 'Add bank account'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
