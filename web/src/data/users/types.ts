import type { AuthUser, Role } from '../auth/types';

/** Mirrors UserSummary in Omnia_recon-backend server/src/services/auth.service.ts (FRONTEND_REFERENCE.md §5.2). */
export interface UserSummary extends AuthUser {
  isActive: boolean;
  /** ISO-8601 timestamps. */
  lastLoginAt: string | null;
  lockedUntil: string | null;
  createdAt: string;
}

export interface CreateUserInput {
  email: string;
  fullName: string;
  role: Role;
  password: string;
}

/** PATCH /users/:id takes any subset; the server refuses an empty one ("Nothing to update"). */
export interface UpdateUserInput {
  fullName?: string;
  role?: Role;
  isActive?: boolean;
  password?: string;
}

/** What each role may do (FRONTEND_REFERENCE.md §3), shown when choosing a role. */
export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: 'Everything, including users, bank accounts, CSV profiles and Veco sync.',
  accounts: 'Everything operational: upload, review, CSV profiles, exports and Xero. Sees full NI numbers.',
  staff: 'Upload statements, review and confirm lines, search tenancies (masked NI).',
  readonly: 'View only. Cannot change any data.',
};
