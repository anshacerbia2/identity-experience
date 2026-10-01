import { createFileRoute } from '@tanstack/react-router';

import { MyRegistrationsPage } from '@/features/registrations/MyRegistrationsPage';

export const Route = createFileRoute('/')({
  component: MyRegistrationsPage,
});
