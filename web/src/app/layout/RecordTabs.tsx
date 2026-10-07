import { CloseButton, Group, ScrollArea, Text, UnstyledButton } from '@mantine/core';
import { IconUser } from '@tabler/icons-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useRecordTabs } from '../../lib/recordTabs';

/**
 * LetMC's open-record tabs ("Tenant 6568 Jason Mo ×", guide step 3), in the search strip.
 * Closing the tab you are on goes back to the next open record, or to the Tenancies list.
 */
export function RecordTabs() {
  const { tabs, close } = useRecordTabs();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  if (tabs.length === 0) return null;

  const activeTid = decodeURIComponent(pathname.match(/^\/tenancies\/([^/]+)/)?.[1] ?? '');

  const closeTab = (tid: string) => {
    const index = tabs.findIndex((t) => t.tid === tid);
    close(tid);
    if (tid !== activeTid) return;
    const next = tabs[index + 1] ?? tabs[index - 1];
    navigate(next ? `/tenancies/${encodeURIComponent(next.tid)}` : '/tenancies');
  };

  return (
    <ScrollArea type="never" style={{ flex: 1, minWidth: 0 }}>
      <Group gap={6} wrap="nowrap" component="nav" aria-label="Open records">
        {tabs.map((t) => {
          const active = t.tid === activeTid;
          return (
            <Group
              key={t.tid}
              gap={2}
              wrap="nowrap"
              pl={10}
              pr={4}
              h={30}
              style={{
                borderRadius: 6,
                background: active ? 'var(--mantine-color-white)' : 'var(--app-strip-field)',
                border: `1px solid ${active ? 'var(--mantine-color-white)' : 'var(--app-strip-border)'}`,
                boxShadow: active ? 'inset 0 -3px 0 var(--app-accent)' : undefined,
                flexShrink: 0,
              }}
            >
              <UnstyledButton
                component={Link}
                to={`/tenancies/${encodeURIComponent(t.tid)}`}
                aria-current={active ? 'page' : undefined}
                title={`Tenant ${t.label}`}
                style={{ borderRadius: 4 }}
              >
                <Group gap={6} wrap="nowrap">
                  <IconUser size={14} stroke={2} color={active ? 'var(--mantine-color-navy-8)' : 'var(--app-topbar-muted)'} aria-hidden />
                  <Text fz="xs" fw={600} maw={170} truncate c={active ? 'navy.9' : 'var(--app-topbar-fg)'}>
                    {t.label}
                  </Text>
                </Group>
              </UnstyledButton>
              <CloseButton
                size="sm"
                aria-label={`Close ${t.label}`}
                onClick={() => closeTab(t.tid)}
                c={active ? 'navy.8' : 'var(--app-topbar-muted)'}
                variant="transparent"
              />
            </Group>
          );
        })}
      </Group>
    </ScrollArea>
  );
}
