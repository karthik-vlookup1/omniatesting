import { describe, expect, it } from 'vitest';
import { parseLoginRateLimitMax } from '../../src/api/auth/rate-limit.js';

describe('parseLoginRateLimitMax', () => {
  it('defaults to 20 when absent or invalid', () => {
    expect(parseLoginRateLimitMax(undefined)).toBe(20);
    expect(parseLoginRateLimitMax('')).toBe(20);
    expect(parseLoginRateLimitMax('abc')).toBe(20);
    expect(parseLoginRateLimitMax('-5')).toBe(20);
    expect(parseLoginRateLimitMax('0')).toBe(20);
  });

  it('honours a valid override', () => {
    expect(parseLoginRateLimitMax('1000')).toBe(1000);
  });
});
