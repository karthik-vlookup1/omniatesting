import { Badge, Button, Group, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { errorMessage } from '../../lib/api';
import { gbp, POSTING_LABELS, STATUS_LABELS, useMarkPosted, type IntakeLine, type MatchStatus } from './api';

const COLOUR: Record<MatchStatus, string> = {
  matched: 'green',
  name_mismatch: 'orange',
  deposit_mismatch: 'orange',
  unmatched: 'red',
};

export interface LinesTableProps {
  lines: IntakeLine[];
  writer: boolean;
  onReassign: (line: IntakeLine) => void;
}

export function LinesTable({ lines, writer, onReassign }: LinesTableProps) {
  const posted = useMarkPosted();
  if (lines.length === 0) return <Text c="dimmed">No lines with this status</Text>;

  const markPosted = (l: IntakeLine) =>
    posted.mutate(l.id, {
      onError: (err) => notifications.show({ color: 'red', title: `Line ${l.lineNo} not marked posted`, message: errorMessage(err) }),
    });

  return (
    <Table.ScrollContainer minWidth={900}>
      <Table striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Line</Table.Th>
            <Table.Th>Date</Table.Th>
            <Table.Th>TID</Table.Th>
            <Table.Th>Payer</Table.Th>
            <Table.Th>Amount</Table.Th>
            <Table.Th>Deposit to</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Posting</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {lines.map((l) => (
            <Table.Tr key={l.id} data-testid={`line-${l.lineNo}`}>
              <Table.Td>{l.lineNo}</Table.Td>
              <Table.Td>{l.receivedOn}</Table.Td>
              <Table.Td>{l.tid ?? ''}</Table.Td>
              <Table.Td>{l.payerName}</Table.Td>
              <Table.Td>{gbp(l.amountPence)}</Table.Td>
              <Table.Td>{l.depositTo}</Table.Td>
              <Table.Td>
                <Badge color={COLOUR[l.matchStatus]} variant="light">
                  {STATUS_LABELS[l.matchStatus]}
                </Badge>
              </Table.Td>
              <Table.Td>{POSTING_LABELS[l.postingStatus]}</Table.Td>
              <Table.Td>
                {writer && (
                  <Group gap="xs" wrap="nowrap">
                    {(l.postingStatus === 'not_ready' || l.postingStatus === 'ready') && (
                      <Button size="compact-xs" variant="default" onClick={() => onReassign(l)}>
                        Reassign TID
                      </Button>
                    )}
                    {l.postingStatus === 'exported' && (
                      <Button
                        size="compact-xs"
                        variant="default"
                        loading={posted.isPending && posted.variables === l.id}
                        onClick={() => markPosted(l)}
                      >
                        Mark posted
                      </Button>
                    )}
                  </Group>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
