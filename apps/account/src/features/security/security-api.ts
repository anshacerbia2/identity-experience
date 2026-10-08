import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, useCommandPost } from '@identity-experience/app-core/api';
import { useSession } from '@identity-experience/app-core/session';

// A person's own sessions and authenticators (TDD-identity-control-005 §Self-Service as Built),
// through the BFF. The API takes the subject from the token; no request here names one.

export interface MySession {
  readonly security_ref: string;
  readonly started: string;
  readonly last_access: string;
  readonly clients: readonly string[] | null;
  readonly current: boolean;
}

export interface MyAuthenticator {
  readonly security_ref: string;
  readonly type: string;
  readonly label?: string;
  readonly created: string;
  // A recovery-code set's unused codes and the count it began with (ADR-IAM-005 §5.4).
  readonly remaining_codes?: number;
  readonly total_codes?: number;
}

// usedRecoveryCodes reports whether a recovery-code set has been used: fewer codes remain than it
// began with, so the person recovered with one and should take a new set.
export const usedRecoveryCodes = (authenticator: MyAuthenticator): boolean =>
  authenticator.remaining_codes !== undefined &&
  authenticator.total_codes !== undefined &&
  authenticator.remaining_codes < authenticator.total_codes;

export type OperationState = 'pending' | 'retrying' | 'applied' | 'refused' | 'unresolved';

export interface Operation {
  readonly operation_id: string;
  readonly operation_type: string;
  readonly state: OperationState;
  readonly result_code?: string;
}

export const isFinal = (operation: Operation): boolean =>
  operation.state === 'applied' || operation.state === 'refused' || operation.state === 'unresolved';

export const securityKeys = {
  all: ['me'] as const,
  sessions: ['me', 'sessions'] as const,
  authenticators: ['me', 'authenticators'] as const,
  addresses: ['me', 'notification-addresses'] as const,
};

// A person's notification address (TDD-identity-control-008 1.2.0): where they are told when their
// account changes. A pending one waits for the code sent to it.
export interface NotificationAddress {
  readonly address_id: string;
  readonly channel: string;
  readonly address: string;
  readonly origin: 'creation' | 'added';
  readonly state: 'pending' | 'active';
  readonly added_at: string;
  readonly verified_at?: string;
}

export function useMySessions() {
  return useQuery({
    queryKey: securityKeys.sessions,
    queryFn: async ({ signal }) =>
      (await apiGet<{ readonly sessions: readonly MySession[] | null }>('/v1/me/sessions', signal))
        .sessions ?? [],
  });
}

export function useMyAuthenticators() {
  return useQuery({
    queryKey: securityKeys.authenticators,
    queryFn: async ({ signal }) =>
      (
        await apiGet<{ readonly authenticators: readonly MyAuthenticator[] | null }>(
          '/v1/me/authenticators',
          signal,
        )
      ).authenticators ?? [],
  });
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

// follow polls one's own accepted command until it is final, every two seconds for thirty, and
// returns what it saw last. The command itself is never repeated here.
export async function follow(operation: Operation, everyMs = 2_000, forMs = 30_000): Promise<Operation> {
  let current = operation;
  const until = Date.now() + forMs;
  while (!isFinal(current) && Date.now() < until) {
    await sleep(everyMs);
    current = await apiGet<Operation>(
      `/v1/me/security-operations/${encodeURIComponent(current.operation_id)}`,
    );
  }
  return current;
}

export type SelfCommandRequest =
  | { readonly action: 'terminate'; readonly securityRef: string }
  | { readonly action: 'terminate-all' }
  | { readonly action: 'remove'; readonly securityRef: string };

export type SelfCommand = SelfCommandRequest & { readonly idempotencyKey: string };

const commandPath = (command: SelfCommand) => {
  switch (command.action) {
    case 'terminate':
      return `/v1/me/sessions/${encodeURIComponent(command.securityRef)}:terminate` as const;
    case 'terminate-all':
      return '/v1/me/sessions:terminate-all' as const;
    case 'remove':
      return `/v1/me/authenticators/${encodeURIComponent(command.securityRef)}:remove` as const;
  }
};

// useSelfCommand sends one of a person's own commands, with only its Idempotency-Key: the API takes
// no reason and no version for them, and follows it to its final state.
export function useSelfCommand() {
  const post = useCommandPost();
  const queryClient = useQueryClient();
  const session = useSession();
  const token = session.data?.authenticated === true ? session.data.csrfToken : '';
  return useMutation({
    mutationFn: async (command: SelfCommand) =>
      follow(
        await post<Operation>(
          commandPath(command),
          {},
          { csrfToken: token, headers: { 'idempotency-key': command.idempotencyKey } },
        ),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: securityKeys.all }),
  });
}

