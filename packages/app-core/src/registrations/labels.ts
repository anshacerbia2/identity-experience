import type { StatusTone } from '@identity-experience/ui';

import type { Registration, RegistrationState } from '../domain/registration';
import type { CoreMessageKey } from '../i18n/core-messages';

// A registration's state and profile, as words from the catalogue. Every application that lists
// registrations shows them the same way. The template types make a code with no entry a compile
// error, not a blank cell.

export const stateLabel = (state: RegistrationState): CoreMessageKey => `registrations.state.${state}`;

export const profileLabel = (profile: Registration['profile']): CoreMessageKey =>
  `registrations.profile.${profile}`;

export const stateTone: Readonly<Record<RegistrationState, StatusTone>> = {
  active: 'success',
  pending: 'info',
  suspended: 'warning',
  retired: 'neutral',
};
