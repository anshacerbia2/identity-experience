import { createFileRoute } from '@tanstack/react-router';

import { EnrolmentPage } from '@/features/enrolment/EnrolmentPage';

export const Route = createFileRoute('/enrol')({
  component: EnrolmentPage,
});
