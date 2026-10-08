// Workloads as the Identity Control API exposes them (TDD-identity-control-004): a service, job or
// connector that authenticates as its own client with its own key, and the human accountable for it.
// The Admin Portal and the Developer Console read the same record, so its shape and the rule for who
// may review it are here, once.

export type WorkloadType = 'service' | 'job' | 'connector';

export type WorkloadState = 'pending' | 'active' | 'orphaned' | 'suspended' | 'retired';

export interface Workload {
  readonly principal_id: string;
  readonly registration_id: string;
  readonly client_key: string;
  readonly display_name: string;
  readonly purpose: string;
  readonly workload_type: WorkloadType;
  readonly owner_principal_id: string;
  readonly team_reference?: string;
  readonly owner_recorded_at: string;
  readonly state: WorkloadState;
  readonly orphaned_at: string | null;
  readonly last_seen_at: string | null;
  readonly created_by: string;
  readonly created_at: string;
  readonly activated_at: string | null;
  // The owner's latest review and when the next is due (TDD-identity-control-004 1.5.0 §Periodic
  // Review); the due date only for an active or orphaned workload.
  readonly last_reviewed_at?: string | null;
  readonly review_due_at?: string;
}

// mayReview is whether the API accepts this person's review of the workload as it stands: the review
// is the workload's owner's alone, of an active workload. Identifiers compare without case, as UUIDs.
export function mayReview(
  workload: Pick<Workload, 'state' | 'owner_principal_id'>,
  principalId: string | null,
): boolean {
  return (
    workload.state === 'active' &&
    principalId !== null &&
    workload.owner_principal_id.toLowerCase() === principalId.toLowerCase()
  );
}

// reviewOverdue is whether the workload's next review was due before now. A workload with no due date,
// one that is not active or orphaned, is never overdue.
export function reviewOverdue(workload: Pick<Workload, 'review_due_at'>, now: Date): boolean {
  return workload.review_due_at !== undefined && Date.parse(workload.review_due_at) < now.getTime();
}
