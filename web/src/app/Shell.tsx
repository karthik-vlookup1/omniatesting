import { AppShell, Badge, Burger, Button, Group, NavLink, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconBuildingBank, IconFileExport, IconHome, IconListCheck, IconLogout, IconSettings, IconUpload, IconUsers } from '@tabler/icons-react';
import { Outlet, NavLink as RouterLink, useNavigate } from 'react-router-dom';
import { hasRole, useCurrentUser, useLogout } from '../features/auth/useAuth';
import { useOpenCount } from '../features/review/api';

/** Signed-in layout: header with the user and sign-out, a navbar, and the routed page. */
export function Shell() {
  const [opened, { toggle }] = useDisclosure();
  const { data: user } = useCurrentUser();
  const logoutMutation = useLogout();
  const navigate = useNavigate();
  const openCount = useOpenCount();

  const signOut = () => {
    logoutMutation.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) });
  };

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Toggle navigation" />
            <Title order={4}>Omnia Recon</Title>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <Text size="sm" visibleFrom="xs" data-testid="current-user">
              {user?.fullName}
            </Text>
            <Badge variant="light">{user?.role}</Badge>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconLogout size={16} />}
              onClick={signOut}
              loading={logoutMutation.isPending}
            >
              Sign out
            </Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        <NavLink component={RouterLink} to="/" end label="Home" leftSection={<IconHome size={16} />} />
        <NavLink component={RouterLink} to="/upload" label="Upload statement" leftSection={<IconUpload size={16} />} />
        <NavLink
          component={RouterLink}
          to="/review"
          label="Review queue"
          leftSection={<IconListCheck size={16} />}
          rightSection={
            openCount.data ? (
              <Badge size="sm" circle={openCount.data < 100} aria-label={`${openCount.data} lines to review`}>
                {openCount.data}
              </Badge>
            ) : null
          }
        />
        {hasRole(user?.role, 'accounts') && (
          <NavLink component={RouterLink} to="/vico" label="Vico export" leftSection={<IconFileExport size={16} />} />
        )}
        {hasRole(user?.role, 'accounts') && (
          <NavLink component={RouterLink} to="/xero" label="Xero" leftSection={<IconBuildingBank size={16} />} />
        )}
        <NavLink component={RouterLink} to="/tenancies" label="Tenancies" leftSection={<IconUsers size={16} />} />
        <NavLink component={RouterLink} to="/csv-profiles" label="CSV profiles" leftSection={<IconSettings size={16} />} />
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
