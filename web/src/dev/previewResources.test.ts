import { afterEach, describe, expect, it } from 'vitest';
import { PREVIEW_ACCOUNTS, PREVIEW_PASSWORD, createPreviewApi } from './previewApi';
import { IMPORTS } from './previewData';

const CSRF = { 'x-requested-with': 'omnia-recon' };
const post = (body: unknown = {}) => ({ method: 'POST', headers: CSRF, body: JSON.stringify(body) });
const [ADMIN, ACCOUNTS, STAFF, READONLY] = PREVIEW_ACCOUNTS;

afterEach(() => window.sessionStorage.clear());

async function as(account: (typeof PREVIEW_ACCOUNTS)[number] | undefined) {
  const api = createPreviewApi();
  await api.handle('/api/auth/login', post({ email: account!.email, password: PREVIEW_PASSWORD }));
  return api;
}

const read = async (res: Response) => (await res.json()) as Record<string, unknown>;

describe('preview resources', () => {
  it('requires a session for every resource', async () => {
    const api = createPreviewApi();
    for (const path of ['/api/users', '/api/bank-accounts', '/api/imports', '/api/matching/lines', '/api/tenancies']) {
      expect((await api.handle(path)).status).toBe(401);
    }
  });

  it('serves users to admins only', async () => {
    expect((await (await as(STAFF)).handle('/api/users')).status).toBe(403);
    const res = await (await as(ADMIN)).handle('/api/users');
    expect(res.status).toBe(200);
    expect(((await read(res)).users as unknown[]).length).toBe(5);
  });

  it('lists open lines by default, filters by status and batch, and pages', async () => {
    const api = await as(STAFF);
    const open = await read(await api.handle('/api/matching/lines'));
    const statuses = new Set((open.lines as { status: string }[]).map((l) => l.status));
    expect([...statuses].every((s) => ['needs_review', 'yet_to_take', 'partially_matched'].includes(s))).toBe(true);
    const excluded = await read(await api.handle('/api/matching/lines?status=excluded'));
    expect((excluded.lines as { status: string }[]).every((l) => l.status === 'excluded')).toBe(true);
    const batch = await read(await api.handle(`/api/matching/lines?status=matched&batchId=${IMPORTS[2]!.id}`));
    expect(batch.total).toBe(2);
    const page = await read(await api.handle('/api/matching/lines?status=open&limit=2&offset=0'));
    expect((page.lines as unknown[]).length).toBe(2);
  });

  it('confirms a suggestion and updates the line like the server does', async () => {
    const api = await as(STAFF);
    const { lines } = await read(await api.handle('/api/matching/lines?status=needs_review'));
    const line = (lines as { id: string; suggestions: { id: string }[] }[])[0]!;
    const res = await api.handle(`/api/matching/lines/${line.id}/confirm`, post({ suggestionId: line.suggestions[0]!.id, remember: false }));
    expect(res.status).toBe(200);
    const updated = (await read(res)).line as { status: string; remaining: string; receipts: unknown[] };
    expect(updated.status).toBe('matched');
    expect(updated.remaining).toBe('0.00');
    expect(updated.receipts).toHaveLength(1);
  });

  it('refuses actions for read-only users and invalid input', async () => {
    const ro = await as(READONLY);
    const { lines } = await read(await ro.handle('/api/matching/lines'));
    const id = (lines as { id: string }[])[0]!.id;
    expect((await ro.handle(`/api/matching/lines/${id}/exclude`, post({ reason: 'Not rent' }))).status).toBe(403);
    const staff = await as(STAFF);
    expect((await staff.handle(`/api/matching/lines/${id}/exclude`, post({ reason: 'x' }))).status).toBe(400);
    expect((await staff.handle(`/api/matching/lines/${id}/confirm`, post({ tid: 'T0000' }))).status).toBe(400);
  });

  it('says uploading and Veco sync are unavailable instead of faking them', async () => {
    const staff = await as(STAFF);
    const upload = await staff.handle('/api/imports', { method: 'POST', headers: CSRF, body: new FormData() });
    expect(upload.status).toBe(400);
    expect(((await read(upload)).error as { message: string }).message).toMatch(/not available in preview mode/);
    const admin = await as(ADMIN);
    const sync = await admin.handle('/api/tenancies/sync', post({ dryRun: true }));
    expect(sync.status).toBe(503);
  });

  it('returns a full NI only to admin and accounts', async () => {
    const staffT = await read(await (await as(STAFF)).handle('/api/tenancies/T1001'));
    expect((staffT.tenancy as { ni?: string }).ni).toBeUndefined();
    const accT = await read(await (await as(ACCOUNTS)).handle('/api/tenancies/T1001'));
    expect((accT.tenancy as { ni?: string }).ni).toMatch(/^QQ1234/);
    const search = await read(await (await as(ACCOUNTS)).handle('/api/tenancies?q=t1001'));
    expect((search.tenancies as { ni?: string }[])[0]!.ni).toBeUndefined();
  });

  it('summarises each import from its lines', async () => {
    const api = await as(STAFF);
    const res = await read(await api.handle(`/api/matching/imports/${IMPORTS[0]!.id}/summary`));
    expect(res.summary).toMatchObject({ lines: 9, excluded: 2 });
  });
});
