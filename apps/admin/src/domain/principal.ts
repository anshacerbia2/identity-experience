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

export interface PrincipalSweep {
  readonly recovered: number;
  readonly dangling: number;
}

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
