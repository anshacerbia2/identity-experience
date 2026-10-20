import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, useCommandPost } from '@identity-experience/app-core/api';
import { normalizeReason } from '@identity-experience/app-core/domain/reason';
import { useSession } from '@identity-experience/app-core/session';

import type {
  ApplicationDeveloper,
  CreatePrincipalRequest,
  DanglingMapping,
  PendingMapping,
  PrincipalAdoption,
  PrincipalCreated,
  PrincipalSweep,
  QuarantinedMapping,
  ReleaseResult,
  RelinkResult,
  UnmappedUser,
} from '@/domain/principal';

// The Principal reads and commands (TDD-identity-control-001), through the BFF.

export const principalKeys = {
  all: ['principals'] as const,
  dangling: ['principals', 'dangling'] as const,
  unmapped: ['principals', 'unmapped'] as const,
  pending: ['principals', 'pending'] as const,
  quarantined: ['principals', 'quarantined'] as const,
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

// usePending and useQuarantined read the mappings held in pending and in quarantined
// (TDD-identity-control-001 1.18.0), each only once its list is opened: they name kernel usernames, and
// they are bounded by recovery and the reconciler, not a listing of the Principal population.
export function usePending(enabled: boolean) {
  return useQuery({
    queryKey: principalKeys.pending,
    enabled,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) =>
      (await apiGet<{ readonly pending: readonly PendingMapping[] | null }>('/v1/principals:pending', signal))
        .pending ?? [],
  });
}

export function useQuarantined(enabled: boolean) {
  return useQuery({
    queryKey: principalKeys.quarantined,
    enabled,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) =>
      (
        await apiGet<{ readonly quarantined: readonly QuarantinedMapping[] | null }>(
          '/v1/principals:quarantined',
          signal,
        )
      ).quarantined ?? [],
  });
}

function useCsrfToken(): string {
  const session = useSession();
  return session.data?.authenticated === true ? session.data.csrfToken : '';
}

// useCreatePrincipal creates a Principal under an Idempotency-Key the caller holds: a retry of the
// same request after an outage uses the same key, so a second Principal never appears.
export function useCreatePrincipal() {
  const post = useCommandPost();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({
      request,
      idempotencyKey,
    }: {
      readonly request: CreatePrincipalRequest;
      readonly idempotencyKey: string;
    }) =>
      post<PrincipalCreated>('/v1/principals', request, {
        csrfToken: token,
        headers: { 'idempotency-key': idempotencyKey },
      }),
  });
}

export function useRelink() {
  const post = useCommandPost();
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({ principalId, reason }: { readonly principalId: string; readonly reason: string }) =>
      post<RelinkResult>(
        `/v1/principals/${encodeURIComponent(principalId)}:relink`,
        {},
        { csrfToken: token, headers: { 'x-administrative-reason': normalizeReason(reason) } },
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: principalKeys.all }),
  });
}

// useRelease ends the reconciler's hold on a quarantined Principal (TDD-identity-control-001 1.18.0
// §Leaving Quarantine), naming the kernel user the triage decided is the person. It carries a reason
// and, from useCommandPost, an Idempotency-Key the API replays. The Principal lands in suspended, so
// it is read again, and so are the held lists; its sections are not, since each read is recorded.
export function useRelease() {
  const post = useCommandPost();
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({
      principalId,
      username,
      reason,
    }: {
      readonly principalId: string;
      readonly username: string;
      readonly reason: string;
    }) =>
      post<ReleaseResult>(
        `/v1/principals/${encodeURIComponent(principalId)}:release`,
        { username: username.trim() },
        { csrfToken: token, headers: { 'x-administrative-reason': normalizeReason(reason) } },
      ),
    onSettled: (_data, _error, { principalId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['principals', 'detail', principalId], exact: true }),
        queryClient.invalidateQueries({ queryKey: principalKeys.quarantined }),
        queryClient.invalidateQueries({ queryKey: principalKeys.pending }),
      ]),
  });
}

// useAdopt plans or performs the adoption of an orphan's identifier (ADR-IAM-001 §5.11,
// TDD-identity-control-001 1.23.0). A plan and an adoption are different requests, so useCommandPost
// gives each its own Idempotency-Key: the adoption is never answered with the plan's replay. Both carry
// the reason. An adoption the checks refuse is a 409 whose detail names the check.
export function useAdopt() {
  const post = useCommandPost();
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({
      principalId,
      reason,
      dryRun,
    }: {
      readonly principalId: string;
      readonly reason: string;
      readonly dryRun: boolean;
    }) =>
      post<PrincipalAdoption>(
        `/v1/principals/${encodeURIComponent(principalId)}:adopt`,
        { dry_run: dryRun },
        { csrfToken: token, headers: { 'x-administrative-reason': normalizeReason(reason) } },
      ),
    onSuccess: (adoption) =>
      adoption.adopted ? queryClient.invalidateQueries({ queryKey: principalKeys.unmapped }) : undefined,
  });
}

// usePrincipalSweep runs pending recovery and the dangling-mapping sweep now, as the schedule does.
export function usePrincipalSweep() {
  const post = useCommandPost();
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: () => post<PrincipalSweep>('/v1/principals:reconcile', {}, { csrfToken: token }),
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
  const post = useCommandPost();
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({ principalId, reason }: { readonly principalId: string; readonly reason: string }) =>
      post<Developers>(
        '/v1/application-developers',
        { principal_id: principalId.trim() },
        { csrfToken: token, headers: { 'x-administrative-reason': normalizeReason(reason) } },
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: principalKeys.developers }),
  });
}

export function useRevokeDeveloper() {
  const post = useCommandPost();
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({ principalId, reason }: { readonly principalId: string; readonly reason: string }) =>
      post<Developers>(
        `/v1/application-developers/${encodeURIComponent(principalId)}:revoke`,
        {},
        { csrfToken: token, headers: { 'x-administrative-reason': normalizeReason(reason) } },
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: principalKeys.developers }),
  });
}
