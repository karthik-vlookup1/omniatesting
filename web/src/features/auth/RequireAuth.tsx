import { Center, Stack } from '@mantine/core';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ErrorState, LoadingState } from '../../components';
import { CurrentUserContext, can, useCurrentUser, useSession, type Capability } from '../../data/auth';
import { loginPath } from './redirect';

/** Renders children only with a valid session; otherwise sends the user to sign in. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <LoadingState fullScreen label="Checking your session…" />;

  if (session.isError) {
    return (
      <Center mih="100dvh" p="lg">
        <Stack maw={480} w="100%">
          <ErrorState
            title="Cannot reach Omnia Recon"
            error={session.error}
            onRetry={() => void session.refetch()}
            retrying={session.isFetching}
          />
        </Stack>
      </Center>
    );
  }

  if (!session.data) {
    return <Navigate to={loginPath(location.pathname + location.search)} replace />;
  }
  return <CurrentUserContext.Provider value={session.data}>{children}</CurrentUserContext.Provider>;
}

/** Renders children only for users with `capability`; otherwise the `fallback` (a forbidden page). */
export function RequireCapability({
  capability,
  fallback,
  children,
}: {
  capability: Capability;
  fallback: ReactNode;
  children: ReactNode;
}) {
  const user = useCurrentUser();
  return <>{can(user, capability) ? children : fallback}</>;
}
