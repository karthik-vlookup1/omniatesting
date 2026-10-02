import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

/**
 * Last-resort boundary for errors thrown while rendering or loading a route. The most common cause
 * in production is a page chunk that no longer exists after a deploy, which a reload fixes.
 */
export function RouteErrorPage() {
  const error = useRouteError();
  const chunkFailed =
    error instanceof Error && /dynamically imported module|Importing a module script failed|Loading chunk/i.test(error.message);
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <Center mih="100dvh" p="lg">
      <Stack maw={460} gap="sm" ta="center" align="center" role="alert">
        <Title order={1}>{notFound ? 'Page not found' : chunkFailed ? 'Omnia Recon has been updated' : 'Something went wrong'}</Title>
        <Text c="dimmed" fz="sm">
          {chunkFailed
            ? 'A newer version is available. Reload the page to continue.'
            : 'This page could not be displayed. Reloading usually fixes it. If it keeps happening, tell an administrator what you were doing.'}
        </Text>
        <Button mt="sm" leftSection={<IconRefresh size={16} aria-hidden />} onClick={() => window.location.reload()}>
          Reload page
        </Button>
      </Stack>
    </Center>
  );
}
