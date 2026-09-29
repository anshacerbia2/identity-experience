import { createFileRoute } from '@tanstack/react-router';

import { PrincipalsPage } from '@/features/principals/PrincipalsPage';

export const Route = createFileRoute('/principals/')({
  component: PrincipalsPage,
});
