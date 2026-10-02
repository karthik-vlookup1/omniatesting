import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STAFF_USER, VALID_PASSWORD, installFakeAuthApi, renderApp } from '../../app/testing';

afterEach(() => {
  vi.unstubAllGlobals();
});

async function signIn(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByRole('textbox', { name: /E-mail/ }), email);
  await user.type(screen.getByLabelText(/Password/), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('LoginPage', () => {
  it('signs in and goes to the requested page', async () => {
    const api = installFakeAuthApi();
    const { router } = renderApp('/login?next=%2Fdoes-not-exist');
    await signIn(STAFF_USER.email, VALID_PASSWORD);
    await waitFor(() => expect(router.state.location.pathname).toBe('/does-not-exist'));
    const login = api.calls.find((c) => c.path === '/api/auth/login');
    expect(login?.body).toEqual({ email: STAFF_USER.email, password: VALID_PASSWORD });
  });

  it('never redirects off-site after sign-in', async () => {
    installFakeAuthApi();
    const { router } = renderApp('/login?next=%2F%2Fevil.example%2Fphish');
    await signIn(STAFF_USER.email, VALID_PASSWORD);
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('validates the form before calling the server', async () => {
    const api = installFakeAuthApi();
    renderApp('/login');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your work e-mail address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(api.calls.some((c) => c.path === '/api/auth/login')).toBe(false);
  });

  it('explains a wrong password', async () => {
    installFakeAuthApi();
    renderApp('/login');
    await signIn(STAFF_USER.email, 'wrong password');
    expect(await screen.findByRole('alert')).toHaveTextContent('The e-mail or password is incorrect');
  });

  it('explains a locked account', async () => {
    installFakeAuthApi({ loginError: { status: 423, code: 'account_locked', message: 'Too many failed attempts. Try again later.' } });
    renderApp('/login');
    await signIn(STAFF_USER.email, VALID_PASSWORD);
    expect(await screen.findByText('Account temporarily locked')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('unlocks automatically after 15 minutes');
  });

  it('explains rate limiting using Retry-After', async () => {
    installFakeAuthApi({
      loginError: { status: 429, code: 'too_many_requests', message: 'Too many sign-in attempts.', headers: { 'Retry-After': '540' } },
    });
    renderApp('/login');
    await signIn(STAFF_USER.email, VALID_PASSWORD);
    expect(await screen.findByText('Too many sign-in attempts')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('about 9 minutes');
  });

  it('skips the form when already signed in', async () => {
    installFakeAuthApi({ sessionUser: STAFF_USER });
    const { router } = renderApp('/login');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('labels the fields for autofill and assistive technology', async () => {
    installFakeAuthApi();
    renderApp('/login');
    const email = await screen.findByRole('textbox', { name: /E-mail/ });
    expect(email).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText(/Password/)).toHaveAttribute('autocomplete', 'current-password');
  });
});
