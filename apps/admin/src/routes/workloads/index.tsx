import { createFileRoute } from '@tanstack/react-router';

import { WorkloadsPage } from '@/features/workloads/WorkloadsPage';

export const Route = createFileRoute('/workloads/')({
  component: WorkloadsPage,
});
