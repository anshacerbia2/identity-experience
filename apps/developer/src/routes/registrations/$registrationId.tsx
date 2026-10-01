import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { RegistrationPage } from '@/features/registrations/RegistrationPage';

export const Route = createFileRoute('/registrations/$registrationId')({
  component: RegistrationRoute,
});

function RegistrationRoute(): ReactElement {
  const { registrationId } = Route.useParams();
  return <RegistrationPage registrationId={registrationId} />;
}
