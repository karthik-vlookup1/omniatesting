import type { RouteObject } from 'react-router-dom';
import { ProtectedLayout } from './layout/ProtectedLayout';
import { RootLayout } from './layout/RootLayout';
import { RouteErrorPage } from './pages/RouteErrorPage';
import { RouteLoading } from './pages/RouteLoading';

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
