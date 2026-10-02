import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router-dom';
import type { Capability } from '../data/auth';
import { ProtectedLayout } from './layout/ProtectedLayout';
import { RootLayout } from './layout/RootLayout';
import { RouteErrorPage } from './pages/RouteErrorPage';
import { RouteLoading } from './pages/RouteLoading';

/**
 * A lazy page that only users with `capability` may open; everyone else gets the forbidden page.
 * The server enforces the same rule; this keeps the UI from offering a screen that would only 403.
 */
function guarded(capability: Capability, load: () => Promise<ComponentType>): RouteObject['lazy'] {
  return async () => {
    const [Page, { RequireCapability }, { ForbiddenPage }] = await Promise.all([
      load(),
      import('../features/auth/RequireAuth'),
      import('./pages/ForbiddenPage'),
    ]);
    const Guarded = () => (
      <RequireCapability capability={capability} fallback={<ForbiddenPage />}>
        <Page />
      </RequireCapability>
    );
    return { Component: Guarded };
  };
}

/**
 * Every page is loaded on demand, so signing in does not download the whole app.
 * Feature routes are added to the protected children as each feature ships.
 */
export const routes: RouteObject[] = [
  {
    Component: RootLayout,
    HydrateFallback: RouteLoading,
    ErrorBoundary: RouteErrorPage,
    children: [
      {
        path: 'login',
        lazy: async () => ({ Component: (await import('../features/auth/LoginPage')).LoginPage }),
      },
      {
        Component: ProtectedLayout,
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import('./pages/HomePage')).HomePage }),
          },
          {
            path: 'users',
            lazy: guarded('manageUsers', async () => (await import('../features/users/UsersPage')).UsersPage),
          },
          {
            path: 'forbidden',
            lazy: async () => ({ Component: (await import('./pages/ForbiddenPage')).ForbiddenPage }),
          },
          {
            path: '*',
            lazy: async () => ({ Component: (await import('./pages/NotFoundPage')).NotFoundPage }),
          },
        ],
      },
    ],
  },
];
