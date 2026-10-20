import { createFileRoute } from '@tanstack/react-router';

import { CeremonyPage } from '@/features/provider-authority/CeremonyPage';

export const Route = createFileRoute('/ceremony/')({
  component: CeremonyPage,
});
