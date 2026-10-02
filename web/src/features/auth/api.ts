/**
 * Auth API client. Every request sends the session cookie (same origin, via the Vite proxy) and
 * the CSRF header the server requires on state-changing requests.
 */
export type Role = 'admin' | 'accounts' | 'staff' | 'readonly';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const CSRF_HEADERS = { 'X-Requested-With': 'omnia-recon' };

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { ...CSRF_HEADERS, 'Content-Type': 'application/json', ...init.headers },
  });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
  if (!res.ok) {
    throw new ApiError(res.status, body.error?.code ?? 'error', body.error?.message ?? 'Something went wrong');
  }
  return body as T;
}

/** The signed-in user, or null when there is no valid session. */
export async function fetchMe(): Promise<AuthUser | null> {
  try {
    return (await apiFetch<{ user: AuthUser }>('/api/auth/me')).user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const { user } = await apiFetch<{ user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return user;
}

export function logout(): Promise<void> {
  return apiFetch<void>('/api/auth/logout', { method: 'POST' });
}
