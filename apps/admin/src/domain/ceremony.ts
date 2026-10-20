// The bootstrap ceremony's record and its independent reviews, as identity-control serves them
// (GET /v1/bootstrap-ceremony, POST /v1/bootstrap-ceremony:review; STD-IAM-001 2.9.0 §3.10,
// ADR-IAM-001 §5.11 requirement 3 as amended 2026-10-20, TDD-identity-control-001 1.23.0). The
// ceremony created the first Principal and its emergency grant. Two named people ran it, an operator
// and a witness, and a third person, independent of both and of the first Principal's holder, reviews
// the record. The review is insert-only.

export type ReviewOutcome = 'satisfactory' | 'findings';

export const reviewOutcomes: readonly ReviewOutcome[] = ['satisfactory', 'findings'];

export interface CeremonyReview {
  readonly review_id: string;
  readonly reviewer: string;
  readonly reviewer_principal_id: string;
  readonly outcome: ReviewOutcome;
  readonly statement: string;
  readonly reviewed_at: string;
}

export interface BootstrapCeremony {
  readonly operator: string;
  // Never the operator. A ceremony recorded before the witness existed reads "not recorded".
  readonly witness: string;
  readonly reason: string;
  readonly principal_id: string | null;
  readonly requested_at: string;
  readonly reviewed: boolean;
  readonly reviews: readonly CeremonyReview[];
}

// samePerson compares two names as identity-control does: surrounding space ignored, and case
// (internal/identity/provisioning/ceremony.go, strings.EqualFold of the trimmed names).
export const samePerson = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

// Why a signed-in provider may not record a review: they hold the first Principal, or their name is
// the operator's or the witness's. Each is a refusal the API answers with 409; the page does not offer
// what the API would refuse.
export type NotIndependent = 'firstPrincipal' | 'operator' | 'witness';

export function notIndependent(
  ceremony: BootstrapCeremony,
  signedIn: { readonly principalId: string | null; readonly displayName: string | null },
): NotIndependent | null {
  if (signedIn.principalId !== null && signedIn.principalId === ceremony.principal_id) {
    return 'firstPrincipal';
  }
  if (signedIn.displayName !== null && samePerson(signedIn.displayName, ceremony.operator)) {
    return 'operator';
  }
  if (signedIn.displayName !== null && samePerson(signedIn.displayName, ceremony.witness)) {
    return 'witness';
  }
  return null;
}

// reviewerProblem is why a reviewer's name cannot be recorded: empty, or the operator's or the
// witness's name, which the API refuses with the same comparison.
export function reviewerProblem(
  ceremony: BootstrapCeremony,
  reviewer: string,
): 'empty' | 'operator' | 'witness' | null {
  if (reviewer.trim() === '') {
    return 'empty';
  }
  if (samePerson(reviewer, ceremony.operator)) {
    return 'operator';
  }
  if (samePerson(reviewer, ceremony.witness)) {
    return 'witness';
  }
  return null;
}
