// Administrative reasons: the why an operator states before a privileged command, which the API
// records with it (TDD-identity-experience-003 §Security Notes).

// An administrative reason travels in an HTTP header (X-Administrative-Reason), which holds one
// line of Latin-1. Line breaks typed in the form become spaces; anything outside Latin-1 is
// refused with a message rather than failing inside fetch.
export const normalizeReason = (reason: string): string => reason.replace(/\s+/g, ' ').trim();

export const minReasonLength = 10;
export const maxReasonLength = 500;

export type ReasonProblem = 'short' | 'long' | 'characters';

const headerSafe = /^[\x20-\x7E\xA0-\xFF]*$/;

export function reasonProblem(reason: string): ReasonProblem | null {
  const normalized = normalizeReason(reason);
  if (normalized.length < minReasonLength) {
    return 'short';
  }
  if (normalized.length > maxReasonLength) {
    return 'long';
  }
  if (!headerSafe.test(normalized)) {
    return 'characters';
  }
  return null;
}
