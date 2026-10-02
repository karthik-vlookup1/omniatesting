import { apiRequest } from '../../lib/api';
import type { CreateUserInput, UpdateUserInput, UserSummary } from './types';

/** Real endpoints, admin only: Omnia_recon-backend server/src/api/auth/routes.ts usersRouter. */

export async function listUsers(signal?: AbortSignal): Promise<UserSummary[]> {
  const { users } = await apiRequest<{ users: UserSummary[] }>('/users', { signal });
  return users;
}

export async function createUser(input: CreateUserInput): Promise<UserSummary> {
  const { user } = await apiRequest<{ user: UserSummary }>('/users', {
    method: 'POST',
    body: { email: input.email.trim(), fullName: input.fullName.trim(), role: input.role, password: input.password },
  });
  return user;
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<UserSummary> {
  const { user } = await apiRequest<{ user: UserSummary }>(`/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  });
  return user;
}
