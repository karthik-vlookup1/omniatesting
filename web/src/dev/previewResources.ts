/**
 * DEV-ONLY: preview stand-ins for the backend's built resource endpoints (FRONTEND_REFERENCE.md
 * §5.2–5.6) over synthetic data. Guards follow the backend's order: session, role, then input.
 * Where imitating would mean inventing backend rules (CSV parsing and matching on upload, Veco),
 * the stand-in says the feature is unavailable in preview instead of faking a result.
 */
import type { AuthUser, Role } from '../data/auth/types';
import type { UserSummary } from '../data/users/types';
import type { BankLine, LineStatus, Payer } from '../data/transactions/types';
import { BANKS, IMPORTS, TENANCIES, seedLines } from './previewData';

type Json = Record<string, unknown>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
const error = (status: number, code: string, message: string, details?: unknown) =>
  json(status, { error: details === undefined ? { code, message } : { code, message, details } });

const forbidden = () => error(403, 'forbidden', 'You do not have permission to do this');
const WRITERS: Role[] = ['admin', 'accounts', 'staff'];
const OPEN: LineStatus[] = ['needs_review', 'yet_to_take', 'partially_matched'];
const PAYERS: Payer[] = ['tenant', 'council_hb', 'dwp_uc', 'other_third_party'];

/** Pence arithmetic for the preview's own bookkeeping (the real server does allocation). */
const pence = (v: string) => Math.round(Number(v) * 100);
const pounds = (p: number) => (p / 100).toFixed(2);

export interface PreviewState {
  users: UserSummary[];
  lines: BankLine[];
}

export function createPreviewState(accounts: readonly AuthUser[]): PreviewState {
  const users: UserSummary[] = accounts.map((a, i) => ({
    ...a,
    isActive: true,
    lastLoginAt: i === 0 ? null : new Date(Date.now() - (i + 1) * 3_600_000).toISOString(),
    lockedUntil: null,
    createdAt: '2026-09-01T09:00:00Z',
  }));
  users.push({
    id: '7a1f0c1e-0000-4000-8000-000000000005',
    email: 'former.staff@preview.test',
    fullName: 'Taylor Former',
    role: 'staff',
    isActive: false,
    lastLoginAt: '2026-07-14T16:20:00Z',
    lockedUntil: null,
    createdAt: '2025-11-03T09:00:00Z',
  });
  return { users, lines: seedLines() };
}

function summary(lines: BankLine[]) {
  const count = (s: LineStatus) => lines.filter((l) => l.status === s).length;
  return {
    lines: lines.length,
    autoMatched: lines.filter((l) => l.status === 'matched' && l.receipts.some((r) => r.matchedBy === null)).length,
    matched: count('matched'),
    partiallyMatched: count('partially_matched'),
    needsReview: count('needs_review'),
    yetToTake: count('yet_to_take'),
    excluded: count('excluded'),
    unprocessed: count('new'),
  };
}

function usersRoute(state: PreviewState, user: AuthUser, method: string, id: string | undefined, body: Json | null): Response {
  if (user.role !== 'admin') return forbidden();
  if (!id && method === 'GET') return json(200, { users: [...state.users].sort((a, b) => a.email.localeCompare(b.email)) });
  if (!id && method === 'POST') {
    const b = body ?? {};
    const email = String(b.email ?? '').trim().toLowerCase();
    const issues: { path: string; message: string }[] = [];
    if (!/^\S+@\S+\.\S+$/.test(email)) issues.push({ path: 'email', message: 'Enter a valid e-mail address' });
    if (!String(b.fullName ?? '').trim()) issues.push({ path: 'fullName', message: 'Too small: expected string to have >=1 characters' });
    if (!['admin', 'accounts', 'staff', 'readonly'].includes(String(b.role))) issues.push({ path: 'role', message: 'Invalid option' });
    if (String(b.password ?? '').length < 12) issues.push({ path: 'password', message: 'Password must be at least 12 characters' });
    if (issues.length) return error(400, 'bad_request', 'Invalid request', issues);
    if (state.users.some((u) => u.email === email)) return error(409, 'conflict', 'A user with this e-mail already exists');
    const created: UserSummary = {
      id: crypto.randomUUID(),
      email,
      fullName: String(b.fullName).trim(),
      role: b.role as Role,
      isActive: true,
      lastLoginAt: null,
      lockedUntil: null,
      createdAt: new Date().toISOString(),
    };
    state.users.push(created);
    return json(201, { user: created });
  }
  if (id && method === 'PATCH') {
    const b = body ?? {};
    if (!Object.values(b).some((v) => v !== undefined)) {
      return error(400, 'bad_request', 'Invalid request', [{ path: '', message: 'Nothing to update' }]);
    }
    if (b.password !== undefined && String(b.password).length < 12) {
      return error(400, 'bad_request', 'Invalid request', [{ path: 'password', message: 'Password must be at least 12 characters' }]);
    }
    if (id === user.id && (b.isActive === false || (b.role !== undefined && b.role !== 'admin'))) {
      return error(400, 'bad_request', 'You cannot deactivate or demote your own account');
    }
    const u = state.users.find((x) => x.id === id);
    if (!u) return error(404, 'not_found', 'User not found');
    if (typeof b.fullName === 'string') u.fullName = b.fullName.trim();
    if (typeof b.role === 'string') u.role = b.role as Role;
    if (typeof b.isActive === 'boolean') u.isActive = b.isActive;
    if (b.password) u.lockedUntil = null;
    return json(200, { user: u });
  }
  return error(404, 'not_found', 'Not found');
}

