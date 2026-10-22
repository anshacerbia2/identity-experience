// The enrolment page's rules (ADR-IAM-011 §5.1 to §5.3; TDD-identity-experience-001 1.24.0
// §Enrolment From an Invitation). Pure: no React, no IO.

// The page's address. organization-experience's acceptance page links here, with the invitation token
// in the fragment alone: https://<identity-experience origin>/account/enrol#<token>.
export const enrolmentPath = '/account/enrol';

// The code is 8 digits (ADR-IAM-011 §5.2). A person may type it with spaces or a dash, as a message
// can show it grouped; those are dropped before it is sent.
export const codeLength = 8;

export function normalizedCode(typed: string): string {
  return typed.replace(/[\s-]/g, '');
}

export const isCode = (typed: string): boolean =>
  new RegExp(`^\\d{${String(codeLength)}}$`).test(normalizedCode(typed));

// What one answer of the BFF is to the page. Each outcome is one sentence, and none tells an
// invitation that can be redeemed from one that cannot: identity-control answers every token the
// same 202, and every refused code the same 400 (TDD-identity-experience-001 1.24.0 §One Sentence per
// Answer).
export type RequestOutcome =
  | { readonly kind: 'sent'; readonly enrolmentId: string }
  | { readonly kind: 'limited'; readonly minutes: number }
  | { readonly kind: 'refused' }
  | { readonly kind: 'unavailable' };

export type VerifyOutcome =
  | { readonly kind: 'created'; readonly account: EnrolledAccount }
  | { readonly kind: 'wrong' }
  | { readonly kind: 'limited'; readonly minutes: number }
  | { readonly kind: 'unavailable' };

// The account the right code created, and its temporary password, shown once. It lives in the page's
// memory alone (STD-IAM-001 3.1.0 §3.1).
export interface EnrolledAccount {
  readonly username: string;
  readonly temporaryPassword: string;
  readonly lapsesAt: string;
}

// minutesFrom reads Retry-After's seconds as whole minutes to wait, at least one (RFC 9110 §10.2.3).
export function minutesFrom(retryAfter: string | null): number {
  const seconds = retryAfter !== null && /^\d+$/.test(retryAfter) ? Number(retryAfter) : 60;
  return Math.max(1, Math.ceil(seconds / 60));
}

export function requestOutcome(
  status: number,
  retryAfter: string | null,
  enrolmentId: string | null,
): RequestOutcome {
  if (status === 202 && enrolmentId !== null) {
    return { kind: 'sent', enrolmentId };
  }
  if (status === 429) {
    return { kind: 'limited', minutes: minutesFrom(retryAfter) };
  }
  // A 400 depends on the body alone: a token that cannot be one. It says nothing about any invitation.
  if (status === 400) {
    return { kind: 'refused' };
  }
  return { kind: 'unavailable' };
}

export function verifyOutcome(
  status: number,
  retryAfter: string | null,
  account: EnrolledAccount | null,
): VerifyOutcome {
  if (status === 201 && account !== null) {
    return { kind: 'created', account };
  }
  if (status === 429) {
    return { kind: 'limited', minutes: minutesFrom(retryAfter) };
  }
  if (status === 400) {
    return { kind: 'wrong' };
  }
  return { kind: 'unavailable' };
}
