import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { apiGet } from '@/core/api/api-client';
import type {
  DriftStatus,
  Finding,
  Registration,
  RegistrationPage,
  RegistrationState,
} from '@/domain/registration';

// The registration and drift reads (TDD-identity-control-003 §API / Interface), through the BFF.

const pageSize = 50;

export const registrationKeys = {
  all: ['registrations'] as const,
  list: (state: RegistrationState | undefined) => ['registrations', 'list', state ?? 'all'] as const,
  one: (registrationId: string) => ['registrations', 'one', registrationId] as const,
  findings: (registrationId: string) => ['registrations', 'findings', registrationId] as const,
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
