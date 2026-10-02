import { Center, Loader } from '@mantine/core';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useCurrentUser } from './useAuth';

/** Renders children for a signed-in user; otherwise sends them to /login and back afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useCurrentUser();
  const location = useLocation();

  if (me.isPending) {
    return (
      <Center mih="100vh">
        <Loader />
      </Center>
    );
  }
  if (!me.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}
