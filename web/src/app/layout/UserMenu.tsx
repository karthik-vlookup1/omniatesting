import {
  Avatar,
  Badge,
  Group,
  Menu,
  SegmentedControl,
  Stack,
  Text,
  UnstyledButton,
  useMantineColorScheme,
  type MantineColorScheme,
} from '@mantine/core';
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

/** Header account area: name + role badge (FRONTEND_REFERENCE.md §4), with a menu for the rest. */
export function UserMenu() {
  const user = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();
  const [passwordOpened, passwordModal] = useDisclosure(false);
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  const signOut = () =>
    logout.mutate(undefined, {
      onSuccess: () => navigate('/login', { replace: true }),
      onError: (err) => notifications.show({ color: 'red', title: 'Could not sign out', message: errorMessage(err) }),
    });

  return (
    <>
      <Group gap="sm" wrap="nowrap">
        {/* Sits on the navy top bar (AppLayout), so it uses the top-bar colours. */}
        <Badge
          visibleFrom="sm"
          variant="outline"
          color={user.role === 'readonly' ? 'gray.4' : 'ember.4'}
          styles={{ root: { color: 'var(--app-topbar-fg)' } }}
        >
          {ROLE_LABEL[user.role]}
        </Badge>
        <Menu position="bottom-end" width={280} shadow="md" withinPortal>
          <Menu.Target>
            <UnstyledButton
              aria-label={`Account menu for ${user.fullName}`}
              px={6}
              py={4}
              style={{ borderRadius: 6, color: 'var(--app-topbar-fg)' }}
            >
              <Group gap="xs" wrap="nowrap">
                <Avatar size={30} radius="xl" color="ember.7" variant="filled" aria-hidden>
                  {initials(user.fullName)}
                </Avatar>
                <Text fz="sm" fw={600} truncate maw={180} visibleFrom="xs" data-testid="current-user">
                  {user.fullName}
                </Text>
                <IconChevronDown size={14} stroke={2} aria-hidden />
              </Group>
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Stack gap={2} px="sm" py="xs">
              <Text fz="sm" fw={600} truncate>
                {user.fullName}
              </Text>
              <Text fz="xs" c="dimmed" truncate>
                {user.email}
              </Text>
            </Stack>
            <Menu.Divider />
            <Menu.Label>Appearance</Menu.Label>
            <Stack px="sm" pb="xs">
              <SegmentedControl
                size="xs"
                fullWidth
                aria-label="Colour scheme"
                value={colorScheme}
                onChange={(v) => setColorScheme(v as MantineColorScheme)}
                data={[
                  { label: 'Light', value: 'light' },
                  { label: 'Dark', value: 'dark' },
                  { label: 'Auto', value: 'auto' },
                ]}
              />
            </Stack>
            <Menu.Divider />
            <Menu.Item leftSection={<IconKey size={16} aria-hidden />} onClick={passwordModal.open}>
              Change password
            </Menu.Item>
            <Menu.Item color="red" leftSection={<IconLogout size={16} aria-hidden />} onClick={signOut} disabled={logout.isPending}>
              Sign out
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      <ChangePasswordModal opened={passwordOpened} onClose={passwordModal.close} />
    </>
  );
}
