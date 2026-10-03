import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiPost } from '@identity-experience/app-core/api';
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
}

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
};

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
  const queryClient = useQueryClient();
  const session = useSession();
  const token = session.data?.authenticated === true ? session.data.csrfToken : '';
  return useMutation({
    mutationFn: async (command: SelfCommand) =>
      follow(
        await apiPost<Operation>(
          commandPath(command),
          {},
          { csrfToken: token, headers: { 'idempotency-key': command.idempotencyKey } },
        ),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: securityKeys.all }),
  });
}
