import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLine, listLines } from './api';
import { confidenceColor, methodLabel } from './labels';

function stub(body: unknown) {
  const fn = vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('lines api', () => {
  it('sends only the filters that are set', async () => {
    const fn = stub({ lines: [], total: 0 });
    await listLines({ status: 'open', limit: 50, offset: 0 });
    await listLines({ status: 'excluded', bankAccountId: 'b', batchId: 'x', limit: 50, offset: 100 });
    expect(fn.mock.calls.map((c) => c[0])).toEqual([
      '/api/matching/lines?status=open&limit=50&offset=0',
      '/api/matching/lines?status=excluded&bankAccountId=b&batchId=x&limit=50&offset=100',
    ]);
  });

  it('reads one line by encoded id', async () => {
    const fn = stub({ line: { id: 'a/b' } });
    await expect(getLine('a/b')).resolves.toEqual({ id: 'a/b' });
    expect(fn.mock.calls[0]?.[0]).toBe('/api/matching/lines/a%2Fb');
  });
});

describe('labels', () => {
  it('colours confidence like the reference: ≥ 95% green, ≥ 60% yellow, else grey', () => {
    expect(confidenceColor(1)).toBe('green');
    expect(confidenceColor(0.95)).toBe('green');
    expect(confidenceColor(0.7)).toBe('yellow');
    expect(confidenceColor(0.6)).toBe('yellow');
    expect(confidenceColor(0.4)).toBe('gray');
  });

  it('names match methods, falling back to readable text', () => {
    expect(methodLabel('payer_account')).toBe('Remembered payer account');
    expect(methodLabel('some_new_method')).toBe('Some new method');
  });
});
