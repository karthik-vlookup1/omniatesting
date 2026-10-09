import { Alert, Button, Group, Modal, NativeSelect, Select, Stack, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { useConfirmAction } from '../../components';
import { errorMessage } from '../../lib/api';
import { useLandlords } from '../landlords/api';
import { useAddPayerAccount, type PayerAccountInput, type PayerKind } from './api';

export interface AddPayerAccountModalProps {
  opened: boolean;
  onClose: () => void;
}

export function AddPayerAccountModal({ opened, onClose }: AddPayerAccountModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="Add payer account" size="md">
      {/* Mounted only while open, so the form (and any typed account number) is reset on close. */}
      {opened && <AddForm onDone={onClose} />}
    </Modal>
  );
}

const PAYER_OPTIONS: { value: PayerKind; label: string }[] = [
  { value: 'tenant', label: 'Tenant share' },
  { value: 'council_hb', label: 'Council (HB)' },
  { value: 'dwp_uc', label: 'DWP (UC)' },
  { value: 'other_third_party', label: 'Other third party' },
];

function AddForm({ onDone }: { onDone: () => void }) {
  const confirm = useConfirmAction();
  const add = useAddPayerAccount();
  const landlords = useLandlords('');
  const [linkTo, setLinkTo] = useState<'tenancy' | 'landlord'>('tenancy');
  const [tid, setTid] = useState('');
  const [landlordId, setLandlordId] = useState<string | null>(null);
  const [holderType, setHolderType] = useState<PayerAccountInput['holderType']>('tenant');
  const [holderName, setHolderName] = useState('');
  const [sortCode, setSortCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [payer, setPayer] = useState<PayerKind>('tenant');
  const [problem, setProblem] = useState<string | null>(null);
  const [shared, setShared] = useState(0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (linkTo === 'tenancy' && !/^[Tt]\d{3,6}$/.test(tid.trim())) return setProblem('Enter a tenancy ID such as T1234');
    if (linkTo === 'landlord' && !landlordId) return setProblem('Choose a landlord');
    if (!/^\d{2}[- ]?\d{2}[- ]?\d{2}$/.test(sortCode.trim())) return setProblem('Enter the sort code as 6 digits, e.g. 12-34-56');
    if (!/^\d{6,10}$/.test(accountNumber.replace(/\s/g, ''))) return setProblem('Enter the account number (6 to 10 digits)');
    setProblem(null);
    const input: PayerAccountInput = {
      ...(linkTo === 'tenancy' ? { tid: tid.trim() } : { landlordId: landlordId! }),
      sortCode: sortCode.trim(),
      accountNumber: accountNumber.trim(),
      holderType,
      holderName: holderName.trim() || null,
      payer,
    };
    confirm.ask({ title: 'Save this payer account?', message: 'Payments from this account will be matched to the chosen tenancy or landlord automatically.', confirmLabel: 'Save payer account' }, () =>
      add.mutate(input, {
        onSuccess: ({ payerAccount }) => {
          notifications.show({ color: 'teal', title: 'Payer account saved', message: `${payerAccount.account ?? 'Account'} is now known.` });
          if (payerAccount.sharedWith > 0) {
            setShared(payerAccount.sharedWith);
            setSortCode('');
            setAccountNumber('');
          } else {
            onDone();
          }
        },
      }),
    );
  };

  const message = problem ?? (add.isError ? errorMessage(add.error) : null);

  if (shared > 0) {
    return (
      <Stack gap="md">
        <Alert color="yellow">
          This account is also linked to {shared} other tenancy or landlord; matches from it will need review.
        </Alert>
        <Group justify="flex-end">
          <Button onClick={onDone}>Close</Button>
        </Group>
      </Stack>
    );
  }

  return (
    <form noValidate onSubmit={submit}>
      {confirm.dialog}
      <Stack gap="md">
        <NativeSelect
          label="Link to"
          value={linkTo}
          onChange={(e) => setLinkTo(e.currentTarget.value as 'tenancy' | 'landlord')}
          data={[
            { value: 'tenancy', label: 'Tenancy' },
            { value: 'landlord', label: 'Landlord' },
          ]}
        />
        {linkTo === 'tenancy' ? (
          <TextInput label="Tenancy ID" required value={tid} onChange={(e) => setTid(e.currentTarget.value)} data-autofocus />
        ) : (
          <Select
            label="Landlord"
            required
            searchable
            value={landlordId}
            onChange={setLandlordId}
            data={(landlords.data ?? []).map((l) => ({ value: l.id, label: l.name }))}
          />
        )}
        <NativeSelect
          label="Account holder"
          value={holderType}
          onChange={(e) => setHolderType(e.currentTarget.value as PayerAccountInput['holderType'])}
          data={[
            { value: 'tenant', label: 'Tenant' },
            { value: 'relative', label: 'Relative' },
            { value: 'landlord', label: 'Landlord' },
          ]}
        />
        <TextInput label="Holder name" value={holderName} onChange={(e) => setHolderName(e.currentTarget.value)} maxLength={100} />
        <TextInput label="Sort code" required autoComplete="off" value={sortCode} onChange={(e) => setSortCode(e.currentTarget.value)} />
        <TextInput
          label="Account number"
          required
          autoComplete="off"
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.currentTarget.value)}
          description="Stored as a one-way hash plus the last 4 digits."
        />
        <NativeSelect
          label="Pays for"
          value={payer}
          onChange={(e) => setPayer(e.currentTarget.value as PayerKind)}
          data={PAYER_OPTIONS}
        />
        {message && (
          <Alert color="red" role="alert">
            {message}
          </Alert>
        )}
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onDone} disabled={add.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={add.isPending}>
            Add payer account
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
