import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMe, login, logout, type Role } from './api';

export const ME_KEY = ['auth', 'me'] as const;

export function useCurrentUser() {
  return useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: 60_000, retry: false });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => login(email, password),
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      // Drop every cached query: nothing from the previous user may stay on screen.
      qc.clear();
      qc.setQueryData(ME_KEY, null);
    },
  });
}

/** Mirrors the server's requireRole(): admin is always allowed. */
export function hasRole(role: Role | undefined, ...allowed: Role[]): boolean {
  return role === 'admin' || (role !== undefined && allowed.includes(role));
}
