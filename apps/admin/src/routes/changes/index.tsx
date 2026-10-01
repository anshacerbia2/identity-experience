import { createFileRoute } from '@tanstack/react-router';

import { ChangeQueuePage } from '@/features/changes/ChangeQueuePage';

export const Route = createFileRoute('/changes/')({
  component: ChangeQueuePage,
});
