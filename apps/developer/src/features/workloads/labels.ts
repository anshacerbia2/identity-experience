import type { WorkloadState } from '@identity-experience/app-core/domain/workload';
import type { StatusTone } from '@identity-experience/ui';

// The tone of each workload state, as the Admin Portal shows it.
export const workloadTones: Readonly<Record<WorkloadState, StatusTone>> = {
  pending: 'warning',
  active: 'success',
  orphaned: 'danger',
  suspended: 'danger',
  retired: 'neutral',
};
