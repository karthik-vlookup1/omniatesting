import { Alert, Anchor, Badge, Button, Group, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { errorMessage } from '../../lib/api';
import {
  gbp,
  paymentCsvUrl,
  PAYMENT_STATUS_LABELS,
  poundsToPence,
  useAgentosTenants,
  useCreatePayment,
  useCreatePaymentExport,
  useMarkPaymentPosted,
  usePaymentOptions,
  usePayments,
  useTenantLedger,
  type PaymentExport,
} from './api';

const COLOUR = { not_exported: 'gray', exported: 'blue', posted: 'green' } as const;
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

/** `writer` here means "may post payments": accounts and admin only (the server returns 403 for anyone else). */
export function TakePaymentSection({ writer }: { writer: boolean }) {
  const payments = usePayments();
  const tenants = useAgentosTenants();
  const options = usePaymentOptions();
  const create = useCreatePayment();
  const createExport = useCreatePaymentExport();
  const posted = useMarkPaymentPosted();
  const [tid, setTid] = useState<string | null>(null);
  const [deposit, setDeposit] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [requestId, setRequestId] = useState(() => globalThis.crypto.randomUUID());
  const [exported, setExported] = useState<PaymentExport | null>(null);
  const ledger = useTenantLedger(tid);

  const tenant = (tenants.data ?? []).find((t) => t.tid === tid) ?? null;
  const typeOptions = (options.data?.paymentTypes ?? []).map((t) => ({ value: t.code, label: t.label }));
  const depositOptions = (options.data?.depositAccounts ?? []).map((a) => ({ value: a.code, label: a.label }));
  const typeValue = type ?? typeOptions[0]?.value ?? null;
  const depositValue = deposit ?? depositOptions[0]?.value ?? null;

  const pence = AMOUNT_RE.test(amount.trim()) ? poundsToPence(amount) : null;
  const authOk = authCode.trim() === '' || /^[A-Za-z0-9]{1,20}$/.test(authCode.trim());
  const rows = payments.data ?? [];
  const pending = rows.filter((p) => p.postingStatus === 'not_exported').length;

  const submit = () => {
    if (tenant === null || depositValue === null || typeValue === null || pence === null || pence <= 0 || !authOk) return;
    const code = authCode.trim();
    create.mutate(
      {
        clientRequestId: requestId,
        agentosTenantId: tenant.id,
        depositAccountCode: depositValue,
        paymentType: typeValue,
        amountPence: pence,
        description: description.trim(),
        ...(code === '' ? {} : { cardAuthCode: code }),
      },
      {
        onSuccess: () => {
          setAmount('');
          setDescription('');
          setAuthCode('');
          setRequestId(globalThis.crypto.randomUUID());
        },
      },
    );
  };
  const ready = tenant !== null && depositValue !== null && typeValue !== null && pence !== null && pence > 0 && authOk;

  return (
    <Stack gap="md">
      <Title order={3}>Take a Payment</Title>
      {writer && (
        <Stack gap="xs">
          <Group align="flex-end">
            <Select
              label="Tenant"
              searchable
              data={(tenants.data ?? []).map((t) => ({ value: t.tid, label: t.name }))}
              value={tid}
              onChange={setTid}
              w={280}
            />
            <TextInput label="Payment From" readOnly value={tenant?.name ?? ''} w={280} />
            <div>
              <Text size="sm" fw={500}>
                Omnia ledger balance
              </Text>
              <Text data-testid="ledger-balance" h={36} lh="36px">
                {tid === null ? '' : ledger.data ? gbp(ledger.data.balancePence) : ledger.isError ? 'Unavailable' : '...'}
              </Text>
            </div>
          </Group>
          <Group align="flex-end">
            <Select label="Will deposit to" data={depositOptions} value={depositValue} onChange={setDeposit} allowDeselect={false} w={240} />
            <Select label="Type" data={typeOptions} value={typeValue} onChange={setType} allowDeselect={false} w={160} />
            <TextInput
              label="Amount (£)"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.currentTarget.value)}
              error={amount !== '' && pence === null ? 'Enter an amount with up to 2 decimal places' : undefined}
              w={140}
            />
          </Group>
          <Group align="flex-end">
            <TextInput label="Description" value={description} onChange={(e) => setDescription(e.currentTarget.value)} w={280} />
            <TextInput
              label="Card authorisation code"
              value={authCode}
              onChange={(e) => setAuthCode(e.currentTarget.value)}
              error={authOk ? undefined : '1-20 letters or digits'}
              w={220}
            />
            <Button onClick={submit} disabled={!ready} loading={create.isPending}>
              Take payment
            </Button>
          </Group>
          {create.isError && (
            <Alert color="red" role="alert">
              {errorMessage(create.error)}
            </Alert>
          )}
          <Group align="center">
            <Button
              onClick={() => createExport.mutate(undefined, { onSuccess: (e) => setExported(e) })}
              disabled={pending === 0}
              loading={createExport.isPending}
            >
              Export payments ({pending})
            </Button>
          </Group>
          {createExport.isError && (
            <Alert color="red" role="alert">
              {errorMessage(createExport.error)}
            </Alert>
          )}
          {posted.isError && (
            <Alert color="red" role="alert">
              {errorMessage(posted.error)}
            </Alert>
          )}
          {exported && (
            <Alert color="green" role="status">
              Exported {exported.rowsTotal} payment(s){' '}
              <Anchor href={paymentCsvUrl(exported.id)} download>
                Download payments CSV
              </Anchor>
            </Alert>
          )}
        </Stack>
      )}
      {payments.isError && (
        <Alert color="red" role="alert">
          {errorMessage(payments.error)}
        </Alert>
      )}
      {rows.length === 0 ? (
        <Text c="dimmed">No payments yet</Text>
      ) : (
        <Table.ScrollContainer minWidth={900}>
          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Created</Table.Th>
                <Table.Th>Payment From</Table.Th>
                <Table.Th>Deposit to</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Amount</Table.Th>
                <Table.Th>Description</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((p) => (
                <Table.Tr key={p.id} data-testid={`payment-${p.id}`}>
                  <Table.Td>{p.createdAt.slice(0, 10)}</Table.Td>
                  <Table.Td>{p.paymentFrom}</Table.Td>
                  <Table.Td>{p.depositTo}</Table.Td>
                  <Table.Td>{p.paymentType}</Table.Td>
                  <Table.Td>{gbp(p.amountPence)}</Table.Td>
                  <Table.Td>{p.description}</Table.Td>
                  <Table.Td>
                    <Badge color={COLOUR[p.postingStatus]} variant="light">
                      {PAYMENT_STATUS_LABELS[p.postingStatus]}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {writer && p.postingStatus === 'exported' && (
                      <Button size="xs" variant="light" onClick={() => posted.mutate(p.id)}>
                        Mark posted
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}
