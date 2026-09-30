/**
 * Application errors carry a stable machine code and an HTTP status hint. Services throw them;
 * the API error handler turns them into `{ error: { code, message } }` responses.
 */
export type ErrorCode =
  | 'bad_request'
  | 'unauthenticated'
  | 'invalid_credentials'
  | 'account_locked'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'too_many_requests';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthenticated: 401,
  invalid_credentials: 401,
  account_locked: 423,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  too_many_requests: 429,
};

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = STATUS[code];
  }
}

/** Postgres unique_violation (23505), e.g. a duplicate e-mail. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === '23505';
}
