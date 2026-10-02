import { Anchor, Card, Grid, Group, List, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import {
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
import { ROLE_LABEL, can, useCurrentUser, type Capability } from '../../data/auth';

interface Stage {
  title: string;
  description: string;
  icon: Icon;
  /** Set once the screen for this stage exists. */
  to?: string;
}

/** The reconciliation workflow, in the order work flows through it (docs/FRONTEND.md §1). */
const STAGES: Stage[] = [
  {
    title: 'Upload bank statements',
    description: 'Import each bank CSV once. The same file twice is rejected and overlapping lines are skipped.',
    icon: IconFileUpload,
  },
  {
    title: 'Automatic matching',
    description: 'Every line is matched to a tenancy by TID, NI number, known payer account or a learned rule.',
    icon: IconArrowsExchange,
  },
  {
    title: 'Review queue',
    description: 'Confirm uncertain matches, pick the right tenancy, and clear lines marked “Yet to take”.',
    icon: IconListCheck,
  },
  {
    title: 'Receipts and allocation',
    description: 'Confirmed payments become receipts, allocated to the oldest arrears first for each payer.',
    icon: IconReceipt,
  },
  {
    title: 'Outputs',
    description: 'The filled-in bank statement, the Vico upload file and Xero draft invoices.',
    icon: IconFileExport,
  },
];

const ACCESS: { capability: Capability; allowed: string; denied: string }[] = [
  { capability: 'write', allowed: 'Change data: confirm matches, record and reverse receipts', denied: 'View only: you cannot change data' },
  { capability: 'viewFullNi', allowed: 'See full NI numbers where the system provides them', denied: 'NI numbers are shown masked (last 3 characters)' },
  { capability: 'manageUsers', allowed: 'Manage user accounts and roles', denied: 'User administration is limited to admins' },
];

export function HomePage() {
  useDocumentTitle('Overview · Omnia Recon');
  const user = useCurrentUser();
  const firstName = user.fullName.split(/\s+/)[0] ?? user.fullName;

  return (
    <>
      <PageHeader title="Overview" description={`Welcome back, ${firstName}. This is the rent reconciliation workflow and where each stage stands.`} />

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Card padding={0}>
            <Group px="lg" py="md" justify="space-between" style={{ borderBottom: '1px solid var(--app-border)' }}>
              <Title order={2} fz="md">
                Reconciliation workflow
              </Title>
            </Group>
            <Stack gap={0} component="ol" m={0} p={0} style={{ listStyle: 'none' }}>
              {STAGES.map((stage, i) => (
                <Group
                  key={stage.title}
                  component="li"
                  px="lg"
                  py="md"
                  gap="md"
                  wrap="nowrap"
                  align="flex-start"
                  style={{ borderTop: i === 0 ? undefined : '1px solid var(--mantine-color-slate-1)' }}
                >
                  <ThemeIcon variant="light" color="brand" size={34} radius="md" aria-hidden>
                    <stage.icon size={18} stroke={1.75} />
                  </ThemeIcon>
                  <Stack gap={2} style={{ flex: 1 }} miw={0}>
                    <Group gap="xs" wrap="wrap">
                      <Text fz="xs" c="slate.6" className="tabular">
                        Step {i + 1}
                      </Text>
                      {stage.to ? (
                        <Anchor component={Link} to={stage.to} fw={600} fz="sm">
                          {stage.title}
                        </Anchor>
                      ) : (
                        <Text fw={600} fz="sm">
                          {stage.title}
                        </Text>
                      )}
                    </Group>
                    <Text fz="sm" c="slate.7">
                      {stage.description}
                    </Text>
                  </Stack>
                  {stage.to ? (
                    <StatusBadge tone="success" label="Available" />
                  ) : (
                    <StatusBadge tone="neutral" label="Not available yet" />
                  )}
                </Group>
              ))}
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
                <Text fz="sm" c="slate.6">
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
                        <ThemeIcon size={20} radius="xl" variant="light" color={allowed ? 'teal' : 'slate'} aria-hidden>
                          {allowed ? <IconCheck size={13} /> : <IconMinus size={13} />}
                        </ThemeIcon>
                      }
                    >
                      <Text fz="sm" c={allowed ? 'slate.9' : 'slate.6'}>
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
