import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { createQueryClient } from './query';

describe('createQueryClient', () => {
  const retry = createQueryClient().getDefaultOptions().queries?.retry as (n: number, e: unknown) => boolean;

  it('never retries client errors', () => {
    expect(retry(0, new ApiError({ status: 404, code: 'not_found', message: '' }))).toBe(false);
    expect(retry(0, new ApiError({ status: 401, code: 'unauthenticated', message: '' }))).toBe(false);
  });

  it('retries server and network errors at most twice', () => {
    const err = new ApiError({ status: 503, code: 'internal', message: '' });
    expect(retry(0, err)).toBe(true);
    expect(retry(1, err)).toBe(true);
    expect(retry(2, err)).toBe(false);
  });

  it('does not retry mutations', () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });
});
