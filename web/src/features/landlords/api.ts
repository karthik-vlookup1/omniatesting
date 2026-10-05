import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { propertiesKeys } from '../properties/api';

export interface Landlord {
  id: string;
  landlordRef: string | null;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface LandlordInput {
  landlordRef?: string | null;
  name?: string;
  email?: string | null;
  phone?: string | null;
}

export const landlordsKeys = {
  all: ['landlords'] as const,
  list: (q: string) => ['landlords', 'list', q.trim()] as const,
};

export async function listLandlords(q: string, signal?: AbortSignal): Promise<Landlord[]> {
  const { landlords } = await apiRequest<{ landlords: Landlord[] }>('/landlords', { query: { q: q.trim() || undefined }, signal });
  return landlords;
}

export function useLandlords(q = '') {
  return useQuery({
    queryKey: landlordsKeys.list(q),
    queryFn: ({ signal }) => listLandlords(q, signal),
    placeholderData: keepPreviousData,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: landlordsKeys.all });
    // Property rows show the landlord name.
    void qc.invalidateQueries({ queryKey: propertiesKeys.all });
  };
}

export function useCreateLandlord() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: LandlordInput) => apiRequest<{ id: string }>('/landlords', { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateLandlord() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: LandlordInput }) =>
      apiRequest<{ landlord: Landlord }>(`/landlords/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }),
    onSuccess: invalidate,
  });
}
