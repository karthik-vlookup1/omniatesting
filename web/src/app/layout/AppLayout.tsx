import { Anchor, AppShell, Box, Burger, Group, Progress, Text, ThemeIcon, UnstyledButton, useMantineTheme } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChecks } from '@tabler/icons-react';
import { useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigation } from 'react-router-dom';
import { AppNavbar } from './AppNavbar';
import { UserMenu } from './UserMenu';

export function AppLayout() {
  const theme = useMantineTheme();
  const [navOpened, { toggle: toggleNav, close: closeNav }] = useDisclosure(false);
  const navigation = useNavigation();
  const location = useLocation();

  // On small screens the drawer closes after choosing a page.
  useEffect(() => closeNav(), [location.pathname, closeNav]);

  return (
    <AppShell
      header={{ height: theme.other.headerHeight as number }}
      navbar={{ width: theme.other.navbarWidth as number, breakpoint: 'sm', collapsed: { mobile: !navOpened } }}
      padding="lg"
      styles={{ main: { background: 'var(--app-surface)' } }}
    >
      <Anchor
        href="#main-content"
        pos="absolute"
        top={-48}
        left={8}
        px="sm"
        py={6}
        bg="white"
        style={{ zIndex: 1000, borderRadius: 4 }}
        onFocus={(e) => (e.currentTarget.style.top = '8px')}
        onBlur={(e) => (e.currentTarget.style.top = '-48px')}
      >
        Skip to main content
      </Anchor>

      <AppShell.Header withBorder>
        {navigation.state === 'loading' && (
          <Progress value={100} animated size={2} radius={0} pos="absolute" top={0} left={0} right={0} aria-label="Loading page" />
        )}
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={navOpened} onClick={toggleNav} hiddenFrom="sm" size="sm" aria-label="Toggle navigation" />
            <UnstyledButton component={Link} to="/" aria-label="Omnia Recon home" style={{ borderRadius: 4 }}>
              <Group gap="xs" wrap="nowrap">
                <ThemeIcon size={28} radius="md" aria-hidden>
                  <IconChecks size={18} />
                </ThemeIcon>
                <Text fw={650} fz="md" c="slate.9">
                  Omnia Recon
                </Text>
              </Group>
            </UnstyledButton>
          </Group>
          <UserMenu />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm" aria-label="Main navigation">
        <AppNavbar />
      </AppShell.Navbar>

      <AppShell.Main>
        <Box id="main-content" tabIndex={-1} maw={theme.other.contentMaxWidth as number} mx="auto" style={{ outline: 'none' }}>
          <Outlet />
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
