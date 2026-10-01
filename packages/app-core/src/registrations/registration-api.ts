import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiPost } from '../api/api-client';
import type { PublicJwk } from '../domain/public-key';
import { normalizeReason } from '../domain/reason';
import type { ClientKey, LifecycleAction, Owner, Registration } from '../domain/registration';
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
