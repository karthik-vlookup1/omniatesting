import type { AuthUser, Role } from './types';

/**
 * What each role may do, as the backend enforces it (server/src/api/auth/middleware.ts and
 * docs/ARCHITECTURE.md §5). The UI uses this only to hide actions; the server is the authority.
 *
 * - write:       requireWriter = admin, accounts, staff (readonly cannot change data)
 * - manageUsers: /api/users is requireRole() = admin only
 * - viewFullNi:  full NI shown only to admin / accounts
 * - finance:     Vico export and Xero posting are requireRole('accounts') = admin, accounts
 * - settings:    bank, Vico and Xero settings are requireRole() = admin only
 * - vecoPush:    the Push to VECO area is admin + accounts; each person's own permission (a linked VECO user with
 *                can_push) comes from GET /api/veco-push/status, not from the role
 */
export type Capability = 'write' | 'manageUsers' | 'viewFullNi' | 'finance' | 'settings' | 'vecoPush';

const CAPABILITIES: Record<Capability, readonly Role[]> = {
  write: ['admin', 'accounts', 'staff'],
  manageUsers: ['admin'],
  viewFullNi: ['admin', 'accounts'],
  finance: ['admin', 'accounts'],
  settings: ['admin'],
  vecoPush: ['admin', 'accounts'],
};

export function can(user: Pick<AuthUser, 'role'> | null | undefined, capability: Capability): boolean {
  return Boolean(user && CAPABILITIES[capability].includes(user.role));
}
