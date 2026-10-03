import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { PrincipalDetailPage } from '@/features/principals/PrincipalDetailPage';

export const Route = createFileRoute('/principals/$principalId')({
  component: PrincipalRoute,
});

function PrincipalRoute(): ReactElement {
  const { principalId } = Route.useParams();
  return <PrincipalDetailPage principalId={principalId} />;
}
