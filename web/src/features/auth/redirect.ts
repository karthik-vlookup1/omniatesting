/**
 * Where to go after sign-in. Only same-app paths are accepted, so a crafted
 * `/login?next=https://evil.example` link cannot bounce staff to another site.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  if (next.startsWith('/login')) return '/';
  return next;
}

export function loginPath(next: string, reason?: 'expired'): string {
  const params = new URLSearchParams();
  if (next && next !== '/') params.set('next', next);
  if (reason) params.set('reason', reason);
  const qs = params.toString();
  return qs ? `/login?${qs}` : '/login';
}
