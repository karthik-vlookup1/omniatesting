import type { AuthUser, Role } from './types';

/**
 * What each role may do, as the backend enforces it (server/src/api/auth/middleware.ts and
 * docs/ARCHITECTURE.md §5). The UI uses this only to hide actions; the server is the authority.
 *
 * - write:       requireWriter = admin, accounts, staff (readonly cannot change data)
 * - manageUsers: /api/users is requireRole() = admin only
 * - viewFullNi:  full NI shown only to admin / accounts
 */
export type Capability = 'write' | 'manageUsers' | 'viewFullNi';

const CAPABILITIES: Record<Capability, readonly Role[]> = {
  write: ['admin', 'accounts', 'staff'],
  manageUsers: ['admin'],
  viewFullNi: ['admin', 'accounts'],
};

export function can(user: Pick<AuthUser, 'role'> | null | undefined, capability: Capability): boolean {
  return Boolean(user && CAPABILITIES[capability].includes(user.role));
}
