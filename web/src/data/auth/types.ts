/**
 * Mirrors Omnia_recon-backend server/src/services/auth.service.ts. Keep in step with the API.
 */
export const ROLES = ['admin', 'accounts', 'staff', 'readonly'] as const;
export type Role = (typeof ROLES)[number];

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  accounts: 'Accounts',
  staff: 'Staff',
  readonly: 'Read-only',
};

export interface LoginInput {
  email: string;
  password: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/** Server rule (PasswordSchema): 12–256 characters. Checked client-side for fast feedback only. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;
