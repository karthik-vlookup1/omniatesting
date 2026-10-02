import { Avatar, Badge, Group, Menu, Stack, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconChevronDown, IconKey, IconLogout } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { ROLE_LABEL, useCurrentUser, useLogout } from '../../data/auth';
import { ChangePasswordModal } from '../../features/auth/ChangePasswordModal';
import { errorMessage } from '../../lib/api';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export function UserMenu() {
  const user = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();
  const [passwordOpened, passwordModal] = useDisclosure(false);

  const signOut = () =>
    logout.mutate(undefined, {
      onSuccess: () => navigate('/login', { replace: true }),
      onError: (err) =>
        notifications.show({ color: 'red', title: 'Could not sign out', message: errorMessage(err) }),
    });

  return (
    <>
      <Menu position="bottom-end" width={260} shadow="md" withinPortal>
        <Menu.Target>
          <UnstyledButton aria-label={`Account menu for ${user.fullName}`} px={6} py={4} style={{ borderRadius: 6 }}>
            <Group gap="xs" wrap="nowrap">
              <Avatar size={30} radius="xl" color="brand" aria-hidden>
                {initials(user.fullName)}
              </Avatar>
              <Stack gap={0} visibleFrom="xs">
                <Text fz="sm" fw={600} lh={1.2} truncate maw={180}>
                  {user.fullName}
                </Text>
                <Text fz="xs" c="slate.6" lh={1.2}>
                  {ROLE_LABEL[user.role]}
                </Text>
              </Stack>
              <IconChevronDown size={14} stroke={2} aria-hidden />
            </Group>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Stack gap={2} px="sm" py="xs">
            <Text fz="sm" fw={600} truncate>
              {user.fullName}
            </Text>
            <Text fz="xs" c="slate.6" truncate>
              {user.email}
            </Text>
            <Badge mt={4} size="sm" color={user.role === 'readonly' ? 'slate' : 'brand'} w="fit-content">
              {ROLE_LABEL[user.role]}
            </Badge>
          </Stack>
          <Menu.Divider />
          <Menu.Item leftSection={<IconKey size={16} aria-hidden />} onClick={passwordModal.open}>
            Change password
          </Menu.Item>
          <Menu.Item
            color="red"
            leftSection={<IconLogout size={16} aria-hidden />}
            onClick={signOut}
            disabled={logout.isPending}
          >
            Sign out
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <ChangePasswordModal opened={passwordOpened} onClose={passwordModal.close} />
    </>
  );
}
