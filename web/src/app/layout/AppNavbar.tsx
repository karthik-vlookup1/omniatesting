import { Box, Group, NavLink, ScrollArea, Stack, Text } from '@mantine/core';
import { Link, useLocation } from 'react-router-dom';
import { can, useSession } from '../../data/auth';
import { MODULES, isItemActive, moduleForPath } from '../navigation';

/**
 * Left "Sections" menu: every module's pages, grouped under the module name (LetMC's left panel
 * lists the current area's pages; Recon keeps all groups visible so any page is one click away).
 * The current module's heading carries the orange accent.
 */
export function AppNavbar() {
  const { data: user } = useSession();
  const { pathname } = useLocation();
  const current = moduleForPath(pathname);

  return (
    <ScrollArea type="hover" style={{ flex: 1 }} scrollbarSize={6}>
      <Stack gap="lg" component="nav" aria-label="Sections" py="xs">
        {MODULES.map((m) => {
          const items = m.items.filter((item) => !item.capability || can(user, item.capability));
          if (items.length === 0) return null;
          const isCurrent = current?.key === m.key;
          return (
            <Stack key={m.key} gap={2}>
              <Group gap={8} px="sm" pb={4} wrap="nowrap">
                <Box
                  w={3}
                  h={14}
                  style={{ borderRadius: 2, background: isCurrent ? 'var(--app-accent)' : 'var(--app-border)' }}
                  aria-hidden
                />
                <Text fz="xs" fw={700} c={isCurrent ? undefined : 'dimmed'} tt="uppercase" style={{ letterSpacing: '0.06em' }}>
                  {m.label}
                </Text>
              </Group>
              {items.map((item) => {
                const active = isItemActive(item, pathname);
                return (
                  <NavLink
                    key={item.to}
                    component={Link}
                    to={item.to}
                    label={item.label}
                    leftSection={<item.icon size={18} stroke={1.75} aria-hidden />}
                    active={active}
                    aria-current={active ? 'page' : undefined}
                    styles={{
                      root: { borderRadius: 'var(--mantine-radius-sm)', paddingBlock: 7 },
                      label: { fontWeight: active ? 650 : 500 },
                    }}
                  />
                );
              })}
            </Stack>
          );
        })}
      </Stack>
    </ScrollArea>
  );
}