function linesRoute(state: PreviewState, user: AuthUser, method: string, rest: string[], params: URLSearchParams, body: Json | null): Response {
  if (rest.length === 0 && method === 'GET') {
    const status = params.get('status') ?? 'open';
    const limit = Math.min(200, Math.max(1, Number(params.get('limit') ?? 50) || 50));
    const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0);
    const bank = params.get('bankAccountId');
    const batch = params.get('batchId');
    const bankCode = bank ? BANKS.find((b) => b.id === bank)?.code : undefined;
    const rows = state.lines
      .filter((l) => (status === 'open' ? OPEN.includes(l.status) : l.status === status))
      .filter((l) => !bank || l.bankCode === bankCode)
      .filter((l) => !batch || l.importBatchId === batch);
    return json(200, { lines: rows.slice(offset, offset + limit), total: rows.length });
  }

  const line = state.lines.find((l) => l.id === rest[0]);
  if (!line) return error(404, 'not_found', 'No such bank line');
  if (rest.length === 1 && method === 'GET') return json(200, { line });
  if (method !== 'POST') return error(404, 'not_found', 'Not found');
  if (!WRITERS.includes(user.role)) return forbidden();
  const action = rest.slice(1).join('/');
  const b = body ?? {};

  if (action === 'confirm') {
    if (Boolean(b.suggestionId) === Boolean(b.tid)) return error(400, 'bad_request', 'Invalid request', [{ path: '', message: 'give either suggestionId or tid' }]);
    if (b.amount !== undefined && !/^\d{1,10}(\.\d{1,2})?$/.test(String(b.amount))) {
      return error(400, 'bad_request', 'Invalid request', [{ path: 'amount', message: 'amount must be pounds and pence, e.g. 325.00' }]);
    }
    if (line.status === 'matched') return error(409, 'conflict', 'This line is already fully matched');
    if (line.status === 'excluded') return error(409, 'conflict', 'This line is excluded; include it again first');
    if (pence(line.amount) <= 0) return error(400, 'bad_request', 'Money going out cannot be matched to rent');
    let tid: string;
    let payer: Payer;
    if (b.suggestionId) {
      const s = line.suggestions.find((x) => x.id === b.suggestionId);
      if (!s) return error(404, 'not_found', 'No such suggestion on this line');
      if (s.status !== 'open') return error(409, 'conflict', 'That suggestion was already decided');
      s.status = 'accepted';
      tid = s.tid;
      payer = PAYERS.includes(b.payer as Payer) ? (b.payer as Payer) : s.payer;
    } else {
      tid = String(b.tid).trim().toUpperCase();
      if (!TENANCIES.some((t) => t.tid === tid)) return error(400, 'bad_request', `No tenancy with TID ${tid || '(blank)'}`);
      payer = PAYERS.includes(b.payer as Payer) ? (b.payer as Payer) : 'tenant';
    }
    const amount = b.amount !== undefined ? pence(String(b.amount)) : pence(line.remaining);
    if (amount <= 0 || amount > pence(line.remaining)) return error(400, 'bad_request', 'The amount is more than what remains on this line');
    line.receipts.push({ id: crypto.randomUUID(), tid, payer, amount: pounds(amount), ledgerCode: null, matchedVia: 'manual', matchedBy: user.fullName });
    line.remaining = pounds(pence(line.remaining) - amount);
    line.status = pence(line.remaining) === 0 ? 'matched' : 'partially_matched';
    return json(200, { line });
  }
  const reject = action.match(/^suggestions\/([^/]+)\/reject$/);
  if (reject) {
    const s = line.suggestions.find((x) => x.id === reject[1] && x.status === 'open');
    if (!s) return error(404, 'not_found', 'No open suggestion with that id on this line');
    s.status = 'rejected';
    if (!line.suggestions.some((x) => x.status === 'open') && line.status === 'needs_review') line.status = 'yet_to_take';
    return json(200, { line });
  }
  if (action === 'exclude') {
    const reason = String(b.reason ?? '').trim();
    if (reason.length < 2 || reason.length > 200) {
      return error(400, 'bad_request', 'Invalid request', [{ path: 'reason', message: 'Too small: expected string to have >=2 characters' }]);
    }
    if (line.receipts.length > 0) return error(409, 'conflict', 'This line already has receipts; reverse them first');
    line.status = 'excluded';
    line.exclusionReason = reason;
    return json(200, { line });
  }
  if (action === 'include') {
    if (line.status !== 'excluded') return error(409, 'conflict', 'Only an excluded line can be included again');
    if (pence(line.amount) <= 0) return error(400, 'bad_request', 'Money going out stays excluded');
    line.status = line.suggestions.some((s) => s.status === 'open') ? 'needs_review' : 'yet_to_take';
    line.exclusionReason = null;
    return json(200, { line });
  }
  return error(404, 'not_found', 'Not found');
}

