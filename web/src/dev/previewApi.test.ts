import { afterEach, describe, expect, it } from 'vitest';
import { PREVIEW_ACCOUNTS, PREVIEW_PASSWORD, createPreviewApi, installPreviewApi } from './previewApi';

const CSRF = { 'x-requested-with': 'omnia-recon' };
const post = (body: unknown, headers: Record<string, string> = CSRF) => ({
  method: 'POST',
  headers,
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

afterEach(() => window.sessionStorage.clear());

const admin = PREVIEW_ACCOUNTS[0]!;

async function signedIn() {
  const api = createPreviewApi();
  await api.handle('/api/auth/login', post({ email: admin.email, password: PREVIEW_PASSWORD }));
  return api;
}

async function errorOf(res: Response) {
  return ((await res.json()) as { error: { code: string; message: string; details?: { path: string }[] } }).error;
}

describe('preview API: sign-in, session, sign-out', () => {
  it('signs in with a sample account and reports the session', async () => {
    const api = createPreviewApi();
    expect((await api.handle('/api/auth/me')).status).toBe(401);
    const res = await api.handle('/api/auth/login', post({ email: ` ${admin.email.toUpperCase()} `, password: PREVIEW_PASSWORD }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: admin });
    expect(await (await api.handle('/api/auth/me')).json()).toEqual({ user: admin });
    expect((await api.handle('/api/auth/me/')).status).toBe(200);
  });

  it('rejects a wrong password with the backend error envelope', async () => {
    const res = await createPreviewApi().handle('/api/auth/login', post({ email: admin.email, password: 'nope' }));
    expect(res.status).toBe(401);
    expect(await errorOf(res)).toEqual({ code: 'invalid_credentials', message: 'E-mail or password is incorrect' });
  });

  it('validates the login body before checking credentials (LoginBody)', async () => {
    const api = createPreviewApi();
    const empty = await api.handle('/api/auth/login', post({ email: admin.email, password: '' }));
    expect(empty.status).toBe(400);
    expect((await errorOf(empty)).details?.map((d) => d.path)).toEqual(['password']);
    const missing = await api.handle('/api/auth/login', post({}));
    expect((await errorOf(missing)).details?.map((d) => d.path)).toEqual(['email', 'password']);
  });

  it('signs out', async () => {
    const api = await signedIn();
    expect((await api.handle('/api/auth/logout', post({}))).status).toBe(204);
    expect((await api.handle('/api/auth/me')).status).toBe(401);
  });
});

describe('preview API: guards and malformed input', () => {
  it('enforces the CSRF header on writes, before routing', async () => {
    const api = createPreviewApi();
    expect((await api.handle('/api/auth/login', post({ email: admin.email, password: PREVIEW_PASSWORD }, {}))).status).toBe(403);
    expect((await api.handle('/api/imports', { method: 'POST' })).status).toBe(403);
  });

  it('answers a malformed JSON body with 400 instead of throwing', async () => {
    const res = await createPreviewApi().handle('/api/auth/login', post('{not json'));
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toEqual({ code: 'bad_request', message: 'Malformed JSON body' });
    expect((await createPreviewApi().handle('/api/auth/login', post('null'))).status).toBe(400);
  });

  it('answers unknown endpoints with 404 signed in or not, never invented data', async () => {
    const out = await createPreviewApi().handle('/api/imports');
    expect(out.status).toBe(404);
    expect(await errorOf(out)).toEqual({ code: 'not_found', message: 'Not found' });
    const api = await signedIn();
    expect((await api.handle('/api/imports')).status).toBe(404);
    expect((await api.handle('/api/auth/me', post({}))).status).toBe(404);
  });

  it('answers health for GET and HEAD', async () => {
    const api = createPreviewApi();
    expect((await api.handle('/api/health')).status).toBe(200);
    expect((await api.handle('/api/health', { method: 'HEAD' })).status).toBe(200);
  });
});

describe('preview API: change password (ChangePasswordBody → PasswordSchema → current password)', () => {
  const change = (api: Awaited<ReturnType<typeof signedIn>>, body: unknown) => api.handle('/api/auth/password', post(body));

  it('requires a session', async () => {
    expect((await change(createPreviewApi() as never, { currentPassword: 'x', newPassword: 'y' })).status).toBe(401);
  });

  it('validates the body first: a short new password is 400 even with a wrong current one', async () => {
    const api = await signedIn();
    expect((await change(api, { currentPassword: 'wrong', newPassword: 'short' })).status).toBe(400);
    expect((await change(api, { newPassword: 'a long enough phrase' })).status).toBe(400);
    expect((await change(api, { currentPassword: PREVIEW_PASSWORD, newPassword: 'x'.repeat(257) })).status).toBe(400);
  });

  it('then checks the current password', async () => {
    const api = await signedIn();
    const res = await change(api, { currentPassword: 'wrong', newPassword: 'a long enough phrase' });
    expect(res.status).toBe(401);
    expect(await errorOf(res)).toEqual({ code: 'invalid_credentials', message: 'Current password is incorrect' });
  });

  it('changes it, and the new password signs in', async () => {
    const api = await signedIn();
    expect((await change(api, { currentPassword: PREVIEW_PASSWORD, newPassword: 'a long enough phrase' })).status).toBe(204);
    await api.handle('/api/auth/logout', post({}));
    expect((await api.handle('/api/auth/login', post({ email: admin.email, password: 'a long enough phrase' }))).status).toBe(200);
  });
});

describe('installPreviewApi', () => {
  it('handles Request objects, honours abort, and leaves other URLs alone', async () => {
    const original = window.fetch;
    const passthrough: string[] = [];
    window.fetch = ((input: RequestInfo | URL) => {
      passthrough.push(String(input));
      return Promise.resolve(new Response('ok'));
    }) as typeof fetch;
    try {
      installPreviewApi();
      const res = await window.fetch(
        new Request('http://localhost:3000/api/auth/login', {
          method: 'POST',
          headers: CSRF,
          body: JSON.stringify({ email: admin.email, password: PREVIEW_PASSWORD }),
        }),
      );
      expect(res.status).toBe(200);

      const controller = new AbortController();
      const pending = window.fetch('/api/auth/me', { signal: controller.signal });
      controller.abort();
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });

      await window.fetch('/assets/logo.svg');
      expect(passthrough).toEqual(['/assets/logo.svg']);
    } finally {
      window.fetch = original;
    }
  });
});

describe('preview accounts', () => {
  it('are all synthetic', () => {
    for (const a of PREVIEW_ACCOUNTS) expect(a.email.endsWith('@preview.test')).toBe(true);
  });
});
