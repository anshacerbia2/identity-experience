import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiPost } from '@identity-experience/app-core/api';
import { normalizeReason } from '@identity-experience/app-core/domain/reason';
import { useSession } from '@identity-experience/app-core/session';

import type {
  ApplicationDeveloper,
  CreatePrincipalRequest,
  DanglingMapping,
  PrincipalCreated,
  PrincipalSweep,
  RelinkResult,
  UnmappedUser,
} from '@/domain/principal';

// The Principal reads and commands (TDD-identity-control-001), through the BFF.

export const principalKeys = {
  all: ['principals'] as const,
  dangling: ['principals', 'dangling'] as const,
  unmapped: ['principals', 'unmapped'] as const,
  developers: ['principals', 'application-developers'] as const,
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

// useUnmapped reads the kernel users no mapping accounts for: the sweep's open unmapped, orphan and
// duplicate findings, oldest first. Like the dangling list it is bounded by what the sweep found.
export function useUnmapped() {
  return useQuery({
    queryKey: principalKeys.unmapped,
    queryFn: async ({ signal }) =>
      (await apiGet<{ readonly unmapped: readonly UnmappedUser[] | null }>('/v1/principals:unmapped', signal))
        .unmapped ?? [],
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

type Developers = { readonly developers: readonly ApplicationDeveloper[] | null };

// The application developer grants, newest first, revoked ones included.
export function useApplicationDevelopers() {
  return useQuery({
    queryKey: principalKeys.developers,
    queryFn: async ({ signal }) =>
      (await apiGet<Developers>('/v1/application-developers', signal)).developers ?? [],
  });
}

// useGrantDeveloper grants a person the standing, and useRevokeDeveloper ends it, each with a reason.
export function useGrantDeveloper() {
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({ principalId, reason }: { readonly principalId: string; readonly reason: string }) =>
      apiPost<Developers>(
        '/v1/application-developers',
        { principal_id: principalId.trim() },
        { csrfToken: token, headers: { 'x-administrative-reason': normalizeReason(reason) } },
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: principalKeys.developers }),
  });
}

export function useRevokeDeveloper() {
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({ principalId, reason }: { readonly principalId: string; readonly reason: string }) =>
      apiPost<Developers>(
        `/v1/application-developers/${encodeURIComponent(principalId)}:revoke`,
        {},
        { csrfToken: token, headers: { 'x-administrative-reason': normalizeReason(reason) } },
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: principalKeys.developers }),
  });
}
