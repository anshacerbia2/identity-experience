import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import {
  isRegistrationState,
  type RegistrationState,
} from '@identity-experience/app-core/domain/registration';

import { RegistrationsPage } from '@/features/registrations/RegistrationsPage';

interface Search {
  readonly state?: RegistrationState;
}

// The state filter lives in the URL, so a filtered list can be shared and survives a reload
// (STD-GLB-FE-001 §3). An unknown value is dropped rather than sent to the API.
export const Route = createFileRoute('/registrations/')({
  validateSearch: (search: Record<string, unknown>): Search =>
    isRegistrationState(search['state']) ? { state: search['state'] } : {},
  component: RegistrationsRoute,
});

function RegistrationsRoute(): ReactElement {
  const { state } = Route.useSearch();
  // Checked again here: the router keeps a search value validateSearch did not return, so
  // `?state=deleted` would otherwise reach the API as a filter.
  return <RegistrationsPage state={isRegistrationState(state) ? state : undefined} />;
}
