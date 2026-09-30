import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiPost } from '@/core/api/api-client';
import { useSession } from '@/core/session/session';
import { normalizeReason } from '@/domain/reason';
import type { CreateWorkloadRequest, ReassignRequest, Workload } from '@/domain/workload';

// The workload reads and commands (TDD-identity-control-004), through the BFF.

export const workloadKeys = {
  all: ['workloads'] as const,
  one: (principalId: string) => ['workloads', principalId] as const,
};

function useCsrfToken(): string {
  const session = useSession();
  return session.data?.authenticated === true ? session.data.csrfToken : '';
}

// useWorkload reads one workload by its principal_id. There is no list of every workload, as there
// is none of every Principal: a workload is found by the identifier its owner holds.
export function useWorkload(principalId: string | null) {
  return useQuery({
    queryKey: workloadKeys.one(principalId ?? ''),
    enabled: principalId !== null,
    queryFn: ({ signal }) =>
      apiGet<Workload>(`/v1/workloads/${encodeURIComponent(principalId ?? '')}`, signal),
  });
}

// useCreateWorkload creates a workload under an Idempotency-Key the caller holds: a retry of the same
// request after an outage uses the same key, so a second workload never appears.
export function useCreateWorkload() {
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({
      request,
      idempotencyKey,
    }: {
      readonly request: CreateWorkloadRequest;
      readonly idempotencyKey: string;
    }) =>
      apiPost<Workload>('/v1/workloads', request, {
        csrfToken: token,
        headers: { 'idempotency-key': idempotencyKey },
      }),
  });
}

export function useReassign() {
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({
      principalId,
      request,
      reason,
    }: {
      readonly principalId: string;
      readonly request: ReassignRequest;
      readonly reason: string;
    }) =>
      apiPost<Workload>(`/v1/workloads/${encodeURIComponent(principalId)}:reassign`, request, {
        csrfToken: token,
        headers: { 'x-administrative-reason': normalizeReason(reason) },
      }),
    onSuccess: (moved) => {
      queryClient.setQueryData(workloadKeys.one(moved.principal_id), moved);
    },
  });
}