// browser is the one place the page leaves for the kernel, so a test can stand in for it.
export const browser = {
  assign: (url: string): void => {
    window.location.assign(url);
  },
};

// enrollHref is the BFF's sign-in that performs the kernel action the API authorized, returning to
// this page (TDD-identity-experience-001 §Step-Up).
export const enrollHref = (action: string): string =>
  `/auth/login?${new URLSearchParams({ kc_action: action, return_to: '/account/' }).toString()}`;

// The authenticator types a person may enroll: an authenticator app, a security key used as a
// second factor (TDD-identity-experience-002 1.4.0), or a new set of recovery codes (1.5.0).
export type EnrollType = 'totp' | 'webauthn' | 'recovery-codes';

// useEnroll asks the API to authorize enrolling an authenticator, then goes to the kernel's page
// that enrolls it (TDD-identity-control-005 §Enrollment and the Assurance Floor).
export function useEnroll() {
  const post = useCommandPost();
  const session = useSession();
  const token = session.data?.authenticated === true ? session.data.csrfToken : '';
  return useMutation({
    mutationFn: (type: EnrollType) =>
      post<{ readonly action: string }>('/v1/me/authenticators:enroll', { type }, { csrfToken: token }),
    onSuccess: ({ action }) => {
      browser.assign(enrollHref(action));
    },
  });
}

export function useMyAddresses() {
  return useQuery({
    queryKey: securityKeys.addresses,
    queryFn: async ({ signal }) =>
      (
        await apiGet<{ readonly notification_addresses: readonly NotificationAddress[] | null }>(
          '/v1/me/notification-addresses',
          signal,
        )
      ).notification_addresses ?? [],
  });
}

export type AddressCommand =
  | { readonly action: 'add'; readonly address: string; readonly idempotencyKey: string }
  | { readonly action: 'verify'; readonly addressId: string; readonly code: string }
  | { readonly action: 'remove'; readonly addressId: string };

// useAddressCommand adds, proves or removes one of the person's own notification addresses. Adding
// and removing need a recent sign-in, which the API asks for with a step-up challenge.
export function useAddressCommand() {
  const post = useCommandPost();
  const queryClient = useQueryClient();
  const session = useSession();
  const token = session.data?.authenticated === true ? session.data.csrfToken : '';
  return useMutation({
    mutationFn: async (command: AddressCommand) => {
      switch (command.action) {
        case 'add':
          await post<unknown>(
            '/v1/me/notification-addresses',
            { address: command.address },
            { csrfToken: token, headers: { 'idempotency-key': command.idempotencyKey } },
          );
          return;
        case 'verify':
          await post<unknown>(
            `/v1/me/notification-addresses/${encodeURIComponent(command.addressId)}:verify`,
            { code: command.code },
            { csrfToken: token },
          );
          return;
        case 'remove':
          await post<unknown>(
            `/v1/me/notification-addresses/${encodeURIComponent(command.addressId)}:remove`,
            {},
            { csrfToken: token },
          );
          return;
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: securityKeys.addresses }),
  });
}