/**
 * Answers a resource request, or returns null when the path is not one of these resources (the
 * caller then answers 404 like the backend's catch-all). `user` is null when signed out.
 */
export function handleResource(
  state: PreviewState,
  user: AuthUser | null,
  method: string,
  path: string,
  params: URLSearchParams,
  body: Json | null,
): Response | null {
  const parts = path.split('/').filter(Boolean).slice(1); // drop "api"
  const [resource, ...rest] = parts;
  const known = ['users', 'bank-accounts', 'imports', 'matching', 'tenancies'];
  if (!resource || !known.includes(resource)) return null;
  if (!user) return error(401, 'unauthenticated', 'Sign in required');

  switch (resource) {
    case 'users':
      return usersRoute(state, user, method, rest[0], body);
    case 'bank-accounts':
      if (rest.length === 0 && method === 'GET') return json(200, { bankAccounts: BANKS });
      return user.role === 'admin' ? error(404, 'not_found', 'Not found') : forbidden();
    case 'imports':
      if (rest.length === 0 && method === 'GET') return json(200, { imports: IMPORTS });
      if (rest.length === 0 && method === 'POST') {
        if (!WRITERS.includes(user.role)) return forbidden();
        return error(400, 'bad_request', 'Uploading is not available in preview mode. Run the backend to import a real statement file.');
      }
      return error(404, 'not_found', 'Not found');
    case 'matching': {
      if (rest[0] === 'lines') return linesRoute(state, user, method, rest.slice(1), params, body);
      if (rest[0] === 'imports' && rest[2] === 'summary' && method === 'GET') {
        if (!IMPORTS.some((i) => i.id === rest[1])) return error(404, 'not_found', 'No such import');
        return json(200, { summary: summary(state.lines.filter((l) => l.importBatchId === rest[1])) });
      }
      if (rest[0] === 'run' && method === 'POST') {
        if (!WRITERS.includes(user.role)) return forbidden();
        return json(200, { processed: 0, autoMatched: 0 });
      }
      return error(404, 'not_found', 'Not found');
    }
    case 'tenancies': {
      if (rest.length === 0 && method === 'GET') {
        const q = (params.get('q') ?? '').trim().toLowerCase();
        const status = params.get('status') ?? 'active';
        const rows = TENANCIES.filter((t) => status === 'all' || t.status === status)
          .filter((t) => !q || t.tid.toLowerCase() === q || t.tid.toLowerCase().startsWith(q) || (t.tenantName ?? '').toLowerCase().includes(q))
          .slice(0, 50)
          .map(({ ni: _ni, ...summary }) => summary);
        return json(200, { tenancies: rows });
      }
      if (rest[0] === 'sync' && method === 'POST') {
        if (user.role !== 'admin') return forbidden();
        return error(503, 'veco_not_configured', 'Veco sync is not configured in preview mode');
      }
      if (rest.length === 1 && method === 'GET') {
        const t = TENANCIES.find((x) => x.tid.toUpperCase() === decodeURIComponent(rest[0]!).toUpperCase());
        if (!t) return error(404, 'not_found', 'No such tenancy');
        // Full NI only for admin / accounts, as the server decides. Synthetic, never a real number.
        const ni = (user.role === 'admin' || user.role === 'accounts') && t.niMasked ? `QQ1234${t.niMasked.slice(-3)}` : undefined;
        return json(200, { tenancy: ni ? { ...t, ni } : t });
      }
      return error(404, 'not_found', 'Not found');
    }
    default:
      return null;
  }
}

