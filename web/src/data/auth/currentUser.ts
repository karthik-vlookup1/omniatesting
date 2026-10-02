import { createContext, useContext } from 'react';
import type { AuthUser } from './types';

/**
 * The signed-in user, provided by `RequireAuth` only while a session exists. Components read it
 * from context rather than the session query, so when the session ends (sign-out, expiry) they
 * are unmounted by the guard before they could ever render without a user.
 */
export const CurrentUserContext = createContext<AuthUser | null>(null);

export function useCurrentUser(): AuthUser {
  const user = useContext(CurrentUserContext);
  if (!user) throw new Error('useCurrentUser used outside RequireAuth');
  return user;
}
