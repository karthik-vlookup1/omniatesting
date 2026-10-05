import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';

export type PropertyStatusFilter = 'all' | 'active' | 'inactive';
export type ManagementType = 'RG' | 'MG' | 'IRG';

export interface Property {
  id: string;
  propertyRef: string;
  branchId: string;
  branchCode: string;
  landlordId: string | null;
  landlordName: string | null;
  addressLine1: string;
  addressLine2: string | null;
  town: string | null;
  postcode: string;
  bedrooms: number | null;
  brma: string | null;
  defaultManagementType: ManagementType | null;
  isActive: boolean;
}

export interface PropertyCreateInput {
  propertyRef: string;
  branchId: string;
  landlordId?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  town?: string | null;
  postcode: string;
  bedrooms?: number | null;
  brma?: string | null;
  defaultManagementType?: ManagementType | null;
}

export type PropertyPatchInput = Partial<Omit<PropertyCreateInput, 'propertyRef'> & { isActive: boolean }>;

export interface PropertyFilters {
  q: string;
  branchId: string | null;
  status: PropertyStatusFilter;
}

export const propertiesKeys = {
  all: ['properties'] as const,
  list: (f: PropertyFilters) => ['properties', 'list', f.status, f.branchId ?? '', f.q.trim()] as const,
};

export async function listProperties(f: PropertyFilters, signal?: AbortSignal): Promise<Property[]> {
  const { properties } = await apiRequest<{ properties: Property[] }>('/properties', {
    query: { q: f.q.trim() || undefined, branchId: f.branchId ?? undefined, status: f.status === 'all' ? undefined : f.status },
    signal,
  });
  return properties;
}

export function useProperties(filters: PropertyFilters) {
  return useQuery({
    queryKey: propertiesKeys.list(filters),
    queryFn: ({ signal }) => listProperties(filters, signal),
    placeholderData: keepPreviousData,
  });
}

export function useCreateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PropertyCreateInput) => apiRequest<{ id: string }>('/properties', { method: 'POST', body: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: propertiesKeys.all }),
  });
}

export function useUpdateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PropertyPatchInput }) =>
      apiRequest<{ property: Property }>(`/properties/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: propertiesKeys.all }),
  });
}
