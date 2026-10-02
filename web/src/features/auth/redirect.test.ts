import { describe, expect, it } from 'vitest';
import { loginPath, safeNextPath } from './redirect';

describe('safeNextPath', () => {
  it.each([
    ['/imports?bank=HSBC', '/imports?bank=HSBC'],
    [null, '/'],
    ['', '/'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['javascript:alert(1)', '/'],
    ['/login?next=/x', '/'],
  ])('%s → %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe('loginPath', () => {
  it('encodes the return path and reason', () => {
    expect(loginPath('/review?id=1', 'expired')).toBe('/login?next=%2Freview%3Fid%3D1&reason=expired');
    expect(loginPath('/')).toBe('/login');
  });
});
