import { QueryCache, QueryClient } from '@tanstack/react-query';

import { ApiError } from '../api/api-client';
import { sessionQueryKey } from '../session/session';

// Server state lives in TanStack Query and nowhere else (STD-GLB-FE-001 §3). Queries stay fresh
// for at least five seconds. A failed read is retried, because a read is idempotent, but never a
// refusal: a 4xx answers the same the second time. Mutations are never retried here
// (STD-GLB-FE-010 §3.4).
//
// A 401 from the API means the BFF ended the session (a refused refresh, a revocation, an expiry).
// The session is read again, so the shell shows the user as signed out instead of showing a page
// of errors.
export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        // A step-up challenge is not an ended session: the BFF kept it (TDD-identity-experience-001
        // §Step-Up), so the shell must not show the user as signed out.
        if (error instanceof ApiError && error.status === 401 && error.stepUpMaxAge === null) {
          void client.invalidateQueries({ queryKey: sessionQueryKey });
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        retry: (failures, error) => !(error instanceof ApiError && error.isClientError) && failures < 2,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
  return client;
}
