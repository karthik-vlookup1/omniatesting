import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { sessionQueryKey } from '../../data/auth';
import { setUnauthorizedHandler } from '../../lib/api';
import { loginPath } from './redirect';

/**
 * When any request answers 401 mid-use (idle timeout, absolute expiry, account deactivated),
 * drop every cached record and send the user to sign in, returning here afterwards.
 */
export function useSessionExpiry(): void {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const here = useRef(location.pathname + location.search);

  useEffect(() => {
    here.current = location.pathname + location.search;
  }, [location.pathname, location.search]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (queryClient.getQueryData(sessionQueryKey) === null) return;
      queryClient.clear();
      queryClient.setQueryData(sessionQueryKey, null);
      navigate(loginPath(here.current, 'expired'), { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient, navigate]);
}
