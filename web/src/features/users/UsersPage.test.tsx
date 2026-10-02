import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STAFF_USER, installFakeAuthApi, renderApp } from '../../app/testing';
import type { AuthUser } from '../../data/auth';
import type { UserSummary } from '../../data/users';

const ADMIN: AuthUser = { id: '00000000-0000-4000-8000-0000000000a1', email: 'alex.admin@example.test', fullName: 'Alex Admin', role: 'admin' };

function summary(u: AuthUser, extra: Partial<UserSummary> = {}): UserSummary {
  return { ...u, isActive: true, lastLoginAt: null, lockedUntil: null, createdAt: '2026-09-01T09:00:00Z', ...extra };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Fake of the backend's /api/users (server/src/api/auth/routes.ts + auth.service.ts), layered over
 * the auth fake: admin only, 409 on a duplicate e-mail, no self-demote/deactivate, empty update refused.
 */
function installFakeUsersApi(sessionUser: AuthUser, initial: UserSummary[]) {
  const auth = installFakeAuthApi({ sessionUser });
  const authFetch = globalThis.fetch;
  const users = initial.map((u) => ({ ...u }));
  const requests: { method: string; path: string; body: unknown }[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      if (!path.startsWith('/api/users')) return authFetch(input, init);
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
      requests.push({ method, path, body });
      if (sessionUser.role !== 'admin') return json(403, { error: { code: 'forbidden', message: 'You do not have permission to do this' } });

      if (path === '/api/users' && method === 'GET') return json(200, { users });
      if (path === '/api/users' && method === 'POST') {
        const b = body as { email: string; fullName: string; role: AuthUser['role']; password: string };
        if (users.some((u) => u.email === b.email.toLowerCase())) {
          return json(409, { error: { code: 'conflict', message: 'A user with this e-mail already exists' } });
        }
        const created = summary({ id: `new-${users.length}`, email: b.email.toLowerCase(), fullName: b.fullName, role: b.role });
        users.push(created);
        return json(201, { user: created });
      }
      const id = decodeURIComponent(path.split('/').pop() ?? '');
      if (method === 'PATCH') {
        const b = body ?? {};
        if (Object.keys(b).length === 0) {
          return json(400, { error: { code: 'bad_request', message: 'Invalid request', details: [{ path: '', message: 'Nothing to update' }] } });
        }
        if (id === sessionUser.id && (b.isActive === false || (b.role && b.role !== 'admin'))) {
          return json(400, { error: { code: 'bad_request', message: 'You cannot deactivate or demote your own account' } });
        }
        const u = users.find((x) => x.id === id);
        if (!u) return json(404, { error: { code: 'not_found', message: 'User not found' } });
        Object.assign(u, b.fullName !== undefined ? { fullName: b.fullName } : {}, b.role ? { role: b.role } : {});
        if (typeof b.isActive === 'boolean') u.isActive = b.isActive;
        if (b.password) u.lockedUntil = null;
        return json(200, { user: u });
      }
      return json(404, { error: { code: 'not_found', message: 'Not found' } });
    }),
  );
  return { auth, users, requests };
}

const PRIYA = summary(
  { id: 'u-priya', email: 'priya.shah@example.test', fullName: 'Priya Shah', role: 'accounts' },
  { lastLoginAt: '2026-10-01T08:30:00Z' },
);
const ROBIN = summary(
  { id: 'u-robin', email: 'robin.reed@example.test', fullName: 'Robin Reed', role: 'readonly' },
  { lockedUntil: '2999-01-01T10:00:00Z' },
);

afterEach(() => vi.unstubAllGlobals());

async function openUsers() {
  renderApp('/users');
  return screen.findByRole('table', { name: 'Users' });
}

