import { createFileRoute } from '@tanstack/react-router';

import { ConsentsPage } from '@/features/security/ConsentsPage';

export const Route = createFileRoute('/consents')({
  component: ConsentsPage,
});
