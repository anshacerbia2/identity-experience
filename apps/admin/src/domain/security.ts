// A Principal's security state and its containment, as the Identity Control API serves them
// (TDD-identity-control-005 2.2.0; TDD-identity-experience-003 §Principal Search and Security State).
// Kernel identifiers never reach the browser: an authenticator is named by its security_ref, an
// opaque handle that lives in memory for the rendered page.

import type { SubjectType } from './principal';

export type PrincipalState = 'pending' | 'active' | 'suspended' | 'quarantined' | 'retired';

export interface PrincipalSummary {
  readonly principal_id: string;
  readonly username: string;
  readonly email?: string;
  readonly subject_type: SubjectType;
  readonly state: PrincipalState;
}

export interface PrincipalDetail extends PrincipalSummary {
  readonly realm: string;
  readonly workload_owner?: string;
  readonly created_at: string;
  readonly activated_at: string | null;
  readonly quarantined_at: string | null;
  readonly quarantine_reason?: string;
  readonly version: number;
  // security_version is what a command names as expected_version.
  readonly security_version: number;
}

export interface SecuritySession {
  readonly started: string;
  readonly last_access: string;
  readonly clients: readonly string[] | null;
}

export interface Authenticator {
  readonly security_ref?: string;
  readonly type: string;
  readonly label?: string;
  readonly created: string;
}

export interface FederationLink {
  readonly provider: string;
  readonly user_name: string;
}

// KernelEvent is one event from the kernel event record (TDD-identity-control-005 2.9.0): a sign-in the
// Principal was the subject of, or an admin change it made. No IP address, session or kernel identifier.
export interface KernelEvent {
  readonly occurred_at: string;
  readonly kind: 'user' | 'admin';
  readonly role: 'subject' | 'actor';
  readonly type: string;
  readonly outcome: 'success' | 'failure';
  readonly error?: string;
  readonly client_id?: string;
  readonly resource_type?: string;
}

export interface Finding {
  readonly finding_id: string;
  readonly class: string;
  readonly detected_at: string;
  readonly resolved_at: string | null;
  readonly resolution?: string;
}

export type OperationState = 'pending' | 'retrying' | 'applied' | 'refused' | 'unresolved';

export interface SecurityOperation {
  readonly operation_id: string;
  readonly principal_id: string;
  readonly operation_type: string;
  readonly state: OperationState;
  readonly attempts: number;
  readonly result_code?: string;
  readonly created_at: string;
  readonly applied_at?: string;
}

export const isFinal = (operation: SecurityOperation): boolean =>
  operation.state === 'applied' || operation.state === 'refused' || operation.state === 'unresolved';

// The search floor the API enforces: three characters that are not wildcards. Checked here only to
// say so before a request; the API is the authority.
export const searchFloor = 3;
export const searchPage = 25;

export const searchable = (query: string): boolean => query.replace(/[*%_\s]/g, '').length >= searchFloor;

export type ContainmentAction = 'suspend' | 'restore' | 'terminate-all';

// containmentActions is what the API accepts for the Principal as it stands, and nothing else
// (TDD-identity-control-005 §Containment as Built): a human with a kernel user, never the operator's
// own Principal, suspend only when active, restore only when suspended.
export function containmentActions(principal: PrincipalDetail, operator: string | null): ContainmentAction[] {
  if (principal.subject_type !== 'human' || principal.principal_id === operator) {
    return [];
  }
  switch (principal.state) {
    case 'active':
      return ['suspend', 'terminate-all'];
    case 'suspended':
      return ['restore', 'terminate-all'];
    default:
      return [];
  }
}

// Revocation is offered on the same terms as ending the sessions.
export const canRevoke = (principal: PrincipalDetail, operator: string | null): boolean =>
  containmentActions(principal, operator).includes('terminate-all');

// First factors begin a sign-in: the realm's password, and a passkey once a flow admits one. The API
// refuses to revoke the last of them (last_authenticator).
const firstFactors = new Set(['password', 'webauthn-passwordless']);

export const isFirstFactor = (authenticator: Authenticator): boolean => firstFactors.has(authenticator.type);

// firstFactorsAfter counts the first factors that remain once target is revoked.
export function firstFactorsAfter(authenticators: readonly Authenticator[], target: Authenticator): number {
  return authenticators.filter((a) => a !== target && isFirstFactor(a)).length;
}

// revocable is false for the last first factor, which the API would refuse.
export const revocable = (authenticators: readonly Authenticator[], target: Authenticator): boolean =>
  target.security_ref !== undefined &&
  (!isFirstFactor(target) || firstFactorsAfter(authenticators, target) > 0);
