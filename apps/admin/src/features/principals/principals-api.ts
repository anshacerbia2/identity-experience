import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiPost } from '@/core/api/api-client';
import { useSession } from '@/core/session/session';
import type {
  CreatePrincipalRequest,
  DanglingMapping,
  PrincipalCreated,
  PrincipalSweep,
  RelinkResult,
} from '@/domain/principal';
import { normalizeReason } from '@/domain/reason';

// The Principal reads and commands (TDD-identity-control-001), through the BFF.

export const principalKeys = {
  all: ['principals'] as const,
  dangling: ['principals', 'dangling'] as const,
};

export function useDangling() {
  return useQuery({
    queryKey: principalKeys.dangling,
    queryFn: async ({ signal }) =>
      (
        await apiGet<{ readonly dangling: readonly DanglingMapping[] | null }>(
          '/v1/principals:dangling',
          signal,
        )
      ).dangling ?? [],
  });
}

function useCsrfToken(): string {
  const session = useSession();
  return session.data?.authenticated === true ? session.data.csrfToken : '';
}

// useCreatePrincipal creates a Principal under an Idempotency-Key the caller holds: a retry of the
// same request after an outage uses the same key, so a second Principal never appears.
export function useCreatePrincipal() {
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({
      request,
      idempotencyKey,
    }: {
      readonly request: CreatePrincipalRequest;
      readonly idempotencyKey: string;
    }) =>
      apiPost<PrincipalCreated>('/v1/principals', request, {
        csrfToken: token,
        headers: { 'idempotency-key': idempotencyKey },
      }),
  });
}

export function useRelink() {
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({ principalId, reason }: { readonly principalId: string; readonly reason: string }) =>
      apiPost<RelinkResult>(
        `/v1/principals/${encodeURIComponent(principalId)}:relink`,
        {},
        { csrfToken: token, headers: { 'x-administrative-reason': normalizeReason(reason) } },
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: principalKeys.all }),
  });
}

// usePrincipalSweep runs pending recovery and the dangling-mapping sweep now, as the schedule does.
export function usePrincipalSweep() {
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: () => apiPost<PrincipalSweep>('/v1/principals:reconcile', {}, { csrfToken: token }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: principalKeys.all }),
  });
}
