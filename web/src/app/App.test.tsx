import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { apiRequest } from '../lib/api';
import { STAFF_USER, installFakeAuthApi, renderApp } from './testing';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('protected routes', () => {
  it('sends a signed-out visitor to sign in, remembering where they were going', async () => {
    installFakeAuthApi({ sessionUser: null });
    const { router } = renderApp('/some/page?x=1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/some/page?x=1')}`);
  });

  it('shows the app shell with the user and role for a valid session', async () => {
    installFakeAuthApi({ sessionUser: STAFF_USER });
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account menu for Sam Taylor' })).toBeInTheDocument();
    expect(screen.getAllByText('Staff').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows the not-found page inside the shell for unknown paths', async () => {
    installFakeAuthApi({ sessionUser: STAFF_USER });
    renderApp('/does-not-exist');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account menu for Sam Taylor' })).toBeInTheDocument();
  });

  it('describes read-only access honestly on the overview', async () => {
    installFakeAuthApi({ sessionUser: { ...STAFF_USER, role: 'readonly', fullName: 'Robin Reader' } });
    renderApp('/');
    expect(await screen.findByText('View only: you cannot change data')).toBeInTheDocument();
    expect(screen.getByText('NI numbers are shown masked (last 3 characters)')).toBeInTheDocument();
  });

  it('offers a retry when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    renderApp('/');
    expect(await screen.findByText('Cannot reach Omnia Recon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('sign out', () => {
  it('ends the session on the server and returns to sign in', async () => {
    const api = installFakeAuthApi({ sessionUser: STAFF_USER });
    const user = userEvent.setup();
    const { router } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Account menu for Sam Taylor' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(api.calls.some((c) => c.method === 'POST' && c.path === '/api/auth/logout')).toBe(true);
  });
});

describe('session expiry', () => {
  it('redirects to sign in with a notice when a request answers 401, then returns afterwards', async () => {
    const api = installFakeAuthApi({ sessionUser: STAFF_USER });
    const user = userEvent.setup();
    const { router } = renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Overview' });

    api.expireSession();
    await apiRequest('/auth/me').catch(() => undefined);

    expect(await screen.findByText('Your session has ended')).toBeInTheDocument();
    expect(router.state.location.search).toContain('reason=expired');

    await user.type(screen.getByRole('textbox', { name: /E-mail/ }), STAFF_USER.email);
    await user.type(screen.getByLabelText(/Password/), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
  });
});

describe('change password', () => {
  it('flags a wrong current password on the field', async () => {
    installFakeAuthApi({ sessionUser: STAFF_USER });
    const user = userEvent.setup();
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Account menu for Sam Taylor' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Change password' }));
    await user.type(await screen.findByLabelText(/^Current password/), 'not the password');
    await user.type(screen.getByLabelText(/^New password/), 'a brand new passphrase');
    await user.type(screen.getByLabelText(/^Confirm new password/), 'a brand new passphrase');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
  });

  it('validates length and confirmation before calling the server', async () => {
    const api = installFakeAuthApi({ sessionUser: STAFF_USER });
    const user = userEvent.setup();
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Account menu for Sam Taylor' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Change password' }));
    await user.type(await screen.findByLabelText(/^Current password/), 'correct horse battery');
    await user.type(screen.getByLabelText(/^New password/), 'short');
    await user.type(screen.getByLabelText(/^Confirm new password/), 'different');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Password must be at least 12 characters')).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(api.calls.some((c) => c.path === '/api/auth/password')).toBe(false);
  });

  it('confirms success', async () => {
    const api = installFakeAuthApi({ sessionUser: STAFF_USER });
    const user = userEvent.setup();
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Account menu for Sam Taylor' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Change password' }));
    await user.type(await screen.findByLabelText(/^Current password/), 'correct horse battery');
    await user.type(screen.getByLabelText(/^New password/), 'a brand new passphrase');
    await user.type(screen.getByLabelText(/^Confirm new password/), 'a brand new passphrase');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Password changed')).toBeInTheDocument();
    const call = api.calls.find((c) => c.path === '/api/auth/password');
    expect(call?.body).toEqual({ currentPassword: 'correct horse battery', newPassword: 'a brand new passphrase' });
  });
});
