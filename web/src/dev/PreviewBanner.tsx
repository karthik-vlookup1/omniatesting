import { Badge, Box, Code, Group, Popover, Table, Text, UnstyledButton } from '@mantine/core';
import { IconChevronUp, IconFlask } from '@tabler/icons-react';
import { ROLE_LABEL } from '../data/auth/types';
import { PREVIEW_ACCOUNTS, PREVIEW_PASSWORD } from './previewApi';

/** Always visible in preview mode so nobody mistakes it for the real system. */
export function PreviewBanner() {
  return (
    <Box
      pos="fixed"
      bottom={12}
      left="50%"
      style={{ transform: 'translateX(-50%)', zIndex: 1000 }}
      data-print-hidden
    >
      <Popover position="top" width={360} shadow="lg" withArrow>
        <Popover.Target>
          <UnstyledButton
            aria-label="Preview mode: no backend connected. Show sample accounts"
            bg="orange.7"
            c="white"
            px="md"
            py={6}
            style={{ borderRadius: 999, boxShadow: 'var(--mantine-shadow-md)' }}
          >
            <Group gap={8} wrap="nowrap">
              <IconFlask size={15} aria-hidden />
              <Text fz="xs" fw={600}>
                Preview mode · no backend · sample accounts
              </Text>
              <IconChevronUp size={14} aria-hidden />
            </Group>
          </UnstyledButton>
        </Popover.Target>
        <Popover.Dropdown>
          <Text fz="sm" fw={600} mb={4}>
            Sample accounts
          </Text>
          <Text fz="xs" c="dimmed" mb="sm">
            Password for every account: <Code>{PREVIEW_PASSWORD}</Code>. Only sign-in and the account
            menu work: they imitate the real <Code>/api/auth</Code> endpoints. Nothing is saved.
          </Text>
          <Table fz="xs" verticalSpacing={4} withRowBorders={false}>
            <Table.Tbody>
              {PREVIEW_ACCOUNTS.map((a) => (
                <Table.Tr key={a.id}>
                  <Table.Td>
                    <Code>{a.email}</Code>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="light" color={a.role === 'readonly' ? 'slate' : 'blue'}>
                      {ROLE_LABEL[a.role]}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Popover.Dropdown>
      </Popover>
    </Box>
  );
}
