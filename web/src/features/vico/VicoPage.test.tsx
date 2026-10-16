import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CurrentUserContext } from '../../data/auth';
import { renderWithMantine } from '../../test/render';
import { VicoPage } from './VicoPage';

const h = vi.hoisted(() => {
  const mutation = (extra: object = {}) => ({
    mutate: () => {},
    mutateAsync: async () => ({}),
    reset: () => {},
    isPending: false,
    isError: false,
    isSuccess: false,
    data: undefined,
    error: null,
    variables: undefined,
    ...extra,
  });
  const query = (data: unknown) => ({ data, isPending: false, isError: false, isSuccess: true, error: null, refetch: () => {} });
  return {
    mutation,
    query,
    status: {
      configured: true,
      targetDb: 'Test Database Read Write',
      me: { linked: true, staffFk: 'S', canPush: true, source: 'admin', linkProblem: null },
    } as { configured: boolean; targetDb: string; me: { linked: boolean; staffFk: string | null; canPush: boolean; source: string | null; linkProblem: string | null } },
    preview: undefined as unknown,
    pendingRows: [
      { receiptId: 'r1', tid: 'T1001', tenantName: 'Alex Test', amount: '100.00', receivedOn: '2026-10-14', bankCode: 'HSBC', managementType: 'RG' },
    ] as object[],
  };
});

vi.mock('./api', () => ({
  useVicoSettings: () => h.query({ sortCode: '20-79-06', accountNumber: '43789276' }),
  useSaveVicoSettings: () => h.mutation(),
  useVicoPending: () => h.query({ rows: h.pendingRows, total: h.pendingRows.length, totalAmount: '100.00' }),
  useVicoExports: () => h.query([{ exportId: 'e1', fileName: 'vico-20261001-100000.csv', createdAt: '2026-10-01T10:00:00Z', rows: 2, totalAmount: '55.00' }]),
  useCreateVicoExport: () => h.mutation(),
  useDownloadVicoExport: () => h.mutation(),
}));

vi.mock('./vecoPushApi', () => ({
  useVecoPushStatus: () => h.query(h.status),
  usePreviewVecoPush: () => h.mutation({ data: h.preview, isSuccess: Boolean(h.preview) }),
  usePushToVeco: () => h.mutation(),
  useVecoPushes: () => h.query([]),
  useVerifyVecoPush: () => h.mutation(),
  useDeleteVecoPush: () => h.mutation(),
  useDownloadVecoReadback: () => h.mutation(),
  useVecoStaffLinks: () => h.query([]),
  useSaveVecoStaffLink: () => h.mutation(),
}));

const user = { id: 'u1', email: 'a@example.test', fullName: 'Alex Accounts', role: 'accounts' as const };
const renderPage = () =>
  renderWithMantine(
    <CurrentUserContext.Provider value={user}>
      <VicoPage />
    </CurrentUserContext.Provider>,
  );

beforeEach(() => {
  h.status.configured = true;
  h.status.me = { linked: true, staffFk: 'S', canPush: true, source: 'admin', linkProblem: null };
  h.preview = undefined;
  if (!globalThis.crypto?.randomUUID) {
    Object.defineProperty(globalThis, 'crypto', { value: { randomUUID: () => '11111111-2222-4333-8444-555555555555' }, configurable: true });
  }
});

describe('Vico page with the VECO push', () => {
  it('shows both options', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Download Vico file' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Push to VECO (test database)' })).toBeEnabled();
  });

  it('leaves the Earlier exports table as it was', () => {
    renderPage();
    const table = screen.getByRole('table', { name: 'Earlier Vico exports' });
    const headers = within(table).getAllByRole('columnheader').map((c) => c.textContent);
    expect(headers.slice(0, 4)).toEqual(['Exported', 'File', 'Receipts', 'Total']);
    expect(screen.getByText('vico-20261001-100000.csv')).toBeInTheDocument();
  });

  it('adds an Earlier VECO pushes table', () => {
    renderPage();
    const table = screen.getByRole('table', { name: 'Earlier VECO pushes' });
    const headers = within(table).getAllByRole('columnheader').map((c) => c.textContent);
    expect(headers.slice(0, 6)).toEqual(['Pushed', 'Batch ref', 'Pushed by', 'Receipts', 'Total', 'Check']);
  });

  it('disables the push with "No VECO user linked"', () => {
    h.status.me = { linked: false, staffFk: null, canPush: false, source: null, linkProblem: null };
    renderPage();
    expect(screen.getByRole('button', { name: 'Push to VECO (test database)' })).toBeDisabled();
    expect(screen.getByTestId('veco-push-reason')).toHaveTextContent('No VECO user linked');
  });

  it('gives the other reasons: no permission, not configured', () => {
    h.status.me = { linked: true, staffFk: 'S', canPush: false, source: 'email', linkProblem: null };
    const { unmount } = renderPage();
    expect(screen.getByTestId('veco-push-reason')).toHaveTextContent('No VECO push permission');
    unmount();
    h.status.configured = false;
    renderPage();
    expect(screen.getByTestId('veco-push-reason')).toHaveTextContent('VECO push is not configured');
  });

  it('the preview modal lists held reasons and a department picker', async () => {
    h.preview = {
      ready: [{ receiptId: 'r1', tid: 'T1001', tenantName: 'Alex Test', amount: '100.00', paymentDate: '2026-10-14', sourceBank: 'HSBC', department: 'Tenancy', departmentFromVeco: true }],
      held: [
        { receiptId: 'r2', tid: 'T2002', amount: '80.00', paymentDate: '2026-10-14', sourceBank: 'HSBC', code: 'department_not_chosen', message: 'First receipt for this tenancy: choose Owner or Tenancy', needsDepartment: true },
        { receiptId: 'r3', tid: 'T3003', amount: '5.00', paymentDate: '2026-10-14', sourceBank: 'MANUAL', code: 'tid_not_found', message: 'TID not found in VECO', needsDepartment: false },
      ],
      byBank: [{ bank: 'HSBC', count: 2, total: '180.00' }, { bank: 'MANUAL', count: 1, total: '5.00' }],
      total: '185.00',
      readyTotal: '100.00',
    };
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Push to VECO (test database)' }));
    expect(await screen.findByText('TID not found in VECO')).toBeInTheDocument();
    expect(screen.getByText('First receipt for this tenancy: choose Owner or Tenancy')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Department for T2002').length).toBeGreaterThan(0);
    expect(screen.getByText('Manual / no bank line')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Push 1 receipt' })).toBeEnabled();
  });
});
