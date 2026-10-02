import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiPost } from '../api/api-client';
import type { PublicJwk } from '../domain/public-key';
import { normalizeReason } from '../domain/reason';
import type {
  ChangeDecision,
  ClientKey,
  LifecycleAction,
  Owner,
  Registration,
  RegisterRequest,
  RegistrationChange,
  RegistrationRequestRecord,
  Standing,
} from '../domain/registration';
import { requireToken, useCsrfToken } from '../session/session';

// One registration, its keys, its lifecycle and its owners (TDD-identity-control-003 §API /
// Interface, §Registration Ownership), through the BFF. The same calls serve a provider in the
// Admin Portal and an owner in the Developer Console: the Identity Control API decides which of
// them it accepts from whom, and these hooks send what they are given.

// Every registration query starts with 'registrations', so a command settles by reading them all
// again. An application adds its own keys under the same prefix.
export const registrationKeys = {
  all: ['registrations'] as const,
  one: (registrationId: string) => ['registrations', 'one', registrationId] as const,
  keys: (registrationId: string) => ['registrations', 'keys', registrationId] as const,
  owners: (registrationId: string) => ['registrations', 'owners', registrationId] as const,
  changes: (registrationId: string) => ['registrations', 'changes', registrationId] as const,
  changeQueue: ['registrations', 'change-queue'] as const,
  standing: ['registrations', 'standing'] as const,
  requestQueue: ['registrations', 'request-queue'] as const,
  myRequests: ['registrations', 'my-requests'] as const,
};

const registrationPath = (registrationId: string): `/v1/${string}` =>
  `/v1/registrations/${encodeURIComponent(registrationId)}`;

export function useRegistration(registrationId: string) {
  return useQuery({
    queryKey: registrationKeys.one(registrationId),
    queryFn: ({ signal }) => apiGet<Registration>(registrationPath(registrationId), signal),
  });
}

// useLifecycle suspends, restores or retires one registration (ADR-IAM-001 §5.13), with the
// caller's reason, which the API records with the change.
export function useLifecycle(registrationId: string) {
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({ action, reason }: { readonly action: LifecycleAction; readonly reason: string }) =>
      apiPost<Registration>(
        `${registrationPath(registrationId)}:${action}`,
        {},
        { csrfToken: requireToken(token), headers: { 'x-administrative-reason': normalizeReason(reason) } },
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: registrationKeys.all }),
  });
}

// useKeys reads a keyed registration's keys, newest first.
export function useKeys(registrationId: string, enabled: boolean) {
  return useQuery({
    queryKey: registrationKeys.keys(registrationId),
    enabled,
    queryFn: ({ signal }) =>
      apiGet<{ keys: readonly ClientKey[] }>(`${registrationPath(registrationId)}/keys`, signal),
  });
}

// useRotateKey registers the next public key, which starts a rotation. The answer carries the keys;
// whether the key was new is read from them, since a retry after a lost answer is answered 200.
export function useRotateKey(registrationId: string) {
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: (publicKey: PublicJwk) =>
      apiPost<{ keys: readonly ClientKey[] }>(
        `${registrationPath(registrationId)}/keys`,
        { public_key: publicKey },
        { csrfToken: requireToken(token) },
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: registrationKeys.all }),
  });
}

// useRevokeKey removes one key now, with a reason.
export function useRevokeKey(registrationId: string) {
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({ keyId, reason }: { readonly keyId: string; readonly reason: string }) =>
      apiPost<{ keys: readonly ClientKey[] }>(
        `${registrationPath(registrationId)}/keys/${encodeURIComponent(keyId)}:revoke`,
        {},
        { csrfToken: requireToken(token), headers: { 'x-administrative-reason': normalizeReason(reason) } },
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: registrationKeys.all }),
  });
}

// useOwners reads who owns a registration. An empty list is answered as null by the API; it is an
// empty list here.
export function useOwners(registrationId: string) {
  return useQuery({
    queryKey: registrationKeys.owners(registrationId),
    queryFn: async ({ signal }) =>
      (
        await apiGet<{ readonly owners: readonly Owner[] | null }>(
          `${registrationPath(registrationId)}/owners`,
          signal,
        )
      ).owners ?? [],
  });
}

// useChanges reads one registration's changes, newest first.
export function useChanges(registrationId: string, enabled: boolean) {
  return useQuery({
    queryKey: registrationKeys.changes(registrationId),
    enabled,
    queryFn: async ({ signal }) =>
      (
        await apiGet<{ readonly changes: readonly RegistrationChange[] | null }>(
          `${registrationPath(registrationId)}/changes`,
          signal,
        )
      ).changes ?? [],
  });
}

