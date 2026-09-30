import type { StatusTone } from '@identity-experience/ui';

import type { MessageKey } from '@/core/i18n/messages';
import type { Attention, FindingClass, Registration, RegistrationState } from '@/domain/registration';

// Every value the API returns as a code is shown as a word from the catalogue. The template types
// make a code with no entry a compile error, not a blank cell.

export const stateLabel = (state: RegistrationState): MessageKey => `registrations.state.${state}`;

export const profileLabel = (profile: Registration['profile']): MessageKey =>
  `registrations.profile.${profile}`;

export const findingClassLabel = (findingClass: FindingClass): MessageKey => `findings.class.${findingClass}`;

const fieldLabels: Readonly<Record<string, MessageKey>> = {
  redirect_uris: 'findings.field.redirect_uris',
  token_lifespan: 'findings.field.token_lifespan',
  audience_scope: 'findings.field.audience_scope',
  signing_algorithm: 'findings.field.signing_algorithm',
  profile: 'findings.field.profile',
  client_keys: 'findings.field.client_keys',
  suspension: 'findings.field.suspension',
};

// A finding with no field class is about the whole client: it is missing, or was recreated.
export const fieldLabel = (fieldClass: string | undefined): MessageKey =>
  (fieldClass === undefined ? undefined : fieldLabels[fieldClass]) ?? 'findings.field.client';

export const stateTone: Readonly<Record<RegistrationState, StatusTone>> = {
  active: 'success',
  pending: 'info',
  suspended: 'warning',
  retired: 'neutral',
};

export const attentionTone: Readonly<Record<Attention, StatusTone>> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};
