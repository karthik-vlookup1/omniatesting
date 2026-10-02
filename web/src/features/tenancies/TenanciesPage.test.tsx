import { notifications } from '@mantine/notifications';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STAFF_USER, installFakeAuthApi, renderApp } from '../../app/testing';
import type { AuthUser } from '../../data/auth';
import type { SyncSummary, TenancyDetail, TenancySummary } from '../../data/tenancies';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const T1: TenancySummary = {
  tid: 'T1234',
  status: 'active',
  startDate: '2025-04-01',
  endDate: null,
  managementType: 'MG',
  tenantName: 'Jordan Smith',
  niMasked: '•••••12C',
  propertyRef: 'P-0042',
  unitRef: 'Flat 2',
  postcode: 'B1 1AA',
  address: '1 Example Street, Birmingham',
  branchCode: 'BHM',
  rent: { amount: '650.00', frequency: 'monthly' },
};
const T2: TenancySummary = { ...T1, tid: 'T2001', tenantName: 'Ava Brown', status: 'ended', endDate: '2026-06-30', niMasked: null };

const SUMMARY: SyncSummary = {
  dryRun: true,
  fetched: 812,
  rejected: [{ tid: null, reason: 'missing TID' }],
  tenants: { inserted: 3, updated: 10 },
  tenancies: { inserted: 4, updated: 20, reactivated: 1, ended: 2 },
  rentChanges: 6,
  ni: { missing: 5, invalid: 1, conflicts: 0 },
  namesMissing: 0,
  managementType: { IRG: 40, RG: 700, defaultedToRG: 2 },
};

/** Fake of server/src/api/tenancy/routes.ts: summaries only in search, full NI for admin/accounts. */
function installFakeTenanciesApi(user: AuthUser, sync: (body: { dryRun: boolean; force: boolean }) => Response = (b) => json(200, { summary: { ...SUMMARY, dryRun: b.dryRun } })) {
  installFakeAuthApi({ sessionUser: user });
  const authFetch = globalThis.fetch;
  const searches: URLSearchParams[] = [];
  const syncs: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
      if (url.pathname === '/api/tenancies') {
        searches.push(url.searchParams);
        const q = (url.searchParams.get('q') ?? '').toLowerCase();
        const status = url.searchParams.get('status') ?? 'active';
        const rows = [T1, T2]
          .filter((t) => status === 'all' || t.status === status)
          .filter((t) => !q || t.tid.toLowerCase() === q || (t.tenantName ?? '').toLowerCase().includes(q));
        return json(200, { tenancies: rows });
      }
      if (url.pathname === '/api/tenancies/sync') {
        if (user.role !== 'admin') return json(403, { error: { code: 'forbidden', message: 'You do not have permission to do this' } });
        const body = JSON.parse(String(init?.body)) as { dryRun: boolean; force: boolean };
        syncs.push(body);
        return sync(body);
      }
      const m = url.pathname.match(/^\/api\/tenancies\/([^/]+)$/);
      if (m) {
        const t = [T1, T2].find((x) => x.tid === decodeURIComponent(m[1]!));
        if (!t) return json(404, { error: { code: 'not_found', message: 'No such tenancy' } });
        const detail: TenancyDetail = ['admin', 'accounts'].includes(user.role) && t.niMasked ? { ...t, ni: 'QQ123412C' } : t;
        return json(200, { tenancy: detail });
      }
      return authFetch(input, init);
    }),
  );
  return { searches, syncs };
}

afterEach(() => {
  vi.unstubAllGlobals();
  // Mantine keeps notifications in a module-level store; do not let one test see another's toast.
  notifications.clean();
});

