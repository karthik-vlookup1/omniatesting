import { Alert, Stack, Table, Text } from '@mantine/core';
import type { VerifyResult } from './vecoPushApi';

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const money = (amount: string) => GBP.format(Number(amount));
const ukDate = (iso: string) => iso.split('-').reverse().join('/');

/** What VECO now holds for a push: before/after totals per bank, and a tick or cross for every receipt. */
export function CrossCheckView({ verify }: { verify: VerifyResult }) {
  const banks = [...new Set([...verify.before.byBank, ...verify.after.byBank].map((b) => b.bank))].sort();
  const find = (list: VerifyResult['before']['byBank'], bank: string) => list.find((b) => b.bank === bank);
  return (
    <Stack gap="sm">
      <Alert color={verify.ok ? 'green' : 'red'} role="status" title={verify.ok ? 'Matches VECO' : 'Differs from VECO'}>
        {verify.ok
          ? `All ${verify.rows.length} receipts match what Omnia Recon sent.`
          : `${verify.rows.filter((r) => !r.ok).length} of ${verify.rows.length} receipts differ from what Omnia Recon sent.`}
      </Alert>

      <Table aria-label="Totals before and after">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Bank</Table.Th>
            <Table.Th ta="right">Sent</Table.Th>
            <Table.Th ta="right">In VECO</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {banks.map((bank) => (
            <Table.Tr key={bank}>
              <Table.Td>{bank}</Table.Td>
              <Table.Td ta="right">
                {find(verify.before.byBank, bank)?.count ?? 0} · {money(find(verify.before.byBank, bank)?.total ?? '0')}
              </Table.Td>
              <Table.Td ta="right">
                {find(verify.after.byBank, bank)?.count ?? 0} · {money(find(verify.after.byBank, bank)?.total ?? '0')}
              </Table.Td>
            </Table.Tr>
          ))}
          <Table.Tr fw={600}>
            <Table.Td>Total</Table.Td>
            <Table.Td ta="right">
              {verify.before.count} · {money(verify.before.total)}
            </Table.Td>
            <Table.Td ta="right">
              {verify.after.count} · {money(verify.after.total)}
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>

      <Table striped aria-label="VECO read-back">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Check</Table.Th>
            <Table.Th>Date</Table.Th>
            <Table.Th>TID</Table.Th>
            <Table.Th>Tenant</Table.Th>
            <Table.Th>Property</Table.Th>
            <Table.Th>Landlord</Table.Th>
            <Table.Th>Department</Table.Th>
            <Table.Th ta="right">Amount</Table.Th>
            <Table.Th>Banking ref</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {verify.rows.map((r) => (
            <Table.Tr key={r.transactionPk}>
              <Table.Td>
                <span aria-label={r.ok ? 'matches' : 'differs'}>{r.ok ? '✅' : '❌'}</span>
                {!r.ok && (
                  <Text size="xs" c="red">
                    {r.diffs.join(', ')}
                  </Text>
                )}
              </Table.Td>
              <Table.Td>{ukDate(r.date)}</Table.Td>
              <Table.Td>{r.tid}</Table.Td>
              <Table.Td>{r.tenantName ?? '—'}</Table.Td>
              <Table.Td>{r.property ?? '—'}</Table.Td>
              <Table.Td>{r.landlord ?? '—'}</Table.Td>
              <Table.Td>{r.department ?? '—'}</Table.Td>
              <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {money(r.amount)}
              </Table.Td>
              <Table.Td>{r.bankingRef}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
