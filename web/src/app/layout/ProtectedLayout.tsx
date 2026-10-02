import { RequireAuth } from '../../features/auth/RequireAuth';
import { AppLayout } from './AppLayout';

export function ProtectedLayout() {
  return (
    <RequireAuth>
      <AppLayout />
    </RequireAuth>
  );
}
