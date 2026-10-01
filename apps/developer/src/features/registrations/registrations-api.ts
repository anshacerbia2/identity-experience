import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@identity-experience/app-core/api';
import type { Registration } from '@identity-experience/app-core/domain/registration';

// The owner's reads (TDD-identity-control-003 §Registration Ownership), through the BFF. The
// session's token carries no provider_scope unless its holder is a provider, so the Identity
// Control API answers these as it would answer the owner, and a registration the owner does not
// own is a 404 there, never a page here.

export const registrationKeys = {
  all: ['registrations'] as const,
  mine: ['registrations', 'mine'] as const,
};

// useMyRegistrations lists the registrations the signed-in person owns, in the API's order. An
// empty list is answered as null by the API; it is an empty list here.
export function useMyRegistrations() {
  return useQuery({
    queryKey: registrationKeys.mine,
    queryFn: async ({ signal }) =>
      (
        await apiGet<{ readonly registrations: readonly Registration[] | null }>(
          '/v1/registrations:mine',
          signal,
        )
      ).registrations ?? [],
  });
}