// Full-app tests type into real forms; give them more than Vitest's 5 s default.
describe('UsersPage (admin)', { timeout: 15_000 }, () => {
  it('lists users with role, status, last sign-in and lock state', async () => {
    installFakeUsersApi(ADMIN, [summary(ADMIN), PRIYA, ROBIN]);
    const table = await openUsers();
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(within(table).getByText('You')).toBeInTheDocument();
    expect(within(table).getByText('Accounts')).toBeInTheDocument();
    expect(within(table).getAllByText('Never').length).toBeGreaterThan(0);
    expect(within(rows.find((r) => r.textContent?.includes('Robin Reed'))!).getByText(/01\/01\/2999/)).toBeInTheDocument();
    expect(screen.getByText('3 active of 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page');
  });

  it('filters by name or e-mail', async () => {
    installFakeUsersApi(ADMIN, [summary(ADMIN), PRIYA, ROBIN]);
    const table = await openUsers();
    await userEvent.setup().type(screen.getByRole('searchbox', { name: 'Search' }), 'robin');
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(2));
  });

  it('adds a user after validating the password length', async () => {
    const api = installFakeUsersApi(ADMIN, [summary(ADMIN)]);
    const user = userEvent.setup();
    await openUsers();
    await user.click(screen.getByRole('button', { name: 'Add user' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add user' });
    await user.type(within(dialog).getByRole('textbox', { name: /E-mail/ }), 'sam.new@example.test');
    await user.type(within(dialog).getByRole('textbox', { name: /Full name/ }), 'Sam New');
    await user.type(within(dialog).getByLabelText(/Temporary password/), 'short');
    await user.click(within(dialog).getByRole('button', { name: 'Add user' }));
    expect(await within(dialog).findByText('Password must be at least 12 characters')).toBeInTheDocument();
    expect(api.requests.some((r) => r.method === 'POST')).toBe(false);

    await user.click(within(dialog).getByRole('button', { name: 'Generate a strong password' }));
    expect((within(dialog).getByLabelText(/Temporary password/) as HTMLInputElement).value).toHaveLength(20);
    await user.click(within(dialog).getByRole('button', { name: 'Add user' }));

    expect(await screen.findByText('User added')).toBeInTheDocument();
    const post = api.requests.find((r) => r.method === 'POST');
    expect(post?.body).toMatchObject({ email: 'sam.new@example.test', fullName: 'Sam New', role: 'staff' });
    expect(await within(screen.getByRole('table', { name: 'Users' })).findByText('Sam New')).toBeInTheDocument();
  });

  it('shows a duplicate e-mail on the e-mail field', async () => {
    installFakeUsersApi(ADMIN, [summary(ADMIN), PRIYA]);
    const user = userEvent.setup();
    await openUsers();
    await user.click(screen.getByRole('button', { name: 'Add user' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add user' });
    await user.type(within(dialog).getByRole('textbox', { name: /E-mail/ }), PRIYA.email);
    await user.type(within(dialog).getByRole('textbox', { name: /Full name/ }), 'Priya Again');
    await user.type(within(dialog).getByLabelText(/Temporary password/), 'a long enough phrase');
    await user.click(within(dialog).getByRole('button', { name: 'Add user' }));
    expect(await within(dialog).findByText('A user with this e-mail already exists')).toBeInTheDocument();
  });

  it('edits only the changed fields', async () => {
    const api = installFakeUsersApi(ADMIN, [summary(ADMIN), PRIYA]);
    const user = userEvent.setup();
    await openUsers();
    await user.click(screen.getByRole('button', { name: 'Edit Priya Shah' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Priya Shah' });
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeDisabled();
    const name = within(dialog).getByRole('textbox', { name: /Full name/ });
    await user.clear(name);
    await user.type(name, 'Priya K Shah');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('User updated')).toBeInTheDocument();
    expect(api.requests.find((r) => r.method === 'PATCH')?.body).toEqual({ fullName: 'Priya K Shah' });
  });

  it('never lets an admin demote or deactivate themself', async () => {
    installFakeUsersApi(ADMIN, [summary(ADMIN), PRIYA]);
    const user = userEvent.setup();
    await openUsers();
    expect(screen.getByRole('switch', { name: 'Active: Alex Admin' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Edit Alex Admin' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Alex Admin' });
    expect(within(dialog).getByRole('combobox', { name: /^Role/ })).toBeDisabled();
    expect(within(dialog).getByRole('switch', { name: /Active/ })).toBeDisabled();
  });

  it('confirms before deactivating, and reactivates directly', async () => {
    const api = installFakeUsersApi(ADMIN, [summary(ADMIN), PRIYA]);
    const user = userEvent.setup();
    await openUsers();
    await user.click(screen.getByRole('switch', { name: 'Active: Priya Shah' }));
    const dialog = await screen.findByRole('dialog', { name: 'Deactivate user' });
    expect(api.requests.some((r) => r.method === 'PATCH')).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByText('User deactivated')).toBeInTheDocument();
    expect(api.requests.filter((r) => r.method === 'PATCH').at(-1)?.body).toEqual({ isActive: false });
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Active: Priya Shah' })).not.toBeChecked());

    await user.click(screen.getByRole('switch', { name: 'Active: Priya Shah' }));
    expect(await screen.findByText('User reactivated')).toBeInTheDocument();
    expect(api.requests.filter((r) => r.method === 'PATCH').at(-1)?.body).toEqual({ isActive: true });
  });
});

describe('UsersPage (other roles)', () => {
  it('is hidden from the navigation and forbidden by URL', async () => {
    const api = installFakeUsersApi(STAFF_USER, []);
    renderApp('/users');
    expect(await screen.findByText('You do not have access to this page')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull();
    expect(api.requests).toHaveLength(0);
  });
});
