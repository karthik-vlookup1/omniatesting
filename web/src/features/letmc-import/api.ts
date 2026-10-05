import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';

export type EntityType = 'landlords' | 'properties' | 'tenants' | 'tenancies';

export interface FieldSpec {
  field: string;
  label: string;
  aliases: string[];
  required: 'always' | 'create' | false;
}

export interface ReportCounts {
  rows: number;
  create: number;
  update: number;
  unchanged: number;
  duplicate: number;
  rejected: number;
}

export interface ReportRow {
  line: number;
  key: string;
  action: 'create' | 'update' | 'unchanged' | 'duplicate';
  changes: string[];
  warnings: string[];
}

export interface ReportError {
  line: number;
  key: string;
  field: string;
  reason: string;
}

export interface LetmcReport {
  entityType: EntityType;
  fileName: string;
  fileSha256: string;
  cutoverDate: string | null;
  dryRun: boolean;
  counts: ReportCounts;
  rows: ReportRow[];
  errors: ReportError[];
  openingBalances: {
    charges: { count: number; totalPence: number };
    credits: { count: number; totalPence: number };
  };
}

export interface LetmcRun {
  id: string;
  entityType: EntityType;
  fileName: string;
  cutoverDate: string | null;
  counts: ReportCounts;
  createdAt: string;
}

export interface ImportInput {
  entityType: EntityType;
  file: File;
  cutoverDate?: string;
  /** Commit only: the checksum the preview returned. */
  previewSha256?: string;
}

export const letmcKeys = {
  layout: ['letmc-layout'] as const,
  runs: ['letmc-runs'] as const,
};

export async function fetchLayout(signal?: AbortSignal): Promise<Record<EntityType, FieldSpec[]>> {
  const { layouts } = await apiRequest<{ layouts: Record<EntityType, FieldSpec[]> }>('/imports/letmc/layout', { signal });
  return layouts;
}

function toForm(input: ImportInput): FormData {
  const form = new FormData();
  form.append('entityType', input.entityType);
  if (input.cutoverDate) form.append('cutoverDate', input.cutoverDate);
  if (input.previewSha256) form.append('previewSha256', input.previewSha256);
  form.append('file', input.file, input.file.name);
  return form;
}

export async function previewImport(input: ImportInput): Promise<LetmcReport> {
  const { report } = await apiRequest<{ report: LetmcReport }>('/imports/letmc/preview', { method: 'POST', body: toForm(input) });
  return report;
}

export async function commitImport(input: ImportInput): Promise<{ runId: string; report: LetmcReport }> {
  return apiRequest<{ runId: string; report: LetmcReport }>('/imports/letmc/commit', { method: 'POST', body: toForm(input) });
}

export function useLetmcLayout() {
  return useQuery({ queryKey: letmcKeys.layout, queryFn: ({ signal }) => fetchLayout(signal) });
}

export function useLetmcRuns() {
  return useQuery({
    queryKey: letmcKeys.runs,
    queryFn: async ({ signal }) => {
      const { runs } = await apiRequest<{ runs: LetmcRun[] }>('/imports/letmc/runs', { signal });
      return runs;
    },
  });
}
