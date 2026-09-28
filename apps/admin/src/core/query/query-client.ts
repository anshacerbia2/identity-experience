import { QueryClient } from '@tanstack/react-query';

// Server state lives in TanStack Query and nowhere else (STD-GLB-FE-001 §3). Queries stay fresh
// for at least five seconds, and a failed read is retried only because a read is idempotent;
// mutations are never retried here (STD-GLB-FE-010 §3.4).
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 5_000, retry: 2, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}
