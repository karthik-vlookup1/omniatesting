import { Stack, Text, Title } from '@mantine/core';
import { useCurrentUser } from '../features/auth/useAuth';

/** Placeholder landing page until the dashboard (recon-401) exists. */
export function HomePage() {
  const { data: user } = useCurrentUser();
  return (
    <Stack>
      <Title order={2}>Welcome, {user?.fullName}</Title>
      <Text c="dimmed">You are signed in as {user?.role}.</Text>
    </Stack>
  );
}
