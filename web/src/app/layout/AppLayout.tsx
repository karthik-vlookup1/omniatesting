import { Anchor, AppShell, Box, Burger, Group, Progress, Text, ThemeIcon, UnstyledButton, useMantineTheme } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChecks } from '@tabler/icons-react';
import { useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigation } from 'react-router-dom';
import { RecordTabsProvider } from '../../lib/RecordTabsProvider';
import { isRecordPath } from '../navigation';
import { AppNavbar } from './AppNavbar';
import { GlobalSearch } from './GlobalSearch';
import { RecordTabs } from './RecordTabs';
import { TopModules } from './TopModules';
import { UserMenu } from './UserMenu';

/**
 * LetMC-style frame (plans/recon-601.md "Layout"):
 *   1. navy top bar — brand, module menus, account menu;
 *   2. dark search strip — global tenancy search and the open-record tabs;
 *   3. left Sections menu — hidden on tenant record pages, which bring their own record menu.
 */
export function AppLayout() {
  return (
    <RecordTabsProvider>
      <Frame />
    </RecordTabsProvider>
  );
}

function Frame() {
  const theme = useMantineTheme();
  const [navOpened, { toggle: toggleNav, close: closeNav }] = useDisclosure(false);
  const navigation = useNavigation();
  const location = useLocation();
  const recordPage = isRecordPath(location.pathname);
  const topBar = theme.other.topBarHeight as number;
  const strip = theme.other.searchStripHeight as number;

  // On small screens the drawer closes after choosing a page.
  useEffect(() => closeNav(), [location.pathname, closeNav]);

  return (
    <AppShell
      header={{ height: topBar + strip }}
      navbar={{
        width: theme.other.navbarWidth as number,
        breakpoint: 'sm',
        collapsed: { mobile: !navOpened, desktop: recordPage },
      }}
      padding={recordPage ? 0 : 'lg'}
      styles={{ main: { background: 'var(--app-surface)' } }}
    >
      <Anchor
        href="#main-content"
        pos="absolute"
        top={-48}
        left={8}
        px="sm"
        py={6}
        bg="var(--mantine-color-body)"
        style={{ zIndex: 1000, borderRadius: 4 }}
        onFocus={(e) => (e.currentTarget.style.top = '8px')}
        onBlur={(e) => (e.currentTarget.style.top = '-48px')}
      >
        Skip to main content
      </Anchor>

      <AppShell.Header withBorder={false} style={{ background: 'var(--app-topbar-bg)' }}>
        {navigation.state === 'loading' && (
          <Progress value={100} animated size={2} radius={0} color="ember" pos="absolute" top={0} left={0} right={0} aria-label="Loading page" />
        )}

        <Group h={topBar} pl="md" pr="sm" justify="space-between" wrap="nowrap" gap="md">
          <Group gap="lg" h="100%" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
              <Burger
                opened={navOpened}
                onClick={toggleNav}
                hiddenFrom="sm"
                size="sm"
                color="var(--app-topbar-fg)"
                aria-label="Toggle navigation"
              />
              <UnstyledButton component={Link} to="/" aria-label="Omnia Recon home" style={{ borderRadius: 6 }}>
                <Group gap={10} wrap="nowrap">
                  <ThemeIcon size={30} radius="md" color="ember.7" aria-hidden>
                    <IconChecks size={19} stroke={2.25} />
                  </ThemeIcon>
                  <Text fw={700} fz="md" c="#fff" style={{ letterSpacing: '-0.01em' }}>
                    Omnia Recon
                  </Text>
                </Group>
              </UnstyledButton>
            </Group>
            <TopModules />
          </Group>
          <UserMenu />
        </Group>

        <Group
          h={strip}
          px="md"
          gap="md"
          wrap="nowrap"
          style={{ background: 'var(--app-strip-bg)', borderBottom: '1px solid var(--app-strip-border)' }}
          data-print-hidden
        >
          <GlobalSearch />
          <RecordTabs />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm" aria-label="Main navigation" data-print-hidden>
        <AppNavbar />
      </AppShell.Navbar>

      <AppShell.Main>
        <Box
          id="main-content"
          tabIndex={-1}
          maw={recordPage ? undefined : (theme.other.contentMaxWidth as number)}
          mx="auto"
          style={{ outline: 'none' }}
        >
          <Outlet />
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
