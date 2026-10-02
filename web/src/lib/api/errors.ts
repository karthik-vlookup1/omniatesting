/**
 * The backend answers every failure as `{ error: { code, message, details? } }`
 * (Omnia_recon-backend server/src/api/app.ts). `ApiError` carries that envelope to the UI.
 */
export type ApiErrorCode =
  | 'bad_request'
  | 'unauthenticated'
  | 'invalid_credentials'
  | 'account_locked'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'too_many_requests'
  | 'internal'
  // Client-side only: the request never got a well-formed answer.
  | 'network'
  | 'unknown';

/** Field-level validation detail, as produced by the backend's Zod error handler. */
export interface FieldIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: unknown;
  /** Seconds, from the Retry-After header (sent with 429). */
  readonly retryAfter: number | null;
  readonly requestId: string | null;

  constructor(init: {
    status: number;
    code: ApiErrorCode;
    message: string;
    details?: unknown;
    retryAfter?: number | null;
    requestId?: string | null;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.retryAfter = init.retryAfter ?? null;
    this.requestId = init.requestId ?? null;
  }

  /** 4xx: the request itself is wrong; retrying will not help. */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/** Plain-language fallbacks when the server sent no usable message. */
const FALLBACK: Record<ApiErrorCode, string> = {
  bad_request: 'Some of the information entered is not valid.',
  unauthenticated: 'Your session has ended. Please sign in again.',
  invalid_credentials: 'E-mail or password is incorrect.',
  account_locked: 'This account is temporarily locked after too many failed attempts.',
  forbidden: 'You do not have permission to do this.',
  not_found: 'We could not find what you were looking for.',
  conflict: 'This conflicts with existing data.',
  too_many_requests: 'Too many attempts. Please wait and try again.',
  internal: 'Something went wrong on our side. Please try again.',
  network: 'Cannot reach the Omnia Recon server. Check your connection and try again.',
  unknown: 'Something went wrong. Please try again.',
};

/** The message to show a person for any thrown value. Never includes stack traces. */
export function errorMessage(err: unknown): string {
  if (isApiError(err)) return err.message.trim() || FALLBACK[err.code];
  return FALLBACK.unknown;
}

/** Validation issues keyed by field path, for wiring into a form. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!isApiError(err) || err.code !== 'bad_request' || !Array.isArray(err.details)) return {};
  const out: Record<string, string> = {};
  for (const item of err.details as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const { path, message } = item as Partial<FieldIssue>;
    if (typeof path === 'string' && typeof message === 'string' && !(path in out)) out[path] = message;
  }
  return out;
}
