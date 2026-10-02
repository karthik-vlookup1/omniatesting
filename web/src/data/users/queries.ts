import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createUser, listUsers, updateUser } from './api';
import type { UpdateUserInput, UserSummary } from './types';

export const usersQueryKey = ['users'] as const;

export function useUsers() {
  return useQuery({ queryKey: usersQueryKey, queryFn: ({ signal }) => listUsers(signal) });
}

/** Puts the server's returned row into the cached list so the table updates without a refetch. */
function upsert(list: UserSummary[] | undefined, user: UserSummary): UserSummary[] | undefined {
  if (!list) return list;
  const i = list.findIndex((u) => u.id === user.id);
  if (i === -1) return [...list, user];
  const next = list.slice();
  next[i] = user;
  return next;
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createUser,
    onSuccess: (user) => {
      qc.setQueryData<UserSummary[]>(usersQueryKey, (list) => upsert(list, user));
      void qc.invalidateQueries({ queryKey: usersQueryKey });
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) => updateUser(id, input),
    onSuccess: (user) => {
      qc.setQueryData<UserSummary[]>(usersQueryKey, (list) => upsert(list, user));
      void qc.invalidateQueries({ queryKey: usersQueryKey });
    },
  });
}
