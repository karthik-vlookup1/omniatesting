import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { fetchSession, login, logout } from './api';
import { can } from './permissions';

function stub(status: number, body?: unknown) {
  const fn = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      body === undefined
        ? new Response(null, { status })
        : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
    ),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('auth api', () => {
  it('fetchSession returns the user, or null on 401', async () => {
    stub(200, { user: { id: '1', email: 'a@example.test', fullName: 'A', role: 'staff' } });
    await expect(fetchSession()).resolves.toMatchObject({ role: 'staff' });
    stub(401, { error: { code: 'unauthenticated', message: 'Sign in required' } });
    await expect(fetchSession()).resolves.toBeNull();
  });

  it('fetchSession surfaces other failures', async () => {
    stub(500, { error: { code: 'internal', message: 'Something went wrong' } });
    await expect(fetchSession()).rejects.toBeInstanceOf(ApiError);
  });

  it('login trims the e-mail but never the password', async () => {
    const fn = stub(200, { user: { id: '1', email: 'a@example.test', fullName: 'A', role: 'staff' } });
    await login({ email: '  a@example.test ', password: ' pass with spaces ' });
    expect(fn.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ email: 'a@example.test', password: ' pass with spaces ' }));
  });

  it('logout treats an already-ended session as success', async () => {
    stub(401, { error: { code: 'unauthenticated', message: 'Sign in required' } });
    await expect(logout()).resolves.toBeUndefined();
  });
});

describe('can', () => {
  it('matches the backend role rules', () => {
    expect(can({ role: 'readonly' }, 'write')).toBe(false);
    expect(can({ role: 'staff' }, 'write')).toBe(true);
    expect(can({ role: 'staff' }, 'viewFullNi')).toBe(false);
    expect(can({ role: 'accounts' }, 'viewFullNi')).toBe(true);
    expect(can({ role: 'accounts' }, 'manageUsers')).toBe(false);
    expect(can({ role: 'admin' }, 'manageUsers')).toBe(true);
    expect(can(null, 'write')).toBe(false);
  });
});
