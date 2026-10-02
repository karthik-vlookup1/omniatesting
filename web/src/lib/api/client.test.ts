import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, buildUrl, CSRF_HEADER, CSRF_HEADER_VALUE, setUnauthorizedHandler } from './client';
import { ApiError } from './errors';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function mockFetch(response: Response | Error) {
  const fn = vi.fn<typeof fetch>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

function sentInit(fn: ReturnType<typeof mockFetch>): RequestInit {
  const call = fn.mock.calls[0];
  if (!call) throw new Error('fetch was not called');
  return call[1] ?? {};
}

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
});

describe('apiRequest', () => {
  it('sends GET without the CSRF header, with same-origin credentials', async () => {
    const fn = mockFetch(jsonResponse(200, { user: { id: '1' } }));
    const result = await apiRequest<{ user: { id: string } }>('/auth/me');
    expect(result.user.id).toBe('1');
    expect(fn.mock.calls[0]?.[0]).toBe('/api/auth/me');
    const init = sentInit(fn);
    expect(init.credentials).toBe('same-origin');
    expect(new Headers(init.headers).has(CSRF_HEADER)).toBe(false);
  });

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'] as const)('adds x-requested-with on %s', async (method) => {
    const fn = mockFetch(new Response(null, { status: 204 }));
    await apiRequest('/auth/logout', { method });
    const headers = new Headers(sentInit(fn).headers);
    expect(headers.get(CSRF_HEADER)).toBe(CSRF_HEADER_VALUE);
  });

  it('serialises JSON bodies', async () => {
    const fn = mockFetch(jsonResponse(200, { user: {} }));
    await apiRequest('/auth/login', { method: 'POST', body: { email: 'a@example.test', password: 'x' } });
    const init = sentInit(fn);
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ email: 'a@example.test', password: 'x' }));
  });

  it('sends FormData without forcing a JSON content type', async () => {
    const fn = mockFetch(jsonResponse(201, {}));
    const form = new FormData();
    form.append('file', new Blob(['a,b']), 'statement.csv');
    await apiRequest('/imports', { method: 'POST', body: form });
    const init = sentInit(fn);
    expect(init.body).toBe(form);
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
  });

  it('returns undefined for 204', async () => {
    mockFetch(new Response(null, { status: 204 }));
    await expect(apiRequest('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('turns the error envelope into an ApiError', async () => {
    mockFetch(
      jsonResponse(
        400,
        { error: { code: 'bad_request', message: 'Invalid request', details: [{ path: 'email', message: 'Required' }] } },
        { 'X-Request-Id': 'req-42' },
      ),
    );
    const err = await apiRequest('/users', { method: 'POST', body: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.status).toBe(400);
    expect(apiErr.code).toBe('bad_request');
    expect(apiErr.message).toBe('Invalid request');
    expect(apiErr.details).toEqual([{ path: 'email', message: 'Required' }]);
    expect(apiErr.requestId).toBe('req-42');
    expect(apiErr.isClientError).toBe(true);
  });

  it('reads Retry-After on 429', async () => {
    mockFetch(jsonResponse(429, { error: { code: 'too_many_requests', message: 'Too many' } }, { 'Retry-After': '120' }));
    const err = (await apiRequest('/auth/login', { method: 'POST' }).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('too_many_requests');
    expect(err.retryAfter).toBe(120);
  });

  it.each([502, 503, 504])('maps a non-JSON %i from a proxy to network (API unreachable)', async (status) => {
    mockFetch(new Response('', { status, headers: { 'Content-Type': 'text/plain' } }));
    const err = (await apiRequest('/auth/me').catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('network');
    expect(err.status).toBe(status);
  });

  it('keeps the code of a JSON error envelope sent with a 502', async () => {
    mockFetch(jsonResponse(502, { error: { code: 'conflict', message: 'Upstream conflict' } }));
    const err = (await apiRequest('/auth/me').catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('conflict');
    expect(err.message).toBe('Upstream conflict');
  });

  it('keeps a JSON 503 from the API itself as internal', async () => {
    mockFetch(jsonResponse(503, { status: 'unavailable' }));
    const err = (await apiRequest('/health').catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('internal');
  });

  it('maps a non-JSON 500 to internal', async () => {
    mockFetch(new Response('<html>Error</html>', { status: 500, headers: { 'Content-Type': 'text/html' } }));
    const err = (await apiRequest('/auth/me').catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('internal');
  });

  it('maps a network failure to code network', async () => {
    mockFetch(new TypeError('Failed to fetch'));
    const err = (await apiRequest('/auth/me').catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('network');
    expect(err.status).toBe(0);
  });

  it('calls the unauthorized handler on an unexpected 401', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    mockFetch(jsonResponse(401, { error: { code: 'unauthenticated', message: 'Sign in required' } }));
    await apiRequest('/users').catch(() => undefined);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not call the unauthorized handler when a 401 is expected or is a wrong password', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    mockFetch(jsonResponse(401, { error: { code: 'unauthenticated', message: 'Sign in required' } }));
    await apiRequest('/auth/me', { expectUnauthenticated: true }).catch(() => undefined);
    mockFetch(jsonResponse(401, { error: { code: 'invalid_credentials', message: 'Wrong' } }));
    await apiRequest('/auth/login', { method: 'POST' }).catch(() => undefined);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('buildUrl', () => {
  it('drops empty values and repeats arrays', () => {
    expect(buildUrl('/imports', { bank: 'HSBC', status: ['matched', 'needs_review'], q: '', page: 2, x: undefined })).toBe(
      '/api/imports?bank=HSBC&status=matched&status=needs_review&page=2',
    );
  });
});
