// Principals as the Identity Control API exposes them today (TDD-identity-control-001): creation,
// the mappings whose Keycloak user is gone, and relinking one. Search and a Principal's security
// state (TDD-identity-control-005) are not built upstream, and nothing here stands in for them.

export type SubjectType = 'human' | 'workload';

export const subjectTypes: readonly SubjectType[] = ['human', 'workload'];

export interface CreatePrincipalRequest {
  readonly username: string;
  readonly email: string;
  readonly subject_type: SubjectType;
  // Required for a workload, refused for a human: a workload has an accountable owner.
  readonly workload_owner?: string;
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

// createRequest shapes what the form holds into what the API accepts: a human carries no owner,
// and a workload carries its owner's principal_id.
export function createRequest(values: {
  readonly username: string;
  readonly email: string;
  readonly subjectType: SubjectType;
  readonly workloadOwner: string;
}): CreatePrincipalRequest {
  const base = {
    username: values.username.trim(),
    email: values.email.trim(),
    subject_type: values.subjectType,
  };
  return values.subjectType === 'workload' ? { ...base, workload_owner: values.workloadOwner.trim() } : base;
}
