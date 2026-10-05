import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiPost } from '@identity-experience/app-core/api';
import { normalizeReason } from '@identity-experience/app-core/domain/reason';
import { useSession } from '@identity-experience/app-core/session';

import {
  isFinal,
  type Authenticator,
  type FederationLink,
  type Finding,
  type KernelEvent,
  type PrincipalDetail,
  type PrincipalSummary,
  type SecurityOperation,
  type SecuritySession,
} from '@/domain/security';

// A provider's reads of a Principal and its containment (TDD-identity-control-005), through the
// BFF. Every read here is a privileged read the API records, so each is made only when the page
// asks for it.

export const securityKeys = {
  search: (query: string) => ['principals', 'search', query] as const,
  principal: (id: string) => ['principals', 'detail', id] as const,
  section: (id: string, section: string) => ['principals', 'detail', id, section] as const,
};

const principalPath = (id: string) => `/v1/principals/${encodeURIComponent(id)}` as const;

// usePrincipalSearch runs only for a submitted query.
export function usePrincipalSearch(query: string) {
  return useQuery({
    queryKey: securityKeys.search(query),
    enabled: query !== '',
    queryFn: async ({ signal }) =>
      (
        await apiGet<{ readonly principals: readonly PrincipalSummary[] | null }>(
          `/v1/principals:search?q=${encodeURIComponent(query)}`,
          signal,
        )
      ).principals ?? [],
    // A search is evidence of who looked for whom: it is not repeated behind the operator's back.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function usePrincipalDetail(id: string) {
  return useQuery({
    queryKey: securityKeys.principal(id),
    queryFn: ({ signal }) => apiGet<PrincipalDetail>(principalPath(id), signal),
    refetchOnWindowFocus: false,
  });
}

type Section = 'sessions' | 'authenticators' | 'federation-links' | 'findings' | 'events';

interface SectionBodies {
  readonly sessions: readonly SecuritySession[];
  readonly authenticators: readonly Authenticator[];
  readonly 'federation-links': readonly FederationLink[];
  readonly findings: readonly Finding[];
  readonly events: readonly KernelEvent[];
}

const sectionKey: Readonly<Record<Section, string>> = {
  sessions: 'sessions',
  authenticators: 'authenticators',
  'federation-links': 'federation_links',
  findings: 'findings',
  events: 'events',
};

// useSecuritySection reads one section once it is opened. The security_refs an authenticators read
// carries stay in this cache, never in browser storage (TDD-identity-experience-003 §Data Model).
export function useSecuritySection<S extends Section>(id: string, section: S, open: boolean) {
  return useQuery({
    queryKey: securityKeys.section(id, section),
    enabled: open,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }): Promise<SectionBodies[S]> => {
      const body = await apiGet<Record<string, SectionBodies[S] | null>>(
        `${principalPath(id)}/${section}`,
        signal,
      );
      return body[sectionKey[section]] ?? [];
    },
  });
}

export interface SecurityCommand {
  readonly principalId: string;
  readonly action: 'suspend' | 'restore' | 'terminate-all' | 'revoke';
  readonly securityRef?: string;
  readonly expectedVersion: number;
  readonly reason: string;
  readonly idempotencyKey: string;
}

const commandPath = (command: SecurityCommand) => {
  const base = principalPath(command.principalId);
  switch (command.action) {
    case 'suspend':
      return `${base}:suspend` as const;
    case 'restore':
      return `${base}:restore` as const;
    case 'terminate-all':
      return `${base}/sessions:terminate-all` as const;
    case 'revoke':
      return `${base}/authenticators/${encodeURIComponent(command.securityRef ?? '')}:revoke` as const;
  }
};

// How long a 202 is followed: every two seconds for thirty (TDD-identity-experience-003).
export const followEveryMs = 2_000;
export const followForMs = 30_000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

// follow polls an accepted operation until it is final or the time is up, and returns what it saw
// last. A command is never repeated here; only its status is read.
export async function follow(
  operation: SecurityOperation,
  everyMs = followEveryMs,
  forMs = followForMs,
): Promise<SecurityOperation> {
  let current = operation;
  const until = Date.now() + forMs;
  while (!isFinal(current) && Date.now() < until) {
    await sleep(everyMs);
    current = await apiGet<SecurityOperation>(
      `/v1/security-operations/${encodeURIComponent(current.operation_id)}`,
    );
  }
  return current;
}

function useCsrfToken(): string {
  const session = useSession();
  return session.data?.authenticated === true ? session.data.csrfToken : '';
}

// useSecurityCommand sends one containment command and follows it to its final state. The Principal
// is read again afterwards, so the next command names the version this one produced.
export function useSecurityCommand() {
  const queryClient = useQueryClient();
  const token = useCsrfToken();
  return useMutation({
    mutationFn: async (command: SecurityCommand) =>
      follow(
        await apiPost<SecurityOperation>(
          commandPath(command),
          { expected_version: command.expectedVersion },
          {
            csrfToken: token,
            headers: {
              'idempotency-key': command.idempotencyKey,
              'x-administrative-reason': normalizeReason(command.reason),
            },
          },
        ),
      ),
    onSettled: (_data, _error, command) =>
      queryClient.invalidateQueries({ queryKey: securityKeys.principal(command.principalId) }),
  });
}
