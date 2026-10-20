// Principals as the Identity Control API exposes them today (TDD-identity-control-001): creating a
// person, the mappings whose Keycloak user is gone, and relinking one. Search and a Principal's
// security state (TDD-identity-control-005) are not built upstream, and nothing here stands in for
// them.
//
// A workload is a Principal too, but it is not created here: identity-control refuses a workload on
// this path, because its Keycloak user is its client's service-account user (domain/workload.ts).

export type SubjectType = 'human' | 'workload';

export interface CreatePrincipalRequest {
  readonly username: string;
  readonly email: string;
  readonly subject_type: 'human';
}

export interface PrincipalCreated {
  readonly principal_id: string;
  readonly subject_type: SubjectType;
  readonly realm: string;
}

// A dangling mapping is an active Principal whose Keycloak user is gone: deleted in the console, or
// lost with a rebuilt realm. The principal_id and every Membership under it survive; only a relink
// gives it a Keycloak user again.
export interface DanglingMapping {
  readonly principal_id: string;
  readonly detected_at: string;
}

// Where a relink ended: active under a new user when recovery completed at once, pending when the
// scheduled recovery will finish it.
export interface RelinkResult {
  readonly principal_id: string;
  readonly state: 'active' | 'pending';
}

// PrincipalSweep is what POST /v1/principals:reconcile found (TDD-identity-control-001 1.13.0).
export interface PrincipalSweep {
  readonly recovered: number;
  readonly dangling: number;
  readonly unmapped?: number;
  readonly orphan?: number;
  readonly duplicate?: number;
}

// A kernel user no mapping accounts for (GET /v1/principals:unmapped, TDD-identity-control-001
// 1.13.0): unmapped carries no identifier, an orphan the one it claims, and a duplicate the Principal
// whose identifier it repeats.
export type UnmappedClass = 'unmapped' | 'orphan' | 'duplicate';

export interface UnmappedUser {
  readonly finding_id: string;
  readonly finding_class: UnmappedClass;
  readonly principal_id?: string;
  readonly claimed_principal_id?: string;
  readonly username?: string;
  readonly user_disabled: boolean;
  readonly detected_at: string;
}

// An orphan's identifier re-adopted after a restore to an older point (POST
// /v1/principals/{principal_id}:adopt; ADR-IAM-001 §5.11 as amended 2026-10-20, TDD-identity-control-001
// 1.23.0). A plan, `dry_run`, reads the four checks and changes nothing; the adoption needs all four to
// hold and lands the mapping suspended, for a separate :restore to return it to service.
export type AdoptCheckName =
  'orphan_finding' | 'one_kernel_user' | 'newer_than_backup' | 'creation_on_record';

export const adoptChecks: readonly AdoptCheckName[] = [
  'orphan_finding',
  'one_kernel_user',
  'newer_than_backup',
  'creation_on_record',
];

export interface AdoptCheck {
  readonly check: AdoptCheckName;
  readonly holds: boolean;
  // What the check read, in the API's words: it names a check and a time, never a kernel identifier.
  readonly detail: string;
}

export interface PrincipalAdoption {
  readonly principal_id: string;
  readonly adoptable: boolean;
  // The first check that does not hold, "<check>: <detail>"; absent when every check holds.
  readonly refusal?: string;
  readonly checks: readonly AdoptCheck[];
  readonly adopted: boolean;
  // Present once the identifier is adopted: always suspended.
  readonly state?: 'suspended';
}

// adoptable is whether an orphan finding's identifier may be offered for adoption by this provider:
// it claims one, and it is not the provider's own, which the API refuses with 403 as it refuses every
// action on the caller's own Principal.
export const adoptable = (finding: UnmappedUser, self: string | null): boolean =>
  finding.finding_class === 'orphan' &&
  finding.claimed_principal_id !== undefined &&
  finding.claimed_principal_id !== self;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isPrincipalId = (value: string): boolean => uuid.test(value.trim());

// createRequest shapes what the form holds into what the API accepts.
export function createRequest(values: {
  readonly username: string;
  readonly email: string;
}): CreatePrincipalRequest {
  return { username: values.username.trim(), email: values.email.trim(), subject_type: 'human' };
}

// One grant of application developer standing (ADR-IAM-003 §5.3, TDD-identity-control-003
// §Application Developers), active or revoked.
export interface ApplicationDeveloper {
  readonly grant_id: string;
  readonly principal_id: string;
  readonly granted_by: string;
  readonly grant_reason: string;
  readonly granted_at: string;
  readonly revoked_at: string | null;
  readonly revoked_by: string | null;
  readonly revoke_reason?: string;
  readonly active: boolean;
}

// A mapping recovery has not resolved (GET /v1/principals:pending, TDD-identity-control-001 1.18.0),
// oldest first, at most 500. overdue is past the age at which recovery takes a mapping up: recovery
// has had at least one chance to resolve it.
export interface PendingMapping {
  readonly principal_id: string;
  readonly subject_type: SubjectType;
  readonly username: string;
  readonly created_at: string;
  readonly overdue: boolean;
}

// A mapping the reconciler holds (GET /v1/principals:quarantined, TDD-identity-control-001 1.18.0),
// oldest first, at most 500. linked says whether it holds a kernel user; one recovery quarantined
// holds none.
export interface QuarantinedMapping {
  readonly principal_id: string;
  readonly subject_type: SubjectType;
  readonly username: string;
  readonly quarantined_at: string | null;
  readonly quarantine_reason: string;
  readonly linked: boolean;
}

// What a release answers (POST /v1/principals/{principal_id}:release): the mapping is bound to the
// one kernel user left and lands in suspended, never active.
export interface ReleaseResult {
  readonly principal_id: string;
  readonly state: 'suspended';
}
