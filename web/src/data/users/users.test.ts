import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateTemporaryPassword } from '../../features/users/password';
import { createUser, listUsers, updateUser } from './api';

function stub(status: number, body: unknown) {
  const fn = vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('users api', () => {
  it('lists users from GET /api/users', async () => {
    const fn = stub(200, { users: [] });
    await expect(listUsers()).resolves.toEqual([]);
    expect(fn.mock.calls[0]?.[0]).toBe('/api/users');
  });

  it('creates with a trimmed e-mail and name, and the CSRF header', async () => {
    const fn = stub(201, { user: { id: '1' } });
    await createUser({ email: ' a@example.test ', fullName: ' A B ', role: 'staff', password: 'x'.repeat(12) });
    const init = fn.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('x-requested-with')).toBe('omnia-recon');
    expect(JSON.parse(String(init?.body))).toEqual({ email: 'a@example.test', fullName: 'A B', role: 'staff', password: 'x'.repeat(12) });
  });

  it('patches by id with only the given fields', async () => {
    const fn = stub(200, { user: { id: 'a/b' } });
    await updateUser('a/b', { isActive: false });
    expect(fn.mock.calls[0]?.[0]).toBe('/api/users/a%2Fb');
    expect(fn.mock.calls[0]?.[1]?.method).toBe('PATCH');
    expect(fn.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ isActive: false }));
  });
});

describe('generateTemporaryPassword', () => {
  it('is long enough for the server rule and uses an unambiguous alphabet', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const p = generateTemporaryPassword();
      expect(p).toHaveLength(20);
      expect(p).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
      seen.add(p);
    }
    expect(seen.size).toBe(50);
  });
});
