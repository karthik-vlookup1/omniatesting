import { afterEach, describe, expect, it, vi } from 'vitest';
import { amountError, toPence } from './amount';
import { confirmLine, excludeLine, includeLine, rejectSuggestion } from './api';

function stub() {
  const fn = vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(JSON.stringify({ line: { id: 'l' } }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('review api', () => {
  it('sends exactly one of suggestionId or tid, and only the fields given', async () => {
    const fn = stub();
    await confirmLine('l1', { suggestionId: 's1', remember: false });
    await confirmLine('l1', { tid: ' t1234 ', payer: 'tenant', remember: true, amount: '20.50' });
    expect(fn.mock.calls[0]?.[0]).toBe('/api/matching/lines/l1/confirm');
    expect(JSON.parse(String(fn.mock.calls[0]?.[1]?.body))).toEqual({ remember: false, suggestionId: 's1' });
    expect(JSON.parse(String(fn.mock.calls[1]?.[1]?.body))).toEqual({ remember: true, tid: 'T1234', payer: 'tenant', amount: '20.50' });
    expect(new Headers(fn.mock.calls[0]?.[1]?.headers).get('x-requested-with')).toBe('omnia-recon');
  });

  it('posts reject, exclude and include to the right paths', async () => {
    const fn = stub();
    await rejectSuggestion('l1', 's/1');
    await excludeLine('l1', '  Bank charge ');
    await includeLine('l1');
    expect(fn.mock.calls.map((c) => c[0])).toEqual([
      '/api/matching/lines/l1/suggestions/s%2F1/reject',
      '/api/matching/lines/l1/exclude',
      '/api/matching/lines/l1/include',
    ]);
    expect(fn.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ reason: 'Bank charge' }));
  });
});

describe('amount input checks', () => {
  it('parses pounds and pence exactly', () => {
    expect(toPence('325')).toBe(32500);
    expect(toPence('325.5')).toBe(32550);
    expect(toPence('0.07')).toBe(7);
    expect(toPence('1.234')).toBeNull();
    expect(toPence('-5')).toBeNull();
  });

  it('refuses zero, malformed and over-remaining amounts', () => {
    expect(amountError('abc', '450.00')).toMatch(/pounds and pence/);
    expect(amountError('0', '450.00')).toMatch(/above £0.00/);
    expect(amountError('450.01', '450.00')).toMatch(/Cannot be more than/);
    expect(amountError('450', '450.00')).toBeNull();
    expect(amountError('0.10', '0.30')).toBeNull();
  });
});
