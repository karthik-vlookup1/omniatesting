import { ApiError, type ApiErrorCode } from './errors';

/**
 * The only module that calls `fetch`. Everything under `data/` goes through `apiRequest`.
 *
 * - Same-origin cookies: the session is an HttpOnly `omnia_sid` cookie; JS never sees a token.
 * - CSRF: the backend rejects any non-GET/HEAD/OPTIONS request without this header.
 * - Errors: non-2xx responses become `ApiError` with the server's code and message.
 */
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'omnia-recon';
export const API_BASE = '/api';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const KNOWN_CODES: ReadonlySet<string> = new Set<ApiErrorCode>([
  'bad_request',
  'unauthenticated',
  'invalid_credentials',
  'account_locked',
  'forbidden',
  'not_found',
  'conflict',
  'too_many_requests',
  'internal',
]);

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: HttpMethod;
  /** JSON-serialised; `FormData` is sent as multipart (for file uploads). */
  body?: unknown;
  query?: Record<string, QueryValue | QueryValue[]>;
  signal?: AbortSignal;
  /**
   * Set for requests where a 401 is an expected answer (sign-in, session probe), so the global
   * "session expired" handler does not fire.
   */
  expectUnauthenticated?: boolean;
}

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

/** Registered once by the auth layer: what to do when the session has expired mid-use. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

export function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    const values = Array.isArray(raw) ? raw : [raw];
    for (const v of values) {
      if (v === undefined || v === null || v === '') continue;
      params.append(key, String(v));
    }
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers = new Headers({ Accept: 'application/json' });
  if (!SAFE_METHODS.has(method)) headers.set(CSRF_HEADER, CSRF_HEADER_VALUE);

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body,
      credentials: 'same-origin',
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError({ status: 0, code: 'network', message: '' });
  }

  if (response.ok) {
    if (response.status === 204 || response.headers.get('Content-Length') === '0') {
      return undefined as T;
    }
    const type = response.headers.get('Content-Type') ?? '';
    if (!type.includes('application/json')) return (await response.text()) as T;
    return (await response.json()) as T;
  }

  const error = await toApiError(response);
  if (error.status === 401 && error.code === 'unauthenticated' && !options.expectUnauthenticated) {
    onUnauthorized?.();
  }
  throw error;
}

async function toApiError(response: Response): Promise<ApiError> {
  let code: ApiErrorCode = response.status >= 500 ? 'internal' : 'unknown';
  let message = '';
  let details: unknown;
  // The API always answers in JSON. A non-JSON 502/503/504 comes from a proxy in front of it
  // (the Vite dev proxy, a load balancer), meaning the API itself could not be reached.
  const isJson = (response.headers.get('Content-Type') ?? '').includes('application/json');
  if (!isJson && [502, 503, 504].includes(response.status)) code = 'network';
  try {
    const payload: unknown = await response.json();
    const envelope = (payload as { error?: { code?: unknown; message?: unknown; details?: unknown } })?.error;
    if (envelope) {
      if (typeof envelope.code === 'string' && KNOWN_CODES.has(envelope.code)) {
        code = envelope.code as ApiErrorCode;
      }
      if (typeof envelope.message === 'string') message = envelope.message;
      details = envelope.details;
    }
  } catch {
    // Not JSON (e.g. a proxy error page). Keep the status-based code and fallback message.
  }
  if (code === 'unknown' && response.status === 401) code = 'unauthenticated';
  if (code === 'unknown' && response.status === 403) code = 'forbidden';
  if (code === 'unknown' && response.status === 404) code = 'not_found';
  if (code === 'unknown' && response.status === 429) code = 'too_many_requests';

  const retryAfterHeader = response.headers.get('Retry-After');
  const retryAfter = retryAfterHeader && /^\d+$/.test(retryAfterHeader) ? Number(retryAfterHeader) : null;

  return new ApiError({
    status: response.status,
    code,
    message,
    details,
    retryAfter,
    requestId: response.headers.get('X-Request-Id'),
  });
}
