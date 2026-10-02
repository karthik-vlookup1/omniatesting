import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { configure, render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { AuthUser } from '../data/auth';
import { createQueryClient } from '../lib/query';
import { theme } from '../theme';
import { routes } from './routes';

/** Test-only helpers: a fake of the backend's /api/auth routes and a full-app renderer. */

// Full-app tests type whole passwords and load lazy routes; give async queries headroom on slow CI.
configure({ asyncUtilTimeout: 3000 });


export const STAFF_USER: AuthUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'sam.taylor@example.test',
  fullName: 'Sam Taylor',
  role: 'staff',
};

export const VALID_PASSWORD = 'correct horse battery';

interface FakeAuthOptions {
  /** The user already signed in when the app starts, or null. */
  sessionUser?: AuthUser | null;
  /** The user `POST /api/auth/login` signs in with `VALID_PASSWORD`. */
  loginUser?: AuthUser;
  /** Force login to answer with this error envelope. */
  loginError?: { status: number; code: string; message: string; headers?: Record<string, string> };
}

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

/**
 * Mimics server/src/api/auth/routes.ts closely enough for UI tests: cookie-session state,
 * 401 envelopes, CSRF header enforcement on writes.
 */
export function installFakeAuthApi(options: FakeAuthOptions = {}) {
  let current: AuthUser | null = options.sessionUser ?? null;
  const calls: { method: string; path: string; body: unknown }[] = [];

  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ method, path, body });

    if (method !== 'GET' && new Headers(init?.headers).get('x-requested-with') !== 'omnia-recon') {
      return json(403, { error: { code: 'forbidden', message: 'Missing x-requested-with header' } });
    }

    if (path === '/api/auth/me' && method === 'GET') {
      return current ? json(200, { user: current }) : json(401, { error: { code: 'unauthenticated', message: 'Sign in required' } });
    }
    if (path === '/api/auth/login' && method === 'POST') {
      if (options.loginError) {
        const e = options.loginError;
        return json(e.status, { error: { code: e.code, message: e.message } }, e.headers);
      }
      const { password } = body as { email: string; password: string };
      if (password !== VALID_PASSWORD) {
        return json(401, { error: { code: 'invalid_credentials', message: 'E-mail or password is incorrect' } });
      }
      current = options.loginUser ?? STAFF_USER;
      return json(200, { user: current });
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      current = null;
      return new Response(null, { status: 204 });
    }
    if (path === '/api/auth/password' && method === 'POST') {
      const { currentPassword } = body as { currentPassword: string };
      if (!current) return json(401, { error: { code: 'unauthenticated', message: 'Sign in required' } });
      if (currentPassword !== VALID_PASSWORD) {
        return json(401, { error: { code: 'invalid_credentials', message: 'Current password is incorrect' } });
      }
      return new Response(null, { status: 204 });
    }
    return json(404, { error: { code: 'not_found', message: 'Not found' } });
  });

  vi.stubGlobal('fetch', fetchMock);
  return {
    fetchMock,
    calls,
    /** Simulate the server-side session ending (idle timeout, deactivation). */
    expireSession: () => {
      current = null;
    },
  };
}

/** Renders the real route table at `path` with fresh providers. */
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = createQueryClient();
  const utils = render(
    <MantineProvider theme={theme} env="test">
      <Notifications />
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MantineProvider>,
  );
  return { ...utils, router, queryClient };
}
