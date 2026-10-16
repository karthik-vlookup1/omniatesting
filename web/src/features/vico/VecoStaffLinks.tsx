import { Alert, Button, Card, Checkbox, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { ErrorState, LoadingState } from '../../components';
import { errorMessage } from '../../lib/api';
import { useSaveVecoStaffLink, useVecoStaffLinks, type StaffLinkRow } from './vecoPushApi';

/** Admin: which VECO user each Omnia Recon user pushes as, and who may push. */
export function VecoStaffLinks() {
  const links = useVecoStaffLinks();
  return (
    <Card>
      <Stack gap="sm">
        <Title order={2} fz="md">
          VECO users
        </Title>
        <Text size="xs" c="dimmed">
          A push is made under the VECO user linked here. An e-mail match creates a link without push permission; tick
          Can push for the people who import receipts today.
        </Text>
        <Table aria-label="VECO users">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>User</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>VECO StaffPK</Table.Th>
              <Table.Th>Can push</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {links.data?.map((l) => <LinkRow key={l.userId} link={l} />)}
          </Table.Tbody>
        </Table>
        {links.isPending && <LoadingState variant="skeleton" rows={2} label="Loading VECO users…" />}
        {links.isError && <ErrorState error={links.error} title="Could not load VECO users" onRetry={() => void links.refetch()} />}
      </Stack>
    </Card>
  );
}

function LinkRow({ link }: { link: StaffLinkRow }) {
  const save = useSaveVecoStaffLink();
  const [staffFk, setStaffFk] = useState(link.staffFk ?? '');
  const [canPush, setCanPush] = useState(link.canPush);
  return (
    <Table.Tr>
      <Table.Td>{link.fullName}</Table.Td>
      <Table.Td>{link.email}</Table.Td>
      <Table.Td>
        <TextInput
          size="xs"
          aria-label={`VECO StaffPK for ${link.fullName}`}
          placeholder="Not linked"
          value={staffFk}
          onChange={(e) => setStaffFk(e.currentTarget.value)}
        />
        {save.isError && (
          <Alert color="red" role="alert" mt={4} p="xs">
            {errorMessage(save.error)}
          </Alert>
        )}
      </Table.Td>
      <Table.Td>
        <Checkbox
          aria-label={`Can push: ${link.fullName}`}
          checked={canPush}
          disabled={staffFk.trim() === ''}
          onChange={(e) => setCanPush(e.currentTarget.checked)}
        />
      </Table.Td>
      <Table.Td>
        <Button
          size="xs"
          variant="light"
          loading={save.isPending}
          onClick={() => save.mutate({ userId: link.userId, staffFk: staffFk.trim() === '' ? null : staffFk.trim(), canPush })}
        >
          Save
        </Button>
      </Table.Td>
    </Table.Tr>
  );
}
