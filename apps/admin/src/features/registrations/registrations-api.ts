import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, useCommandPost } from '@identity-experience/app-core/api';
import { normalizeReason } from '@identity-experience/app-core/domain/reason';
import {
  type DriftException,
  type DriftStatus,
  type ExpiringKeys,
  type ExceptionField,
  type Finding,
  type Owner,
  type ReconcileRun,
  type RegistrationPage,
  type RegistrationState,
} from '@identity-experience/app-core/domain/registration';
import { registrationKeys as sharedRegistrationKeys } from '@identity-experience/app-core/registrations';
import { requireToken, useCsrfToken } from '@identity-experience/app-core/session';

// The registration and drift reads (TDD-identity-control-003 §API / Interface), through the BFF.

const pageSize = 50;

// The shared keys (one registration, its keys, its owners) and this application's own, under the
// same prefix, so a command settled anywhere reads every registration query again.
export const registrationKeys = {
  ...sharedRegistrationKeys,
  list: (state: RegistrationState | undefined) => ['registrations', 'list', state ?? 'all'] as const,
  findings: (registrationId: string) => ['registrations', 'findings', registrationId] as const,
  exceptions: (registrationId: string) => ['registrations', 'exceptions', registrationId] as const,
  drift: ['registrations', 'drift'] as const,
  expiringKeys: ['registrations', 'expiring-keys'] as const,
};

// useRegistrationPages pages by the API's cursor. Each page is kept, so "load more" appends and a
// refetch reads the same pages again rather than jumping back to the first.
export function useRegistrationPages(state: RegistrationState | undefined) {
  return useInfiniteQuery({
    queryKey: registrationKeys.list(state),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (pageParam !== null) {
        params.set('after', pageParam);
      }
      if (state !== undefined) {
        params.set('state', state);
      }
      return apiGet<RegistrationPage>(`/v1/registrations?${params.toString()}`, signal);
    },
    getNextPageParam: (last) => last.next,
  });
}

export function useDriftStatus() {
  return useQuery({
    queryKey: registrationKeys.drift,
    queryFn: ({ signal }) => apiGet<DriftStatus>('/v1/registrations:drift', signal),
  });
}

// useExpiringKeys reads the key expiry warning. It is read-only, and the order is the API's: most
// urgent first.
export function useExpiringKeys() {
  return useQuery({
    queryKey: registrationKeys.expiringKeys,
    queryFn: ({ signal }) => apiGet<ExpiringKeys>('/v1/registrations:expiring-keys', signal),
  });
}

export function useFindings(registrationId: string) {
  return useQuery({
    queryKey: registrationKeys.findings(registrationId),
    queryFn: async ({ signal }) =>
      (
        await apiGet<{ readonly findings: readonly Finding[] | null }>(
          `/v1/registrations/${encodeURIComponent(registrationId)}/findings`,
          signal,
        )
      ).findings ?? [],
  });
}

// useExceptions is one registration's drift exceptions, newest first, expired ones included.
export function useExceptions(registrationId: string) {
  return useQuery({
    queryKey: registrationKeys.exceptions(registrationId),
    queryFn: async ({ signal }) =>
      (
        await apiGet<{ readonly exceptions: readonly DriftException[] | null }>(
          `/v1/registrations/${encodeURIComponent(registrationId)}/drift-exceptions`,
          signal,
        )
      ).exceptions ?? [],
  });
}

// The commands. Each carries the session's CSRF token, and each, once settled, reads every
// registration query again: a sweep or a resolution changes the drift summary, the counts beside
// each client, and the findings of the one it touched.

interface ReconcileResponse {
  readonly run: ReconcileRun | null;
  readonly status: DriftStatus;
  readonly deferred?: boolean;
}

// useRunSweep asks for a sweep now. deferred means another replica's sweep is running; its result
// arrives with that sweep.
export function useRunSweep() {
  const post = useCommandPost();
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: () =>
      post<ReconcileResponse>('/v1/registrations:reconcile', {}, { csrfToken: requireToken(token) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: registrationKeys.all }),
  });
}

// useApplyDesiredState applies the registered state to one finding the sweep will not settle on
// its own, with the operator's reason, which the API records on the finding.
export function useApplyDesiredState() {
  const post = useCommandPost();
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({ findingId, reason }: { readonly findingId: string; readonly reason: string }) =>
      post<ReconcileResponse>(
        '/v1/registrations:reconcile',
        { findings: [findingId] },
        { csrfToken: requireToken(token), headers: { 'x-administrative-reason': normalizeReason(reason) } },
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: registrationKeys.all }),
  });
}

export interface ExceptionRequest {
  readonly fieldClass: ExceptionField;
  readonly actor: string;
  readonly reason: string;
  readonly hours: number;
}

// useGrantException lets one Keycloak user change one field class of this client in the console,
// for a bounded time.
export function useGrantException(registrationId: string) {
  const post = useCommandPost();
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: (request: ExceptionRequest) =>
      post<DriftException>(
        `/v1/registrations/${encodeURIComponent(registrationId)}/drift-exceptions`,
        {
          field_class: request.fieldClass,
          actor: request.actor.trim(),
          reason: normalizeReason(request.reason),
          duration_seconds: request.hours * 3600,
        },
        { csrfToken: requireToken(token) },
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: registrationKeys.all }),
  });
}

const ownersPath = (registrationId: string): `/v1/${string}` =>
  `/v1/registrations/${encodeURIComponent(registrationId)}/owners`;

// useGrantOwner makes a person an owner of a registration, and useRevokeOwner ends one's ownership,
// each with a reason (TDD-identity-control-003 §Registration Ownership). Both are a provider's. The API
// takes no Idempotency-Key: a second grant is refused as already an owner, a second revocation as no
// active ownership. The owners are read again either way.
export function useGrantOwner(registrationId: string) {
  const post = useCommandPost();
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({ principalId, reason }: { readonly principalId: string; readonly reason: string }) =>
      post<{ readonly owners: readonly Owner[] | null }>(
        ownersPath(registrationId),
        { principal_id: principalId.trim().toLowerCase() },
        { csrfToken: requireToken(token), headers: { 'x-administrative-reason': normalizeReason(reason) } },
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: registrationKeys.owners(registrationId) }),
  });
}

export function useRevokeOwner(registrationId: string) {
  const post = useCommandPost();
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({ principalId, reason }: { readonly principalId: string; readonly reason: string }) =>
      post<{ readonly owners: readonly Owner[] | null }>(
        `${ownersPath(registrationId)}/${encodeURIComponent(principalId)}:revoke`,
        {},
        { csrfToken: requireToken(token), headers: { 'x-administrative-reason': normalizeReason(reason) } },
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: registrationKeys.owners(registrationId) }),
  });
}
