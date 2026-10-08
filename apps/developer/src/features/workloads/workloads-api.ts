import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, useCommandPost } from '@identity-experience/app-core/api';
import { normalizeReason } from '@identity-experience/app-core/domain/reason';
import type { Workload } from '@identity-experience/app-core/domain/workload';
import { requireToken, useCsrfToken } from '@identity-experience/app-core/session';

// The workload owner's reads and review (ADR-IAM-003 §5.8, TDD-identity-control-004 1.7.0), through
// the BFF. The Identity Control API answers a workload the person does not own 404, the same as one
// that does not exist, so a workload here is always one the API says the person owns.

export const workloadKeys = {
  all: ['workloads'] as const,
  mine: ['workloads', 'mine'] as const,
  one: (principalId: string) => ['workloads', 'one', principalId] as const,
};

const workloadPath = (principalId: string): `/v1/${string}` =>
  `/v1/workloads/${encodeURIComponent(principalId)}`;

// useMyWorkloads lists the workloads the signed-in person owns, oldest first, each with its last
// review and the date the next is due. An empty answer, null included, is an empty list.
export function useMyWorkloads() {
  return useQuery({
    queryKey: workloadKeys.mine,
    queryFn: async ({ signal }) =>
      (await apiGet<{ readonly workloads: readonly Workload[] | null }>('/v1/workloads:mine', signal))
        .workloads ?? [],
  });
}

export function useWorkload(principalId: string) {
  return useQuery({
    queryKey: workloadKeys.one(principalId),
    queryFn: ({ signal }) => apiGet<Workload>(workloadPath(principalId), signal),
  });
}

// useReview records the owner's review. The statement travels as X-Administrative-Reason, which the
// API records as the owner's word, and the command carries an Idempotency-Key, so a retry after an
// unknown outcome records one review. The workload the API answers replaces the one read, and the
// list is read again for its new dates.
export function useReview(principalId: string) {
  const post = useCommandPost();
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({ statement }: { readonly statement: string }) =>
      post<Workload>(
        `${workloadPath(principalId)}:review`,
        {},
        {
          csrfToken: requireToken(token),
          headers: { 'x-administrative-reason': normalizeReason(statement) },
        },
      ),
    onSuccess: (reviewed) => {
      queryClient.setQueryData(workloadKeys.one(principalId), reviewed);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: workloadKeys.all }),
  });
}
