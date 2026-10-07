import { Group, Menu, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { Link, useLocation } from 'react-router-dom';
import { can, useSession } from '../../data/auth';
import { MODULES, isItemActive, moduleForPath } from '../navigation';

/**
 * LetMC's top menu (Dashboard · Diary · Inbox · … · Accounts · Office), reduced to the modules
 * Recon has. Each is a button that opens its pages; the current module carries the orange bar.
 * They are buttons (not links) so link names stay unique for the left Sections menu.
 */
export function TopModules() {
  const { data: user } = useSession();
  const { pathname } = useLocation();
  const current = moduleForPath(pathname);

  return (
    <Group gap={2} h="100%" wrap="nowrap" component="nav" aria-label="Modules" visibleFrom="sm">
      {MODULES.map((m) => {
        const items = m.items.filter((i) => !i.capability || can(user, i.capability));
        if (items.length === 0) return null;
        const active = current?.key === m.key;
        return (
          <Menu key={m.key} trigger="click-hover" openDelay={80} closeDelay={150} position="bottom-start" offset={0} shadow="lg" width={240} withinPortal>
            <Menu.Target>
              <UnstyledButton
                h="100%"
                px="md"
                aria-current={active ? 'true' : undefined}
                style={{
                  color: active ? '#fff' : 'var(--app-topbar-fg)',
                  background: active ? 'var(--app-topbar-hover)' : undefined,
                  boxShadow: active ? 'inset 0 -3px 0 var(--app-accent)' : undefined,
                }}
              >
                <Group gap={6} wrap="nowrap">
                  <m.icon size={17} stroke={1.75} aria-hidden />
                  <Text fz="sm" fw={active ? 650 : 500}>
                    {m.label}
                  </Text>
                  <IconChevronDown size={13} stroke={2} style={{ opacity: 0.7 }} aria-hidden />
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{m.label}</Menu.Label>
              {items.map((i) => {
                const here = isItemActive(i, pathname);
                return (
                  <Menu.Item
                    key={i.to}
                    component={Link}
                    to={i.to}
                    leftSection={<i.icon size={16} stroke={1.75} aria-hidden />}
                    fw={here ? 650 : undefined}
                    c={here ? 'navy.8' : undefined}
                  >
                    {i.label}
                  </Menu.Item>
                );
              })}
            </Menu.Dropdown>
          </Menu>
        );
      })}
    </Group>
  );
}
