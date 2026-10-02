import { NavLink, ScrollArea, Stack, Text } from '@mantine/core';
import { Link, useLocation } from 'react-router-dom';
import { can, useSession } from '../../data/auth';
import { NAV_SECTIONS, type NavItem } from '../navigation';

function isActive(item: NavItem, pathname: string): boolean {
  if (item.to === '/') return pathname === '/';
  return item.matchPrefix ? pathname === item.to || pathname.startsWith(`${item.to}/`) : pathname === item.to;
}

export function AppNavbar() {
  const { data: user } = useSession();
  const { pathname } = useLocation();

  return (
    <ScrollArea type="never" style={{ flex: 1 }}>
      <Stack gap="md" component="nav" aria-label="Sections">
        {NAV_SECTIONS.map((section, i) => {
          const items = section.items.filter((item) => !item.capability || can(user, item.capability));
          if (items.length === 0) return null;
          return (
            <Stack key={section.label ?? i} gap={2}>
              {section.label && (
                <Text fz="xs" fw={600} c="slate.6" tt="uppercase" px="sm" pb={4} style={{ letterSpacing: '0.05em' }}>
                  {section.label}
                </Text>
              )}
              {items.map((item) => {
                const active = isActive(item, pathname);
                return (
                  <NavLink
                    key={item.to}
                    component={Link}
                    to={item.to}
                    label={item.label}
                    leftSection={<item.icon size={18} stroke={1.75} aria-hidden />}
                    active={active}
                    aria-current={active ? 'page' : undefined}
                    styles={{ root: { borderRadius: 'var(--mantine-radius-sm)' }, label: { fontWeight: active ? 600 : 500 } }}
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