// useChangeQueue reads every change waiting for approval, oldest first. It is a provider's read.
export function useChangeQueue() {
  return useQuery({
    queryKey: registrationKeys.changeQueue,
    queryFn: async ({ signal }) =>
      (
        await apiGet<{ readonly changes: readonly RegistrationChange[] | null }>(
          '/v1/registrations:changes',
          signal,
        )
      ).changes ?? [],
  });
}

// useProposeChange proposes the next set of redirect URIs, against the version the caller read.
export function useProposeChange(registrationId: string) {
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({
      redirectUris,
      expectedVersion,
      reason,
    }: {
      readonly redirectUris: readonly string[];
      readonly expectedVersion: number;
      readonly reason: string;
    }) =>
      apiPost<RegistrationChange>(
        `${registrationPath(registrationId)}/changes`,
        { redirect_uris: redirectUris, expected_version: expectedVersion },
        { csrfToken: requireToken(token), headers: { 'x-administrative-reason': normalizeReason(reason) } },
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: registrationKeys.all }),
  });
}

// useDecideChange approves, rejects or withdraws one change, with a reason.
export function useDecideChange(registrationId: string) {
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({
      changeId,
      decision,
      reason,
    }: {
      readonly changeId: string;
      readonly decision: ChangeDecision;
      readonly reason: string;
    }) =>
      apiPost<RegistrationChange>(
        `${registrationPath(registrationId)}/changes/${encodeURIComponent(changeId)}:${decision}`,
        {},
        { csrfToken: requireToken(token), headers: { 'x-administrative-reason': normalizeReason(reason) } },
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: registrationKeys.all }),
  });
}

// useStanding reads what the signed-in person may do beyond what it owns, so a console offers
// registration only where the API would accept one.
export function useStanding() {
  return useQuery({
    queryKey: registrationKeys.standing,
    queryFn: ({ signal }) => apiGet<Standing>('/v1/registrations:standing', signal),
  });
}

// useRegister creates a registration under an Idempotency-Key the caller holds, so the same request
// retried after an outage creates nothing new.
export function useRegister() {
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({
      request,
      idempotencyKey,
    }: {
      readonly request: RegisterRequest;
      readonly idempotencyKey: string;
    }) =>
      apiPost<Registration>('/v1/registrations', request, {
        csrfToken: requireToken(token),
        headers: { 'idempotency-key': idempotencyKey },
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: registrationKeys.all }),
  });
}

type Requests = { readonly requests: readonly RegistrationRequestRecord[] | null };

// useRequestQueue reads every request waiting for approval, oldest first. It is a provider's read.
export function useRequestQueue() {
  return useQuery({
    queryKey: registrationKeys.requestQueue,
    queryFn: async ({ signal }) =>
      (await apiGet<Requests>('/v1/registration-requests', signal)).requests ?? [],
  });
}

// useMyRequests reads the signed-in person's own requests, newest first.
export function useMyRequests(enabled: boolean) {
  return useQuery({
    queryKey: registrationKeys.myRequests,
    enabled,
    queryFn: async ({ signal }) =>
      (await apiGet<Requests>('/v1/registration-requests:mine', signal)).requests ?? [],
  });
}

// useProposeRegistration requests a production registration, naming its owners, with a reason.
export function useProposeRegistration() {
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({
      request,
      owners,
      reason,
    }: {
      readonly request: RegisterRequest;
      readonly owners: readonly string[];
      readonly reason: string;
    }) =>
      apiPost<RegistrationRequestRecord>(
        '/v1/registration-requests',
        { ...request, owners },
        { csrfToken: requireToken(token), headers: { 'x-administrative-reason': normalizeReason(reason) } },
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: registrationKeys.all }),
  });
}

// useDecideRequest approves, rejects or withdraws one request, with a reason.
export function useDecideRequest() {
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: ({
      requestId,
      decision,
      reason,
    }: {
      readonly requestId: string;
      readonly decision: ChangeDecision;
      readonly reason: string;
    }) =>
      apiPost<RegistrationRequestRecord>(
        `/v1/registration-requests/${encodeURIComponent(requestId)}:${decision}`,
        {},
        { csrfToken: requireToken(token), headers: { 'x-administrative-reason': normalizeReason(reason) } },
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: registrationKeys.all }),
  });
}
