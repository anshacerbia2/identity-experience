import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { RegistrationDetailPage } from '@/features/registrations/RegistrationDetailPage';

export const Route = createFileRoute('/registrations/$registrationId')({
  component: RegistrationRoute,
});

function RegistrationRoute(): ReactElement {
  const { registrationId } = Route.useParams();
  return <RegistrationDetailPage registrationId={registrationId} />;
}
