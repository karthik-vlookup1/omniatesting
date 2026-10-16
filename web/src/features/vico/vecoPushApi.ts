/** Push to VECO (test database) API client. Everything is under /api/veco-push. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ApiError, CSRF_HEADER, CSRF_HEADER_VALUE, type ApiErrorCode } from '../../lib/api';

export type Department = 'Owner' | 'Tenancy';

export interface VecoPushStatus {
  configured: boolean;
  targetDb: string;
  me: {
    linked: boolean;
    staffFk: string | null;
    canPush: boolean;
    source: 'email' | 'admin' | null;
    linkProblem: string | null;
  };
}

export interface HeldReceipt {
  receiptId: string;
  tid: string;
  amount: string;
  paymentDate: string;
  sourceBank: string;
  code: string;
  message: string;
  needsDepartment: boolean;
}

export interface ReadyReceipt {
  receiptId: string;
  tid: string;
  tenantName: string | null;
  amount: string;
  paymentDate: string;
  sourceBank: string;
  department: string;
  departmentFromVeco: boolean;
}

export interface BankTotal {
  bank: string;
  count: number;
  total: string;
}

export interface Totals {
  count: number;
  total: string;
  byBank: BankTotal[];
}

export interface PreviewResult {
  ready: ReadyReceipt[];
  held: HeldReceipt[];
  byBank: BankTotal[];
  total: string;
  readyTotal: string;
}

export interface CrossCheckRow {
  receiptId: string;
  transactionPk: string;
  tid: string;
  date: string;
  tenantName: string | null;
  property: string | null;
  landlord: string | null;
  department: string | null;
  amount: string;
  bankingRef: string;
  ok: boolean;
  diffs: string[];
}

export interface VerifyResult {
  ok: boolean;
  checkedAt: string;
  rows: CrossCheckRow[];
  before: Totals;
  after: Totals;
}

export type BatchStatus = 'previewed' | 'pushing' | 'pushed' | 'verified' | 'failed' | 'deleted';

export interface VecoPushBatch {
  id: string;
  batchReference: string;
  status: BatchStatus;
  receipts: number;
  total: string;
  totalsByBank: BankTotal[];
  held: HeldReceipt[];
  pushedBy: string;
  createdAt: string;
  pushedAt: string | null;
  verifiedAt: string | null;
  deletedAt: string | null;
  error: string | null;
  verifyOk: boolean | null;
}

export interface PushResult {
  batch: VecoPushBatch;
  verify: VerifyResult | null;
  held: HeldReceipt[];
  replay: boolean;
}

export interface StaffLinkRow {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  staffFk: string | null;
  canPush: boolean;
  source: 'email' | 'admin' | null;
}

export interface PushRequest {
  receiptIds: string[];
  departments: Record<string, Department>;
}

const KEY = ['veco-push'] as const;
const BASE = '/veco-push';

export function useVecoPushStatus() {
  return useQuery({ queryKey: [...KEY, 'status'], queryFn: () => apiRequest<VecoPushStatus>(`${BASE}/status`) });
}

export function usePreviewVecoPush() {
  return useMutation({
    mutationFn: (body: PushRequest) => apiRequest<PreviewResult>(`${BASE}/preview`, { method: 'POST', body }),
  });
}

export function usePushToVeco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PushRequest & { idempotencyKey: string }) =>
      apiRequest<PushResult>(`${BASE}/pushes`, { method: 'POST', body }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['vico'] });
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useVecoPushes() {
  return useQuery({
    queryKey: [...KEY, 'batches'],
    queryFn: () => apiRequest<{ batches: VecoPushBatch[] }>(`${BASE}/batches`).then((r) => r.batches),
  });
}

export function useVerifyVecoPush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ batch: VecoPushBatch; verify: VerifyResult | null }>(`${BASE}/batches/${id}/verify`, { method: 'POST', body: {} }),
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteVecoPush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ batch: VecoPushBatch; remaining: { transactions: number; allocations: number; total: string } }>(
        `${BASE}/batches/${id}`,
        { method: 'DELETE' },
      ),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['vico'] });
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

/** Fetches the read-back CSV and hands it to the browser as a download. */
export function useDownloadVecoReadback() {
  return useMutation({
    mutationFn: async (id: string): Promise<string> => {
      const res = await fetch(`/api${BASE}/batches/${id}/readback.csv`, {
        credentials: 'same-origin',
        headers: { [CSRF_HEADER]: CSRF_HEADER_VALUE },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
        throw new ApiError({
          status: res.status,
          code: (body.error?.code as ApiErrorCode | undefined) ?? (res.status >= 500 ? 'internal' : 'unknown'),
          message: body.error?.message ?? 'Download failed',
        });
      }
      const fileName = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'veco-push.csv';
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return fileName;
    },
  });
}

export function useVecoStaffLinks() {
  return useQuery({
    queryKey: [...KEY, 'staff-links'],
    queryFn: () => apiRequest<{ links: StaffLinkRow[] }>(`${BASE}/staff-links`).then((r) => r.links),
  });
}

export function useSaveVecoStaffLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; staffFk: string | null; canPush: boolean }) =>
      apiRequest<{ links: StaffLinkRow[] }>(`${BASE}/staff-links/${v.userId}`, {
        method: 'PUT',
        body: { staffFk: v.staffFk, canPush: v.canPush },
      }).then((r) => r.links),
    onSuccess: (links) => {
      qc.setQueryData([...KEY, 'staff-links'], links);
      void qc.invalidateQueries({ queryKey: [...KEY, 'status'] });
    },
  });
}
