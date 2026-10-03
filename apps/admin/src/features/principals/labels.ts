import type { StatusTone } from '@identity-experience/ui';

import type { PrincipalState } from '@/domain/security';

// How a Principal's state reads at a glance. A suspension is containment an operator chose; a
// quarantine is the reconciler's integrity hold (TDD-identity-control-001 1.12.0).
export const stateTones: Readonly<Record<PrincipalState, StatusTone>> = {
  pending: 'warning',
  active: 'success',
  suspended: 'danger',
  quarantined: 'danger',
  retired: 'neutral',
};
