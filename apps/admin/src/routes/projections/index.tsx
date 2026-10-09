import { createFileRoute } from '@tanstack/react-router';

import { TenantContextPage } from '@/features/provider-authority/TenantContextPage';

export const Route = createFileRoute('/projections/')({
  component: TenantContextPage,
});
