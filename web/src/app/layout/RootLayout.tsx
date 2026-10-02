import { Outlet } from 'react-router-dom';
import { useSessionExpiry } from '../../features/auth/useSessionExpiry';

/** Wraps every route: wires the global "session expired" handler, which needs the router. */
export function RootLayout() {
  useSessionExpiry();
  return <Outlet />;
}
