import { apiRequest, isApiError } from '../../lib/api';
import type { AuthUser, ChangePasswordInput, LoginInput } from './types';

/** Real endpoints: Omnia_recon-backend server/src/api/auth/routes.ts. */

/** The signed-in user, or `null` when there is no valid session. */
export async function fetchSession(signal?: AbortSignal): Promise<AuthUser | null> {
  try {
    const { user } = await apiRequest<{ user: AuthUser }>('/auth/me', { signal, expectUnauthenticated: true });
    return user;
  } catch (err) {
    if (isApiError(err) && err.status === 401) return null;
    throw err;
  }
}

export async function login(input: LoginInput): Promise<AuthUser> {
  const { user } = await apiRequest<{ user: AuthUser }>('/auth/login', {
    method: 'POST',
    body: { email: input.email.trim(), password: input.password },
    expectUnauthenticated: true,
  });
  return user;
}

export async function logout(): Promise<void> {
  try {
    await apiRequest<void>('/auth/logout', { method: 'POST', expectUnauthenticated: true });
  } catch (err) {
    // Already signed out on the server: nothing left to do.
    if (isApiError(err) && err.status === 401) return;
    throw err;
  }
}

/** Keeps this session; the server signs the user out everywhere else. */
export async function changePassword(input: ChangePasswordInput): Promise<void> {
  await apiRequest<void>('/auth/password', { method: 'POST', body: input });
}
