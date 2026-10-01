import { createFileRoute } from '@tanstack/react-router';

import { RegisterPage } from '@/features/registrations/RegisterPage';

export const Route = createFileRoute('/registrations/new')({
  component: RegisterPage,
});
