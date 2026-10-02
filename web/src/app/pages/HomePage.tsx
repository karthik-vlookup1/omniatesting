import { Anchor, Button, Card, Grid, Group, List, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import {
  IconArrowRight,
  IconArrowsExchange,
  IconCheck,
  IconFileExport,
  IconFileUpload,
  IconListCheck,
  IconMinus,
  IconReceipt,
  type Icon,
} from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { PageHeader, StatusBadge } from '../../components';
import { ROLE_LABEL, can, useCurrentUser, type AuthUser, type Capability } from '../../data/auth';
import { navItems } from '../navigation';

interface Stage {
  title: string;
  description: string;
  icon: Icon;
  /** The screen for this stage, once it is in the navigation. */
  path?: string;
  /** Stages the system does by itself have no screen of their own. */
  automatic?: boolean;
}

/** The reconciliation workflow, in the order work flows through it. */
const STAGES: Stage[] = [
  {
    title: 'Upload bank statements',
    description: 'Import each bank CSV once. The same file twice is rejected and overlapping lines are skipped.',
    icon: IconFileUpload,
    path: '/upload',
  },
  {
    title: 'Automatic matching',
    description: 'Each line is matched to a tenancy by TID, NI number, a remembered payer account or a reference rule.',
    icon: IconArrowsExchange,
    automatic: true,
  },
  {
    title: 'Review queue',
    description: 'Confirm uncertain matches, pick the right tenancy, and clear lines marked “Yet to take”.',
    icon: IconListCheck,
    path: '/review',
  },
  {
    title: 'Receipts',
    description: 'Confirmed payments become receipts with their Xero ledger code.',
    icon: IconReceipt,
    automatic: true,
  },
  {
    title: 'Vico and Xero',
    description: 'Confirmed receipts go to Vico as a file and to Xero as invoices, each exactly once.',
    icon: IconFileExport,
    path: '/vico',
  },
];

const ACCESS: { capability: Capability; allowed: string; denied: string }[] = [
  { capability: 'write', allowed: 'Upload statements and confirm, reject or exclude lines', denied: 'View only: you cannot change data' },
  { capability: 'viewFullNi', allowed: 'See full NI numbers', denied: 'NI numbers are shown masked' },
  { capability: 'manageUsers', allowed: 'Manage user accounts and roles', denied: 'User administration is limited to admins' },
];

function availablePaths(user: AuthUser): Set<string> {
  return new Set(navItems().filter((i) => !i.capability || can(user, i.capability)).map((i) => i.to));
}

/** FRONTEND_REFERENCE.md §6.7: a simple home page with links to Upload and Review until the dashboard. */
export function HomePage() {
  useDocumentTitle('Home · Omnia Recon');
  const user = useCurrentUser();
  const firstName = user.fullName.split(/\s+/)[0] ?? user.fullName;
  const paths = availablePaths(user);

  return (
    <>
      <PageHeader
        title="Home"
        description={`Welcome back, ${firstName}. Rent reconciliation, from bank statement to Vico and Xero.`}
        actions={
          <>
            {paths.has('/review') && (
              <Button component={Link} to="/review" variant="default" leftSection={<IconListCheck size={16} aria-hidden />}>
                Review queue
              </Button>
            )}
            {paths.has('/upload') && (
              <Button component={Link} to="/upload" leftSection={<IconFileUpload size={16} aria-hidden />}>
                Upload statement
              </Button>
            )}
          </>
        }
      />

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Card padding={0}>
            <Group px="lg" py="md" style={{ borderBottom: '1px solid var(--app-border)' }}>
              <Title order={2} fz="md">
                Reconciliation workflow
              </Title>
            </Group>
            <Stack gap={0} component="ol" m={0} p={0} style={{ listStyle: 'none' }}>
              {STAGES.map((stage, i) => {
                const available = stage.path ? paths.has(stage.path) : false;
                return (
                  <Group
                    key={stage.title}
                    component="li"
                    px="lg"
                    py="md"
                    gap="md"
                    wrap="nowrap"
                    align="flex-start"
                    style={{ borderTop: i === 0 ? undefined : '1px solid var(--app-border-subtle)' }}
                  >
                    <ThemeIcon variant="light" size={34} radius="md" aria-hidden>
                      <stage.icon size={18} stroke={1.75} />
                    </ThemeIcon>
                    <Stack gap={2} style={{ flex: 1 }} miw={0}>
                      <Group gap="xs" wrap="wrap">
                        <Text fz="xs" c="dimmed" className="tabular">
                          Step {i + 1}
                        </Text>
                        {available && stage.path ? (
                          <Anchor component={Link} to={stage.path} fw={600} fz="sm">
                            {stage.title}
                          </Anchor>
                        ) : (
                          <Text fw={600} fz="sm">
                            {stage.title}
                          </Text>
                        )}
                      </Group>
                      <Text fz="sm" c="dimmed">
                        {stage.description}
                      </Text>
                    </Stack>
                    {stage.automatic ? (
                      <StatusBadge tone="info" label="Automatic" icon={null} />
                    ) : available && stage.path ? (
                      <Button
                        component={Link}
                        to={stage.path}
                        size="xs"
                        variant="subtle"
                        rightSection={<IconArrowRight size={14} aria-hidden />}
                        aria-label={`Open ${stage.title}`}
                      >
                        Open
                      </Button>
                    ) : (
                      <StatusBadge tone="neutral" label="Not available yet" />
                    )}
                  </Group>
                );
              })}
            </Stack>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Card>
            <Stack gap="sm">
              <Title order={2} fz="md">
                Your access
              </Title>
              <Group gap="xs">
                <Text fz="sm" c="dimmed">
                  Signed in as
                </Text>
                <Text fz="sm" fw={600}>
                  {ROLE_LABEL[user.role]}
                </Text>
              </Group>
              <List spacing="xs" size="sm" center>
                {ACCESS.map((a) => {
                  const allowed = can(user, a.capability);
                  return (
                    <List.Item
                      key={a.capability}
                      icon={
                        <ThemeIcon size={20} radius="xl" variant="light" color={allowed ? 'teal' : 'gray'} aria-hidden>
                          {allowed ? <IconCheck size={13} /> : <IconMinus size={13} />}
                        </ThemeIcon>
                      }
                    >
                      <Text fz="sm" c={allowed ? undefined : 'dimmed'}>
                        {allowed ? a.allowed : a.denied}
                      </Text>
                    </List.Item>
                  );
                })}
              </List>
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>
    </>
  );
}
