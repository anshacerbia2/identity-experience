import { createFileRoute } from '@tanstack/react-router';

import { EmergencyGrantsPage } from '@/features/provider-authority/EmergencyGrantsPage';

export const Route = createFileRoute('/emergency-grants/')({
  component: EmergencyGrantsPage,
});
