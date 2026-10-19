// What identity-control holds of Organization Control's records, as its provider reads serve them.

// An emergency grant of provider authority and its last use (GET /v1/provider-grants:emergency-validation,
// TDD-identity-control-006 §Emergency Grant Validation, ADR-ORG-002 §5.2). A grant never used counts
// from when identity-control first held it.
export interface EmergencyGrant {
  readonly grant_id: string;
  readonly principal_id: string;
  readonly held_since: string;
  readonly last_used_at: string | null;
  readonly uses: number;
  readonly due_at: string;
  readonly overdue: boolean;
}

export interface EmergencyValidation {
  readonly scope: string;
  readonly validation_period_days: number;
  readonly grants: readonly EmergencyGrant[] | null;
}

// The Tenant context projection's report (GET /v1/projections/tenant-context/report,
// TDD-identity-control-002 §The Report an Operator Posts): the active Memberships held, at the position
// applied, in the shape Organization Control's reconcile route takes. It is posted there unchanged.
export interface TenantContextReport {
  readonly consumer_id: string;
  readonly mark: number;
  readonly rows: readonly { readonly membership_id: string; readonly membership_version: number }[] | null;
}

export const overdueCount = (validation: EmergencyValidation): number =>
  (validation.grants ?? []).filter((grant) => grant.overdue).length;

// A Tenant whose convergence is not done (GET /v1/projections/tenant-context:unconverged,
// TDD-identity-control-002 2.5.0 §Operator Routes): pending or unresolved, oldest mark first, at most
// 500. priority is a suspension or a revocation not yet in the kernel.
export interface UnconvergedTenant {
  readonly tenant_id: string;
  readonly state: 'pending' | 'unresolved';
  readonly priority: boolean;
  readonly sweep: boolean;
  readonly attempts: number;
  readonly last_error_class?: string;
  readonly marked_at: string;
  readonly delivered_at: string | null;
  readonly next_attempt_at: string;
}

// What a sweep on request did (POST /v1/projections/tenant-context:sweep): the scheduled sweep, now.
export interface TenantContextSweep {
  readonly run_id: string;
  readonly outcome: 'converged' | 'drift' | 'unresolved';
  readonly mark: number;
  readonly snapshot_rows: number;
  readonly snapshot_read: boolean;
  readonly unknown_organizations: number;
  readonly tenants_marked: number;
}

// What a re-drive answers: the Tenant is marked to converge again.
export interface TenantRedrive {
  readonly tenant_id: string;
  readonly state: 'pending';
}
