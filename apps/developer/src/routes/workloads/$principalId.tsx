import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { WorkloadPage } from '@/features/workloads/WorkloadPage';

export const Route = createFileRoute('/workloads/$principalId')({
  component: WorkloadRoute,
});

function WorkloadRoute(): ReactElement {
  const { principalId } = Route.useParams();
  return <WorkloadPage principalId={principalId} />;
}
