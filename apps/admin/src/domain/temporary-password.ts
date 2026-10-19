import type { PrincipalDetail } from './security';

// A first credential for a person a provider created (ADR-IAM-010, TDD-identity-control-005,
// TDD-identity-experience-003 1.28.0 §A First Credential, Shown Once). identity-control generates the
// value and answers it once; a retry with the same Idempotency-Key answers the issuance without it.

export interface TemporaryPasswordIssuance {
  readonly issuance_id: string;
  readonly principal_id: string;
  readonly issued_at: string;
  readonly lapses_at: string;
  // value is present on the 201 that issued it, and on nothing else.
  readonly value?: string;
}

export interface TemporaryPasswordAnswer {
  readonly temporary_password: TemporaryPasswordIssuance;
}

export const issuePath = (principalId: string) =>
  `/v1/principals/${encodeURIComponent(principalId)}:issue-temporary-password` as const;

// canIssueTemporaryPassword is whether the console offers the command: an active person other than the
// operator. Whether the person has set a password of their own is the API's to say.
export const canIssueTemporaryPassword = (principal: PrincipalDetail, operator: string | null): boolean =>
  principal.subject_type === 'human' && principal.state === 'active' && principal.principal_id !== operator;

const stateTransitionRefused = 'https://problems.scnehaux.com/state-transition-refused';

// Refusal is the part of the API's problem document the console reads.
export interface Refusal {
  readonly status: number;
  readonly type: string | null;
  readonly detail: string | null;
}

// credentialEstablished is the API's refusal for a person who has set a password of their own: no
// reset exists, and a provider contains such an account by suspending it.
export const credentialEstablished = (refusal: Refusal | null): boolean =>
  refusal !== null &&
  refusal.status === 409 &&
  refusal.type === stateTransitionRefused &&
  (refusal.detail ?? '').startsWith('credential-established');
