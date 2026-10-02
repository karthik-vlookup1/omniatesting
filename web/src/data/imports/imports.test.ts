import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBatchSummary, listBankAccounts, listImports, uploadStatement } from './api';

function stub(status: number, body: unknown) {
  const fn = vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('imports api', () => {
  it('reads bank accounts and imports', async () => {
    const fn = stub(200, { bankAccounts: [], imports: [] });
    await listBankAccounts();
    await listImports();
    expect(fn.mock.calls.map((c) => c[0])).toEqual(['/api/bank-accounts', '/api/imports']);
  });

  it('uploads multipart with the CSRF header and no forced content type', async () => {
    const fn = stub(201, { import: {}, matching: null });
    const file = new File(['a'], 'x.csv', { type: 'text/csv' });
    await uploadStatement({ bankAccountId: 'abc', file });
    const init = fn.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(init?.method).toBe('POST');
    expect(headers.get('x-requested-with')).toBe('omnia-recon');
    expect(headers.has('Content-Type')).toBe(false);
    const form = init?.body as FormData;
    expect(form.get('bankAccountId')).toBe('abc');
    expect((form.get('file') as File).name).toBe('x.csv');
  });

  it('fetches a batch summary by encoded id', async () => {
    const fn = stub(200, { summary: { lines: 1 } });
    await expect(fetchBatchSummary('a/b')).resolves.toEqual({ lines: 1 });
    expect(fn.mock.calls[0]?.[0]).toBe('/api/matching/imports/a%2Fb/summary');
  });
});
