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