describe('TenanciesPage', { timeout: 15_000 }, () => {
  it('lists active tenancies with masked NI and searches by name', async () => {
    const api = installFakeTenanciesApi(STAFF_USER);
    renderApp('/tenancies');
    const table = await screen.findByRole('table', { name: 'Tenancies' });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByLabelText('NI number, masked: •••••12C')).toBeInTheDocument();
    expect(within(table).getByText('MG')).toBeInTheDocument();
    expect(api.searches[0]?.get('status')).toBe('active');
    await userEvent.setup().type(screen.getByRole('searchbox', { name: 'Search' }), 'jordan');
    await waitFor(() => expect(api.searches.at(-1)?.get('q')).toBe('jordan'));
  });

  it('switches status and keeps filters in the URL', async () => {
    const api = installFakeTenanciesApi(STAFF_USER);
    const { router } = renderApp('/tenancies');
    await screen.findByRole('table', { name: 'Tenancies' });
    await userEvent.setup().click(screen.getByRole('radio', { name: 'All' }));
    await waitFor(() => expect(router.state.location.search).toBe('?status=all'));
    expect(api.searches.at(-1)?.get('status')).toBe('all');
    expect(await screen.findByText('Ava Brown')).toBeInTheDocument();
  });

  it('never shows a full NI to staff, even in the detail', async () => {
    installFakeTenanciesApi(STAFF_USER);
    renderApp('/tenancies');
    await userEvent.setup().click(await screen.findByRole('row', { name: /Open tenancy T1234/ }));
    const drawer = await screen.findByRole('dialog', { name: /T1234 · Jordan Smith/ });
    expect(await within(drawer).findByLabelText('NI number, masked: •••••12C')).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Show full NI' })).toBeNull();
    expect(screen.queryByText('QQ123412C')).toBeNull();
  });

  it('lets accounts reveal the full NI on purpose, hidden by default', async () => {
    installFakeTenanciesApi({ ...STAFF_USER, role: 'accounts' });
    renderApp('/tenancies');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('row', { name: /Open tenancy T1234/ }));
    const drawer = await screen.findByRole('dialog', { name: /T1234/ });
    const reveal = await within(drawer).findByRole('button', { name: 'Show full NI' });
    expect(screen.queryByText('QQ123412C')).toBeNull();
    await user.click(reveal);
    expect(within(drawer).getByText('QQ123412C')).toBeInTheDocument();
  });

  it('offers Veco sync to admins only: dry run first, then run', async () => {
    const api = installFakeTenanciesApi({ ...STAFF_USER, role: 'admin' });
    renderApp('/tenancies');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Sync from Veco' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sync from Veco' });
    expect(within(dialog).getByRole('button', { name: 'Run sync' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Dry run' }));
    expect(await within(dialog).findByText(/Dry run: nothing has been saved · 812 rows read from Veco/)).toBeInTheDocument();
    expect(within(dialog).getByText('1 rows rejected')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Run sync' }));
    expect(await screen.findByText('Veco sync complete')).toBeInTheDocument();
    expect(api.syncs).toEqual([
      { dryRun: true, force: false },
      { dryRun: false, force: false },
    ]);
  });

  it('requires explicit consent to force a refused sync', async () => {
    const api = installFakeTenanciesApi({ ...STAFF_USER, role: 'admin' }, (b) =>
      b.force ? json(200, { summary: { ...SUMMARY, dryRun: false } }) : json(409, { error: { code: 'sync_refused', message: 'Sync would end 31% of tenancies' } }),
    );
    renderApp('/tenancies');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Sync from Veco' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sync from Veco' });
    await user.click(within(dialog).getByRole('button', { name: 'Dry run' }));
    expect(await within(dialog).findByText('Sync refused as a safety check')).toBeInTheDocument();
    const force = within(dialog).getByRole('button', { name: 'Force sync' });
    expect(force).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: /apply it anyway/ }));
    await user.click(force);
    expect(await screen.findByText('Veco sync complete')).toBeInTheDocument();
    expect(api.syncs.at(-1)).toEqual({ dryRun: false, force: true });
  });

  it('explains when Veco is not configured', async () => {
    installFakeTenanciesApi({ ...STAFF_USER, role: 'admin' }, () =>
      json(503, { error: { code: 'veco_not_configured', message: 'Veco sync is not configured on this server' } }),
    );
    renderApp('/tenancies');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Sync from Veco' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sync from Veco' });
    await user.click(within(dialog).getByRole('button', { name: 'Dry run' }));
    expect(await within(dialog).findByText('Veco sync is not set up')).toBeInTheDocument();
  });

  it('hides Veco sync from non-admins', async () => {
    installFakeTenanciesApi({ ...STAFF_USER, role: 'accounts' });
    renderApp('/tenancies');
    await screen.findByRole('table', { name: 'Tenancies' });
    expect(screen.queryByRole('button', { name: 'Sync from Veco' })).toBeNull();
  });
});
