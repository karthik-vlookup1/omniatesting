import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { changePassword, fetchSession, login, logout } from './api';

export const sessionQueryKey = ['auth', 'session'] as const;

/**
 * The current session. Checked once on start-up and kept until sign-in, sign-out or a 401
 * changes it, so navigating never re-asks the server.
 */
export function useSession() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: ({ signal }) => fetchSession(signal),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: (user) => {
      // A different person may have been signed in before: start from an empty cache.
      queryClient.clear();
      queryClient.setQueryData(sessionQueryKey, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(sessionQueryKey, null);
    },
  });
}

export function useChangePassword() {
  return useMutation({ mutationFn: changePassword });
}
