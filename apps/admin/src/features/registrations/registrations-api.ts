import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiPost } from '@/core/api/api-client';
import { useSession } from '@/core/session/session';
import { normalizeReason } from '@/domain/reason';
import {
  type DriftException,
  type DriftStatus,
  type ExceptionField,
  type Finding,
  type LifecycleAction,
  type ReconcileRun,
  type Registration,
  type RegistrationPage,
  type RegistrationState,
} from '@/domain/registration';

// The registration and drift reads (TDD-identity-control-003 §API / Interface), through the BFF.

const pageSize = 50;

export const registrationKeys = {
  all: ['registrations'] as const,
  list: (state: RegistrationState | undefined) => ['registrations', 'list', state ?? 'all'] as const,
  one: (registrationId: string) => ['registrations', 'one', registrationId] as const,
  findings: (registrationId: string) => ['registrations', 'findings', registrationId] as const,
  exceptions: (registrationId: string) => ['registrations', 'exceptions', registrationId] as const,
  drift: ['registrations', 'drift'] as const,
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

export function useRegistration(registrationId: string) {
  return useQuery({
    queryKey: registrationKeys.one(registrationId),
    queryFn: ({ signal }) =>
      apiGet<Registration>(`/v1/registrations/${encodeURIComponent(registrationId)}`, signal),
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

function useCsrfToken(): string | null {
  const session = useSession();
  return session.data?.authenticated === true ? session.data.csrfToken : null;
}

function requireToken(token: string | null): string {
  if (token === null) {
    throw new Error('no signed-in session to send a command with');
  }
  return token;
}

interface ReconcileResponse {
  readonly run: ReconcileRun | null;
  readonly status: DriftStatus;
  readonly deferred?: boolean;
}

// useRunSweep asks for a sweep now. deferred means another replica's sweep is running; its result
// arrives with that sweep.
export function useRunSweep() {
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: () =>
      apiPost<ReconcileResponse>('/v1/registrations:reconcile', {}, { csrfToken: requireToken(token) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: registrationKeys.all }),
  });
}

// useApplyDesiredState applies the registered state to one finding the sweep will not settle on
// its own, with the operator's reason, which the API records on the finding.
export function useApplyDesiredState() {
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({ findingId, reason }: { readonly findingId: string; readonly reason: string }) =>
      apiPost<ReconcileResponse>(
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
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: (request: ExceptionRequest) =>
      apiPost<DriftException>(
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

// useLifecycle suspends, restores or retires one registration (ADR-IAM-001 §5.13), with the
// operator's reason, which the API records with the change.
export function useLifecycle(registrationId: string) {
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({ action, reason }: { readonly action: LifecycleAction; readonly reason: string }) =>
      apiPost<Registration>(
        `/v1/registrations/${encodeURIComponent(registrationId)}:${action}`,
        {},
        { csrfToken: requireToken(token), headers: { 'x-administrative-reason': normalizeReason(reason) } },
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: registrationKeys.all }),
  });
}
