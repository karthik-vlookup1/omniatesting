/**
 * DEV-ONLY preview backend, loaded by main.tsx only under `npm run dev:preview`.
 *
 * Lets the UI be explored before Omnia_recon-backend is running. It imitates the backend's
 * /api/auth endpoints (server/src/api/auth/routes.ts, services/auth.service.ts) in the same order
 * of checks — CSRF guard, request-body validation, then credentials — with the same status codes
 * and error envelopes. The built resource endpoints (users, bank accounts, imports, matching,
 * tenancies) are imitated over synthetic data in previewResources.ts. Every other /api path answers
 * 404 `not_found`, as the backend's catch-all does (app.ts). All accounts and data are synthetic.
 */
import type { AuthUser } from '../data/auth/types';
import { createPreviewState, handleResource } from './previewResources';

export const PREVIEW_PASSWORD = 'preview-password';

export const PREVIEW_ACCOUNTS: readonly AuthUser[] = [
  { id: '7a1f0c1e-0000-4000-8000-000000000001', email: 'admin@preview.test', fullName: 'Alex Morgan', role: 'admin' },
  { id: '7a1f0c1e-0000-4000-8000-000000000002', email: 'accounts@preview.test', fullName: 'Priya Shah', role: 'accounts' },
  { id: '7a1f0c1e-0000-4000-8000-000000000003', email: 'staff@preview.test', fullName: 'Sam Taylor', role: 'staff' },
  { id: '7a1f0c1e-0000-4000-8000-000000000004', email: 'readonly@preview.test', fullName: 'Robin Reed', role: 'readonly' },
];

const SESSION_KEY = 'omnia-preview-session';
const LATENCY_MS = 250;
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 256;

type Issue = { path: string; message: string };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function error(status: number, code: string, message: string, details?: Issue[]): Response {
  return json(status, { error: details ? { code, message, details } : { code, message } });
}

/** The backend's ZodError → 400 mapping (app.ts errorHandler). */
function invalid(details: Issue[]): Response {
  return error(400, 'bad_request', 'Invalid request', details);
}

/** Field checks in the spirit of the backend's Zod schemas: same paths and limits. */
function checkString(body: Record<string, unknown>, path: string, min: number, max: number, issues: Issue[]) {
  const v = body[path];
  if (typeof v !== 'string') issues.push({ path, message: `Invalid input: expected string, received ${v === null ? 'null' : typeof v}` });
  else if (v.length < min) issues.push({ path, message: `Too small: expected string to have >=${min} characters` });
  else if (v.length > max) issues.push({ path, message: `Too big: expected string to have <=${max} characters` });
}

function readSession(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSession(userId: string | null): void {
  try {
    if (userId) window.sessionStorage.setItem(SESSION_KEY, userId);
    else window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage blocked: the preview session just will not survive a reload.
  }
}

export interface PreviewRequest {
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
}

export interface PreviewApi {
  handle: (path: string, init?: PreviewRequest) => Promise<Response>;
}

/** Pure request handler, exported for tests. */
export function createPreviewApi(): PreviewApi {
  const passwords = new Map<string, string>(PREVIEW_ACCOUNTS.map((a) => [a.id, PREVIEW_PASSWORD]));
  const currentUser = (): AuthUser | null => PREVIEW_ACCOUNTS.find((a) => a.id === readSession()) ?? null;
  const state = createPreviewState(PREVIEW_ACCOUNTS);

  async function handle(rawPath: string, init: PreviewRequest = {}): Promise<Response> {
    const url = new URL(rawPath, 'http://preview.local');
    // Express matches routes with or without a trailing slash.
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
    const method = (init.method ?? 'GET').toUpperCase();

    if (path === '/api/health' && (method === 'GET' || method === 'HEAD')) return json(200, { status: 'ok' });

    // csrfGuard runs for every /api request, before routing.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && new Headers(init.headers).get('x-requested-with') !== 'omnia-recon') {
      return error(403, 'forbidden', 'Missing x-requested-with header');
    }

    let parsed: unknown = {};
    if (typeof init.body === 'string' && init.body !== '') {
      try {
        parsed = JSON.parse(init.body);
      } catch {
        return error(400, 'bad_request', 'Malformed JSON body');
      }
    }
    const body: Record<string, unknown> | null =
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;

    const user = currentUser();

    if (path === '/api/auth/login' && method === 'POST') {
      if (!body) return invalid([{ path: '', message: 'Invalid input: expected object' }]);
      const issues: Issue[] = [];
      checkString(body, 'email', 0, 320, issues);
      checkString(body, 'password', 1, PASSWORD_MAX, issues);
      if (issues.length) return invalid(issues);

      const email = String(body.email).trim().toLowerCase();
      const account = PREVIEW_ACCOUNTS.find((a) => a.email === email);
      if (!account || passwords.get(account.id) !== body.password) {
        return error(401, 'invalid_credentials', 'E-mail or password is incorrect');
      }
      writeSession(account.id);
      return json(200, { user: account });
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      writeSession(null);
      return new Response(null, { status: 204 });
    }

    if (path === '/api/auth/me' && method === 'GET') {
      return user ? json(200, { user }) : error(401, 'unauthenticated', 'Sign in required');
    }

    if (path === '/api/auth/password' && method === 'POST') {
      if (!user) return error(401, 'unauthenticated', 'Sign in required');
      // 1. ChangePasswordBody (routes.ts)
      if (!body) return invalid([{ path: '', message: 'Invalid input: expected object' }]);
      const issues: Issue[] = [];
      checkString(body, 'currentPassword', 1, PASSWORD_MAX, issues);
      checkString(body, 'newPassword', 0, PASSWORD_MAX, issues);
      if (issues.length) return invalid(issues);
      // 2. PasswordSchema on the new password (auth.service.ts changeOwnPassword)
      const next = String(body.newPassword);
      if (next.length < PASSWORD_MIN) {
        return invalid([{ path: '', message: `Password must be at least ${PASSWORD_MIN} characters` }]);
      }
      // 3. Only then the current password.
      if (passwords.get(user.id) !== body.currentPassword) {
        return error(401, 'invalid_credentials', 'Current password is incorrect');
      }
      passwords.set(user.id, next);
      return new Response(null, { status: 204 });
    }

    const resource = handleResource(state, user, method, path, url.searchParams, body);
    if (resource) return resource;

    // The backend's catch-all: authenticate never rejects, so unknown routes are 404 signed in or not.
    return error(404, 'not_found', 'Not found');
  }

  return { handle };
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

/** Routes this tab's same-origin /api requests to the preview backend. Everything else passes through. */
export function installPreviewApi(): void {
  const api = createPreviewApi();
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const request = input instanceof Request ? input : null;
    const href = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return realFetch(input, init);

    const signal = init?.signal ?? request?.signal ?? undefined;
    const merged: PreviewRequest = {
      method: init?.method ?? request?.method,
      headers: init?.headers ?? request?.headers,
      body: init?.body ?? (request && request.method !== 'GET' && request.method !== 'HEAD' ? await request.clone().text() : undefined),
    };

    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(abortError());
      const timer = setTimeout(resolve, LATENCY_MS);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(abortError());
      });
    });
    return api.handle(url.pathname + url.search, merged);
  };
}
