import { createFileRoute } from '@tanstack/react-router';

import { MyWorkloadsPage } from '@/features/workloads/MyWorkloadsPage';

export const Route = createFileRoute('/workloads/')({
  component: MyWorkloadsPage,
});
