import { createFileRoute } from '@tanstack/react-router';

import { SecurityPage } from '@/features/security/SecurityPage';

export const Route = createFileRoute('/')({
  component: SecurityPage,
});
