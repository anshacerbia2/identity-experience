import { enrolmentPath } from '@/domain/enrolment';

// The invitation token, taken from the enrolment page's fragment (ADR-IAM-011 §5.1;
// TDD-identity-experience-001 1.24.0 §The Token in the Fragment). The link is
// https://<this origin>/account/enrol#<token>. A browser separates the fragment before it asks a
// server for anything: RFC 3986 §3.5, "the fragment identifier is separated from the rest of the URI
// prior to a dereference". So no server, this BFF included, receives the token when the link opens.
//
// main.tsx imports this module first, before the router reads the location, so the token is removed
// from the address bar (history.replaceState, which loads nothing) before anything can copy it into a
// link, a sign-in's return_to, or the history. It is then held in this module's memory alone: never in
// browser storage, a cookie or a URL. A reload has no token, and the person opens the link again.

let held: string | null = null;

function decoded(fragment: string): string {
  try {
    return decodeURIComponent(fragment);
  } catch {
    // Not percent-encoding after all: identity-control answers a malformed token as it answers any.
    return fragment;
  }
}

// captureInvitationToken takes the fragment on the enrolment page and clears it. On any other page it
// does nothing, so a fragment elsewhere stays that page's.
export function captureInvitationToken(
  location: Pick<Location, 'hash' | 'pathname' | 'search'> = window.location,
  history: Pick<History, 'replaceState' | 'state'> = window.history,
): void {
  if (location.pathname.replace(/\/+$/, '') !== enrolmentPath) {
    return;
  }
  const fragment = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
  if (fragment === '') {
    return;
  }
  history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  held = decoded(fragment);
}

// heldInvitationToken is the token this tab holds, if any.
export const heldInvitationToken = (): string | null => held;

// forgetInvitationToken drops it, once the account exists: the person accepts signed in, from the
// invitation link again.
export function forgetInvitationToken(): void {
  held = null;
}

captureInvitationToken();
