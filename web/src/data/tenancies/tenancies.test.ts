import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTenancy, runVecoSync, searchTenancies } from './api';

function stub(body: unknown) {
  const fn = vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('tenancies api', () => {
  it('searches with a trimmed query capped at the server limit', async () => {
    const fn = stub({ tenancies: [] });
    await searchTenancies({ q: `  ${'x'.repeat(150)} `, status: 'all' });
    const url = new URL(String(fn.mock.calls[0]?.[0]), 'http://localhost');
    expect(url.pathname).toBe('/api/tenancies');
    expect(url.searchParams.get('q')).toHaveLength(100);
    expect(url.searchParams.get('status')).toBe('all');
  });

  it('omits an empty query', async () => {
    const fn = stub({ tenancies: [] });
    await searchTenancies({ q: '   ', status: 'active' });
    expect(fn.mock.calls[0]?.[0]).toBe('/api/tenancies?status=active');
  });

  it('reads one tenancy and runs a dry-run sync', async () => {
    const fn = stub({ tenancy: { tid: 'T1' }, summary: { dryRun: true } });
    await getTenancy('T1');
    await runVecoSync({ dryRun: true });
    expect(fn.mock.calls[0]?.[0]).toBe('/api/tenancies/T1');
    expect(fn.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ dryRun: true, force: false }));
    expect(new Headers(fn.mock.calls[1]?.[1]?.headers).get('x-requested-with')).toBe('omnia-recon');
  });
});
