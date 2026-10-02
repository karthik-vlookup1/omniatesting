import { QueryClient } from '@tanstack/react-query';
import { isApiError } from './api';

/**
 * Query defaults for an internal finance tool: data is fresh for 30 s, nothing refetches just
 * because a window regained focus, and 4xx answers are never retried (they will not change).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (isApiError(error) && error.isClientError) return false;
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}
