import { describe, expect, it } from 'vitest';
import { ApiError, errorMessage, fieldErrors } from './errors';

describe('errorMessage', () => {
  it('prefers the server message', () => {
    expect(errorMessage(new ApiError({ status: 409, code: 'conflict', message: 'A user with this e-mail already exists' }))).toBe(
      'A user with this e-mail already exists',
    );
  });

  it('falls back to a plain-language message per code', () => {
    expect(errorMessage(new ApiError({ status: 0, code: 'network', message: '' }))).toMatch(/Cannot reach/);
  });

  it('never exposes internals of unknown errors', () => {
    expect(errorMessage(new Error('TypeError at line 12 of secret.ts'))).toBe('Something went wrong. Please try again.');
  });
});

describe('fieldErrors', () => {
  it('keys validation issues by path, first message wins', () => {
    const err = new ApiError({
      status: 400,
      code: 'bad_request',
      message: 'Invalid request',
      details: [
        { path: 'password', message: 'Password must be at least 12 characters' },
        { path: 'password', message: 'second' },
        { path: 'email', message: 'Enter a valid e-mail address' },
        'junk',
      ],
    });
    expect(fieldErrors(err)).toEqual({
      password: 'Password must be at least 12 characters',
      email: 'Enter a valid e-mail address',
    });
  });

  it('returns nothing for other errors', () => {
    expect(fieldErrors(new ApiError({ status: 403, code: 'forbidden', message: 'No' }))).toEqual({});
  });
});
